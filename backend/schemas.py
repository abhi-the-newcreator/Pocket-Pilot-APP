from __future__ import annotations

from datetime import date as date_type
from typing import Literal

from pydantic import BaseModel, Field

BucketType = Literal["Expenses", "Savings", "Investments"]


# ── Auth ──────────────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    email: str = Field(min_length=5)
    name: str = Field(min_length=2)
    password: str = Field(min_length=6)


class UserLogin(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    user_name: str
    user_email: str


# ── Transactions ──────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    amount: float = Field(gt=0)
    merchant: str = Field(min_length=1, max_length=80)
    category: str
    date: date_type | None = None


class TransactionResponse(BaseModel):
    id: int
    date: str
    amount: float
    merchant: str
    category: str
    bucket: BucketType
    original_message: str


# ── Budget ────────────────────────────────────────────────────────────────────

class BudgetSet(BaseModel):
    amount: float = Field(gt=0)


# ── Goals ─────────────────────────────────────────────────────────────────────

class GoalCreate(BaseModel):
    name: str = Field(min_length=2)
    target_amount: float = Field(gt=0)
    monthly_saving_amount: float = Field(gt=0)


class GoalResponse(BaseModel):
    id: int
    created_at: str
    name: str
    target_amount: float
    monthly_saving_amount: float
    amount_saved: float
    remaining_amount: float
    estimated_months: float
