import json
import os
from pathlib import Path
from unittest.mock import patch
import tempfile
import unittest
import uuid

import inbound_router as inbound
import agent as pbx


class InboundRouteSafetyTests(unittest.TestCase):
    def test_select_queue_parses_asterisk_full_output(self):
        queue_id=str(uuid.uuid4())
        name=pbx.queue_identity(queue_id)
        state={'id':queue_id,'enabled':True,'test_extension':850,
               'members':[{'endpoint_name':'union-301','number':301}]}
        output=(name+' has 0 calls (max unlimited) in ringall strategy\n'
                '   Members:\n'
                '      Ramal 301 (PJSIP/union-301) (ringinuse disabled) (Not in use) has taken 1 calls\n'
                '   No Callers\n')
        with patch.object(pbx,'queue_states',return_value={queue_id:state}), patch.object(pbx,'asterisk',return_value=output) as command:
            found,_=inbound.select_queue(850)
            self.assertEqual(found,state)
            command.assert_called_once_with('queue show')

    def test_select_queue_rejects_offline_members(self):
        queue_id=str(uuid.uuid4())
        name=pbx.queue_identity(queue_id)
        state={'id':queue_id,'enabled':True,'test_extension':850,
               'members':[{'endpoint_name':'union-301','number':301}]}
        output=(name+' has 0 calls (max unlimited) in ringall strategy\n'
                '   Members:\n'
                '      Ramal 301 (PJSIP/union-301) (Unavailable)\n'
                '   No Callers\n')
        with patch.object(pbx,'queue_states',return_value={queue_id:state}), patch.object(pbx,'asterisk',return_value=output):
            with self.assertRaisesRegex(pbx.AgentError,'Nenhum ramal disponivel'):
                inbound.select_queue(850)
    def test_select_queue_does_not_confuse_other_queues(self):
        queue_id=str(uuid.uuid4())
        other_id=str(uuid.uuid4())
        name=pbx.queue_identity(queue_id)
        other=pbx.queue_identity(other_id)
        state={'id':queue_id,'enabled':True,'test_extension':850,
               'members':[{'endpoint_name':'union-301','number':301}]}
        output=(name+' has 0 calls in ringall strategy\n'
                '   Members:\n'
                '      Ramal 301 (PJSIP/union-301) (Unavailable)\n'
                '   No Callers\n'
                +other+' has 0 calls in ringall strategy\n'
                '   Members:\n'
                '      Ramal 301 (PJSIP/union-301) (Not in use)\n'
                '   No Callers\n')
        with patch.object(pbx,'queue_states',return_value={queue_id:state}), patch.object(pbx,'asterisk',return_value=output):
            with self.assertRaisesRegex(pbx.AgentError,'Nenhum ramal disponivel'):
                inbound.select_queue(850)
    def test_original_exactly_preserved_as_reference(self):
        original=inbound.EXPECTED.encode()
        self.assertTrue(inbound.is_original(original))
        prepared=inbound.staged_source(original).decode()
        self.assertEqual(prepared.count(inbound.GOSUB),1)
        self.assertEqual(prepared.count(inbound.INCLUDE),1)
        self.assertIn("exten => _X.,1,Goto(s,1)",prepared)
        self.assertIn("exten => h,1,NoOp(Chamada Union World encerrada)",prepared)
        self.assertIn("same => n,NoOp(Resultado: ${DIALSTATUS})",prepared)
        self.assertNotIn("Dial(PJSIP/union-301,25)",prepared)
        self.assertIn("Dial(PJSIP/union-301,25)",inbound.direct_route().decode())

    def test_modified_baseline_refused_without_changes(self):
        for change in (
            inbound.EXPECTED.replace("union-301","union-302"),
            inbound.EXPECTED+"exten => 123,1,Hangup()\n",
            inbound.EXPECTED.replace("Goto(s,1)","Goto(s,2)"),
            inbound.EXPECTED.replace("[union-entrada]","[another-context]"),
        ):
            with self.subTest(modified=change[:25]):
                with self.assertRaises(pbx.AgentError):
                    inbound.staged_source(change.encode())

    def test_queue_route_has_original_fallback_and_no_sip_trunk_edits(self):
        item={
            "id":str(uuid.uuid4()),
            "enabled":True,
            "max_wait_seconds":120,
        }
        content=inbound.queue_route(item).decode()
        name=pbx.queue_identity(item["id"])
        self.assertIn("QUEUE_MEMBER("+name+",count)",content)
        self.assertIn("Queue("+name+",,,,120)",content)
        self.assertIn("n(reserva),Dial(PJSIP/union-301,25)",content)
        self.assertIn("same => n,Return()",content)
        self.assertNotIn("union-fvx-registration",content)
        self.assertNotIn("sip2.fvx.com.br",content)
        self.assertNotIn("pjsip.conf",content)
        for wait in (0, 301, "120"):
            with self.subTest(wait=wait):
                with self.assertRaises(pbx.AgentError):
                    inbound.queue_route({**item,"max_wait_seconds":wait})

    def test_main_requires_explicit_operator_opt_in(self):
        with patch("sys.argv",["inbound_router.py","prepare"]), \
             patch.object(inbound,"prepare") as prepare, \
             patch.object(pbx,"require_root") as root:
            self.assertEqual(inbound.main(),1)
            prepare.assert_not_called()
            root.assert_not_called()

    def test_preview_is_read_only_and_checks_registered_trunk(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            main=root/"extensions.conf"
            main.write_text('#include "extensions.d/union-fvx.conf"\n')
            original=root/"union-fvx.conf"
            original.write_text(inbound.EXPECTED)
            with patch.object(inbound,"FVX",original), \
                 patch.object(inbound,"TARGET",root/"managed.conf"), \
                 patch.object(inbound,"STATE",root/"state.json"), \
                 patch.object(pbx,"DIALPLAN_MAIN",main), \
                 patch.object(inbound,"registered",return_value="Registered"):
                inbound.preview(None)
                self.assertEqual(original.read_text(),inbound.EXPECTED)
                self.assertFalse((root/"managed.conf").exists())
                self.assertFalse((root/"state.json").exists())

    def test_prepare_never_changes_live_route_while_calls_active(self):
        with patch.object(inbound,"baseline"), \
             patch.object(pbx,"assert_no_calls",side_effect=pbx.Busy("Ativas")), \
             patch.object(inbound,"registered") as registered, \
             patch.object(inbound,"FVX") as source:
            with self.assertRaises(pbx.Busy):
                inbound.prepare()
            source.read_bytes.assert_not_called()
            registered.assert_not_called()

    def test_prepare_stages_only_direct_301_and_preserves_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            source=root/"union-fvx.conf"
            target=root/"union-fvx-managed.conf"
            state=root/"router.json"
            backups=root/"backups"
            dialplan=root/"extensions.conf"
            source.write_bytes(inbound.EXPECTED.encode())
            dialplan.write_text('#include "extensions.d/union-fvx.conf"\n')
            def answer(command):
                if command=="dialplan reload":
                    return "Dialplan reloaded"
                if command=="dialplan show union-entrada":
                    return ("Gosub(union-fvx-managed,s,1) Goto(s,1) "
                            "Chamada Union World encerrada")
                if command=="dialplan show union-fvx-managed":
                    return "[ Context 'union-fvx-managed' ] Dial(PJSIP/union-301,25)"
                raise AssertionError("Unexpected Asterisk command "+command)
            def local_write(path,data,stat=None,gid=None):
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(data)
            with patch.object(inbound,"FVX",source),\
                 patch.object(inbound,"TARGET",target),\
                 patch.object(inbound,"STATE",state),\
                 patch.object(inbound,"BACKUPS",backups),\
                 patch.object(pbx,"DIALPLAN_MAIN",dialplan),\
                 patch.object(pbx,"asterisk",side_effect=answer),\
                 patch.object(pbx,"assert_no_calls"),\
                 patch.object(pbx,"assert_fvx"),\
                 patch.object(inbound,"registered",return_value="Registered"),\
                 patch.object(pbx.grp,"getgrnam",return_value=type("Group",(),{"gr_gid":0})()),\
                 patch.object(inbound,"write",side_effect=local_write):
                inbound.prepare()
            self.assertIn(inbound.GOSUB,source.read_text())
            self.assertNotIn(inbound.DIRECT,source.read_text())
            self.assertEqual(target.read_bytes(),inbound.direct_route())
            self.assertEqual(json.loads(state.read_text())["mode"],"direct_301")
            copied=list(backups.glob("*.conf"))
            self.assertEqual(len(copied),1)
            self.assertEqual(copied[0].read_bytes(),inbound.EXPECTED.encode())

    def test_unprepared_apply_and_restore_are_blocked(self):
        with patch.object(inbound,"read_state",return_value=None):
            with self.assertRaises(pbx.AgentError):
                inbound.change("queue",850)
            with self.assertRaises(pbx.AgentError):
                inbound.change("direct_301")
            with self.assertRaises(pbx.AgentError):
                inbound.restore_original()


if __name__=="__main__":
    unittest.main()
