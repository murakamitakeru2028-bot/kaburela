"""銘柄マスターと業種・マクロ指標の定義。

銘柄一覧は backend/data/stock_master.json（stock_universe.py がJPXから生成）を
読み込んで構築する。JSONが無い場合は最小限の組み込みリストにフォールバックする。

  - STOCK_MASTER / ALL_STOCKS : プライム市場の全銘柄。検索・チャートなどで使う。
  - SECTOR_DEFINITIONS        : 業種ごとにグループ化したもの。業種内ヒートマップと
                                相関の事前計算に使う。大きい業種は規模上位 N 銘柄に絞る。
"""

import json
import logging
from pathlib import Path
from typing import TypedDict

logger = logging.getLogger(__name__)


class StockDef(TypedDict):
    ticker: str
    code: str
    name: str
    label: str
    sector: str


class SectorDef(TypedDict):
    name: str
    color: str
    stocks: list[StockDef]


class MacroIndicatorDef(TypedDict):
    ticker: str
    code: str
    name: str
    label: str
    color: str


VALID_PERIODS = {"1M", "3M", "6M", "1Y", "3Y", "5Y"}

# 業種内ヒートマップに表示する1業種あたりの最大銘柄数（規模区分の上位から選ぶ）。
# 全銘柄は STOCK_MASTER / ALL_STOCKS に保持され、検索・チャートでは全件使える。
HEATMAP_TOP_N_PER_SECTOR = 30

# 「コア銘柄」= 規模区分が TOPIX Core30 / Large70（size_rank <= 1）の約100銘柄。
# 全銘柄×全銘柄の相関行列やマクロ相関のヒートマップなど、UI で行列をそのまま扱う画面は
# この約100銘柄に絞る（1,600銘柄の行列はブラウザに送るには大きすぎ、表示も実用的でないため）。
# 個別の「銘柄相関」タブは事前計算済みランキングを使うので全銘柄が対象。
CORE_SIZE_RANK_MAX = 1

# 業種に割り当てる色のパレット（東証33業種ぶん）。業種名のソート順に割り当てる。
_SECTOR_PALETTE: list[str] = [
    "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
    "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
    "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
    "#ec4899", "#f43f5e", "#dc2626", "#ea580c", "#d97706",
    "#ca8a04", "#65a30d", "#16a34a", "#059669", "#0d9488",
    "#0891b2", "#0284c7", "#2563eb", "#4f46e5", "#7c3aed",
    "#9333ea", "#c026d3", "#db2777",
]

_DATA_DIR = Path(__file__).parent / "data"
_MASTER_JSON = _DATA_DIR / "stock_master.json"

# JSONが無いときのフォールバック（主要銘柄のみ）。
_FALLBACK_STOCKS: list[StockDef] = [
    {"ticker": "7203.T", "code": "7203", "name": "トヨタ自動車", "label": "トヨタ", "sector": "輸送用機器"},
    {"ticker": "7267.T", "code": "7267", "name": "ホンダ", "label": "ホンダ", "sector": "輸送用機器"},
    {"ticker": "6758.T", "code": "6758", "name": "ソニーグループ", "label": "ソニーG", "sector": "電気機器"},
    {"ticker": "6861.T", "code": "6861", "name": "キーエンス", "label": "キーエンス", "sector": "電気機器"},
    {"ticker": "8035.T", "code": "8035", "name": "東京エレクトロン", "label": "東エレク", "sector": "電気機器"},
    {"ticker": "8306.T", "code": "8306", "name": "三菱UFJフィナンシャル・グループ", "label": "三菱UFJ", "sector": "銀行業"},
    {"ticker": "8316.T", "code": "8316", "name": "三井住友フィナンシャルグループ", "label": "三井住友", "sector": "銀行業"},
    {"ticker": "9432.T", "code": "9432", "name": "日本電信電話", "label": "NTT", "sector": "情報・通信業"},
    {"ticker": "9984.T", "code": "9984", "name": "ソフトバンクグループ", "label": "SBG", "sector": "情報・通信業"},
    {"ticker": "8058.T", "code": "8058", "name": "三菱商事", "label": "三菱商事", "sector": "卸売業"},
    {"ticker": "9983.T", "code": "9983", "name": "ファーストリテイリング", "label": "ユニクロ", "sector": "小売業"},
    {"ticker": "4502.T", "code": "4502", "name": "武田薬品工業", "label": "武田薬品", "sector": "医薬品"},
]


