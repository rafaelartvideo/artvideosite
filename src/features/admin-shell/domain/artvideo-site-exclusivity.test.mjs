import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=path=>readFileSync(path,"utf8");
const app=()=>read("src/app/Admin.tsx");
const sidebar=()=>read("src/features/admin-shell/presentation/AdminSidebar.tsx");
const nav=()=>read("src/features/admin-shell/navigation-config.ts");

test("Site, orçamentos da web e suas rotas são exclusivos da Artvideo, não basta quotes.view",()=>{
  for(const source of [app(),sidebar()]){
    assert.match(source,/tab === "site" \|\| tab === "quotes" \|\| parentAdminTab\(tab\) === "site"/);
    assert.match(source,/!isArtVideoOrganization/);
    assert.match(source,/tab === "siteRequests"\) return isArtVideoOrganization && hasPermission\("site.view"\)/);
  }
  assert.match(app(),/!canAccessTab\(activeTab\)/);
  assert.match(nav(),/export const siteModuleKeys = \[\s*"site_categories"/);
  assert.doesNotMatch(nav().slice(nav().indexOf("export const siteModuleKeys"),nav().indexOf("export const operationModuleKeys")),/"quotes"/);
  assert.match(read("src/features/settings/presentation/SiteRequestsPage.tsx"),/const canQuotes = isArtvideo && hasPermission\("site.view"\)/);
});

test("cadastro da empresa parceira não apresenta acesso ao site nem busca convites Artvideo",()=>{
  const registration=read("src/features/registrations/presentation/RegistrationDetails.tsx");
  const customer=read("src/features/customers/presentation/CustomerDetailsPage.tsx");
  const invite=read("src/features/customers/presentation/CustomerAccessInviteSection.tsx");
  const linked=read("src/features/registrations/presentation/RegistrationRequestsSection.tsx");
  assert.match(registration,/activeOrganization\?\.is_artvideo_tenant === true && selected.person_type/);
  assert.match(customer,/isArtvideo && detail.customer_type === "PF"/);
  assert.match(customer,/isArtvideo && canViewQuotes/);
  assert.match(invite,/if\(!isArtvideo\)return;/);
  assert.match(invite,/if\(!isArtvideo\)return null;/);
  assert.match(linked,/const canViewQuotes=isArtvideo&&hasPermission\("quotes.view"\)/);
  assert.match(linked,/const canViewShop=isArtvideo&&hasPermission\("site_settings.view"\)/);
  assert.match(read("src/features/customers/presentation/LegacyTabCustomers.tsx"),/activeOrganization\?\.is_artvideo_tenant === true && !sharedReadOnly/);
});

test("painéis, funções e módulos de parceiras não oferecem a loja ou o orçamento do site",()=>{
  const dashboard=read("src/features/dashboard/presentation/TabDashboard.tsx");
  const perms=read("src/features/access/domain/permission-scope.ts");
  const partner=read("src/features/partner-companies/presentation/PartnerCompanyPermissionsSection.tsx");
  const sql=read("supabase/migrations/20261028233000_artvideo_site_and_quotes_only.sql");
  assert.match(dashboard,/quotes: activeOrganization\?\.is_artvideo_tenant === true/);
  assert.match(perms,/return key.startsWith\("quotes\."\)/);
  assert.match(partner,/isArtvideoOnlyModule/);
  assert.match(partner,/getArtVideoOrganizationId/);
  assert.match(partner,/isArtvideoTarget \|\| !isArtvideoOnlyModule/);
  assert.match(sql,/module_key='quotes' or module_key like 'site_%'/);
  assert.match(sql,/organization_id <> public.artvideo_organization_id\(\)/);
  assert.match(sql,/before insert or update of organization_id,module_key,is_enabled/);
});
