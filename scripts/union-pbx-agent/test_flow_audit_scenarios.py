import unittest
from datetime import date

from flow_audit_scenarios import scenario_config, driver_steps, observations, SCENARIOS


class AuditScenarioTests(unittest.TestCase):
    def test_schedule_closed_and_holiday_are_deterministic(self):
        closed = scenario_config('closed-hours', 'prompt', date(2026, 11, 11))
        holiday = scenario_config('holiday', 'prompt', date(2026, 11, 11))
        self.assertEqual(closed['windows'], [{'days': [4], 'start': '00:00', 'end': '24:00'}])
        self.assertEqual(holiday['holidays'], ['2026-11-11'])
        self.assertEqual(holiday['timezone'], 'UTC')
        for config in (closed, holiday):
            self.assertTrue(config['schedule_enabled'])
            self.assertEqual(config['closed_target'], {'kind': 'hangup'})

    def test_driver_never_calls_an_endpoint_or_external_number(self):
        for scenario in SCENARIOS:
            text = driver_steps(scenario)
            for forbidden in ('Dial(', 'Queue(', 'PJSIP/', 'Record(', 'MixMonitor('):
                self.assertNotIn(forbidden, text)
        self.assertIn('SendDTMF(9)', driver_steps('invalid-digit'))
        self.assertNotIn('SendDTMF', driver_steps('menu-timeout'))
        with self.assertRaises(ValueError):
            driver_steps('1\nSystem(bad)')

    def test_evidence_must_show_executed_route_not_loaded_priorities(self):
        context = 'uwf-' + 'a' * 32 + '-' + 'b' * 32
        compiled = b'exten => s,1,Set(X=0)\n same => n(open),Answer()\n same => n,WaitExten(5)\n same => n(retry),GotoIf(0?open)\n same => n,Hangup()\nexten => s,n(closed),Hangup()\nexten => 1,1,Hangup()\n'
        incomplete = '[1@' + context + ':1] Hangup()\n'
        self.assertFalse(all(observations('menu-digit', incomplete, context, compiled, 'union/asset').values()))
        trace = 'Executing [1@' + context + ':1] Hangup()\nPlaying \'union/asset.slin\''
        self.assertTrue(all(observations('menu-digit', trace, context, compiled, 'union/asset').values()))
        self.assertTrue(all(observations('holiday', 'Executing [s@' + context + ':6] Hangup()', context, compiled, 'union/asset').values()))
        self.assertFalse(all(observations('holiday', 'Executing [s@' + context + ':5] Hangup()', context, compiled, 'union/asset').values()))

    def test_timeout_requires_actual_timeout_event_and_final_fallback(self):
        context = 'test-context'
        compiled = b'exten => s,1,WaitExten(5)\n same => n(retry),GotoIf(0?menu)\n same => n,Hangup()\nexten => s,n(closed),Hangup()\n'
        trace = "Playing 'union/asset.wav'\nExecuting [s@test-context:1] WaitExten()\nExecuting [s@test-context:3] Hangup()"
        self.assertFalse(all(observations('menu-timeout', trace, context, compiled, 'union/asset').values()))
        trace += '\nTimeout on Local/s@test-context-00000001;2, continuing...'
        self.assertTrue(all(observations('menu-timeout', trace, context, compiled, 'union/asset').values()))


if __name__ == '__main__':
    unittest.main()
