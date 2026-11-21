import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {transformWithEsbuild} from 'vite';
const read=p=>readFileSync(p,'utf8');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
test('código ativo não importa o provedor SAC aposentado; atalhos usam componente compartilhado',()=>{
 for(const p of files('src').filter(p=>/\.(tsx?|mjs)$/.test(p)&&!p.endsWith('.test.mjs'))){
  assert.doesNotMatch(read(p),/from ["'][^"']*sac-digital\//,p);
 }
 assert.doesNotMatch(read('src/features/orders/presentation/OrderDetailsPage.tsx'),/OrderSacDigitalDialog|getSacDigitalIntegrationStatus|setSacMessageOpen/);
 assert.doesNotMatch(read('src/features/quotes/presentation/SiteQuoteDetailsPage.tsx'),/QuoteSacDigitalDialog|setSacOpen/);
 assert.doesNotMatch(read('src/features/integrations/presentation/PlatformIntegrationsPage.tsx'),/key: "sac_digital"/);
});
test('configuração não oferece reativar o provedor aposentado, incluindo módulos dinâmicos',()=>{
 const settings=read('src/features/partner-companies/presentation/PartnerCompanyPermissionsSection.tsx');
 assert.doesNotMatch(settings,/key: "sac_digital"/);
 assert.match(settings,/String\(module.key\) !== "sac_digital"/);
 assert.doesNotMatch(read('src/features/management/presentation/UnionWhatsAppEnginePage.tsx'),/SAC Digital/);
 assert.doesNotMatch(read('src/features/admin-shell/presentation/AdminSidebar.tsx'),/hasModule\("sac_digital"\)/);
});
test('WhatsApp externo abre diretamente, sem consulta de status, aba intermediária ou envio automático',async()=>{
 const source=read('src/shared/ui/whatsapp/CompanyWhatsAppAction.tsx');
 assert.doesNotMatch(source,/supabase|functions\.invoke|about:blank|sac-digital/);
 const {code}=await transformWithEsbuild(source,'CompanyWhatsAppAction.tsx',{loader:'tsx',jsx:'transform',jsxFactory:'h'});
 const executable=code.replace(/^import .*?;\s*$/gm,'').replace(/export /g,'');
 const opened=[];
 const {Component,normalize}=new Function('h','window',`${executable}; return {Component:CompanyWhatsAppAction,normalize:normalizeWhatsAppPhone};`)((type,props,...children)=>({type,props,children}),{open:(...args)=>opened.push(args)});
 assert.equal(normalize('(79) 98803-7605'),'5579988037605');
 const element=Component({phone:'(79) 98803-7605',children:'WhatsApp'});
 element.props.onClick();
 assert.deepEqual(opened,[['https://wa.me/5579988037605','_blank','noopener,noreferrer']]);
 const disabled=Component({phone:'',children:'WhatsApp'}); disabled.props.onClick();
 assert.equal(opened.length,1); assert.equal(disabled.props.disabled,true);
});
