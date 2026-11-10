"""Prevent a stale one-time activation package from shipping different source."""
import hashlib
from pathlib import Path
import re
import os
import subprocess
import tempfile
import unittest


class ReleaseIntegrityTests(unittest.TestCase):
    def test_historical_tenant_installer_rejects_a_newer_runtime_bundle(self):
        root=Path(__file__).parent
        installer=(root/'activate-tenant-runtime.sh').read_text().split('(cd "$target"',1)[0]
        pins=dict((name,digest) for digest,name in re.findall(r'^([a-f0-9]{64})  ([a-z_]+\.py)$',installer,re.M))
        self.assertEqual(set(pins),{'agent.py'})
        self.assertEqual(pins['agent.py'],'643e10620fc77a65103e4956b6fba47422f4fed1c8df5c52113f397975a60acd')
        self.assertNotEqual(hashlib.sha256((root/'agent.py').read_bytes().replace(b'\r\n',b'\n')).hexdigest(),pins['agent.py'])

    @unittest.skipUnless(os.name=='posix','Linux service installer')
    def test_stop_failure_after_process_stops_still_restarts_previous_agent(self):
        self.exercise_installer(fail_stop=True)

    @unittest.skipUnless(os.name=='posix','Linux service installer')
    def test_success_installs_exact_bundle_and_preserves_existing_helpers(self):
        self.exercise_installer(fail_stop=False)

    @unittest.skipUnless(os.name=='posix','Linux service installer')
    def test_partial_install_failure_restores_worker_and_removes_new_helpers(self):
        self.exercise_installer(fail_stop=False,fail_install=True)

    def exercise_installer(self,fail_stop,fail_install=False):
        root=Path(__file__).parent
        with tempfile.TemporaryDirectory() as directory:
            fixture=Path(directory);stage=fixture/'stage';target=fixture/'target';binary=fixture/'bin'
            for folder in (stage,target,binary):folder.mkdir()
            original=b'# previous reviewed worker\n'
            (target/'agent.py').write_bytes(original)
            for name in ('queue_availability.py','call_history.py','process_lock.py','tenant_profile.py','local_queue_reload.py'):
                (target/name).write_bytes((root/name).read_bytes())
                # A poisoned staging helper must never shadow the preserved module.
                if name in ('queue_availability.py','call_history.py'):
                    (stage/name).write_text("raise RuntimeError('wrong module origin')\n")
            for name in ('agent.py',):
                (stage/name).write_bytes((root/name).read_bytes().replace(b'\r\n',b'\n'))
            unit='union-pbx-agent@.service'
            (stage/unit).write_bytes((root/unit).read_bytes().replace(b'\r\n',b'\n'))
            source=(root/'activate-tenant-runtime.sh').read_text()
            # This exercises the archived installer's rollback mechanics with
            # a synthetic staging bundle. Its production hash remains frozen;
            # current releases use activate-call-flows.sh and its own pin test.
            source=source.replace('643e10620fc77a65103e4956b6fba47422f4fed1c8df5c52113f397975a60acd',
                hashlib.sha256((stage/'agent.py').read_bytes()).hexdigest())
            self.assertIn('target=/opt/union-pbx-agent',source)
            source=source.replace('target=/opt/union-pbx-agent','target="'+str(target)+'"')
            source=source.replace('unit_file=/etc/systemd/system/union-pbx-agent@.service','unit_file="'+str(fixture/unit)+'"')
            source=source.replace('/root/union-pbx-tenant-runtime-backup-',str(fixture/'backup-'))
            source=source.replace('9ae0ea96744c674c10be7a35f38fe8923fd6d1c1b4c317a0775260c53241a422',hashlib.sha256(original).hexdigest())
            private=fixture/'manager.json';private.write_text('{}')
            source=source.replace('/etc/union-pbx-agent/local-manager.json',str(private))
            script=stage/'activate-tenant-runtime.sh';script.write_text(source)
            (fixture/'active').touch()
            shims={
                'id':'#!/bin/sh\necho 0\n',
                'asterisk':"#!/bin/sh\n[ \"$*\" = '-rx core show channels count' ] || exit 99\nprintf '0 active channels\\n'\n",
                'install':'''#!/bin/sh
[ "$1" = -o ] && [ "$2" = root ] && [ "$3" = -g ] && [ "$4" = root ] && [ "$5" = -m ] || exit 99
if [ "$FAIL_INSTALL" = 1 ] && [ "$8" = "$FAKE_TARGET/agent.py" ]; then touch "$FAKE_STATE/install-failed"; exit 1; fi
# Preserve mode and paths, without requiring root ownership in the CI fixture.
exec /usr/bin/install -m "$6" "$7" "$8"
''',
                'systemctl':'''#!/bin/sh
case "$1" in
daemon-reload) exit 0 ;;
is-active) test -f "$FAKE_STATE/active" ;;
stop) [ "$2" = union-pbx-agent ] || exit 99; rm -f "$FAKE_STATE/active"; if [ "$FAIL_STOP" = 1 ] && [ ! -e "$FAKE_STATE/failed-once" ]; then touch "$FAKE_STATE/failed-once"; exit 1; fi ;;
start) [ "$2" = union-pbx-agent ] || exit 99; touch "$FAKE_STATE/active" ;;
*) exit 99 ;;
esac
''',
            }
            for name,content in shims.items():
                path=binary/name;path.write_text(content);path.chmod(0o755)
            env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'FAKE_STATE':str(fixture),
                 'FAIL_STOP':str(int(fail_stop)),'FAIL_INSTALL':str(int(fail_install)),'FAKE_TARGET':str(target)}
            result=subprocess.run(['bash',str(script),'--acknowledge-tenant-runtime-update'],
                                  env=env,capture_output=True,timeout=20)
            self.assertTrue((fixture/'active').exists(),result.stderr.decode())
            if fail_stop or fail_install:
                self.assertNotEqual(result.returncode,0)
                self.assertTrue((fixture/('failed-once' if fail_stop else 'install-failed')).exists(),result.stderr.decode())
                self.assertEqual((target/'agent.py').read_bytes(),original)
                self.assertFalse((fixture/unit).exists())
            else:
                self.assertEqual(result.returncode,0,result.stderr.decode())
                for name in ('agent.py',):
                    self.assertEqual((target/name).read_bytes(),(stage/name).read_bytes())
                self.assertEqual((fixture/unit).read_bytes(),(stage/unit).read_bytes())
            for name in ('queue_availability.py','call_history.py','process_lock.py','tenant_profile.py','local_queue_reload.py'):
                self.assertEqual((target/name).read_bytes(),(root/name).read_bytes())


if __name__=='__main__':unittest.main()
