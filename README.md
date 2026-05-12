# Kaburela

東証プライム市場の上場銘柄の相関係数を、ヒートマップ・ネットワーク・ランキング・チャートで見るためのローカル分析アプリです。

対応銘柄リストは JPX 公式の「東証上場銘柄一覧」から自動取得し、`backend/data/stock_master.json` にキャッシュしています（プライム市場・内国株式の約1,600銘柄）。

「銘柄相関」タブでは、検索した銘柄について相関の強い銘柄・逆相関の銘柄のランキング（プライム全銘柄が対象）を表示できます。各銘柄の上位ランキングはバッチで事前計算しています。

## 起動

フロントエンド:

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

バックエンド:

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

ブラウザ:

```text
http://127.0.0.1:5173/
```

## 確認

```bash
npm run lint
npm run build
backend\.venv\Scripts\python.exe -m py_compile backend\main.py backend\config.py backend\models.py backend\database.py backend\batch.py backend\fetcher.py backend\repository.py backend\calculator.py backend\cache.py backend\stock_universe.py
```

## データ取得

価格データは yfinance（Yahoo Finance）から取得します。yfinance が空を返した銘柄は
Yahoo のチャートエンドポイントへ自動でフォールバックします。バッチは銘柄バッチごとに
SQLite へ逐次保存するので、途中で失敗しても次回実行時は取得済みの銘柄をスキップして
続きから再開します（直近5日以内に取得済みの銘柄は最新とみなす）。

任意で Stooq をもう一段のフォールバックに使えます。環境変数 `STOOQ_API_KEY` を
設定すると有効になります（無料キーは `https://stooq.com/q/d/?s=7203.jp&get_apikey` から取得）。
未設定なら Stooq フォールバックは単にスキップされます。

## 銘柄リストの更新

JPX の上場銘柄一覧から最新のプライム銘柄を取り込み直すには:

```bash
backend\.venv\Scripts\python.exe backend\stock_universe.py
```

`backend/data/stock_master.json` が書き換わります。`config.py` は起動時にこの
ファイルを読み込むので、更新後はバックエンドを再起動してください。週次の
`update-static-data.yml` でも自動で取り込み直します。

## Static deploy

Kaburela can run without a public backend by exporting API-compatible JSON
files into `public/data`.

```bash
cd backend
.venv\Scripts\python.exe export_static.py
cd ..
npm run build
```

For Cloudflare Pages:

- Build command: `npm run build`
- Build output directory: `dist`
- Do not set `VITE_API_BASE_URL` for the static JSON build.

`.github/workflows/update-static-data.yml` refreshes market data with yfinance,
exports `public/data`, verifies the frontend build, and commits changed data.
Run it manually with `workflow_dispatch`, or let the weekly schedule update it.

## API

フロントエンドは `VITE_API_BASE_URL` が未設定なら `public/data` の静的JSONを参照します。
FastAPI を使う場合は `VITE_API_BASE_URL` に API のURLを設定してください。
