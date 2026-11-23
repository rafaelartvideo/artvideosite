"""Inactive v2 routing foundation. No network, Asterisk commands or SIP secrets.

One SQLite ledger per physical PBX, on local disk, shared by all worker processes.
BEGIN IMMEDIATE serializes selection AND reservation, including establishing calls.
This module is deliberately not imported by the production agent: activating it
requires a reviewed AGI/AMI adapter and a signed v2 snapshot admission protocol.
Never expire a reservation by time alone: a long call must retain its capacity.
"""
from contextlib import contextmanager
from dataclasses import dataclass
import math
import re
import sqlite3
import time
import uuid


class RoutingError(ValueError):
    """Only stable, non-sensitive reason codes cross this boundary."""


def deny(reason='invalid_configuration'):
    raise RoutingError(reason)


def identity(value):
    if not isinstance(value, str): deny()
    try:
        parsed = uuid.UUID(value)
    except ValueError:
        deny()
    if str(parsed) != value or parsed.int == 0: deny()
    return value


def positive(value, maximum=10000):
    if type(value) is not int or not 1 <= value <= maximum: deny()


def timestamp(value):
    if type(value) not in (int, float) or not math.isfinite(value) or value < 0: deny()


def call_identity(value):
    if not isinstance(value, str) or re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', value) is None: deny()
    return value


@dataclass(frozen=True)
class Account:
    id: str
    organization_id: str
    trunk_id: str
    channels: int
    priority: int
    allowed_extensions: tuple
    enabled: bool = True

    def validate(self, organization_id):
        for value in (self.id, self.organization_id, self.trunk_id): identity(value)
        if self.organization_id != organization_id: deny('foreign_organization')
        positive(self.channels); positive(self.priority)
        if type(self.enabled) is not bool or not isinstance(self.allowed_extensions, tuple): deny()
        if not 1 <= len(self.allowed_extensions) <= 200 or len(set(self.allowed_extensions)) != len(self.allowed_extensions): deny()
        for value in self.allowed_extensions: identity(value)


@dataclass(frozen=True)
class Group:
    id: str
    organization_id: str
    revision: int
    strategy: str
    channels: int
    organization_channels: int
    trunk_channels: tuple
    accounts: tuple

    def validate(self):
        identity(self.id); identity(self.organization_id); positive(self.revision, 2**63-1)
        positive(self.channels); positive(self.organization_channels)
        if self.strategy not in ('priority', 'round_robin', 'failover'): deny()
        if not isinstance(self.accounts, tuple) or not 1 <= len(self.accounts) <= 100: deny()
        if not isinstance(self.trunk_channels, tuple): deny()
        limits = {}
        for item in self.trunk_channels:
            if not isinstance(item, tuple) or len(item) != 2: deny()
            trunk, limit = item; identity(trunk); positive(limit)
            if trunk in limits: deny()
            limits[trunk] = limit
        ids = set()
        for account in self.accounts:
            if not isinstance(account, Account): deny()
            account.validate(self.organization_id)
            if account.id in ids or account.trunk_id not in limits: deny()
            ids.add(account.id)
        return limits


@dataclass(frozen=True)
class Observation:
    organization_id: str
    account_id: str
    state: str
    checked_at: float
    # Canonical external-leg identities, shared with the reservation. A transfer
    # creating a second external leg MUST have a different identity (not Linkedid).
    active_calls: tuple = ()

    def available(self, organization_id, account_id, now):
        identity(self.organization_id); identity(self.account_id); timestamp(self.checked_at)
        if self.organization_id != organization_id or self.account_id != account_id: deny('foreign_organization')
        if self.state not in ('registered', 'registering', 'unregistered', 'authentication_failed', 'network_failed', 'disabled', 'divergent', 'unknown'): deny()
        if not isinstance(self.active_calls, tuple) or len(self.active_calls) > 10000 or len(set(self.active_calls)) != len(self.active_calls): deny()
        for value in self.active_calls: call_identity(value)
        return self.state == 'registered' and 0 <= now-self.checked_at <= 30


