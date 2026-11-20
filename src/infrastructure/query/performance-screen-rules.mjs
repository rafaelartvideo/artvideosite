const modules=new Set(['dashboard','orders','customers','registrations','agenda','inventory','finance','sales','pdv','site','tools','settings','appointments','products','equipment']);
export function screenName(path) {
  const [,admin,module,detail]=path.split('/');
  if(admin!=='admin')return 'public';
  if(!module)return 'home';
  if(!modules.has(module))return 'other';
  return module+(detail?'.detail':'');
}
export function contentReady(name,headings,text) {
  if(name==='home')return headings.some(h=>/^(Bom dia|Boa tarde|Boa noite)/i.test(h));
  if(name==='orders')return headings.some(h=>h.startsWith('Ordens de Serviço'))&&/(?:\d+ OS encontrada(?:s)?|Total do filtro:\s*[\d.]+ OS)/.test(text);
  if(name==='finance')return headings.includes('Resumo financeiro');
  if(name==='inventory')return headings.includes('Estoque')&&/\d+ ite(?:m|ns|ms) cadastrado(?:s)?/.test(text);
  return false;
}
export const READY_SCREENS=new Set(['home','orders','finance','inventory']);
