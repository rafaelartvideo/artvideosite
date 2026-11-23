import unittest
import os
import tempfile
import time
from pathlib import Path
from unittest.mock import patch
from universal_capacity_agi import choose, pools_for, AdmissionError,run,resolve_inbound,trusted_ledger
from universal_capacity import Ledger
from universal_telephony import names
from test_universal_telephony import document,ORG,uid

class AdmissionTests(unittest.TestCase):
    def fixture(self,endpoint,header=''):
        d=document();d['routing_enabled']=True;d['connections'][0].update(inbound_enabled=True,inbound_cidrs=['192.0.2.0/24'])
        d['providers'][0]['options']['did_source']='to_header'
        d['dids']=[dict(id=uid(20),connection_id=uid(3),number='+5511999999999',destination_kind='extension',destination_id=uid(7),enabled=True)]
        d['outbound_routes'][0]['caller_id']='+5511999999999'
        value=dict(snapshot=dict(document=d,organization_id=ORG,revision=1,extensions=[dict(id=uid(7),endpoint_name='uw-test',enabled=True,external_mode='both')]),boot='boot',connections={uid(3):dict(state='registered',checked_at=time.time())},destinations={uid(20):dict(context='uw-owned',extension='301')})
        class FakeAgi:
            def __init__(self):self.commands=[]
            def request(self,command):
                self.commands.append(command)
                if 'CHANNEL(endpoint)' in command:return 1,endpoint
                if 'PJSIP_HEADER(read,To)' in command:return 1,header
                if 'CHANNEL(pjsip,remote_addr)' in command:return 1,'192.0.2.10:5060'
                return 1,''
        return value,FakeAgi()

    def test_to_header_strict_did_uri_and_own_request_uri(self):
        value,_=self.fixture('unused');d=value['snapshot']['document'];c=d['connections'][0];contact=names(ORG,uid(3))['endpoint']
        self.assertEqual(resolve_inbound(value,c,contact,'<sip:+5511999999999@sip.example.com>;tag=a')['id'],uid(20))
        for request,header in [(contact,'<sip:+5511999999999@evil.example.com>'),(contact,'<sip:+5511888888888@sip.example.com>'),('foreign-contact','<sip:+5511999999999@sip.example.com>'),(contact,'<sip:+5511999999999@sip.example.com>,<sip:123@sip.example.com>'),(contact,'<sip:${SHELL(x)}@sip.example.com>'),(contact,'<sip:+5511999999999@sip.example.com>\r\nX: evil')]:
            with self.subTest(header=header),self.assertRaises(AdmissionError):resolve_inbound(value,c,request,header)

    def test_real_admission_sets_authorized_caller_id_and_inbound_external_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'ledger.sqlite';ledger=Ledger(path);path.chmod(0o660)
            value,agi=self.fixture('uw-test');ledger.admit(ORG,1,'boot',time.time()+90,value['snapshot']['document']['capacity_pools'],complete=True)
            with patch('universal_capacity_agi.LEDGER',path),patch('universal_capacity_agi.trusted_manifest',return_value=value):
                run(['outbound',ORG,'5511999999999'],{'agi_uniqueid':'out','agi_channel':'PJSIP/uw-test-00000001'},agi)
            self.assertIn('SET VARIABLE CALLERID(num) +5511999999999',agi.commands)
            endpoint=names(ORG,uid(3))['endpoint'];value,agi=self.fixture(endpoint,'<sip:+5511999999999@sip.example.com>')
            with patch('universal_capacity_agi.LEDGER',path),patch('universal_capacity_agi.trusted_manifest',return_value=value):
                run(['inbound',ORG,uid(3),endpoint],{'agi_uniqueid':'in','agi_channel':'PJSIP/'+endpoint+'-00000002'},agi)
            self.assertIn('SET VARIABLE __UWCM_EXTERNAL "1"',agi.commands)
            self.assertEqual(len(ledger.legs(ORG)),2)

    def test_forged_peer_is_denied_before_any_header_or_reservation(self):
        endpoint=names(ORG,uid(3))['endpoint'];value,agi=self.fixture(endpoint,'<sip:+5511999999999@sip.example.com>')
        original=agi.request
        def request(command):
            if 'CHANNEL(pjsip,remote_addr)' in command:return 1,'198.51.100.1:5060'
            return original(command)
        agi.request=request
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'ledger.sqlite';ledger=Ledger(path);path.chmod(0o660)
            ledger.admit(ORG,1,'boot',time.time()+90,value['snapshot']['document']['capacity_pools'],complete=True)
            with patch('universal_capacity_agi.LEDGER',path),patch('universal_capacity_agi.trusted_manifest',return_value=value),self.assertRaises(AdmissionError):
                run(['inbound',ORG,uid(3),endpoint],{'agi_uniqueid':'forged','agi_channel':'PJSIP/'+endpoint+'-00000001'},agi)
            self.assertEqual(ledger.legs(ORG),())
            self.assertFalse(any('PJSIP_HEADER' in command for command in agi.commands))
    def test_scopes_include_company_provider_contract_connection_group_trunk(self):
        d=document()
        self.assertEqual(set(pools_for(d,uid(3),uid(4),uid(6))),{uid(5),uid(50),uid(51),uid(52),uid(53),uid(54)})
    def test_authenticated_endpoint_and_external_mode_required(self):
        manifest={'snapshot':{'document':document(),'extensions':[{'id':uid(7),'endpoint_name':'uw-test','enabled':True,'external_mode':'receive_only'}]}}
        for endpoint in ('uw-test','evil'):
            with self.assertRaises(AdmissionError):choose(manifest,endpoint,'5511999999999')
    def test_number_route_never_accepts_dialplan_injection(self):
        manifest={'snapshot':{'document':document(),'extensions':[{'id':uid(7),'endpoint_name':'uw-test','enabled':True,'external_mode':'both'}]}}
        with self.assertRaises(AdmissionError):choose(manifest,'uw-test','${SHELL(evil)}')

    def test_cost_ceiling_selects_longest_provider_rate_and_unknown_fails_closed(self):
        d=document();d['outbound_routes'][0]['max_cost']=10
        d['providers'][0]['options']={'destination_rates':[{'prefix':'55','cost':5},{'prefix':'5511','cost':20}],'cost_unit':'BRL_micros'}
        manifest={'snapshot':{'document':d,'extensions':[{'id':uid(7),'endpoint_name':'uw-test','enabled':True,'external_mode':'both'}]}}
        with self.assertRaises(AdmissionError):choose(manifest,'uw-test','5511999999999')
        self.assertEqual(len(choose(manifest,'uw-test','5521999999999')),1)
        d['providers'][0]['options']={}
        with self.assertRaises(AdmissionError):choose(manifest,'uw-test','5521999999999')

    def test_inbound_uses_every_matching_trunk_pool(self):
        d=document();d['trunks'].append(dict(id=uid(44),name='Second trunk',connection_ids=[uid(3)],enabled=True));d['capacity_pools'].append(dict(d['capacity_pools'][0],id=uid(11),scope='trunk',scope_id=uid(44)))
        self.assertIn(uid(11),pools_for(d,uid(3)))

if __name__=='__main__':unittest.main()

class LedgerProtectionTests(unittest.TestCase):
    @unittest.skipUnless(os.name=='posix','Linux file ownership')
    def test_call_cannot_create_database_or_open_world_writable_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'missing.sqlite'
            with patch('universal_capacity_agi.LEDGER',path),self.assertRaises(AdmissionError):trusted_ledger()
            self.assertFalse(path.exists())
            Ledger(path);path.chmod(0o666)
            with patch('universal_capacity_agi.LEDGER',path),self.assertRaises(AdmissionError):trusted_ledger()
