import os
import re
import base64
import logging
from typing import Any, Dict, List, Optional, Union
import httpx

try:
    from google.cloud import secretmanager
except ImportError:
    secretmanager = None

logger = logging.getLogger("site-hunter.asana")

ASANA_API_BASE = "https://app.asana.com/api/1.0"
ASANA_WORKSPACE_GID = os.getenv("ASANA_WORKSPACE_GID", "1216597955100528")


def get_asana_token() -> str:
    """Dynamically resolves Asana PAT from Secret Manager or environment."""
    secret_id = os.getenv("ASANA_SECRET_ID", "asana-access-token")
    default_token = os.getenv(
        "ASANA_PAT",
        "2/1216825739807789/1216879790464104:e0c3a80ab507de26c124f3fcccd4a3e9"
    )
    if secretmanager is not None:
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
    return default_token


def _get_auth_headers() -> Dict[str, str]:
    return {"Authorization": f"Bearer {get_asana_token()}"}


async def upload_attachment(
    task_gid: str,
    file_content: bytes,
    filename: str = "photo.jpg",
    mime_type: str = "image/jpeg"
) -> Dict[str, Any]:
    """
    Strictly follows Asana multipart/form-data requirements:
    - POST https://app.asana.com/api/1.0/attachments
    - parent field MUST be included in form data (the Task GID)
    - file read as binary bytes
    - NO Content-Type: application/json header
    """
    url = f"{ASANA_API_BASE}/attachments"
    files = {
        "file": (filename, file_content, mime_type)
    }
    data = {
        "parent": str(task_gid)
    }
    headers = _get_auth_headers()

    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(url, headers=headers, data=data, files=files)
        if res.status_code not in (200, 201):
            logger.error(f"[Asana] Failed to upload attachment to task {task_gid}: {res.status_code} {res.text}")
            raise RuntimeError(f"Asana attachment upload failed ({res.status_code}): {res.text}")
        return res.json().get("data", {})


async def get_project_sections(project_gid: str) -> List[Dict[str, Any]]:
    url = f"{ASANA_API_BASE}/projects/{project_gid}/sections"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.get(url, headers=_get_auth_headers(), params={"opt_fields": "name,gid"})
        if res.status_code == 200:
            return res.json().get("data", [])
        return []


async def create_section(project_gid: str, name: str) -> Dict[str, Any]:
    url = f"{ASANA_API_BASE}/projects/{project_gid}/sections"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(url, headers=_get_auth_headers(), json={"data": {"name": name}})
        if res.status_code in (200, 201):
            return res.json().get("data", {})
        return {}


async def create_task(
    project_gid: str,
    name: str,
    section_gid: Optional[str] = None,
    notes: str = ""
) -> Dict[str, Any]:
    url = f"{ASANA_API_BASE}/tasks"
    payload = {
        "projects": [str(project_gid)],
        "name": name,
    }
    if notes:
        payload["notes"] = notes
    if ASANA_WORKSPACE_GID:
        payload["workspace"] = str(ASANA_WORKSPACE_GID)

    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(url, headers=_get_auth_headers(), json={"data": payload})
        if res.status_code not in (200, 201):
            raise RuntimeError(f"Failed to create Asana task ({res.status_code}): {res.text}")
        task = res.json().get("data", {})

        # If section specified, move task to section
        if section_gid and task.get("gid"):
            try:
                sec_url = f"{ASANA_API_BASE}/sections/{section_gid}/addTask"
                await client.post(sec_url, headers=_get_auth_headers(), json={"data": {"task": task["gid"]}})
            except Exception as e:
                logger.warning(f"Failed to move task to section: {e}")
        return task


async def create_story(task_gid: str, text: str) -> Dict[str, Any]:
    url = f"{ASANA_API_BASE}/tasks/{task_gid}/stories"
    async with httpx.AsyncClient(timeout=15.0) as client:
        res = await client.post(url, headers=_get_auth_headers(), json={"data": {"text": text}})
        if res.status_code in (200, 201):
            return res.json().get("data", {})
        return {}


