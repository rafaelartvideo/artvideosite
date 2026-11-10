"""Linux advisory locks shared by every cooperating PBX worker."""
from contextlib import contextmanager
import fcntl
import os


class LockBusy(RuntimeError):
    pass


@contextmanager
def exclusive(path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise LockBusy('Outra operacao PABX esta em andamento; tente no proximo ciclo.') from None
        yield
    finally:
        os.close(fd)
