import unittest
import outbound_router as router


class OutboundRouterTests(unittest.TestCase):
    def test_browser_include_is_added_only_to_union_context(self):
        original=b'; preserve\n[other]\nexten => s,1,Hangup()\n[union-internal]\ninclude => existing\n[after]\nexten => s,1,Hangup()\n'
        changed=router.browser_config(original)
        self.assertEqual(changed.count(b'include => '+router.CONTEXT.encode()),1)
        self.assertEqual(changed.split(b'[union-internal]')[0],original.split(b'[union-internal]')[0])
        self.assertEqual(changed.split(b'[after]')[1],original.split(b'[after]')[1])
        self.assertEqual(router.browser_config(changed),changed)
        for invalid in (b'[other]\n',b'[union-internal]\n[union-internal]\n'):
            with self.assertRaises(ValueError):router.browser_config(invalid)

    def test_server_requires_national_destination_and_authenticated_union_endpoint(self):
        import re
        for number in ('5579988037605','551142901575'):
            self.assertIsNotNone(re.fullmatch(router.NUMBER_PATTERN,number))
        for number in ('301','5508001234567','5520988037605','14155552671','5579988037605@evil'):
            self.assertIsNone(re.fullmatch(router.NUMBER_PATTERN,number))
        text=router.route_config().decode()
        self.assertIn('${CHANNEL(endpoint)}',text)
        self.assertIn('Hangup(21)',text)
        self.assertLess(text.index('REGEX('),text.index('Dial('))
        self.assertLess(text.index('${CHANNEL(endpoint)}'),text.index('Dial('))
        self.assertNotIn('Answer()',text)
        self.assertNotIn('union-entrada',text)

    def test_preview_and_missing_approval_do_not_load_live_agent(self):
        from unittest.mock import patch
        with patch.object(router,'activate') as activate:
            self.assertEqual(router.main([]),0)
            self.assertEqual(router.main(['--apply']),1)
            activate.assert_not_called()

    def test_each_partial_write_failure_restores_bytes_and_owners(self):
        from pathlib import Path
        from types import SimpleNamespace
        from unittest.mock import patch,Mock,call
        import tempfile
        for fail_at in (1,2,3,4):
            with self.subTest(fail_at=fail_at),tempfile.TemporaryDirectory() as folder:
                root=Path(folder);target=root/'new.conf'
                snapshots={root/name:(b'; original '+name.encode(),SimpleNamespace(st_mode=0o600,st_uid=101,st_gid=102))
                           for name in ('main.conf','browser.conf')}
                for path,(raw,_) in snapshots.items():path.write_bytes(raw)
                proposed={path:b'; new '+path.name.encode() for path in (*snapshots,target)}
                count=0
                def write(path,raw,*args):
                    nonlocal count
                    count+=1
                    if count==fail_at and fail_at<=3:raise OSError('injected write failure')
                    path.write_bytes(raw)
                pbx=Mock();pbx.write_atomic.side_effect=write
                with patch.object(router.os,'chown',create=True) as chown:
                    try:
                        router.write_files(pbx,snapshots,proposed,target,102)
                        if fail_at==4:raise OSError('injected post-write failure')
                    except OSError:router.restore_files(pbx,snapshots,proposed,target)
                    for path,(raw,info) in snapshots.items():
                        self.assertEqual(path.read_bytes(),raw)
                        self.assertIn(call(path,info.st_uid,info.st_gid),chown.call_args_list)
                    self.assertFalse(target.exists())

    def test_restore_refuses_unrelated_change_without_any_write(self):
        from pathlib import Path
        from unittest.mock import Mock
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'new.conf';path.write_bytes(b'operator change');pbx=Mock()
            with self.assertRaises(ValueError):router.restore_files(pbx,{}, {path:b'our content'},path)
            pbx.write_atomic.assert_not_called();self.assertEqual(path.read_bytes(),b'operator change')


if __name__=='__main__':unittest.main()
