from pathlib import Path
import multiprocessing
import tempfile
import unittest
from process_lock import exclusive, LockBusy


def try_lock(path, result):
    try:
        with exclusive(Path(path)):
            result.put('acquired')
    except LockBusy:
        result.put('busy')


class ProcessLockTests(unittest.TestCase):
    def test_other_process_is_blocked_and_lock_is_released_after_exception(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'operation.lock'
            context=multiprocessing.get_context('spawn')
            result=context.Queue()
            with self.assertRaisesRegex(ValueError,'release'):
                with exclusive(path):
                    process=context.Process(target=try_lock,args=(str(path),result))
                    process.start();process.join(10)
                    self.assertFalse(process.is_alive())
                    self.assertEqual(result.get(timeout=2),'busy')
                    raise ValueError('release')
            with exclusive(path):
                self.assertEqual(path.stat().st_mode & 0o777,0o600)

    def test_symlink_is_rejected_without_touching_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);target=root/'target';target.write_text('unchanged')
            path=root/'link';path.symlink_to(target)
            with self.assertRaises(OSError):
                with exclusive(path):pass
            self.assertEqual(target.read_text(),'unchanged')


if __name__=='__main__':unittest.main()
