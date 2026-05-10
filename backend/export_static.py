"""Export Kaburela API responses as static JSON files.

This lets the frontend run on static hosting without a long-lived backend.
Use --refresh in CI to download fresh market data before exporting.
"""

from __future__ import annotations

import argparse
import json
import logging
import shutil
from pathlib import Path
from urllib.parse import quote

from fastapi.encoders import jsonable_encoder

import main as api
from batch import run_batch, seed_stocks
from config import ALL_STOCKS, SECTOR_DEFINITIONS
from database import init_db


PERIODS = ["1M", "3M", "6M", "1Y", "3Y", "5Y"]
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = PROJECT_ROOT / "public" / "data"


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(jsonable_encoder(data), ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def reset_output_dir(output_dir: Path) -> None:
    output_dir = output_dir.resolve()
    public_dir = (PROJECT_ROOT / "public").resolve()
    if public_dir not in output_dir.parents or output_dir.name != "data":
        raise ValueError(f"Refusing to clear unexpected output path: {output_dir}")
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)


def safe_name(value: str) -> str:
    return quote(value, safe="")


def export_static(output_dir: Path, refresh: bool) -> None:
    init_db()
    seed_stocks()

    if refresh:
        run_batch()

    reset_output_dir(output_dir)

    write_json(output_dir / "health.json", api.health())
    write_json(output_dir / "master.json", api.get_master())

    for period in PERIODS:
        logging.info("exporting period %s", period)
        write_json(output_dir / "sectors" / f"{period}.json", api.get_sectors(period))
        write_json(output_dir / "correlation" / f"{period}.json", api.get_correlation(period))
        write_json(output_dir / "sector-indices" / f"{period}.json", api.get_sector_indices(period))
        write_json(output_dir / "macro" / f"{period}.json", api.get_macro(period))
        write_json(output_dir / "ranking" / f"{period}.json", api.get_ranking(period, "all", 200))

        for stock in ALL_STOCKS:
            write_json(
                output_dir / "charts" / "stocks" / period / f"{stock['code']}.json",
                api.get_chart(stock["code"], period),
            )

        for sector in SECTOR_DEFINITIONS:
            write_json(
                output_dir / "charts" / "sectors" / period / f"{safe_name(sector['name'])}.json",
                api.get_sector_chart(sector["name"], period),
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Export static Kaburela data")
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Output directory, defaults to public/data",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Download fresh market data and update the SQLite cache first",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    export_static(args.output, args.refresh)


if __name__ == "__main__":
    main()
