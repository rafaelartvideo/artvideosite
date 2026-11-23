#!/usr/bin/python3
"""Fail-closed admission on authenticated Asterisk channels; no cloud calls."""
import json
import ipaddress
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import time
from recording_agi import Agi,read_environment
from universal_capacity import Ledger,CapacityError
from universal_telephony import names,context,uuid,validate_document

CONFIG_ROOT=Path('/etc/union-pbx-agent/universal')
LEDGER=Path('/var/lib/union-pbx-agent/universal-engine/capacity.sqlite')
class AdmissionError(ValueError):pass
def fail():raise AdmissionError('admission_unavailable')
def trusted_ledger():
    # Calls may use the provisioned shared DB, never create one or follow links.
    if any(path.is_symlink() for path in (LEDGER,*LEDGER.parents)):fail()
    try:
        if os.name=='posix':
            fd=os.open(LEDGER,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC|os.O_NONBLOCK)
            try:
                info=os.fstat(fd)
                if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode) not in (0o600,0o660):fail()
            finally:os.close(fd)
        elif not LEDGER.is_file():fail()
    except (OSError,ValueError):fail()
    return True

def trusted_manifest(org,*,new_call=True):
    uuid(org);path=CONFIG_ROOT/(org+'.json')
    if any(p.is_symlink() for p in (path,*path.parents)):fail()
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_mode&0o027 or info.st_size>2000000:fail()
        value=json.loads(stream.read(2000001))
    snap=value['snapshot']
    if snap['organization_id']!=org or 'credentials' in snap:fail()
    validate_document(snap['document'],org)
    now=time.time()
    if new_call and (not value.get('ready') or not value.get('legacy_coverage') or not snap['document']['routing_enabled'] or not now<value['lease_until']<=now+100):fail()
    return value

def pools_for(d,cid,trunk=None,group=None):
    c=next(c for c in d['connections'] if c['id']==cid)
    scopes={'organization':None,'provider':c['provider_id'],'contract':c['contract_id'],'connection':cid,'trunk':trunk,'group':group}
    trunks={t['id'] for t in d['trunks'] if cid in t['connection_ids']} if trunk is None else {trunk}
    return tuple(p['id'] for p in d['capacity_pools'] if p['scope'] in scopes and (p['scope']=='organization' or p['scope']=='trunk' and p['scope_id'] in trunks or p['scope_id']==scopes[p['scope']]))

def choose(value,endpoint,number):
    snap=value['snapshot'];d=snap['document']
    ext=next((e for e in snap['extensions'] if e['enabled'] and e['endpoint_name']==endpoint and e['external_mode'] in ('both','make_only')),None)
    if ext is None or not isinstance(number,str) or re.fullmatch(r'[1-9][0-9]{2,14}',number) is None:fail()
    candidates=[]
    for route in sorted(d['outbound_routes'],key=lambda r:(r['priority'],r['id'])):
        if not route['enabled']:continue
        if route['destination_pattern']=='br_national':
            from outbound_router import NUMBER_PATTERN
            if re.fullmatch(NUMBER_PATTERN,number) is None:continue
        elif not number.startswith(route['prefix']):continue
        g=next(g for g in d['groups'] if g['id']==route['group_id'])
        if not g['enabled'] or ext['id'] not in g['extension_ids']:continue
        for m in sorted(g['members'],key=lambda m:(m['priority'],m['connection_id'])):
            c=next(c for c in d['connections'] if c['id']==m['connection_id'])
            t=next(t for t in d['trunks'] if t['id']==m['trunk_id'])
            if route['caller_id'] is not None and not any(did['enabled'] and did['connection_id']==c['id'] and did['number']==route['caller_id'] for did in d['dids']):continue
            if route['max_cost'] is not None:
                provider=next(p for p in d['providers'] if p['id']==c['provider_id'])
                rates=[rate for rate in provider['options'].get('destination_rates',[]) if number.startswith(rate['prefix'].lstrip('+'))]
                if not rates or max(rates,key=lambda rate:len(rate['prefix'].lstrip('+')))['cost']>route['max_cost']:continue
            if c['enabled'] and c['outbound_enabled'] and t['enabled']:
                candidates.append((c,m,g,route))
        if candidates:return candidates
    fail()

def setvar(agi,name,value):
    if not re.fullmatch(r'[A-Za-z0-9_.:+@/-]*',str(value)):fail()
    agi.request('SET VARIABLE '+name+' "'+str(value)+'"')

def resolve_inbound(value,connection,request_uri,to_header):
    """One explicit SIP URI, exact owned DID and trusted configured URI domain.

    Additional local/public URI hosts may only come from root's own engine
    bindings in inbound_uri_hosts[connection UUID], never a SIP header itself.
    """
    snap=value['snapshot'];d=snap['document'];cid=connection['id']
    dids=[did for did in d['dids'] if did['enabled'] and did['connection_id']==cid]
    provider=next(p for p in d['providers'] if p['id']==connection['provider_id'])
    source=provider['options'].get('did_source','request_uri')
    if source=='request_uri':number=request_uri
    else:
        if request_uri not in {names(snap['organization_id'],cid)['endpoint'],*(did['number'] for did in dids)}:fail()
        if not isinstance(to_header,str) or not 1<=len(to_header)<=512 or any(ord(c)<32 or ord(c)>126 for c in to_header):fail()
        # No escaped users, URI headers, comma lists, password/userinfo tricks or
        # URI interpolation. A single optional display-name and tag are allowed.
        match=re.fullmatch(r'(?:(?:"[A-Za-z0-9 ._+-]{0,80}"|[A-Za-z0-9 ._+-]{1,80})\s*)?<(?P<uri>sips?:[^<>]+)>(?:;tag=[A-Za-z0-9_.!~*+\-]{1,128})?',to_header)
        uri=match['uri'] if match else to_header
        parsed=re.fullmatch(r'sips?:(\+?[0-9]{3,15})@([A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?)(?::([0-9]{1,5}))?(?:;user=phone)?',uri)
        if parsed is None or parsed[3] is not None and not 1<=int(parsed[3])<=65535:fail()
        hosts={connection['host'].lower(),*(str(host).lower() for host in value.get('inbound_uri_hosts',{}).get(cid,[]))}
        if parsed[2].lower() not in hosts:fail()
        number=parsed[1]
    did=next((did for did in dids if did['number']==number),None)
    if did is None:fail()
    return did

