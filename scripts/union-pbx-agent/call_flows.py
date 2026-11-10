"""Pure, internal-only URA/schedule compiler. No filesystem, network or reload."""
from datetime import date,datetime
import re
import uuid
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError


class FlowError(ValueError):pass


CONFIG_KEYS={'version','mode','prompt_id','closed_prompt_id','options','fallback','closed_target',
             'timezone','schedule_enabled','windows','holidays','timeout_seconds','repeats'}
DAYS=('mon','tue','wed','thu','fri','sat','sun')


def identity(value):
    try:
        if not isinstance(value,str) or str(uuid.UUID(value))!=value:raise ValueError()
        return value
    except (ValueError,AttributeError):raise FlowError('Identidade do fluxo invalida.') from None


def flow_context(organization_id,flow_id):
    return 'uwf-'+uuid.UUID(identity(organization_id)).hex+'-'+uuid.UUID(identity(flow_id)).hex


def integer(value,minimum,maximum):
    if type(value) is not int or not minimum<=value<=maximum:raise FlowError('Limite numerico do fluxo invalido.')
    return value


def minutes(value,end=False):
    if end and value=='24:00':return 1440
    if not isinstance(value,str) or not re.fullmatch(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]',value):
        raise FlowError('Horario invalido; use horas e minutos.')
    hour,minute=map(int,value.split(':'));return hour*60+minute


def clock(value):return f'{value//60:02}:{value%60:02}'


def prompt_stem(prompt_id,organization_id,prompts):
    identity(prompt_id)
    prompt=prompts.get(prompt_id)
    if not isinstance(prompt,dict) or prompt.get('id')!=prompt_id or prompt.get('organization_id')!=organization_id:
        raise FlowError('Aviso nao pertence a esta empresa.')
    digest=prompt.get('sha256');duration=prompt.get('duration_seconds')
    if not isinstance(digest,str) or not re.fullmatch(r'[a-f0-9]{64}',digest) or \
       type(duration) not in (int,float) or not 0<duration<=60:
        raise FlowError('Metadados do aviso invalidos.')
    return 'union/'+uuid.UUID(organization_id).hex+'/'+uuid.UUID(prompt_id).hex+'-'+digest


def target_number(target,organization_id,extensions,queues,legacy):
    if not isinstance(target,dict):raise FlowError('Destino do fluxo invalido.')
    if target=={'kind':'hangup'}:return None
    if set(target)!={'kind','id'} or target.get('kind') not in ('extension','queue'):
        raise FlowError('Tipo de destino do fluxo invalido.')
    target_id=identity(target['id'])
    state=(extensions if target['kind']=='extension' else queues).get(target_id)
    if not isinstance(state,dict) or state.get('id')!=target_id or state.get('organization_id')!=organization_id or state.get('enabled') is not True:
        raise FlowError('Destino de outra empresa, ausente ou desativado.')
    if target['kind']=='queue':return integer(state.get('test_extension'),850,899)
    number=integer(state.get('number'),100,9999);endpoint=state.get('endpoint')
    if 850<=number<=900:raise FlowError('Numero de destino reservado.')
    if not (legacy and endpoint=='union-301' and number==301) and \
       (not isinstance(endpoint,str) or not re.fullmatch(r'uw-[a-f0-9]{32}',endpoint)):
        raise FlowError('Endpoint fora do perfil gerenciado.')
    return number


def schedule_ranges(config):
    windows=config['windows'];holidays=config['holidays'];timezone=config['timezone']
    if type(config['schedule_enabled']) is not bool or not isinstance(windows,list) or len(windows)>28 or \
       not isinstance(holidays,list) or len(holidays)>366:
        raise FlowError('Configuracao dos horarios invalida.')
    if not isinstance(timezone,str) or len(timezone)>64 or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_+-]*(?:/[A-Za-z][A-Za-z0-9_+-]*){0,2}',timezone):
        raise FlowError('Fuso horario invalido.')
    if timezone!='UTC':
        try:ZoneInfo(timezone)
        except (ZoneInfoNotFoundError,ValueError):raise FlowError('Fuso horario indisponivel na central.') from None
    seen=set()
    for holiday in holidays:
        try:
            if not isinstance(holiday,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}',holiday) or date.fromisoformat(holiday).isoformat()!=holiday:
                raise ValueError()
        except ValueError:raise FlowError('Data de feriado invalida.') from None
        if holiday in seen:raise FlowError('Feriado duplicado.')
        seen.add(holiday)
    result=[]
    for window in windows:
        if not isinstance(window,dict) or set(window)!={'days','start','end'} or not isinstance(window['days'],list) or not 1<=len(window['days'])<=7:
            raise FlowError('Janela de atendimento invalida.')
        days=window['days']
        for day in days:integer(day,1,7)
        if len(set(days))!=len(days):raise FlowError('Dia da semana duplicado.')
        start=minutes(window['start']);end=minutes(window['end'],end=True)
        if start==end:raise FlowError('Inicio e fim do horario devem ser diferentes.')
        for day in sorted(days):
            if start<end:result.append((start,end-1,DAYS[day-1]))
            else:
                result.append((start,1439,DAYS[day-1]))
                if end:result.append((0,end-1,DAYS[day%7]))
    if config['schedule_enabled'] and not result:raise FlowError('Informe ao menos um horario de atendimento.')
    return result


