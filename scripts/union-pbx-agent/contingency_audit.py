#!/usr/bin/env python3
"""Opt-in offline queue probe using the recoverable two-profile audit.

No employee, provider, cloud request or voice recording. The exact reviewed
runtime bundle is checked before loading it. All temporary endpoint credentials
stay in the original root-only audit journal. No production worker is stopped.
"""
import argparse
from contextlib import redirect_stdout, redirect_stderr
import io
import json
from pathlib import Path
import re
import time
import uuid

import audit_sip_trunks as reviewed
import isolation_audit as isolation


def probe_spec(organization_id):
    try:
        identity = uuid.UUID(organization_id)
        if str(identity) != organization_id or identity.int == 0:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ValueError('Canonical synthetic organization required') from None
    context = 'uwi-' + identity.hex
    return 'channel originate Local/850@' + context + '/n application Wait 40', context


def abandoned_count(detail, name):
    match = re.search(r'^' + re.escape(name) + r' has [^\n]*\bA:([0-9]+)[,)]', detail, re.M)
    if match is None:
        raise ValueError('Exact queue abandonment counter unavailable')
    return int(match[1])


def offline_timeout_probe(worker, item):
    extension, queue = isolation._jobs(item)
    name = worker.queue_identity(queue['id'])
    before = worker.strip_ansi(worker.asterisk('queue show ' + name))
    member = next((line for line in before.splitlines() if 'PJSIP/' + extension['endpoint_name'] in line), '')
    if 'Unavailable' not in member or '(paused)' in member.lower():
        raise isolation.AuditError('Synthetic endpoint must be offline and unpaused')
    initial = abandoned_count(before, name)
    command, context = probe_spec(item['organization_id'])
    worker.assert_no_calls()
    started = time.monotonic()
    worker.asterisk(command)
    queued = False
    try:
        deadline = started + 42
        while time.monotonic() < deadline:
            detail = worker.strip_ansi(worker.asterisk('queue show ' + name))
            if 'Local/850@' + context + '-' in detail:
                queued = True
            try:
                worker.assert_no_calls()
                if queued:
                    break
            except worker.Busy:
                pass
            time.sleep(.2)
        worker.assert_no_calls()
        elapsed = time.monotonic() - started
        after = worker.strip_ansi(worker.asterisk('queue show ' + name))
        if not queued or not 29 <= elapsed < 39 or abandoned_count(after, name) != initial + 1:
            raise isolation.AuditError('Offline queue bounded timeout not proven')
        return {'all_members_offline': True, 'caller_entered_queue': True,
                'timeout_seconds': round(elapsed, 2), 'abandoned_delta': 1,
                'channels_released': True, 'external_calls': 0}
    finally:
        # Wait only for the bounded synthetic call; never hang up an unrelated
        # call. If a real call arrives, original audit recovery stays guarded.
        deadline = started + 43
        while time.monotonic() < deadline:
            try:
                worker.assert_no_calls()
                break
            except worker.Busy:
                time.sleep(.2)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--acknowledge-contingency-audit', action='store_true')
    parser.add_argument('--runtime-directory', type=Path, default=Path('/opt/union-pbx-agent'))
    parser.add_argument('--cleanup')
    args = parser.parse_args(argv)
    if not args.apply:
        print(json.dumps({'preview': True, 'synthetic_calls': 1, 'external_calls': 0,
                          'queue_wait_seconds': 30, 'temporary_profiles': 2}))
        return 0
    if not args.acknowledge_contingency_audit:
        parser.error('Explicit contingency audit acknowledgment required')
    directory = args.runtime_directory
    original_factory = isolation._agent
    original_verify = isolation._verify_production
    original_cleanup = isolation._cleanup_locked
    result = {}
    cleanup_started = False
    captured = io.StringIO()
    errors = io.StringIO()
    def factory():
        return reviewed.load_runtime(directory)[0]
    def verify(worker, state):
        if not args.cleanup and not cleanup_started and not state.get('passed') and not result:
            item = state['plan'][0]
            result.update(offline_timeout_probe(isolation._worker(item), item))
        original_verify(worker, state)
    def cleanup(*arguments):
        nonlocal cleanup_started
        cleanup_started = True
        return original_cleanup(*arguments)
    isolation._agent = factory
    isolation._verify_production = verify
    isolation._cleanup_locked = cleanup
    try:
        if args.cleanup:
            isolation.cleanup(args.cleanup)
        else:
            with redirect_stdout(captured), redirect_stderr(errors):
                isolation.run()
            summary = json.loads(captured.getvalue().strip().splitlines()[-1])
            summary['calls_originated'] = 1
            summary['contingency'] = result
            summary['passed'] = summary['passed'] and bool(result)
            print(json.dumps(summary))
    except Exception as exc:
        # Never interpolate arbitrary exception values: they may contain SIP
        # material from nested runtime commands. Recovery IDs remain in journal.
        recovery = re.search(r'--cleanup ([a-f0-9]{32})', errors.getvalue())
        print(json.dumps({'passed': False, 'error_type': type(exc).__name__,
                          'recovery_script': 'contingency_audit.py', 'cleanup_guarded': True,
                          'cleanup_id': recovery[1] if recovery else None}))
        return 1
    finally:
        isolation._agent = original_factory
        isolation._verify_production = original_verify
        isolation._cleanup_locked = original_cleanup
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
