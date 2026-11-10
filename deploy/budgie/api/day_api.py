"""Footsteps 'Imagine their day' API.

POST /api/day with the grounding facts for one clicked person returns a short,
clearly speculative day-in-the-life written by Claude. Results are cached by
place x era x way of life x role x age band x sex, so most clicks never reach
the model, and a hard daily cap bounds spend.

Env:
  ANTHROPIC_API_KEY   required for real generations (absent -> canned demo text)
  DAY_MODEL           default claude-opus-5-5
  DAY_DAILY_CAP       new generations per UTC day (default 200)
  DAY_DB              sqlite path (default /data/days.db)
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = os.environ.get("DAY_MODEL", "claude-opus-5-5")
DAILY_CAP = int(os.environ.get("DAY_DAILY_CAP", "200"))
DB_PATH = os.environ.get("DAY_DB", "/data/days.db")
PER_IP_PER_HOUR = 30

SYSTEM = """You write short, plausible, clearly speculative snapshots of one ordinary \
person's day in the past, for an interactive map of human population history.

Ground everything in the facts given (place, year, head counts, density, way of life, \
the person's age, sex and role) plus well-established general knowledge of how people \
lived in that region and period. Where knowledge is thin (deep prehistory, sparse \
regions), stay general and say so in the uncertainty note rather than inventing \
specifics. Do not invent named historical events or famous people. Do not give the \
person a name. Avoid stereotypes; keep the role you are given, and do not assume tasks \
from sex. Plain, warm, concrete English; present tense. Keep it short: 5 to 7 schedule \
entries of one sentence each."""

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "One or two sentences: who they are and their situation."},
        "schedule": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "time": {"type": "string", "description": "e.g. Before dawn, Morning, Midday, Afternoon, Evening, Night"},
                    "activity": {"type": "string"},
                },
                "required": ["time", "activity"],
                "additionalProperties": False,
            },
        },
        "grounded_in": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Which given facts or general knowledge shaped this, briefly.",
        },
        "uncertainty": {"type": "string", "description": "One sentence on what is most uncertain here."},
    },
    "required": ["summary", "schedule", "grounded_in", "uncertainty"],
    "additionalProperties": False,
}

_lock = threading.Lock()
_ip_hits: dict[str, list[float]] = {}


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.execute("create table if not exists days (key text primary key, body text, model text, created text)")
    con.execute("create table if not exists spend (day text primary key, n integer)")
    return con


def cache_key(f: dict) -> str:
    year = int(f["year"])
    era = round(year / 50) * 50 if year > -2000 else round(year / 500) * 500
    age = int(f["person"]["age"])
    age_band = "child" if age < 13 else "youth" if age < 20 else "adult" if age < 50 else "elder"
    parts = [
        round(float(f["lat"]), 1),
        round(float(f["lon"]), 1),
        era,
        f["person"]["groupKind"],
        f["person"]["role"],
        age_band,
        "f" if f["person"]["female"] else "m",
    ]
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()[:32]


def prompt(f: dict) -> str:
    y = int(f["year"])
    when = f"{-y} BCE" if y < 0 else f"{y} CE"
    p = f["person"]
    who = ("girl" if p["female"] else "boy") if p["age"] < 13 else ("woman" if p["female"] else "man")
    facts = {
        "year": when,
        "place": f"latitude {float(f['lat']):.2f}, longitude {float(f['lon']):.2f}",
        "people_in_this_~10km_cell": round(float(f.get("cellPeople", 0))),
        "people_in_surrounding_3x3_cells": round(float(f.get("neighbourhoodPeople", 0))),
        "density_class": f.get("densityClass", "unknown"),
        "group": f"{'a foraging band' if p['groupKind'] == 0 else 'a village'} of about {round(float(p['groupPeople']))} people",
        "person": f"a {who} of about {p['age']}, role: {p['role']}",
        "data_confidence_note": f.get("confidence", ""),
    }
    return "Write a day in this person's life.\n\n" + json.dumps(facts, indent=2)


def demo(f: dict) -> dict:
    return {
        "summary": "Demo text: the server has no API key yet, so this is a placeholder.",
        "schedule": [
            {"time": "Morning", "activity": f"The {f['person']['role']} wakes as the camp stirs."},
            {"time": "Evening", "activity": "Everyone gathers around the fire to eat."},
        ],
        "grounded_in": ["placeholder"],
        "uncertainty": "Nothing here is generated yet.",
    }


def generate(f: dict) -> tuple[dict, str]:
    import anthropic

    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM,
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": prompt(f)}],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("The model declined this request.")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text), response.model


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args) -> None:  # quieter logs
        print(f"{self.address_string()} {format % args}", flush=True)

    def do_GET(self) -> None:
        if self.path.rstrip("/") in ("/api/day/health", "/health"):
            self._send(200, {"ok": True, "model": MODEL, "live": bool(os.environ.get("ANTHROPIC_API_KEY"))})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/api/day":
            return self._send(404, {"error": "not found"})
        try:
            length = min(int(self.headers.get("Content-Length", "0")), 8192)
            f = json.loads(self.rfile.read(length))
            key = cache_key(f)
        except Exception:
            return self._send(400, {"error": "Bad request."})

        con = db()
        row = con.execute("select body, model from days where key = ?", (key,)).fetchone()
        if row:
            return self._send(200, {**json.loads(row[0]), "model": row[1], "cached": True})

        live = bool(os.environ.get("ANTHROPIC_API_KEY"))
        if not live:
            return self._send(200, {**demo(f), "model": "demo", "cached": False})

        ip = self.headers.get("CF-Connecting-IP") or self.client_address[0]
        now = time.time()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with _lock:
            hits = [t for t in _ip_hits.get(ip, []) if now - t < 3600]
            if len(hits) >= PER_IP_PER_HOUR:
                return self._send(429, {"error": "Too many new days from you this hour. Try again later."})
            n = (con.execute("select n from spend where day = ?", (today,)).fetchone() or [0])[0]
            if n >= DAILY_CAP:
                return self._send(429, {"error": "Today's budget for new days is used up. Come back tomorrow; cached days still work."})
            hits.append(now)
            _ip_hits[ip] = hits
            con.execute("insert into spend(day, n) values(?, 1) on conflict(day) do update set n = n + 1", (today,))
            con.commit()

        try:
            body, model = generate(f)
        except Exception as e:  # keep the reason short; details go to the log
            print("generate failed:", repr(e), flush=True)
            return self._send(502, {"error": "Couldn't imagine this day right now."})
        con.execute(
            "insert or replace into days(key, body, model, created) values(?, ?, ?, ?)",
            (key, json.dumps(body), model, datetime.now(timezone.utc).isoformat()),
        )
        con.commit()
        self._send(200, {**body, "model": model, "cached": False})


if __name__ == "__main__":
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    print(f"day api on :8000 model={MODEL} cap={DAILY_CAP}/day live={bool(os.environ.get('ANTHROPIC_API_KEY'))}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
