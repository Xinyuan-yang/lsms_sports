#!/usr/bin/env python3
"""Deploy firestore.rules to the Firebase project.

Usage:
    .venv/bin/python scripts/deploy_rules.py
"""

import os
import sys
from pathlib import Path

import google.auth.transport.requests
import requests
from google.oauth2 import service_account


RULES_FILE = Path(__file__).parent.parent / "firestore.rules"
SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]


def get_access_token(project_id: str):
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
    if not Path(cred_path).exists():
        print(f"Service account file not found: {cred_path}")
        sys.exit(1)

    credentials = service_account.Credentials.from_service_account_file(
        cred_path, scopes=SCOPES
    )
    credentials = credentials.with_claims({"sub": credentials.service_account_email})
    request = google.auth.transport.requests.Request()
    credentials.refresh(request)
    return credentials.token


def deploy_rules(project_id: str, rules_source: str, token: str):
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # 1. Create ruleset
    ruleset_url = f"https://firebaserules.googleapis.com/v1/projects/{project_id}/rulesets"
    ruleset_payload = {"source": {"files": [{"name": "firestore.rules", "content": rules_source}]}}
    response = requests.post(ruleset_url, headers=headers, json=ruleset_payload)
    if not response.ok:
        print(f"Failed to create ruleset: {response.status_code} {response.text}")
        sys.exit(1)

    ruleset_name = response.json()["name"]
    print(f"Created ruleset: {ruleset_name}")

    # 2. Release ruleset to cloud.firestore
    release_url = f"https://firebaserules.googleapis.com/v1/projects/{project_id}/releases"
    release_payload = {
        "name": f"projects/{project_id}/releases/cloud.firestore",
        "rulesetName": ruleset_name,
    }
    response = requests.post(release_url, headers=headers, json=release_payload)
    if not response.ok:
        print(f"Failed to release ruleset: {response.status_code} {response.text}")
        sys.exit(1)

    print("Firestore security rules deployed successfully.")


def main():
    project_id = os.environ.get("FIREBASE_PROJECT_ID")
    if not project_id:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
        if Path(cred_path).exists():
            import json

            with open(cred_path) as f:
                project_id = json.load(f).get("project_id")

    if not project_id:
        print("Could not determine Firebase project ID.")
        sys.exit(1)

    rules_source = RULES_FILE.read_text()
    token = get_access_token(project_id)
    deploy_rules(project_id, rules_source, token)


if __name__ == "__main__":
    main()
