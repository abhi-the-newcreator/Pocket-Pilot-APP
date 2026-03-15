from __future__ import annotations

import calendar
from datetime import date
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.auth import create_access_token, get_current_user_id, hash_password, verify_password
from backend.database import execute, fetch_all, fetch_one, init_db
from backend.schemas import (
    BudgetSet,
    GoalCreate,
    GoalResponse,
    TokenResponse,
    TransactionCreate,
    TransactionResponse,
    UserLogin,
    UserRegister,
)
from backend.services import CATEGORY_OPTIONS, CATEGORY_TO_BUCKET, analytics_summary, compute_goal_progress, today_iso

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="PocketPilot API", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    init_db()


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


# ── Auth ───────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister) -> TokenResponse:
    existing = fetch_one("SELECT id FROM users WHERE email = ?", (payload.email.lower(),))
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    user_id = execute(
        "INSERT INTO users (email, name, hashed_password, created_at) VALUES (?, ?, ?, ?)",
        (payload.email.lower(), payload.name, hash_password(payload.password), today_iso()),
    )
    return TokenResponse(
        access_token=create_access_token(user_id),
        user_id=user_id,
        user_name=payload.name,
        user_email=payload.email.lower(),
    )


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: UserLogin) -> TokenResponse:
    user = fetch_one("SELECT * FROM users WHERE email = ?", (payload.email.lower(),))
    if not user or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return TokenResponse(
        access_token=create_access_token(user["id"]),
        user_id=user["id"],
        user_name=user["name"],
        user_email=user["email"],
    )


@app.get("/api/auth/me")
def me(user_id: int = Depends(get_current_user_id)) -> dict:
    user = fetch_one("SELECT id, email, name, created_at FROM users WHERE id = ?", (user_id,))
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return dict(user)


# ── Categories ─────────────────────────────────────────────────────────────────

@app.get("/api/categories")
def get_categories() -> dict[str, list[str]]:
    return {"categories": CATEGORY_OPTIONS}


# ── Transactions ───────────────────────────────────────────────────────────────

