"""Bounded metadata-only CDR delivery. Never reads SIP secrets or voice files."""
import csv
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets

FIELDS = ("uniqueid", "sequence", "linkedid", "start", "answer", "end", "src", "dst",
          "channel", "dstchannel", "disposition", "duration", "billsec")
CHANNEL = re.compile(r"PJSIP/([A-Za-z0-9_-]{1,80})-[a-f0-9]{8}\Z")
IDENTIFIER = re.compile(r"[A-Za-z0-9_.-]{1,80}\Z")
NUMBER = re.compile(r"[+0-9*#]{0,32}\Z")
STATES = {"ANSWERED", "NO ANSWER", "BUSY", "FAILED", "CONGESTION"}


class HistoryError(Exception):
    pass


def timestamp(value, nullable=False):
    if not re.fullmatch(r"[0-9]{1,12}(?:\.[0-9]{1,6})?", value):
        raise ValueError("Invalid epoch")
    epoch = Decimal(value)
    if nullable and epoch == 0:
        return None
    if not Decimal("1577836800") <= epoch <= Decimal("4102444800"):
        raise ValueError("Epoch outside supported range")
    return datetime.fromtimestamp(float(epoch), timezone.utc).isoformat()


def parse_record(data, allowed):
    try:
        rows = list(csv.reader(io.StringIO(data.decode("utf-8"), newline=""), strict=True))
        if len(rows) != 1 or len(rows[0]) != len(FIELDS):
            return None
        item = dict(zip(FIELDS, rows[0]))
        endpoints = []
        for key in ("channel", "dstchannel"):
            match = CHANNEL.fullmatch(item[key])
            endpoint = match.group(1) if match else None
            # Every non-empty leg must be known. No caller-number inference.
            if item[key] and endpoint not in allowed:
                return None
            endpoints.append(endpoint)
        if not any(endpoints):
            return None
        if not all(IDENTIFIER.fullmatch(item[key]) for key in ("uniqueid", "linkedid")):
            return None
        if not re.fullmatch(r"[0-9]{1,10}", item["sequence"]):
            return None
        # Asterisk's incoming start extension is technical, not a called number.
        # Withheld caller names are not phone numbers and must not discard a call.
        if item["dst"] == "s":
            item["dst"] = ""
        if item["src"].lower() in {"anonymous", "unknown", "restricted", "unavailable"}:
            item["src"] = ""
        if not all(NUMBER.fullmatch(item[key]) for key in ("src", "dst")):
            return None
        if item["disposition"] not in STATES:
            return None
        if not all(re.fullmatch(r"[0-9]{1,6}", item[key]) for key in ("duration", "billsec")):
            return None
        duration, billsec = int(item["duration"]), int(item["billsec"])
        if not 0 <= billsec <= duration <= 172800:
            return None
        started = timestamp(item["start"])
        answered = timestamp(item["answer"], nullable=True)
        ended = timestamp(item["end"])
        # Compare datetime values, not text (timestamps may omit fractional parts).
        start_dt, end_dt = datetime.fromisoformat(started), datetime.fromisoformat(ended)
        if end_dt < start_dt or (end_dt - start_dt).total_seconds() > 172801:
            return None
        if answered and not start_dt <= datetime.fromisoformat(answered) <= end_dt:
            return None
        if billsec and not answered:
            return None
        return dict(event_id=item["uniqueid"] + ":" + item["sequence"], linked_id=item["linkedid"],
                    started_at=started, answered_at=answered, ended_at=ended,
                    source=item["src"], destination=item["dst"],
                    source_endpoint=endpoints[0], destination_endpoint=endpoints[1],
                    disposition=item["disposition"], duration_seconds=duration, billable_seconds=billsec)
    except (ValueError, InvalidOperation, UnicodeError, csv.Error, OverflowError):
        return None


def save_cursor(path, state):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name("." + path.name + "." + secrets.token_hex(6))
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(state, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def sync_history(path, cursor_path, allowed, sender):
    """One batch per cycle. A failed response never advances the durable cursor.

    Rename rotation is supported while the old file is retained uncompressed.
    copytruncate may inherently lose bytes during rotation; use rename + reopen.
    """
    path, cursor_path = Path(path), Path(cursor_path)
    if not path.exists():
        return 0
    state = None
    if cursor_path.exists():
        try:
            state = json.loads(cursor_path.read_text(encoding="utf-8"))
            if (not isinstance(state, dict) or
                    any(type(state.get(key)) is not int or state[key] < 0 for key in ("device", "inode", "offset")) or
                    not re.fullmatch(r"[a-f0-9]{64}", state.get("prefix", ""))):
                raise ValueError()
        except (ValueError, TypeError):
            raise HistoryError("History cursor is invalid") from None
    selected = path
    current = path.stat()
    if state and (state["device"], state["inode"]) != (current.st_dev, current.st_ino):
        selected = next((entry for entry in path.parent.glob(path.name + ".*")
                         if entry.is_file() and not entry.is_symlink() and
                         (entry.stat().st_dev, entry.stat().st_ino) == (state["device"], state["inode"])), None)
        if selected is None:
            raise HistoryError("Unacknowledged rotated history file is missing")
    if selected.is_symlink():
        raise HistoryError("History file cannot be a symlink")
    with selected.open("rb") as stream:
        stat = os.fstat(stream.fileno())
        offset = state["offset"] if state else 0
        prefix = hashlib.sha256(stream.read(min(offset, 256))).hexdigest()
        if state and (stat.st_size < offset or prefix != state["prefix"]):
            offset = 0  # Truncation: replay safely; server deduplicates event IDs.
        stream.seek(offset)
        records = []
        for _ in range(100):
            before = stream.tell()
            data = stream.readline(16385)
            if len(data) > 16384:
                raise HistoryError("History row exceeds size limit")
            if not data or not data.endswith(b"\n"):
                stream.seek(before)
                break
            record = parse_record(data, allowed)
            if record:
                records.append(record)
            if len(records) == 10:
                break
        offset = stream.tell()
        if records:
            result = sender(records)
            if not isinstance(result, dict) or result.get("accepted") is not True:
                raise HistoryError("History batch was not acknowledged")
        # Logrotate's numbered rename order: .3 -> .2 -> .1 -> active.
        # Never skip intermediate files after multiple offline rotations.
        if selected != path and offset == os.fstat(stream.fileno()).st_size:
            suffix = selected.name[len(path.name) + 1:]
            if not re.fullmatch(r"[1-9][0-9]{0,3}", suffix):
                raise HistoryError("Unsupported history rotation naming")
            number = int(suffix)
            next_path = path if number == 1 else path.with_name(path.name + "." + str(number - 1))
            if not next_path.is_file() or next_path.is_symlink():
                raise HistoryError("Intermediate rotated history file is missing")
            stat = next_path.stat()
            offset = 0
            prefix = hashlib.sha256(b"").hexdigest()
        else:
            stream.seek(0)
            prefix = hashlib.sha256(stream.read(min(offset, 256))).hexdigest()
        save_cursor(cursor_path, dict(device=stat.st_dev, inode=stat.st_ino, offset=offset, prefix=prefix))
        return len(records)
