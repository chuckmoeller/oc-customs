# Microsoft Graph Setup for Email

The automation-hub uses Microsoft Graph API to send emails via Office 365/Outlook.

## Prerequisites

- Microsoft Graph API access token (with Mail.Send permission)
- Access token stored in Google Secret Manager or environment variable

## Get MS Graph Access Token

Option 1: Already have a token in Secret Manager (existing)
- Use the existing `ms-graph-token` secret

Option 2: Generate a new token via Azure AD OAuth
```bash
# Register app in Azure AD
# Grant Mail.Send permission
# Use Client Credentials flow to get token
# Store token as secret in Secret Manager
```

## Store Token in Google Secret Manager

If you need to update or create the token:

```bash
gcloud secrets create ms-graph-token \
  --replication-policy="automatic" \
  --data-file=- <<< "your-ms-graph-access-token"

# Or update existing:
gcloud secrets versions add ms-graph-token \
  --data-file=- <<< "your-new-access-token"
```

Grant service account access:
```bash
gcloud secrets add-iam-policy-binding ms-graph-token \
  --member=serviceAccount:automation-hub@first-project-db-81b5e.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

## Local Development

Set environment variable:
```bash
export MS_GRAPH_TOKEN="your-access-token"
```

## Email Sending

Emails are sent via:
- **API**: `https://graph.microsoft.com/v1.0/me/sendMail`
- **From**: chuck@madisonenergygroup.com (from SMTP_USER)
- **Method**: POST with Bearer token auth

Token must have `Mail.Send` permission on the mailbox.

## Token Refresh

MS Graph tokens expire. For production, implement token refresh:
1. Store refresh token in Secret Manager
2. Call Azure AD token endpoint before expiry
3. Update `ms-graph-token` secret with new token

Or configure Managed Identity on Cloud Run for automatic token handling.
