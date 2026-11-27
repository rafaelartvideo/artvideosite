"""Strict universal SIP document compiler. All output is private, never diagnostics."""
from dataclasses import dataclass,field
import ipaddress
import re
from outbound_capacity import identity, RoutingError

class TelephonyError(ValueError): pass
def fail(reason='invalid_configuration'): raise TelephonyError(reason)
def uuid(value):
    try:return identity(value)
    except (RoutingError,TypeError):fail()
def token(value,pattern=r'[A-Za-z0-9_.+-]{1,128}'):
    if not isinstance(value,str) or not re.fullmatch(pattern,value):fail()
    return value
def credential(value):
    if not isinstance(value,str) or not 1<=len(value)<=256 or re.search(r'[\s\x00-\x1f\x7f-\x9f\ufeff]',value):fail('invalid_credential')
    return value

def credential_config_value(value):
    # Asterisk strips the backslash immediately preceding a semicolon.
    # Prevent the leading '>' from turning the assignment into '=>'.
    return (' ' if value.startswith('>') else '')+value.replace(';',r'\;')

def fields(row,keys):
    if not isinstance(row,dict) or set(row)!=set(keys.split()):fail()
def names(org,cid):
    stem='uwu-'+uuid(org).replace('-','')+'-'+uuid(cid).replace('-','')
    return {k:stem+'-'+v for k,v in [('endpoint','ep'),('aor','aor'),('auth','auth'),('registration','reg'),('inbound','in')]}
def context(org):return 'uwu-'+uuid(org).replace('-','')+'-out'

