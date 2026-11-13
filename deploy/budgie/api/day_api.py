"""Footsteps 'Imagine their day' and anthropology API.

POST /api/day with the grounding facts for one clicked person returns a short,
clearly speculative day-in-the-life written by Claude. Results are cached by
place x era x way of life x role x age band x sex, so most clicks never reach
the model, and a hard daily cap bounds spend.

GET /api/anthropology?lat=&lon=&year= returns the sourced record for that 5-degree
cell and era (atlas.py). Fields no dataset covers are gap-filled by the model on the
first request per cell x era, cached, and counted against the same daily cap.

Env:
  OPENROUTER_API_KEY  required for real generations (absent -> canned demo text)
  DAY_MODEL           OpenRouter model id, default anthropic/claude-haiku-5.5
                      (~0.05c per day; Sonnet 5.5 ~1c, Opus 5.5 ~2c)
  DAY_FALLBACK_MODEL  used if the first declines or fails, default anthropic/claude-sonnet-5.5
  DAY_DAILY_CAP       new generations per UTC day (default 200)
  DAY_DB              sqlite path (default /data/days.db)
  ANTHROPOLOGY_ATLAS  atlas path (default anthropology.json.gz beside this file)
  ETHNOGRAPHY_EXPORT  D-PLACE societies (default ethnography.json.gz beside this file)
  TIME_USE            measured hours per day (default time_use.json beside this file)
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
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import analogs
import atlas
import grounding

MODEL = os.environ.get("DAY_MODEL", "anthropic/claude-haiku-5.5")
FALLBACK_MODEL = os.environ.get("DAY_FALLBACK_MODEL", "anthropic/claude-sonnet-5.5")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
KEY_ENV = "OPENROUTER_API_KEY"
DAILY_CAP = int(os.environ.get("DAY_DAILY_CAP", "200"))
DB_PATH = os.environ.get("DAY_DB", "/data/days.db")
PER_IP_PER_HOUR = 30
ATLAS_PATH = os.environ.get("ANTHROPOLOGY_ATLAS", str(Path(__file__).with_name("anthropology.json.gz")))
ATLAS = atlas.Atlas.load(ATLAS_PATH)
ETHNOGRAPHY = analogs.load(Path(os.environ.get("ETHNOGRAPHY_EXPORT", analogs.OUT)))
TIME_USE = grounding.load_time_use(Path(os.environ.get("TIME_USE", grounding.TIME_USE_PATH)))
# The user message (facts) stays under this many tokens, estimated at 4 characters each; `prompt` drops
# recorded societies, furthest down the ranking first, until it fits. The system prompt is extra.
PROMPT_TOKEN_BUDGET = 2000
CHARS_PER_TOKEN = 4

# Bump when the prompt changes so days written under an old prompt aren't served.
PROMPT_VERSION = 3
# Separate version for modelled years (before HYDE): bumping it leaves HYDE-era days cached.
DEEP_PROMPT_VERSION = 1

SYSTEM = """You write short, plausible, clearly speculative snapshots of one ordinary \
person's day in the past, for an interactive map of human population history.

