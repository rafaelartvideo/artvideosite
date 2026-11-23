#!/usr/bin/env python3
"""Local observer: no cloud calls, no per-call network API, no expiry of live legs."""
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import time

CONFIG=Path('/etc/union-pbx-agent')
SOURCE=Path('/opt/union-pbx-agent/agent.py')

def refresh(worker,runtime,adapter):
    with worker.operation_lock():
        api=worker.runtime_api();state=runtime.load(api);snapshot=state.get('snapshot')
        if not snapshot or not snapshot['document']['routing_enabled']:return False
        org=state['organization_id']
        try:
            observed=adapter.observe(api,org,snapshot)
        except Exception:
            try:adapter.ledger(api).block(org)
            except Exception:pass
            raise
        state['observed']=observed
        runtime.write(runtime.paths(api),state)
        return True

def profiles(root=CONFIG):
    files=[(None,root/'agent.json')]+[(p.parent.name,p) for p in sorted((root/'tenants').glob('*/agent.json'))]
    if len(files)>1000:raise ValueError('profile_limit')
    result=[]
    for profile,path in files:
        if not path.exists():continue
        if profile is not None and not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',profile):raise ValueError('profile_identity')
        if any(parent.is_symlink() for parent in (path,*path.parents)):raise ValueError('profile_path')
        info=path.stat()
        if info.st_uid!=0 or info.st_mode&0o077 or info.st_size>16384:raise ValueError('profile_ownership')
        result.append(profile)
    return result

def load_worker(profile):
    if SOURCE.is_symlink() or SOURCE.stat().st_uid!=0 or SOURCE.stat().st_mode&0o022:raise ValueError('worker_ownership')
    spec=importlib.util.spec_from_file_location('_universal_observer_'+str(profile).replace('-',''),SOURCE)
    worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)
    if profile is not None:worker.select_profile(profile)
    return worker

def main():
    if not hasattr(os,'geteuid') or os.geteuid()!=0:return 2
    import universal_telephony_runtime as runtime
    import universal_runtime_adapter as adapter
    workers={};failures={};stopping=False
    def stop(*args):
        nonlocal stopping
        stopping=True
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    while not stopping:
        try:
            for profile in profiles():
                if profile not in workers:workers[profile]=load_worker(profile)
                worker=workers[profile]
                if not runtime.paths(worker.runtime_api()).exists():continue
                try:
                    refresh(worker,runtime,adapter);failures.pop(profile,None)
                except worker.Busy:continue
                except Exception as exc:
                    safe=type(exc).__name__;previous=failures.get(profile)
                    if not previous or previous[0]!=safe or time.monotonic()-previous[1]>60:
                        print('Universal observer postponed: '+safe,flush=True)
                        failures[profile]=(safe,time.monotonic())
        except Exception as exc:
            print('Universal observer configuration unavailable: '+type(exc).__name__,flush=True)
        # Native observation only; never renews the cloud-issued lease.
        for _ in range(50):
            if stopping:break
            time.sleep(.1)
    return 0
if __name__=='__main__':raise SystemExit(main())
