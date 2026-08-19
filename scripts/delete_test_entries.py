#!/usr/bin/env python3
"""Delete all test entries from Firestore.

Usage:
    .venv/bin/python scripts/delete_test_entries.py
"""

import os
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


def init_firebase():
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
    if not Path(cred_path).exists():
        print(
            f"Service account file not found: {cred_path}\n"
            "Download one from Firebase Console → Project settings → Service accounts."
        )
        sys.exit(1)

    cred = credentials.Certificate(cred_path)
    project_id = os.environ.get("FIREBASE_PROJECT_ID") or cred.project_id
    firebase_admin.initialize_app(cred, {"projectId": project_id})
    return firestore.client()


def main():
    db = init_firebase()
    docs = db.collection("entries").where("isTest", "==", True).stream()
    deleted = 0
    for doc in docs:
        doc.reference.delete()
        deleted += 1
    print(f"Deleted {deleted} test entries.")


if __name__ == "__main__":
    main()
