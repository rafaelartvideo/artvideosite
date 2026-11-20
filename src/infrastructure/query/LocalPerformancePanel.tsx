import { useEffect, useRef, useState } from 'react';
import { localPerformance } from './local-performance-runtime';

/** Separate diagnostic panel: no navigation entry or ordinary business-flow UI. */
export function LocalPerformancePanel() {
  const [open,setOpen]=useState(false);
  const [cache,setCache]=useState('uncontrolled');
  const [rows,setRows]=useState<any[]>([]);
  const dialog=useRef<HTMLDialogElement>(null);
  const refresh=()=>setRows(localPerformance.report());
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.ctrlKey&&event.altKey&&event.code==='KeyM'){event.preventDefault();setOpen(value=>!value);}
    };
    window.addEventListener('keydown',key);
    return ()=>window.removeEventListener('keydown',key);
  },[]);
  useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();},[open]);
  if(!open)return null;
  const api=()=> (window as any).unionPerformance;
  return <dialog ref={dialog} onCancel={()=>setOpen(false)} aria-labelledby="local-performance-title"
    style={{width:'min(960px,94vw)',maxHeight:'85vh',overflow:'auto',margin:'auto',padding:24,borderRadius:12,background:'#fff',color:'#14202e',zIndex:10000}}>
    <h2 id="local-performance-title">Medição local de desempenho</h2>
    <p>Os dados ficam nesta aba. Não são enviados ao servidor. Recarregar a página apaga a coleta.</p>
    <p>Limite: oito horas e 25.000 registros. Cabeçalhos, resposta completa e telas são medições separadas.</p>
    <label>Condição de cache declarada <select aria-label="Condição de cache" value={cache} onChange={e=>setCache(e.target.value)}>
      <option value="uncontrolled">Não controlada</option><option value="cold">Frio — preparado pelo operador</option><option value="warm">Aquecido — preparado pelo operador</option>
    </select></label>
    <p>Essa escolha não limpa nem aquece caches. Para comparar resultados, mantenha as mesmas condições de usuário, sessão e rede.</p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'16px 0'}}>
      <button type="button" onClick={()=>{api().start({cache});refresh();}}>Iniciar nova coleta local</button>
      <button type="button" onClick={()=>{api().stop();refresh();}}>Parar coleta</button>
      <button type="button" onClick={refresh}>Atualizar resumo</button>
      <button type="button" onClick={()=>api().download()}>Exportar arquivo local</button>
      <button type="button" onClick={()=>setOpen(false)}>Fechar medição</button>
    </div>
    <p>Estado: {localPerformance.active()?'coletando':'parado'}. Registros descartados: {localPerformance.status().dropped}.</p>
    <p>Até 200 contextos exibidos. O arquivo exportado contém todos os registros retidos.</p>
    <p>p50: mínimo 30 sucessos; p95: 200; p99: 1.000 por contexto. São estimativas empíricas, sem garantia de precisão. Erros e observações interrompidas ficam separados.</p>
    <table><thead><tr><th>Medição</th><th>Contexto</th><th>Total</th><th>Erros</th><th>Interrompidas</th><th>p50 ms</th><th>p95 ms</th><th>p99 ms</th></tr></thead>
      <tbody>{rows.slice(0,200).map((row,index)=><tr key={index}><td>{({rpc_headers:'Até cabeçalhos',rpc_body:'Resposta completa',screen_paint:'Rota + 2 quadros',screen_ready:'Conteúdo principal'} as Record<string,string>)[row.kind]??row.kind} / {row.name}</td><td><details><summary>{row.context.user} / {row.context.organization} / {row.context.cache}</summary><pre>{JSON.stringify(row.context,null,2)}</pre></details></td>
        <td>{row.total}</td><td>{row.errors}</td><td>{row.censored}</td><td>{row.p50??'Amostra insuficiente'}</td><td>{row.p95??'Amostra insuficiente'}</td><td>{row.p99??'Amostra insuficiente'}</td></tr>)}</tbody>
    </table>
  </dialog>;
}