@app.post("/api/transactions", response_model=TransactionResponse)
def create_transaction(
    payload: TransactionCreate,
    user_id: int = Depends(get_current_user_id),
) -> TransactionResponse:
    bucket = CATEGORY_TO_BUCKET.get(payload.category)
    if not bucket:
        raise HTTPException(status_code=400, detail=f"Invalid category '{payload.category}'.")

    transaction_date = payload.date.isoformat() if payload.date else today_iso()
    merchant = payload.merchant.strip().title()

    transaction_id = execute(
        """
        INSERT INTO transactions (user_id, date, amount, merchant, category, bucket, original_message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, transaction_date, payload.amount, merchant, payload.category, bucket, ""),
    )
    return TransactionResponse(
        id=transaction_id,
        date=transaction_date,
        amount=payload.amount,
        merchant=merchant,
        category=payload.category,
        bucket=bucket,
        original_message="",
    )


@app.get("/api/transactions", response_model=list[TransactionResponse])
def list_transactions(user_id: int = Depends(get_current_user_id)) -> list[TransactionResponse]:
    rows = fetch_all(
        "SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC",
        (user_id,),
    )
    return [TransactionResponse(**dict(row)) for row in rows]


# ── Budget ─────────────────────────────────────────────────────────────────────

def _budget_status(user_id: int) -> dict:
    today = date.today()
    total_days = calendar.monthrange(today.year, today.month)[1]
    days_left = total_days - today.day
    days_elapsed = today.day

    row = fetch_one(
        "SELECT amount FROM monthly_budget WHERE user_id = ? AND year = ? AND month = ?",
        (user_id, today.year, today.month),
    )
    budget_amount = float(row["amount"]) if row else 0.0

    month_str = f"{today.year}-{today.month:02d}"
    spent_row = fetch_one(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE user_id = ? AND bucket = 'Expenses' AND strftime('%Y-%m', date) = ?",
        (user_id, month_str),
    )
    spent = float(spent_row["total"]) if spent_row else 0.0
    remaining = max(budget_amount - spent, 0.0)
    percent_used = round((spent / budget_amount * 100) if budget_amount > 0 else 0.0, 1)

    return {
        "budget_amount": round(budget_amount, 2),
        "spent_this_month": round(spent, 2),
        "remaining": round(remaining, 2),
        "days_left": days_left,
        "days_elapsed": days_elapsed,
        "total_days": total_days,
        "percent_used": percent_used,
        "month_name": today.strftime("%B %Y"),
    }


@app.get("/api/budget")
def get_budget(user_id: int = Depends(get_current_user_id)) -> dict:
    return _budget_status(user_id)


@app.post("/api/budget")
def set_budget(payload: BudgetSet, user_id: int = Depends(get_current_user_id)) -> dict:
    today = date.today()
    execute(
        """
        INSERT INTO monthly_budget (user_id, year, month, amount)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, year, month) DO UPDATE SET amount = excluded.amount
        """,
        (user_id, today.year, today.month, payload.amount),
    )
    return _budget_status(user_id)


# ── Dashboard ──────────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
def dashboard_data(user_id: int = Depends(get_current_user_id)) -> dict:
    rows = fetch_all(
        "SELECT * FROM transactions WHERE user_id = ? ORDER BY date ASC, id ASC",
        (user_id,),
    )
    transactions = [dict(row) for row in rows]
    summary = analytics_summary(transactions)
    summary["recent_transactions"] = transactions[-5:][::-1]
    summary["budget"] = _budget_status(user_id)
    return summary


# ── Analytics ──────────────────────────────────────────────────────────────────

@app.get("/api/analytics")
def analytics_data(user_id: int = Depends(get_current_user_id)) -> dict:
    rows = fetch_all(
        "SELECT * FROM transactions WHERE user_id = ? ORDER BY date ASC, id ASC",
        (user_id,),
    )
    transactions = [dict(row) for row in rows]
    return {"transactions": transactions, **analytics_summary(transactions)}


# ── Goals ──────────────────────────────────────────────────────────────────────

@app.post("/api/goals", response_model=GoalResponse)
def create_goal(payload: GoalCreate, user_id: int = Depends(get_current_user_id)) -> GoalResponse:
    goal_id = execute(
        "INSERT INTO goals (user_id, created_at, name, target_amount, monthly_saving_amount) VALUES (?, ?, ?, ?, ?)",
        (user_id, today_iso(), payload.name, payload.target_amount, payload.monthly_saving_amount),
    )
    rows = fetch_all("SELECT * FROM transactions WHERE user_id = ? ORDER BY date ASC, id ASC", (user_id,))
    summary = analytics_summary([dict(row) for row in rows])
    progress = compute_goal_progress(
        {"target_amount": payload.target_amount, "monthly_saving_amount": payload.monthly_saving_amount},
        summary["totals"]["remaining_balance"],
    )
    return GoalResponse(
        id=goal_id, created_at=today_iso(), name=payload.name,
        target_amount=payload.target_amount, monthly_saving_amount=payload.monthly_saving_amount,
        **progress,
    )


@app.get("/api/goals", response_model=list[GoalResponse])
def list_goals(user_id: int = Depends(get_current_user_id)) -> list[GoalResponse]:
    rows = fetch_all("SELECT * FROM goals WHERE user_id = ? ORDER BY id DESC", (user_id,))
    transactions = [dict(row) for row in fetch_all("SELECT * FROM transactions WHERE user_id = ? ORDER BY date ASC, id ASC", (user_id,))]
    available_savings = analytics_summary(transactions)["totals"]["remaining_balance"]
    goals: list[GoalResponse] = []
    for row in rows:
        goal = dict(row)
        goals.append(GoalResponse(**goal, **compute_goal_progress(goal, available_savings)))
    return goals


# ── Static pages ──────────────────────────────────────────────────────────────

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/login")
def login_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "login.html")


@app.get("/register")
def register_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "register.html")


@app.get("/")
def home_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/add-transaction")
def add_transaction_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "add-transaction.html")


@app.get("/goals")
def goals_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "goals.html")


@app.get("/analytics")
def analytics_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "analytics.html")
