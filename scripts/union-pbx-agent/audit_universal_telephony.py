#!/usr/bin/env python3
"""Recoverable native AGI audit: authenticated local SIP, two loopback accounts.

Preview hashes installed sources without importing them. --apply requires that
reviewed hash. No provider registration, cloud request, PSTN or human call occurs.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
import time
import types
import uuid

import audit_sip_trunks as loader
from audit_call_modes import Sink, invite

ROOT=Path('/var/lib/union-pbx-agent/universal-audits')
INSTALLED=Path('/opt/union-pbx-agent')
EXTRA=('universal_telephony.py','universal_capacity.py','universal_capacity_agi.py',
       'universal_observer.py','universal_telephony_runtime.py','universal_runtime_adapter.py','outbound_capacity.py')
BUNDLE=tuple(sorted(set(loader.BUNDLE_NAMES+EXTRA+('audit_sip_trunks.py','audit_call_modes.py','audit_universal_telephony.py'))))


def digest(raw):return hashlib.sha256(raw).hexdigest()


def sources(directory):
    loader.safe_path(directory)
    info=directory.stat()
    if info.st_uid!=0 or info.st_mode&0o022 or not directory.is_dir():raise ValueError('Untrusted runtime directory')
    result={}
    for name in BUNDLE:
        path=directory/name
        loader.safe_path(path)
        info=path.stat()
        if info.st_uid!=0 or info.st_mode&0o022 or info.st_nlink!=1 or not path.is_file():raise ValueError('Untrusted audit bundle')
        result[name]=path.read_bytes()
    return result


def bundle_hash(values):
    return digest(b''.join(name.encode()+b'\0'+values[name]+b'\0' for name in sorted(values)))


def load(directory,expected):
    if directory.resolve()!=INSTALLED.resolve():raise ValueError('Audit requires the installed runtime')
    values=sources(directory)
    if not re.fullmatch('[a-f0-9]{64}',expected or '') or bundle_hash(values)!=expected:raise ValueError('Reviewed bundle hash mismatch')
    # The common loader executes verified source bytes and prohibits signed cloud
    # requests. Its historical subset is pinned to the already reviewed superset.
    subset={name:values[name] for name in loader.BUNDLE_NAMES}
    loader.REVIEWED_BUNDLE_SHA=bundle_hash(subset)
    # The historical audit loader demands a 0700 staging directory; installed
    # AGI modules must be traversable by Asterisk. Supply only the exact bytes
    # already authenticated above, without altering that loader's safety rules
    # or changing installed directory permissions.
    previous=loader.bundle_sources
    loader.bundle_sources=lambda requested: subset if requested.resolve()==directory.resolve() else (_ for _ in ()).throw(ValueError('Unexpected runtime directory'))
    try:
        worker,*_=loader.load_runtime(directory)
    finally:
        loader.bundle_sources=previous
    for name in ('outbound_capacity','universal_telephony','universal_capacity','universal_observer','universal_capacity_agi'):
        module=types.ModuleType(name);module.__file__=str(directory/(name+'.py'));sys.modules[name]=module
        exec(compile(values[name+'.py'],module.__file__,'exec'),module.__dict__)
    return worker


def save(worker,folder,state):worker.write_atomic(folder/'state.json',worker.json_bytes(state),0o600)


def reload(worker):
    if 'reloaded successfully' not in worker.guarded_reload('module reload res_pjsip.so').lower():raise ValueError('SIP reload not acknowledged')
    if 'reloaded' not in worker.guarded_reload('dialplan reload').lower():raise ValueError('Dialplan reload not acknowledged')


def targets(identity):
    if not re.fullmatch('[a-f0-9]{32}',identity):raise ValueError('Invalid audit identity')
    stem='audit-universal-'+identity+'.conf'
    org=str(uuid.UUID(identity))
    return {Path('/etc/asterisk/pjsip.d')/stem,Path('/etc/asterisk/extensions.d')/stem,
            Path('/etc/union-pbx-agent/universal')/(org+'.json')}


def cleanup(worker,folder,state):
    if state.get('cleaned'):return
    identity=state['id']
    if folder!=ROOT/identity or state['organization_id']!=str(uuid.UUID(identity)):raise ValueError('Invalid cleanup journal')
    allowed=targets(identity)
    if any(Path(item['path']) not in allowed for item in state['files']):raise ValueError('Unexpected cleanup artifact')
    if any(item['path'] not in ('/etc/asterisk/pjsip.conf','/etc/asterisk/extensions.conf') for item in state['main']):raise ValueError('Unexpected cleanup main file')
    # Request hangup only on the exact random endpoints created in this journal.
    permitted=set(state['endpoints'])
    for line in worker.asterisk('core show channels concise').splitlines():
        channel=line.split('!',1)[0]
        if re.fullmatch(r'PJSIP/[A-Za-z0-9_-]+-[a-f0-9]+',channel) and any(channel.startswith('PJSIP/'+ep+'-') for ep in permitted):
            worker.asterisk('channel request hangup '+channel)
    deadline=time.monotonic()+6
    while True:
        try:worker.assert_no_calls();break
        except worker.Busy:
            if time.monotonic()>=deadline:raise
            time.sleep(.1)
    # Validate every path before the first restoration. Concurrent changes are
    # never overwritten; the journal remains available for operator recovery.
    for item in state['main']:
        path=Path(item['path']);loader.safe_path(path)
        if digest(path.read_bytes()) not in item['accepted']:raise ValueError('Main configuration changed; preserve journal')
    for item in state['files']:
        path=Path(item['path']);loader.safe_path(path)
        if path.exists() and digest(path.read_bytes()) not in item['accepted']:raise ValueError('Audit artifact changed; preserve journal')
    for item in state['main']:
        path=Path(item['path']);worker.write_atomic(path,base64.b64decode(item['before'],validate=True),item['mode'],item['gid']);os.chown(path,item['uid'],item['gid'])
    for item in state['files']:Path(item['path']).unlink(missing_ok=True)
    reload(worker)
    from universal_capacity import Ledger
    from universal_capacity_agi import LEDGER,trusted_ledger
    trusted_ledger();quota=Ledger(LEDGER)
    with quota.transaction() as db:
        for table in ('universal_legs','universal_cursors','universal_state'):
            db.execute('DELETE FROM '+table+' WHERE org=?',(state['organization_id'],))
    worker.assert_fvx(state['fvx'])
    state['cleaned']=True;state['fvx_preserved']=True;save(worker,folder,state)


def scenario(org,ports):
    uid=lambda n:str(uuid.uuid5(uuid.UUID(org),str(n)))
    provider=uid(1);contract=uid(2);group=uid(3);ext=uid(4)
    connections=[dict(id=uid(10+i),provider_id=provider,contract_id=contract,name='Loopback '+str(i),auth_mode='digest',host='127.0.0.1',port=port,transport='udp',username='audit'+str(i),realm='*',inbound_cidrs=[],enabled=True,inbound_enabled=False,outbound_enabled=True) for i,port in enumerate(ports)]
    trunks=[dict(id=uid(20+i),name='Loopback trunk',connection_ids=[row['id']],enabled=True) for i,row in enumerate(connections)]
    pool=lambda i,scope,sid,limit:dict(id=uid(i),scope=scope,scope_id=sid,mode='shared',shared_limit=limit,inbound_limit=None,outbound_limit=None,confidence='tested')
    document=dict(schema_version=1,routing_enabled=True,providers=[dict(id=provider,name='Loopback',enabled=True,options={})],contracts=[dict(id=contract,provider_id=provider,name='Synthetic',enabled=True)],connections=connections,trunks=trunks,
                  capacity_pools=[pool(30,'organization',org,2)]+[pool(31+i,'connection',row['id'],1) for i,row in enumerate(connections)],dids=[],
                  groups=[dict(id=group,name='Priority',strategy='priority',members=[dict(connection_id=c['id'],trunk_id=t['id'],priority=i+1) for i,(c,t) in enumerate(zip(connections,trunks))],extension_ids=[ext],enabled=True)],
                  outbound_routes=[dict(id=uid(40),name='Synthetic only',group_id=group,priority=1,destination_pattern='e164_prefix',prefix='5511999999999',caller_id=None,max_cost=None,options={},enabled=True)])
    document['capacity_pools'] += [pool(50,'provider',provider,2),pool(51,'contract',contract,2),pool(52,'group',group,2)]+[pool(53+i,'trunk',row['id'],2) for i,row in enumerate(trunks)]
    return document,ext


def run(directory,expected,restore=None):
    worker=load(directory,expected)
    from universal_telephony import compile_document,context,names
    from universal_capacity import Ledger
    from universal_capacity_agi import LEDGER,trusted_ledger,pools_for
    from universal_observer import boot_epoch
    ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
    identity=restore or uuid.uuid4().hex;targets(identity);folder=ROOT/identity
    if restore:
        loader.safe_path(folder/'state.json')
        info=(folder/'state.json').stat()
        if info.st_uid!=0 or info.st_mode&0o077:raise ValueError('Untrusted audit journal')
        state=json.loads((folder/'state.json').read_text())
        with worker.operation_lock():cleanup(worker,folder,state)
        return {'id':identity,'cleaned':state['cleaned'],'fvx_preserved':state['fvx_preserved']}
    folder.mkdir(mode=0o700);org=str(uuid.UUID(identity));caller='uw-'+identity[:24]+'00000001';password=secrets.token_hex(24)
    state=dict(id=identity,organization_id=org,endpoints=[caller],main=[],files=[],cleaned=False,passed=False,external_calls=0,human_calls=0,results=[])
    sinks=[Sink(),Sink()]
    try:
        with worker.operation_lock():
            worker.assert_no_calls();state['fvx']=worker.asterisk('pjsip show registrations');save(worker,folder,state)
            trusted_ledger();quota=Ledger(LEDGER)
            with quota.transaction() as db:
                if db.execute('SELECT 1 FROM universal_state WHERE org=?',(org,)).fetchone() or db.execute('SELECT 1 FROM universal_legs WHERE org=?',(org,)).fetchone():raise ValueError('Synthetic organization already occupied')
            d,ext=scenario(org,[sink.port for sink in sinks]);extensions=[dict(id=ext,number=701,endpoint_name=caller,enabled=True,external_mode='both')]
            creds=[dict(connection_id=c['id'],password=password) for c in d['connections']]
            raw_transports=worker.strip_ansi(worker.asterisk('pjsip show transports'))
            transports={m[1]:m[2].lower() for m in re.finditer(r'(?m)^\s*Transport:\s+([A-Za-z0-9_-]+)\s+(udp)\s',raw_transports,re.I)}
            if len(transports)!=1:raise ValueError('One unambiguous native UDP transport required')
            bundle=compile_document(d,org,extensions,creds,transports,legacy_coverage=True)
            state['endpoints'] += [ep for cid,ep in bundle.endpoints]
            transport=next(iter(transports))
            sip=bundle.pjsip+('['+caller+'-auth]\ntype=auth\nauth_type=userpass\nusername='+caller+'\npassword='+password+'\n['+caller+']\ntype=aor\n['+caller+']\ntype=endpoint\ntransport='+transport+'\ncontext='+context(org)+'\nauth='+caller+'-auth\naors='+caller+'\nidentify_by=username,auth_username\ndeny=0.0.0.0/0\npermit=127.0.0.1/32\ndisallow=all\nallow=alaw\ndirect_media=no\n').encode()
            stem='audit-universal-'+identity+'.conf';gid=worker.grp.getgrnam('asterisk').gr_gid
            for main,path,raw,subdir in ((Path('/etc/asterisk/pjsip.conf'),Path('/etc/asterisk/pjsip.d')/stem,sip,'pjsip.d'),(Path('/etc/asterisk/extensions.conf'),Path('/etc/asterisk/extensions.d')/stem,bundle.routes,'extensions.d')):
                loader.safe_path(main);loader.safe_path(path)
                if path.exists():raise ValueError('Synthetic target occupied')
                info=main.stat();before=main.read_bytes();after=before+(b'' if before.endswith(b'\n') else b'\n')+('#include "'+subdir+'/'+stem+'"\n').encode()
                state['main'].append(dict(path=str(main),before=base64.b64encode(before).decode(),accepted=[digest(before),digest(after)],uid=info.st_uid,gid=info.st_gid,mode=info.st_mode&0o777));state['files'].append(dict(path=str(path),accepted=[digest(raw)]));save(worker,folder,state)
                worker.assert_no_calls();worker.write_atomic(path,raw,0o640,gid)
                worker.assert_no_calls();worker.write_atomic(main,after,info.st_mode&0o777,info.st_gid);os.chown(main,info.st_uid,info.st_gid)
            manifest=Path('/etc/union-pbx-agent/universal')/(org+'.json');loader.safe_path(manifest)
            if manifest.exists():raise ValueError('Synthetic manifest occupied')
            boot=boot_epoch();now=time.time()
            value=dict(snapshot=dict(organization_id=org,revision=1,document=d,extensions=extensions),boot=boot,lease_until=now+95,ready=True,legacy_coverage=True,destinations={},connections={c['id']:dict(state='available',checked_at=now) for c in d['connections']})
            state['files'].append(dict(path=str(manifest),accepted=[]));save(worker,folder,state)
            def publish():
                raw=worker.json_bytes(value);entry=state['files'][-1];entry['accepted'].append(digest(raw));save(worker,folder,state);worker.write_atomic(manifest,raw,0o640,gid)
            publish();quota.admit(org,1,boot,now+95,d['capacity_pools'],complete=True);reload(worker)
            deadline=time.monotonic()+8
            while context(org) not in worker.strip_ansi(worker.asterisk('pjsip show endpoint '+caller)):
                if time.monotonic()>deadline:raise ValueError('Synthetic caller not loaded')
                time.sleep(.2)
            def call(name,expected_sink):
                worker.assert_no_calls();before=[sum(sink.counts.values()) for sink in sinks];status=invite(caller,5511999999999,password)
                after=[sum(sink.counts.values())-count for sink,count in zip(sinks,before)]
                if status<300 or any(bool(count)!=(index==expected_sink) for index,count in enumerate(after)):raise ValueError('Native admission failed: '+name)
                state['results'].append(dict(name=name,invites=after,sip_status=status));save(worker,folder,state)
                worker.assert_no_calls()
                if any(leg['token'].startswith('native-') is False for leg in quota.legs(org)):raise ValueError('Native hangup did not release quota')
            call('priority_account_one',0)
            def hold(index):
                cid=d['connections'][index]['id'];token='native-held-'+str(index);quota.reserve(org,1,boot,token,cid,'outbound',pools_for(d,cid,d['trunks'][index]['id'],d['groups'][0]['id']),time.time(),origin_uniqueid='audit-origin-'+str(index));quota.bind(org,token,boot,'audit-held-'+str(index))
            hold(0);call('account_one_full_falls_back_to_two',1)
            hold(1);call('organization_aggregate_full',None)
            for index in (0,1):quota.finish(org,'native-held-'+str(index),boot,'audit-held-'+str(index))
            quota.renew(org,1,boot,time.time()-1);call('expired_lease_fail_closed',None)
            quota.renew(org,1,boot,time.time()+90);value['snapshot']['extensions'][0]['external_mode']='receive_only';publish();call('receive_only_origin_denied',None)
            value['snapshot']['extensions'][0]['external_mode']='both';value['ready']=False;publish();call('blocked_manifest_denied',None)
            state.update(passed=True,synthetic_calls=len(state['results']));save(worker,folder,state)
    except Exception:
        print(json.dumps(dict(id=identity,passed=False,recovery='--apply --cleanup '+identity+' --expected-bundle-sha '+expected)),file=sys.stderr)
        raise
    finally:
        for sink in sinks:sink.close()
        with worker.operation_lock():cleanup(worker,folder,state)
    return {key:state[key] for key in ('id','passed','cleaned','fvx_preserved','synthetic_calls','external_calls','human_calls','results')}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--apply',action='store_true');parser.add_argument('--runtime-directory',type=Path,default=INSTALLED);parser.add_argument('--expected-bundle-sha');parser.add_argument('--cleanup');args=parser.parse_args()
    if not args.apply:
        print(json.dumps(dict(preview=True,bundle_sha=bundle_hash(sources(args.runtime_directory)),external_calls=0,human_calls=0,synthetic_calls=6)));return 0
    try:print(json.dumps(run(args.runtime_directory,args.expected_bundle_sha,args.cleanup)));return 0
    except Exception as exc:print(json.dumps(dict(passed=False,error_type=type(exc).__name__,recovery='Use journal id with --apply --cleanup and the reviewed bundle hash')),file=sys.stderr);return 1


if __name__=='__main__':raise SystemExit(main())
