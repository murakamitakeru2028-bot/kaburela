from datetime import datetime

from database import get_conn


def upsert_stocks(stocks: list[dict]) -> None:
    with get_conn() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO stocks (code, name, label, sector, color) VALUES (?,?,?,?,?)",
            [(s["code"], s["name"], s["label"], s["sector"], s["color"]) for s in stocks],
        )


def get_all_stocks() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM stocks ORDER BY sector, code"
        ).fetchall()
        return [dict(r) for r in rows]


def get_stocks_by_sector(sector: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM stocks WHERE sector = ? ORDER BY code", (sector,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_sectors_list() -> list[dict]:
    """Return distinct sector names and colors."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT sector, color FROM stocks ORDER BY sector"
        ).fetchall()
        return [dict(r) for r in rows]


def search_stocks(q: str, limit: int = 20) -> list[dict]:
    pattern = f"%{q}%"
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT * FROM stocks
               WHERE name LIKE ? OR code LIKE ? OR label LIKE ?
               LIMIT ?""",
            (pattern, pattern, pattern, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def upsert_correlations(records: list[dict]) -> None:
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.executemany(
            """INSERT OR REPLACE INTO correlations
               (sector, code_a, code_b, period, value, updated_at)
               VALUES (?,?,?,?,?,?)""",
            [
                (r["sector"], r["code_a"], r["code_b"], r["period"], r["value"], now)
                for r in records
            ],
        )


def get_correlations(sector: str, period: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM correlations WHERE sector = ? AND period = ?",
            (sector, period),
        ).fetchall()
        return [dict(r) for r in rows]


def has_correlation_data(sector: str, period: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM correlations WHERE sector = ? AND period = ? LIMIT 1",
            (sector, period),
        ).fetchone()
        return row is not None


def get_top_pairs(period: str, limit: int = 50, sign: str = "all") -> list[dict]:
    if sign == "pos":
        condition = "value > 0"
    elif sign == "neg":
        condition = "value < 0"
    else:
        condition = "1=1"

    with get_conn() as conn:
        rows = conn.execute(
            f"""SELECT * FROM correlations
                WHERE period = ? AND code_a < code_b AND {condition}
                ORDER BY ABS(value) DESC
                LIMIT ?""",
            (period, limit),
        ).fetchall()
        return [dict(r) for r in rows]


def upsert_prices(records: list[dict]) -> None:
    with get_conn() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO prices (code, date, close) VALUES (?,?,?)",
            [(r["code"], r["date"], r["close"]) for r in records],
        )


def get_recent_price_codes(since: str) -> set[str]:
    """since 以降の終値データを持つ銘柄コードの集合（バッチ再開時のスキップ判定用）。"""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT code FROM prices WHERE date >= ?", (since,)
        ).fetchall()
    return {r["code"] for r in rows}


def delete_old_prices(before: str) -> int:
    """before より古い終値データを削除する（pricesテーブルの無制限な肥大化を防ぐ）。"""
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM prices WHERE date < ?", (before,))
        return cur.rowcount


def get_prices_multi(codes: list[str], since: str) -> list[dict]:
    """Return cached prices for multiple stock codes."""
    if not codes:
        return []
    placeholders = ",".join("?" * len(codes))
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT code, date, close FROM prices "
            f"WHERE code IN ({placeholders}) AND date >= ? ORDER BY date",
            (*codes, since),
        ).fetchall()
    return [dict(r) for r in rows]


def get_prices(code: str, since: str) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT date, close FROM prices WHERE code = ? AND date >= ? ORDER BY date",
            (code, since),
        ).fetchall()
        return [dict(r) for r in rows]


def upsert_macro_correlations(records: list[dict]) -> None:
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.executemany(
            """INSERT OR REPLACE INTO macro_correlations
               (indicator_code, stock_code, period, value, updated_at)
               VALUES (?,?,?,?,?)""",
            [
                (r["indicator_code"], r["stock_code"], r["period"], r["value"], now)
                for r in records
            ],
        )


def get_macro_correlations(period: str) -> list[dict]:
    """Return all macro correlation rows for a period."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM macro_correlations WHERE period = ?",
            (period,),
        ).fetchall()
        return [dict(r) for r in rows]


def has_macro_correlation_data(period: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM macro_correlations WHERE period = ? LIMIT 1",
            (period,),
        ).fetchone()
        return row is not None


def clear_stock_rankings() -> None:
    """銘柄相関ランキングを全削除する（バッチで毎回作り直すため）。"""
    with get_conn() as conn:
        conn.execute("DELETE FROM stock_correlation_rankings")


def upsert_stock_rankings(records: list[dict]) -> None:
    now = datetime.now().isoformat()
    with get_conn() as conn:
        conn.executemany(
            """INSERT OR REPLACE INTO stock_correlation_rankings
               (base_code, peer_code, period, value, updated_at)
               VALUES (?,?,?,?,?)""",
            [
                (r["base_code"], r["peer_code"], r["period"], r["value"], now)
                for r in records
            ],
        )


def get_stock_rankings(base_code: str, period: str) -> list[dict]:
    """指定銘柄・期間の相関ランキング（peer_code, value）を相関の高い順で返す。"""
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT peer_code, value FROM stock_correlation_rankings
               WHERE base_code = ? AND period = ?
               ORDER BY value DESC""",
            (base_code, period),
        ).fetchall()
        return [dict(r) for r in rows]


def has_stock_ranking_data(base_code: str, period: str) -> bool:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT 1 FROM stock_correlation_rankings WHERE base_code = ? AND period = ? LIMIT 1",
            (base_code, period),
        ).fetchone()
        return row is not None


def start_batch_run() -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO batch_runs (started_at, status) VALUES (?, 'running')",
            (datetime.now().isoformat(),),
        )
        return cur.lastrowid


def finish_batch_run(run_id: int, status: str, detail: str | None = None) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE batch_runs SET finished_at = ?, status = ?, detail = ? WHERE id = ?",
            (datetime.now().isoformat(), status, detail, run_id),
        )


def get_last_batch_run() -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM batch_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else None
