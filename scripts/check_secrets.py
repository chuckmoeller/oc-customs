import os
from google.cloud import secretmanager

client = secretmanager.SecretManagerServiceClient()
project_id = os.getenv('GCP_PROJECT_ID', 'first-project-db-81b5e')
parent = f'projects/{project_id}'
try:
    for s in client.list_secrets(request={'parent': parent}):
        print('Secret:', s.name)
except Exception as e:
    print('Error:', e)
