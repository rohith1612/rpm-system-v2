"""
Database connection management for PostgreSQL (Neon DB).
"""

import os
import threading
import psycopg2
import psycopg2.extras
from datetime import datetime, timedelta

from backend.config import DATABASE_URL
from backend.database.models import SCHEMA_SQL

_local = threading.local()


class CursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [dict(r) for r in rows]

    @property
    def lastrowid(self):
        return None


class ConnectionWrapper:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, params=None):
        if params is None:
            params = ()
        
        # Translate placeholder ? to %s for PostgreSQL
        sql = sql.replace("?", "%s")
            
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        try:
            cur.execute(sql, params)
            return CursorWrapper(cur)
        except Exception as e:
            self.conn.rollback()
            raise e

    def executescript(self, script_sql):
        cur = self.conn.cursor()
        try:
            cur.execute(script_sql)
            self.conn.commit()
        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cur.close()

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()


def get_connection():
    """
    Return a thread-local database connection wrapper for Neon PostgreSQL.
    """
    conn_is_closed = True
    if hasattr(_local, "conn") and _local.conn is not None:
        try:
            if _local.conn.conn.closed == 0:
                conn_is_closed = False
        except Exception:
            pass

    if conn_is_closed:
        if not DATABASE_URL:
            raise ValueError("DATABASE_URL is not set. Please configure NeonDB connection string.")
            
        conn = psycopg2.connect(DATABASE_URL)
        _local.conn = ConnectionWrapper(conn)
        print("[RPM] Connected to Neon PostgreSQL database")
    return _local.conn


def init_db():
    """Create normalized tables if they don't exist and clean old telemetry data."""
    conn = get_connection()

    # One-time migration: drop old patients table if it has the legacy cerner_patient_id column
    try:
        cur = conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'cerner_patient_id'"
        )
        if cur.fetchone():
            print("[RPM] Migration: Detected legacy 'cerner_patient_id' column. Dropping all tables to recreate with new schema...")
            conn.executescript("""
                DROP TABLE IF EXISTS patient_beds CASCADE;
                DROP TABLE IF EXISTS patient_thresholds CASCADE;
                DROP TABLE IF EXISTS alerts CASCADE;
                DROP TABLE IF EXISTS vitals CASCADE;
                DROP TABLE IF EXISTS patients CASCADE;
            """)
            print("[RPM] Migration: Old tables dropped successfully.")
    except Exception as e:
        print(f"[RPM] Migration check skipped (table may not exist yet): {e}")

    conn.executescript(SCHEMA_SQL)

    # Clean old data: purge older than 7 days
    cutoff = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")
    conn.execute("DELETE FROM vitals WHERE recorded_at < %s", (cutoff,))
    conn.execute("DELETE FROM alerts WHERE created_at < %s", (cutoff,))
    conn.commit()
    print("[RPM] Database initialized (old data purged)")


def close_db():
    """Close the thread-local database connection if open."""
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None

