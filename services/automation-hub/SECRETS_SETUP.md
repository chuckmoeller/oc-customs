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
  --data-file=- <<< "chuck@madisonenergygroup.com"

gcloud secrets create smtp-password --replication-policy="automatic" \
  --data-file=- <<< "your-gmail-app-password"

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
  --member=serviceAccount:YOUR-SERVICE-ACCOUNT@first-project-db-81b5e.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

Repeat for all secrets.

## Local Development

For local development, set environment variables instead:

```bash
export SMTP_USER="chuck@madisonenergygroup.com"
export SMTP_PASSWORD="your-gmail-app-password"
export SLACK_BOT_TOKEN="xoxb-your-slack-token"
export ASANA_PAT="your-asana-pat"
export ANTHROPIC_API_KEY="sk-ant-your-key"
export GOOGLE_API_KEY="your-gemini-key"
export GCP_PROJECT_ID="first-project-db-81b5e"
```

The `secrets.py` module checks environment variables first, then falls back to Secret Manager.

## Cloud Run Deployment

Cloud Run automatically uses ADC, so no additional setup is needed. Ensure the service account has Secret Manager access.

Deploy with:
```bash
gcloud run deploy automation-hub \
  --source ./services/automation-hub \
  --platform managed \
  --region us-central1 \
  --set-env-vars GCP_PROJECT_ID=first-project-db-81b5e
```

## Gmail App Passwords

To use Gmail SMTP, generate an app password:
1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Create App Passwords → Select Mail → Select Device
4. Use the 16-character password as SMTP_PASSWORD
