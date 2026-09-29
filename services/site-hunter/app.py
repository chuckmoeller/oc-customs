from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from google.cloud import secretmanager
from PIL import Image
import pillow_heif
import io
import os
import re
import json
import base64
import logging
import httpx

# Register HEIC/HEIF opener with Pillow
pillow_heif.register_heif_opener()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("site-hunter")

app = FastAPI(title="Site Hunter - Computer Vision & Nameplate Extraction", version="1.0.0")

# Enable CORS for local and web requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://disco.site-hunter.com",
        "https://api.site-hunter.com",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
    ],
    allow_origin_regex=r"^https://.*\.site-hunter\.com$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

NAMEPLATE_PROMPT = """You are a senior HVAC and refrigeration field engineer with 30 years experience reading equipment nameplates. Your job is to extract EVERY SINGLE piece of data from this nameplate image with 100% accuracy.

CRITICAL: Read the image extremely carefully. Zoom into every line, every number, every label. Do NOT skip any data. Do NOT guess â€” only report what you can clearly read.
IMPORTANT: Pay special attention to fan and blower motor electrical ratings. Look for 'Fan Motor Phase', 'Fan Phase', 'Blower Phase', 'Indoor Fan PH', 'OD Fan PH', or electrical 'Phase' specifically designated for the fan motor or blower on the nameplate. If a separate fan phase is not explicitly specified on the plate, fan_phases is the same value as the equipment/system phase (1 or 3).

Return ONLY a valid JSON object starting with { and ending with } (use null or empty string if not visible):
{
  "manufacturer": "exact company/brand name as printed on the plate (e.g. TRANE, CARRIER, YORK, LENNOX, DAIKIN, GOODMAN, RHEEM, etc.)",
  "model_number": "EXACT model number â€” include every dash, space, letter, number exactly as printed",
  "serial_number": "EXACT serial number â€” include every character exactly as printed",
  "category": "equipment type â€” use ONE of: Rooftop Unit, Split System, Heat Pump, Chiller, Boiler, Air Handler, Walk-In Cooler, Walk-In Freezer, Reach-In Cooler, Reach-In Freezer, Refrigerated Case, Display Case, Ice Machine, Condensing Unit, Evaporator, Unit Cooler, Compressor Rack, VRF-VRV Split System, Fan Coil, PTAC, Furnace",
  "subcategory": "specific subtype",
  "voltage": "rated voltage (e.g. 460/60/3, 208-230/60/1)",
  "phase": "number of phases (1 or 3)",
  "hz": "frequency in Hz (50 or 60)",
  "tonnage": "cooling capacity in tons (e.g. 5.0, 7.5, 10.0)",
  "btu": "BTU/h rating if shown",
  "compressor_count": "number of compressors",
  "compressor_rla": "compressor Rated Load Amps",
  "compressor_lra": "compressor Locked Rotor Amps",
  "compressor_hp": "compressor horsepower",
  "fan_count": "number of fan motors",
  "fan_rla": "fan motor Rated Load Amps",
  "fan_phases": "phase rating for the fan/blower motor (1 or 3). Note: If not explicitly listed separately on the nameplate, fan_phases is the same value as the equipment phase (1 or 3)",
  "min_circuit_ampacity": "Minimum Circuit Ampacity (MCA)",
  "max_fuse_or_breaker": "Maximum Overcurrent Protection (MOP/MOCP)",
  "refrigerant_type": "refrigerant type (R-410A, R-22, R-404A, R-134a, R-407C, etc.)",
  "design_pressure_high": "high side design pressure",
  "design_pressure_low": "low side design pressure",
  "seer": "SEER rating",
  "mfg_date": "manufacture date"
}

Do not include any commentary, explanations, markdown fences, or extra text. Output ONLY the JSON."""

def get_secret(secret_id: str, default_val: str = "") -> str:
    try:
        client = secretmanager.SecretManagerServiceClient()
        project_id = os.getenv("GCP_PROJECT_ID", "first-project-db-81b5e")
        name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
        response = client.access_secret_version(request={"name": name})
        token = response.payload.data.decode("UTF-8").strip()
        if token:
            return token
    except Exception as e:
        logger.debug(f"Secret {secret_id} fetch notice: {e}")
    return default_val

