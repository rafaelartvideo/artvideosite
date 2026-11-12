import copy
import unittest
import uuid

import recordings


class RecordingCompilerTests(unittest.TestCase):
    def fixture(self):
        org = str(uuid.uuid4())
        policy = dict(organization_id=org, revision=str(uuid.uuid4()), enabled=True,
                      scopes=['internal', 'inbound', 'outbound'], notice_enabled=False,
                      notice_prompt_id=None, purpose='Atendimento', legal_basis='contract',
                      information_reference='Politica de atendimento', retention_days=30,
                      quota_bytes=1073741824, max_duration_seconds=3600)
        return org, policy

    def test_recordings_start_off_and_disabled_policy_emits_no_capture(self):
        org, policy = self.fixture()
        policy.update(enabled=False, scopes=[], legal_basis=None, purpose='', information_reference='')
        result = recordings.compile_context(policy, org).decode()
        self.assertIn('Return()', result)
        for forbidden in ('AGI(', 'MixMonitor(', 'Answer(', 'Playback('):
            self.assertNotIn(forbidden, result)

    def test_policy_isolated_optional_notice_and_no_caller_data_in_filename(self):
        org, policy = self.fixture()
        result = recordings.compile_context(policy, org).decode()
        self.assertIn('UW_REC_LEASE_' + uuid.UUID(org).hex, result)
        self.assertIn('recording_agi.py,start,' + org, result)
        for forbidden in ('CALLERID', 'System(', 'SHELL(', 'union-fvx', 'union-internal'):
            self.assertNotIn(forbidden, result)
        with self.assertRaises(recordings.RecordingError):
            recordings.compile_context(policy, str(uuid.uuid4()))

    def test_unsafe_or_unbounded_policy_is_rejected(self):
        mutations = [dict(scopes=['internal\nDial(bad)']), dict(enabled=1),
                     dict(quota_bytes=1), dict(retention_days=91), dict(max_duration_seconds=True),
                     dict(notice_enabled=True, notice_prompt_id=None), dict(legal_basis=None),
                     dict(revision='../escape')]
        for mutation in mutations:
            org, policy = self.fixture()
            policy.update(mutation)
            with self.subTest(mutation=mutation), self.assertRaises(recordings.RecordingError):
                recordings.compile_context(policy, org)

    def test_uniqueid_paths_and_endpoint_binding_are_exact(self):
        org, policy = self.fixture()
        name = recordings.recording_name(policy, org, '1794400000.17', 'internal')
        self.assertEqual(name, uuid.UUID(policy['revision']).hex + '/1794400000.17-internal.wav')
        for unique in ('../../escape', 'id,command', '${CALLERID(num)}', 'id\nstop'):
            with self.assertRaises(recordings.RecordingError):
                recordings.recording_name(policy, org, unique, 'internal')

    def test_answer_notice_uses_a_dedicated_s_subroutine(self):
        org, policy = self.fixture()
        policy.update(notice_enabled=True, notice_prompt_id=str(uuid.uuid4()))
        name = recordings.context_name(org) + '-notice-outbound'
        self.assertEqual(recordings.notice_option(policy, org, 'outbound'), 'U(' + name + ')')
        self.assertIn('[' + name + ']\nexten => s,1,AGI(', recordings.compile_context(policy, org).decode())

    def test_hooks_preserve_dial_guards_labels_and_queue_timeout(self):
        org, policy = self.fixture()
        policy.update(notice_enabled=True, notice_prompt_id=str(uuid.uuid4()))
        original = b'[owned]\nexten => _55.,1,GotoIf(denied)\n same => n(allowed),Dial(PJSIP/${EXTEN}@owned,30)\n same => n(denied),Hangup(21)\n'
        actual = recordings.decorate_routes(original, policy, org, 'outbound').decode()
        self.assertIn('GotoIf(denied)', actual)
        self.assertIn('same => n(allowed),Gosub(', actual)
        self.assertIn('same => n(denied),Hangup(21)', actual)
        self.assertIn('Dial(PJSIP/${EXTEN}@owned,30,U(', actual)
        queue = recordings.decorate_routes(b'[queue]\nexten => 850,1,Answer()\n same => n,Queue(uwq-owned,r,,,120)\n', policy, org, 'internal').decode()
        self.assertIn('Queue(uwq-owned,r,,,120,,uwrec-', queue)
        self.assertIn('-notice-internal)', queue)
        policy['enabled'] = False
        self.assertEqual(recordings.decorate_routes(original, policy, org, 'outbound'), original)


if __name__ == '__main__':
    unittest.main()
