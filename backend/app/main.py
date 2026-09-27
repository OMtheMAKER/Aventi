import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app import models  # noqa: F401  (ensure models are imported for metadata)
from app.db import Base, engine
from app.seed import seed
from app.routers import auth, events, registrations, teams, admin, submissions, votes, judging, t4, chat

# Find the built SPA wherever it lives:
#  - local dev:   <repo>/frontend/dist            (this file is <repo>/backend/app/main.py)
#  - docker:      /app/frontend/dist              (Dockerfile copies it next to /app/app)
#  - legacy root: /frontend/dist
_HERE = os.path.abspath(__file__)
_STATIC_CANDIDATES = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_HERE))), "frontend", "dist"),
    os.path.join(os.path.dirname(os.path.dirname(_HERE)), "frontend", "dist"),
    "/frontend/dist",
]
STATIC_DIR = next(
    (d for d in _STATIC_CANDIDATES if os.path.isdir(d)),
    _STATIC_CANDIDATES[0],
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed()
    yield


app = FastAPI(title="Aventi Platform", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (
    auth.router,
    events.router,
    registrations.router,
    teams.router,
    admin.router,
    submissions.router,
    votes.router,
    judging.router,
    t4.router,
    chat.router,
):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/{full_path:path}")
def spa(full_path: str):
    # Serve the built SPA if present; fall back to index.html for client-side routes.
    if os.path.isdir(STATIC_DIR):
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path) and full_path:
            # Hashed build assets can be cached forever; other static files short.
            headers = (
                {"Cache-Control": "public, max-age=31536000, immutable"}
                if full_path.startswith("assets/")
                else {"Cache-Control": "public, max-age=3600"}
            )
            return FileResponse(file_path, headers=headers)
        # index.html — never cache, so the browser always gets the newest build
        return FileResponse(
            os.path.join(STATIC_DIR, "index.html"),
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    return {"detail": "Frontend not built. Run `npm run build` in frontend/."}
