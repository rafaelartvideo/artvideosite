import importlib.util
import base64
import json
from unittest.mock import patch
from pathlib import Path
import re
import subprocess
import tempfile
import unittest
import uuid

AGENT_PATH = Path(__file__).with_name("agent.py")
spec = importlib.util.spec_from_file_location("union_pbx_agent", AGENT_PATH)
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)

class AgentSafetyTests(unittest.TestCase):
    def test_web_rtc_template_is_restricted(self):
        endpoint = "uw-" + "a" * 32
        text = agent.sip_conf(endpoint, 302, "safePassword_" + "b" * 35)
        self.assertIn("context=union-internal", text)
        self.assertIn("transport=transport-ws", text)
        self.assertIn("webrtc=yes", text)
        self.assertIn("rtp_symmetric=yes", text)
        self.assertNotIn("union-fvx", text)
        self.assertNotIn("from-internal", text)
        self.assertNotIn("exten =>", text)

    def test_job_rejects_cross_tenant(self):
        organization_id = str(uuid.uuid4())
        job = {
            "id": str(uuid.uuid4()), "organization_id": str(uuid.uuid4()),
            "endpoint_name": "uw-" + "b" * 32, "number": 302,
            "desired_enabled": True, "updated_at": "2026-11-04T11:00:00Z",
        }
        with self.assertRaises(agent.AgentError):
            agent.validate_job(job, organization_id)

    def test_job_rejects_injected_endpoint(self):
        organization_id = str(uuid.uuid4())
        job = {
            "id": str(uuid.uuid4()), "organization_id": organization_id,
            "endpoint_name": "uw-hello\n#include evil", "number": 302,
            "desired_enabled": True, "updated_at": "2026-11-04T11:00:00Z",
        }
        with self.assertRaises(agent.AgentError):
            agent.validate_job(job, organization_id)

    def test_internal_dialplan_dials_exact_extensions_only(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/"extensions").mkdir()
            extension_id=str(uuid.uuid4())
            state={
                "id":extension_id,"organization_id":str(uuid.uuid4()),
                "endpoint":"uw-"+"a"*32,
                "number":302,"enabled":True,
                "password":"securePassword_"+"b"*40,
            }
            (root/"extensions"/(extension_id+".json")).write_text(json.dumps(state))
            with patch.object(agent,"STATE_DIR",root):
                output,numbers=agent.render_internal_routes()
                self.assertEqual(numbers,[301,302])
                content=output.decode()
                self.assertIn("[union-pbx-local-extensions]",content)
                self.assertIn("exten => 301,1,Dial(PJSIP/union-301,25)",content)
                self.assertIn("exten => 302,1,Dial(PJSIP/uw-"+"a"*32+",25)",content)
                self.assertNotIn("=> _X.",content)
                self.assertNotIn("union-fvx",content)
                self.assertNotIn("exten => 900",content)
                off,numbers_off=agent.render_internal_routes([{**state,"enabled":False}])
                self.assertEqual(numbers_off,[301])
                self.assertNotIn("exten => 302",off.decode())

    def test_internal_dialplan_blocks_collisions_and_reserved_numbers(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/"extensions").mkdir()
            with patch.object(agent,"STATE_DIR",root):
                for forbidden in (301,900,99,10000):
                    with self.assertRaises(agent.AgentError):
                        agent.render_internal_routes([{
                          "endpoint":"uw-"+"c"*32,
                          "number":forbidden,"enabled":True,
                        }])
                with self.assertRaises(agent.AgentError):
                    agent.render_internal_routes([
                      {"endpoint":"uw-"+"d"*32,"number":302,"enabled":True},
                      {"endpoint":"uw-"+"e"*32,"number":302,"enabled":True},
                    ])

    def test_queue_module_status_rejects_not_running(self):
        unavailable=(
            "Module Description Use Count Status Support Level\n"
            "app_queue.so True Call Queueing 0 Not Running core\n"
            "1 modules loaded\n"
        )
        available=(
            "Module Description Use Count Status Support Level\n"
            "app_queue.so True Call Queueing 0 Running core\n"
            "1 modules loaded\n"
        )
        self.assertFalse(agent.module_is_running(unavailable,"app_queue.so"))
        self.assertTrue(agent.module_is_running(available,"app_queue.so"))
        self.assertFalse(agent.module_is_running("0 modules loaded","app_queue.so"))

    def test_queue_config_is_internal_and_uses_only_registered_pjsip_members(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            root.mkdir(exist_ok=True)
            organization_id=str(uuid.uuid4())
            active={
                "id":str(uuid.uuid4()),
                "organization_id":organization_id,
                "name":"Atendimento geral",
                "test_extension":850,
                "strategy":"ringall",
                "ring_seconds":20,
                "max_wait_seconds":120,
                "enabled":True,
                "updated_at":"2026-11-04T09:20:00Z",
                "members":[
                    {"organization_id":organization_id,"number":301,"endpoint_name":"union-301","position":1,
                     "desired_enabled":True,"provisioning_status":"manual"},
                    {"organization_id":organization_id,"number":302,"endpoint_name":"uw-"+"a"*32,"position":2,
                     "desired_enabled":True,"provisioning_status":"applied"},
                ],
            }
            agent.validate_queue_job(active,organization_id)
            with patch.object(agent,"QUEUE_STATE_DIR",root):
                conf,dial,names,numbers=agent.render_queue_configs([active])
                config=conf.decode()
                routes=dial.decode()
                self.assertEqual(numbers,{850})
                self.assertEqual(names,[agent.queue_identity(active["id"])])
                self.assertIn("strategy=ringall",config)
                self.assertIn("ringinuse=no",config)
                self.assertIn("member => PJSIP/union-301,0,Ramal 301",config)
                self.assertIn("member => PJSIP/uw-"+"a"*32+",0,Ramal 302",config)
                self.assertIn("exten => 850,1,Answer()",routes)
                self.assertIn("Queue("+names[0]+",,,,120)",routes)
                self.assertNotIn("union-fvx",config+routes)
                self.assertNotIn("_X.",config+routes)
                self.assertNotIn("union-entrada",config+routes)
                off={**active,"enabled":False}
                conf2,dial2,names2,numbers2=agent.render_queue_configs([off])
                self.assertEqual(names2,[])
                self.assertEqual(numbers2,set())
                self.assertNotIn("exten => 850",dial2.decode())

    def test_queue_blocks_cross_tenant_invalid_extension_and_duplicate_members(self):
        org=str(uuid.uuid4())
        member={"organization_id":org,"number":301,"endpoint_name":"union-301","position":1,
                "desired_enabled":True,"provisioning_status":"manual"}
        payload={"id":str(uuid.uuid4()),"organization_id":org,"name":"Suporte",
          "test_extension":850,"strategy":"rrmemory","ring_seconds":20,
          "max_wait_seconds":120,"enabled":True,"updated_at":"2026-11-04T09:20:00Z",
          "members":[member]}
        invalid=[
            ({**payload,"organization_id":str(uuid.uuid4())},org),
            ({**payload,"test_extension":301},org),
            ({**payload,"test_extension":900},org),
            ({**payload,"strategy":"system"},org),
            ({**payload,"members":[member,member]},org),
            ({**payload,"members":[{**member,"endpoint_name":"PJSIP/FVX"}]},org),
            ({**payload,"members":[{**member,"desired_enabled":False}]},org),
            ({**payload,"members":[{**member,"number":900}]},org),
            ({**payload,"members":[{**member,"organization_id":str(uuid.uuid4())}]},org),
        ]
        for job,organization in invalid:
            with self.subTest(test=job):
                with self.assertRaises(agent.AgentError):
                    agent.validate_queue_job(job,organization)

    def test_queue_provisioning_defers_when_call_in_progress(self):
        with patch.object(agent,"asterisk",return_value="2 active channels\n2 active calls\n"):
            with self.assertRaises(agent.Busy):
                agent.assert_no_calls()

    def test_signature_works_with_standard_openssl_ed25519(self):
        with tempfile.TemporaryDirectory() as directory:
            key=Path(directory)/"key.pem"
            pub=Path(directory)/"pub.pem"
            subprocess.run(["openssl","genpkey","-algorithm","ED25519","-out",str(key)],check=True)
            subprocess.run(["openssl","pkey","-in",str(key),"-pubout","-out",str(pub)],check=True)
            data=b'1700000000000\n1\n{"action":"poll"}'
            message_file=Path(directory)/"message"
            message_file.write_bytes(data)
            sign=subprocess.run(
                ["openssl","pkeyutl","-sign","-inkey",str(key),"-rawin","-in",str(message_file)],
                stdout=subprocess.PIPE,check=True).stdout
            self.assertEqual(len(sign),64)
            subprocess.run(
                ["openssl","pkeyutl","-verify","-pubin","-inkey",str(pub),"-rawin",
                 "-sigfile",str(self._signature_file(directory,sign)),"-in",str(message_file)],
                stdout=subprocess.PIPE,check=True)

    def test_sip_password_only_leaves_vps_as_rsa_oaep_ciphertext(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            extension_id=str(uuid.uuid4())
            organization_id=str(uuid.uuid4())
            password="SafeSIPpassword_" + "a"*40
            (root/"extensions").mkdir()
            (root/"extensions"/(extension_id+".json")).write_text(json.dumps({
                "id":extension_id,
                "organization_id":organization_id,
                "endpoint":"uw-"+"a"*32,
                "password":password,
                "enabled":True,
            }))
            private=root/"rsa-private.pem"
            subprocess.run(["openssl","genpkey","-algorithm","RSA",
               "-pkeyopt","rsa_keygen_bits:2048","-out",str(private)],
               check=True,stderr=subprocess.DEVNULL)
            der=subprocess.run(["openssl","pkey","-in",str(private),"-pubout","-outform","DER"],
                stdout=subprocess.PIPE,check=True).stdout
            payload={
                "id":str(uuid.uuid4()),
                "organization_id":organization_id,
                "extension_id":extension_id,
                "public_key_base64":base64.b64encode(der).decode(),
            }
            with patch.object(agent,"STATE_DIR",root):
                request_id,ciphertext=agent.encrypt_login_for_browser(payload,organization_id)
            self.assertEqual(request_id,payload["id"])
            self.assertNotIn(password,ciphertext)
            encrypted_file=root/"encrypted.bin"
            encrypted_file.write_bytes(base64.b64decode(ciphertext))
            decrypted=subprocess.run(["openssl","pkeyutl","-decrypt","-inkey",str(private),
              "-pkeyopt","rsa_padding_mode:oaep","-pkeyopt","rsa_oaep_md:sha256",
              "-pkeyopt","rsa_mgf1_md:sha256","-in",str(encrypted_file)],
              stdout=subprocess.PIPE,check=True).stdout
            self.assertEqual(decrypted.decode(),password)
            self.assertFalse(list(root.glob(".rsa-public-*")))
            self.assertFalse(list(root.glob(".sip-secret-*")))

    @staticmethod
    def _signature_file(directory, content):
        target=Path(directory)/"sig"
        target.write_bytes(content)
        return target

if __name__=="__main__":
    unittest.main()
