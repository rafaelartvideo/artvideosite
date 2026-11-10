import json
import multiprocessing
import os
from pathlib import Path
import socket
import stat
import tempfile
import threading
from unittest.mock import patch,Mock
import unittest

import local_queue_reload as ami


def read_fifo(path,result):
    try:
        ami.load_credentials(Path(path))
        result.put('unexpected success')
    except ami.ManagerError:
        result.put('rejected')


@unittest.skipUnless(os.name=='posix','The PBX agent runtime is Linux')
class LocalQueueReloadTests(unittest.TestCase):
    def exchange(self, queue, reject=None, wrong_id=False):
        client,server=socket.socketpair()
        packets=[]
        errors=[]
        def manager():
            try:
                with server,server.makefile('rb') as stream:
                    server.sendall(b'Asterisk Call Manager/9.0.0\r\n')
                    while True:
                        fields={}
                        while True:
                            line=stream.readline()
                            if not line:return
                            if line==b'\r\n':break
                            key,value=line.decode().strip().split(': ',1);fields[key]=value
                        packets.append(fields)
                        if fields['Action']=='Logoff':return
                        action_id='incorrect' if wrong_id else fields['ActionID']
                        response='Error' if reject==fields['Action'] else 'Success'
                        reply=('Response: '+response+'\r\nActionID: '+action_id+'\r\n\r\n').encode()
                        # Exercise packet fragmentation across both field and frame boundaries.
                        server.sendall(reply[:7]);server.sendall(reply[7:])
            except (OSError,ValueError) as exc:
                errors.append(type(exc).__name__)
        worker=threading.Thread(target=manager,daemon=True);worker.start()
        try:
            with patch.object(ami,'load_credentials',return_value=('union_agent','x'*64)),\
                 patch.object(ami.socket,'create_connection',return_value=client) as connect:
                operation=ami.check_ready if queue is None else lambda:ami.reload_queue(queue)
                if reject or wrong_id:
                    with self.assertRaises(ami.ManagerError):operation()
                else:operation()
                connect.assert_called_once_with(('127.0.0.1',5038),timeout=2)
        finally:
            client.close();worker.join(3)
            self.assertFalse(worker.is_alive())
        return packets

    def test_authenticated_action_has_exact_queue_combined_members_parameters_and_no_rules(self):
        queue='uwq-'+'a'*32
        packets=self.exchange(queue)
        self.assertEqual([packet['Action'] for packet in packets],['Login','QueueReload','Logoff'])
        self.assertEqual(packets[0]['Events'],'off')
        request=packets[1]
        self.assertEqual(request['Queue'],queue)
        self.assertEqual(request['Members'],'yes')
        self.assertEqual(request['Parameters'],'yes')
        self.assertEqual(request['Rules'],'no')
        self.assertEqual(set(request),{'Action','ActionID','Queue','Members','Parameters','Rules'})

    def test_login_rejection_never_sends_reload(self):
        packets=self.exchange('uwq-'+'a'*32,reject='Login')
        self.assertEqual([packet['Action'] for packet in packets],['Login'])

    def test_readiness_only_authenticates_and_logs_off(self):
        packets=self.exchange(None)
        self.assertEqual([packet['Action'] for packet in packets],['Login','Logoff'])

    def test_reload_rejection_is_not_reported_as_success(self):
        packets=self.exchange('uwq-'+'a'*32,reject='QueueReload')
        self.assertIn('QueueReload',[packet['Action'] for packet in packets])

    def test_acknowledged_reload_remains_successful_when_logoff_deadline_expires(self):
        original=ami._Session.send
        def send(session,fields):
            if fields['Action']=='Logoff':raise ami.ManagerError('expired cleanup deadline')
            return original(session,fields)
        with patch.object(ami._Session,'send',new=send):
            packets=self.exchange('uwq-'+'a'*32)
        self.assertEqual([packet['Action'] for packet in packets],['Login','QueueReload'])

    def test_response_from_another_transaction_is_rejected(self):
        packets=self.exchange('uwq-'+'a'*32,wrong_id=True)
        self.assertEqual([packet['Action'] for packet in packets],['Login'])

    def test_missing_queue_or_header_injection_is_rejected_before_any_access(self):
        with patch.object(ami,'load_credentials') as config,patch.object(ami.socket,'create_connection') as connect:
            for value in ('',None,'all','uwq-'+'a'*32+'\r\nAction: Originate','uwq-'+'A'*32):
                with self.assertRaises(ami.ManagerError):ami.reload_queue(value)
            config.assert_not_called();connect.assert_not_called()

    def test_connection_failure_is_bounded_and_does_not_expose_credentials(self):
        with patch.object(ami,'load_credentials',return_value=('union_agent','x'*64)),\
             patch.object(ami.socket,'create_connection',side_effect=TimeoutError('private diagnostic')):
            with self.assertRaises(ami.ManagerError) as failure:ami.reload_queue('uwq-'+'a'*32)
            self.assertNotIn('private diagnostic',str(failure.exception))
            self.assertNotIn('x'*64,str(failure.exception))

    def test_expired_deadline_never_sends_an_action(self):
        connection=Mock()
        with patch.object(ami.time,'monotonic',return_value=11):
            session=ami._Session(connection,deadline=10)
            with self.assertRaises(ami.ManagerError):session.request({'Action':'Login'})
        connection.sendall.assert_not_called()

    def test_oversized_frame_and_duplicate_response_headers_are_rejected(self):
        connection=Mock()
        connection.recv.return_value=b'x'*4096
        session=ami._Session(connection,deadline=ami.time.monotonic()+5)
        with self.assertRaises(ami.ManagerError):session.frame()
        session.buffer=b'Response: Success\r\nResponse: Error\r\n\r\n'
        with self.assertRaises(ami.ManagerError):session.frame()

    @unittest.skipUnless(os.name=='posix','Linux private credentials')
    def test_credentials_require_root_private_regular_file_and_strict_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'manager.json'
            raw=json.dumps({'username':'union_agent','secret':'x'*64}).encode();path.write_bytes(raw)
            def metadata(mode=0o600,uid=0):
                return os.stat_result((stat.S_IFREG|mode,0,0,1,uid,0,len(raw),0,0,0))
            with patch.object(ami.os,'fstat',return_value=metadata()):
                self.assertEqual(ami.load_credentials(path),('union_agent','x'*64))
            for mode,uid in ((0o644,0),(0o600,1000)):
                with patch.object(ami.os,'fstat',return_value=metadata(mode,uid)):
                    with self.assertRaises(ami.ManagerError):ami.load_credentials(path)
            path.write_text(json.dumps({'username':'bad\r\nAction: Originate','secret':'x'*64}))
            with patch.object(ami.os,'fstat',return_value=metadata()):
                with self.assertRaises(ami.ManagerError):ami.load_credentials(path)
            link=Path(directory)/'link';link.symlink_to(path)
            with self.assertRaises(ami.ManagerError):ami.load_credentials(link)

    def test_fifo_configuration_is_rejected_without_waiting_for_a_writer(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'fifo';os.mkfifo(path,0o600)
            context=multiprocessing.get_context('spawn');result=context.Queue()
            process=context.Process(target=read_fifo,args=(str(path),result))
            process.start();process.join(3)
            blocked=process.is_alive()
            if blocked:process.terminate();process.join(3)
            self.assertFalse(blocked,'A configuracao invalida bloqueou a abertura do arquivo.')
            self.assertEqual(result.get(timeout=1),'rejected')


if __name__=='__main__':unittest.main()
