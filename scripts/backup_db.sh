#!/bin/bash
BACKUP_DIR="/home/opc/stack/data/backups"
DATE=$(date +"%Y%m%d_%H%M%S")

# Extract the correct database user from the running container
DB_USER=$(docker exec postgres_db printenv POSTGRES_USER)

# Dump both databases using the correct user
docker exec postgres_db pg_dump -U "$DB_USER" -F c site_hunter > "$BACKUP_DIR/site_hunter_$DATE.dump"
docker exec postgres_db pg_dump -U "$DB_USER" -F c calibrator > "$BACKUP_DIR/calibrator_$DATE.dump"

# Keep only the last 7 days of backups
find "$BACKUP_DIR" -type f -name "*.dump" -mtime +7 -delete
