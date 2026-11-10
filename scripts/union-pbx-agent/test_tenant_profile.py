from pathlib import Path
import unittest
import uuid

import tenant_profile as tenancy


class TenantProfileTests(unittest.TestCase):
    def test_profiles_have_disjoint_private_state_and_asterisk_files(self):
        first, second = tenancy.profile_paths(str(uuid.uuid4())), tenancy.profile_paths(str(uuid.uuid4()))
        for field in ('config_dir','state_dir','master_file','dialplan_file','queue_file','queue_routes_file'):
            self.assertNotEqual(getattr(first,field),getattr(second,field))
        self.assertNotEqual(first.context,second.context)
        self.assertEqual(first.config_dir.parent,Path('/etc/union-pbx-agent/tenants'))
        self.assertTrue(first.context.startswith('uwi-'))
        self.assertNotIn('union-internal',first.context)

    def test_profile_names_cannot_escape_or_inject_config(self):
        for invalid in ('../another','','FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF','x\n#include evil','0000'):
            with self.assertRaises(tenancy.TenantProfileError):
                tenancy.profile_paths(invalid)

    def test_includes_are_exact_and_context_contains_only_uuid_hex(self):
        organization=str(uuid.uuid4())
        profile=tenancy.profile_paths(organization)
        self.assertEqual(profile.context,'uwi-'+uuid.UUID(organization).hex)
        self.assertIn(profile.master_file.name,profile.pjsip_include)
        self.assertIn(profile.dialplan_file.name,profile.dialplan_include)
        self.assertNotIn('*',profile.pjsip_include+profile.dialplan_include)
        self.assertEqual(profile.organization_id,organization)


if __name__=='__main__':unittest.main()
