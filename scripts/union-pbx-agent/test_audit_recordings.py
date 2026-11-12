import io
import unittest
from unittest.mock import patch

import audit_recordings as audit


class RecordingAuditTests(unittest.TestCase):
    def test_preview_and_missing_ack_cannot_load_runtime(self):
        with patch.object(audit, 'load_runtime') as load, patch('sys.stdout', new_callable=io.StringIO), patch('sys.stderr', new_callable=io.StringIO):
            self.assertEqual(audit.main([]), 0)
            self.assertNotEqual(audit.main(['--apply']), 0)
            load.assert_not_called()

    def test_cleanup_requires_exact_canonical_id_before_runtime(self):
        with patch.object(audit, 'load_runtime') as load:
            for identity in ('../root', '', 'A'*32, 'a'*33):
                with self.assertRaises(ValueError):
                    audit.audit_id(identity)
            load.assert_not_called()


if __name__ == '__main__':
    unittest.main()
