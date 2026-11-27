"""Local per-external-leg quota ledger; no network, credentials or telephone data.

The privileged observer alone calls admit/reconcile/finish. Reconciliation requires
an admission barrier plus authoritative channel enumeration and no establishing
operations in flight. An incomplete CLI listing is never terminal evidence.
"""
from contextlib import contextmanager,nullcontext
import json
import math
import sqlite3
import time


class CapacityError(ValueError): pass


def fail(reason='capacity_unavailable'): raise CapacityError(reason)


def finite(value):
    if type(value) not in (int,float) or not math.isfinite(value) or value < 0: fail('invalid_clock')


def pools_json(pools):
    if not isinstance(pools,list) or not pools: fail('capacity_unknown')
    seen=set()
    for p in pools:
        if not isinstance(p,dict) or not {'id','mode','shared_limit','inbound_limit','outbound_limit','confidence'} <= p.keys(): fail('invalid_pool')
        if not isinstance(p['id'],str) or not p['id'] or p['id'] in seen: fail('invalid_pool')
        seen.add(p['id'])
        if p['confidence'] not in ('contract','tested','provider'): fail('capacity_unknown')
        fields=('shared_limit',) if p['mode']=='shared' else ('inbound_limit','outbound_limit') if p['mode']=='independent' else ()
        if not fields: fail('invalid_pool')
        for key in fields:
            if p[key] is None and p['mode']=='independent':continue
            if type(p[key]) is not int or not 1 <= p[key] <= 100000: fail('capacity_unknown')
    return json.dumps(sorted(pools,key=lambda p:p['id']),sort_keys=True,separators=(',',':'))


