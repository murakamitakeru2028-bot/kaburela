# Kaburela

東証銘柄の相関係数を、ヒートマップ・ネットワーク・ランキング・チャートで見るためのローカル分析アプリです。

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
backend\.venv\Scripts\python.exe -m py_compile backend\main.py backend\config.py backend\models.py backend\database.py backend\batch.py backend\fetcher.py backend\repository.py backend\calculator.py backend\cache.py
```

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
