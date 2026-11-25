"""Shared, atomic rate limits across API instances."""
from fastapi import HTTPException, Request
from app.core.config import settings
import redis

_client = None

def limit(request: Request, bucket: str, count: int, window: int):
    global _client
    s = settings()
    if not s.REDIS_URL:
        raise HTTPException(503, "Rate limiting unavailable; configure REDIS_URL")
    try:
        if _client is None:
            _client = redis.Redis.from_url(s.REDIS_URL, socket_connect_timeout=1, socket_timeout=1)
        ip = request.client.host if request.client else 'unknown'
        # Atomic increment and TTL in one Lua script; shared across all workers.
        key = f'echo:rate:{bucket}:{ip}'
        script = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n"
        n = _client.eval(script, 1, key, window)
        if n > count:
            raise HTTPException(429, "Too many requests; try again later")
    except redis.RedisError:
        raise HTTPException(503, "Rate limiting temporarily unavailable")
