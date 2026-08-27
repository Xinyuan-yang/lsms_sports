#!/usr/bin/env python3
"""Update the destination in Firestore config/global.

Usage:
    .venv/bin/python scripts/update_destination.py
"""

import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


def init_firebase():
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
    if not Path(cred_path).exists():
        print(f"Service account file not found: {cred_path}")
        sys.exit(1)

    cred = credentials.Certificate(cred_path)
    project_id = os.environ.get("FIREBASE_PROJECT_ID") or cred.project_id
    firebase_admin.initialize_app(cred, {"projectId": project_id})
    return firestore.client()


def main():
    db = init_firebase()
    db.collection("config").document("global").update(
        {
            "destination": {
                "name": "New Delhi, India",
                "lat": 28.6139,
                "lng": 77.2090,
            }
        }
    )
    print("Destination updated to New Delhi, India")


if __name__ == "__main__":
    main()
