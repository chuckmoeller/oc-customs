#!/usr/bin/env python3
COMPOSE_FILE = "/home/opc/stack/docker-compose.yml"

with open(COMPOSE_FILE, "r") as f:
    content = f.read()

target = "volumes:\n      - ./secrets/gcp-key.json:/app/secrets/gcp-key.json:ro\n      - ./storage/photos:/app/storage/photos"
replacement = "volumes:\n      - ./secrets/gcp-key.json:/app/secrets/gcp-key.json:ro\n      - ./storage/photos:/app/storage/photos\n      - ./services/site-hunter/app.py:/app/app.py"

if "./services/site-hunter/app.py:/app/app.py" not in content and target in content:
    content = content.replace(target, replacement)
    with open(COMPOSE_FILE, "w") as f:
        f.write(content)
    print("SUCCESS: Bound app.py into site-hunter container in docker-compose.yml")
else:
    print("INFO: Already present or target not matched")
