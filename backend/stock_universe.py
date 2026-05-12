"""東証プライム市場の上場銘柄一覧をJPX公式Excelから取得してキャッシュする。

JPXは「その他統計資料 > 東証上場銘柄一覧」(data_j.xls) を毎営業日更新している。
このモジュールはそれをダウンロード・解析し、backend/data/stock_master.json に保存する。
config.py はこのJSONを読み込んで銘柄マスターを構築する。
"""

from __future__ import annotations

import io
import json
import logging
import re
from pathlib import Path
from urllib.request import Request, urlopen

import pandas as pd

logger = logging.getLogger(__name__)

# JPXの一覧ページ。data_j.xls へのリンクのトークン部分は不定期に変わるため、
# まずこのページをスクレイプして最新URLを得る。取得に失敗したら既知URLを使う。
_JPX_LIST_PAGE = "https://www.jpx.co.jp/markets/statistics-equities/misc/01.html"
_JPX_SITE_BASE = "https://www.jpx.co.jp"
_FALLBACK_XLS_URL = (
    "https://www.jpx.co.jp/markets/statistics-equities/misc/"
    "tvdivq0000001vg2-att/data_j.xls"
)

# 解析対象の市場区分（プライム内国株式のみ。ETF・REIT・外国株式などは除外）。
_TARGET_MARKET = "プライム（内国株式）"

# 規模区分（TOPIXの規模分類）の重要度ランク。
# 業種内ヒートマップで上位N銘柄を選ぶときの並び順に使う（小さいほど重要）。
_SIZE_RANK = {
    "TOPIX Core30": 0,
    "TOPIX Large70": 1,
    "TOPIX Mid400": 2,
    "TOPIX Small 1": 3,
    "TOPIX Small 2": 4,
}
_SIZE_RANK_DEFAULT = 9

_HEADERS = {"User-Agent": "Mozilla/5.0"}

_DATA_DIR = Path(__file__).parent / "data"
_MASTER_JSON = _DATA_DIR / "stock_master.json"


def _resolve_xls_url() -> str:
    """JPXの一覧ページから data_j.xls の最新URLを取得する。失敗時は既知URL。"""
    try:
        request = Request(_JPX_LIST_PAGE, headers=_HEADERS)
        with urlopen(request, timeout=30) as response:
            html = response.read().decode("utf-8", "ignore")
        match = re.search(r'href="([^"]*data_j\.xls)"', html)
        if match:
            href = match.group(1)
            return href if href.startswith("http") else _JPX_SITE_BASE + href
        logger.warning("JPX一覧ページに data_j.xls リンクが見つからない（既知URLを使用）")
    except Exception as exc:
        logger.warning("JPX一覧ページの取得に失敗: %s（既知URLを使用）", exc)
    return _FALLBACK_XLS_URL


def _download_xls(url: str) -> bytes:
    request = Request(url, headers=_HEADERS)
    with urlopen(request, timeout=60) as response:
        return response.read()


def _size_rank(size_label: str) -> int:
    return _SIZE_RANK.get(str(size_label).strip(), _SIZE_RANK_DEFAULT)


def _short_label(name: str, limit: int = 8) -> str:
    """ヒートマップの軸ラベル用に銘柄名を短縮する。"""
    name = str(name).strip()
    if len(name) <= limit:
        return name
    return name[: limit - 1] + "…"


def fetch_prime_stocks() -> list[dict]:
    """JPX Excelからプライム市場の内国株式一覧を取得して整形する。"""
    url = _resolve_xls_url()
    logger.info("JPX銘柄一覧をダウンロード: %s", url)
    raw = _download_xls(url)

    df = pd.read_excel(io.BytesIO(raw), engine="xlrd", dtype=str).fillna("")
    prime = df[df["市場・商品区分"].str.strip() == _TARGET_MARKET]

    records: list[dict] = []
    for _, row in prime.iterrows():
        code = row["コード"].strip()
        name = row["銘柄名"].strip()
        sector = row["33業種区分"].strip() or "その他"
        size = row["規模区分"].strip()
        if not code or not name:
            continue
        records.append(
            {
                "code": code,
                "ticker": f"{code}.T",
                "name": name,
                "label": _short_label(name),
                "sector": sector,
                "size": size,
                "size_rank": _size_rank(size),
            }
        )

    # 業種ごとに規模ランク順 → コード順で並べておく（config.py がそのまま使える）。
    records.sort(key=lambda r: (r["sector"], r["size_rank"], r["code"]))
    sector_count = len({r["sector"] for r in records})
    logger.info("プライム銘柄を取得: %s 件 / %s 業種", len(records), sector_count)
    return records


def save_master(records: list[dict]) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _MASTER_JSON.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return _MASTER_JSON


def load_master() -> list[dict] | None:
    """キャッシュ済みの銘柄マスターを読み込む。無ければ None。"""
    if not _MASTER_JSON.exists():
        return None
    try:
        return json.loads(_MASTER_JSON.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("銘柄マスターJSONの読み込みに失敗: %s", exc)
        return None


def refresh_master() -> list[dict]:
    """JPXから取得して backend/data/stock_master.json に保存する。"""
    records = fetch_prime_stocks()
    path = save_master(records)
    logger.info("銘柄マスターを保存: %s（%s 件）", path, len(records))
    return records


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    refresh_master()
