"""SMS triage bot: a numbered-menu state machine. Standard library only.

Everything a patient sees, and every rule, comes from triage_rules.json, so
the protocol is a data edit. The rules shipped here are DEMO ONLY.

Safety rules built into the machine, whatever the data says:
  - any danger sign is RED
  - a complaint is home care only when the rules explicitly say so
  - too many unclear replies escalate to YELLOW instead of giving up
  - every home-care reply ends with the danger-sign safety line
  - a token is never held back by the ambulance question: unclear replies
    still issue the token, with the ambulance answer left blank
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
from pathlib import Path
from typing import Callable

SMS_LIMIT = 160
TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"  # no I or O: easy to misread
TOKEN_RE = re.compile(r"^([A-Z]{3})-(\d{3})([A-Z])$")

Session = dict
Outcome = dict


def load_rules(path: str | Path = Path(__file__).with_name("triage_rules.json")) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------------ tokens

def _check_letter(body: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return TOKEN_ALPHABET[digest[0] % len(TOKEN_ALPHABET)]


def make_token(prefix: str, secret: str) -> str:
    """e.g. RED-772K. The last letter is an HMAC check, so guessed codes fail."""
    body = f"{prefix}-{secrets.randbelow(1000):03d}"
    return body + _check_letter(body, secret)


def normalize_token(code: str) -> str:
    return re.sub(r"\s+", "", code).upper()


def verify_token(code: str, secret: str) -> bool:
    match = TOKEN_RE.match(normalize_token(code))
    if not match:
        return False
    prefix, digits, letter = match.groups()
    return hmac.compare_digest(letter, _check_letter(f"{prefix}-{digits}", secret))


def hash_phone(phone: str, secret: str) -> str:
    """Phones are never stored raw. Same number, same hash, so sessions work."""
    digits = re.sub(r"[^\d+]", "", phone)
    return hmac.new(secret.encode(), digits.encode(), hashlib.sha256).hexdigest()[:16]


# ------------------------------------------------------------------- texts

def split_sms(text: str, limit: int = SMS_LIMIT) -> list[str]:
    """Fit text into SMS-sized parts, keeping whole lines together where possible."""
    parts: list[str] = []
    current = ""
    for line in text.split("\n"):
        candidate = f"{current}\n{line}" if current else line
        if len(candidate) <= limit:
            current = candidate
            continue
        if current:
            parts.append(current)
        current = ""
        for word in line.split(" "):  # a line longer than one SMS: break on spaces
            candidate = f"{current} {word}" if current else word
            if len(candidate) <= limit:
                current = candidate
                continue
            if current:
                parts.append(current)
            while len(word) > limit:
                parts.append(word[:limit])
                word = word[limit:]
            current = word
    if current:
        parts.append(current)
    return parts


def _menu(title: str, options: list[tuple[str, str]]) -> str:
    return "\n".join([title, *(f"{key} {label}" for key, label in options)])


def _area_menu(rules: dict) -> str:
    options = [(a["key"], a["clinic_name"]) for a in rules["areas"]]
    options.append((rules["unlisted_area_key"], rules["text"]["unlisted_area"]))
    return _menu(rules["text"]["area_menu"], options)


def _danger_menu(rules: dict) -> str:
    options = [(d["key"], d["label"]) for d in rules["danger_signs"]]
    options.append((rules["no_danger_key"], rules["text"]["none"]))
    return _menu(rules["text"]["danger_menu"], options)


def _complaint_menu(rules: dict) -> str:
    return _menu(rules["text"]["complaint_menu"], [(c["key"], c["label"]) for c in rules["complaints"]])


def _duration_menu(rules: dict) -> str:
    return _menu(rules["text"]["duration_menu"], [(d["key"], d["label"]) for d in rules["durations"]])


def _ambulance_menu(rules: dict) -> str:
    return _menu(rules["text"]["ambulance_menu"], [(o["key"], o["label"]) for o in rules["ambulance_options"]])


MENUS = {
    "area": _area_menu,
    "danger": _danger_menu,
    "complaint": _complaint_menu,
    "duration": _duration_menu,
    "ambulance": _ambulance_menu,
}


def _find(options: list[dict], key: str) -> dict | None:
    return next((o for o in options if o["key"] == key), None)


def _clinic_text(rules: dict, session: Session) -> str:
    return session.get("clinic_name") or rules["text"]["nearest_clinic"]


# ----------------------------------------------------------- state machine

def step(
    rules: dict,
    session: Session | None,
    text: str,
    now_ms: int,
    issue: Callable[[str], str],
) -> tuple[Session | None, list[str], Outcome | None]:
    """
    Advance one patient's conversation by one incoming SMS.

    `issue(prefix)` returns a fresh token code. Returns the new session (None
    means forget it), the SMS replies, and an outcome when a token was issued
    so the caller can record it in the ledger.
    """
    t = rules["text"]
    word = text.strip().upper()
    first = re.split(r"[\s.,;:!?)]+", word)[0] if word else ""

    if word == "STOP":
        return None, [t["stopped"]], None
    if word == "RESET":
        session = None

    if session is not None:
        if session["step"] == "done":
            if now_ms < session["expires_at"]:
                reply = t["repeat_code"].format(code=session["code"], clinic=_clinic_text(rules, session))
                return session, [reply], None
            session = None
        elif now_ms - session["updated"] > rules["session_minutes"] * 60_000:
            session = None

    if session is None:
        fresh = {"step": "area", "invalid": 0, "updated": now_ms, "answers": {}}
        return fresh, split_sms(_area_menu(rules)), None

    session = {**session, "updated": now_ms, "answers": dict(session["answers"])}
    current = session["step"]

    if current == "area":
        area = _find(rules["areas"], first)
        if area or first == rules["unlisted_area_key"]:
            session.update(
                step="danger", invalid=0,
                clinic=area["clinic"] if area else None,
                clinic_name=area["clinic_name"] if area else None,
                area=area["name"] if area else None,
            )
            session["answers"]["area"] = first
            return session, split_sms(_danger_menu(rules)), None

    elif current == "danger":
        sign = _find(rules["danger_signs"], first)
        if sign:
            session["answers"]["danger"] = first
            return _ask_ambulance(rules, session, "RED", f"Danger sign: {sign['label']}")
        if first == rules["no_danger_key"]:
            session["answers"]["danger"] = first
            session.update(step="complaint", invalid=0)
            return session, split_sms(_complaint_menu(rules)), None

    elif current == "complaint":
        if _find(rules["complaints"], first):
            session["answers"]["complaint"] = first
            session.update(step="duration", invalid=0)
            return session, split_sms(_duration_menu(rules)), None

    elif current == "duration":
        duration = _find(rules["durations"], first)
        if duration:
            session["answers"]["duration"] = first
            complaint = _find(rules["complaints"], session["answers"]["complaint"])
            summary = f"{complaint['label']}, {duration['label']}"
            if first in complaint.get("home_care_if", []) and complaint.get("advice"):
                replies = split_sms(f"{complaint['advice']}\n{t['safety']}")
                return None, replies, None
            return _ask_ambulance(rules, session, "YELLOW", summary)

    elif current == "ambulance":
        choice = _find(rules["ambulance_options"], first)
        if choice:
            session["answers"]["ambulance"] = first
            pending = session["pending"]
            return _issue(rules, session, pending["level"], pending["summary"], issue)

    # Not a valid answer for this step.
    session["invalid"] = session.get("invalid", 0) + 1
    if session["invalid"] > rules["max_invalid"]:
        if current == "ambulance":
            # Already decided the level. Issue it now, ambulance answer left blank.
            pending = session["pending"]
            return _issue(rules, session, pending["level"], pending["summary"], issue)
        if current == "area":
            # Can't tell where they are: carry on without an area rather than stall.
            session.update(step="danger", invalid=0, clinic=None, clinic_name=None, area=None)
            return session, split_sms(_danger_menu(rules)), None
        return _issue(rules, session, "YELLOW", "Unclear replies, escalated", issue)
    return session, split_sms(f"{t['invalid']}\n{MENUS[current](rules)}"), None


def _ask_ambulance(rules: dict, session: Session, level: str, summary: str):
    """The level is decided; one more question before the token is issued."""
    session.update(step="ambulance", invalid=0, pending={"level": level, "summary": summary})
    return session, split_sms(_ambulance_menu(rules)), None


def _label(options: list[dict], key: str | None) -> str | None:
    option = _find(options, key) if key else None
    return option["label"] if option else None


def _inputs(rules: dict, session: Session) -> list[dict]:
    """Every answer as readable question/answer text, for the clinic dashboard.

    Built here from the rules, so the dashboard shows exactly what the patient
    was asked, even after the protocol is edited.
    """
    t = rules["text"]
    q = t["input_labels"]
    a = session["answers"]
    answered = lambda key, options, empty: _label(options, a.get(key)) or empty
    return [
        {"question": q["area"], "answer": session.get("area") or t["not_given"]},
        {"question": q["danger"], "answer": (
            _label(rules["danger_signs"], a.get("danger"))
            or (t["none"] if a.get("danger") == rules["no_danger_key"] else t["not_given"])
        )},
        {"question": q["complaint"], "answer": answered("complaint", rules["complaints"], t["not_given"])},
        {"question": q["duration"], "answer": answered("duration", rules["durations"], t["not_given"])},
        {"question": q["ambulance"], "answer": answered("ambulance", rules["ambulance_options"], t["no_answer"])},
    ]


def _issue(rules: dict, session: Session, level: str, summary: str, issue: Callable[[str], str]):
    t = rules["text"]
    hours = rules["token_hours"]
    code = issue(rules["levels"][level]["prefix"])
    expires_at = session["updated"] + hours * 3_600_000
    choice = _find(rules["ambulance_options"], session["answers"].get("ambulance", ""))
    ambulance = choice["needed"] if choice else None  # None: not asked or not answered
    key = "red" if level == "RED" else "yellow"
    template = t[f"{key}_ambulance"] if ambulance else t[key]
    reply = template.format(code=code, clinic=_clinic_text(rules, session), hours=hours)
    if level == "YELLOW":
        reply += "\n" + t["safety"]

    outcome = {
        "code": code,
        "level": level,
        "clinic": session.get("clinic"),
        "area": session.get("area"),
        "summary": summary,
        "answers": session["answers"],
        "ambulance": ambulance,
        "inputs": _inputs(rules, session),
        "expiresAt": expires_at,
    }
    done = {
        "step": "done", "code": code, "expires_at": expires_at, "updated": session["updated"],
        "clinic_name": session.get("clinic_name"), "answers": session["answers"],
    }
    return done, split_sms(reply), outcome