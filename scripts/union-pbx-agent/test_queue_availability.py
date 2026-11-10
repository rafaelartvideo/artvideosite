import unittest
import uuid
from unittest.mock import patch

import queue_availability as controls

ORG = str(uuid.uuid4())
QUEUE = str(uuid.uuid4())
EXTENSION = str(uuid.uuid4())
ENDPOINT = 'uw-' + EXTENSION.replace('-', '')


def job(**changes):
    return dict(queue_id=QUEUE, extension_id=EXTENSION, organization_id=ORG,
                revision=str(uuid.uuid4()), endpoint_name=ENDPOINT, number=302,
                desired_paused=True, **changes)


def states():
    return {QUEUE: dict(organization_id=ORG, enabled=True,
                       members=[dict(endpoint_name=ENDPOINT, number=302)])}


def output(paused=False):
    return f'uwq-{QUEUE.replace("-", "")} has 0 calls\n   Ramal 302 (PJSIP/{ENDPOINT}) (ringinuse disabled) ' + ('(paused:UnionCRM) ' if paused else '') + '(Not in use) has taken 0 calls\n'


class QueueAvailabilityTests(unittest.TestCase):
    def test_extension_database_id_and_endpoint_uuid_are_independent(self):
        item = job(); item['extension_id'] = str(uuid.uuid4())
        self.assertTrue(controls.apply_job(item, ORG, states(), lambda _: output(True)))

    def test_pause_names_only_one_exact_queue_and_confirms_real_state(self):
        commands = []
        def cli(command):
            commands.append(command)
            return output(len(commands) >= 3) if command.startswith('queue show') else 'success'
        self.assertTrue(controls.apply_job(job(), ORG, states(), cli))
        self.assertEqual(commands[1], f'queue pause member PJSIP/{ENDPOINT} queue uwq-{QUEUE.replace("-", "")} reason UnionCRM')
        self.assertEqual(len(commands), 3)
        self.assertFalse(any('reload' in value or 'restart' in value for value in commands))

    def test_unpause_and_idempotent_confirm_do_not_send_duplicate_action(self):
        item = job(); item['desired_paused'] = False
        commands = []
        def cli(command):
            commands.append(command)
            return output(len(commands) == 1)
        self.assertTrue(controls.apply_job(item, ORG, states(), cli))
        self.assertIn('queue unpause member', commands[1])
        commands.clear()
        self.assertTrue(controls.apply_job(job(), ORG, states(), lambda command: commands.append(command) or output(True)))
        self.assertEqual(len(commands), 1)

    def test_cross_tenant_injection_removed_member_and_disabled_queue_never_run_cli(self):
        for changes in [dict(organization_id=str(uuid.uuid4())), dict(endpoint_name=ENDPOINT+'\nqueue reset all'),
                        dict(queue_id='../other'), dict(number=301), dict(desired_paused='true'), dict(revision='bad')]:
            item = job(); item.update(changes)
            with self.assertRaises(controls.AvailabilityError):
                controls.apply_job(item, ORG, states(), lambda _: self.fail('CLI executed'))
        for state in [{}, {QUEUE: {**states()[QUEUE], 'enabled': False}}, {QUEUE: {**states()[QUEUE], 'organization_id': str(uuid.uuid4())}}]:
            with self.assertRaises(controls.AvailabilityError):
                controls.apply_job(job(), ORG, state, lambda _: self.fail('CLI executed'))

    def test_absent_runtime_member_or_unconfirmed_result_never_succeeds(self):
        with self.assertRaises(controls.AvailabilityError):
            controls.apply_job(job(), ORG, states(), lambda _: 'No such queue')
        with self.assertRaises(controls.AvailabilityError):
            controls.apply_job(job(), ORG, states(), lambda _: output(False))

    def test_result_report_is_revision_scoped_and_errors_do_not_expose_command_output(self):
        item = job()
        results = controls.process_jobs([item], ORG, states(), lambda _: (_ for _ in ()).throw(TimeoutError('secret data')))
        self.assertEqual(results[0]['queue_id'], QUEUE)
        self.assertEqual(results[0]['extension_id'], EXTENSION)
        self.assertEqual(results[0]['revision'], item['revision'])
        self.assertEqual(results[0]['status'], 'failed')
        self.assertNotIn('secret', str(results))

    def test_process_limits_batches_and_stops_when_time_budget_is_spent(self):
        with self.assertRaises(controls.AvailabilityError):
            controls.process_jobs([job() for _ in range(11)], ORG, states(), lambda _: self.fail('CLI'))
        with patch.object(controls.time, 'monotonic', side_effect=[0, 0, 20]):
            self.assertEqual(len(controls.process_jobs([job(), job()], ORG, states(), lambda _: output(True))), 1)


if __name__ == '__main__':
    unittest.main()
