#!/usr/bin/env python3
"""Import historical activity sessions from old_data/*.csv into Firestore.

Each CSV file contains one person's weekly activity history. Every non-empty
sport cell is imported as a separate Firestore entry with its actual sport and
duration (values are interpreted as hours). The walking-equivalent km is
computed from the sport's MET value.

Usage:
    .venv/bin/python scripts/import_old_data.py
"""

import csv
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


OLD_DATA_DIR = Path(__file__).parent.parent / "old_data"
BATCH_SIZE = 400

SPORT_NAME_MAP = {
    "jogging": "Jogging",
    "running": "Running",
    "swimming": "Swimming",
    "bicycling": "Bicycling",
    "e-biking": "E-biking",
    "gym": "Gym Exercise",
    "aerobics": "Aerobics",
    "basketball": "Basketball",
    "cricket": "Cricket",
    "volleyball": "Volleyball",
    "beach volley": "Beach Volley",
    "football": "Football",
    "boxing": "Boxing",
    "climbing": "Climbing",
    "hiking": "Hiking",
    "tennis": "Tennis",
    "table tennis": "Table tennis",
    "badminton": "Badminton",
    "skating": "Skating",
    "skiing": "Skiing",
    "landsailing": "Landsailing",
}
DEFAULT_SPORT = "Running"
DEFAULT_MET = 7.0


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


def normalize_sport(name):
    key = name.strip().lower()
    return SPORT_NAME_MAP.get(key, DEFAULT_SPORT)


def parse_date(header, year=2026):
    """Parse a header like '7/31' into '2026-07-31'."""
    header = header.strip()
    if not header:
        return None
    parts = header.split("/")
    if len(parts) != 2:
        return None
    month, day = int(parts[0]), int(parts[1])
    return f"{year}-{month:02d}-{day:02d}"


def compute_walking_km(hours, met_value, hiking_met, hiking_speed_kmh):
    """Convert activity hours to equivalent walking km."""
    if met_value <= 0 or hiking_speed_kmh <= 0:
        return 0
    equivalent_hours = (met_value * hours) / hiking_met
    return equivalent_hours * hiking_speed_kmh


def import_file(db, config, path, batch):
    person = path.stem.replace("Sports Tracker-details - ", "").strip()
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.reader(f))

    if not rows or len(rows) < 2:
        return 0

    headers = rows[0]
    date_headers = headers[1:]

    imported = 0
    for row in rows[1:]:
        if not row or not row[0].strip():
            continue
        sport_label = row[0].strip()
        if sport_label.lower() in {"total equivalent", "pace for running(km/h)", "cumulated distance"}:
            continue

        sport = normalize_sport(sport_label)
        met_value = config["metValues"].get(sport, DEFAULT_MET)

        for i, header in enumerate(date_headers):
            date_str = parse_date(header)
            if not date_str:
                continue

            raw = row[i + 1].strip() if len(row) > i + 1 else ""
            if not raw:
                continue
            try:
                hours = float(raw)
            except ValueError:
                continue
            if hours <= 0:
                continue

            duration_minutes = round(hours * 60, 2)
            walking_km = round(compute_walking_km(hours, met_value, config["hikingMet"], config["hikingSpeedKmh"]), 2)

            doc_ref = db.collection("entries").document(f"import-{secrets.token_hex(8)}")
            batch.set(
                doc_ref,
                {
                    "person": person,
                    "sport": sport,
                    "durationMinutes": duration_minutes,
                    "metValue": met_value,
                    "walkingEquivalentKm": walking_km,
                    "date": date_str,
                    "submittedAt": datetime.now(timezone.utc),
                    "pin": config["groupPin"],
                    "source": "old_data_import",
                },
            )
            imported += 1

            if imported % BATCH_SIZE == 0:
                batch.commit()
                print(f"  Committed {imported} entries...")
                batch = db.batch()

    return imported


def delete_existing_entries(db):
    """Remove all existing entries before importing fresh data."""
    docs = list(db.collection("entries").stream())
    total = len(docs)
    if total == 0:
        print("No existing entries to delete")
        return

    print(f"Deleting {total} existing entries...")
    for i in range(0, total, BATCH_SIZE):
        batch = db.batch()
        for doc in docs[i : i + BATCH_SIZE]:
            batch.delete(doc.reference)
        batch.commit()
    print("Existing entries deleted")


def main():
    if not OLD_DATA_DIR.exists():
        print(f"old_data directory not found: {OLD_DATA_DIR}")
        sys.exit(1)

    db = init_firebase()

    config_ref = db.collection("config").document("global").get()
    if not config_ref.exists:
        print("config/global not found. Run scripts/seed_config.py first.")
        sys.exit(1)
    config = config_ref.to_dict()

    delete_existing_entries(db)

    files = sorted(OLD_DATA_DIR.glob("Sports Tracker-details - *.csv"))
    print(f"Importing {len(files)} files from {OLD_DATA_DIR}...")

    batch = db.batch()
    total_imported = 0
    for path in files:
        count = import_file(db, config, path, batch)
        total_imported += count
        print(f"  {path.name}: {count} entries")

    batch.commit()
    print(f"Imported {total_imported} historical entries in total")


if __name__ == "__main__":
    main()
