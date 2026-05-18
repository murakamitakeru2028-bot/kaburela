"""Google IDトークン検証とJWT発行・検証"""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from database import get_conn

# .envファイルを自動で読み込む（python-dotenvが不要なシンプル実装）
def _load_dotenv() -> None:
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value

_load_dotenv()

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-please-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30


def verify_google_token(credential: str) -> dict:
    """Google IDトークンを検証してペイロードを返す"""
    return google_id_token.verify_oauth2_token(
        credential,
        google_requests.Request(),
        GOOGLE_CLIENT_ID,
    )


def get_or_create_user(google_sub: str, email: str, name: str, picture: str | None) -> int:
    """google_subでユーザーを取得または作成し、user_idを返す"""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE google_sub = ?", (google_sub,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE users SET email=?, name=?, picture=? WHERE google_sub=?",
                (email, name, picture, google_sub),
            )
            return int(row["id"])
        cursor = conn.execute(
            "INSERT INTO users (google_sub, email, name, picture) VALUES (?, ?, ?, ?)",
            (google_sub, email, name, picture),
        )
        return int(cursor.lastrowid)


def create_jwt(user_id: int, email: str) -> str:
    """JWTアクセストークンを発行する"""
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    """JWTを検証してペイロードを返す。無効なら例外を投げる"""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
