"""
SQLite connection management with WAL mode for concurrent access.
"""

import sqlite3
import threading

from backend.config import DB_PATH
from backend.database.models import SCHEMA_SQL

_local = threading.local()


def get_connection() -> sqlite3.Connection:
    """
    Return a thread-local SQLite connection.
    Uses WAL mode so MQTT writer and REST readers don't block each other.
    """
    if not hasattr(_local, "conn") or _local.conn is None:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        _local.conn = conn
    return _local.conn


def init_db():
    """Create tables if they don't exist and clean old data."""
    conn = get_connection()
    conn.executescript(SCHEMA_SQL)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_vitals_patient_time ON vitals(patient_id, recorded_at)")
    # Data retention: purge vitals older than 7 days
    conn.execute("DELETE FROM vitals WHERE recorded_at < datetime('now', '-7 days')")
    conn.execute("DELETE FROM alerts WHERE created_at < datetime('now', '-7 days')")
    conn.commit()
    print("[RPM] Database initialized (old data purged)")


def close_db():
    """Close the thread-local connection if open."""
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None
