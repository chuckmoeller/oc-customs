import os
import logging
from typing import Dict, Any
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiohttp
from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)

class ActionExecutor:
    def __init__(self, redis_client):
        self.redis = redis_client
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER")
        self.smtp_password = os.getenv("SMTP_PASSWORD")
        self.slack_token = os.getenv("SLACK_BOT_TOKEN")
        self.asana_token = os.getenv("ASANA_PAT")
        self.claude_api_key = os.getenv("ANTHROPIC_API_KEY")
        self.gemini_api_key = os.getenv("GOOGLE_API_KEY")

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
            msg = MIMEMultipart()
            msg["From"] = self.smtp_user
            msg["To"] = ", ".join(recipients)
            msg["Subject"] = subject

            msg.attach(MIMEText(body, "plain"))

            async with aiosmtplib.SMTP(hostname=self.smtp_host, port=self.smtp_port) as smtp:
                await smtp.login(self.smtp_user, self.smtp_password)
                await smtp.send_message(msg)

            logger.info(f"Email sent to {recipients}")
            return {"status": "sent", "recipients": recipients}

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
            async with aiohttp.ClientSession() as session:
                headers = {"Authorization": f"Bearer {self.slack_token}"}
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
            async with aiohttp.ClientSession() as session:
                headers = {
                    "Authorization": f"Bearer {self.asana_token}",
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
            if use_gemini and self.gemini_api_key:
                return await self._enrich_with_gemini(prompt, context)
            else:
                return await self._enrich_with_claude(prompt, context)

        except Exception as e:
            logger.error(f"Enrichment failed: {e}")
            raise

    async def _enrich_with_claude(self, prompt: str, context: Dict[str, Any]) -> Dict[str, Any]:
        client = AsyncAnthropic(api_key=self.claude_api_key)

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
