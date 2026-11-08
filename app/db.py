import json, sqlite3, threading
from datetime import datetime
from .config import DB_PATH

_lock = threading.Lock()
SCHEMA = """
CREATE TABLE IF NOT EXISTS engagements(
  id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL, created TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS entries(
  engagement_id INTEGER NOT NULL, wp_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
  overrides TEXT NOT NULL DEFAULT '{}', updated TEXT, PRIMARY KEY(engagement_id, wp_id));
CREATE TABLE IF NOT EXISTS signoffs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, engagement_id INTEGER, wp_id TEXT, stage TEXT,
  person TEXT, initials TEXT, ts TEXT, note TEXT, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS docs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, engagement_id INTEGER NOT NULL, tmpl TEXT NOT NULL, title TEXT,
  vals TEXT NOT NULL DEFAULT '{}', created TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS audit_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, engagement_id INTEGER, wp_id TEXT, action TEXT, detail TEXT);
"""


def now(): return datetime.now().isoformat(timespec="seconds")


def conn():
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init():
    with _lock, conn() as c:
        c.executescript(SCHEMA)


def q(sql, args=(), one=False):
    with _lock, conn() as c:
        cur = c.execute(sql, args)
        rows = cur.fetchall()
    return (rows[0] if rows else None) if one else rows


def x(sql, args=()):
    with _lock, conn() as c:
        cur = c.execute(sql, args)
        return cur.lastrowid


def log(eid, wp, action, detail=""):
    x("INSERT INTO audit_log(ts,engagement_id,wp_id,action,detail) VALUES(?,?,?,?,?)", (now(), eid, wp, action, detail))
