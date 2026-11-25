from datetime import datetime, timedelta, timezone
from uuid import UUID
import jwt
from pwdlib import PasswordHash
from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session
from app.core.config import settings
from app.core.db import session_dep
from app.models.entities import User

hasher = PasswordHash.recommended()
def hash_password(password: str) -> str: return hasher.hash(password)
def verify_password(password: str, hashed: str) -> bool: return hasher.verify(password, hashed)
def token_for(user: User) -> str:
    expiry = datetime.now(timezone.utc) + timedelta(days=7)
    return jwt.encode({"sub": str(user.id), "exp": expiry, "sv": user.session_version}, settings().JWT_SECRET_KEY, algorithm="HS256")
def current_user(request: Request, db: Session = Depends(session_dep)) -> User:
    token = request.cookies.get("echo_session")
    if not token: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login required")
    try:
        data = jwt.decode(token, settings().JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = UUID(data["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid session")
    user = db.get(User, user_id)
    if not user or data.get("sv") != user.session_version: raise HTTPException(status_code=401, detail="Session expired")
    return user
