from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "pocketpilot.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                hashed_password TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                date TEXT NOT NULL,
                amount REAL NOT NULL,
                merchant TEXT NOT NULL,
                category TEXT NOT NULL,
                bucket TEXT NOT NULL,
                original_message TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS goals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                name TEXT NOT NULL,
                target_amount REAL NOT NULL,
                monthly_saving_amount REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS monthly_budget (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                year INTEGER NOT NULL,
                month INTEGER NOT NULL,
                amount REAL NOT NULL,
                UNIQUE(user_id, year, month)
            );
            """
        )
        # Migrate existing tables: add user_id column if it doesn't exist yet
        for table in ("transactions", "goals"):
            try:
                connection.execute(f"ALTER TABLE {table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0")
                connection.commit()
            except sqlite3.OperationalError:
                pass  # column already exists


def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
    with get_connection() as connection:
        cursor = connection.execute(query, params)
        return cursor.fetchall()


def fetch_one(query: str, params: tuple[Any, ...] = ()) -> sqlite3.Row | None:
    with get_connection() as connection:
        cursor = connection.execute(query, params)
        return cursor.fetchone()


def execute(query: str, params: tuple[Any, ...] = ()) -> int:
    with get_connection() as connection:
        cursor = connection.execute(query, params)
        connection.commit()
        return int(cursor.lastrowid)
