# Google Secret Manager Setup

The automation-hub service uses Google Secret Manager to securely store and retrieve credentials.

## Prerequisites

- GCP project with Secret Manager API enabled
- Service account with Secret Manager Secret Accessor role
- Application Default Credentials (ADC) configured

## Create Secrets in Google Secret Manager

Use the `gcloud` CLI to create each secret:

```bash
gcloud secrets create smtp-user --replication-policy="automatic" \
  --data-file=- <<< "your-email@gmail.com"

gcloud secrets create smtp-password --replication-policy="automatic" \
  --data-file=- <<< "your-app-password"

gcloud secrets create slack-bot-token --replication-policy="automatic" \
  --data-file=- <<< "xoxb-your-slack-token"

gcloud secrets create asana-pat --replication-policy="automatic" \
  --data-file=- <<< "your-asana-pat-token"

gcloud secrets create anthropic-api-key --replication-policy="automatic" \
  --data-file=- <<< "sk-ant-your-anthropic-key"

gcloud secrets create google-api-key --replication-policy="automatic" \
  --data-file=- <<< "your-gemini-api-key"
```

## Grant Service Account Access

If using a service account, grant it the `roles/secretmanager.secretAccessor` role:

```bash
gcloud secrets add-iam-policy-binding smtp-user \
  --member=serviceAccount:YOUR-SERVICE-ACCOUNT@PROJECT.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

Repeat for all secrets.

## Local Development

For local development, set environment variables instead:

```bash
export SMTP_USER="your-email@gmail.com"
export SMTP_PASSWORD="your-app-password"
export SLACK_BOT_TOKEN="xoxb-your-slack-token"
export ASANA_PAT="your-asana-pat"
export ANTHROPIC_API_KEY="sk-ant-your-key"
export GOOGLE_API_KEY="your-gemini-key"
export GCP_PROJECT_ID="your-gcp-project"
```

The `secrets.py` module checks environment variables first, then falls back to Secret Manager.

## Cloud Run Deployment

Cloud Run automatically uses ADC, so no additional setup is needed. Ensure the service account has Secret Manager access.

Deploy with:
```bash
gcloud run deploy automation-hub \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars GCP_PROJECT_ID=your-project-id
```
