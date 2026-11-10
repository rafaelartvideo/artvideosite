import copy
import unittest
import uuid

import call_flows as flows


class CallFlowTests(unittest.TestCase):
    def fixture(self):
        org=str(uuid.uuid4());eid=str(uuid.uuid4());qid=str(uuid.uuid4());pid=str(uuid.uuid4())
        extensions={eid:{'id':eid,'organization_id':org,'number':301,'enabled':True,'endpoint':'uw-'+uuid.uuid4().hex}}
        queues={qid:{'id':qid,'organization_id':org,'test_extension':850,'enabled':True}}
        prompts={pid:{'id':pid,'organization_id':org,'sha256':'a'*64,'duration_seconds':5}}
        job={'id':str(uuid.uuid4()),'organization_id':org,'name':'Atendimento','test_extension':910,
             'enabled':True,'updated_at':'2026-11-10T00:00:00Z','config':{
                 'version':1,'mode':'menu','prompt_id':pid,'closed_prompt_id':None,
                 'options':[{'digit':'1','target':{'kind':'extension','id':eid}},
                            {'digit':'2','target':{'kind':'queue','id':qid}}],
                 'fallback':{'kind':'hangup'},'closed_target':{'kind':'hangup'},
                 'timezone':'UTC','schedule_enabled':False,'windows':[],'holidays':[],
                 'timeout_seconds':8,'repeats':1}}
        return job,org,extensions,queues,prompts

    def test_menu_uses_only_owned_context_and_asset_paths(self):
        job,org,ext,queues,prompts=self.fixture()
        text=flows.compile_flow(job,org,ext,queues,prompts).decode()
        self.assertIn('['+flows.flow_context(org,job['id'])+']',text)
        self.assertIn('Goto(uwi-'+uuid.UUID(org).hex+',301,1)',text)
        self.assertIn('Goto(uwi-'+uuid.UUID(org).hex+',850,1)',text)
        self.assertIn('BackGround(union/'+uuid.UUID(org).hex+'/',text)
        self.assertIn('WaitExten(8)',text)
        self.assertIn('UW_FLOW_TRIES}<2',text)
        for forbidden in ('union-internal','union-301','union-fvx','System(','http:','https:','Record(','MixMonitor('):
            self.assertNotIn(forbidden,text)

    def test_cross_company_destinations_and_prompts_are_rejected(self):
        for collection in ('extensions','queues','prompts'):
            job,org,ext,queues,prompts=self.fixture()
            data={'extensions':ext,'queues':queues,'prompts':prompts}[collection]
            next(iter(data.values()))['organization_id']=str(uuid.uuid4())
            with self.assertRaises(flows.FlowError):flows.compile_flow(job,org,ext,queues,prompts)

    def test_disabled_flow_can_be_removed_after_its_old_targets_disappear(self):
        job,org,ext,queues,prompts=self.fixture();job['enabled']=False;job['config']=None
        self.assertEqual(flows.compile_flow(job,org,{}, {}, {}),b'')

    def test_namespace_number_and_digit_injection_fail(self):
        for update in ({'organization_id':str(uuid.uuid4())},{'id':'../../other'},{'test_extension':850},{'test_extension':True}):
            job,org,ext,queues,prompts=self.fixture();job.update(update)
            with self.assertRaises(flows.FlowError):flows.compile_flow(job,org,ext,queues,prompts)
        job,org,ext,queues,prompts=self.fixture();job['config']['options'][0]['digit']='1\nSystem(bad)'
        with self.assertRaises(flows.FlowError):flows.compile_flow(job,org,ext,queues,prompts)

    def test_direct_flow_preserves_unanswered_ringing_and_default_target(self):
        job,org,ext,queues,prompts=self.fixture();c=job['config']
        c.update(mode='direct',prompt_id=None,options=[],fallback={'kind':'extension','id':next(iter(ext))})
        text=flows.compile_flow(job,org,ext,queues,prompts).decode()
        self.assertNotIn('Answer()',text);self.assertNotIn('BackGround(',text)
        self.assertIn('Goto(uwi-'+uuid.UUID(org).hex+',301,1)',text)

    def test_overnight_hours_use_following_weekday_and_exclusive_end(self):
        job,org,ext,queues,prompts=self.fixture();c=job['config']
        c.update(schedule_enabled=True,windows=[{'days':[1],'start':'18:00','end':'02:00'}],holidays=['2026-11-20'])
        text=flows.compile_flow(job,org,ext,queues,prompts).decode()
        self.assertIn('GotoIfTime(18:00-23:59,mon,*,*,UTC?open)',text)
        self.assertIn('GotoIfTime(00:00-01:59,tue,*,*,UTC?open)',text)
        self.assertLess(text.index('2026-11-20'),text.index('GotoIfTime('))

    def test_schedule_and_retry_bounds_reject_invalid_configuration(self):
        mutations=[{'windows':[{'days':[1],'start':'08:00','end':'08:00'}]},
                   {'windows':[{'days':[True],'start':'08:00','end':'18:00'}]},
                   {'timezone':'UTC\n#include evil'},{'holidays':['2026-02-30']},
                   {'repeats':True},{'repeats':4},{'timeout_seconds':100}]
        for mutation in mutations:
            job,org,ext,queues,prompts=self.fixture();job['config'].update(mutation)
            with self.assertRaises(flows.FlowError):flows.compile_flow(job,org,ext,queues,prompts)

    def test_destination_must_be_active_and_manual_union_endpoint_is_legacy_only(self):
        job,org,ext,queues,prompts=self.fixture();extension=next(iter(ext.values()))
        extension['enabled']=False
        with self.assertRaises(flows.FlowError):flows.compile_flow(job,org,ext,queues,prompts)
        extension.update(enabled=True,endpoint='union-301')
        with self.assertRaises(flows.FlowError):flows.compile_flow(job,org,ext,queues,prompts)
        self.assertIn(b'Goto(union-internal,301,1)',flows.compile_flow(job,org,ext,queues,prompts,legacy=True))

    def test_flow_cannot_shadow_registered_numbers_or_duplicate_menu_keys(self):
        job,org,ext,queues,prompts=self.fixture();job['test_extension']=301
        with self.assertRaises(flows.FlowError):flows.compile_flow(job,org,ext,queues,prompts)
        job['test_extension']=910;job['config']['options'].append(copy.deepcopy(job['config']['options'][0]))
        with self.assertRaises(flows.FlowError):flows.compile_flow(job,org,ext,queues,prompts)


if __name__=='__main__':unittest.main()