def _resolve_image_bytes(image_input: Any) -> Optional[tuple]:
    """
    Returns (bytes, filename, mime_type) from base64 string, local path, or URL.
    """
    if not image_input:
        return None

    if isinstance(image_input, dict):
        val = image_input.get("base64") or image_input.get("url") or image_input.get("path")
        return _resolve_image_bytes(val)

    if isinstance(image_input, bytes):
        return image_input, "photo.jpg", "image/jpeg"

    if isinstance(image_input, str):
        # 1. Base64 data URL
        if image_input.startswith("data:"):
            header, b64_data = image_input.split(",", 1) if "," in image_input else ("", image_input)
            mime = "image/png" if "png" in header else "image/jpeg"
            ext = "png" if "png" in header else "jpg"
            try:
                raw_bytes = base64.b64decode(b64_data)
                return raw_bytes, f"photo.{ext}", mime
            except Exception as e:
                logger.warning(f"Failed to decode base64 data URL: {e}")
                return None

        # 2. Local relative or absolute path on disk
        clean_input = image_input.split("?")[0]
        candidate_paths = [
            clean_input,
            f"/app{clean_input}" if clean_input.startswith("/") else f"/app/{clean_input}",
            f"/home/opc/stack{clean_input}" if clean_input.startswith("/") else f"/home/opc/stack/{clean_input}",
            f"/app/storage/photos/{os.path.basename(clean_input)}",
            f"/home/opc/stack/storage/photos/{os.path.basename(clean_input)}"
        ]
        for path in candidate_paths:
            if os.path.exists(path) and os.path.isfile(path):
                with open(path, "rb") as f:
                    content = f.read()
                ext = os.path.splitext(path)[1].lower()
                mime = "image/png" if ext == ".png" else "image/jpeg"
                filename = os.path.basename(path)
                return content, filename, mime

        # 3. Raw base64 string without data prefix
        if len(image_input) > 200 and re.match(r'^[A-Za-z0-9+/=]+$', image_input[:100]):
            try:
                raw_bytes = base64.b64decode(image_input)
                return raw_bytes, "photo.jpg", "image/jpeg"
            except Exception:
                pass

    return None