class Ledger:
    def __init__(self,path):
        self.path=str(path)
        with self.transaction() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS universal_state (
              org TEXT PRIMARY KEY, revision INTEGER NOT NULL, boot TEXT NOT NULL,
              lease REAL NOT NULL, ready INTEGER NOT NULL, pools TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS universal_legs (
              token TEXT PRIMARY KEY, org TEXT NOT NULL, revision INTEGER NOT NULL,
              boot TEXT NOT NULL, connection TEXT NOT NULL, direction TEXT NOT NULL,
              pools TEXT NOT NULL, uniqueid TEXT, started INTEGER NOT NULL DEFAULT 0,
              origin_uniqueid TEXT);
              CREATE UNIQUE INDEX IF NOT EXISTS universal_leg_unique ON universal_legs(boot,uniqueid);
              CREATE INDEX IF NOT EXISTS universal_leg_org ON universal_legs(org);
              CREATE TABLE IF NOT EXISTS universal_cursors (org TEXT NOT NULL, group_id TEXT NOT NULL, connection TEXT NOT NULL, PRIMARY KEY(org,group_id));''')

    @contextmanager
    def transaction(self):
        db=sqlite3.connect(self.path,timeout=5,isolation_level=None)
        db.row_factory=sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE'); yield db
            if db.in_transaction: db.execute('COMMIT')
        except BaseException:
            if db.in_transaction: db.execute('ROLLBACK')
            raise
        finally: db.close()

    def admit(self,org,revision,boot,lease_until,pools,*,complete=False,operational=False):
        finite(lease_until)
        if not complete or type(revision) is not int or revision<1 or not boot: fail('reconciliation_required')
        raw=pools_json(pools)
        with self.transaction() as db:
            old=db.execute('SELECT * FROM universal_state WHERE org=?',(org,)).fetchone()
            if old and revision<old['revision']: fail('revision_stale')
            if old and db.execute('SELECT 1 FROM universal_legs WHERE org=? LIMIT 1',(org,)).fetchone():
                if old['pools']!=raw or old['boot']!=boot or (old['revision']!=revision and not operational):fail('active_legs')
            if operational and (not old or old['pools']!=raw or old['boot']!=boot):fail('operational_catalog_changed')
            db.execute('INSERT INTO universal_state VALUES (?,?,?,?,1,?) ON CONFLICT(org) DO UPDATE SET revision=excluded.revision,boot=excluded.boot,lease=excluded.lease,ready=1,pools=excluded.pools',(org,revision,boot,lease_until,raw))

    def block(self,org):
        with self.transaction() as db: db.execute('UPDATE universal_state SET ready=0 WHERE org=?',(org,))

    def renew(self,org,revision,boot,lease_until):
        finite(lease_until)
        with self.transaction() as db:
            if db.execute('UPDATE universal_state SET lease=? WHERE org=? AND revision=? AND boot=?',(lease_until,org,revision,boot)).rowcount!=1:fail('revision_stale')

    def reserve(self,org,revision,boot,token,connection_id,direction,pool_ids,now,*,origin_uniqueid=None,_db=None):
        started=time.monotonic(); finite(now)
        if direction not in ('inbound','outbound') or not isinstance(pool_ids,tuple) or not pool_ids or len(set(pool_ids))!=len(pool_ids): fail('invalid_leg')
        if any(not isinstance(v,str) or not v or len(v)>128 for v in (org,boot,token,connection_id,*pool_ids)): fail('invalid_leg')
        raw=json.dumps(sorted(pool_ids))
        with (self.transaction() if _db is None else nullcontext(_db)) as db:
            state=db.execute('SELECT * FROM universal_state WHERE org=?',(org,)).fetchone()
            if not state or not state['ready'] or state['boot']!=boot or state['revision']!=revision or now+max(0,time.monotonic()-started)>=state['lease']: fail('admission_unavailable')
            old=db.execute('SELECT * FROM universal_legs WHERE token=?',(token,)).fetchone()
            if old:
                if (old['org'],old['revision'],old['boot'],old['connection'],old['direction'],old['pools'],old['origin_uniqueid'])!=(org,revision,boot,connection_id,direction,raw,origin_uniqueid): fail('leg_conflict')
                return dict(old)
            pools={p['id']:p for p in json.loads(state['pools'])}
            if not set(pool_ids)<=pools.keys(): fail('capacity_unknown')
            legs=db.execute('SELECT direction,pools FROM universal_legs WHERE org=?',(org,)).fetchall()
            for pid in pool_ids:
                p=pools[pid]
                count=sum(pid in json.loads(leg['pools']) and (p['mode']=='shared' or leg['direction']==direction) for leg in legs)
                limit=p['shared_limit'] if p['mode']=='shared' else p[direction+'_limit']
                if type(limit) is not int or limit<1:fail('capacity_unknown')
                if count>=limit: fail('capacity_exhausted')
            db.execute('INSERT INTO universal_legs(token,org,revision,boot,connection,direction,pools,origin_uniqueid) VALUES (?,?,?,?,?,?,?,?)',(token,org,revision,boot,connection_id,direction,raw,origin_uniqueid))
            return dict(db.execute('SELECT * FROM universal_legs WHERE token=?',(token,)).fetchone())

    def reserve_route(self,org,revision,boot,token,candidates,now,*,group_id,strategy,origin_uniqueid):
        started=time.monotonic()
        if strategy not in ('priority','round_robin','failover') or not candidates:fail('invalid_route')
        with self.transaction() as db:
            ordered=list(candidates)
            old=db.execute('SELECT * FROM universal_legs WHERE token=?',(token,)).fetchone()
            if old:
                ordered=[item for item in ordered if item[0]==old['connection']]
            elif strategy=='round_robin':
                cursor=db.execute('SELECT connection FROM universal_cursors WHERE org=? AND group_id=?',(org,group_id)).fetchone()
                ids=[item[0] for item in ordered]
                if cursor and cursor[0] in ids:
                    offset=ids.index(cursor[0])+1;ordered=ordered[offset:]+ordered[:offset]
            for cid,pool_ids in ordered:
                try:leg=self.reserve(org,revision,boot,token,cid,'outbound',pool_ids,now+max(0,time.monotonic()-started),origin_uniqueid=origin_uniqueid,_db=db)
                except CapacityError as error:
                    if str(error)!='capacity_exhausted':raise
                    continue
                if not old:db.execute('INSERT INTO universal_cursors VALUES (?,?,?) ON CONFLICT(org,group_id) DO UPDATE SET connection=excluded.connection',(org,group_id,cid))
                return leg
            fail('capacity_exhausted')

    def mark_dial_started(self,org,token):
        with self.transaction() as db:
            if db.execute('UPDATE universal_legs SET started=1 WHERE org=? AND token=?',(org,token)).rowcount!=1: fail('unknown_leg')

    def bind(self,org,token,boot,uniqueid):
        if not isinstance(uniqueid,str) or not uniqueid or len(uniqueid)>128: fail('invalid_leg')
        with self.transaction() as db:
            leg=db.execute('SELECT * FROM universal_legs WHERE org=? AND token=? AND boot=?',(org,token,boot)).fetchone()
            if not leg or leg['uniqueid'] not in (None,uniqueid): fail('leg_conflict')
            try: db.execute('UPDATE universal_legs SET uniqueid=? WHERE token=?',(uniqueid,token))
            except sqlite3.IntegrityError: fail('leg_conflict')

    def finish(self,org,token,boot,uniqueid):
        if not uniqueid: return False
        with self.transaction() as db:
            return db.execute('DELETE FROM universal_legs WHERE org=? AND token=? AND boot=? AND uniqueid=?',(org,token,boot,uniqueid)).rowcount==1

    def reconcile(self,org,boot,active_uniqueids,*,complete=False,establishing_quiescent=False,abandoned_tokens=(),sampled_legs=None):
        self.block(org)
        if not complete or not establishing_quiescent or not isinstance(active_uniqueids,tuple) or not isinstance(sampled_legs,tuple): fail('reconciliation_incomplete')
        try:
            sampled={(leg['token'],leg['boot'],leg['uniqueid']) for leg in sampled_legs if leg['org']==org}
        except (KeyError,TypeError):fail('reconciliation_incomplete')
        with self.transaction() as db:
            for leg in db.execute('SELECT * FROM universal_legs WHERE org=?',(org,)).fetchall():
                # Capture these bindings BEFORE native channel sampling. An AGI
                # already admitted before block() may still bind while the CLI
                # is sampled. Absence in that older snapshot cannot terminate
                # its newly bound channel. Unbound removal is safe: any later
                # bind fails before the pre-dial handler permits the INVITE.
                if (leg['token'],leg['boot'],leg['uniqueid']) not in sampled:continue
                if leg['boot']!=boot or (leg['uniqueid'] is not None and leg['uniqueid'] not in active_uniqueids) or (leg['uniqueid'] is None and leg['token'] in abandoned_tokens):
                    db.execute('DELETE FROM universal_legs WHERE token=?',(leg['token'],))

    def legs(self,org):
        with self.transaction() as db: return tuple(dict(r) for r in db.execute('SELECT * FROM universal_legs WHERE org=? ORDER BY token',(org,)))
