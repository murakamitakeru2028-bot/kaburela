import logging
import time
from datetime import datetime, timedelta
from typing import Callable
from urllib.parse import quote
from urllib.request import Request, urlopen

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
_YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"


def _download_chart_one(ticker: str, start: str, end: str) -> pd.Series:
    """Fetch one ticker through Yahoo's chart endpoint when yfinance returns no rows."""
    period1 = int(datetime.strptime(start, "%Y-%m-%d").timestamp())
    period2 = int(datetime.strptime(end, "%Y-%m-%d").timestamp())
    url = (
        f"{_YAHOO_CHART_URL.format(ticker=quote(ticker))}"
        f"?period1={period1}&period2={period2}&interval=1d&events=history&includeAdjustedClose=true"
    )
    request = Request(url, headers={"User-Agent": "Mozilla/5.0"})

    with urlopen(request, timeout=20) as response:
        import json

        payload = json.loads(response.read().decode("utf-8"))

    result = (payload.get("chart", {}).get("result") or [None])[0]
    if not result:
        return pd.Series(dtype=float, name=ticker)

    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators", {})
    adj_close = (indicators.get("adjclose") or [{}])[0].get("adjclose")
    close = (indicators.get("quote") or [{}])[0].get("close")
    values = adj_close or close or []
    if not timestamps or not values:
        return pd.Series(dtype=float, name=ticker)

    index = pd.to_datetime(timestamps, unit="s").normalize()
    return pd.Series(values, index=index, dtype="float64", name=ticker).dropna()


def _download_chart_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    frames = []
    for ticker in tickers:
        try:
            series = _download_chart_one(ticker, start, end)
            if not series.empty:
                frames.append(series)
        except Exception as exc:
            logger.warning("chart fallback failed for %s: %s", ticker, exc)

    if not frames:
        return pd.DataFrame(columns=tickers)
    return pd.concat(frames, axis=1).reindex(columns=tickers)


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
                close = pd.DataFrame(columns=tickers)
            elif isinstance(raw.columns, pd.MultiIndex):
                close = raw["Close"]
            else:
                close = raw[["Close"]].rename(columns={"Close": tickers[0]})

            close = close.reindex(columns=tickers)
            missing = [
                ticker
                for ticker in tickers
                if ticker not in close.columns or close[ticker].dropna().empty
            ]
            if missing:
                logger.info("chart fallback for %s tickers", len(missing))
                fallback = _download_chart_batch(missing, start, end)
                close = close.combine_first(fallback)

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