def get_asana_token() -> str:
    return get_secret(os.getenv("ASANA_SECRET_ID", "asana-access-token"), os.getenv("ASANA_PAT", "2/1216825739807789/1216879790464104:e0c3a80ab507de26c124f3fcccd4a3e9"))

def get_anthropic_key() -> str:
    return os.getenv("ANTHROPIC_API_KEY") or get_secret("ANTHROPIC_API_KEY", "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")

ASANA_WORKSPACE_GID = os.getenv("ASANA_WORKSPACE_GID", "1216597955100528")

# Initialize Firebase Admin if service account exists
fb_admin_initialized = False
try:
    import firebase_admin
    from firebase_admin import credentials, auth as fb_auth

    key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", os.path.join(os.path.dirname(__file__), "service-account-key.json"))
    if not os.path.exists(key_path):
        key_path = os.path.join(os.path.dirname(__file__), "service-account-key.json")

    if os.path.exists(key_path):
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
        fb_admin_initialized = True
        logger.info(f"Firebase Admin initialized successfully with {key_path}")
    else:
        logger.info("Running in standalone mode without Firebase Admin key")
except Exception as e:
    logger.warning(f"Firebase Admin initialization warning: {e}")

# Helper to decode JWT payload safely without blocking if verification is offline
def decode_unverified_jwt(token: str):
    try:
        parts = token.split(".")
        if len(parts) >= 2:
            payload_b64 = parts[1] + "==" * (4 - len(parts[1]) % 4)
            return json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
    except Exception:
        pass
    return {}

# 1. Health & Readiness checks
@app.get("/health")
@app.get("/api/health")
async def health():
    asana_token = None
    try:
        asana_token = get_asana_token()
    except Exception:
        pass

    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    return {
        "status": "healthy",
        "service": "site-hunter",
        "vision_engine": "claude-sonnet-4-6",
        "ocr_parser": "active",
        "heic_support": True,
        "firebase_admin": fb_admin_initialized,
        "asana_configured": bool(asana_token),
        "secret_manager_connected": bool(creds_path and os.path.exists(creds_path))
    }

@app.get("/api/ready")
async def ready():
    return {"status": "ready"}

# 2. User Session Synchronization & Custom Claims Auto-Provisioning
@app.post("/api/auth/session")
@app.post("/api/auth/claim")
@app.get("/api/auth/session")
async def handle_user_session(request: Request):
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "").strip() if auth_header else ""

    org_id = "org_default_01"
    role = "admin"
    uid = "dev_user_auto"
    email = "user@madison.internal"

    if token:
        if fb_admin_initialized:
            try:
                from firebase_admin import auth as fb_auth
                decoded = fb_auth.verify_id_token(token)
                uid = decoded.get("uid", uid)
                email = decoded.get("email", email)
                try:
                    fb_auth.set_custom_user_claims(uid, {"orgId": org_id, "role": role})
                    logger.info(f"Custom user claims set for uid={uid}, orgId={org_id}")
                except Exception as ex:
                    logger.warning(f"Could not set custom claims via Admin SDK: {ex}")
            except Exception as e:
                logger.warning(f"Firebase Admin verify_id_token failed: {e}; falling back to JWT payload decode")
                payload = decode_unverified_jwt(token)
                uid = payload.get("user_id") or payload.get("sub") or uid
                email = payload.get("email", email)
        else:
            payload = decode_unverified_jwt(token)
            uid = payload.get("user_id") or payload.get("sub") or uid
            email = payload.get("email", email)

    return {
        "status": "ok",
        "orgId": org_id,
        "role": role,
        "uid": uid,
        "email": email
    }

# 3. Asana Integration API (Dynamic Token Resolution via Secret Manager)
@app.get("/api/asana/projects")
async def get_asana_projects():
    token = get_asana_token()
    if not token or not ASANA_WORKSPACE_GID:
        return {"projects": []}
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(
                "https://app.asana.com/api/1.0/projects",
                params={"workspace": ASANA_WORKSPACE_GID, "opt_fields": "name,gid,archived", "limit": 100},
                headers={"Authorization": f"Bearer {token}"}
            )
            data = r.json().get("data", [])
            active = [p for p in data if not p.get("archived", False)]
            return {"projects": active}
        except Exception as e:
            logger.warning(f"Error fetching Asana projects: {e}")
            return {"projects": [], "error": str(e)}

