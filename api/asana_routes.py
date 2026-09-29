# File: api/asana_routes.py

import os
import logging
from typing import Optional, List, Dict, Any
import httpx
from fastapi import APIRouter, HTTPException
from google.cloud import secretmanager

logger = logging.getLogger("asana_routes")

router = APIRouter()

# Initialize the GCP Secret Manager Client
sm_client = secretmanager.SecretManagerServiceClient()

# Ensure the GCP Project ID is available in the environment variables
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "first-project-db-81b5e")


def get_secret(secret_id: str, version_id: str = "latest") -> str:
    """Fetches a secret payload from Google Secret Manager with resilient fallbacks."""
    if not GCP_PROJECT_ID:
        raise ValueError("GCP_PROJECT_ID environment variable is not set.")
    
    # 1. Primary retrieval from Google Secret Manager
    try:
        name = f"projects/{GCP_PROJECT_ID}/secrets/{secret_id}/versions/{version_id}"
        response = sm_client.access_secret_version(request={"name": name})
        val = response.payload.data.decode("UTF-8").strip()
        # Handle known revoked token in ASANA_PAT by checking valid asana-access-token secret in GCP Secret Manager
        if secret_id == "ASANA_PAT" and val.endswith("41fd19cbb2e2"):
            try:
                alt_name = f"projects/{GCP_PROJECT_ID}/secrets/asana-access-token/versions/{version_id}"
                alt_resp = sm_client.access_secret_version(request={"name": alt_name})
                val = alt_resp.payload.data.decode("UTF-8").strip()
            except Exception:
                pass
        if val:
            return val
    except Exception as e:
        logger.debug(f"Direct Secret Manager fetch for {secret_id} note: {e}")

    # 2. Check GCP Secret Manager alternate aliases
    alias_map = {
        "ASANA_PAT": ["asana-access-token", "ASANA_ACCESS_TOKEN", "asana_pat"],
        "ASANA_PROJECT_ID": ["asana-project-id", "asana_project_id", "ASANA_PIPELINE_PROJECT_ID"],
        "ASANA_WORKSPACE_GID": ["asana-workspace-gid", "asana_workspace_gid"]
    }
    for alt_id in alias_map.get(secret_id, []):
        try:
            name = f"projects/{GCP_PROJECT_ID}/secrets/{alt_id}/versions/{version_id}"
            response = sm_client.access_secret_version(request={"name": name})
            val = response.payload.data.decode("UTF-8").strip()
            if val:
                return val
        except Exception:
            pass

    # 3. Fallback to environment variables
    env_val = os.getenv(secret_id)
    if env_val:
        return env_val.strip()

    if secret_id == "ASANA_PROJECT_ID":
        return os.getenv("ASANA_WORKSPACE_GID") or "1216953065117558"
    if secret_id == "ASANA_WORKSPACE_GID":
        return "1216597955100528"

    raise ValueError(f"Secret {secret_id} could not be resolved from GCP Secret Manager or environment.")


@router.get("/api/asana/jobs")
@router.get("/asana/jobs")
async def get_asana_jobs(
    project_id: Optional[str] = None,
    scope: Optional[str] = "all"  # 'all' | 'projects' | 'tasks'
):
    """
    Fetches active pipeline tasks and workspace site projects from Asana.
    Paginates automatically through all available records to ensure complete job coverage.
    """
    try:
        asana_pat = get_secret("ASANA_PAT")
        workspace_gid = os.getenv("ASANA_WORKSPACE_GID") or "1216597955100528"
        pipeline_project_id = project_id or os.getenv("ASANA_PROJECT_ID") or "1216953065117558"
    except Exception as e:
        logger.error(f"Secret Manager Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve Asana credentials from GCP Secret Manager.")

    headers = {
        "Authorization": f"Bearer {asana_pat}",
        "Accept": "application/json"
    }

    formatted_jobs: List[Dict[str, Any]] = []
    seen_ids = set()

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Case A: User explicitly requested a single specific project's tasks
        if project_id:
            url = f"https://app.asana.com/api/1.0/projects/{project_id}/tasks"
            params: Optional[Dict[str, Any]] = {
                "opt_fields": "name,notes,completed,custom_fields",
                "completed_since": "now",
                "limit": 100
            }
            while url:
                resp = await client.get(url, headers=headers, params=params if "?" not in url else None)
                if resp.status_code != 200:
                    raise HTTPException(status_code=resp.status_code, detail=f"Failed to fetch tasks for project {project_id} from Asana.")
                body = resp.json()
                for task in body.get("data", []):
                    if not task.get("completed") and task["gid"] not in seen_ids:
                        seen_ids.add(task["gid"])
                        formatted_jobs.append({
                            "id": task["gid"],
                            "job_name": task["name"],
                            "source": "asana",
                            "notes": task.get("notes", "") or "Asana Task",
                            "type": "task"
                        })
                next_page = body.get("next_page")
                url = next_page.get("uri") if next_page else None
            return {"jobs": formatted_jobs, "total": len(formatted_jobs)}

        # Case B: Pull all workspace jobs (all active site projects + pipeline tasks)
        if scope in ("all", "projects"):
            url = f"https://app.asana.com/api/1.0/workspaces/{workspace_gid}/projects"
            params = {
                "opt_fields": "name,notes,archived",
                "limit": 100
            }
            while url:
                try:
                    resp = await client.get(url, headers=headers, params=params if "?" not in url else None)
                    if resp.status_code != 200:
                        logger.warning(f"Failed to fetch projects page: {resp.status_code}")
                        break
                    body = resp.json()
                    for p in body.get("data", []):
                        if not p.get("archived") and p["gid"] not in seen_ids:
                            seen_ids.add(p["gid"])
                            formatted_jobs.append({
                                "id": p["gid"],
                                "job_name": p["name"],
                                "source": "asana",
                                "notes": p.get("notes", "") or "Asana Site Project",
                                "type": "project"
                            })
                    next_page = body.get("next_page")
                    url = next_page.get("uri") if next_page else None
                except Exception as e_proj:
                    logger.warning(f"Error fetching Asana projects: {e_proj}")
                    break

        if scope in ("all", "tasks") and pipeline_project_id:
            url = f"https://app.asana.com/api/1.0/projects/{pipeline_project_id}/tasks"
            params = {
                "opt_fields": "name,notes,completed,custom_fields",
                "completed_since": "now",
                "limit": 100
            }
            while url:
                try:
                    resp = await client.get(url, headers=headers, params=params if "?" not in url else None)
                    if resp.status_code != 200:
                        logger.warning(f"Failed to fetch pipeline tasks page: {resp.status_code}")
                        break
                    body = resp.json()
                    for task in body.get("data", []):
                        if not task.get("completed") and task["gid"] not in seen_ids:
                            seen_ids.add(task["gid"])
                            formatted_jobs.append({
                                "id": task["gid"],
                                "job_name": task["name"],
                                "source": "asana",
                                "notes": task.get("notes", "") or "Asana Pipeline Task",
                                "type": "pipeline_task"
                            })
                    next_page = body.get("next_page")
                    url = next_page.get("uri") if next_page else None
                except Exception as e_task:
                    logger.warning(f"Error fetching pipeline tasks: {e_task}")
                    break

        return {"jobs": formatted_jobs, "total": len(formatted_jobs)}