async def sync_device_payload_to_asana(job: Dict[str, Any], device: Dict[str, Any]) -> Dict[str, Any]:
    """
    Creates an Asana task, uploads nameplate & supporting photo attachments, and posts specs.
    """
    project_gid = (
        device.get("asana_project_gid") or
        device.get("asanaProjectGid") or
        job.get("asana_project_gid") or
        job.get("asana", {}).get("projectGid") or
        job.get("asanaProjectGid")
    )
    if not project_gid:
        raise ValueError("Missing Asana Project GID for sync")

    category = device.get("category") or device.get("equipment_type") or "HVAC Equipment"
    subcategory = device.get("subcategory") or device.get("device_name") or device.get("name") or "Equipment Nameplate"
    eq_num = device.get("equipment_number") or device.get("equipmentNumber") or "1"
    nameplate_label = device.get("nameplate_label") or device.get("nameplateLabel") or ""
    task_name = f"{eq_num} - {subcategory}" if subcategory else f"Device #{eq_num}"
    if nameplate_label and nameplate_label not in task_name:
        task_name += f" ({nameplate_label})"

    # Find or match section
    sections = await get_project_sections(str(project_gid))
    section_match = next((s for s in sections if s.get("name", "").lower() == category.lower()), None)
    if not section_match and sections:
        section_match = next((s for s in sections if category.lower() in s.get("name", "").lower() or s.get("name", "").lower() in category.lower()), None)

    section_gid = section_match.get("gid") if section_match else None

    # Create task
    task = await create_task(
        project_gid=str(project_gid),
        name=task_name,
        section_gid=section_gid,
    )
    task_gid = task.get("gid")
    if not task_gid:
        raise RuntimeError("Asana task creation did not return a GID")

    logger.info(f"[Asana] Created task '{task_name}' (GID: {task_gid}) in project {project_gid}")

    # Build description story
    lines = [
        "Site Hunter Sync — Equipment Record",
        f"Equipment #: {eq_num}",
        f"Category: {category}",
        f"Subcategory: {subcategory}",
    ]
    for field, label in [
        ("manufacturer", "Manufacturer"),
        ("model_number", "Model Number"),
        ("serial_number", "Serial Number"),
        ("tonnage", "Tonnage"),
        ("voltage", "Voltage"),
        ("mca", "Min Circuit Ampacity (MCA)"),
        ("mocp", "Max Overcurrent Protection (MOCP)"),
        ("refrigerant_type", "Refrigerant"),
        ("compressor_count", "Compressors"),
        ("fan_count", "Fans"),
        ("notes", "Notes"),
    ]:
        val = device.get(field) or device.get(field.replace("_", ""))
        if val is not None and str(val).strip() != "":
            lines.append(f"{label}: {val}")

    story_text = "\n".join(lines)
    story = await create_story(task_gid, story_text)

    uploaded_attachments = []

    # Upload Primary Nameplate Photo
    primary_img = device.get("image") or device.get("image_path") or device.get("image_url")
    resolved = _resolve_image_bytes(primary_img)
    if resolved:
        img_bytes, fname, mime = resolved
        safe_fname = f"Nameplate_{eq_num}_{fname}"
        logger.info(f"[Asana] Uploading primary photo ({len(img_bytes)} bytes) to task {task_gid}")
        try:
            att = await upload_attachment(task_gid, img_bytes, filename=safe_fname, mime_type=mime)
            if att.get("gid"):
                uploaded_attachments.append(att.get("gid"))
        except Exception as attach_err:
            logger.error(f"[Asana] Primary photo upload failed: {attach_err}")

    # Upload Supporting Photos
    supporting = device.get("supportingPhotos") or device.get("supporting_photos") or []
    for idx, p in enumerate(supporting):
        p_img = p.get("base64") or p.get("url") or p.get("path")
        p_label = p.get("label") or f"supporting_{idx+1}"
        p_resolved = _resolve_image_bytes(p_img)
        if p_resolved:
            p_bytes, p_fname, p_mime = p_resolved
            safe_p_fname = f"{p_label}_{idx+1}_{p_fname}"
            try:
                att = await upload_attachment(task_gid, p_bytes, filename=safe_p_fname, mime_type=p_mime)
                if att.get("gid"):
                    uploaded_attachments.append(att.get("gid"))
            except Exception as sup_err:
                logger.error(f"[Asana] Supporting photo {safe_p_fname} upload failed: {sup_err}")

    return {
        "status": "success",
        "action": "created",
        "projectGid": project_gid,
        "taskGid": task_gid,
        "storyGid": story.get("gid") if story else None,
        "taskName": task_name,
        "attachments": uploaded_attachments,
    }


async def sync_photos_payload_to_asana(
    project_gid: str,
    category: str,
    subcategory: Optional[str],
    photos: List[Dict[str, Any]],
    job_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Creates a grouped task in Asana for ad-hoc photo surveys and uploads attachments.
    """
    sections = await get_project_sections(str(project_gid))
    section_match = next((s for s in sections if s.get("name", "").lower() == category.lower()), None)
    if not section_match and sections:
        section_match = next((s for s in sections if category.lower() in s.get("name", "").lower() or s.get("name", "").lower() in category.lower()), None)

    section_gid = section_match.get("gid") if section_match else None
    task_name = f"Photos - {category}"
    if subcategory:
        task_name += f" - {subcategory}"

    task = await create_task(
        project_gid=str(project_gid),
        name=task_name,
        section_gid=section_gid,
        notes=f"Uploaded {len(photos)} survey photo(s) from Site Hunter"
    )
    task_gid = task.get("gid")
    if not task_gid:
        raise RuntimeError("Asana task creation did not return a GID")

    uploaded = []
    for idx, p in enumerate(photos):
        p_img = p.get("base64") or p.get("url") or p.get("path")
        p_label = p.get("label") or f"photo_{idx+1}"
        resolved = _resolve_image_bytes(p_img)
        if resolved:
            p_bytes, p_fname, p_mime = resolved
            safe_fname = f"{p_label}_{idx+1}_{p_fname}"
            try:
                att = await upload_attachment(task_gid, p_bytes, filename=safe_fname, mime_type=p_mime)
                if att.get("gid"):
                    uploaded.append(att.get("gid"))
            except Exception as e:
                logger.error(f"[Asana] Failed to upload photo {safe_fname}: {e}")

    return {
        "status": "success",
        "action": "created",
        "projectGid": project_gid,
        "taskGid": task_gid,
        "taskName": task_name,
        "attachments": uploaded,
    }