@dataclass(frozen=True)
class Reservation:
    call_id: str
    organization_id: str
    group_id: str
    account_id: str
    trunk_id: str
    revision: int


class CapacityLedger:
    """Trusted local adapter owns path, clock, catalog and observations.

    Never pass browser data here directly. File permissions, root-owned parent,
    same local filesystem and single ledger path are installer responsibilities.
    No secrets or phone numbers are persisted. No background polling is added.
    """
    def __init__(self, path):
        self.path = str(path)
        with self._transaction() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS reservations (
                  call_id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
                  group_id TEXT NOT NULL, account_id TEXT NOT NULL,
                  trunk_id TEXT NOT NULL, extension_id TEXT NOT NULL,
                  revision INTEGER NOT NULL, created_at REAL NOT NULL);
                CREATE INDEX IF NOT EXISTS reservations_org ON reservations(organization_id);
                CREATE TABLE IF NOT EXISTS cursors (
                  organization_id TEXT NOT NULL, group_id TEXT NOT NULL,
                  account_id TEXT NOT NULL, PRIMARY KEY(organization_id,group_id));
            ''')

    @contextmanager
    def _transaction(self):
        db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            db.execute('PRAGMA busy_timeout=10000')
            db.execute('BEGIN IMMEDIATE')
            yield db
            if db.in_transaction: db.execute('COMMIT')
        except BaseException:
            if db.in_transaction: db.execute('ROLLBACK')
            raise
        finally:
            db.close()

    def reserve(self, group, extension_id, call_id, observations, now, *, catalog, excluded=()):
        started = time.monotonic()
        limits = group.validate(); identity(extension_id); call_identity(call_id); timestamp(now)
        if not isinstance(excluded, tuple): deny()
        for value in excluded: identity(value)
        # Catalog MUST be the complete, signed own-organization catalog, including
        # disabled accounts and members of other groups. Shared limits cannot be
        # enforced from observations of only the requested group.
        if not isinstance(catalog, tuple) or not 1 <= len(catalog) <= 100: deny()
        accounts = {}
        for account in catalog:
            if not isinstance(account, Account): deny()
            account.validate(group.organization_id)
            if account.id in accounts: deny()
            accounts[account.id] = account
        if any(accounts.get(a.id) != a for a in group.accounts): deny('catalog_divergent')
        if not isinstance(observations, tuple) or len(observations) != len(catalog): deny('observation_incomplete')
        observed = {}
        for observation in observations:
            if not isinstance(observation, Observation) or observation.account_id in observed: deny()
            observed[observation.account_id] = observation
        if set(observed) != set(accounts): deny('observation_incomplete')
        for account in catalog:
            observed[account.id].available(group.organization_id, account.id, now)
        observed_calls = set()
        observed_accounts = {}
        for observation in observations:
            if observed_calls.intersection(observation.active_calls): deny('observation_divergent')
            observed_calls.update(observation.active_calls)
            observed_accounts.update((call, observation.account_id) for call in observation.active_calls)
        # Missing/stale observations can conceal busy calls on ANY member.
        # Do not spend the shared company/trunk limits with an incomplete view.
        if any(not 0 <= now-o.checked_at <= 30 for o in observations): deny('observation_stale')
        authorized = [a for a in group.accounts if a.enabled and extension_id in a.allowed_extensions and a.id not in excluded]
        if not authorized: deny('extension_not_authorized')
        with self._transaction() as db:
            # The SQLite lock may wait ten seconds. Freshness at method entry
            # cannot authorize an admission after that bounded observation expires.
            admitted_at = now + max(0, time.monotonic() - started)
            if any(not 0 <= admitted_at-o.checked_at <= 30 for o in observations): deny('observation_stale')
            availability = {a.id: observed[a.id].available(group.organization_id, a.id, admitted_at) for a in catalog}
            existing = db.execute('SELECT * FROM reservations WHERE call_id=?', (call_id,)).fetchone()
            if existing:
                if existing['call_id'] in observed_accounts and observed_accounts[existing['call_id']] != existing['account_id']: deny('observation_divergent')
                if (existing['organization_id'] != group.organization_id or existing['group_id'] != group.id or
                        existing['extension_id'] != extension_id or existing['revision'] != group.revision or
                        existing['account_id'] not in {a.id for a in authorized}): deny('call_identity_conflict')
                return self._reservation(existing)
            rows = db.execute('SELECT * FROM reservations WHERE organization_id=?', (group.organization_id,)).fetchall()
            if any(row['call_id'] in observed_accounts and observed_accounts[row['call_id']] != row['account_id'] for row in rows): deny('observation_divergent')
            ordered = sorted(authorized, key=lambda a: (a.priority, a.id))
            if group.strategy == 'round_robin':
                cursor = db.execute('SELECT account_id FROM cursors WHERE organization_id=? AND group_id=?',
                                    (group.organization_id, group.id)).fetchone()
                ids = [a.id for a in ordered]
                if cursor and cursor[0] in ids:
                    offset = ids.index(cursor[0])+1; ordered = ordered[offset:]+ordered[:offset]
            all_calls = {r['call_id'] for r in rows}
            for observation in observations: all_calls.update(observation.active_calls)
            if len(all_calls) >= group.organization_channels: deny('organization_capacity')
            group_calls = {r['call_id'] for r in rows if r['group_id'] == group.id}
            # Existing calls seen on these accounts count conservatively for this group.
            for member in group.accounts: group_calls.update(observed[member.id].active_calls)
            if len(group_calls) >= group.channels: deny('group_capacity')
            for account in ordered:
                if not availability[account.id]: continue
                account_calls = {r['call_id'] for r in rows if r['account_id'] == account.id}
                account_calls.update(observed[account.id].active_calls)
                if len(account_calls) >= account.channels: continue
                trunk_calls = {r['call_id'] for r in rows if r['trunk_id'] == account.trunk_id}
                for member in catalog:
                    if member.trunk_id == account.trunk_id: trunk_calls.update(observed[member.id].active_calls)
                if len(trunk_calls) >= limits[account.trunk_id]: continue
                db.execute('INSERT INTO reservations VALUES (?,?,?,?,?,?,?,?)',
                           (call_id, group.organization_id, group.id, account.id, account.trunk_id, extension_id, group.revision, admitted_at))
                db.execute('INSERT INTO cursors VALUES (?,?,?) ON CONFLICT(organization_id,group_id) DO UPDATE SET account_id=excluded.account_id',
                           (group.organization_id, group.id, account.id))
                return Reservation(call_id, group.organization_id, group.id, account.id, account.trunk_id, group.revision)
            deny('no_available_account')

    @staticmethod
    def _reservation(row):
        return Reservation(*(row[key] for key in ('call_id','organization_id','group_id','account_id','trunk_id','revision')))

    def release(self, organization_id, call_id):
        """Only final bridge/channel lifecycle or confirmed reconciliation calls this.

        WebRTC disconnect, hold, transfer-start and timer expiry are NOT release
        evidence. A transfer's second external leg has a separate reservation;
        release the old leg only after it has actually ended. Repeated end
        events are idempotent. Never release by linked conversation ID.
        """
        identity(organization_id); call_identity(call_id)
        with self._transaction() as db:
            return db.execute('DELETE FROM reservations WHERE organization_id=? AND call_id=?',
                              (organization_id, call_id)).rowcount == 1

    def reservations(self, organization_id):
        identity(organization_id)
        with self._transaction() as db:
            rows = db.execute('SELECT * FROM reservations WHERE organization_id=? ORDER BY call_id', (organization_id,)).fetchall()
            return tuple(self._reservation(row) for row in rows)


def may_failover(outcome, answered, dial_started):
    """Only locally proven pre-INVITE failures may be attempted elsewhere.

    SIP timeouts, BUSY, cancellation, rejection and ambiguous network failures
    never auto-redial: a provider may already have delivered the initial INVITE.
    """
    return (answered is False and dial_started is False and
            outcome in ('registration_unavailable', 'endpoint_unavailable', 'capacity_unavailable'))
