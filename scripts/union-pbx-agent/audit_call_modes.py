#!/usr/bin/env python3
"""Recoverable local-only native call-mode audit; no cloud, humans or provider."""
import argparse,base64,hashlib,json,os,re,secrets,socket,sys,threading,time,uuid
from pathlib import Path
from audit_sip_trunks import load_runtime
ROOT=Path('/var/lib/union-pbx-agent/call-mode-audits')
def digest(raw):return hashlib.sha256(raw).hexdigest()
def save(worker,folder,value):worker.write_atomic(folder/'state.json',worker.json_bytes(value))
def command(worker,value):return worker.strip_ansi(worker.asterisk(value))
def reload(worker):
 result=worker.guarded_reload('module reload res_pjsip.so')
 if 'reloaded successfully' not in result.lower():raise ValueError('SIP reload not acknowledged')
 worker.guarded_reload('module reload app_queue.so');worker.guarded_reload('dialplan reload')
def cleanup(worker,folder,state):
 if state.get('cleaned'):return
 if state['id']!=folder.name or not re.fullmatch(r'[a-f0-9]{32}',state['id']):raise ValueError('Invalid cleanup identity')
 allowed_main={'/etc/asterisk/pjsip.conf','/etc/asterisk/extensions.conf','/etc/asterisk/queues.conf'}
 allowed_files={str(Path('/etc/asterisk')/subdir/('audit-call-modes-'+state['id']+'.conf')) for subdir in ('pjsip.d','extensions.d','queues.d')}
 if any(item['path'] not in allowed_main for item in state['main']) or any(item['path'] not in allowed_files for item in state['files']):raise ValueError('Unexpected cleanup target')
 for line in command(worker,'core show channels concise').splitlines():
  channel=line.split('!',1)[0]
  if any(channel.startswith('PJSIP/'+ep+'-') for ep in state['endpoints']) and re.fullmatch(r'PJSIP/uw-[a-f0-9]{32}-[a-f0-9]+',channel):worker.asterisk('channel request hangup '+channel)
 deadline=time.monotonic()+5
 while True:
  try:worker.assert_no_calls();break
  except worker.Busy:
   if time.monotonic()>deadline:raise
   time.sleep(.1)
 for item in state['main']:
  p=Path(item['path'])
  if p.is_symlink() or digest(p.read_bytes()) not in item['accepted']:raise ValueError('Global configuration changed; preserve journal')
 for item in state['main']:
  p=Path(item['path']);worker.write_atomic(p,base64.b64decode(item['before']),item['mode'],item['gid']);os.chown(p,item['uid'],item['gid'])
 for item in state['files']:
  p=Path(item['path'])
  if p.is_symlink() or (p.exists() and digest(p.read_bytes())!=item['sha']):raise ValueError('Synthetic artifact changed')
  p.unlink(missing_ok=True)
 reload(worker);worker.assert_fvx(state['fvx']);state['cleaned']=True;save(worker,folder,state)
class Sink:
 def __init__(self):
  self.socket=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);self.socket.bind(('127.0.0.1',0));self.socket.settimeout(.1);self.port=self.socket.getsockname()[1];self.counts={};self.running=True
  self.thread=threading.Thread(target=self.run,daemon=True);self.thread.start()
 def run(self):
  while self.running:
   try:raw,peer=self.socket.recvfrom(65535)
   except socket.timeout:continue
   except OSError:return
   text=raw.decode(errors='replace');lines=text.split('\r\n')
   if not lines[0].startswith('INVITE '):continue
   user=lines[0].split('sip:',1)[1].split('@',1)[0];self.counts[user]=self.counts.get(user,0)+1
   headers=[]
   for name in ('Via','From','To','Call-ID','CSeq'):
    line=next((l for l in lines[1:] if l.lower().startswith(name.lower()+':')),None)
    if line:
     if name=='To' and ';tag=' not in line:line+=';tag=synthetic'
     headers.append(line)
   self.socket.sendto(('SIP/2.0 486 Busy Here\r\n'+'\r\n'.join(headers)+'\r\nContent-Length: 0\r\n\r\n').encode(),peer)
 def close(self):self.running=False;self.socket.close();self.thread.join(timeout=1)
