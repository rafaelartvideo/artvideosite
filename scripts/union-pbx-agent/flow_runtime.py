"""Internal call flows: bounded private WAV cache and transactional reconciliation."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request
import uuid
import wave

from call_flows import compile_flow,flow_context,identity,prompt_stem,validate_flow

MAX_AUDIO=1000000
SOUNDS_ROOT=Path('/var/lib/asterisk/sounds/union')
ORIGIN='https://wmjmtcjpunmzvonlkjcu.supabase.co'


class FlowRuntimeError(ValueError):pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):
        raise FlowRuntimeError('Redirecionamento do aviso recusado.')


def validate_audio(content,metadata):
    try:
        size=metadata['size_bytes'];duration=metadata['duration_seconds']
        if type(size) is not int or not 44<size<=MAX_AUDIO or len(content)!=size:
            raise ValueError()
        if type(duration) not in (int,float) or not 0<duration<=60:raise ValueError()
        if hashlib.sha256(content).hexdigest()!=metadata['sha256']:raise ValueError()
        with wave.open(io.BytesIO(content),'rb') as audio:
            frames=audio.getnframes()
            if audio.getparams()[:3]!=(1,2,8000) or audio.getcomptype()!='NONE' or not 0<frames<=480000:
                raise ValueError()
            if abs(frames/8000-duration)>.002 or len(audio.readframes(frames))!=frames*2:raise ValueError()
    except (KeyError,ValueError,wave.Error,EOFError,TypeError):
        raise FlowRuntimeError('Aviso deve corresponder ao WAV PCM mono 16 bits, 8 kHz aprovado.') from None


def validate_asset_url(url,metadata):
    try:
        parts=urllib.parse.urlsplit(url)
        expected='/storage/v1/object/sign/pbx-audio-prompts/'+identity(metadata['organization_id'])+'/'+identity(metadata['id'])+'.wav'
        if parts.scheme!='https' or parts.netloc!=urllib.parse.urlsplit(ORIGIN).netloc or \
           parts.path!=expected or parts.fragment or not re.fullmatch(r'token=[A-Za-z0-9_.~-]{1,4000}',parts.query):
            raise ValueError()
    except (TypeError,ValueError,KeyError):raise FlowRuntimeError('Endereco privado do aviso invalido.') from None
    return url


def asset_path(root,metadata):
    stem=prompt_stem(metadata['id'],metadata['organization_id'],{metadata['id']:metadata})
    target=Path(root)/Path(stem).relative_to('union')
    target=target.with_suffix('.wav')
    for path in (Path(root),target.parent,target):
        if path.is_symlink():raise FlowRuntimeError('Caminho de aviso inseguro.')
    return target


def download(url):
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'union-pbx-agent/flows-v1'})
        with urllib.request.build_opener(NoRedirect()).open(request,timeout=15) as response:
            if response.status!=200:raise FlowRuntimeError('Aviso privado indisponivel.')
            size=response.headers.get('Content-Length')
            if size is not None and (not size.isdigit() or int(size)>MAX_AUDIO):raise FlowRuntimeError('Aviso excede o limite.')
            content=response.read(MAX_AUDIO+1)
            if len(content)>MAX_AUDIO:raise FlowRuntimeError('Aviso excede o limite.')
            return content
    except FlowRuntimeError:raise
    except Exception:raise FlowRuntimeError('Falha no download privado do aviso.') from None


def prepare_asset(root,metadata,url,group=None):
    target=asset_path(root,metadata)
    if target.is_file():
        if target.stat().st_size>MAX_AUDIO:raise FlowRuntimeError('Aviso excede o limite.')
        validate_audio(target.read_bytes(),metadata)
        return target
    if url is None:raise FlowRuntimeError('Aviso local ausente ou invalido.')
    content=download(validate_asset_url(url,metadata));validate_audio(content,metadata)
    target.parent.mkdir(mode=0o750,parents=True,exist_ok=True)
    if target.parent.is_symlink():raise FlowRuntimeError('Caminho de aviso inseguro.')
    if group is not None:os.chown(target.parent,-1,group)
    target.parent.chmod(0o750)
    temporary=target.parent/('.audio-'+uuid.uuid4().hex)
    try:
        with temporary.open('xb') as output:output.write(content);output.flush();os.fsync(output.fileno())
        if group is not None:os.chown(temporary,-1,group)
        temporary.chmod(0o640)
        os.replace(temporary,target)
    finally:temporary.unlink(missing_ok=True)
    return target


def paths(agent):
    suffix=uuid.UUID(agent.PROFILE_ID).hex if agent.PROFILE_ID else 'union'
    return agent.DIALPLAN_MANAGED.parent/('union-call-flows-'+suffix+'.conf'),'uwfl-'+suffix


def attachment(agent):
    path,context=paths(agent)
    return path,context,'#include "extensions.d/'+path.name+'"'


def states(agent):
    result={}
    for path in (agent.STATE_DIR/'flows').glob('*.json'):
        if path.is_symlink():raise FlowRuntimeError('Estado de fluxo inseguro.')
        state=json.loads(path.read_text())
        if path.stem!=identity(state['flow']['id']):raise FlowRuntimeError('Identidade do estado de fluxo invalida.')
        result[path.stem]=state
    return result


def catalog(agent,state,org):
    # Revalidate against the actual local provisioned endpoints/queues, not only
    # the cloud's snapshot. The manual Union endpoint is the sole legacy case.
    local={}
    for path in (agent.STATE_DIR/'extensions').glob('*.json'):
        item=json.loads(path.read_text());agent.validate_local_owner(item);local[item['id']]=item
    extensions=dict(local)
    for item in state['extensions']:
        extension_id=identity(item['id'])
        if item.get('organization_id')!=org:raise FlowRuntimeError('Destino de outra empresa.')
        actual=local.get(extension_id)
        if actual is None and agent.PROFILE_ID is None and item.get('number')==301 and item.get('endpoint')=='union-301':
            actual={**item,'enabled':True}
        if actual is None or any(actual.get(key)!=item.get(key) for key in ('number','endpoint')):
            raise FlowRuntimeError('Ramal do fluxo ainda nao aplicado.')
        extensions[extension_id]=actual
    queues=agent.queue_states()
    for item in state['queues']:
        actual=queues.get(identity(item['id']))
        if not actual or actual.get('test_extension')!=item.get('test_extension') or actual.get('organization_id')!=org:
            raise FlowRuntimeError('Fila do fluxo ainda nao aplicada.')
    prompts={item['id']:item for item in state['prompts']}
    return extensions,queues,prompts


def render(agent,org,proposed=None):
    all_states=states(agent)
    if proposed is not None:all_states[proposed['flow']['id']]=proposed
    _,context=paths(agent)
    lines=['; Union internal flows. No external route is changed.\n['+context+']\n']
    compiled=[];numbers=[]
    for flow_id,state in sorted(all_states.items()):
        job=state['flow']
        if not job['enabled']:continue
        extensions,queues,prompts=catalog(agent,state,org)
        content=compile_flow(job,org,extensions,queues,prompts,legacy=agent.PROFILE_ID is None)
        if job['test_extension'] in numbers:raise FlowRuntimeError('Numero de fluxo duplicado.')
        numbers.append(job['test_extension'])
        lines.append('exten => '+str(job['test_extension'])+',1,Goto('+flow_context(org,flow_id)+',s,1)\n')
        compiled.append((flow_context(org,flow_id),content))
    dispatch=''.join(lines).encode()
    return dispatch+b''.join(content for _,content in compiled),dispatch,compiled,numbers


def verify(agent,org):
    path,context=paths(agent)
    expected,dispatch,compiled,numbers=render(agent,org)
    if path.is_symlink() or not path.is_file() or path.read_bytes()!=expected:
        raise FlowRuntimeError('Arquivo dos fluxos diverge do estado local.')
    agent._verify_loaded_context(context,dispatch,numbers,[])
    for name,source in compiled:
        extension_names=['s']+(['i','t']+re.findall(r'(?m)^exten => ([0-9]),1,',source.decode()) if b'BackGround(' in source else [])
        agent._verify_loaded_context(name,source,extension_names,[])
    for state in states(agent).values():
        if state['flow']['enabled']:
            for prompt in state['prompts']:prepare_asset(SOUNDS_ROOT,prompt,None)


def capability(agent,org):
    if not SOUNDS_ROOT.is_dir() or SOUNDS_ROOT.is_symlink() or not os.access(SOUNDS_ROOT,os.W_OK):return []
    path,_,_=attachment(agent)
    with agent.operation_lock():
        if path.exists():verify(agent,org)
        # Installed code alone is insufficient: the running engine must have
        # the media and schedule applications used by this protocol.
        for application in ('BackGround','WaitExten','GotoIfTime'):
            detail=agent.asterisk('core show application '+application)
            if not re.search(r'(?i)'+application+r'\s*\(',detail):return []
    return ['flows-v1']


def guard_target_update(agent,kind,target_id,enabled,number):
    for state in states(agent).values():
        if not state['flow']['enabled']:continue
        collection=state['extensions'] if kind=='extension' else state['queues']
        for target in collection:
            if target['id']==target_id and (not enabled or target.get('number' if kind=='extension' else 'test_extension')!=number):
                raise agent.Busy('Remova o destino dos fluxos ativos antes de desativar ou renumerar.')


def apply(agent,state,org):
    flow=state['flow'];flow_id=identity(flow['id'])
    extensions,queues,prompts=catalog(agent,state,org) if flow['enabled'] else ({},{},{})
    validate_flow(flow,org,extensions,queues,prompts,legacy=agent.PROFILE_ID is None)
    import grp
    group=grp.getgrnam('asterisk').gr_gid
    if flow['enabled']:
        if not isinstance(state['prompts'],list) or len(state['prompts'])>2:raise FlowRuntimeError('Lista de avisos invalida.')
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as executor:
            downloads=[executor.submit(prepare_asset,SOUNDS_ROOT,prompt,prompt.get('url'),group) for prompt in state['prompts']]
            for result in downloads:result.result()
    # Signed URLs never enter durable state, engine configuration or logs.
    state={**state,'prompts':[{key:value for key,value in prompt.items() if key!='url'} for prompt in state['prompts']]}
    with agent.operation_lock():
        agent.assert_no_calls()
        target,context,include=attachment(agent)
        state_file=agent.STATE_DIR/'flows'/(flow_id+'.json')
        tracked=(target,state_file,agent.DIALPLAN_MANAGED)
        previous={path:(path.read_bytes(),path.stat()) if path.exists() else None for path in tracked}
        old_fvx=agent.asterisk('pjsip show registrations')
        try:
            content,_,_,_=render(agent,org,state)
            agent.write_atomic(target,content,0o640,group)
            agent.write_atomic(state_file,agent.json_bytes(state))
            internal,_=agent.render_internal_routes()
            old=previous[agent.DIALPLAN_MANAGED]
            if old is None:raise FlowRuntimeError('Rotas internas nao inicializadas.')
            agent.write_atomic(agent.DIALPLAN_MANAGED,internal,old[1].st_mode&0o777,old[1].st_gid)
            agent.guarded_reload('dialplan reload')
            verify(agent,org)
            agent.assert_fvx(old_fvx)
        except Exception:
            for path,old in previous.items():
                if old is None:path.unlink(missing_ok=True)
                else:agent.write_atomic(path,old[0],old[1].st_mode&0o777,old[1].st_gid)
            agent.guarded_reload('dialplan reload')
            agent.assert_fvx(old_fvx)
            raise
