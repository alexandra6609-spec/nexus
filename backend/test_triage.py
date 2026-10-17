"""Triage engine tests: every menu path, safety rules, and SMS limits."""
import itertools

import pytest

import triage

RULES = triage.load_rules()
SECRET = "test-secret"
MINUTE = 60_000


def run(texts, start=None, now=1_000_000):
    """Feed texts through the machine. Returns (session, last replies, outcomes)."""
    session, outcomes, replies = start, [], []
    counter = itertools.count(100)
    for text in texts:
        session, replies, outcome = triage.step(
            RULES, session, text, now, lambda p: f"{p}-{next(counter)}X"
        )
        if outcome:
            outcomes.append(outcome)
    return session, replies, outcomes


def gsm_safe(text):
    return all(32 <= ord(c) < 127 or c == "\n" for c in text)


def test_first_text_gets_area_menu():
    session, replies, _ = run(["hello"])
    assert session["step"] == "area"
    assert "Outpost A" in replies[0]


@pytest.mark.parametrize("sign", [d["key"] for d in RULES["danger_signs"]])
def test_every_danger_sign_is_red(sign):
    session, replies, outcomes = run(["hi", "3", sign])
    assert outcomes[0]["level"] == "RED"
    assert outcomes[0]["clinic"] == "C"
    assert "RED-" in replies[0] and "Outpost C" in replies[0]
    assert session["step"] == "done"


@pytest.mark.parametrize(
    "complaint,duration",
    [(c["key"], d["key"]) for c in RULES["complaints"] for d in RULES["durations"]],
)
def test_every_complaint_path(complaint, duration):
    session, replies, outcomes = run(["hi", "1", "0", complaint, duration])
    rule = next(c for c in RULES["complaints"] if c["key"] == complaint)
    if duration in rule["home_care_if"]:
        assert outcomes == [] and session is None
        assert RULES["text"]["safety"] in " ".join(replies)
    else:
        assert outcomes[0]["level"] == "YELLOW"
        assert outcomes[0]["clinic"] == "A"


def test_unlisted_area_points_to_nearest_clinic():
    _, replies, outcomes = run(["hi", "0", "2"])
    assert outcomes[0]["clinic"] is None
    assert "the nearest clinic" in replies[0]


def test_garbage_resends_menu_then_escalates():
    session, replies, outcomes = run(["hi", "2", "banana"])
    assert session["step"] == "danger" and outcomes == []
    assert replies[0].startswith(RULES["text"]["invalid"])
    _, _, outcomes = run(["maybe", "??", "x"], start=session)
    assert outcomes[0]["level"] == "YELLOW"


def test_garbage_area_moves_on_without_area():
    session, _, _ = run(["hi", "x", "y", "z"])
    assert session["step"] == "danger" and session["clinic"] is None


def test_numbers_with_punctuation_are_accepted():
    session, _, _ = run(["hi", "3.", " 0 "])
    assert session["step"] == "complaint"


def test_stop_and_reset():
    session, replies, _ = run(["hi", "2", "STOP"])
    assert session is None and replies == [RULES["text"]["stopped"]]
    session, _, _ = run(["hi", "2", "reset"])
    assert session["step"] == "area"


def test_repeat_text_returns_same_code_not_a_new_token():
    session, first, outcomes = run(["hi", "3", "1"])
    code = outcomes[0]["code"]
    session, replies, more = run(["hello?"], start=session)
    assert more == [] and code in replies[0]


def test_expired_token_starts_over():
    session, _, _ = run(["hi", "3", "1"])
    later = session["expires_at"] + 1
    session, replies, _ = run(["hi"], start=session, now=later)
    assert session["step"] == "area"


def test_stale_session_starts_over():
    session, _, _ = run(["hi", "3"])
    stale = session["updated"] + (RULES["session_minutes"] + 1) * MINUTE
    session, _, _ = run(["1"], start=session, now=stale)
    assert session["step"] == "area"


def test_every_reply_fits_one_sms_and_gsm7():
    paths = [["hi", "3", "1"], ["hi", "0", "0", "1", "1"], ["hi", "1", "0", "2", "1"],
             ["hi", "1", "0", "3", "2"], ["hi", "1", "0", "4", "3"], ["hi", "1", "x"],
             ["hi", "1", "0"], ["hi", "1", "0", "1"]]
    for path in paths:
        session = None
        for text in path:
            session, replies, _ = triage.step(RULES, session, text, 0, lambda p: f"{p}-123K")
            for reply in replies:
                assert len(reply) <= triage.SMS_LIMIT, reply
                assert gsm_safe(reply), reply


def test_split_sms():
    text = " ".join(["word"] * 100)
    parts = triage.split_sms(text, 50)
    assert all(len(p) <= 50 for p in parts)
    assert " ".join(parts) == text


def test_token_round_trip_and_tamper():
    code = triage.make_token("RED", SECRET)
    assert triage.verify_token(code, SECRET)
    assert triage.verify_token(code.lower(), SECRET)
    letter = code[-1]
    other = next(c for c in triage.TOKEN_ALPHABET if c != letter)
    assert not triage.verify_token(code[:-1] + other, SECRET)
    assert not triage.verify_token(code, "other-secret")
    assert not triage.verify_token("nonsense", SECRET)


def test_phone_hash_is_stable_and_not_the_number():
    a = triage.hash_phone("+1 555-0001", SECRET)
    assert a == triage.hash_phone("+15550001", SECRET)
    assert "5550001" not in a


@pytest.mark.parametrize("menu", list(triage.MENUS))
def test_every_menu_is_one_sms(menu):
    # A menu split over two messages can arrive out of order or half-read.
    assert len(triage.MENUS[menu](RULES)) <= triage.SMS_LIMIT


def test_split_sms_keeps_lines_whole():
    assert triage.split_sms("a" * 100 + "\n" + "b" * 100) == ["a" * 100, "b" * 100]


@pytest.mark.parametrize("level", ["RED", "YELLOW"])
def test_token_reply_is_one_sms_even_for_unlisted_area(level):
    # Unlisted area gives the longest clinic text ("the nearest clinic").
    path = ["hi", "0", "1"] if level == "RED" else ["hi", "0", "0", "4", "1"]
    _, replies, _ = run(path)
    assert len(replies) == 1