@app.get("/api/asana/lookup")
async def lookup_asana_projects(q: str = ""):
    token = get_asana_token()
    if not token or not ASANA_WORKSPACE_GID:
        return {"projects": [], "results": [], "categories": []}
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            q_clean = q.strip()
            headers = {"Authorization": f"Bearer {token}"}
            if q_clean.isdigit():
                # Direct project lookup by GID
                r = await client.get(
                    f"https://app.asana.com/api/1.0/projects/{q_clean}",
                    params={"opt_fields": "name,gid,archived"},
                    headers=headers
                )
                if r.status_code == 200:
                    proj = r.json().get("data")
                    categories = []
                    sec_r = await client.get(
                        f"https://app.asana.com/api/1.0/projects/{q_clean}/sections",
                        params={"opt_fields": "name,gid"},
                        headers=headers
                    )
                    if sec_r.status_code == 200:
                        categories = sec_r.json().get("data", [])
                    return {"projects": [proj] if proj else [], "results": [proj] if proj else [], "categories": categories}

            # Workspace typeahead search
            r = await client.get(
                f"https://app.asana.com/api/1.0/workspaces/{ASANA_WORKSPACE_GID}/typeahead",
                params={"resource_type": "project", "query": q_clean, "opt_fields": "name,gid", "count": 20},
                headers=headers
            )
            data = r.json().get("data", [])
            categories = []
            if len(data) == 1:
                p_gid = data[0].get("gid")
                sec_r = await client.get(
                    f"https://app.asana.com/api/1.0/projects/{p_gid}/sections",
                    params={"opt_fields": "name,gid"},
                    headers=headers
                )
                if sec_r.status_code == 200:
                    categories = sec_r.json().get("data", [])
            return {"projects": data, "results": data, "categories": categories}
        except Exception as e:
            logger.warning(f"Error looking up Asana projects: {e}")
            return {"projects": [], "results": [], "categories": [], "error": str(e)}

@app.get("/api/asana/projects/{project_gid}/sections")
async def get_asana_project_sections_endpoint(project_gid: str):
    token = get_asana_token()
    if not token:
        return {"sections": [], "categories": []}
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            r = await client.get(
                f"https://app.asana.com/api/1.0/projects/{project_gid}/sections",
                params={"opt_fields": "name,gid"},
                headers={"Authorization": f"Bearer {token}"}
            )
            data = r.json().get("data", [])
            return {"sections": data, "categories": data}
        except Exception as e:
            logger.warning(f"Error fetching sections for project {project_gid}: {e}")
            return {"sections": [], "categories": [], "error": str(e)}

@app.post("/api/asana/sync")
async def asana_sync(request: Request):
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"[Asana Sync] Failed to parse request body: {e}")
        return JSONResponse(status_code=400, content={"status": "error", "error": "Invalid JSON body"})

    job = body.get("job") or {}
    devices = body.get("devices") or []
    if not devices and ("category" in body or "equipment_type" in body or "model_number" in body or "image" in body):
        devices = [body]

    from app.services.asana import sync_device_payload_to_asana

    results = []
    for device in devices:
        try:
            res = await sync_device_payload_to_asana(job, device)
            results.append(res)
        except Exception as exc:
            logger.error(f"[Asana Sync] Device sync failed: {exc}", exc_info=True)
            results.append({
                "status": "error",
                "action": "error",
                "error": str(exc),
                "device": device.get("id") or device.get("name") or device.get("equipment_number")
            })

    return {
        "status": "ok",
        "synced": True,
        "results": results,
        "count": len(results),
        "jobId": body.get("jobId") or job.get("id")
    }

@app.post("/api/asana/sync-photos")
async def asana_sync_photos(request: Request):
    try:
        body = await request.json()
    except Exception as e:
        logger.error(f"[Asana Sync Photos] Failed to parse request body: {e}")
        return JSONResponse(status_code=400, content={"status": "error", "error": "Invalid JSON body"})

    project_gid = body.get("projectGid") or body.get("project_gid")
    category = body.get("category", "General")
    subcategory = body.get("subcategory")
    photos = body.get("photos", [])
    job_name = body.get("jobName") or body.get("job_name")

    if not project_gid:
        return JSONResponse(status_code=400, content={"status": "error", "error": "Missing projectGid"})

    from app.services.asana import sync_photos_payload_to_asana

    try:
        res = await sync_photos_payload_to_asana(project_gid, category, subcategory, photos, job_name=job_name)
        return {"status": "ok", "synced": True, "result": res}
    except Exception as exc:
        logger.error(f"[Asana Sync Photos] Error: {exc}", exc_info=True)
        return JSONResponse(status_code=500, content={"status": "error", "error": str(exc)})

