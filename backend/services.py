from __future__ import annotations

import math
import re
from collections import defaultdict
from datetime import date, datetime
from typing import Any

CATEGORY_RULES: dict[str, tuple[str, str]] = {
    "zomato": ("Food", "Expenses"),
    "swiggy": ("Food", "Expenses"),
    "restaurant": ("Food", "Expenses"),
    "cafe": ("Food", "Expenses"),
    "uber": ("Travel", "Expenses"),
    "ola": ("Travel", "Expenses"),
    "metro": ("Travel", "Expenses"),
    "amazon": ("Shopping", "Expenses"),
    "flipkart": ("Shopping", "Expenses"),
    "myntra": ("Shopping", "Expenses"),
    "sip": ("Investment", "Investments"),
    "stock": ("Investment", "Investments"),
    "mutual fund": ("Investment", "Investments"),
    "salary": ("Savings", "Savings"),
    "deposit": ("Savings", "Savings"),
    "scholarship": ("Savings", "Savings"),
    "freelance": ("Savings", "Savings"),
    "subscription": ("Subscriptions", "Expenses"),
    "netflix": ("Subscriptions", "Expenses"),
    "spotify": ("Subscriptions", "Expenses"),
}

MERCHANT_STOPWORDS = {
    "debited",
    "credited",
    "paid",
    "payment",
    "purchase",
    "spent",
    "at",
    "to",
    "via",
    "for",
    "on",
    "mutual",
    "fund",
}

CATEGORY_OPTIONS = [
    "Food",
    "Transport",
    "Shopping",
    "Entertainment",
    "Bills",
    "Health",
    "Education",
    "Subscriptions",
    "Clothing",
    "Investment",
    "Savings",
    "Other",
]

CATEGORY_TO_BUCKET = {
    "Food": "Expenses",
    "Transport": "Expenses",
    "Shopping": "Expenses",
    "Entertainment": "Expenses",
    "Bills": "Expenses",
    "Health": "Expenses",
    "Education": "Expenses",
    "Subscriptions": "Expenses",
    "Clothing": "Expenses",
    "Other": "Expenses",
    "Investment": "Investments",
    "Savings": "Savings",
}


class ParseError(ValueError):
    pass


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def extract_amount(message: str) -> float:
    amount_match = re.search(r"(?:rs\.?|inr|₹)?\s*(\d+(?:[.,]\d{1,2})?)", message, re.IGNORECASE)
    if not amount_match:
        raise ParseError("Could not find a valid amount in the message.")
    return float(amount_match.group(1).replace(",", ""))


def extract_merchant(message: str) -> str:
    lower_message = normalize_text(message)
    anchored_match = re.search(r"(?:at|to|from|via|for)\s+([a-zA-Z][a-zA-Z\s&.-]+)$", lower_message)
    if anchored_match:
        candidate = anchored_match.group(1)
    else:
        amount_removed = re.sub(r"(?:rs\.?|inr|₹)?\s*\d+(?:[.,]\d{1,2})?", "", lower_message, count=1)
        cleaned = re.sub(r"[^a-zA-Z\s&.-]", " ", amount_removed)
        words = [word for word in cleaned.split() if word not in MERCHANT_STOPWORDS]
        if not words:
            raise ParseError("Could not detect the merchant or transaction label.")
        candidate = " ".join(words)

    merchant = re.sub(r"\s+", " ", candidate).strip(" .-")
    if not merchant:
        raise ParseError("Could not detect the merchant or transaction label.")
    return merchant.title()


def infer_category(merchant: str, message: str) -> tuple[str | None, str | None]:
    haystack = normalize_text(f"{merchant} {message}")
    for keyword, (category, bucket) in CATEGORY_RULES.items():
        if keyword in haystack:
            return category, bucket
    return None, None


def parse_message(message: str) -> dict[str, Any]:
    amount = extract_amount(message)
    merchant = extract_merchant(message)
    category, bucket = infer_category(merchant, message)
    return {
        "amount": amount,
        "merchant": merchant,
        "category": category,
        "bucket": bucket,
        "needs_category": category is None,
    }


