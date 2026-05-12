"""価格データの取得と相関計算のバッチ処理。

run_batch() の流れ:
  1. 銘柄マスターを SQLite に同期する（seed_stocks）
  2. プライム全銘柄の5年分終値を yfinance（＋フォールバック）から取得し、
     バッチごとに逐次 SQLite に保存する（途中で落ちても resume で続きから）
  3. 保存済みの終値を読み戻し、業種内の相関を全期間ぶん計算して保存する
  4. マクロ指標の終値を取得し、銘柄×マクロ指標の相関を全期間ぶん計算して保存する
  5. 5年より古い終値を掃除する
"""

import logging
import re
from datetime import datetime, timedelta

import pandas as pd

from calculator import corr_matrix_from_prices
from config import (
    ALL_STOCKS,
    MACRO_INDICATORS,
    SECTOR_COLORS,
    SECTOR_DEFINITIONS,
    VALID_PERIODS,
)
from database import get_conn
from fetcher import PERIOD_DAYS, fetch_close_prices_bulk
from repository import (
    clear_stock_rankings,
    delete_old_prices,
    finish_batch_run,
    get_recent_price_codes,
    start_batch_run,
    upsert_correlations,
    upsert_macro_correlations,
    upsert_prices,
    upsert_stock_rankings,
    upsert_stocks,
)

logger = logging.getLogger(__name__)

# resume 時、終値がこの日数以内に存在する銘柄は「最新」とみなしダウンロードをスキップする。
_RESUME_FRESH_DAYS = 5
# pricesテーブルに保持する期間（5年＋余裕60日）。これより古い行は掃除する。
_PRICE_RETENTION_DAYS = PERIOD_DAYS["5Y"] + 60
# 銘柄相関ランキングで、各銘柄について保持する正相関・逆相関それぞれの上位件数。
_STOCK_RANKING_TOP_K = 50


