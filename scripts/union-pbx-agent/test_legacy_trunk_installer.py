"""Legacy installer guards; Linux fixtures never access real services."""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).parent

class LegacyInstallerTests(unittest.TestCase):
    def test_gate_and_limited_bundle(self):
        text = (ROOT / 'activate-legacy-trunks.sh').read_text()
        self.assertIn('--acknowledge-legacy-trunk-update', text)
        self.assertIn('"$#" == 1', text)
        self.assertIn('356d59d1b27c77682b4ab1bd5d9fbc6f99b1ffe91253666d3b0df0bd8ae60acb', text)
        pins = dict(re.findall(r"^    '([a-z_]+\.py)': '([A-Za-z0-9_]+)',", text, re.M))
        self.assertEqual(set(pins), {'agent.py', 'legacy_trunks.py'})
        self.assertNotIn('daemon-reload', text)
        self.assertNotIn("service('stop', 'asterisk')", text)

    def test_canonical_release_pins_and_python_parse(self):
        text = (ROOT / 'activate-legacy-trunks.sh').read_text()
        code = text.split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
        compile(code, 'activate-legacy-trunks.sh', 'exec')
        for name, pin in re.findall(r"^    '([a-z_]+\.py)': '([A-Za-z0-9_]+)',", text, re.M):
            self.assertRegex(pin, r'^[a-f0-9]{64}$', 'Finalize canonical release pin: ' + name)
            self.assertEqual(pin, hashlib.sha256((ROOT / name).read_bytes().replace(b'\r\n', b'\n')).hexdigest())

    @unittest.skipUnless(os.name == 'posix', 'Linux transaction fixtures')
    def test_transactions(self):
        for failure in ('', 'write', 'start', 'stop', 'calls', 'calls-after-stop', 'predecessor', 'pin', 'external', 'signal', 'symlink', 'permissions'):
            for existing in (False, True):
                with self.subTest(failure=failure, existing=existing):
                    self.exercise(failure, existing)

    def exercise(self, failure, existing):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            stage, target, backups, binary = [base / name for name in ('stage', 'target', 'backups', 'bin')]
            for path in (stage, target, backups, binary): path.mkdir(mode=0o700)
            original = b'''from contextlib import contextmanager
import os
from pathlib import Path
def require_root(): pass
def assert_no_calls():
    base=Path(os.environ['FIXTURE'])
    if os.environ['FAILURE']=='calls' or (os.environ['FAILURE']=='calls-after-stop' and not (base/'active').exists()): raise RuntimeError('calls active')
@contextmanager
def operation_lock():
    marker=Path(os.environ['FIXTURE'])/'locked'
    marker.touch()
    try: yield
    finally: marker.unlink()
'''
            (target/'agent.py').write_bytes(original)
            (target/'agent.py').chmod(0o640)
            helper=b'# original helper\n'
            if existing:
                (target/'legacy_trunks.py').write_bytes(helper)
                (target/'legacy_trunks.py').chmod(0o600)
            for name in ('agent.py','legacy_trunks.py'): (stage/name).write_bytes(('# staged '+name+'\n').encode())
            if failure == 'symlink':
                (stage/'actual.py').write_bytes((stage/'agent.py').read_bytes())
                (stage/'agent.py').unlink()
                (stage/'agent.py').symlink_to(stage/'actual.py')
            if failure == 'permissions': (stage/'agent.py').chmod(0o666)
            text=(ROOT/'activate-legacy-trunks.sh').read_text()
            code=text.split("<<'PY'\n",1)[1].rsplit('\nPY',1)[0]
            code=code.replace('OWNER_UID = 0','OWNER_UID = os.getuid()')
            code=code.replace("Path('/opt/union-pbx-agent')",'Path('+repr(str(target))+')')
            code=code.replace("Path('/root')",'Path('+repr(str(backups))+')')
            code=code.replace('356d59d1b27c77682b4ab1bd5d9fbc6f99b1ffe91253666d3b0df0bd8ae60acb',hashlib.sha256(original).hexdigest() if failure!='predecessor' else '0'*64)
            for name,pin in re.findall(r"^    '([a-z_]+\.py)': '([A-Za-z0-9_]+)',",text,re.M):
                code=code.replace("'"+pin+"'","'"+(hashlib.sha256((stage/name).read_bytes()).hexdigest() if failure!='pin' else '1'*64)+"'")
            code=code.replace('os.replace(temporary, path)', '''
        if path.parent == TARGET and path.name == 'legacy_trunks.py' and not (BACKUP_ROOT/'injected').exists():
            (BACKUP_ROOT/'injected').touch()
            if os.environ['FAILURE']=='write': raise OSError('injected')
            if os.environ['FAILURE']=='signal': os.kill(os.getpid(), signal.SIGTERM)
        os.replace(temporary, path)''')
            ctl=binary/'systemctl'
            ctl.write_text('''#!/bin/sh
test -f "$FIXTURE/locked" || exit 88
printf '%s\n' "$*" >> "$FIXTURE/services"
case "$1" in
is-active) case "$3" in asterisk) exit 0;; union-pbx-agent) test -f "$FIXTURE/active";; *) exit 99;; esac;;
stop) test "$2" = union-pbx-agent || exit 99
 rm -f "$FIXTURE/active"
 if [ "$FAILURE" = stop ] && [ ! -e "$FIXTURE/failed" ]; then touch "$FIXTURE/failed"; exit 1; fi;;
start) test "$2" = union-pbx-agent || exit 99
 if [ "$FAILURE" = external ] && [ ! -e "$FIXTURE/failed" ]; then printf '# external\n' > "$FIXTURE/target/agent.py"; touch "$FIXTURE/failed"; exit 1; fi
 if [ "$FAILURE" = start ] && [ ! -e "$FIXTURE/failed" ]; then touch "$FIXTURE/failed"; exit 1; fi
 touch "$FIXTURE/active";;
*) exit 99;;
esac
''')
            ctl.chmod(0o755)
            (base/'active').touch()
            result=subprocess.run([sys.executable,'-c',code,str(stage)],env={**os.environ,'PATH':str(binary)+os.pathsep+os.environ['PATH'],'FIXTURE':str(base),'FAILURE':failure},capture_output=True,timeout=15)
            self.assertEqual(result.returncode==0,not failure,result.stderr.decode())
            self.assertTrue((base/'active').exists())
            self.assertFalse((base/'locked').exists())
            if not failure:
                for name in ('agent.py','legacy_trunks.py'):
                    self.assertEqual((target/name).read_bytes(),(stage/name).read_bytes())
                    self.assertEqual((target/name).stat().st_mode&0o777,0o755)
            else:
                self.assertEqual((target/'agent.py').read_bytes(),b'# external\n' if failure=='external' else original)
                if failure!='external': self.assertEqual((target/'agent.py').stat().st_mode&0o777,0o640)
                if existing:
                    self.assertEqual((target/'legacy_trunks.py').read_bytes(),helper)
                    self.assertEqual((target/'legacy_trunks.py').stat().st_mode&0o777,0o600)
                else: self.assertFalse((target/'legacy_trunks.py').exists())
            log=(base/'services').read_text() if (base/'services').exists() else ''
            if failure in ('calls','predecessor','pin','symlink','permissions'): self.assertNotIn('stop ',log)
            self.assertNotIn('asterisk\nstop',log)

if __name__=='__main__': unittest.main()
