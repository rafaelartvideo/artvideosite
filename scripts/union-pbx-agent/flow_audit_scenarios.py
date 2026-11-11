"""Pure plans and execution-evidence checks for synthetic engine calls only."""
from datetime import datetime, timezone
import re

SCENARIOS = ('menu-digit', 'invalid-digit', 'menu-timeout', 'closed-hours', 'holiday')


def checked(scenario):
    if scenario not in SCENARIOS:
        raise ValueError('Unknown synthetic flow scenario')
    return scenario


def scenario_config(scenario, prompt_id, today=None):
    checked(scenario)
    today = today or datetime.now(timezone.utc).date()
    return {'version': 1, 'mode': 'menu', 'prompt_id': prompt_id, 'closed_prompt_id': None,
            'options': [{'digit': '1', 'target': {'kind': 'hangup'}}],
            'fallback': {'kind': 'hangup'}, 'closed_target': {'kind': 'hangup'},
            'timezone': 'UTC', 'schedule_enabled': True,
            'windows': [{'days': [today.isoweekday() % 7 + 1] if scenario == 'closed-hours' else
                [1, 2, 3, 4, 5, 6, 7], 'start': '00:00', 'end': '24:00'}],
            'holidays': [today.isoformat()] if scenario == 'holiday' else [],
            'timeout_seconds': 5, 'repeats': 0}


def driver_steps(scenario):
    checked(scenario)
    digit = {'menu-digit': '1', 'invalid-digit': '9'}.get(scenario)
    text = 'exten => s,1,Wait(0.5)\n'
    if digit:
        text += ' same => n,SendDTMF(' + digit + ')\n'
    return text + ' same => n,Wait(7)\n same => n,Hangup()\n'


def _hangup_priorities(compiled):
    extension = None
    counters = {}
    section = None
    result = {}
    for line in compiled.decode().splitlines():
        line = line.strip()
        if line.startswith('exten => '):
            extension, priority, application = line.split('=>', 1)[1].strip().split(',', 2)
        elif line.startswith('same => '):
            priority, application = line.split('=>', 1)[1].strip().split(',', 1)
        else:
            continue
        match = re.fullmatch(r'(n|[0-9]+)(?:\(([A-Za-z0-9_-]+)\))?', priority)
        if match is None or extension is None:
            raise ValueError('Unexpected generated priority')
        number = counters.get(extension, 0) + 1 if match[1] == 'n' else int(match[1])
        counters[extension] = number
        if extension == 's':
            if match[2]:
                section = match[2]
            if application == 'Hangup()':
                result[section] = number
    return result


def observations(scenario, trace, context, compiled, asset_stem):
    checked(scenario)
    def executed(extension, priority=None, application=None):
        expression = r'Executing \[' + re.escape(extension + '@' + context + ':')
        expression += str(priority) if priority is not None else r'[0-9]+'
        expression += r'\]'
        if application:
            expression += r'\s+' + re.escape(application) + r'\('
        return re.search(expression, trace) is not None
    hangups = _hangup_priorities(compiled)
    if scenario in ('closed-hours', 'holiday'):
        return {'closed_target_executed': executed('s', hangups['closed'], 'Hangup'),
                'menu_not_executed': not executed('1') and 'Playing ' not in trace}
    evidence = {'audio_playback_observed': re.search(r"Playing ['\"]" + re.escape(asset_stem) + r"\.", trace) is not None}
    if scenario == 'menu-digit':
        evidence['digit_route_executed'] = executed('1', 1, 'Hangup')
    else:
        evidence['fallback_executed'] = executed('s', hangups['retry'], 'Hangup')
        if scenario == 'invalid-digit':
            evidence['invalid_route_executed'] = executed('i', 1, 'Goto')
        else:
            # WaitExten continues at its next priority when one exists. It need
            # not invoke t: require the actual channel-bound timeout instead.
            evidence['timeout_observed'] = executed('s', application='WaitExten') and re.search(
                r'Timeout on Local/s@' + re.escape(context) + r'-[a-fA-F0-9]+;[12], continuing', trace) is not None
    return evidence
