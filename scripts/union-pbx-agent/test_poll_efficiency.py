"""Regression tests for the low-traffic PBX agent reporting rules."""
import unittest
from unittest.mock import patch
import agent


class PollEfficiencyTests(unittest.TestCase):
    def setUp(self):
        agent._SENT_REPORT_STATES.clear()

    def test_unchanged_success_report_is_throttled_then_reconciled(self):
        report = {'revision': 1, 'status': 'applied'}
        with patch.object(agent.time, 'monotonic', return_value=100.0):
            self.assertTrue(agent._should_send_report('call_modes', report))
            agent._mark_report_sent('call_modes', report)
            self.assertFalse(agent._should_send_report('call_modes', report))
        with patch.object(agent.time, 'monotonic', return_value=281.0):
            self.assertTrue(agent._should_send_report('call_modes', report))

    def test_new_revision_or_failed_report_sends_immediately(self):
        applied = {'revision': 1, 'status': 'applied'}
        with patch.object(agent.time, 'monotonic', return_value=100.0):
            agent._mark_report_sent('recording', applied)
            self.assertTrue(agent._should_send_report('recording', {'revision': 2, 'status': 'applied'}))
            self.assertTrue(agent._should_send_report('recording', {'revision': 1, 'status': 'failed'}))

    def test_recording_and_call_modes_have_separate_cadences(self):
        report = {'revision': 5, 'status': 'applied'}
        with patch.object(agent.time, 'monotonic', return_value=100.0):
            agent._mark_report_sent('recording', report)
            self.assertFalse(agent._should_send_report('recording', report))
            self.assertTrue(agent._should_send_report('call_modes', report))


if __name__ == '__main__':
    unittest.main()
