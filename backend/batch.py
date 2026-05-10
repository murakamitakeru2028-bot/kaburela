"""Batch jobs for downloading prices and calculating correlations."""

import logging
from datetime import timedelta

import numpy as np
import pandas as pd

from calculator import corr_matrix_from_prices
from config import ALL_STOCKS, MACRO_INDICATORS, SECTOR_DEFINITIONS, VALID_PERIODS
from database import get_conn
from fetcher import PERIOD_DAYS, fetch_close_prices_bulk
from repository import (
    finish_batch_run,
    start_batch_run,
    upsert_correlations,
    upsert_macro_correlations,
    upsert_prices,
    upsert_stocks,
)

logger = logging.getLogger(__name__)


def seed_stocks() -> None:
    """Synchronize the configured stock master into SQLite."""
    records = [
        {
            "code": s["code"],
            "name": s["name"],
            "label": s["label"],
            "sector": sector["name"],
            "color": sector["color"],
        }
        for sector in SECTOR_DEFINITIONS
        for s in sector["stocks"]
    ]
    upsert_stocks(records)

    from repository import get_all_stocks

    current_codes = {r["code"] for r in records}
    db_codes = {r["code"] for r in get_all_stocks()}
    orphans = db_codes - current_codes
    if orphans:
        with get_conn() as conn:
            conn.executemany(
                "DELETE FROM stocks WHERE code = ?", [(c,) for c in orphans]
            )
        logger.info("Removed orphan stocks: %s", sorted(orphans))

    logger.info("Seeded stock master: %s rows", len(records))


def _save_prices(prices: pd.DataFrame) -> None:
    """Save close prices into SQLite."""
    records = [
        {"code": code, "date": str(date)[:10], "close": float(close)}
        for code in prices.columns
        for date, close in prices[code].dropna().items()
    ]
    if records:
        upsert_prices(records)
        logger.info("Saved price rows: %s", len(records))


def _calc_macro_correlations(
    prices_5y: pd.DataFrame,
    macro_prices_5y: pd.DataFrame,
    stock_codes: list[str],
    macro_codes: list[str],
) -> list[dict]:
    """Calculate macro-indicator correlations for all configured periods."""
    records: list[dict] = []
    last_date = prices_5y.index[-1]

    for period in VALID_PERIODS:
        days = PERIOD_DAYS[period]
        cutoff = last_date - timedelta(days=days)

        period_stocks = prices_5y[prices_5y.index >= cutoff]
        period_macro = macro_prices_5y[macro_prices_5y.index >= cutoff]

        common_idx = period_stocks.index.intersection(period_macro.index)
        if len(common_idx) < 10:
            continue

        stock_ret = period_stocks.loc[common_idx].pct_change().dropna(how="all")
        macro_ret = period_macro.loc[common_idx].pct_change().dropna(how="all")

        for m_code in macro_codes:
            if m_code not in macro_ret.columns:
                continue
            m_series = macro_ret[m_code].dropna()
            for s_code in stock_codes:
                if s_code not in stock_ret.columns:
                    continue
                s_series = stock_ret[s_code].dropna()
                aligned = pd.concat([m_series, s_series], axis=1).dropna()
                if len(aligned) < 5:
                    corr_val = 0.0
                else:
                    corr_val = float(aligned.iloc[:, 0].corr(aligned.iloc[:, 1]))
                    if np.isnan(corr_val):
                        corr_val = 0.0

                records.append({
                    "indicator_code": m_code,
                    "stock_code": s_code,
                    "period": period,
                    "value": round(corr_val, 4),
                })

    return records


def _calc_all_periods(prices_5y: pd.DataFrame, sector_defs: list) -> list[dict]:
    """Calculate stock correlations for all configured periods from one 5Y price frame."""
    records: list[dict] = []
    last_date = prices_5y.index[-1]

    for period in VALID_PERIODS:
        days = PERIOD_DAYS[period]
        cutoff = last_date - timedelta(days=days)
        period_prices = prices_5y[prices_5y.index >= cutoff]

        for sector in sector_defs:
            codes = [s["code"] for s in sector["stocks"]]
            sector_prices = period_prices.reindex(columns=codes)
            matrix = corr_matrix_from_prices(sector_prices, codes)

            for i, code_a in enumerate(codes):
                for j, code_b in enumerate(codes):
                    records.append(
                        {
                            "sector": sector["name"],
                            "code_a": code_a,
                            "code_b": code_b,
                            "period": period,
                            "value": matrix[i][j],
                        }
                    )

    return records


def run_batch() -> None:
    """Download data, calculate correlations, and persist the results."""
    run_id = start_batch_run()
    logger.info("=== batch started (run_id=%s) ===", run_id)

    try:
        seed_stocks()

        tickers = [s["ticker"] for s in ALL_STOCKS]

        logger.info("Fetching price data: %s tickers x 5Y", len(tickers))
        prices_5y = fetch_close_prices_bulk(tickers, "5Y")

        prices_5y.columns = pd.Index([c.replace(".T", "") for c in prices_5y.columns])
        _save_prices(prices_5y)

        logger.info("Calculating correlations...")
        corr_records = _calc_all_periods(prices_5y, SECTOR_DEFINITIONS)
        upsert_correlations(corr_records)
        logger.info("Saved correlation rows: %s", len(corr_records))

        macro_tickers = [m["ticker"] for m in MACRO_INDICATORS]
        macro_codes = [m["code"] for m in MACRO_INDICATORS]
        logger.info("Fetching macro indicators: %s", macro_tickers)
        macro_prices_5y = fetch_close_prices_bulk(macro_tickers, "5Y")

        ticker_to_code = {m["ticker"]: m["code"] for m in MACRO_INDICATORS}
        macro_prices_5y.columns = pd.Index([
            ticker_to_code.get(c, c) for c in macro_prices_5y.columns
        ])

        stock_codes = [s["code"] for s in ALL_STOCKS]
        logger.info("Calculating macro correlations...")
        macro_records = _calc_macro_correlations(
            prices_5y, macro_prices_5y, stock_codes, macro_codes
        )
        upsert_macro_correlations(macro_records)
        logger.info("Saved macro correlation rows: %s", len(macro_records))

        finish_batch_run(run_id, "success")
        logger.info("=== batch finished (run_id=%s) ===", run_id)

    except Exception as exc:
        logger.exception("Batch failed")
        finish_batch_run(run_id, "error", str(exc))
        raise
