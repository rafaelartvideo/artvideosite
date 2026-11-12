import io
import unittest
from unittest.mock import patch

import recording_agi


class RecordingAgiTests(unittest.TestCase):
    def test_protocol_is_bounded_and_does_not_echo_environment(self):
        env = recording_agi.read_environment(io.StringIO('agi_channel: PJSIP/uw-test-00000001\nagi_uniqueid: 1794400000.1\n\n'))
        self.assertEqual(env['agi_uniqueid'], '1794400000.1')
        with self.assertRaises(recording_agi.CaptureError):
            recording_agi.read_environment(io.StringIO('x' * 5000 + '\n'))
        with self.assertRaises(recording_agi.CaptureError):
            recording_agi.read_environment(io.StringIO('agi_channel: one\nagi_channel: two\n\n'))

    def test_stop_command_can_only_stop_one_monitor_on_one_safe_channel(self):
        channel = 'PJSIP/uw-' + 'a' * 32 + '-00000001'
        self.assertEqual(recording_agi.stop_command(channel, '0x1234abcd'),
                         ['/usr/sbin/asterisk', '-rx', 'mixmonitor stop ' + channel + ' 0x1234abcd'])
        for bad in ('all', channel + '\ncore stop now', channel + ' other', 'PJSIP/../../other'):
            with self.assertRaises(recording_agi.CaptureError):
                recording_agi.stop_command(bad, '0x1234abcd')
        with self.assertRaises(recording_agi.CaptureError):
            recording_agi.stop_command(channel, '')

    def test_agi_reply_does_not_accept_unbounded_or_multiline_value(self):
        self.assertEqual(recording_agi.parse_reply('200 result=1 (0x1234abcd)\n'), (1, '0x1234abcd'))
        self.assertEqual(recording_agi.parse_reply('200 result=0\n'), (0, ''))
        for line in ('200 result=1 (secret)\ncore stop now', '510 Invalid', '200 result=1 (' + 'x' * 5000 + ')'):
            with self.assertRaises(recording_agi.CaptureError):
                recording_agi.parse_reply(line)

    def test_timer_stops_only_recording_without_hanging_up_call(self):
        channel = 'PJSIP/uw-' + 'a' * 32 + '-00000001'
        with patch.object(recording_agi.time, 'sleep') as sleep, patch.object(recording_agi.subprocess, 'run') as run, patch('sys.stdout',new_callable=io.StringIO):
            self.assertEqual(recording_agi.main(['--stop-after','300',channel,'0x1234abcd']),0)
        sleep.assert_called_once_with(300)
        self.assertEqual(run.call_args.args[0],recording_agi.stop_command(channel,'0x1234abcd'))
        self.assertNotIn('hangup',' '.join(run.call_args.args[0]).lower())


if __name__ == '__main__':
    unittest.main()