def invite(caller,destination,password):
 with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as client:
  client.bind(('127.0.0.1',0));port=client.getsockname()[1];client.settimeout(.3)
  branch='z9hG4bK'+secrets.token_hex(10);cid=secrets.token_hex(16);tag=secrets.token_hex(8)
  uri='sip:'+str(destination)+'@127.0.0.1';sdp='v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=synthetic\r\nc=IN IP4 127.0.0.1\r\nt=0 0\r\nm=audio 9 RTP/AVP 8\r\na=rtpmap:8 PCMA/8000\r\na=sendrecv\r\n'
  common=['Via: SIP/2.0/UDP 127.0.0.1:'+str(port)+';branch='+branch,'From: <sip:'+caller+'@127.0.0.1>;tag='+tag,'To: <'+uri+'>','Call-ID: '+cid,'CSeq: 1 INVITE','Contact: <sip:'+caller+'@127.0.0.1:'+str(port)+'>','Max-Forwards: 70']
  request=('INVITE '+uri+' SIP/2.0\r\n'+'\r\n'.join(common)+'\r\nContent-Type: application/sdp\r\nContent-Length: '+str(len(sdp.encode()))+'\r\n\r\n'+sdp).encode()
  client.sendto(request,('127.0.0.1',5060));deadline=time.monotonic()+7;authenticated=False;sequence=1
  while time.monotonic()<deadline:
   try:raw,peer=client.recvfrom(65535)
   except socket.timeout:continue
   text=raw.decode(errors='replace');first=text.split('\r\n')[0]
   if not first.startswith('SIP/2.0 '):continue
   status=int(first.split()[1])
   if status<200:continue
   to=next(l for l in text.split('\r\n') if l.lower().startswith('to:'))
   ack=[common[0],common[1],to,common[3],'CSeq: '+str(sequence)+' ACK','Max-Forwards: 70','Content-Length: 0']
   client.sendto(('ACK '+uri+' SIP/2.0\r\n'+'\r\n'.join(ack)+'\r\n\r\n').encode(),peer)
   if status==401 and not authenticated:
    challenge=next(l.split(':',1)[1] for l in text.split('\r\n') if l.lower().startswith('www-authenticate:'))
    values={m[0]:m[1] or m[2] for m in re.findall(r'([a-zA-Z_-]+)=(?:"([^"]*)"|([^, ]+))',challenge)}
    algorithm=values.get('algorithm','MD5');hashfn=hashlib.sha256 if algorithm.upper()=='SHA-256' else hashlib.md5
    h=lambda value:hashfn(value.encode()).hexdigest()
    cnonce=secrets.token_hex(8);ha1=h(caller+':'+values['realm']+':'+password);ha2=h('INVITE:'+uri)
    response=h(ha1+':'+values['nonce']+':00000001:'+cnonce+':auth:'+ha2)
    authorization='Authorization: Digest username="'+caller+'", realm="'+values['realm']+'", nonce="'+values['nonce']+'", uri="'+uri+'", response="'+response+'", algorithm='+algorithm+', qop=auth, nc=00000001, cnonce="'+cnonce+'"'
    if values.get('opaque'):authorization+=', opaque="'+values['opaque']+'"'
    common[0]=common[0].split(';branch=',1)[0]+';branch=z9hG4bK'+secrets.token_hex(10);sequence=2;common[4]='CSeq: 2 INVITE'
    request=('INVITE '+uri+' SIP/2.0\r\n'+'\r\n'.join(common+[authorization])+'\r\nContent-Type: application/sdp\r\nContent-Length: '+str(len(sdp.encode()))+'\r\n\r\n'+sdp).encode()
    client.sendto(request,peer);authenticated=True;continue
   time.sleep(.1);return status
  raise ValueError('Synthetic SIP transaction timed out')
