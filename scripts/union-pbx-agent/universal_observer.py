"""Authoritative, read-only Asterisk 22 channel snapshots for local reconciliation.

The capacity ledger must be blocked before sampling; a caller must not turn a
snapshot into terminal evidence while new admissions are still in flight.
Reference: https://github.com/asterisk/asterisk/blob/22/main/cli.c handle_chanlist.
No caller IDs, application data, SDP or credentials leave this collector.
"""
import hashlib
from pathlib import Path
import re
import subprocess

class ObserverError(ValueError):pass

def parse_count(raw):
 if not isinstance(raw,str) or len(raw)>4096:raise ObserverError('channel_count_unavailable')
 matches=re.findall(r'(?m)^([0-9]{1,6}) active channels?\s*$',raw)
 if len(matches)!=1:raise ObserverError('channel_count_unavailable')
 value=int(matches[0])
 if value>10000:raise ObserverError('channel_count_unavailable')
 return value

def parse_channels(raw,expected):
 if not isinstance(raw,str) or len(raw)>8000000 or type(expected) is not int or not 0<=expected<=10000:raise ObserverError('channel_snapshot_invalid')
 rows={};names=set()
 for line in raw.splitlines():
  if not line.strip():continue
  parts=line.split('!')
  if len(parts)!=14:raise ObserverError('channel_snapshot_invalid')
  channel,state,uid=parts[0],parts[4],parts[13]
  if not re.fullmatch(r'[A-Za-z0-9_./;:+-]{1,200}',channel) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',uid) or state not in ('Down','Rsrvd','OffHook','Dialing','Ring','Ringing','Up','Busy','Dialing Offhook','Pre-ring','Unknown'):
   raise ObserverError('channel_snapshot_invalid')
  if uid in rows or channel in names:raise ObserverError('channel_snapshot_ambiguous')
  rows[uid]={'channel':channel,'state':state};names.add(channel)
 if len(rows)!=expected:raise ObserverError('channel_snapshot_incomplete')
 return rows

def native_command(command):
 if command not in ('core show channels concise','core show channels count'):raise ObserverError('command_not_allowed')
 try:
  result=subprocess.run(['/usr/sbin/asterisk','-rx',command],capture_output=True,text=True,timeout=4,check=True)
  return re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',result.stdout)
 except (OSError,subprocess.SubprocessError):raise ObserverError('channel_snapshot_unavailable') from None

def boot_epoch(pid_file=Path('/run/asterisk/asterisk.pid'),proc=Path('/proc')):
 try:
  pid=pid_file.read_text().strip()
  if not re.fullmatch(r'[1-9][0-9]{0,8}',pid):raise ValueError()
  if (proc/pid/'comm').read_text().strip()!='asterisk':raise ValueError()
  start=(proc/pid/'stat').read_text().rsplit(')',1)[1].split()[19]
  if not start.isdigit():raise ValueError()
  boot=(proc/'sys/kernel/random/boot_id').read_text().strip()
  if not re.fullmatch(r'[a-f0-9-]{36}',boot):raise ValueError()
  return hashlib.sha256((boot+':'+pid+':'+start).encode()).hexdigest()
 except (OSError,ValueError,IndexError):raise ObserverError('asterisk_epoch_unavailable') from None

def stable_snapshot(command=native_command,epoch=boot_epoch):
 try:
  before=epoch(); snapshots=[]
  for _ in range(2):
   count_before=parse_count(command('core show channels count'))
   rows=parse_channels(command('core show channels concise'),count_before)
   count_after=parse_count(command('core show channels count'))
   if count_before!=count_after:raise ObserverError('channel_snapshot_changing')
   snapshots.append(rows)
  if before!=epoch() or snapshots[0]!=snapshots[1]:raise ObserverError('channel_snapshot_changing')
  return {'boot':before,'active_uniqueids':sorted(snapshots[-1]),'channels':snapshots[-1],'complete':True}
 except ObserverError:raise
 except Exception:raise ObserverError('channel_snapshot_unavailable') from None
