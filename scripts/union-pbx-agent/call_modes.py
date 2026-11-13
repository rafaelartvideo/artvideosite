"""Pure, tenant scoped call admission compiler. Contains no IO or SIP secrets."""
import re
import uuid

MODES = ('both', 'receive_only', 'make_only')
class CallModeError(ValueError): pass

def identity(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value or not uuid.UUID(value).int: raise ValueError()
    except (ValueError, AttributeError): raise CallModeError('Invalid call mode identity') from None
    return value

def context_name(org): return 'uwcm-' + uuid.UUID(identity(org)).hex

def validate_snapshot(snapshot, org, legacy=False):
    identity(org)
    if not isinstance(snapshot, dict) or set(snapshot) != {'organization_id','revision','extensions'} or snapshot['organization_id'] != org: raise CallModeError('Invalid call mode catalog')
    if type(snapshot['revision']) is not int or not 1 <= snapshot['revision'] <= 9223372036854775807: raise CallModeError('Invalid call mode revision')
    rows = snapshot['extensions']
    if not isinstance(rows, list) or len(rows)>1000: raise CallModeError('Invalid extensions')
    ids, endpoints, numbers = set(), set(), set()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'id','endpoint_name','number','mode','enabled','is_managed'}: raise CallModeError('Invalid extension policy')
        identity(row['id'])
        if row['mode'] not in MODES or type(row['enabled']) is not bool or type(row['is_managed']) is not bool or type(row['number']) is not int or not 100 <= row['number'] <= 9999 or 850<=row['number']<=900: raise CallModeError('Invalid extension policy')
        if row['is_managed']:
            if not isinstance(row['endpoint_name'], str) or not re.fullmatch(r'uw-[a-f0-9]{32}',row['endpoint_name']): raise CallModeError('Invalid managed endpoint')
        elif not (legacy and row['endpoint_name']=='union-301' and row['number']==301): raise CallModeError('Manual endpoint not permitted')
        for seen,value in ((ids,row['id']),(endpoints,row['endpoint_name']),(numbers,row['number'])):
            if value in seen: raise CallModeError('Duplicate extension policy')
            seen.add(value)
    return snapshot

def compile_context(snapshot, org, base_context, legacy=False):
    validate_snapshot(snapshot,org,legacy)
    if base_context!=('union-internal' if legacy else 'uwi-'+uuid.UUID(org).hex): raise CallModeError('Invalid base context')
    name=context_name(org)
    def rules(rows):
        return [' same => n,GotoIf($["${CHANNEL(endpoint)}"="'+r['endpoint_name']+'"]?allow)' for r in rows if r['enabled']]
    trunk='^uwt-'+uuid.UUID(org).hex+'-[a-f0-9]{32}-ep$'
    source=['['+name+']','exten => _X!,1,NoOp(Private call admission)', ' same => n,GotoIf($["${CHANNEL(channeltype)}"="Local"]?allow)']
    source+=rules([r for r in snapshot['extensions'] if r['mode'] in ('both','make_only')])
    common=[' same => n,GotoIf(${REGEX("'+trunk+'" ${CHANNEL(endpoint)})}?allow)']
    if legacy: common += [' same => n,GotoIf($["${CHANNEL(endpoint)}"="'+ep+'"]?allow)' for ep in ('union-fvx-in','union-fvx-out-test')]
    source+=common+[' same => n,Hangup(21)',' same => n(allow),Goto('+base_context+',${EXTEN},1)']
    receive=['['+name+'-receive]','exten => s,1,NoOp(Private receiving admission)']
    receive+=rules([r for r in snapshot['extensions'] if r['mode'] in ('both','receive_only')])+common
    receive+=[' same => n,Hangup(21)',' same => n(allow),Return()']
    return ('\n'.join(source+receive)+'\n').encode()

def decorate_routes(raw, org):
    option='b('+context_name(org)+'-receive^s^1)'
    output=[]
    for line in raw.decode().splitlines():
        match=re.fullmatch(r'((?:exten => [^,]+,[0-9]+| same => n(?:\([A-Za-z0-9_-]+\))?),)(Dial|Queue)\(([^\r\n]*)\)',line)
        if not match:
            output.append(line); continue
        prefix,app,arguments=match.groups(); args=arguments.split(','); slot=2 if app=='Dial' else 1
        if (app=='Dial' and (not args[0].startswith('PJSIP/') or len(args)>3)) or (app=='Queue' and len(args)>7): raise CallModeError('Unreviewed route model')
        args+=['']*max(0,slot+1-len(args))
        hooks=re.findall(r'b\([^)]*\)',args[slot])
        if hooks and hooks != [option]: raise CallModeError('Conflicting receiving hook')
        if 'b(' in args[slot] and not hooks: raise CallModeError('Malformed receiving hook')
        if not hooks: args[slot]+=option
        output.append(prefix+app+'('+','.join(args)+')')
    return ('\n'.join(output)+'\n').encode()

def source_context(org): return context_name(org)
def receive_context(org): return context_name(org)+'-receive'