def seed_stocks() -> None:
    """設定上の銘柄マスター（プライム全銘柄）を SQLite に同期する。"""
    records = [
        {
            "code": s["code"],
            "name": s["name"],
            "label": s["label"],
            "sector": s["sector"],
            "color": SECTOR_COLORS.get(s["sector"], "#64748b"),
        }
        for s in ALL_STOCKS
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
        logger.info("Removed orphan stocks: %s rows", len(orphans))

    logger.info("Seeded stock master: %s rows", len(records))


def _strip_ticker_suffix(columns) -> pd.Index:
    """終値DataFrameの列名 "7203.T" を銘柄コード "7203" に直す。"""
    return pd.Index([re.sub(r"\.T$", "", str(c)) for c in columns])


def _save_prices(prices: pd.DataFrame) -> None:
    """終値DataFrame（列＝銘柄コード）を SQLite に保存する。"""
    records = [
        {"code": code, "date": str(date)[:10], "close": float(close)}
        for code in prices.columns
        for date, close in prices[code].dropna().items()
    ]
    if records:
        upsert_prices(records)
        logger.info("Saved price rows: %s", len(records))


def _save_price_batch(frame: pd.DataFrame) -> None:
    """fetch_close_prices_bulk のバッチ完了コールバック。列名を整えて逐次保存する。"""
    if frame.empty:
        return
    frame = frame.copy()
    frame.columns = _strip_ticker_suffix(frame.columns)
    _save_prices(frame)


def _load_prices_frame(period: str, codes: list[str]) -> pd.DataFrame:
    """保存済みの終値を、行＝日付・列＝銘柄コードのDataFrameとして読み戻す。

    codes に含まれる銘柄だけを対象にする（上場廃止銘柄の残骸を除外するため）。
    """
    since = (datetime.now() - timedelta(days=PERIOD_DAYS[period] + 10)).strftime("%Y-%m-%d")
    with get_conn() as conn:
        df = pd.read_sql_query(
            "SELECT date, code, close FROM prices WHERE date >= ?",
            conn,
            params=(since,),
        )
    if df.empty:
        return pd.DataFrame()
    df = df[df["code"].isin(set(codes))]
    if df.empty:
        return pd.DataFrame()
    pivoted = df.pivot(index="date", columns="code", values="close").sort_index()
    pivoted.index = pd.to_datetime(pivoted.index)
    return pivoted


def _period_slices(prices_5y: pd.DataFrame):
    """5年分の終値から、各期間ぶんに切り出した終値DataFrameを順に返す。"""
    last_date = prices_5y.index[-1]
    for period in VALID_PERIODS:
        cutoff = last_date - timedelta(days=PERIOD_DAYS[period])
        yield period, prices_5y[prices_5y.index >= cutoff]


def _calc_all_periods(prices_5y: pd.DataFrame, sector_defs: list) -> list[dict]:
    """1本の5年終値フレームから、業種内の相関を全期間ぶん計算する。"""
    records: list[dict] = []
    for period, period_prices in _period_slices(prices_5y):
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


def _calc_macro_correlations(
    prices_5y: pd.DataFrame,
    macro_prices_5y: pd.DataFrame,
    macro_codes: list[str],
) -> list[dict]:
    """銘柄×マクロ指標の相関を全期間ぶん計算する（指標ごとにベクトル化）。"""
    records: list[dict] = []
    last_date = prices_5y.index[-1]

    for period in VALID_PERIODS:
        cutoff = last_date - timedelta(days=PERIOD_DAYS[period])
        period_stocks = prices_5y[prices_5y.index >= cutoff]
        period_macro = macro_prices_5y[macro_prices_5y.index >= cutoff]

        common_idx = period_stocks.index.intersection(period_macro.index)
        if len(common_idx) < 10:
            continue

        stock_ret = period_stocks.loc[common_idx].pct_change(fill_method=None).dropna(how="all")
        macro_ret = period_macro.loc[common_idx].pct_change(fill_method=None).dropna(how="all")
        stock_ret = stock_ret.reindex(index=macro_ret.index)

        stock_valid = stock_ret.notna()
        for m_code in macro_codes:
            if m_code not in macro_ret.columns:
                continue
            m_series = macro_ret[m_code]
            if m_series.notna().sum() < 5:
                continue

            corr = stock_ret.corrwith(m_series)
            # 各銘柄とマクロ指標の共通観測日数。5未満は信頼できないので0扱いにする。
            overlap = stock_valid.mul(m_series.notna(), axis=0).sum()

            for s_code, value in corr.items():
                if pd.isna(value) or overlap.get(s_code, 0) < 5:
                    value = 0.0
                records.append(
                    {
                        "indicator_code": m_code,
                        "stock_code": s_code,
                        "period": period,
                        "value": round(float(value), 4),
                    }
                )

    return records


def _min_periods_for(n_rows: int) -> int:
    """相関を信頼できる最小の共通観測日数（期間が長いほど多めに要求する）。"""
    return max(10, n_rows // 5)


def _calc_stock_rankings(prices_5y: pd.DataFrame, top_k: int = _STOCK_RANKING_TOP_K) -> list[dict]:
    """各銘柄について、相関の高い/低い上位 top_k 銘柄を全期間ぶん計算する。

    各期間で全銘柄×全銘柄の相関行列を作り、行ごとに上位（正）と下位（負）を抜き出す。
    """
    records: list[dict] = []
    for period, period_prices in _period_slices(prices_5y):
        returns = period_prices.pct_change(fill_method=None).dropna(how="all")
        if len(returns) < 10:
            continue
        corr = returns.corr(min_periods=_min_periods_for(len(returns)))

        for base in corr.columns:
            peers = corr[base].drop(labels=[base], errors="ignore").dropna()
            if peers.empty:
                continue
            seen: set[str] = set()
            for peer, value in pd.concat([peers.nlargest(top_k), peers.nsmallest(top_k)]).items():
                if peer in seen:
                    continue
                seen.add(peer)
                records.append(
                    {
                        "base_code": base,
                        "peer_code": peer,
                        "period": period,
                        "value": round(float(value), 4),
                    }
                )
    return records


def _resume_skip_tickers(tickers: list[str]) -> set[str]:
    """終値が直近 _RESUME_FRESH_DAYS 日以内に存在する銘柄のティッカー集合。"""
    fresh_since = (datetime.now() - timedelta(days=_RESUME_FRESH_DAYS)).strftime("%Y-%m-%d")
    fresh_codes = get_recent_price_codes(fresh_since)
    if not fresh_codes:
        return set()
    return {t for t in tickers if re.sub(r"\.T$", "", t) in fresh_codes}


def run_batch(resume: bool = True) -> None:
    """データを取得し、相関を計算して保存する。

    resume=True なら、直近に取得済みの銘柄はダウンロードをスキップして続きから再開する。
    """
    run_id = start_batch_run()
    logger.info("=== batch started (run_id=%s, resume=%s) ===", run_id, resume)

    try:
        seed_stocks()

        tickers = [s["ticker"] for s in ALL_STOCKS]
        skip = _resume_skip_tickers(tickers) if resume else set()

        logger.info("Fetching price data: %s / %s tickers x 5Y", len(tickers) - len(skip), len(tickers))
        fetch_close_prices_bulk(
            tickers,
            "5Y",
            skip_tickers=skip,
            on_batch_done=_save_price_batch,
        )

        # 5年より古い行を掃除（pricesテーブルの肥大化防止）
        cutoff = (datetime.now() - timedelta(days=_PRICE_RETENTION_DAYS)).strftime("%Y-%m-%d")
        removed = delete_old_prices(cutoff)
        if removed:
            logger.info("Pruned old price rows older than %s: %s rows", cutoff, removed)

        # 相関計算用に、保存済みの5年分終値をDBから読み戻す
        prices_5y = _load_prices_frame("5Y", [s["code"] for s in ALL_STOCKS])
        if prices_5y.empty:
            raise RuntimeError("価格データが空です。データ取得に失敗した可能性があります")
        logger.info("Loaded price frame: %s days x %s codes", len(prices_5y), prices_5y.shape[1])

        logger.info("Calculating correlations...")
        corr_records = _calc_all_periods(prices_5y, SECTOR_DEFINITIONS)
        upsert_correlations(corr_records)
        logger.info("Saved correlation rows: %s", len(corr_records))

        logger.info("Calculating stock correlation rankings...")
        ranking_records = _calc_stock_rankings(prices_5y)
        clear_stock_rankings()
        upsert_stock_rankings(ranking_records)
        logger.info("Saved stock ranking rows: %s", len(ranking_records))

        macro_tickers = [m["ticker"] for m in MACRO_INDICATORS]
        macro_codes = [m["code"] for m in MACRO_INDICATORS]
        logger.info("Fetching macro indicators: %s tickers", len(macro_tickers))
        macro_prices_5y = fetch_close_prices_bulk(macro_tickers, "5Y")
        ticker_to_code = {m["ticker"]: m["code"] for m in MACRO_INDICATORS}
        macro_prices_5y.columns = pd.Index(
            [ticker_to_code.get(c, c) for c in macro_prices_5y.columns]
        )

        logger.info("Calculating macro correlations...")
        macro_records = _calc_macro_correlations(prices_5y, macro_prices_5y, macro_codes)
        upsert_macro_correlations(macro_records)
        logger.info("Saved macro correlation rows: %s", len(macro_records))

        finish_batch_run(run_id, "success")
        logger.info("=== batch finished (run_id=%s) ===", run_id)

    except Exception as exc:
        logger.exception("Batch failed")
        finish_batch_run(run_id, "error", str(exc))
        raise