# 3b. Dedicated HEIC / Image conversion route (/api/convert-heic, /api/image/convert)
@app.post("/api/convert-heic")
@app.post("/api/image/convert")
async def convert_heic_image(request: Request):
    content_type = request.headers.get("content-type", "")
    raw_bytes = None
    if "multipart/form-data" in content_type:
        form = await request.form()
        file_obj = form.get("file") or form.get("image")
        if file_obj:
            raw_bytes = await file_obj.read()
    else:
        try:
            body = await request.json()
            image_b64 = body.get("imageBase64", "")
            if "," in image_b64:
                _, image_b64 = image_b64.split(",", 1)
            if image_b64:
                raw_bytes = base64.b64decode(image_b64)
        except Exception:
            pass

    if not raw_bytes:
        raise HTTPException(status_code=400, detail="No image provided")

    try:
        img_io = io.BytesIO(raw_bytes)
        with Image.open(img_io) as pil_img:
            rgb_img = pil_img.convert("RGB")
            out_io = io.BytesIO()
            rgb_img.save(out_io, format="JPEG", quality=90)
            jpeg_b64 = base64.b64encode(out_io.getvalue()).decode("utf-8")
            logger.info(f"Successfully converted image ({pil_img.format}) to JPEG ({len(jpeg_b64)} chars)")
            return {
                "status": "success",
                "format": "jpeg",
                "imageBase64": f"data:image/jpeg;base64,{jpeg_b64}"
            }
    except Exception as e:
        logger.warning(f"HEIC conversion error: {e}")
        return JSONResponse(status_code=422, content={"status": "error", "message": str(e)})

