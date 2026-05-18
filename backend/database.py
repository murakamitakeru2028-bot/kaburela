import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "kaburela.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS stocks (
    code    TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    label   TEXT NOT NULL,
    sector  TEXT NOT NULL,
    color   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS correlations (
    sector     TEXT NOT NULL,
    code_a     TEXT NOT NULL,
    code_b     TEXT NOT NULL,
    period     TEXT NOT NULL,
    value      REAL NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (sector, code_a, code_b, period)
);

CREATE TABLE IF NOT EXISTS prices (
    code  TEXT NOT NULL,
    date  TEXT NOT NULL,
    close REAL NOT NULL,
    PRIMARY KEY (code, date)
);

CREATE TABLE IF NOT EXISTS batch_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    status      TEXT NOT NULL DEFAULT 'running',
    detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_correlations_sector_period
    ON correlations (sector, period);

CREATE INDEX IF NOT EXISTS idx_prices_code
    ON prices (code, date);

CREATE TABLE IF NOT EXISTS macro_correlations (
    indicator_code TEXT NOT NULL,
    stock_code     TEXT NOT NULL,
    period         TEXT NOT NULL,
    value          REAL NOT NULL,
    updated_at     TEXT NOT NULL,
    PRIMARY KEY (indicator_code, stock_code, period)
);

CREATE INDEX IF NOT EXISTS idx_macro_correlations_period
    ON macro_correlations (period);

-- 各銘柄について、相関の強い/弱い上位の相手銘柄を事前計算して保持する。
-- base_code を選ぶと、その銘柄と相関の高い/低い銘柄ランキングを高速に引ける。
CREATE TABLE IF NOT EXISTS stock_correlation_rankings (
    base_code  TEXT NOT NULL,
    peer_code  TEXT NOT NULL,
    period     TEXT NOT NULL,
    value      REAL NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (base_code, period, peer_code)
);

CREATE INDEX IF NOT EXISTS idx_stock_corr_rank_base_period
    ON stock_correlation_rankings (base_code, period);

-- Googleログインユーザー
CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT UNIQUE NOT NULL,
    email      TEXT NOT NULL,
    name       TEXT NOT NULL,
    picture    TEXT
);

-- マイリスト（ユーザーごとのウォッチリスト）
CREATE TABLE IF NOT EXISTS watchlists (
    user_id  INTEGER NOT NULL REFERENCES users(id),
    code     TEXT NOT NULL,
    added_at TEXT NOT NULL,
    PRIMARY KEY (user_id, code)
);
"""


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(_SCHEMA)


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