def validate_flow(job,organization_id,extensions,queues,prompts,legacy=False):
    identity(organization_id)
    if not isinstance(job,dict) or set(job)!={'id','organization_id','name','test_extension','enabled','updated_at','config'}:
        raise FlowError('Trabalho de fluxo invalido.')
    flow_id=identity(job['id'])
    if job['organization_id']!=organization_id or type(job['enabled']) is not bool:
        raise FlowError('Fluxo nao pertence a esta empresa.')
    name=job['name']
    if not isinstance(name,str) or not 2<=len(name.strip())<=80 or re.search(r'[\x00-\x1f\x7f]',name):
        raise FlowError('Nome do fluxo invalido.')
    number=integer(job['test_extension'],100,9999)
    if 850<=number<=900 or legacy and number==301:raise FlowError('Numero de teste reservado.')
    for collection,key in ((extensions,'number'),(queues,'test_extension')):
        if any(state.get('organization_id')==organization_id and state.get(key)==number for state in collection.values()):
            raise FlowError('Numero de teste ja utilizado por ramal ou fila.')
    try:
        stamp=job['updated_at']
        if not isinstance(stamp,str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(?:Z|[+-][0-9]{2}:[0-9]{2})',stamp):raise ValueError()
        if datetime.fromisoformat(stamp.replace('Z','+00:00')).tzinfo is None:raise ValueError()
    except ValueError:raise FlowError('Versao do fluxo invalida.') from None
    if not job['enabled']:return flow_id
    config=job['config']
    if not isinstance(config,dict) or set(config)!=CONFIG_KEYS or type(config.get('version')) is not int or config['version']!=1 or config['mode'] not in ('menu','direct'):
        raise FlowError('Versao da configuracao de fluxo nao suportada.')
    integer(config['timeout_seconds'],5,30);integer(config['repeats'],0,3)
    schedule_ranges(config)
    target_number(config['fallback'],organization_id,extensions,queues,legacy)
    target_number(config['closed_target'],organization_id,extensions,queues,legacy)
    options=config['options']
    if not isinstance(options,list) or len(options)>10:raise FlowError('Opcoes da URA invalidas.')
    if config['mode']=='menu':
        if not options:raise FlowError('Informe ao menos uma opcao para a URA.')
        prompt_stem(config['prompt_id'],organization_id,prompts)
    elif options or config['prompt_id'] is not None:raise FlowError('Fluxo direto nao utiliza menu.')
    if config['closed_prompt_id'] is not None:prompt_stem(config['closed_prompt_id'],organization_id,prompts)
    digits=set()
    for option in options:
        if not isinstance(option,dict) or set(option)!={'digit','target'} or not isinstance(option['digit'],str) or not re.fullmatch(r'[0-9]',option['digit']) or option['digit'] in digits:
            raise FlowError('Tecla invalida ou duplicada na URA.')
        digits.add(option['digit']);target_number(option['target'],organization_id,extensions,queues,legacy)
    return flow_id


def compile_flow(job,organization_id,extensions,queues,prompts,legacy=False):
    flow_id=validate_flow(job,organization_id,extensions,queues,prompts,legacy)
    if not job['enabled']:return b''
    config=job['config'];context=flow_context(organization_id,flow_id)
    internal='union-internal' if legacy else 'uwi-'+uuid.UUID(organization_id).hex
    def destination(target):
        number=target_number(target,organization_id,extensions,queues,legacy)
        return 'Hangup()' if number is None else f'Goto({internal},{number},1)'
    lines=['; Union internal call flow. Generated; no external destinations.','['+context+']',
           'exten => s,1,NoOp(Union call flow)',' same => n,Set(UW_FLOW_TRIES=0)']
    if config['schedule_enabled']:
        for holiday in sorted(config['holidays']):
            lines.append(' same => n,GotoIf($["${STRFTIME(${EPOCH},'+config['timezone']+',%Y-%m-%d)}"="'+holiday+'"]?closed)')
        for start,end,day in schedule_ranges(config):
            lines.append(' same => n,GotoIfTime('+clock(start)+'-'+clock(end)+','+day+',*,*,'+config['timezone']+'?open)')
        lines.append(' same => n,Goto(closed)')
    if config['mode']=='menu':
        lines.extend([' same => n(open),Answer()',' same => n,Set(TIMEOUT(digit)=2)',
                      ' same => n(menu),Set(UW_FLOW_TRIES=$[${UW_FLOW_TRIES}+1])',
                      ' same => n,BackGround('+prompt_stem(config['prompt_id'],organization_id,prompts)+')',
                      ' same => n,WaitExten('+str(config['timeout_seconds'])+')',' same => n,Goto(retry)',
                      ' same => n(retry),GotoIf($[${UW_FLOW_TRIES}<'+str(config['repeats']+1)+']?menu)',
                      ' same => n,'+destination(config['fallback'])])
    else:lines.append(' same => n(open),'+destination(config['fallback']))
    # Finish the s priorities before defining any other extension. Asterisk's
    # relative n priorities must never depend on the most recently parsed digit.
    if config['closed_prompt_id'] is not None:
        lines.extend(['exten => s,n(closed),Answer()',
                      ' same => n,Playback('+prompt_stem(config['closed_prompt_id'],organization_id,prompts)+')',
                      ' same => n,'+destination(config['closed_target'])])
    else:lines.append('exten => s,n(closed),'+destination(config['closed_target']))
    if config['mode']=='menu':
        for option in sorted(config['options'],key=lambda item:item['digit']):
            lines.append('exten => '+option['digit']+',1,'+destination(option['target']))
        lines.extend(['exten => i,1,Goto(s,retry)','exten => t,1,Goto(s,retry)'])
    return ('\n'.join(lines)+'\n').encode()