def bucket_totals(transactions: list[dict[str, Any]]) -> dict[str, float]:
    totals = {"Expenses": 0.0, "Savings": 0.0, "Investments": 0.0}
    for transaction in transactions:
        totals[transaction["bucket"]] += float(transaction["amount"])
    return totals


def category_distribution(transactions: list[dict[str, Any]]) -> dict[str, float]:
    distribution: dict[str, float] = defaultdict(float)
    for transaction in transactions:
        distribution[transaction["category"]] += float(transaction["amount"])
    return dict(sorted(distribution.items(), key=lambda item: item[1], reverse=True))


def analytics_summary(transactions: list[dict[str, Any]]) -> dict[str, Any]:
    totals = bucket_totals(transactions)
    expenses = totals["Expenses"]
    savings = totals["Savings"]
    investments = totals["Investments"]
    remaining_balance = savings - expenses - investments

    transaction_dates = [datetime.fromisoformat(item["date"]).date() for item in transactions]
    if transaction_dates:
        active_days = max((max(transaction_dates) - min(transaction_dates)).days + 1, 1)
    else:
        active_days = 1

    average_daily_spending = round(expenses / active_days, 2) if expenses else 0.0
    days_left = math.floor(remaining_balance / average_daily_spending) if average_daily_spending > 0 and remaining_balance > 0 else None

    expense_distribution = category_distribution([item for item in transactions if item["bucket"] == "Expenses"])
    food_spend = expense_distribution.get("Food", 0.0)
    warnings: list[str] = []
    suggestions: list[str] = []

    if expenses > 0 and food_spend / expenses > 0.4:
        warnings.append("Food spending is above 40% of total expenses. This looks like an overspending zone.")
        suggestions.append("Reduce food delivery orders and set a weekly eating-out cap.")

    subscription_spend = expense_distribution.get("Subscriptions", 0.0)
    if expenses > 0 and subscription_spend / expenses > 0.15:
        warnings.append("Subscriptions are taking a noticeable share of your monthly expenses.")
        suggestions.append("Pause low-value subscriptions until your balance stabilizes.")

    if days_left is not None and days_left <= 10:
        warnings.append(f"At the current pace, your balance may run out in about {days_left} days.")
        suggestions.append("Shift more inflows into savings or cut discretionary purchases this week.")

    if savings < expenses * 0.3 and expenses > 0:
        suggestions.append("Increase savings contributions so at least 30% of your expense load is covered by reserves.")

    if investments == 0 and savings > 1000:
        suggestions.append("You have idle savings available. Consider routing a small amount into investments each month.")

    if not suggestions:
        suggestions.append("Your money split looks stable. Keep tracking regularly to preserve momentum.")

    return {
        "totals": {
            "expenses": round(expenses, 2),
            "savings": round(savings, 2),
            "investments": round(investments, 2),
            "remaining_balance": round(remaining_balance, 2),
        },
        "average_daily_spending": average_daily_spending,
        "active_days": active_days,
        "predicted_days_left": days_left,
        "warnings": warnings,
        "suggestions": suggestions,
        "category_distribution": category_distribution(transactions),
        "expense_distribution": expense_distribution,
    }


def compute_goal_progress(goal: dict[str, Any], total_deposited: float) -> dict[str, Any]:
    target = float(goal["target_amount"])
    amount_saved = min(max(total_deposited, 0.0), target)
    remaining_amount = max(target - amount_saved, 0.0)
    # Estimate ETA from deposited amount (no monthly_saving_amount anymore)
    estimated_months = 0.0
    return {
        "total_deposited": round(total_deposited, 2),
        "amount_saved": round(amount_saved, 2),
        "remaining_amount": round(remaining_amount, 2),
        "estimated_months": estimated_months,
    }


def today_iso() -> str:
    return date.today().isoformat()
