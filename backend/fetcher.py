import logging
import time
from datetime import datetime, timedelta
from typing import Callable

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

PERIOD_DAYS: dict[str, int] = {
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    "3Y": 1095,
    "5Y": 1825,
}

_BATCH_SIZE = 50
_BATCH_DELAY = 1.5
_RETRY_DELAYS = [5, 15, 30]


def _download_one_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    """Download close prices for one ticker batch, with retry."""
    for attempt, wait in enumerate([0] + _RETRY_DELAYS):
        if wait:
            logger.warning("retry wait %ss (attempt %s)", wait, attempt + 1)
            time.sleep(wait)
        try:
            raw = yf.download(
                tickers,
                start=start,
                end=end,
                progress=False,
                auto_adjust=True,
                threads=True,
            )
            if raw.empty:
                return pd.DataFrame(columns=tickers)

            if isinstance(raw.columns, pd.MultiIndex):
                close = raw["Close"]
            else:
                close = raw[["Close"]].rename(columns={"Close": tickers[0]})

            return close.reindex(columns=tickers)

        except Exception as exc:
            logger.warning("batch download failed (attempt %s): %s", attempt + 1, exc)

    logger.error("all batch retries failed: %s... (returning NaN frame)", tickers[:3])
    return pd.DataFrame(columns=tickers)


def fetch_close_prices(tickers: list[str], period: str) -> pd.DataFrame:
    """Download close prices for chart and comparison APIs."""
    days = PERIOD_DAYS[period]
    end = datetime.now()
    start = end - timedelta(days=days)
    return _download_one_batch(
        tickers,
        start.strftime("%Y-%m-%d"),
        end.strftime("%Y-%m-%d"),
    )


def fetch_close_prices_bulk(
    tickers: list[str],
    period: str,
    on_progress: Callable[[int, int], None] | None = None,
) -> pd.DataFrame:
    """Download many tickers in throttled batches."""
    days = PERIOD_DAYS[period]
    end = datetime.now()
    start = end - timedelta(days=days)
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    frames: list[pd.DataFrame] = []
    total = (len(tickers) + _BATCH_SIZE - 1) // _BATCH_SIZE

    for i, offset in enumerate(range(0, len(tickers), _BATCH_SIZE)):
        batch = tickers[offset : offset + _BATCH_SIZE]
        logger.info("batch %s/%s (%s tickers) downloading...", i + 1, total, len(batch))

        frame = _download_one_batch(batch, start_str, end_str)
        frames.append(frame)

        if on_progress:
            on_progress(i + 1, total)

        if offset + _BATCH_SIZE < len(tickers):
            time.sleep(_BATCH_DELAY)

    if not frames:
        return pd.DataFrame(columns=tickers)

    result = pd.concat(frames, axis=1)
    return result.reindex(columns=tickers)
