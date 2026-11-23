"""PBX agent upgrade safety checks; never touch live Asterisk or systemd."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "upgrade_pbxe", HERE / "upgrade-pbx-efficiency.py")
up = importlib.util.module_from_spec(spec)
spec.loader.exec_module(up)


class SafeUpgradeTests(unittest.TestCase):
    def test_target_sha_matches_reviewed_agent(self):
        staged = (HERE / "agent.py").read_bytes().replace(b"\r\n", b"\n")
        self.assertEqual(up.NEW_SHA256, 'ffbedd77bf4a7d7cb740c4795c91fa3578116b3f21ac03303f732ed0f9cb2912')
        self.assertNotEqual(hashlib.sha256(staged).hexdigest(), up.NEW_SHA256)

    def test_previous_deployed_agent_sha_is_explicitly_allowed(self):
        # Hash audited against Git commit 536fb917b1e911e4ee896f20f9ac8c83cc5043c3
        previous = "f270c853a344235b3a281a77c96df8390fc2c88cd20d9c725535fb87cdd08d86"
        self.assertIn(previous, up.REVIEWED_OLD)
        self.assertNotEqual(previous, up.NEW_SHA256)

    def test_unknown_live_agent_refused_before_services_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            staged = root / "staged.py"
            old = root / "installed.py"
            staged.write_bytes((HERE / "agent.py").read_bytes())
            old.write_text("print('unreviewed change')\n")
            with patch.object(up, "TARGET", old), patch.object(up.os, "geteuid", return_value=0), \
                 patch.object(up, "run"), patch.object(up, "active_services"), \
                 patch.object(up, "NEW_SHA256", up.digest(staged.read_bytes().replace(b"\r\n", b"\n"))):
                with self.assertRaisesRegex(up.UpgradeError, "versoes auditadas"):
                    up.stage_and_preflight(staged)

    def test_symlink_stage_is_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            real = root / "real.py"
            link = root / "link.py"
            real.write_text("pass\n")
            link.symlink_to(real)
            with self.assertRaisesRegex(up.UpgradeError, "Symlink"):
                up.check_path(link)

    def test_signed_release_digest_and_python_syntax(self):
        content = (HERE / "agent.py").read_bytes()
        self.assertEqual(up.NEW_SHA256, 'ffbedd77bf4a7d7cb740c4795c91fa3578116b3f21ac03303f732ed0f9cb2912')
        compile(content, "agent.py", "exec")

    def test_channels_parser_refuses_unexpected_output(self):
        with patch.object(up, "run") as runner:
            runner.return_value.stdout = "0 active channels\n"
            self.assertEqual(up.active_channels(), 0)
            runner.return_value.stdout = "2 active channels\n"
            self.assertEqual(up.active_channels(), 2)
            runner.return_value.stdout = "active channels: unknown\n"
            with self.assertRaisesRegex(up.UpgradeError, "confirmar canais"):
                up.active_channels()


if __name__ == "__main__":
    unittest.main()
