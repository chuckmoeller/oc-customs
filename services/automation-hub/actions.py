import os
import logging
import json
from typing import Dict, Any
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import base64

import aiohttp
from anthropic import AsyncAnthropic

from secrets import (
    get_smtp_user, get_ms_graph_token, get_slack_token,
    get_asana_pat, get_anthropic_key, get_google_api_key
)

logger = logging.getLogger(__name__)

class ActionExecutor:
    def __init__(self, redis_client):
        self.redis = redis_client

    async def execute(self, action, context: Dict[str, Any]) -> Dict[str, Any]:
        from models import ActionType

        if action.type == ActionType.SEND_EMAIL:
            return await self.send_email(action.params)
        elif action.type == ActionType.SEND_SLACK:
            return await self.send_slack(action.params)
        elif action.type == ActionType.CREATE_TASK:
            return await self.create_task(action.params)
        elif action.type == ActionType.ENRICH:
            return await self.enrich(action.params, context)
        else:
            raise ValueError(f"Unknown action type: {action.type}")

    async def send_email(self, params: Dict[str, Any]) -> Dict[str, Any]:
        recipients = params.get("recipients", [])
        subject = params.get("subject", "")
        body = params.get("body", "")

        if not recipients or not subject or not body:
            raise ValueError("Missing recipients, subject, or body")

        try:
            ms_graph_token = get_ms_graph_token()
            sender = get_smtp_user()

            # Build Microsoft Graph email message
            message = {
                "message": {
                    "subject": subject,
                    "body": {
                        "contentType": "text",
                        "content": body
                    },
                    "toRecipients": [
                        {"emailAddress": {"address": recipient}} for recipient in recipients
                    ],
                    "from": {
                        "emailAddress": {"address": sender}
                    }
                },
                "saveToSentItems": True
            }

            async with aiohttp.ClientSession() as session:
                headers = {
                    "Authorization": f"Bearer {ms_graph_token}",
                    "Content-Type": "application/json"
                }

                async with session.post(
                    "https://graph.microsoft.com/v1.0/me/sendMail",
                    json=message,
                    headers=headers
                ) as resp:
                    if resp.status not in (200, 202):
                        error_text = await resp.text()
                        raise Exception(f"MS Graph error {resp.status}: {error_text}")

            logger.info(f"Email sent to {recipients} via MS Graph")
            return {"status": "sent", "recipients": recipients, "method": "msgraph"}

        except Exception as e:
            logger.error(f"Email send failed: {e}")
            raise

    async def send_slack(self, params: Dict[str, Any]) -> Dict[str, Any]:
        channel = params.get("channel")
        message = params.get("message")
        thread_ts = params.get("thread_ts")

        if not channel or not message:
            raise ValueError("Missing channel or message")

        try:
            slack_token = get_slack_token()

            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {slack_token}"}
                payload = {
                    "channel": channel,
                    "text": message
                }
                if thread_ts:
                    payload["thread_ts"] = thread_ts

                async with session.post(
                    "https://slack.com/api/chat.postMessage",
                    json=payload,
                    headers=headers
                ) as resp:
                    result = await resp.json()
                    if not result.get("ok"):
                        raise Exception(f"Slack error: {result.get('error')}")

            logger.info(f"Slack message sent to {channel}")
            return {"status": "sent", "channel": channel, "ts": result.get("ts")}

        except Exception as e:
            logger.error(f"Slack send failed: {e}")
            raise

    async def create_task(self, params: Dict[str, Any]) -> Dict[str, Any]:
        project_gid = params.get("asana_project_gid")
        title = params.get("title")
        description = params.get("description")
        assignee_gid = params.get("assignee_gid")

        if not project_gid or not title:
            raise ValueError("Missing project_gid or title")

        try:
            asana_token = get_asana_pat()

            async with aiohttp.ClientSession() as session:
                headers = {
                    "Authorization": f"Bearer {asana_token}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "data": {
                        "name": title,
                        "projects": [project_gid]
                    }
                }
                if description:
                    payload["data"]["notes"] = description
                if assignee_gid:
                    payload["data"]["assignee"] = assignee_gid

                async with session.post(
                    "https://app.asana.com/api/1.0/tasks",
                    json=payload,
                    headers=headers
                ) as resp:
                    result = await resp.json()
                    if "errors" in result:
                        raise Exception(f"Asana error: {result['errors']}")

            task_gid = result["data"]["gid"]
            logger.info(f"Asana task created: {task_gid}")
            return {"status": "created", "task_gid": task_gid}

        except Exception as e:
            logger.error(f"Asana task creation failed: {e}")
            raise

    async def enrich(self, params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        prompt = params.get("prompt")
        use_gemini = params.get("use_gemini", False)

        if not prompt:
            raise ValueError("Missing enrichment prompt")

        try:
            if use_gemini:
                return await self._enrich_with_gemini(prompt, context)
            else:
                return await self._enrich_with_claude(prompt, context)

        except Exception as e:
            logger.error(f"Enrichment failed: {e}")
            raise

    async def _enrich_with_claude(self, prompt: str, context: Dict[str, Any]) -> Dict[str, Any]:
        api_key = get_anthropic_key()
        client = AsyncAnthropic(api_key=api_key)

        full_prompt = f"{prompt}\n\nContext:\n{context}"

        message = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=1024,
            messages=[
                {"role": "user", "content": full_prompt}
            ]
        )

        enriched_text = message.content[0].text
        logger.info("Claude enrichment completed")
        return {"status": "enriched", "model": "claude", "result": enriched_text}

    async def _enrich_with_gemini(self, prompt: str, context: Dict[str, Any]) -> Dict[str, Any]:
        logger.warning("Gemini integration not yet implemented, falling back to Claude")
        return await self._enrich_with_claude(prompt, context)
