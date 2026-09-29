from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers.billing import router as billing_router
from app.routers.devices import router as devices_router
from app.routers.export import router as export_router
from app.routers.jobs import router as jobs_router
from app.routers.scans import router as scans_router
from app.routers.calibrator import (
    router as calibrator_router,
    calibrator_direct_router,
)

app = FastAPI(
    title="Site Hunter PostgreSQL Service",
    description="PostgreSQL backend & system-of-record service for Site Hunter PWA",
    version="2.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"^https://.*\.site-hunter\.com$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint for Cloud Run and load balancers."""
    return {"status": "ok", "service": "site-hunter-service", "version": "2.0.0"}


# Mount domain routers
app.include_router(jobs_router)
app.include_router(devices_router)
app.include_router(scans_router)
app.include_router(billing_router)
app.include_router(export_router)
app.include_router(calibrator_router)
app.include_router(calibrator_direct_router)
try:
    from api.asana_routes import router as asana_router
    app.include_router(asana_router)
except ImportError:
    from app.routers.asana_routes import router as asana_router
    app.include_router(asana_router)

# Mount local static file storage for images/photos
storage_root = os.path.abspath(settings.storage_dir)
os.makedirs(os.path.join(storage_root, "photos"), exist_ok=True)
app.mount("/storage", StaticFiles(directory=storage_root), name="storage")
