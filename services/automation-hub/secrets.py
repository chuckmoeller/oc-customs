import os
from google.cloud import secretmanager
from functools import lru_cache

project_id = os.getenv("GCP_PROJECT_ID", "first-project-db-81b5e")

@lru_cache(maxsize=128)
def get_secret(secret_id: str, version: str = "latest") -> str:
    """Fetch a secret from Google Secret Manager with caching."""
    try:
        client = secretmanager.SecretManagerServiceClient()
        name = f"projects/{project_id}/secrets/{secret_id}/versions/{version}"
        response = client.access_secret_version(request={"name": name})
        return response.payload.data.decode("UTF-8")
    except Exception as e:
        raise Exception(f"Failed to fetch secret {secret_id}: {e}")

def get_smtp_user() -> str:
    return os.getenv("SMTP_USER") or "chuck@madisonenergygroup.com"

def get_ms_graph_token() -> str:
    """Get MS Graph access token for sending emails via Microsoft Graph API."""
    return os.getenv("MS_GRAPH_TOKEN") or get_secret("ms-graph-token")

def get_slack_token() -> str:
    return os.getenv("SLACK_BOT_TOKEN") or get_secret("slack-bot-token")

def get_asana_pat() -> str:
    return os.getenv("ASANA_PAT") or get_secret("ASANA_PAT")

def get_anthropic_key() -> str:
    return os.getenv("ANTHROPIC_API_KEY") or get_secret("ANTHROPIC_API_KEY")

def get_google_api_key() -> str:
    return os.getenv("GOOGLE_API_KEY") or get_secret("GOOGLE_CUSTOM_SEARCH_KEY")
