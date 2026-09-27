import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from fastapi import Request, HTTPException, Depends
from app.db import SessionLocal
from app import models

SECRET = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGO = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode("utf-8"), h.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_token(user_id: int, role: str) -> str:
    exp = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "role": role, "exp": exp}, SECRET, algorithm=ALGO)


def decode_token(token: str):
    try:
        return jwt.decode(token, SECRET, algorithms=[ALGO])
    except JWTError:
        return None


def get_current_user(request: Request):
    # Accept the token as (1) Bearer header, (2) hp_token httpOnly cookie, or
    # (3) hp_token query parameter. Some preview/hosting proxies strip custom
    # Authorization headers and some sandboxed iframe previews block cookies,
    # so the frontend mirrors the token into the URL as a last-resort
    # transport. (This keeps the demo platform reachable through such proxies;
    # for production use BFF cookies and drop the query-param path.)
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("hp_token")
    if not token:
        token = request.query_params.get("hp_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    db = SessionLocal()
    try:
        user = db.query(models.User).get(int(payload["sub"]))
    finally:
        db.close()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_admin(user: models.User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def get_optional_user(request: Request):
    """Same transport rules as get_current_user but returns None instead of
    raising 401 — for endpoints (open voting, gallery) where a login is
    optional."""
    token = None
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        token = request.cookies.get("hp_token")
    if not token:
        token = request.query_params.get("hp_token")
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    db = SessionLocal()
    try:
        user = db.query(models.User).get(int(payload["sub"]))
    finally:
        db.close()
    return user
