"""
Kaburela API v2
  - SQLite から相関データを読み込む
  - APScheduler で相関計算バッチを更新する
  - UI向けAPIはSQLiteのキャッシュ済み価格データだけを読む
"""

import logging
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import create_jwt, decode_jwt, get_or_create_user, verify_google_token
from batch import run_batch, seed_stocks
from cache import TTLCache
from config import ALL_STOCKS, MACRO_INDICATORS, SECTOR_DEFINITIONS, VALID_PERIODS
from database import init_db
from fetcher import PERIOD_DAYS
from models import (
    ChartData,
    CorrelationResponse,
    PairData,
    SectorData,
    StockCorrelationPeer,
    StockCorrelationResponse,
    StockInfo,
)
from repository import (
    get_all_stocks,
    get_correlations,
    get_last_batch_run,
    get_macro_correlations,
    get_prices,
    get_prices_multi,
    get_stock_rankings,
    get_stocks_by_sector,
    get_top_pairs,
    has_correlation_data,
    search_stocks,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

_cache = TTLCache(ttl_seconds=3600)
_scheduler = BackgroundScheduler(timezone="Asia/Tokyo")
_batch_lock = threading.Lock()
_MANUAL_BATCH_COOLDOWN = timedelta(hours=24)


def _run_batch_bg() -> None:
    """Run the batch in a background thread."""
    if not _batch_lock.acquire(blocking=False):
        logger.info("batch is already running; skip duplicate request")
        return
    logger.info("バックグラウンドバッチ開始")
    try:
        run_batch()
    except Exception:
        logger.exception("バックグラウンドバッチ失敗")
    finally:
        _batch_lock.release()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_stocks()

    _scheduler.add_job(run_batch, "cron", day_of_week="sun", hour=2, minute=0)
    _scheduler.start()
    logger.info("スケジューラー開始: 毎週日曜 02:00 JST")

    if not has_correlation_data(SECTOR_DEFINITIONS[0]["name"], "6M"):
        logger.info("初回起動: バッチをバックグラウンドで開始します")
        threading.Thread(target=_run_batch_bg, daemon=True, name="init-batch").start()

    yield

    _scheduler.shutdown(wait=False)


app = FastAPI(title="Kaburela API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "https://kaburela.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


def _validate_period(period: str) -> None:
    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"period は {sorted(VALID_PERIODS)} のいずれかを指定してください",
        )


def _build_matrix_from_corr_rows(
    corr_rows: list[dict],
    codes: list[str],
) -> list[list[float]]:
    n = len(codes)
    idx = {code: i for i, code in enumerate(codes)}
    matrix = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for row in corr_rows:
        i = idx.get(row["code_a"])
        j = idx.get(row["code_b"])
        if i is not None and j is not None:
            matrix[i][j] = row["value"]
            matrix[j][i] = row["value"]
    return matrix


def _cached_since(period: str) -> str:
    return (datetime.now() - timedelta(days=PERIOD_DAYS[period] + 15)).strftime("%Y-%m-%d")


def _prices_frame_from_rows(rows: list[dict]):
    import pandas as pd

    if not rows:
        return pd.DataFrame()
    return (
        pd.DataFrame(rows)
        .pivot(index="date", columns="code", values="close")
        .sort_index()
    )


def _corr_matrix_from_cached_prices(prices, codes: list[str]) -> list[list[float]]:
    prices = prices.reindex(columns=codes)
    returns = prices.pct_change(fill_method=None).dropna(how="all")
    corr = returns.corr()

    matrix: list[list[float]] = []
    for code_a in codes:
        row: list[float] = []
        for code_b in codes:
            if code_a == code_b:
                row.append(1.0)
                continue
            try:
                val = float(corr.loc[code_a, code_b])
            except (KeyError, ValueError):
                val = 0.0
            if val != val:
                val = 0.0
            row.append(round(val, 4))
        matrix.append(row)
    return matrix


@app.get("/health")
def health():
    last = get_last_batch_run()
    return {
        "status": "ok",
        "last_batch": last,
    }


@app.post("/api/admin/batch")
def trigger_batch():
    last = get_last_batch_run()
    # 直前のバッチが失敗していた場合は、再開（resume）のためにクールダウンを免除する。
    if last and last.get("status") != "error" and last.get("started_at"):
        try:
            started_at = datetime.fromisoformat(last["started_at"])
            if datetime.now() - started_at < _MANUAL_BATCH_COOLDOWN:
                raise HTTPException(
                    status_code=429,
                    detail="yfinance制限回避のため、手動バッチは24時間に1回までです",
                )
        except ValueError:
            pass
    threading.Thread(target=_run_batch_bg, daemon=True, name="manual-batch").start()
    return {"message": "バッチをバックグラウンドで開始しました"}


@app.get("/api/master")
def get_master():
    all_stocks = get_all_stocks()
    sector_map: dict[str, dict] = {}

    for s in all_stocks:
        sname = s["sector"]
        if sname not in sector_map:
            sector_map[sname] = {
                "name": sname,
                "color": s["color"],
                "stocks": [],
            }
        sector_map[sname]["stocks"].append(
            StockInfo(code=s["code"], name=s["name"], label=s["label"])
        )

    return list(sector_map.values())


@app.get("/api/sectors", response_model=list[SectorData])
def get_sectors(period: str = Query(default="6M")):
    _validate_period(period)

    cache_key = f"sectors:{period}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    result: list[SectorData] = []
    for sector_def in SECTOR_DEFINITIONS:
        stocks_def = sector_def["stocks"]
        codes = [s["code"] for s in stocks_def]
        stocks = [StockInfo(code=s["code"], name=s["name"], label=s["label"]) for s in stocks_def]

        corr_rows = get_correlations(sector_def["name"], period)
        if corr_rows:
            matrix = _build_matrix_from_corr_rows(corr_rows, codes)
        else:
            rows = get_prices_multi(codes, _cached_since(period))
            matrix = _corr_matrix_from_cached_prices(_prices_frame_from_rows(rows), codes)

        result.append(
            SectorData(
                name=sector_def["name"],
                color=sector_def["color"],
                stocks=stocks,
                matrix=matrix,
            )
        )

    _cache.set(cache_key, result)
    return result


@app.get("/api/network/{sector}", response_model=CorrelationResponse)
def get_network(sector: str, period: str = Query(default="6M")):
    _validate_period(period)

    stocks_db = get_stocks_by_sector(sector)
    if not stocks_db:
        raise HTTPException(status_code=404, detail=f"セクター '{sector}' が見つかりません")

    codes = [s["code"] for s in stocks_db]
    stocks = [StockInfo(code=s["code"], name=s["name"], label=s["label"]) for s in stocks_db]

    corr_rows = get_correlations(sector, period)
    matrix = _build_matrix_from_corr_rows(corr_rows, codes)

    return CorrelationResponse(stocks=stocks, matrix=matrix)


@app.get("/api/correlation", response_model=CorrelationResponse)
def get_correlation(period: str = Query(default="6M")):
    _validate_period(period)

    cache_key = f"correlation:{period}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    all_stocks_db = get_all_stocks()
    codes = [s["code"] for s in all_stocks_db]
    stocks = [StockInfo(code=s["code"], name=s["name"], label=s["label"]) for s in all_stocks_db]

    rows = get_prices_multi(codes, _cached_since(period))
    matrix = _corr_matrix_from_cached_prices(_prices_frame_from_rows(rows), codes)

    result = CorrelationResponse(stocks=stocks, matrix=matrix)
    _cache.set(cache_key, result)
    return result


@app.get("/api/ranking", response_model=list[PairData])
def get_ranking(
    period: str = Query(default="6M"),
    sign: str = Query(default="all"),
    limit: int = Query(default=50, ge=1, le=200),
):
    _validate_period(period)
    if sign not in ("all", "pos", "neg"):
        raise HTTPException(status_code=400, detail="sign は all / pos / neg のいずれかを指定してください")

    pairs = get_top_pairs(period, limit=limit, sign=sign)
    stock_map = {s["code"]: s for s in get_all_stocks()}

    result: list[PairData] = []
    for p in pairs:
        sa = stock_map.get(p["code_a"])
        sb = stock_map.get(p["code_b"])
        if sa and sb:
            result.append(
                PairData(
                    stockA=StockInfo(code=sa["code"], name=sa["name"], label=sa["label"]),
                    stockB=StockInfo(code=sb["code"], name=sb["name"], label=sb["label"]),
                    corr=p["value"],
                )
            )
    return result


@app.get("/api/sector_indices")
def get_sector_indices(period: str = Query(default="6M")):
    _validate_period(period)
    cache_key = f"sector_indices:{period}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    import numpy as np
    import pandas as pd
    from fetcher import PERIOD_DAYS

    days = PERIOD_DAYS[period]
    since = (datetime.now() - timedelta(days=days + 15)).strftime("%Y-%m-%d")

    all_codes = [s["code"] for s in ALL_STOCKS]
    rows = get_prices_multi(all_codes, since)

    n = len(SECTOR_DEFINITIONS)
    sector_meta = [
        {"name": s["name"], "color": s["color"], "stockCount": len(s["stocks"])}
        for s in SECTOR_DEFINITIONS
    ]

    if not rows:
        result = {
            "sectors": sector_meta,
            "matrix": [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)],
        }
        return result

    df = (
        pd.DataFrame(rows)
        .pivot(index="date", columns="code", values="close")
        .sort_index()
    )
    ret = df.pct_change().dropna(how="all")
    if len(ret) > days:
        ret = ret.iloc[-days:]

    sector_ret: dict[str, pd.Series] = {}
    for sdef in SECTOR_DEFINITIONS:
        codes = [s["code"] for s in sdef["stocks"]]
        valid = [c for c in codes if c in ret.columns]
        if valid:
            sector_ret[sdef["name"]] = ret[valid].mean(axis=1)

    names = [s["name"] for s in SECTOR_DEFINITIONS]
    matrix = [[1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            sa, sb = names[i], names[j]
            if sa in sector_ret and sb in sector_ret:
                aligned = pd.concat([sector_ret[sa], sector_ret[sb]], axis=1).dropna()
                if len(aligned) >= 5:
                    c = float(aligned.iloc[:, 0].corr(aligned.iloc[:, 1]))
                    if not np.isnan(c):
                        matrix[i][j] = round(c, 4)
                        matrix[j][i] = round(c, 4)

    result = {"sectors": sector_meta, "matrix": matrix}
    _cache.set(cache_key, result)
    return result


@app.get("/api/macro")
def get_macro(period: str = Query(default="6M")):
    _validate_period(period)

    cache_key = f"macro:{period}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    all_stocks_db = get_all_stocks()
    stock_codes = [s["code"] for s in all_stocks_db]
    stocks = [StockInfo(code=s["code"], name=s["name"], label=s["label"]) for s in all_stocks_db]

    macro_rows = get_macro_correlations(period)
    corr_map: dict[tuple[str, str], float] = {
        (r["indicator_code"], r["stock_code"]): r["value"]
        for r in macro_rows
    }

    indicators = [
        {"code": m["code"], "name": m["name"], "label": m["label"], "color": m["color"]}
        for m in MACRO_INDICATORS
    ]

    matrix = [
        [corr_map.get((m["code"], s_code), 0.0) for s_code in stock_codes]
        for m in MACRO_INDICATORS
    ]

    result = {"indicators": indicators, "stocks": stocks, "matrix": matrix}
    _cache.set(cache_key, result)
    return result


@app.get("/api/stocks/search", response_model=list[StockInfo])
def search(q: str = Query(..., min_length=1)):
    results = search_stocks(q, limit=20)
    return [StockInfo(code=s["code"], name=s["name"], label=s["label"]) for s in results]


@app.get("/api/stocks/{code}/correlations", response_model=StockCorrelationResponse)
def get_stock_correlations(code: str, period: str = Query(default="6M")):
    """指定銘柄と相関の高い/低い銘柄ランキングを返す（事前計算済みのものを参照）。"""
    _validate_period(period)

    cache_key = f"stockcorr:{code}:{period}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    stock_map = {s["code"]: s for s in get_all_stocks()}
    base = stock_map.get(code)
    if base is None:
        raise HTTPException(status_code=404, detail=f"銘柄 {code} が見つかりません")

    peers = [
        StockCorrelationPeer(
            stock=StockInfo(code=peer["code"], name=peer["name"], label=peer["label"]),
            corr=row["value"],
        )
        for row in get_stock_rankings(code, period)
        if (peer := stock_map.get(row["peer_code"])) is not None
    ]

    result = StockCorrelationResponse(
        base=StockInfo(code=base["code"], name=base["name"], label=base["label"]),
        period=period,
        peers=peers,
    )
    _cache.set(cache_key, result)
    return result


@app.get("/api/stocks/{code}/chart", response_model=ChartData)
def get_chart(code: str, period: str = Query(default="6M")):
    _validate_period(period)

    cache_key = f"chart:{code}:{period}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    rows = get_prices(code, _cached_since(period))
    if not rows:
        raise HTTPException(status_code=404, detail=f"銘柄 {code} のキャッシュ済み価格データがありません")

    result = ChartData(
        code=code,
        dates=[str(row["date"])[:10] for row in rows],
        closes=[round(float(row["close"]), 2) for row in rows],
    )
    _cache.set(cache_key, result)
    return result


@app.get("/api/sectors/{sector_name}/chart", response_model=ChartData)
def get_sector_chart(sector_name: str, period: str = Query(default="6M")):
    _validate_period(period)

    sector_def = next((s for s in SECTOR_DEFINITIONS if s["name"] == sector_name), None)
    if sector_def is None:
        raise HTTPException(status_code=404, detail=f"セクター {sector_name} が見つかりません")

    cache_key = f"sector_chart:{sector_name}:{period}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    codes = [s["code"] for s in sector_def["stocks"]]
    rows = get_prices_multi(codes, _cached_since(period))
    prices = _prices_frame_from_rows(rows)

    valid_codes = [code for code in codes if code in prices.columns and prices[code].notna().sum() >= 2]
    if len(valid_codes) < 2:
        raise HTTPException(status_code=404, detail=f"セクター {sector_name} の指数データを作成できません")

    prices = prices[valid_codes].dropna(how="all")
    returns = prices.pct_change(fill_method=None).dropna(how="all")
    if returns.empty:
        raise HTTPException(status_code=404, detail=f"セクター {sector_name} の指数データを作成できません")

    # Interactive API requests never call yfinance. Without cached market-cap
    # weights, use an equal-weight sector index from stored batch prices.
    sector_returns = returns[valid_codes].mean(axis=1)

    sector_index = (1 + sector_returns.dropna()).cumprod() * 100
    result = ChartData(
        code=f"sector:{sector_name}",
        dates=[str(d)[:10] for d in sector_index.index],
        closes=[round(float(v), 2) for v in sector_index],
    )
    _cache.set(cache_key, result)
    return result


@app.get("/api/stocks/compare")
def compare_stocks(
    codes: str = Query(..., description="カンマ区切りの銘柄コード (最大 5 件)"),
    period: str = Query(default="6M"),
):
    _validate_period(period)

    code_list = [c.strip() for c in codes.split(",") if c.strip()]
    if not code_list:
        raise HTTPException(status_code=400, detail="codes は 1 件以上指定してください")
    if len(code_list) > 5:
        raise HTTPException(status_code=400, detail="比較できる銘柄は最大 5 件です")

    cache_key = f"compare:{','.join(sorted(code_list))}:{period}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        prices = _prices_frame_from_rows(get_prices_multi(code_list, _cached_since(period)))

        series_map: dict[str, dict] = {}
        for code in code_list:
            if code not in prices.columns:
                continue
            s = prices[code].dropna()
            series_map[code] = {
                "dates": [str(d)[:10] for d in s.index],
                "closes": [round(float(v), 2) for v in s],
            }

        corr_matrix = _corr_matrix_from_cached_prices(prices, code_list)

        result = {
            "stocks": series_map,
            "codes": code_list,
            "correlation": corr_matrix,
        }
        _cache.set(cache_key, result)
        return result

    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"データ取得エラー: {exc}")


# ──────────────────────────────────────────
# 認証・マイリスト
# ──────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    credential: str


def _get_user_id(authorization: str | None) -> int:
    """AuthorizationヘッダーからJWTを検証してuser_idを返す"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="認証が必要です")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = decode_jwt(token)
        return int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="トークンが無効です")


@app.post("/api/auth/google")
def auth_google(req: GoogleAuthRequest):
    """Google IDトークンを検証してJWTを発行する"""
    try:
        idinfo = verify_google_token(req.credential)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Googleトークンが無効です: {e}")

    user_id = get_or_create_user(
        google_sub=idinfo["sub"],
        email=idinfo["email"],
        name=idinfo.get("name", ""),
        picture=idinfo.get("picture"),
    )
    token = create_jwt(user_id, idinfo["email"])
    return {
        "token": token,
        "user": {
            "email": idinfo["email"],
            "name": idinfo.get("name", ""),
            "picture": idinfo.get("picture"),
        },
    }


@app.get("/api/watchlist")
def get_watchlist(authorization: str | None = Header(default=None)):
    """ログインユーザーのマイリストを返す"""
    user_id = _get_user_id(authorization)
    from database import get_conn as _conn
    with _conn() as conn:
        rows = conn.execute(
            "SELECT code, added_at FROM watchlists WHERE user_id = ? ORDER BY added_at DESC",
            (user_id,),
        ).fetchall()
    return [{"code": r["code"], "added_at": r["added_at"]} for r in rows]


@app.post("/api/watchlist/{code}")
def add_to_watchlist(code: str, authorization: str | None = Header(default=None)):
    """銘柄をマイリストに追加する"""
    user_id = _get_user_id(authorization)
    now = datetime.now().isoformat()
    from database import get_conn as _conn
    with _conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO watchlists (user_id, code, added_at) VALUES (?, ?, ?)",
            (user_id, code, now),
        )
    return {"code": code, "added_at": now}


@app.delete("/api/watchlist/{code}")
def remove_from_watchlist(code: str, authorization: str | None = Header(default=None)):
    """銘柄をマイリストから削除する"""
    user_id = _get_user_id(authorization)
    from database import get_conn as _conn
    with _conn() as conn:
        conn.execute(
            "DELETE FROM watchlists WHERE user_id = ? AND code = ?",
            (user_id, code),
        )
    return {"message": f"{code} をマイリストから削除しました"}
