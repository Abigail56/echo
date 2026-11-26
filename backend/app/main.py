from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import router
from app.api.world import router as world_router
from app.api.immersive import router as immersive_router
from app.api.avatar import router as avatar_router
from app.api.live_avatar import router as live_avatar_router

app = FastAPI(title="ECHO API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[settings().FRONTEND_URL], allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Content-Type"])

@app.middleware("http")
async def guard_writes(request: Request, call_next):
    if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and origin != settings().FRONTEND_URL:
            return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
        content_type = request.headers.get("content-type", "").split(";")[0].strip()
        is_avatar_model_import = (
            request.method == "POST"
            and request.url.path == "/api/v1/avatar/model/import"
            and content_type == "multipart/form-data"
        )
        is_liveavatar_image = (
            request.method == "POST"
            and request.url.path == "/api/v1/avatar/live/avatars/image"
            and content_type == "multipart/form-data"
        )
        is_document_import = (
            request.method == "POST"
            and request.url.path.startswith("/api/v1/studio/")
            and request.url.path.endswith("/documents/import")
            and content_type == "multipart/form-data"
        )
        if content_type != "application/json" and not (is_avatar_model_import or is_liveavatar_image or is_document_import):
            return JSONResponse(status_code=415, content={"detail": "JSON required"})
    return await call_next(request)

app.include_router(router, prefix="/api/v1")
app.include_router(world_router, prefix="/api/v1")
app.include_router(immersive_router, prefix="/api/v1")
app.include_router(avatar_router, prefix="/api/v1")
app.include_router(live_avatar_router, prefix="/api/v1")
from app.api.privacy import router as privacy_router
app.include_router(privacy_router, prefix="/api/v1")
@app.get("/api/v1/health")
def health(): return {"status": "healthy", "service": "echo-api"}