def validate_document(d,org):
    uuid(org)
    fields(d,'schema_version routing_enabled providers contracts connections trunks capacity_pools dids groups outbound_routes')
    if type(d['schema_version']) is not int or d['schema_version']!=1 or type(d['routing_enabled']) is not bool:fail()
    maps={}
    for key in ('providers','contracts','connections','trunks','capacity_pools','dids','groups','outbound_routes'):
        if not isinstance(d[key],list) or len(d[key])>500:fail()
        maps[key]={}
        for row in d[key]:
            if not isinstance(row,dict):fail()
            uid=uuid(row.get('id'))
            if uid in maps[key]:fail()
            maps[key][uid]=row
            if key!='capacity_pools':
                if type(row.get('enabled')) is not bool:fail()
            if 'name' in row and (not isinstance(row['name'],str) or not 1<=len(row['name'])<=120 or any(ord(c)<32 for c in row['name'])):fail()
    for p in d['providers']:
        fields(p,'id name enabled options')
        if not isinstance(p['options'],dict) or set(p['options'])-{'codecs','dtmf_mode','direct_media','rtp_symmetric','force_rport','rewrite_contact','destination_rates','cost_unit','did_source'}:fail()
        for key,value in p['options'].items():
            if key=='codecs':
                if not isinstance(value,list) or not value or len(set(value))!=len(value) or any(v not in ('ulaw','alaw','g722','opus') for v in value):fail()
            elif key=='dtmf_mode':
                if value not in ('rfc4733','info','auto'):fail()
            elif key=='did_source':
                if value not in ('request_uri','to_header','registered_account'):fail()
            elif key=='cost_unit':token(value,r'[A-Za-z][A-Za-z0-9_]{0,31}')
            elif key=='destination_rates':
                if not isinstance(value,list) or len(value)>1000 or not p['options'].get('cost_unit'):fail()
                prefixes=set()
                for rate in value:
                    fields(rate,'prefix cost');token(rate['prefix'],r'\+?[1-9][0-9]{0,14}')
                    canonical=rate['prefix'].lstrip('+')
                    if canonical in prefixes or type(rate['cost']) is not int or not 0<=rate['cost']<=1000000:fail()
                    prefixes.add(canonical)
            elif type(value) is not bool or key=='direct_media' and value:fail()
    for c in d['contracts']:
        fields(c,'id provider_id name enabled')
        if c['provider_id'] not in maps['providers']:fail()
    identities=set();identified_networks=[]
    for c in d['connections']:
        fields(c,'id provider_id contract_id name auth_mode host port transport username realm inbound_cidrs enabled inbound_enabled outbound_enabled')
        contract=maps['contracts'].get(c['contract_id'])
        if not contract or contract['provider_id']!=c['provider_id'] or c['provider_id'] not in maps['providers']:fail()
        token(c['host'],r'[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?')
        if type(c['port']) is not int or not 1<=c['port']<=65535 or c['transport'] not in ('udp','tcp','tls') or c['auth_mode'] not in ('registration','digest','ip'):fail()
        if c['auth_mode']!='ip':token(c['username'])
        elif c['username'] not in (None,''):fail()
        if c['realm']!='*':token(c['realm'],r'[A-Za-z0-9.-]{1,253}')
        if any(type(c[k]) is not bool for k in ('inbound_enabled','outbound_enabled')):fail()
        if not isinstance(c['inbound_cidrs'],list) or len(c['inbound_cidrs'])>100:fail()
        for cidr in c['inbound_cidrs']:
            try:
                net=ipaddress.ip_network(cidr,strict=True)
                if net.prefixlen==0:fail()
            except (ValueError,TypeError):fail()
        if c['inbound_enabled'] and not c['inbound_cidrs']:fail('inbound_identity_required')
        if c['enabled'] and c['inbound_enabled'] and c['auth_mode'] in ('ip','digest'):
            for cidr in c['inbound_cidrs']:
                net=ipaddress.ip_network(cidr)
                if any(net.version==old.version and net.overlaps(old) for old in identified_networks):fail('inbound_identification_overlap')
                identified_networks.append(net)
        if c['enabled']:
            claim=(c['host'].lower(),(c['username'] or '').lower())
            if claim in identities:fail('sip_identity_conflict')
            identities.add(claim)
            if not contract['enabled'] or not maps['providers'][c['provider_id']]['enabled']:fail()
    for t in d['trunks']:
        fields(t,'id name connection_ids enabled')
        if not isinstance(t['connection_ids'],list) or not t['connection_ids'] or len(set(t['connection_ids']))!=len(t['connection_ids']) or any(cid not in maps['connections'] for cid in t['connection_ids']):fail()
    for p in d['capacity_pools']:
        fields(p,'id scope scope_id mode shared_limit inbound_limit outbound_limit confidence')
        targets={'organization':{org:True},'provider':maps['providers'],'contract':maps['contracts'],'connection':maps['connections'],'trunk':maps['trunks'],'group':maps['groups']}
        if p['scope'] not in targets or p['scope_id'] not in targets[p['scope']] or p['mode'] not in ('shared','independent') or p['confidence'] not in ('unknown','contract','tested','provider'):fail()
        for k in ('shared_limit','inbound_limit','outbound_limit'):
            if p[k] is not None and (type(p[k]) is not int or not 1<=p[k]<=10000):fail()
        required=('shared_limit',) if p['mode']=='shared' else ('inbound_limit','outbound_limit')
        if d['routing_enabled'] and p['confidence']=='unknown':fail('capacity_unknown')
    for g in d['groups']:
        fields(g,'id name strategy members extension_ids enabled')
        if g['strategy'] not in ('priority','round_robin','failover') or not isinstance(g['members'],list) or not g['members'] or not isinstance(g['extension_ids'],list) or len(set(g['extension_ids']))!=len(g['extension_ids']):fail()
        for ext in g['extension_ids']:uuid(ext)
        seen=set()
        for m in g['members']:
            fields(m,'connection_id trunk_id priority')
            if m['connection_id'] in seen or m['connection_id'] not in maps['connections'] or m['trunk_id'] not in maps['trunks'] or m['connection_id'] not in maps['trunks'][m['trunk_id']]['connection_ids'] or type(m['priority']) is not int or not 1<=m['priority']<=10000:fail()
            seen.add(m['connection_id'])
    seen_dids=set()
    for did in d['dids']:
        fields(did,'id connection_id number destination_kind destination_id enabled')
        if did['connection_id'] not in maps['connections'] or did['destination_kind'] not in ('extension','queue','flow'):fail()
        token(did['number'],r'\+?[0-9]{3,15}');uuid(did['destination_id'])
        pair=(did['connection_id'],did['number'])
        if pair in seen_dids:fail()
        seen_dids.add(pair)
    for c in d['connections']:
        provider=maps['providers'][c['provider_id']]
        if c['enabled'] and c['inbound_enabled'] and provider['options'].get('did_source')=='registered_account':
            if c['auth_mode']!='registration' or len([did for did in d['dids'] if did['connection_id']==c['id'] and did['enabled']])!=1:fail('registered_account_requires_one_did')
    for r in d['outbound_routes']:
        fields(r,'id name group_id priority destination_pattern prefix caller_id max_cost options enabled')
        if r['group_id'] not in maps['groups'] or type(r['priority']) is not int or not 1<=r['priority']<=10000 or r['destination_pattern'] not in ('br_national','e164_prefix') or r['options']!={}:fail()
        if r['destination_pattern']=='e164_prefix':token(r['prefix'],r'[1-9][0-9]{0,14}')
        elif r['prefix'] not in (None,''):fail()
        if r['caller_id'] is not None and not any(did['enabled'] and did['number']==r['caller_id'] for did in d['dids']):fail('caller_id_not_authorized')
        if r['max_cost'] is not None:
            if type(r['max_cost']) is not int or not 0<=r['max_cost']<=1000000:fail()
            group=maps['groups'][r['group_id']]
            provider_ids={maps['connections'][m['connection_id']]['provider_id'] for m in group['members']}
            units={p['options'].get('cost_unit') for p in d['providers'] if p['id'] in provider_ids and p['enabled'] and p['options'].get('destination_rates')}
            if len(units)>1 or d['routing_enabled'] and len(units)!=1:fail('cost_unit_divergent')
    if d['routing_enabled']:
        pools={}
        for pool in d['capacity_pools']:
            key=(pool['scope'],pool['scope_id'])
            if key in pools:fail('duplicate_capacity_scope')
            pools[key]=pool
        def require(scope,sid,directions):
            pool=pools.get((scope,sid))
            if pool is None or pool['confidence']=='unknown':fail('capacity_unknown')
            for direction in directions:
                key='shared_limit' if pool['mode']=='shared' else direction+'_limit'
                if pool[key] is None:fail('capacity_unknown')
        directions=set()
        for connection in d['connections']:
            if not connection['enabled']:continue
            used={direction for direction in ('inbound','outbound') if connection[direction+'_enabled']}
            directions.update(used)
            for scope,sid in [('provider',connection['provider_id']),('contract',connection['contract_id']),('connection',connection['id'])]:require(scope,sid,used)
        require('organization',org,directions)
        for trunk in d['trunks']:
            if trunk['enabled']:
                used={direction for cid in trunk['connection_ids'] for direction in ('inbound','outbound') if maps['connections'][cid]['enabled'] and maps['connections'][cid][direction+'_enabled']}
                require('trunk',trunk['id'],used)
        for group in d['groups']:
            if group['enabled']:require('group',group['id'],{'outbound'})

    return maps

