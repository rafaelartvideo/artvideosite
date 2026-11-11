import unittest
import uuid
from unittest.mock import patch, Mock
import contingency_audit as audit

from contingency_audit import abandoned_count, probe_spec


class ContingencyAuditTests(unittest.TestCase):
    def test_call_can_only_reach_a_fresh_uuid_internal_context(self):
        org = str(uuid.uuid4())
        command, context = probe_spec(org)
        self.assertEqual(context, 'uwi-' + uuid.UUID(org).hex)
        self.assertEqual(command, 'channel originate Local/850@' + context + '/n application Wait 40')
        for bad in ('union-internal', org + '\nDial(PJSIP/union-fvx)', '../tenant', org.upper()):
            if bad == org:
                continue
            with self.assertRaises(ValueError):
                probe_spec(bad)

    def test_counter_must_come_from_the_exact_queue_summary(self):
        name = 'uwq-' + uuid.uuid4().hex
        self.assertEqual(abandoned_count(name + ' has 0 calls (max unlimited) in linear strategy (C:2, A:3, SL:0.0%)', name), 3)
        with self.assertRaises(ValueError):
            abandoned_count('foreign has 0 calls (C:2, A:3)', name)
        with self.assertRaises(ValueError):
            abandoned_count(name + ' has 0 calls (C:2)', name)

    def test_cleanup_never_restarts_the_probe_after_failure(self):
        for fail_before_verify in (True, False):
            state = {'passed': False, 'plan': [{}]}
            baseline = Mock()
            probe = Mock(side_effect=RuntimeError('synthetic failure'))
            def cleanup(*args):
                audit.isolation._verify_production(None, state)
            def run():
                try:
                    if fail_before_verify:
                        raise RuntimeError('setup failed')
                    audit.isolation._verify_production(None, state)
                finally:
                    audit.isolation._cleanup_locked(None, None, state)
            with patch.object(audit.isolation, '_verify_production', baseline), \
                 patch.object(audit.isolation, '_cleanup_locked', cleanup), \
                 patch.object(audit.isolation, '_worker', return_value=None), \
                 patch.object(audit.isolation, 'run', run), \
                 patch.object(audit, 'offline_timeout_probe', probe):
                self.assertEqual(audit.main(['--apply', '--acknowledge-contingency-audit']), 1)
            baseline.assert_called_once()
            self.assertEqual(probe.call_count, 0 if fail_before_verify else 1)

    def test_explicit_recovery_never_originates_a_call(self):
        baseline = Mock()
        state = {'passed': False, 'plan': [{}]}
        def cleanup(identity):
            audit.isolation._verify_production(None, state)
        with patch.object(audit.isolation, '_verify_production', baseline), \
             patch.object(audit.isolation, 'cleanup', cleanup), \
             patch.object(audit, 'offline_timeout_probe') as probe:
            self.assertEqual(audit.main(['--apply', '--acknowledge-contingency-audit', '--cleanup', 'a' * 32]), 0)
        probe.assert_not_called()
        baseline.assert_called_once()


if __name__ == '__main__':
    unittest.main()