def _load_master_records() -> list[dict] | None:
    """backend/data/stock_master.json を読み込む。無ければ None。"""
    if not _MASTER_JSON.exists():
        return None
    try:
        return json.loads(_MASTER_JSON.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("銘柄マスターJSONの読み込みに失敗: %s", exc)
        return None


def _record_to_stockdef(r: dict) -> StockDef:
    code = str(r["code"])
    name = str(r["name"])
    return {
        "ticker": str(r.get("ticker") or f"{code}.T"),
        "code": code,
        "name": name,
        "label": str(r.get("label") or name),
        "sector": str(r.get("sector") or "その他"),
    }


def _record_size_rank(r: dict) -> int:
    try:
        return int(r.get("size_rank", 99))
    except (TypeError, ValueError):
        return 99


def _build_universe() -> tuple[list[StockDef], list[StockDef]]:
    """(全銘柄, コア銘柄) を返す。JSONが無ければ組み込みの主要銘柄を両方に使う。"""
    records = _load_master_records()
    if not records:
        logger.warning(
            "%s が見つからないため組み込みの主要銘柄リストを使用します", _MASTER_JSON
        )
        fallback: list[StockDef] = [dict(s) for s in _FALLBACK_STOCKS]  # type: ignore[misc]
        return fallback, list(fallback)

    all_stocks = [_record_to_stockdef(r) for r in records]
    core_stocks = [
        _record_to_stockdef(r) for r in records if _record_size_rank(r) <= CORE_SIZE_RANK_MAX
    ]
    if not core_stocks:
        core_stocks = list(all_stocks)
    return all_stocks, core_stocks


def _build_sector_definitions(stocks: list[StockDef]) -> list[SectorDef]:
    """銘柄を業種ごとにグループ化し、各業種を上位 N 銘柄に絞る。

    stocks は stock_universe.py 側で「業種 → 規模ランク → コード」の順に
    並んでいる前提なので、先頭から N 件取れば規模上位 N 銘柄になる。
    """
    grouped: dict[str, list[StockDef]] = {}
    for s in stocks:
        grouped.setdefault(s["sector"], []).append(s)

    sectors: list[SectorDef] = []
    for i, name in enumerate(sorted(grouped)):
        sectors.append(
            {
                "name": name,
                "color": _SECTOR_PALETTE[i % len(_SECTOR_PALETTE)],
                "stocks": grouped[name][:HEATMAP_TOP_N_PER_SECTOR],
            }
        )
    return sectors


STOCK_MASTER, CORE_STOCKS = _build_universe()
ALL_STOCKS: list[StockDef] = STOCK_MASTER
SECTOR_DEFINITIONS: list[SectorDef] = _build_sector_definitions(STOCK_MASTER)

# 業種名 → 色（seed_stocks などで業種に色を引くため）。
SECTOR_COLORS: dict[str, str] = {s["name"]: s["color"] for s in SECTOR_DEFINITIONS}


MACRO_INDICATORS: list[MacroIndicatorDef] = [
    {"ticker": "USDJPY=X", "code": "USDJPY", "name": "ドル円", "label": "USD/JPY", "color": "#f59e0b"},
    {"ticker": "EURJPY=X", "code": "EURJPY", "name": "ユーロ円", "label": "EUR/JPY", "color": "#06b6d4"},
    {"ticker": "CNYJPY=X", "code": "CNYJPY", "name": "人民元円", "label": "CNY/JPY", "color": "#dc2626"},
    {"ticker": "AUDJPY=X", "code": "AUDJPY", "name": "豪ドル円", "label": "AUD/JPY", "color": "#0891b2"},
    {"ticker": "^N225", "code": "N225", "name": "日経平均", "label": "日経平均", "color": "#ef4444"},
    {"ticker": "1306.T", "code": "TOPIXETF", "name": "TOPIX連動ETF", "label": "TOPIX ETF", "color": "#2563eb"},
    {"ticker": "^GSPC", "code": "GSPC", "name": "S&P500", "label": "S&P500", "color": "#3b82f6"},
    {"ticker": "^DJI", "code": "DJI", "name": "NYダウ", "label": "NYダウ", "color": "#0ea5e9"},
    {"ticker": "^IXIC", "code": "NASDAQ", "name": "NASDAQ総合", "label": "NASDAQ", "color": "#a855f7"},
    {"ticker": "^VIX", "code": "VIX", "name": "VIX指数", "label": "VIX", "color": "#ef4444"},
    {"ticker": "^TNX", "code": "US10Y", "name": "米10年金利", "label": "米10Y", "color": "#64748b"},
    {"ticker": "DX-Y.NYB", "code": "DXY", "name": "ドル指数", "label": "DXY", "color": "#22c55e"},
    {"ticker": "GC=F", "code": "GOLD", "name": "金", "label": "金(XAU)", "color": "#eab308"},
    {"ticker": "SI=F", "code": "SILVER", "name": "銀", "label": "銀", "color": "#94a3b8"},
    {"ticker": "HG=F", "code": "COPPER", "name": "銅", "label": "銅", "color": "#b45309"},
    {"ticker": "CL=F", "code": "OIL", "name": "WTI原油", "label": "WTI原油", "color": "#8b5cf6"},
    {"ticker": "NG=F", "code": "NATGAS", "name": "天然ガス", "label": "天然ガス", "color": "#10b981"},
    {"ticker": "BTC-JPY", "code": "BTCJPY", "name": "ビットコイン円", "label": "BTC/JPY", "color": "#f7931a"},
    {"ticker": "^SOX", "code": "SOX", "name": "フィラデルフィア半導体指数", "label": "SOX", "color": "#7c3aed"},
    {"ticker": "SOXX", "code": "SOXX", "name": "iShares半導体ETF", "label": "SOXX", "color": "#4f46e5"},
    {"ticker": "SMH", "code": "SMH", "name": "VanEck半導体ETF", "label": "SMH", "color": "#06b6d4"},
    {"ticker": "NVDA", "code": "NVDA", "name": "NVIDIA", "label": "NVDA", "color": "#76b900"},
    {"ticker": "TSM", "code": "TSM", "name": "TSMC ADR", "label": "TSMC", "color": "#0f766e"},
    {"ticker": "ASML", "code": "ASML", "name": "ASML ADR", "label": "ASML", "color": "#2563eb"},
    {"ticker": "AMD", "code": "AMD", "name": "AMD", "label": "AMD", "color": "#ef4444"},
    {"ticker": "AVGO", "code": "AVGO", "name": "Broadcom", "label": "AVGO", "color": "#22c55e"},
]
