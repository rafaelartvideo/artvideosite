import copy
import unittest
from universal_telephony import validate_document, compile_document, TelephonyError

ORG='11111111-1111-4111-8111-111111111111'
def uid(i): return '00000000-0000-4000-8000-'+str(i).zfill(12)
def document():
    d=dict(schema_version=1,routing_enabled=False,providers=[dict(id=uid(1),name='Provider',enabled=True,options={})],
      contracts=[dict(id=uid(2),provider_id=uid(1),name='Contract',enabled=True)],
      connections=[dict(id=uid(3),provider_id=uid(1),contract_id=uid(2),name='SIP',auth_mode='registration',host='sip.example.com',port=5060,transport='udp',username='alice',realm='*',inbound_cidrs=[],enabled=True,inbound_enabled=False,outbound_enabled=True)],
      trunks=[dict(id=uid(4),name='Trunk',connection_ids=[uid(3)],enabled=True)],
      capacity_pools=[dict(id=uid(5),scope='organization',scope_id=ORG,mode='shared',shared_limit=2,inbound_limit=None,outbound_limit=None,confidence='contract')],
      dids=[],groups=[dict(id=uid(6),name='Group',strategy='priority',members=[dict(connection_id=uid(3),trunk_id=uid(4),priority=1)],extension_ids=[uid(7)],enabled=True)],
      outbound_routes=[dict(id=uid(8),name='National',group_id=uid(6),priority=1,destination_pattern='br_national',prefix=None,caller_id=None,max_cost=None,options={},enabled=True)])

    for i,scope,sid in [(50,'provider',uid(1)),(51,'contract',uid(2)),(52,'connection',uid(3)),(53,'trunk',uid(4)),(54,'group',uid(6))]:
        d['capacity_pools'].append(dict(d['capacity_pools'][0],id=uid(i),scope=scope,scope_id=sid))
    return d

class UniversalTelephonyTests(unittest.TestCase):
    def test_draft_compiles_no_objects_or_routes(self):
        b=compile_document(document(),ORG,[],[],{})
        self.assertEqual(b.pjsip,b''); self.assertEqual(b.routes,b'')
    def test_rejects_cross_contract_and_sip_injection(self):
        for key,value in (('host','evil\ncontext=default'),('contract_id',uid(99)),('transport','SHELL(evil)')):
            d=document();d['connections'][0][key]=value
            with self.assertRaises(TelephonyError): validate_document(d,ORG)
    def test_activation_requires_known_capacity_and_legacy_coverage(self):
        d=document();d['routing_enabled']=True
        with self.assertRaises(TelephonyError): compile_document(d,ORG,[],[],{},legacy_coverage=False)
        d['capacity_pools'][0]['confidence']='unknown'
        with self.assertRaises(TelephonyError): validate_document(d,ORG)
    def test_duplicate_identity_different_ports_is_rejected(self):
        d=document(); other=copy.deepcopy(d['connections'][0]);other.update(id=uid(9),port=5061,username='ALICE');d['connections'].append(other)
        with self.assertRaises(TelephonyError):validate_document(d,ORG)
    def test_inbound_requires_cidr_and_exact_owned_did(self):
        d=document();d['connections'][0]['auth_mode']='ip';d['connections'][0]['inbound_enabled']=True
        with self.assertRaises(TelephonyError):validate_document(d,ORG)

    def test_configured_costs_are_validated_without_sip_configuration_escape(self):
        d=document();d['providers'][0]['options']={'destination_rates':[{'prefix':'55','cost':10}],'cost_unit':'BRL_micros'};d['outbound_routes'][0]['max_cost']=12
        validate_document(d,ORG)
        d['providers'][0]['options']['destination_rates'][0]['cost']=-1
        with self.assertRaises(TelephonyError):validate_document(d,ORG)

    def test_active_registration_compiles_one_router_and_separate_line_binding(self):
        d=document();d['routing_enabled']=True
        b=compile_document(d,ORG,[{'id':uid(7),'enabled':True}], [{'connection_id':uid(3),'password':'safe-pass'}],{'transport-udp':'udp'},legacy_coverage=True)
        self.assertIn(b'line=yes',b.pjsip)
        self.assertEqual(b.routes.count(b'Dial('),1)
        self.assertNotIn(b'password',b.routes)

    def test_registration_inbound_requires_and_emits_source_acl(self):
        d=document();d['routing_enabled']=True;d['connections'][0]['inbound_enabled']=True
        with self.assertRaises(TelephonyError):validate_document(d,ORG)
        d['connections'][0]['inbound_cidrs']=['192.0.2.0/24']
        b=compile_document(d,ORG,[{'id':uid(7),'enabled':True}],[{'connection_id':uid(3),'password':'safe-pass'}],{'transport-udp':'udp'},legacy_coverage=True)
        self.assertIn(b'deny=0.0.0.0/0\ndeny=::/0\npermit=192.0.2.0/24',b.pjsip)

    def test_ip_identification_overlap_is_rejected_instead_of_first_match(self):
        d=document();first=d['connections'][0];first.update(auth_mode='ip',username=None,inbound_enabled=True,inbound_cidrs=['192.0.2.0/24'])
        other=copy.deepcopy(first);other.update(id=uid(9),host='other.example.com',inbound_cidrs=['192.0.2.0/25']);d['connections'].append(other)
        with self.assertRaises(TelephonyError):validate_document(d,ORG)

    def test_to_header_entry_is_exact_contact_and_keeps_acl(self):
        from universal_telephony import names
        d=document();d['routing_enabled']=True;d['connections'][0].update(inbound_enabled=True,inbound_cidrs=['192.0.2.0/24']);d['providers'][0]['options']['did_source']='to_header'
        b=compile_document(d,ORG,[{'id':uid(7),'enabled':True}],[{'connection_id':uid(3),'password':'safe-pass'}],{'transport-udp':'udp'},legacy_coverage=True)
        self.assertIn(('exten => '+names(ORG,uid(3))['endpoint']+',1,AGI(').encode(),b.routes)
        self.assertNotIn(b'exten => _.,1,AGI(',b.routes)
        self.assertIn(b'permit=192.0.2.0/24',b.pjsip)

    def test_active_connection_requires_every_hierarchical_capacity_scope(self):
        d=document();d['routing_enabled']=True
        for scope in ('provider','contract','connection','trunk','group'):
            bad=copy.deepcopy(d);bad['capacity_pools']=[p for p in bad['capacity_pools'] if p['scope']!=scope]
            with self.subTest(scope=scope),self.assertRaises(TelephonyError):validate_document(bad,ORG)

    def test_independent_unknown_unused_direction_is_not_an_unlimited_route(self):
        d=document();d['routing_enabled']=True
        for p in d['capacity_pools']:p.update(mode='independent',shared_limit=None,inbound_limit=None,outbound_limit=2)
        validate_document(d,ORG)
        d['connections'][0].update(inbound_enabled=True,inbound_cidrs=['192.0.2.0/24'])
        with self.assertRaises(TelephonyError):validate_document(d,ORG)

if __name__=='__main__':unittest.main()