@dataclass(frozen=True,repr=False)
class Bundle:
    pjsip:bytes=field(repr=False)
    routes:bytes=field(repr=False)
    endpoints:tuple
    def __repr__(self):return 'Bundle(<redacted>)'

def compile_document(d,org,extensions,credentials,transports,*,legacy_coverage=False,claimed_identities=frozenset(),claimed_networks=()):
    maps=validate_document(d,org)
    if not d['routing_enabled']:return Bundle(b'',b'',())
    if not legacy_coverage:fail('legacy_coverage_required')
    creds={}
    for item in credentials:
        fields(item,'connection_id password')
        if item['connection_id'] in creds or item['connection_id'] not in maps['connections']:fail()
        creds[item['connection_id']]=credential(item['password'])
    extids={uuid(e['id']) for e in extensions if e['enabled']}
    if any(e not in extids for g in d['groups'] if g['enabled'] for e in g['extension_ids']):fail('extension_binding_required')
    sip=[];routes=[];eps=[]
    for c in d['connections']:
        if not c['enabled']:continue
        if c['inbound_enabled'] and c['auth_mode'] in ('ip','digest'):
            for cidr in c['inbound_cidrs']:
                network=ipaddress.ip_network(cidr)
                for claim in claimed_networks:
                    other=ipaddress.ip_network(claim,strict=True)
                    if network.version==other.version and network.overlaps(other):fail('inbound_identification_overlap')
        if (c['host'].lower(),(c['username'] or '').lower()) in claimed_identities:fail('sip_identity_conflict')
        actual=[k for k,v in transports.items() if v==c['transport']]
        if len(actual)!=1:fail('transport_unavailable')
        transport=token(actual[0],r'[A-Za-z0-9_-]{1,100}');n=names(org,c['id']);eps.append((c['id'],n['endpoint']))
        uri='sip:'+c['host']+':'+str(c['port'])+';transport='+c['transport']
        options=maps['providers'][c['provider_id']]['options']
        ep='['+n['endpoint']+']\ntype=endpoint\ntransport='+transport+'\ncontext='+n['inbound']+'\ndisallow=all\nallow='+','.join(options.get('codecs',['alaw','ulaw']))+'\ndirect_media=no\nallow_transfer=no\nallow_subscribe=no\naors='+n['aor']+'\n'
        if c['inbound_enabled']:
            ep+='deny=0.0.0.0/0\ndeny=::/0\n'+''.join('permit='+cidr+'\n' for cidr in c['inbound_cidrs'])
        for k in ('dtmf_mode','rtp_symmetric','force_rport','rewrite_contact'):
            if k in options:ep+=k+'='+('yes' if options[k] is True else 'no' if options[k] is False else options[k])+'\n'
        if c['auth_mode']!='ip':
            if c['id'] not in creds:fail('credential_required')
            sip.append('['+n['auth']+']\ntype=auth\nauth_type=userpass\nusername='+c['username']+'\npassword='+credential_config_value(creds[c['id']])+'\nrealm='+c['realm']+'\n')
            ep+='outbound_auth='+n['auth']+'\n'
        sip.extend([ep,'['+n['aor']+']\ntype=aor\ncontact='+uri+'\n'])
        if c['auth_mode']=='registration':sip.append('['+n['registration']+']\ntype=registration\ntransport='+transport+'\noutbound_auth='+n['auth']+'\nserver_uri='+uri+'\nclient_uri=sip:'+c['username']+'@'+c['host']+':'+str(c['port'])+'\ncontact_user='+n['endpoint']+'\nline=yes\nendpoint='+n['endpoint']+'\n')
        elif c['inbound_enabled']:
            sip.append('['+n['endpoint']+'-identify]\ntype=identify\nendpoint='+n['endpoint']+'\nmatch='+','.join(c['inbound_cidrs'])+'\n')
        lines=['['+n['inbound']+']']
        did_source=options.get('did_source','request_uri')
        # To-header routing admits only the exact private registration contact
        # token or a configured DID as Request-URI; never a catch-all context.
        if c['inbound_enabled'] and did_source in ('to_header','registered_account'):
            lines+=['exten => '+n['endpoint']+',1,AGI(/opt/union-pbx-agent/universal_capacity_agi.py,inbound,'+org+','+c['id']+',${EXTEN})',' same => n,GotoIf($["${UWUT_ALLOWED}"="1"]?allowed:denied)',' same => n(allowed),Set(__UWCM_EXTERNAL=1)',' same => n,Goto(${UWUT_DEST_CONTEXT},${UWUT_DEST_EXTEN},1)',' same => n(denied),Hangup(21)']
        for did in d['dids']:
            if c['inbound_enabled'] and did['enabled'] and did['connection_id']==c['id']:
                lines+=['exten => '+did['number']+',1,AGI(/opt/union-pbx-agent/universal_capacity_agi.py,inbound,'+org+','+c['id']+',${EXTEN})',' same => n,GotoIf($["${UWUT_ALLOWED}"="1"]?allowed:denied)',' same => n(allowed),Set(__UWCM_EXTERNAL=1)',' same => n,Goto(${UWUT_DEST_CONTEXT},${UWUT_DEST_EXTEN},1)',' same => n(denied),Hangup(21)']
        lines+=['exten => _.,1,Hangup(21)','exten => s,1,Hangup(21)'];routes.append('\n'.join(lines))
    routes.append('['+context(org)+']\nexten => _X.,1,AGI(/opt/union-pbx-agent/universal_capacity_agi.py,outbound,'+org+',${EXTEN})\n same => n,GotoIf($["${UWUT_ALLOWED}"="1"]?allowed:denied)\n same => n(allowed),Dial(PJSIP/${EXTEN}@${UWUT_ENDPOINT},30,b('+context(org)+'-bind^s^1))\n same => n,Hangup()\n same => n(denied),Hangup(21)\n['+context(org)+'-bind]\nexten => s,1,AGI(/opt/union-pbx-agent/universal_capacity_agi.py,bind,'+org+',${UWUT_TOKEN})\n same => n,Return()\n['+context(org)+'-end]\nexten => s,1,AGI(/opt/union-pbx-agent/universal_capacity_agi.py,end,'+org+',${UWUT_TOKEN})\n same => n,Return()')
    return Bundle(('\n'.join(sip)+'\n').encode(),('\n'.join(routes)+'\n').encode(),tuple(eps))
