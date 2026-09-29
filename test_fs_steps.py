import sys
import firebase_admin
from firebase_admin import credentials, firestore

print("Step 1: Loading certificate...", flush=True)
cred = credentials.Certificate("/home/opc/stack/services/site-hunter/service-account-key.json")

print("Step 2: Initializing app...", flush=True)
app = firebase_admin.initialize_app(cred)

print("Step 3: Getting firestore client...", flush=True)
db = firestore.client()

print("Step 4: Trying to stream from 'calibrator_jobs'...", flush=True)
try:
    for doc in db.collection("calibrator_jobs").limit(1).stream():
        print(f"Found calibrator_jobs doc: {doc.id} => {doc.to_dict()}", flush=True)
except Exception as e:
    print(f"Error on calibrator_jobs: {e}", flush=True)

print("Step 5: Trying to stream from 'calibrations'...", flush=True)
try:
    for doc in db.collection("calibrations").limit(1).stream():
        print(f"Found calibrations doc: {doc.id} => {doc.to_dict()}", flush=True)
except Exception as e:
    print(f"Error on calibrations: {e}", flush=True)

print("Step 6: Trying to stream from 'jobs'...", flush=True)
try:
    for doc in db.collection("jobs").limit(1).stream():
        print(f"Found jobs doc: {doc.id}", flush=True)
except Exception as e:
    print(f"Error on jobs: {e}", flush=True)

print("Done!", flush=True)