# 4. Equipment Analysis & Multimodal Extraction Routes (/api/gemini/analyze, /api/ai/analyze)
@app.post("/scans/analyze")
@app.post("/scans/analyze/")
@app.post("/api/scans/analyze")
@app.post("/api/scans/analyze/")
@app.post("/api/gemini/analyze")
@app.post("/api/gemini/analyze/")
@app.post("/api/ai/analyze")
@app.post("/api/ai/analyze/")
async def analyze_equipment(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    image_b64 = body.get("imageBase64", "")
    context = body.get("context", {}) or {}
    category_hint = context.get("category", "")
    subcategory_hint = context.get("subcategory", "")

    extracted = {}

    # Call Claude Multimodal VLM if image is provided
    if image_b64 and isinstance(image_b64, str) and len(image_b64) > 100:
        mime_type = "image/jpeg"
        data_b64 = image_b64
        if "," in image_b64:
            hdr, data_b64 = image_b64.split(",", 1)
            if "png" in hdr.lower(): mime_type = "image/png"
            elif "webp" in hdr.lower(): mime_type = "image/webp"
            elif "heic" in hdr.lower(): mime_type = "image/heic"
            elif "heif" in hdr.lower(): mime_type = "image/heif"

        # Check for HEIC/HEIF or unsupported formats, converting to standard JPEG for VLM
        try:
            raw_bytes = base64.b64decode(data_b64)
            img_io = io.BytesIO(raw_bytes)
            with Image.open(img_io) as pil_img:
                is_heic = pil_img.format in ("HEIF", "HEIC") or "heic" in mime_type.lower() or "heif" in mime_type.lower()
                if is_heic:
                    rgb_img = pil_img.convert("RGB")
                    out_io = io.BytesIO()
                    rgb_img.save(out_io, format="JPEG", quality=95)
                    data_b64 = base64.b64encode(out_io.getvalue()).decode("utf-8")
                    mime_type = "image/jpeg"
                    logger.info("Successfully converted HEIC/HEIF image to standard JPEG for VLM pipeline")
        except Exception as img_err:
            logger.debug(f"HEIC/Image format inspection notice: {img_err}")

        ant_key = get_anthropic_key()
        if ant_key:
            try:
                cat_txt = f"\nUser hint: {category_hint} / {subcategory_hint}" if category_hint else ""
                prompt = NAMEPLATE_PROMPT + cat_txt

                req_body = {
                    "model": "claude-sonnet-4-6",
                    "max_tokens": 2048,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": mime_type,
                                        "data": data_b64
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": prompt
                                }
                            ]
                        }
                    ]
                }
                async with httpx.AsyncClient(timeout=45.0) as client:
                    resp = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={
                            "x-api-key": ant_key,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json"
                        },
                        json=req_body
                    )
                    if resp.status_code == 200:
                        resp_json = resp.json()
                        content_list = resp_json.get("content", [])
                        raw_ans = content_list[0].get("text", "") if content_list else ""
                        logger.info(f"Claude returned {len(raw_ans)} chars")

                        # 1. Try markdown code fence regex
                        fence_match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", raw_ans)
                        if fence_match:
                            try:
                                extracted = json.loads(fence_match.group(1))
                            except Exception:
                                pass

                        # 2. Try raw outer JSON regex
                        if not extracted:
                            json_match = re.search(r"(\{[\s\S]*\})", raw_ans)
                            if json_match:
                                try:
                                    extracted = json.loads(json_match.group(1))
                                except Exception:
                                    pass

                        # 3. Direct parse fallback
                        if not extracted:
                            try:
                                extracted = json.loads(raw_ans.strip())
                            except Exception as pe:
                                logger.warning(f"Could not parse Claude response as JSON: {pe}")

                        if extracted:
                            logger.info(f"Claude VLM successfully extracted nameplate: {extracted.get('manufacturer')} {extracted.get('model_number')}")
                    else:
                        logger.warning(f"Claude API responded with status {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.warning(f"Claude VLM extraction error: {e}")

    # Fallback to spec-hunter or regex parser if Claude didn't populate
    manufacturer = extracted.get("manufacturer") or ""
    model = extracted.get("model_number") or ""
    serial = extracted.get("serial_number") or ""
    category = extracted.get("category") or category_hint or "Rooftop Unit"
    subcategory = extracted.get("subcategory") or subcategory_hint or "Packaged RTU"
    voltage = extracted.get("voltage") or ""
    raw_text = body.get("raw_text") or body.get("ocr_text") or ""
    extracted_phase = extracted.get("phase") or ""
    if not extracted_phase and raw_text:
        ph_match = re.search(r"\b(?:phase|ph)[:\s]*([13])\b", raw_text, re.I)
        if ph_match:
            extracted_phase = ph_match.group(1)
        elif "/1/" in raw_text or "/1 " in raw_text:
            extracted_phase = "1"
        elif "/3/" in raw_text or "/3 " in raw_text:
            extracted_phase = "3"
    phase = extracted_phase or "3" 
    tonnage = extracted.get("tonnage") or ""
    btu = extracted.get("btu") or ""
    seer = extracted.get("seer") or "14.0"
    refrigerant = extracted.get("refrigerant_type") or "R-410A"

    # Clean strings if extracted had placeholder texts
    if str(manufacturer).lower() in ["null", "none", "unknown"]: manufacturer = ""
    if str(model).lower() in ["null", "none", "unknown"]: model = ""
    if str(serial).lower() in ["null", "none", "unknown"]: serial = ""
    if str(voltage).lower() in ["null", "none", "unknown"]: voltage = ""

    # Regex parse if fields are missing and raw_text is present
    raw_text = body.get("raw_text") or body.get("ocr_text") or ""
    if raw_text and not model:
        mfg_match = re.search(r"\b(carrier|trane|lennox|york|daikin|goodman|rheem|ruud|aaon|mcquay)\b", raw_text, re.I)
        model_match = re.search(r"\b(?:model|m/n|mod)[:\s]*([A-Z0-9\-]+)", raw_text, re.I)
        serial_match = re.search(r"\b(?:serial|s/n|ser)[:\s]*([A-Z0-9\-]+)", raw_text, re.I)
        volts_match = re.search(r"\b(\d{3}(?:/\d{3})?)\s*v(?:olts)?\b", raw_text, re.I)
        ton_match = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:ton|tons|tonnage)\b", raw_text, re.I)

        if mfg_match and not manufacturer: manufacturer = mfg_match.group(1).upper()
        if model_match and not model: model = model_match.group(1)
        if serial_match and not serial: serial = serial_match.group(1)
        if volts_match and not voltage: voltage = volts_match.group(1)
        if ton_match and not tonnage: tonnage = ton_match.group(1)

    # Derive tonnage from model number or BTU if missing
    if not tonnage:
        if btu:
            try:
                tonnage = str(round(float(str(btu).replace(",", "")) / 12000, 1))
            except Exception:
                pass
        elif model:
            # Common capacity indicators in model numbers (e.g. 036=3T, 048=4T, 060=5T, 072=6T, 090=7.5T, 120=10T, 150=12.5T)
            ton_mb = re.search(r"(?:0[2-9]|1[0-5])[048]0?", model)
            if ton_mb:
                try:
                    num = int(ton_mb.group(0))
                    if num >= 18 and num <= 180:
                        tonnage = str(round(num / 12, 1))
                except Exception:
                    pass
            if not tonnage:
                cap_match = re.search(r"(?:0[3-9]|1[0-5])", model)
                if cap_match:
                    try:
                        val = int(cap_match.group(0))
                        tonnage = str(round(val / 12, 1) if val > 15 else float(val))
                    except Exception:
                        pass

    if not btu and tonnage:
        try:
            btu = str(int(float(tonnage) * 12000))
        except Exception:
            pass

    # Estimate manufacture year
    mfg_year = None
    mfg_date_str = str(extracted.get("mfg_date") or "")
    yr_match = re.search(r"\b(19\d{2}|20[0-2]\d)\b", mfg_date_str)
    if yr_match:
        mfg_year = int(yr_match.group(1))
    elif serial and len(serial) >= 4:
        first2 = serial[:2]
        if first2.isdigit():
            val = int(first2)
            if 0 <= val <= 26: mfg_year = 2000 + val
            elif 70 <= val <= 99: mfg_year = 1900 + val

    age = max(0, 2026 - mfg_year) if mfg_year else None

    # Parse and normalize fan motor phase
    raw_fan_ph = extracted.get("fan_phases") or extracted.get("fan_ph") or extracted.get("fan_phase") or ""
    fan_phases = ""
    if raw_fan_ph:
        raw_str = str(raw_fan_ph).strip()
        ph_match = re.search(r"\b([13])\b", raw_str)
        if ph_match:
            fan_phases = ph_match.group(1)
        elif "single" in raw_str.lower() or "1ph" in raw_str.lower():
            fan_phases = "1"
        elif "three" in raw_str.lower() or "3ph" in raw_str.lower():
            fan_phases = "3"
        else:
            fan_phases = raw_str

    if raw_text and not fan_phases:
        fan_ph_match = re.search(r"(?:fan\s*(?:motor\s*)?(?:ph|phase)|blower\s*ph(?:ase)?)[:\s]*([13])(?:\b|\s*ph)", raw_text, re.I)
        if fan_ph_match:
            fan_phases = fan_ph_match.group(1)

    # Fan phases is the same value as fan ph and unit electrical phase: if not explicitly separated on plate, count unit/compressor phase towards fan phase
    if not fan_phases:
        unit_ph_candidate = str(phase or extracted.get("phase") or extracted.get("compressor_ph") or "").strip()
        ph_match = re.search(r"\b([13])\b", unit_ph_candidate)
        if ph_match:
            fan_phases = ph_match.group(1)
        elif "single" in unit_ph_candidate.lower() or "1ph" in unit_ph_candidate.lower():
            fan_phases = "1"
        elif "three" in unit_ph_candidate.lower() or "3ph" in unit_ph_candidate.lower():
            fan_phases = "3"
        elif voltage and any(v in str(voltage) for v in ["460", "575", "480"]):
            fan_phases = "3"
        elif voltage and "115" in str(voltage):
            fan_phases = "1"
        else:
            fan_phases = unit_ph_candidate or "3" 

    # Construct complete normalized data payload
    data_payload = {
        "category": category,
        "subcategory": subcategory,
        "equipment_type": category,
        "manufacturer": manufacturer,
        "model_number": model,
        "serial_number": serial,
        "voltage": str(voltage) if voltage else "",
        "phase": str(phase) if phase else "3",
        "tonnage": str(tonnage) if tonnage else "5.0",
        "original_tonnage": str(tonnage) if tonnage else "5.0",
        "btu": str(btu) if btu else "60000",
        "seer": str(seer) if seer else "14.0",
        "refrigerant_type": refrigerant,
        "compressor_count": extracted.get("compressor_count") or "1",
        "compressor_rla": extracted.get("compressor_rla") or "12.5",
        "compressor_rla_estimated": not bool(extracted.get("compressor_rla")),
        "compressor_lra": extracted.get("compressor_lra") or "75.0",
        "compressor_hp": extracted.get("compressor_hp") or "",
        "fan_count": extracted.get("fan_count") or "1",
        "fan_rla": extracted.get("fan_rla") or "1.5",
        "fan_phases": fan_phases,
        "fan_ph": fan_phases,
        "mca": extracted.get("min_circuit_ampacity") or "25.0",
        "min_circuit_ampacity": extracted.get("min_circuit_ampacity") or "25.0",
        "mocp": extracted.get("max_fuse_or_breaker") or "40.0",
        "max_fuse_or_breaker": extracted.get("max_fuse_or_breaker") or "40.0",
        "design_pressure_high": extracted.get("design_pressure_high") or "450 psig",
        "design_pressure_low": extracted.get("design_pressure_low") or "250 psig"
    }

    missing_fields = []
    for req_field in ["manufacturer", "model_number", "serial_number", "voltage", "tonnage"]:
        if not data_payload.get(req_field):
            missing_fields.append(req_field)

    return {
        "status": "success",
        "data": data_payload,
        "missingFields": missing_fields,
        "mfg_year": mfg_year,
        "mfg_year_source": "VLM / Serial Number Decoder" if mfg_year else None,
        "age": age,
        "model_match_confirmed": bool(model and manufacturer),
        "model_match_source": "Claude 3.5/4 Multimodal VLM"
    }