def run(directory,restore=None):
 worker,*_=load_runtime(directory)
 import call_modes as cm
 ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
 identity=restore or uuid.uuid4().hex
 if not re.fullmatch(r'[a-f0-9]{32}',identity):raise ValueError('Invalid audit identity')
 folder=ROOT/identity
 if restore:
  state=json.loads((folder/'state.json').read_text())
  with worker.operation_lock():cleanup(worker,folder,state)
  print(json.dumps({'id':identity,'cleaned':state['cleaned']}));return
 folder.mkdir(mode=0o700);org=str(uuid.UUID(identity));base='uwi-'+identity;queue='uwq-'+identity
 eps=['uw-'+identity[:24]+str(i).zfill(8) for i in range(1,5)]
 snapshot=dict(organization_id=org,revision=1,extensions=[dict(id=str(uuid.uuid4()),endpoint_name=ep,number=301+i,mode=mode,enabled=True,is_managed=True) for i,(ep,mode) in enumerate(zip(eps,('both','make_only','receive_only')))])
 state={'id':identity,'endpoints':eps,'main':[],'files':[],'cleaned':False,'passed':False,'external_calls':0,'human_calls':0}
 sink=Sink()
 try:
  with worker.operation_lock():
   worker.assert_no_calls();state['fvx']=worker.asterisk('pjsip show registrations')
   sip='; Synthetic loopback-only endpoints.\n';password=secrets.token_hex(24)
   for ep in eps:
    sip+='['+ep+'-auth]\ntype=auth\nauth_type=userpass\nusername='+ep+'\npassword='+password+'\n\n['+ep+']\ntype=aor\ncontact=sip:'+ep+'@127.0.0.1:'+str(sink.port)+'\n\n['+ep+']\ntype=endpoint\ntransport=transport-udp-local\ncontext='+cm.context_name(org)+'\nauth='+ep+'-auth\naors='+ep+'\nidentify_by=username,auth_username\ndeny=0.0.0.0/0\npermit=127.0.0.1/32\ndisallow=all\nallow=alaw\ndirect_media=no\n\n'
   body='['+base+']\n'
   for number,ep in zip((701,702,703),eps):body+='exten => '+str(number)+',1,Dial(PJSIP/'+ep+',1)\n same => n,Hangup()\n'
   body+='exten => 710,1,Queue('+queue+',,,,2)\n same => n,Hangup()\nexten => 711,1,Goto('+base+',702,1)\n'
   dial=cm.compile_context(snapshot,org,base)+cm.decorate_routes(body.encode(),org)
   queues=('['+queue+']\nstrategy=ringall\ntimeout=1\nretry=1\njoinempty=yes\nleavewhenempty=no\nringinuse=no\n'+''.join('member => PJSIP/'+ep+'\n' for ep in eps[:3])).encode()
   definitions=[(Path('/etc/asterisk/pjsip.conf'),Path('/etc/asterisk/pjsip.d')/('audit-call-modes-'+identity+'.conf'),sip.encode(),'pjsip.d'),(Path('/etc/asterisk/extensions.conf'),Path('/etc/asterisk/extensions.d')/('audit-call-modes-'+identity+'.conf'),dial,'extensions.d'),(Path('/etc/asterisk/queues.conf'),Path('/etc/asterisk/queues.d')/('audit-call-modes-'+identity+'.conf'),queues,'queues.d')]
   gid=worker.grp.getgrnam('asterisk').gr_gid
   for main,path,raw,subdir in definitions:
    if path.exists() or path.is_symlink():raise ValueError('Synthetic target occupied')
    info=main.stat();before=main.read_bytes();after=before+(b'' if before.endswith(b'\n') else b'\n')+('#include "'+subdir+'/'+path.name+'"\n').encode()
    state['main'].append(dict(path=str(main),before=base64.b64encode(before).decode(),accepted=[digest(before),digest(after)],mode=info.st_mode&0o777,uid=info.st_uid,gid=info.st_gid));state['files'].append(dict(path=str(path),sha=digest(raw)));save(worker,folder,state)
    worker.write_atomic(path,raw,0o640,gid);worker.write_atomic(main,after,info.st_mode&0o777,info.st_gid);os.chown(main,info.st_uid,info.st_gid)
   reload(worker)
   for ep in eps:
    deadline=time.monotonic()+8
    while cm.context_name(org) not in command(worker,'pjsip show endpoint '+ep):
     if time.monotonic()>deadline:raise ValueError('Synthetic endpoint not loaded')
     time.sleep(.2)
   results=[]
   tests=[('both_to_both',eps[0],701,eps[0],True),('receive_only_origin',eps[2],701,eps[0],False),('make_only_to_receive_only',eps[1],703,eps[2],True),('make_only_target',eps[0],702,eps[1],False),('transfer_target',eps[0],711,eps[1],False),('unknown_source',eps[3],701,eps[0],False)]
   for name,caller,target,callee,allowed in tests:
    worker.assert_no_calls();before=sink.counts.get(callee,0);status=invite(caller,target,password);received=sink.counts.get(callee,0)-before
    if bool(received)!=allowed or status<300:raise ValueError('Synthetic admission case failed: '+name+' status='+str(status)+' invites='+str(received))
    results.append(dict(name=name,invite_count=received,sip_status=status))
   before=dict(sink.counts);status=invite(eps[0],710,password)
   delta={ep:sink.counts.get(ep,0)-before.get(ep,0) for ep in eps[:3]}
   if delta[eps[1]]!=0 or not delta[eps[0]] or not delta[eps[2]]:raise ValueError('Synthetic queue admission failed')
   results.append(dict(name='queue',permitted_invites=delta[eps[0]]+delta[eps[2]],blocked_invites=delta[eps[1]],sip_status=status))
   state.update(passed=True,results=results,synthetic_calls=len(tests)+1);save(worker,folder,state)
 except Exception:
  print(json.dumps({'id':identity,'passed':False,'recovery':'--cleanup '+identity}),file=sys.stderr);raise
 finally:
  sink.close()
  with worker.operation_lock():cleanup(worker,folder,state)
 print(json.dumps({k:state[k] for k in ('id','passed','cleaned','results','synthetic_calls','external_calls','human_calls')}))
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');p.add_argument('--acknowledge-call-mode-audit',action='store_true');p.add_argument('--runtime-directory',type=Path,default=Path('/opt/union-pbx-agent'));p.add_argument('--cleanup');a=p.parse_args()
 if not a.apply:print(json.dumps({'preview':True,'human_calls':0,'external_calls':0,'synthetic_calls':7}));return 0
 if not a.acknowledge_call_mode_audit:return 2
 try:run(a.runtime_directory,a.cleanup);return 0
 except Exception as exc:print(json.dumps({'passed':False,'error_type':type(exc).__name__,'detail':str(exc) if isinstance(exc,ValueError) else 'Native audit failed'}),file=sys.stderr);return 1
if __name__=='__main__':raise SystemExit(main())
