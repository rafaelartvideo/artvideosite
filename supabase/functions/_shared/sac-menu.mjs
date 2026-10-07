export function validateMenuSettings(input) {
 if(!input||typeof input!=='object'||typeof input.enabled!=='boolean'||!['static','service_order_status'].includes(input.source)) throw Error('Configuração de menu inválida.');
 const text=String(input.text||'').trim();if(text.length>4000)throw Error('Texto do menu muito longo.');
 if(!Array.isArray(input.choices)||input.choices.length>10)throw Error('Adicione até dez opções.');
 const tags=new Set();const choices=input.choices.map(choice=>{const tag=String(choice.tag||'').trim(),text=String(choice.text||'').trim();if(!/^[a-zA-Z0-9_-]{1,40}$/.test(tag)||!text||text.length>100||tags.has(tag))throw Error('Opções de menu inválidas ou repetidas.');tags.add(tag);return {tag,text};});
 return {enabled:input.enabled,text,choices,source:input.source};
}
export function menuResponse(settings, orders=[]) {
 const config=validateMenuSettings(settings);if(!config.enabled)return {sucesso:false,retorno:{texto:'Menu indisponível.',menus:[]}};
 let text=config.text;
 if(config.source==='service_order_status') text+=orders.length?'\n'+orders.map(o=>`OS ${o.os_number}: ${o.status || 'Em acompanhamento'}`).join('\n'):'\nNenhuma ordem de serviço vinculada foi encontrada para este contato.';
 return {sucesso:true,retorno:{texto:text,menus:config.choices.map(c=>({tag:c.tag,menu:c.text}))}};
}

export function resolveMenuCustomer(contacts, totalCount) {
 if(!Number.isInteger(totalCount)||totalCount>contacts.length)return null;
 const ids=[...new Set(contacts.map(c=>c.customer_id).filter(Boolean))];
 return ids.length===1?ids[0]:null;
}