def check_peer(connection,agi):
    remote=agi.request('GET FULL VARIABLE "${CHANNEL(pjsip,remote_addr)}"')[1]
    if not isinstance(remote,str):fail()
    if remote.startswith('['):
        match=re.fullmatch(r'\[([0-9A-Fa-f:]+)\](?::[0-9]{1,5})?',remote)
        if not match:fail()
        host=match[1]
    else:
        match=re.fullmatch(r'([0-9.]+)(?::[0-9]{1,5})?',remote)
        if not match:fail()
        host=match[1]
    try:
        peer=ipaddress.ip_address(host)
        if not any(peer in ipaddress.ip_network(cidr,strict=True) for cidr in connection['inbound_cidrs']):fail()
    except (ValueError,TypeError):fail()

def run(arguments,env,agi):
    if len(arguments)<2:fail()
    mode,org=arguments[:2];uuid(org)
    value=trusted_manifest(org,new_call=mode in ('inbound','outbound'))
    snap=value['snapshot'];d=snap['document'];boot=value['boot'];trusted_ledger();ledger=Ledger(LEDGER)
    unique=env.get('agi_uniqueid','')
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',unique):fail()
    endpoint=agi.request('GET FULL VARIABLE "${CHANNEL(endpoint)}"')[1]
    channel=env.get('agi_channel','')
    if not channel.startswith('PJSIP/'+endpoint+'-') or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',endpoint):fail()
    if mode in ('bind','end'):
        if len(arguments)!=3:fail()
        leg=next((leg for leg in ledger.legs(org) if leg['token']==arguments[2]),None)
        if leg is None or names(org,leg['connection'])['endpoint']!=endpoint or leg['boot']!=boot:fail()
        if mode=='bind':
            ledger.bind(org,leg['token'],boot,unique)
            agi.request('SET VARIABLE CHANNEL(hangup_handler_push) '+context(org)+'-end,s,1')
        else:ledger.finish(org,leg['token'],boot,unique)
        return
    setvar(agi,'UWUT_ALLOWED','0')
    token=secrets.token_hex(24)
    if mode=='outbound' and len(arguments)==3:
        candidates=choose(value,endpoint,arguments[2]);eligible=[]
        for c,m,g,route in candidates:
            observation=value.get('connections',{}).get(c['id'],{})
            if observation.get('state') not in ('registered','available') or not 0<=time.time()-observation.get('checked_at',0)<=30:continue
            eligible.append((c['id'],pools_for(d,c['id'],m['trunk_id'],g['id'])))
        if not eligible:fail()
        g=candidates[0][2];route=candidates[0][3]
        leg=ledger.reserve_route(org,snap['revision'],boot,token,eligible,time.time(),group_id=g['id'],strategy=g['strategy'],origin_uniqueid=unique)
        setvar(agi,'UWUT_ENDPOINT',names(org,leg['connection'])['endpoint'])
        if route['caller_id'] is not None:agi.request('SET VARIABLE CALLERID(num) '+route['caller_id'])
        ledger.mark_dial_started(org,token)
    elif mode=='inbound' and len(arguments)==4:
        cid,number=arguments[2:];c=next((c for c in d['connections'] if c['id']==cid),None)
        if c is None or not c['enabled'] or not c['inbound_enabled'] or endpoint!=names(org,cid)['endpoint']:fail()
        check_peer(c,agi)
        provider=next(p for p in d['providers'] if p['id']==c['provider_id'])
        header=''
        if provider['options'].get('did_source','request_uri')=='to_header':
            if agi.request('GET FULL VARIABLE "${PJSIP_HEADER(read,To,2)}"')[1]:fail()
            header=agi.request('GET FULL VARIABLE "${PJSIP_HEADER(read,To)}"')[1]
        did=resolve_inbound(value,c,number,header)
        binding=value.get('destinations',{}).get(did['id'])
        if not isinstance(binding,dict) or set(binding)!={'context','extension'}:fail()
        ledger.reserve(org,snap['revision'],boot,token,cid,'inbound',pools_for(d,cid),time.time(),origin_uniqueid=unique)
        ledger.bind(org,token,boot,unique)
        setvar(agi,'UWUT_DEST_CONTEXT',binding['context']);setvar(agi,'UWUT_DEST_EXTEN',binding['extension'])
        setvar(agi,'__UWCM_EXTERNAL','1')
        agi.request('SET VARIABLE CHANNEL(hangup_handler_push) '+context(org)+'-end,s,1')
    else:fail()
    setvar(agi,'__UWUT_TOKEN',token)
    setvar(agi,'UWUT_ALLOWED','1')

def main():
    agi=Agi()
    try:run(sys.argv[1:],read_environment(sys.stdin),agi)
    except Exception:
        try:setvar(agi,'UWUT_ALLOWED','0');agi.request('EXEC Hangup 21')
        except Exception:pass
    return 0

if __name__=='__main__':raise SystemExit(main())
