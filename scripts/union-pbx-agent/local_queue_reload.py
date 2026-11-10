"""Authenticated, loopback-only AMI action for one exact managed queue.

This module neither enables AMI nor creates credentials or changes Asterisk
configuration. A separately reviewed activation must prepare the private file.
"""
import json
import os
from pathlib import Path
import re
import secrets
import socket
import stat
import time

CONFIG_FILE=Path('/etc/union-pbx-agent/local-manager.json')
QUEUE=re.compile(r'uwq-[a-f0-9]{32}')


class ManagerError(RuntimeError):
    pass


def load_credentials(path=CONFIG_FILE):
    try:
        if not hasattr(os,'O_NOFOLLOW'):
            raise ManagerError('Integracao local exige arquivos protegidos no Linux.')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC|os.O_NONBLOCK)
        with os.fdopen(fd,'rb') as stream:
            info=os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o600 or info.st_size>2048:
                raise ManagerError('Configuracao AMI local sem protecao obrigatoria.')
            data=json.loads(stream.read(2049))
        if not isinstance(data,dict) or set(data)!={'username','secret'}:
            raise ValueError()
        username,secret=data['username'],data['secret']
        if not isinstance(username,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',username):
            raise ValueError()
        if not isinstance(secret,str) or not re.fullmatch(r'[A-Za-z0-9_-]{43,128}',secret):
            raise ValueError()
        return username,secret
    except ManagerError:
        raise
    except (OSError,ValueError,TypeError):
        raise ManagerError('Configuracao AMI local ausente ou invalida.') from None


class _Session:
    def __init__(self,connection,deadline):
        self.connection=connection
        self.deadline=deadline
        self.buffer=b''

    def timeout(self):
        remaining=self.deadline-time.monotonic()
        if remaining<=0:
            raise ManagerError('Tempo limite da integracao AMI local.')
        self.connection.settimeout(min(2,remaining))

    def send(self,fields):
        action_id=secrets.token_hex(16)
        fields={**fields,'ActionID':action_id}
        self.timeout()
        self.connection.sendall((''.join(key+': '+value+'\r\n' for key,value in fields.items())+'\r\n').encode('ascii'))
        return action_id

    def frame(self):
        while b'\r\n\r\n' not in self.buffer:
            self.timeout()
            chunk=self.connection.recv(4096)
            if not chunk:
                raise ManagerError('A integracao AMI local encerrou sem confirmacao.')
            self.buffer+=chunk
            if len(self.buffer)>65536:
                raise ManagerError('Resposta AMI local excedeu o limite.')
        packet,self.buffer=self.buffer.split(b'\r\n\r\n',1)
        fields={}
        for line in packet.decode('ascii').split('\r\n'):
            if not line or line.startswith('Asterisk Call Manager/'):
                continue
            key,value=line.split(':',1)
            key=key.strip().lower()
            if not key or key in fields:
                raise ManagerError('Resposta AMI local ambigua.')
            fields[key]=value.strip()
        return fields

    def request(self,fields):
        action_id=self.send(fields)
        for _ in range(20):
            response=self.frame()
            if 'response' not in response:
                continue
            if response.get('actionid')!=action_id:
                raise ManagerError('Confirmacao AMI local nao corresponde a solicitacao.')
            if response['response'].lower()!='success':
                raise ManagerError('A integracao AMI local recusou a operacao.')
            return
        raise ManagerError('Confirmacao AMI local nao recebida.')


def _perform(queue=None):
    username,secret=load_credentials()
    try:
        deadline=time.monotonic()+5
        with socket.create_connection(('127.0.0.1',5038),timeout=2) as connection:
            session=_Session(connection,deadline)
            session.request({'Action':'Login','Username':username,'Secret':secret,'Events':'off'})
            if queue is not None:
                session.request({'Action':'QueueReload','Queue':queue,'Members':'yes','Parameters':'yes','Rules':'no'})
            try:
                session.send({'Action':'Logoff'})
            except (OSError,ManagerError):
                pass  # An acknowledged reload remains acknowledged if logoff fails.
    except ManagerError:
        raise
    except (OSError,ValueError,UnicodeError):
        # Never expose raw protocol replies, configuration or socket exceptions.
        raise ManagerError('Falha na comunicacao AMI local.') from None


def check_ready():
    """Authenticate without any reload; use before preparing configuration files."""
    _perform()


def reload_queue(queue):
    if not isinstance(queue,str) or not QUEUE.fullmatch(queue):
        raise ManagerError('Uma fila gerenciada exata e obrigatoria.')
    _perform(queue)