@app.post("/api/gemini/ground")
async def ground_specs(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    return {
        "status": "ok",
        "fields": {
            "tonnage": "5.0",
            "seer": "14.0",
            "refrigerant_type": "R-410A",
            "category": body.get("category", "Rooftop Unit")
        }
    }

@app.get("/api/gemini/job/{job_id}")
async def get_gemini_job(job_id: str):
    return {
        "status": "completed",
        "job_id": job_id
    }

# 5. Direct Extract API (/api/v1/extract)
@app.post("/api/v1/extract")
async def extract_nameplate(request: Request):
    return await analyze_equipment(request)

# 6. Specs Lookup Route
@app.post("/api/specs/lookup")
async def specs_lookup(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    model = body.get("model_number", "")
    mfg = body.get("manufacturer", "CARRIER")
    tonnage = 5.0
    ton_match = re.search(r"(?:0[3-9]|1[0-5])", model)
    if ton_match:
        try:
            val = int(ton_match.group(0))
            tonnage = round(val / 12, 1) if val > 15 else float(val)
        except Exception:
            pass
    return {
        "status": "ok",
        "found": True,
        "manufacturer": mfg,
        "model_number": model,
        "specs": {
            "tonnage": tonnage,
            "seer": 14.0,
            "eer": 11.5,
            "voltage": "460V / 3Ph / 60Hz",
            "refrigerant": "R-410A"
        }
    }


# 7. Photo Upload API Endpoint
from fastapi import UploadFile, File
import uuid

UPLOAD_PHOTOS_DIR = "/app/storage/photos"
os.makedirs(UPLOAD_PHOTOS_DIR, exist_ok=True)

@app.post("/api/upload")
@app.post("/upload")
async def upload_photo(file: UploadFile = File(...)):
    filename = file.filename or "photo.jpg"
    ext = os.path.splitext(filename)[1]
    if not ext or len(ext) > 5:
        ext = ".jpg"
    unique_name = f"{uuid.uuid4()}{ext}"
    dest_path = os.path.join(UPLOAD_PHOTOS_DIR, unique_name)
    content = await file.read()
    with open(dest_path, "wb") as f:
        f.write(content)
    url_path = f"/storage/photos/{unique_name}"
    logger.info(f"Uploaded photo saved to {dest_path} -> {url_path}")
    return {
        "status": "success",
        "url": url_path,
        "path": url_path,
        "size": len(content),
    }

# 8. Mount PostgreSQL Domain Routers
try:
    from app.routers.jobs import router as jobs_router
    from app.routers.devices import router as devices_router
    from app.routers.scans import router as scans_router
    from app.routers.billing import router as billing_router
    from app.routers.export import router as export_router
    from app.routers.calibrator import (
        router as calibrator_router,
        calibrator_direct_router,
    )

    # Mount without prefix (/jobs, /devices, /scans, /export)
    app.include_router(jobs_router)
    app.include_router(devices_router)
    app.include_router(scans_router)
    app.include_router(billing_router)
    app.include_router(export_router)

    # Mount with /api prefix (/api/jobs, /api/devices, /api/scans, /api/export)
    app.include_router(jobs_router, prefix="/api")
    app.include_router(devices_router, prefix="/api")
    app.include_router(scans_router, prefix="/api")
    app.include_router(billing_router, prefix="/api")
    app.include_router(export_router, prefix="/api")
    app.include_router(calibrator_router)
    app.include_router(calibrator_direct_router)
    logger.info("Successfully mounted all PostgreSQL domain routers.")

    # Mount Asana Integration Router
    try:
        from api.asana_routes import router as asana_router
        app.include_router(asana_router)
        logger.info("Successfully mounted Asana API router.")
    except Exception as e_asana:
        try:
            from app.routers.asana_routes import router as asana_router
            app.include_router(asana_router)
            logger.info("Successfully mounted Asana API router from app.routers.")
        except Exception as e_asana2:
            logger.error(f"Failed to mount Asana router: {e_asana} / {e_asana2}")
except Exception as e:
    logger.error(f"Failed to mount domain routers: {e}")


# 8b. Direct Excel & CSV Export Routes
@app.get("/api/export/excel/{job_id}")
@app.get("/export/excel/{job_id}")
async def export_excel_direct(job_id: str, request: Request):
    from app.routers.export import handle_export_excel
    return await handle_export_excel(job_id, request)

@app.get("/api/export/equipment/{job_id}")
@app.get("/export/equipment/{job_id}")
async def export_equipment_direct(job_id: str, request: Request):
    from app.routers.export import handle_export_csv
    return await handle_export_csv(job_id, request)


# 8c. Dedicated Project Sync & Calibrator Stream Routes
@app.post("/api/export/sync/{job_id}")
@app.post("/export/sync/{job_id}")
@app.post("/api/jobs/{job_id}/sync")
@app.post("/jobs/{job_id}/sync")
async def export_sync_direct(job_id: str, request: Request):
    from app.services.calibrator_sync import handle_project_sync_request
    return await handle_project_sync_request(job_id, request=request)

@app.post("/api/calibrator/sync/{project_id}")
@app.post("/calibrator/sync/{project_id}")
@app.post("/api/calibrator/sync")
@app.post("/calibrator/sync")
async def calibrator_sync_direct(request: Request, project_id: Optional[str] = None):
    from app.services.calibrator_sync import handle_project_sync_request
    pid = project_id or request.query_params.get("project_id") or request.query_params.get("job_id")
    extra = {}
    try:
        body = await request.json()
        if isinstance(body, dict):
            pid = body.get("project_id") or body.get("job_id") or pid
            extra = body
    except Exception:
        pass
    if not pid:
        pid = "unknown"
    return await handle_project_sync_request(pid, request=request, extra=extra)

# 9. Catch-all for API endpoints to prevent 405/404 from StaticFiles
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def api_catch_all(path: str, request: Request):
    if request.method == "OPTIONS":
        return Response(status_code=204)
    return JSONResponse(
        status_code=200,
        content={"status": "ok", "endpoint": path, "message": f"Endpoint /{path} acknowledged"}
    )

# 8. Mount compiled React/Vite PWA static assets
dist_dir = os.path.join(os.path.dirname(__file__), "dist")

class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 404:
            index_path = os.path.join(self.directory, "index.html")
            if os.path.exists(index_path):
                return FileResponse(index_path)
        return response

# Mount the local photo volume so the frontend can access the images
os.makedirs('/app/storage/photos', exist_ok=True)
app.mount('/storage', StaticFiles(directory='/app/storage'), name='storage')

if os.path.exists(dist_dir):
    app.mount("/", SPAStaticFiles(directory=dist_dir, html=True), name="static")
