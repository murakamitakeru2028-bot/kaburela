import io
import logging
import os
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

# Stooqのデータ取得フォールバック。素のCSVエンドポイントはAPIキー必須になったため、
# 環境変数 STOOQ_API_KEY が設定されているときだけ有効化する（無ければスキップ）。
# 無料キーは https://stooq.com/q/d/?s=7203.jp&get_apikey から取得できる。
_STOOQ_CSV_URL = "https://stooq.com/q/d/l/"
_STOOQ_API_KEY = os.environ.get("STOOQ_API_KEY", "").strip()
_STOOQ_DELAY = 0.2
_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _missing_tickers(close: pd.DataFrame, tickers: list[str]) -> list[str]:
    """終値が1件も取れていない銘柄を抽出する。"""
    return [
        ticker
        for ticker in tickers
        if ticker not in close.columns or close[ticker].dropna().empty
    ]


def _download_chart_one(ticker: str, start: str, end: str) -> pd.Series:
    """yfinanceで取得できなかった銘柄をYahooのチャートエンドポイントから1件取得する。"""
    period1 = int(datetime.strptime(start, "%Y-%m-%d").timestamp())
    period2 = int(datetime.strptime(end, "%Y-%m-%d").timestamp())
    url = (
        f"{_YAHOO_CHART_URL.format(ticker=quote(ticker))}"
        f"?period1={period1}&period2={period2}&interval=1d&events=history&includeAdjustedClose=true"
    )
    request = Request(url, headers=_HEADERS)

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


def _stooq_symbol(ticker: str) -> str:
    """Yahoo形式のティッカー（例: "7203.T"）をStooqのシンボル（例: "7203.jp"）に変換する。"""
    code = ticker.split(".")[0].strip().lower()
    return f"{code}.jp"


def _download_stooq_one(ticker: str, start: str, end: str) -> pd.Series:
    """Yahoo系で取れなかった銘柄をStooqのCSVエンドポイントから1件取得する。"""
    if not _STOOQ_API_KEY:
        return pd.Series(dtype=float, name=ticker)
    url = (
        f"{_STOOQ_CSV_URL}?s={_stooq_symbol(ticker)}&i=d"
        f"&d1={start.replace('-', '')}&d2={end.replace('-', '')}"
        f"&apikey={_STOOQ_API_KEY}"
    )
    request = Request(url, headers=_HEADERS)
    with urlopen(request, timeout=20) as response:
        text = response.read().decode("utf-8", "ignore")

    # 正常時は "Date,Open,High,Low,Close,Volume" で始まる。エラー時はHTMLや上限メッセージ。
    if not text.startswith("Date,"):
        return pd.Series(dtype=float, name=ticker)

    df = pd.read_csv(io.StringIO(text))
    if df.empty or "Date" not in df.columns or "Close" not in df.columns:
        return pd.Series(dtype=float, name=ticker)

    closes = pd.to_numeric(df["Close"], errors="coerce")
    index = pd.to_datetime(df["Date"], errors="coerce").dt.normalize()
    series = pd.Series(closes.values, index=index, name=ticker, dtype="float64")
    return series[series.index.notna()].dropna()


def _download_stooq_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    if not _STOOQ_API_KEY:
        return pd.DataFrame(columns=tickers)
    frames = []
    for ticker in tickers:
        try:
            series = _download_stooq_one(ticker, start, end)
            if not series.empty:
                frames.append(series)
        except Exception as exc:
            logger.warning("stooq fallback failed for %s: %s", ticker, exc)
        time.sleep(_STOOQ_DELAY)

    if not frames:
        return pd.DataFrame(columns=tickers)
    return pd.concat(frames, axis=1).reindex(columns=tickers)


def _download_one_batch(tickers: list[str], start: str, end: str) -> pd.DataFrame:
    """1バッチ分の終値をダウンロードする（リトライ＋Yahooチャート＋Stooqの多段フォールバック）。"""
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

            missing = _missing_tickers(close, tickers)
            if missing:
                logger.info("chart fallback for %s tickers", len(missing))
                close = close.combine_first(_download_chart_batch(missing, start, end))

            missing = _missing_tickers(close, tickers)
            if missing:
                logger.info("stooq fallback for %s tickers", len(missing))
                close = close.combine_first(_download_stooq_batch(missing, start, end))

            return close.reindex(columns=tickers)

        except Exception as exc:
            logger.warning("batch download failed (attempt %s): %s", attempt + 1, exc)

    logger.error("all batch retries failed: %s... (returning NaN frame)", tickers[:3])
    # yfinance自体が落ちても、Stooqだけでも拾えるか最後に試す。
    try:
        return _download_stooq_batch(tickers, start, end)
    except Exception:
        return pd.DataFrame(columns=tickers)


def fetch_close_prices(tickers: list[str], period: str) -> pd.DataFrame:
    """チャート・比較API向けに終値を取得する。"""
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
    on_batch_done: Callable[[pd.DataFrame], None] | None = None,
    skip_tickers: set[str] | None = None,
) -> pd.DataFrame:
    """多数の銘柄をスロットリングしながらバッチ取得する。

      - on_batch_done : 各バッチ取得直後にそのバッチのDataFrameで呼ばれる。
                        呼び出し側はここで逐次保存することで、途中で落ちても再開できる。
      - skip_tickers  : 既に最新データを持っていてダウンロード不要な銘柄（再開時に渡す）。
    """
    days = PERIOD_DAYS[period]
    end = datetime.now()
    start = end - timedelta(days=days)
    start_str = start.strftime("%Y-%m-%d")
    end_str = end.strftime("%Y-%m-%d")

    pending = [t for t in tickers if not skip_tickers or t not in skip_tickers]
    if skip_tickers:
        logger.info(
            "resume: %s/%s 銘柄は最新データありのためダウンロードをスキップ",
            len(tickers) - len(pending),
            len(tickers),
        )

    frames: list[pd.DataFrame] = []
    total = (len(pending) + _BATCH_SIZE - 1) // _BATCH_SIZE

    for i, offset in enumerate(range(0, len(pending), _BATCH_SIZE)):
        batch = pending[offset : offset + _BATCH_SIZE]
        logger.info("batch %s/%s (%s tickers) downloading...", i + 1, total, len(batch))

        frame = _download_one_batch(batch, start_str, end_str)
        frames.append(frame)

        if on_batch_done:
            on_batch_done(frame)
        if on_progress:
            on_progress(i + 1, total)

        if offset + _BATCH_SIZE < len(pending):
            time.sleep(_BATCH_DELAY)

    if not frames:
        return pd.DataFrame(columns=tickers)

    result = pd.concat(frames, axis=1)
    return result.reindex(columns=[t for t in tickers if t in result.columns])
