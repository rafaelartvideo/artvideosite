import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '@/lib/auth';
import { localPerformance, networkContext, performanceAlias, subscribePerformance } from './local-performance-runtime';
import { contentReady, READY_SCREENS, screenName } from './performance-screen-rules.mjs';

/** Opt-in only. No HTTP, logs, payload reads or persistent client storage. */
export function LocalPerformanceObserver() {
  const { pathname }=useLocation();
  const { user, activeOrganizationId, loading }=useAuth();
  const [epoch,setEpoch]=useState(0);
  const previous=useRef('');
  const visits=useRef(new Set<string>());
  useEffect(()=>subscribePerformance(()=>{ visits.current.clear(); previous.current=''; setEpoch(n=>n+1); }),[]);
  useLayoutEffect(()=>{
    if(!pathname.startsWith('/admin')||!localPerformance.active())return;
    localPerformance.context({screen:screenName(pathname),user:performanceAlias('user',user?.id),organization:performanceAlias('org',activeOrganizationId),
      network:networkContext(),visibility:document.visibilityState});
  },[pathname,user?.id,activeOrganizationId,epoch]);
  useEffect(()=>{
    if(!pathname.startsWith('/admin')||!localPerformance.active()||loading)return;
    const name=screenName(pathname),network=networkContext();
    const reason=!previous.current?'collection_start':previous.current===pathname?'context_change':'navigation';
    localPerformance.context({visit:reason+'.'+(visits.current.has(name)?'revisit':'first_visit')});
    previous.current=pathname; visits.current.add(name);
    const paint=localPerformance.begin('screen_paint',name),ready=READY_SCREENS.has(name)?localPerformance.begin('screen_ready',name):{end(_outcome:string){}};
    let finished=false,frame=0,timer:ReturnType<typeof setTimeout>|undefined;
    const finish=(outcome:string)=>{ if(finished)return;finished=true;ready.end(outcome);observer.disconnect();clearTimeout(deadline);clearTimeout(timer); };
    const check=()=>{
      timer=undefined;
      if(document.hidden){finish('hidden');return;}
      if(networkContext()!==network){finish('interrupted');return;}
      if(!READY_SCREENS.has(name))return;
      const headings=Array.from(document.querySelectorAll('h1,h2')).filter(el=>el.getClientRects().length).map(el=>el.textContent?.trim()??'');
      if(contentReady(name,headings,document.querySelector('main')?.textContent??document.body.textContent??''))finish('success');
    };
    const observer=new MutationObserver(()=>{if(timer===undefined&&!finished)timer=setTimeout(check,250);});
    const deadline=setTimeout(()=>finish('timeout'),30000);
    const hidden=()=>{if(document.hidden){paint.end('hidden');finish('hidden');}};
    document.addEventListener('visibilitychange',hidden);
    if(READY_SCREENS.has(name))observer.observe(document.body,{childList:true,subtree:true,characterData:true});
    frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{paint.end(document.hidden?'hidden':'success');check();});});
    // Unsupported readiness must never be reported as a successful ready screen.
    if(!READY_SCREENS.has(name)){finished=true;clearTimeout(deadline);}
    return ()=>{paint.end('interrupted');if(READY_SCREENS.has(name))finish('interrupted');observer.disconnect();cancelAnimationFrame(frame);clearTimeout(timer);clearTimeout(deadline);document.removeEventListener('visibilitychange',hidden);};
  },[pathname,user?.id,activeOrganizationId,loading,epoch]);
  return null;
}