Ground everything in the facts given (place, year, head counts, density, way of life, \
the person's age, sex and role) plus well-established general knowledge of how people \
lived in that region and period. Where knowledge is thin (deep prehistory, sparse \
regions), stay general and say so in the uncertainty note rather than inventing \
specifics. Do not invent named historical events or famous people. Do not give the \
person a name. Avoid stereotypes; keep the role you are given. Do not divide work by \
sex for anyone in the scene: describe other group members by role or age (adults, \
children, elders), never as "the men" doing one task and "the women" another. Plain, warm, concrete English; present tense. Keep it short: 5 to 7 schedule \
entries of one sentence each."""

# Added when the facts carry grounding from grounding.py.
GROUNDING_SYSTEM = """

If the facts include nearest_recorded_societies, those are real peoples recorded later than this day \
(years_after_this_day), described by outsiders: analogies for how such a life has worked, not this \
person's own culture. Borrow texture only where it fits the place (camp or village size, how often \
camp moves, dwellings, staple foods); never copy a named custom, ritual or event from them, and do not \
name them in the schedule. In grounded_in, add one entry per society you drew on, starting with its \
cite_as text exactly as given (for example "like the Hadza (recorded 1910s)") and then what you took \
from it. The uncertainty note must say the analog is a later record. If the facts include \
typical_adult_time_use, keep the schedule's proportions consistent with those hours and do not invent \
hours it does not give; where it is absent, give no hours. Never assign tasks by sex, whatever the sources say."""

# Added for years before HYDE (before 10,000 BCE), where the people themselves are a model.
DEEP_SYSTEM = """

This person lived in the Palaeolithic, before farming. The head count and the place are modelled, \
not observed, and the toolkit comes from a regional table: nothing was found at this exact spot. \
Everyone in the scene is a hunter-gatherer: no crops, herds, pottery, looms or metal unless the facts \
list them. Use only tools, shelters, ornaments and animals the facts or well-established archaeology \
for that region and time support. Mention other kinds of humans only if the facts list them, and \
label them as the facts do. Say what is invented: the summary must open with "Imagined:", and the \
uncertainty note must say plainly that the day is speculation built on a model."""

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
    con.execute("create table if not exists anthro (key text primary key, body text, model text, created text)")
    return con


def cache_key(f: dict) -> str:
    year = int(f["year"])
    era = round(year / 50) * 50 if year > -2000 else round(year / 500) * 500
    age = int(f["person"]["age"])
    age_band = "child" if age < 13 else "youth" if age < 20 else "adult" if age < 50 else "elder"
    parts = [
        PROMPT_VERSION,
        round(float(f["lat"]), 1),
        round(float(f["lon"]), 1),
        era,
        f["person"]["groupKind"],
        f["person"]["role"],
        age_band,
        "f" if f["person"]["female"] else "m",
    ]
    if year < atlas.HYDE_FIRST:
        parts.append(f"deep{DEEP_PROMPT_VERSION}")
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()[:32]


def prompt(f: dict, record: dict | None = None) -> str:
    y = int(f["year"])
    when = f"{-y} BCE" if y < 0 else f"{y} CE"
    p = f["person"]
    who = ("girl" if p["female"] else "boy") if p["age"] < 13 else ("woman" if p["female"] else "man")
    deep = y < atlas.HYDE_FIRST
    # Modelled years are read per 0.5 degree block (~55 km), HYDE years per ~10 km cell.
    block, group = ("~55km_block", "blocks") if deep else ("~10km_cell", "cells")
    facts = {
        "year": when,
        "place": f"latitude {float(f['lat']):.2f}, longitude {float(f['lon']):.2f}",
        f"people_in_this_{block}": round(float(f.get("cellPeople", 0))),
        f"people_in_surrounding_3x3_{group}": round(float(f.get("neighbourhoodPeople", 0))),
        "density_class": f.get("densityClass", "unknown"),
        # Everyone is a forager before farming, whatever size the mark: a big band, not a village.
        "group": f"{'a foraging band' if deep or p['groupKind'] == 0 else 'a village'} of about {round(float(p['groupPeople']))} people",
        "person": f"a {who} of about {p['age']}, role: {p['role']}",
        "data_confidence_note": f.get("confidence", ""),
    }
    if deep:
        facts["head_counts"] = "modelled, not measured: a model of where foragers would live, scaled to a published total"
    if record:
        # Real data with its sources, plus any cached model gap-fill (marked "model"), so the
        # day agrees with the portrait drawn from the same record.
        facts["what_we_know_about_this_region_and_era"] = atlas.known_facts(record)
        facts.update(grounding_facts(record))
    return fit_budget(facts)


def setting_of(record: dict) -> grounding.Setting | None:
    """The way of life, cell centre, year and environment of a record; None for an empty cell."""
    way = record["fields"]["subsistence"]["value"]["way"]
    if way == "uninhabited":
        return None
    lat, lon = analogs.cell_centre(record["cell"]["key"], atlas.CELL_DEG)
    biome, temp_c, precip_mm = ATLAS.environment(record)
    return grounding.Setting(way, lat, lon, record["era"]["start"], biome, temp_c, precip_mm)


def grounding_facts(record: dict) -> dict:
    """The nearest recorded societies and measured hours for the record's cell, era and way of life.
    Keys are left out when there is nothing sourced to say."""
    setting = setting_of(record)
    if setting is None:
        return {}
    found = {
        "nearest_recorded_societies": grounding.analog_facts(ETHNOGRAPHY, setting),
        "typical_adult_time_use": grounding.time_use_facts(TIME_USE, setting.way),
    }
    return {k: v for k, v in found.items() if v}


def render(facts: dict) -> str:
    return "Write a day in this person's life.\n\n" + json.dumps(facts, indent=2)


def fit_budget(facts: dict) -> str:
    """The user message, with recorded societies dropped from the bottom of the ranking until it is
    within PROMPT_TOKEN_BUDGET (at least one is kept: the card must cite its analog)."""
    text = render(facts)
    societies = facts.get("nearest_recorded_societies", {}).get("societies", [])
    while len(text) > PROMPT_TOKEN_BUDGET * CHARS_PER_TOKEN and len(societies) > 1:
        societies.pop()
        text = render(facts)
    return text


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


def call_model(system: str, user: str, schema: dict, name: str) -> tuple[dict, str]:
    """One call to OpenRouter (OpenAI-style chat completions), JSON schema output,
    with OpenRouter's model fallback list."""
    import urllib.request

    payload = {
        "models": [MODEL, FALLBACK_MODEL],
        "max_tokens": 4000,
        "reasoning": {"effort": "low"},
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": name, "strict": True, "schema": schema},
        },
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    req = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {os.environ[KEY_ENV]}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://footsteps.willhs.me",
            "X-Title": "Footsteps of Time",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as res:
        body = json.load(res)
    choice = body["choices"][0]
    if choice.get("finish_reason") in ("content_filter", "refusal"):
        raise RuntimeError("The model declined this request.")
    return json.loads(choice["message"]["content"]), body.get("model", MODEL)


def generate(f: dict, record: dict | None = None) -> tuple[dict, str]:
    system = SYSTEM + (DEEP_SYSTEM if int(f["year"]) < atlas.HYDE_FIRST else "") + GROUNDING_SYSTEM
    return call_model(system, prompt(f, record), SCHEMA, "day_in_the_life")


def reserve_generation(con: sqlite3.Connection, ip: str) -> str | None:
    """Count one new model call against the per-IP and daily caps; the reason if refused."""
    now = time.time()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _lock:
        hits = [t for t in _ip_hits.get(ip, []) if now - t < 3600]
        if len(hits) >= PER_IP_PER_HOUR:
            return "Too many new generations from you this hour. Try again later."
        n = (con.execute("select n from spend where day = ?", (today,)).fetchone() or [0])[0]
        if n >= DAILY_CAP:
            return "Today's budget for new generations is used up. Come back tomorrow; cached results still work."
        hits.append(now)
        _ip_hits[ip] = hits
        con.execute("insert into spend(day, n) values(?, 1) on conflict(day) do update set n = n + 1", (today,))
        con.commit()
    return None


def gapfill_key(record: dict) -> str:
    return f"v{record['atlas_version']}:{record['cell']['key']}:{record['era']['start']}"


def cached_record(con: sqlite3.Connection, lat: float, lon: float, year: int) -> dict | None:
    """The real-data record merged with any cached model gap-fill; None off land."""
    record = ATLAS.record(lat, lon, year)
    if record is None:
        return None
    row = con.execute("select body from anthro where key = ?", (gapfill_key(record),)).fetchone()
    return atlas.merge_gapfill(record, json.loads(row[0]) if row else None)


def anthropology(con: sqlite3.Connection, lat: float, lon: float, year: int, ip: str) -> dict | None:
    """Record for a cell x era, gap-filling once (cached) when a key and budget allow."""
    record = ATLAS.record(lat, lon, year)
    if record is None:
        return None
    key = gapfill_key(record)
    row = con.execute("select body, model from anthro where key = ?", (key,)).fetchone()
    if row:
        return {**atlas.merge_gapfill(record, json.loads(row[0])), "gapfill": "cached", "gapfill_model": row[1]}
    if not atlas.needs_gapfill(record):
        return {**record, "gapfill": "none-needed"}
    if not os.environ.get(KEY_ENV):
        return {**record, "gapfill": "off", "gapfill_note": "No model key on this server; unknown fields stay empty."}
    if refused := reserve_generation(con, ip):
        return {**record, "gapfill": "capped", "gapfill_note": refused}
    try:
        fill, model = call_model(atlas.GAPFILL_SYSTEM, atlas.gapfill_prompt(record), atlas.GAPFILL_SCHEMA,
                                 "anthropology_gapfill")
    except Exception as e:
        print("gapfill failed:", repr(e), flush=True)
        return {**record, "gapfill": "failed", "gapfill_note": "The model could not fill the gaps right now."}
    con.execute("insert or replace into anthro(key, body, model, created) values(?, ?, ?, ?)",
                (key, json.dumps(fill), model, datetime.now(timezone.utc).isoformat()))
    con.commit()
    return {**atlas.merge_gapfill(record, fill), "gapfill": "generated", "gapfill_model": model}


def parse_place(query: str) -> tuple[float, float, int]:
    q = parse_qs(query)
    lat, lon, year = float(q["lat"][0]), float(q["lon"][0]), int(q["year"][0])
    atlas.cell_of(lat, lon)  # range checks raise ValueError
    atlas.era_of(year)
    return lat, lon, year


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

    def client_ip(self) -> str:
        return self.headers.get("CF-Connecting-IP") or self.client_address[0]

    def do_GET(self) -> None:
        url = urlsplit(self.path)
        path = url.path.rstrip("/")
        if path in ("/api/day/health", "/health"):
            return self._send(200, {"ok": True, "model": MODEL, "live": bool(os.environ.get(KEY_ENV)),
                                    "atlas_version": ATLAS.version})
        if path != "/api/anthropology":
            return self._send(404, {"error": "not found"})
        try:
            lat, lon, year = parse_place(url.query)
        except (KeyError, ValueError):
            return self._send(400, {"error": f"Give lat (-90..90), lon (-180..180) and year "
                                             f"({atlas.FIRST_YEAR}..{atlas.LAST_YEAR})."})
        record = anthropology(db(), lat, lon, year, self.client_ip())
        if record is None:
            return self._send(404, {"error": "No land here in any era (HYDE 3.5, or the Ice Age climate model)."})
        self._send(200, {**record, "sources": ATLAS.sources})

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

        live = bool(os.environ.get(KEY_ENV))
        if not live:
            return self._send(200, {**demo(f), "model": "demo", "cached": False})

        if refused := reserve_generation(con, self.client_ip()):
            return self._send(429, {"error": refused})

        try:
            record = cached_record(con, float(f["lat"]), float(f["lon"]), int(f["year"]))
        except (KeyError, ValueError):
            record = None  # out of the atlas's range: the day still works without it
        try:
            body, model = generate(f, record)
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
    print(f"day api on :8000 model={MODEL} cap={DAILY_CAP}/day live={bool(os.environ.get(KEY_ENV))} "
          f"atlas v{ATLAS.version} ({len(ATLAS.cells)} cells)", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
