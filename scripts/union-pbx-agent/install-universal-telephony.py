#!/usr/bin/env python3
"""Pinned, code-only universal upgrade. No Asterisk reload or SIP activation.

Release engineering MUST finalize every RELEASE_PIN_REQUIRED before execution.
The protected backup manifest records bytes and metadata for automatic recovery.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import uuid

# Loading the installed worker and its lock helper must not write untracked pyc.
sys.dont_write_bytecode = True

PREVIOUS_SHA = 'ffbedd77bf4a7d7cb740c4795c91fa3578116b3f21ac03303f732ed0f9cb2912'
INSTALL = ('agent.py', 'universal_telephony.py', 'universal_telephony_runtime.py',
           'universal_runtime_adapter.py', 'universal_capacity.py',
           'universal_capacity_agi.py', 'universal_observer.py',
           'universal_observer_service.py', 'outbound_capacity.py', 'sip_accounts_v2.py')
PRESERVE = ('recording_agi.py', 'recording_runtime.py', 'recordings.py',
            'call_modes.py', 'call_mode_runtime.py', 'flow_runtime.py',
            'call_flows.py', 'sip_trunks.py', 'sip_trunk_runtime.py',
            'tenant_profile.py', 'process_lock.py')
# Explicit placeholders fail closed, including inspect. Never infer pins at runtime.
PINS = {'agent.py': '0f59a6e3ed752227fd2452b758bace872066d508341ce71753353649e513becd', 'universal_telephony.py': 'eee16cae7e23c564c3ecafcf97b4d47c0e9c7900abdd4a9634ff80bfb50b06b1', 'universal_telephony_runtime.py': '7184a7f8e91a811669854a71f4adff5802253b6e8681bd271f9421a1d1115879', 'universal_runtime_adapter.py': 'd12ce1959c841bbac62ea14f5baf9404eb98e4bb3f8b8b0ea38bdecf791e341e', 'universal_capacity.py': '09e1c3fdd980037ceb752172eefe4215490c9bdf64064d5e2dd651164ae3794a', 'universal_capacity_agi.py': 'd8206b817ac2a9b67540c4061323198cb645ba95c3899dfafc001d8ea7c2056f', 'universal_observer.py': 'f60d968fd7728c056fcbf108d4526b817ef3a64d3752c1db79c36a5dce625dd4', 'universal_observer_service.py': 'a7d6b27570b14c2379f613495728d1b1e9355172ae3a03ade973812cf8d2515a', 'outbound_capacity.py': '5f8f7737495928ba7d05612c631df4aa53f30d63a03756f0254c0662086d8f3a', 'sip_accounts_v2.py': 'e80a6da69dc564f3d54f157f4622da30d9a2ee4a516044e742462f123c4f7f69', 'recording_agi.py': '7b46af693068215da981a56072dfed8f27d49854f6a8d78bb9a35046cfea3732', 'recording_runtime.py': 'db34625006356a40045b1a92e74329e9bcb70ffec86f4459100895ffff1e76e3', 'recordings.py': '185627cfa7eac2fd64cbda6efa87557227020212815f7d5eee8a8d5f53948e1f', 'call_modes.py': '2a10c17c81dbed66f006cc85cec69c869ac8618a53f73b74ec6429782bda78de', 'call_mode_runtime.py': 'c02683b2127bab18de73a3348c9fb9f87d69d750320782692c97915cdae6e9db', 'flow_runtime.py': 'c713b0a9c4b55710eb3ae366b3c233d9e762d354018a9a15a9a160771171b38a', 'call_flows.py': '28ca3b3231df38b4675c14f5970f072e07a7d5e66cc493bc68b30d9485c1604c', 'sip_trunks.py': '13c4e8cb0e40fc1a050999e09160a93e9f4730ef703544b37dae096a5836d7e4', 'sip_trunk_runtime.py': 'd271c5298363b81f3dd569c8fc99ba72efb324b2a03e79c73452a5085a6ecfdc', 'tenant_profile.py': '1cb88a19a2ee29e0de0d3908c40b9c4af3de2092e8a5ddab49e311f7a3201335', 'process_lock.py': '8017044b330ec1cd8329f93920eea973cef44f50d55e594ecb9f891f4df00769'}
OBSERVER = 'union-pbx-universal-observer.service'
DROPIN_NAME = '90-union-universal.conf'


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_path(path, directory=False):
    for part in (path, *path.parents):
        if part.is_symlink():
            raise RuntimeError('Symlink path rejected: ' + str(part))
    if path.exists() and (not path.is_dir() if directory else not path.is_file()):
        raise RuntimeError('Unexpected path type: ' + str(path))


def trusted(path, directory=False):
    safe_path(path, directory)
    info = path.stat()
    if info.st_uid != 0 or info.st_mode & 0o022:
        raise RuntimeError('Untrusted ownership or writable source: ' + str(path))


def atomic(path, raw, mode, uid=0, gid=0):
    safe_path(path)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fchown(stream.fileno(), uid, gid)
            os.fchmod(stream.fileno(), mode)
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        parent_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(parent_fd)
        finally:
            os.close(parent_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def service(*args, check=True):
    return subprocess.run(['systemctl', *args], check=check,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Installer:
    def __init__(self, stage, root=Path('/')):
        self.stage = Path(stage)
        self.target = root / 'opt/union-pbx-agent'
        self.units = root / 'etc/systemd/system'
        self.config = root / 'etc/union-pbx-agent'
        self.state = root / 'var/lib/union-pbx-agent'
        self.backups = root / 'root/union-pbx-universal-backups'
        self.policies = self.config / 'universal'
        self.engine = self.state / 'universal-engine'
        self.ledger = self.engine / 'capacity.sqlite'
        self.bundle = {}

    def observer_unit(self):
        return ('''[Unit]
Description=Union PBX universal local observer
After=asterisk.service
[Service]
Type=simple
User=root
Group=asterisk
ExecStart=/usr/bin/python3 /opt/union-pbx-agent/universal_observer_service.py
Restart=on-failure
UMask=0007
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/union-pbx-agent /etc/union-pbx-agent/universal
RestrictAddressFamilies=AF_UNIX
[Install]
WantedBy=multi-user.target
''').encode()

    def preflight(self):
        if not hasattr(os, 'geteuid') or os.geteuid() != 0:
            raise RuntimeError('Root required')
        if set(PINS) != set(INSTALL + PRESERVE) or any(not re.fullmatch('[a-f0-9]{64}', p) for p in PINS.values()):
            raise RuntimeError('RELEASE_PIN_REQUIRED: reviewed release pins are not finalized')
        for path in (self.stage, self.target, self.units):
            trusted(path, True)
        self.bundle = {}
        for name, pin in PINS.items():
            staged = self.stage / name
            trusted(staged)
            raw = staged.read_bytes()
            if digest(raw) != pin:
                raise RuntimeError('Staged pin mismatch: ' + name)
            compile(raw, str(staged), 'exec')
            installed = self.target / name
            safe_path(installed)
            if name in PRESERVE:
                trusted(installed)
                if digest(installed.read_bytes()) != pin:
                    raise RuntimeError('Preserved helper differs: ' + name)
            else:
                if installed.exists():
                    trusted(installed)
                    expected = PREVIOUS_SHA if name == 'agent.py' else pin
                    if digest(installed.read_bytes()) != expected:
                        raise RuntimeError('Installed predecessor differs: ' + name)
                elif name == 'agent.py':
                    raise RuntimeError('Installed predecessor missing')
                self.bundle[installed] = raw
        for parent in (self.config, self.state):
            safe_path(parent, True)
            info = parent.stat()
            if info.st_uid != 0 or stat.S_IMODE(info.st_mode) not in (0o700, 0o710):
                raise RuntimeError('Private parent requires review: ' + str(parent))
        for directory in (self.policies, self.engine):
            safe_path(directory, True)
            if directory.exists() and any(directory.iterdir()):
                raise RuntimeError('Existing universal configuration/state requires review')
            if directory.exists():
                info = directory.stat()
                if info.st_uid != 0 or info.st_mode & 0o007:
                    raise RuntimeError('Universal directory permissions require review')
        for candidate in [self.state / 'universal-telephony.json', *self.state.glob('tenants/*/universal-telephony.json')]:
            safe_path(candidate)
            if candidate.exists():
                raise RuntimeError('Existing universal runtime state requires review')
        observer = self.units / OBSERVER
        safe_path(observer)
        if observer.exists() and observer.read_bytes() != self.observer_unit():
            raise RuntimeError('Observer unit conflicts')
        if service('is-active', '--quiet', OBSERVER, check=False).returncode == 0:
            raise RuntimeError('Observer already active; reviewed maintenance required')
        self.bundle[observer] = self.observer_unit()
        # Enumerate active units, not configured profiles; never start inactive tenants.
        result = service('list-units', '--type=service', '--state=active', '--no-legend', '--plain', 'union-pbx-agent*')
        active = []
        for line in result.stdout.splitlines():
            unit = line.split()[0] if line.split() else ''
            if unit == 'union-pbx-agent.service' or re.fullmatch(r'union-pbx-agent@[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.service', unit):
                active.append(unit)
            elif unit:
                raise RuntimeError('Unknown active agent unit')
        if not active:
            raise RuntimeError('No active agent units')
        self.active = sorted(set(active))
        dropin = b'[Unit]\nWants=union-pbx-universal-observer.service\nAfter=union-pbx-universal-observer.service\n[Service]\nReadWritePaths=/etc/union-pbx-agent/universal /var/lib/union-pbx-agent/universal-engine\n'
        for unit in self.active:
            trusted(self.units / ('union-pbx-agent@.service' if '@' in unit else unit))
            directory = self.units / (unit + '.d')
            safe_path(directory, True)
            if directory.exists():
                trusted(directory, True)
            path = directory / DROPIN_NAME
            safe_path(path)
            if path.exists() and path.read_bytes() != dropin:
                raise RuntimeError('Agent dropin conflicts')
            self.bundle[path] = dropin
        return {'services': self.active, 'installed': list(INSTALL), 'asterisk_reloaded': False}

    def load_previous(self):
        # Preserved dependencies were verified above; staging cannot shadow imports.
        sys.path.insert(0, str(self.target))
        return load_module('_universal_installer_previous', self.target / 'agent.py')

    def apply(self, acknowledge=False):
        if not acknowledge:
            raise RuntimeError('--acknowledge-universal-upgrade required')
        self.preflight()
        worker = self.load_previous()
        import grp
        group = grp.getgrnam('asterisk').gr_gid
        with worker.operation_lock():
            self.preflight()  # Repeat all pins, paths and active units under the global lock.
            service('is-active', '--quiet', 'asterisk')
            worker.assert_no_calls()
            return self.transaction(worker, group)

    def inspect(self):
        result = self.preflight()
        worker = self.load_previous()
        with worker.operation_lock():
            result = self.preflight()
            service('is-active', '--quiet', 'asterisk')
            worker.assert_no_calls()
        return {**result, 'idle_verified': True, 'changes_applied': False}

    def transaction(self, worker, group):
        safe_path(self.backups, True)
        if self.backups.exists():
            info = self.backups.stat()
            if info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
                raise RuntimeError('Backup directory not private')
        else:
            self.backups.mkdir(mode=0o700)
        backup = self.backups / str(uuid.uuid4())
        backup.mkdir(mode=0o700)
        directories = [self.config, self.state, self.policies, self.engine]
        directories += list(dict.fromkeys(p.parent for p in self.bundle if not p.parent.exists()))
        tracked = list(self.bundle) + [self.ledger] + directories
        snapshots = {}
        manifest = {'active_services': self.active, 'paths': {}}
        for index, path in enumerate(tracked):
            safe_path(path, path in directories)
            if not path.exists():
                snapshots[path] = None
                manifest['paths'][str(path)] = {'absent_before': True}
                continue
            info = path.stat()
            metadata = (stat.S_IMODE(info.st_mode), info.st_uid, info.st_gid)
            raw = None if path.is_dir() else path.read_bytes()
            snapshots[path] = (raw, *metadata)
            entry = dict(zip(('mode', 'uid', 'gid'), metadata))
            if raw is not None:
                filename = str(index) + '-' + path.name
                atomic(backup / filename, raw, 0o600)
                entry.update(file=filename, sha256=digest(raw))
            manifest['paths'][str(path)] = entry
        atomic(backup / 'manifest.json', (json.dumps(manifest, sort_keys=True) + '\n').encode(), 0o600)
        stopping = False
        touched = []
        observer_attempted = False
        try:
            worker.assert_no_calls()
            stopping = True  # A stop command may fail after stopping the unit.
            for unit in self.active:
                service('stop', unit)
            worker.assert_no_calls()
            for path in directories:
                touched.append(path)
                if not path.exists():
                    path.mkdir(mode=0o755)
                if path in (self.config, self.state, self.policies, self.engine):
                    os.chown(path, 0, group)
                    os.chmod(path, 0o710 if path in (self.config, self.state) else 0o750 if path == self.policies else 0o770)
            for path, raw in self.bundle.items():
                safe_path(path)
                before = snapshots[path]
                if (path.read_bytes() if path.exists() else None) != (before[0] if before else None):
                    raise RuntimeError('File changed during preparation')
                touched.append(path)
                atomic(path, raw, 0o755 if path.parent == self.target else 0o644)
            touched.append(self.ledger)
            ledger_module = load_module('_universal_installer_ledger', self.target / 'universal_capacity.py')
            ledger_module.Ledger(self.ledger)
            os.chown(self.ledger, 0, group)
            os.chmod(self.ledger, 0o660)
            service('daemon-reload')
            observer_attempted = True
            service('start', OBSERVER)
            service('is-active', '--quiet', OBSERVER)
            for unit in self.active:
                service('start', unit)
                service('is-active', '--quiet', unit)
            service('is-active', '--quiet', 'asterisk')
        except BaseException as failure:
            errors = []
            if observer_attempted:
                try:
                    service('stop', OBSERVER)
                except Exception as exc:
                    errors.append(type(exc).__name__)
            if stopping:
                for unit in self.active:
                    try:
                        service('stop', unit)
                    except Exception as exc:
                        errors.append(type(exc).__name__)
            for path in reversed(touched):
                try:
                    previous = snapshots[path]
                    safe_path(path, path in directories)
                    if previous is None:
                        if path in directories:
                            if path.exists():
                                path.rmdir()  # Never recursively erase unexpected data.
                        else:
                            if path in self.bundle and path.exists() and path.read_bytes() != self.bundle[path]:
                                raise RuntimeError('External modification preserved')
                            path.unlink(missing_ok=True)
                    elif previous[0] is None:
                        os.chown(path, previous[2], previous[3])
                        os.chmod(path, previous[1])
                    else:
                        if path in self.bundle and path.exists() and path.read_bytes() not in (previous[0], self.bundle[path]):
                            raise RuntimeError('External modification preserved')
                        atomic(path, *previous)
                except Exception as exc:
                    errors.append(str(path) + ': ' + type(exc).__name__)
            if stopping:
                for args in [('daemon-reload',)] + [('start', unit) for unit in self.active]:
                    try:
                        service(*args)
                    except Exception as exc:
                        errors.append(type(exc).__name__)
            if errors:
                raise RuntimeError('Upgrade failed; recovery requires review; backup=' + str(backup) + '; ' + '; '.join(errors)) from failure
            raise
        return {'backup': str(backup), 'services_restarted': self.active,
                'observer_started': True, 'asterisk_reloaded': False, 'routing_activated': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--acknowledge-universal-upgrade', action='store_true')
    args = parser.parse_args()
    if args.inspect == args.acknowledge_universal_upgrade:
        parser.error('Choose --inspect or --acknowledge-universal-upgrade')
    os.umask(0o077)
    def cancelled(signum, frame):
        raise RuntimeError('Upgrade interrupted')
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, cancelled)
    installer = Installer(Path(__file__).resolve().parent)
    print(json.dumps(installer.inspect() if args.inspect else installer.apply(True)))


if __name__ == '__main__':
    main()
