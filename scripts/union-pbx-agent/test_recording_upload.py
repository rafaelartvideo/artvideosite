import io
import unittest
import wave
import csv
import tempfile
import json
import os
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch, Mock

import recording_upload as upload

ORG = '11111111-1111-4111-8111-111111111111'
RID = '22222222-2222-4222-8222-222222222222'


class UploadTests(unittest.TestCase):
    def test_local_expiry_is_bounded_and_does_not_need_a_cloud_ack(self):
        self.assertFalse(upload.locally_expired({'started_at':100,'expires_at':86500},200))
        self.assertTrue(upload.locally_expired({'started_at':100,'expires_at':86500},86501))
        for bad in ({'started_at':100},{'started_at':True,'expires_at':86500},
                    {'started_at':100,'expires_at':100+91*86400}):
            with self.assertRaises(upload.UploadError):upload.locally_expired(bad,200)

    def test_housekeeping_is_independent_of_cloud_failure(self):
        with patch.object(upload,'purge',side_effect=OSError),patch.object(upload,'purge_local_expired') as local:
            self.assertEqual(upload.housekeep(None,platform=True),['OSError'])
            local.assert_called_once_with(None)

    @unittest.skipUnless(os.name=='posix','POSIX private local spool')
    def test_existing_blob_retries_verified_completion_without_overwrite(self):
        for confirmed in (True,False):
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);revision='33333333-3333-4333-8333-333333333333'
                folder=root/ORG/revision.replace('-','');folder.mkdir(parents=True)
                (root/ORG).chmod(0o700);folder.chmod(0o700)
                candidate=folder/'call-internal.wav'
                with wave.open(str(candidate),'wb') as audio:
                    audio.setparams((1,2,8000,0,'NONE','not compressed'));audio.writeframes(b'\x01\x00'*8000)
                os.utime(candidate,(1,1))
                reserve=candidate.with_suffix('.reserve')
                reserve.write_text(json.dumps(dict(reserved_bytes=50000,unique_id='call',scope='internal',revision=revision,started_at=100,expires_at=86500)));reserve.chmod(0o600)
                def reply(agent,payload):
                    if payload['kind']=='prepare':
                        r=payload['record'];return dict(accepted=True,id=RID,path=ORG+'/'+RID+'.wav',signed_url=upload.ORIGIN+'/storage/v1/object/upload/sign/pbx-call-recordings/'+ORG+'/'+RID+'.wav?token=x',**{k:r[k] for k in ('event_id','scope','sha256','size_bytes')})
                    return {'accepted':confirmed,'id':RID}
                with patch.object(upload,'SPOOL_ROOT',root),patch.object(upload,'prove_closed'),patch.object(upload,'exact_event',return_value={'event_id':'call:1'}),patch.object(upload.time,'time',return_value=200),patch.object(upload,'transfer',side_effect=upload.UploadError('object exists')),patch.object(upload,'send',side_effect=reply):
                    if confirmed:self.assertTrue(upload.deliver(None,ORG,set(),candidate,os.getuid()))
                    else:
                        with self.assertRaises(upload.UploadError):upload.deliver(None,ORG,set(),candidate,os.getuid())
                self.assertEqual(candidate.exists(),not confirmed);self.assertEqual(reserve.exists(),not confirmed)

    @unittest.skipUnless(os.name=='posix','POSIX private local spool')
    def test_housekeeping_expires_an_offline_company_without_sending_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            revision='33333333-3333-4333-8333-333333333333'
            folder=root/ORG/revision.replace('-','')
            folder.mkdir(parents=True)
            (root/ORG).chmod(0o700);folder.chmod(0o700)
            candidate=folder/'old-internal.wav';candidate.write_bytes(b'owned expired synthetic bytes')
            reserve=candidate.with_suffix('.reserve')
            reserve.write_text(json.dumps(dict(reserved_bytes=50000,unique_id='old',scope='internal',revision=revision,started_at=100,expires_at=86500)))
            reserve.chmod(0o600)
            with patch.object(upload,'SPOOL_ROOT',root),patch.object(upload,'prove_closed') as closed,patch.object(upload.time,'time',return_value=90000),patch.object(upload,'send') as send:
                self.assertEqual(upload.purge_local_expired(None,uid=os.getuid()),1)
                send.assert_not_called();closed.assert_called_once()
            self.assertFalse(candidate.exists());self.assertFalse(reserve.exists())

    @unittest.skipUnless(os.name=='posix','POSIX private local spool')
    def test_failed_start_reservation_is_reclaimed_only_after_channel_is_gone(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);revision='33333333-3333-4333-8333-333333333333'
            folder=root/ORG/revision.replace('-','');folder.mkdir(parents=True)
            (root/ORG).chmod(0o700);folder.chmod(0o700)
            channel='PJSIP/uw-'+'a'*32+'-00000001'
            reserve=folder/'failed-internal.reserve'
            reserve.write_text(json.dumps(dict(reserved_bytes=50000,unique_id='failed',scope='internal',revision=revision,started_at=100,expires_at=86500,channel=channel)));reserve.chmod(0o600)
            worker=root/'worker';worker.mkdir()
            def atomic(path,raw):path.write_bytes(raw);path.chmod(0o600)
            agent=SimpleNamespace(STATE_DIR=worker,write_atomic=atomic,strip_ansi=lambda value:value,asterisk=Mock(return_value='Active channel'))
            with patch.object(upload,'SPOOL_ROOT',root),patch.object(upload,'prove_closed') as closed,patch.object(upload.time,'time',return_value=500):
                self.assertEqual(upload.purge_local_expired(agent,uid=os.getuid()),0)
                self.assertTrue(reserve.exists());closed.assert_not_called()
                # The fixture can run as nobody; real cursors are root-owned.
                (worker/'recording-retention-cursor.json').unlink()
                agent.asterisk.return_value=channel+' is not a known channel'
                self.assertEqual(upload.purge_local_expired(agent,uid=os.getuid()),1)
                closed.assert_called_once();self.assertFalse(reserve.exists())
    @unittest.skipUnless(os.name=='posix','POSIX private local spool')
    def test_empty_unanswered_wave_requires_owned_reservation_and_closed_channel(self):
        for active,mismatched in ((True,False),(False,True),(False,False)):
            with tempfile.TemporaryDirectory() as directory:
                root=Path(directory);revision='33333333-3333-4333-8333-333333333333'
                folder=root/ORG/revision.replace('-','');folder.mkdir(parents=True)
                (root/ORG).chmod(0o700);folder.chmod(0o700)
                candidate=folder/'empty-internal.wav'
                with wave.open(str(candidate),'wb') as audio:
                    audio.setparams((1,2,8000,0,'NONE','not compressed'))
                channel='PJSIP/uw-'+'a'*32+'-00000001'
                reserve=candidate.with_suffix('.reserve')
                reserve.write_text(json.dumps(dict(unique_id='other' if mismatched else 'empty',scope='internal',revision=revision,started_at=100,expires_at=86500,channel=channel)));reserve.chmod(0o600)
                def atomic(path,raw):path.write_bytes(raw);path.chmod(0o600)
                agent=SimpleNamespace(STATE_DIR=root,write_atomic=atomic,strip_ansi=lambda value:value,asterisk=Mock(return_value='Active channel' if active else channel+' is not a known channel'))
                with patch.object(upload,'SPOOL_ROOT',root),patch.object(upload,'prove_closed') as closed,patch.object(upload.time,'time',return_value=500):
                    # No cursor is needed for this single-company fixture.
                    self.assertEqual(upload.purge_local_expired(None if mismatched else agent,uid=os.getuid()),int(not active and not mismatched))
                self.assertEqual(candidate.exists(),active or mismatched)
                self.assertEqual(reserve.exists(),active or mismatched)

    def test_url_exact_private_destination(self):
        path = ORG + '/' + RID + '.wav'
        url = upload.ORIGIN + '/storage/v1/object/upload/sign/pbx-call-recordings/' + path + '?token=a%2Fb'
        self.assertEqual(upload.upload_url(url, path).hostname, 'wmjmtcjpunmzvonlkjcu.supabase.co')
        for bad in (url.replace(upload.ORIGIN, 'https://evil.example'), url + '&token=b', url + '#x', url.replace('/' + RID, '/other')):
            with self.assertRaises(upload.UploadError):
                upload.upload_url(bad, path)

    def test_wave_requires_all_declared_frames(self):
        stream = io.BytesIO()
        with wave.open(stream, 'wb') as audio:
            audio.setparams((1, 2, 8000, 0, 'NONE', 'not compressed'))
            audio.writeframes(b'\x00\x00' * 8000)
        raw = stream.getvalue()
        self.assertEqual(upload.wave_duration(io.BytesIO(raw)), 1)
        with self.assertRaises(upload.UploadError):
            upload.wave_duration(io.BytesIO(raw[:-2]))

    def test_ticket_echoes_and_idempotent_ticket(self):
        record = dict(event_id='abc:2', scope='internal', sha256='a' * 64, size_bytes=44)
        ticket = dict(accepted=True, already_ready=True, id=RID, event_id='abc:2', scope='internal')
        self.assertEqual(upload.validate_ticket(ticket, ORG, record), RID)
        ticket['event_id'] = 'other:2'
        with self.assertRaises(upload.UploadError):
            upload.validate_ticket(ticket, ORG, record)

    def test_cdr_exact_uniqueid_highest_owned_sequence(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'calls.csv'
            with path.open('w', newline='') as stream:
                writer = csv.writer(stream)
                for unique, sequence, channel in [('same', 2, 'owned'), ('same', 9, 'foreign'), ('same-extra', 99, 'owned'), ('same', 3, 'owned')]:
                    writer.writerow([unique, sequence, unique, '1700000000', '1700000001', '1700000005', '100', '200', 'PJSIP/' + channel + '-00000001', '', 'ANSWERED', '5', '4'])
            self.assertEqual(upload.exact_event('same', {'owned'}, path)['event_id'], 'same:3')
            self.assertIsNone(upload.exact_event('unknown', {'owned'}, path))

    def test_prove_closed_busy_unknown_and_identity_change(self):
        context = Mock()
        context.__enter__ = Mock(return_value=iter([Mock(path='/proc/1/fd/5')]))
        context.__exit__ = Mock(return_value=False)
        candidate = Path('/private/call.wav')
        with patch.object(upload, 'asterisk_identity', return_value=('1', '10')), patch.object(upload.os, 'scandir', return_value=context), patch.object(upload.os, 'readlink', return_value=str(candidate)):
            with self.assertRaises(upload.UploadError):
                upload.prove_closed(Path('/private/call.wav'), 1000)
        context.__enter__ = Mock(return_value=iter([]))
        with patch.object(upload, 'asterisk_identity', side_effect=[('1', '10'), ('1', '11')]), patch.object(upload.os, 'scandir', return_value=context):
            with self.assertRaises(upload.UploadError):
                upload.prove_closed(candidate, 1000)
        with patch.object(upload, 'asterisk_identity', side_effect=PermissionError):
            with self.assertRaises(PermissionError):
                upload.prove_closed(Path('/private/call.wav'), 1000)

    def test_transfer_rejects_redirect(self):
        path = ORG + '/' + RID + '.wav'
        connection = Mock()
        connection.getresponse.return_value.status = 302
        with patch.object(upload.http.client, 'HTTPSConnection', return_value=connection):
            with self.assertRaises(upload.UploadError):
                upload.transfer(io.BytesIO(b'abc'), 3, upload.ORIGIN + '/storage/v1/object/upload/sign/pbx-call-recordings/' + path + '?token=x', path)
        connection.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
