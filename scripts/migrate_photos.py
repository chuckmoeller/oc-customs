import os
import sys
import uuid
import requests
from urllib.parse import unquote, urlparse
from sqlalchemy.orm import Session

# Ensure ~/stack is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal 
from app.db_models import Scan, SupportingPhoto 

STORAGE_DIR = os.getenv(
    "STORAGE_DIR",
    "/app/storage/photos"
    if os.path.exists("/.dockerenv")
    else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "storage", "photos"))
)
os.makedirs(STORAGE_DIR, exist_ok=True)

def download_image(url: str, save_dir: str) -> str:
    """Downloads an image from a URL and returns the local relative path."""
    if not url or not url.startswith("http"):
        return url 
        
    try:
        parsed_url = urlparse(url)
        path = unquote(parsed_url.path)
        ext = os.path.splitext(path)[1]
        if not ext or len(ext) > 5:
            ext = ".jpg"
            
        file_uuid = uuid.uuid5(uuid.NAMESPACE_URL, url)
        filename = f"{file_uuid}{ext}"
        local_path = os.path.join(save_dir, filename)
        
        # If already exists and is non-empty, avoid duplicate download
        if os.path.exists(local_path) and os.path.getsize(local_path) > 0:
            return f"/storage/photos/{filename}"

        response = requests.get(url, stream=True, timeout=15)
        response.raise_for_status()
        
        with open(local_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
                
        return f"/storage/photos/{filename}"
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        return url

def migrate_table_photos(session: Session, model, url_column_name: str):
    """Iterates through a table, downloads images, and updates the DB."""
    records = session.query(model).all()
    updated_count = 0
    
    for record in records:
        current_url = getattr(record, url_column_name)
        if current_url and current_url.startswith("http"):
            new_local_path = download_image(current_url, STORAGE_DIR)
            
            if new_local_path != current_url:
                setattr(record, url_column_name, new_local_path)
                updated_count += 1
                
    session.commit()
    print(f"Successfully migrated {updated_count} photos for {model.__name__}.")

def main():
    print(f"Target Storage Directory: {STORAGE_DIR}")
    db = SessionLocal()
    try:
        # AGY: Ensure these column names match what you found in db_models.py
        # Scan model uses: 'image_url'
        print("Starting Scan photos migration...")
        migrate_table_photos(db, Scan, "image_url") 
        
        # SupportingPhoto model uses: 'url' (updated from template's 'photo_url')
        print("Starting Supporting Photos migration...")
        migrate_table_photos(db, SupportingPhoto, "url")
    finally:
        db.close()
        print("Binary migration complete.")

if __name__ == "__main__":
    main()
