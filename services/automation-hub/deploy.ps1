gcloud run deploy automation-hub `
  --source . `
  --platform managed `
  --region us-central1 `
  --allow-unauthenticated `
  --clear-base-image `
  --set-env-vars GCP_PROJECT_ID=first-project-db-81b5e
