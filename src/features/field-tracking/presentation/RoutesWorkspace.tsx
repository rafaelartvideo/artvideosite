import { useMemo,useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMapEvents } from "react-leaflet";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { evaluateRoute,optimizeRoute,MAX_ROUTE_STOPS } from "../domain/route-planner.mjs";
import { listFleet } from "../infrastructure/logistics.repository";
import { listRouteJobs,listRoutePlans,saveRoutePlan,type RouteInput,type RoutePoint,type RouteStop } from "../infrastructure/logistics-routes.repository";

const field="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const fmt=(v:number)=>v.toLocaleString("pt-BR",{maximumFractionDigits:1});
const time=(value:string)=>new Date(value).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
function MapPicker({onPick}:{onPick:(p:RoutePoint)=>void}) {
  useMapEvents({click:e=>onPick({latitude:Number(e.latlng.lat.toFixed(6)),longitude:Number(e.latlng.lng.toFixed(6))})});
  return null;
}
export function RoutesWorkspace({organizationId:org}:{organizationId:string}) {
  const fleet=useQuery({queryKey:["logistics-fleet",org],queryFn:()=>listFleet(org),retry:false,staleTime:60000,refetchOnWindowFocus:false});
  const [shift,setShift]=useState("");
  if(fleet.isPending)return <AdminCard className="p-4">Carregando jornadas...</AdminCard>;
  if(fleet.isError||!fleet.data)return <AdminCard className="p-4">Não foi possível consultar jornadas. <AdminButton variant="secondary" onClick={()=>void fleet.refetch()}>Atualizar</AdminButton></AdminCard>;
  const {activeShifts,vehicles,drivers,employees}=fleet.data;
  return <div className="space-y-3">
    <AdminCard className="space-y-2 p-3">
      <label className="block text-sm font-semibold">Jornada do motorista<select className={field} value={shift} onChange={e=>setShift(e.target.value)}><option value="">Selecione uma jornada aberta</option>{activeShifts.map(s=><option key={s.id} value={s.id}>{employees.find(e=>e.id===drivers.find(d=>d.id===s.driver_id)?.employee_id)?.full_name??"Motorista"} · {vehicles.find(v=>v.id===s.vehicle_id)?.name??"Veículo"}</option>)}</select></label>
    </AdminCard>
    {shift&&activeShifts.some(s=>s.id===shift)&&<RouteEditor key={org+":"+shift} org={org} shift={shift}/>}
  </div>;
}
function RouteEditor({org,shift}:{org:string;shift:string}) {
  const jobs=useQuery({queryKey:["logistics-route-jobs",org,shift],queryFn:()=>listRouteJobs(org,shift),retry:false,refetchOnWindowFocus:false});
  const plans=useQuery({queryKey:["logistics-route-plans",org,shift],queryFn:()=>listRoutePlans(org,shift),retry:false,refetchOnWindowFocus:false});
  const [departure,setDeparture]=useState("");
  const [speed,setSpeed]=useState("30");
  const [origin,setOrigin]=useState<RoutePoint|null>(null);
  const [back,setBack]=useState(true);
  const [stops,setStops]=useState<RouteStop[]>([]);
  const [target,setTarget]=useState("origin");
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [busy,setBusy]=useState(false);
  const [comparison,setComparison]=useState("");
  const [pickLat,setPickLat]=useState("");
  const [pickLon,setPickLon]=useState("");
  const available=jobs.data??[];
  const input=useMemo<RouteInput|null>(()=>{
    if(!origin||!departure||!stops.length||stops.some(s=>!Number.isFinite(s.latitude)||!Number.isFinite(s.longitude))||!Number.isFinite(Date.parse(departure)))return null;
    return {origin,departure:new Date(departure).toISOString(),speedKmh:Number(speed),returnToOrigin:back,stops};
  },[origin,departure,stops,speed,back]);
  const estimate=useMemo(()=>{if(!input)return null;try{return evaluateRoute(input);}catch{return null;}},[input]);
  const stale=stops.some(s=>!available.some(j=>j.id===s.id&&j.window_start===s.window_start&&j.window_end===s.window_end));
  const pick=(p:RoutePoint)=>{
    if(!Number.isFinite(p.latitude)||Math.abs(p.latitude)>90||!Number.isFinite(p.longitude)||Math.abs(p.longitude)>180)return;
    if(target==="origin")setOrigin(p);else setStops(rows=>rows.map(s=>s.id===target?{...s,...p}:s));
    setComparison("");setSuccess("");
  };
  const add=(id:string)=>{
    const j=available.find(j=>j.id===id);
    if(!j||stops.length>=MAX_ROUTE_STOPS||stops.some(s=>s.id===id))return;
    setStops(rows=>[...rows,{id,latitude:NaN,longitude:NaN,window_start:j.window_start,window_end:j.window_end,serviceMinutes:10}]);setTarget(id);setComparison("");setSuccess("");
  };
  const move=(i:number,d:number)=>{setStops(rows=>{const copy=[...rows];[copy[i],copy[i+d]]=[copy[i+d],copy[i]];return copy;});setComparison("");setSuccess("");};
  const optimize=()=>{if(!input||!estimate||stale)return;const result=optimizeRoute(input);setStops(result.stops);setComparison("Antes: "+fmt(result.baseline.km)+" km em linha reta · "+result.baseline.lateStops+" atrasos previstos. Depois: "+fmt(result.optimized.km)+" km · "+result.optimized.lateStops+" atrasos previstos.");setSuccess("");};
  const save=async()=>{if(!input||!estimate||stale||busy)return;setBusy(true);setError("");setSuccess("");try{await saveRoutePlan(org,shift,input);setSuccess("Versão do planejamento salva.");await plans.refetch();}catch(e){setError(systemErrorMessage(e));}finally{setBusy(false);}};
  const load=(p:NonNullable<typeof plans.data>[number])=>{
    const date=new Date(p.planned_departure);const local=new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
    setDeparture(local);setSpeed(String(p.assumed_speed_kmh));setBack(p.return_to_origin);setOrigin({latitude:p.origin_lat,longitude:p.origin_lon});setStops(p.stops);setTarget("origin");setComparison("");setSuccess("");setError("");
  };
  const path=(origin?[origin,...stops.filter(s=>Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)),...(back&&stops.length?[origin]:[])]:[]).map(p=>[p.latitude,p.longitude] as [number,number]);
  if(jobs.isPending||plans.isPending)return <AdminCard className="p-4">Carregando operações...</AdminCard>;
  if(jobs.isError||plans.isError)return <AdminCard className="space-y-2 p-4"><p role="alert">Planejamento indisponível ou sem acesso.</p><AdminButton variant="secondary" onClick={()=>{void jobs.refetch();void plans.refetch();}}>Tentar novamente</AdminButton></AdminCard>;
  return <div className="space-y-3">
    <AdminCard className="space-y-3 p-4">
      <h2 className="font-semibold">Planejamento da rota</h2>
      <p className="text-xs text-muted-foreground">Pré-planejamento por coordenadas, sem cálculo pelas ruas ou trânsito. A distância em linha reta não é quilometragem rodoviária e não serve como navegação. Horários são estimativas locais com velocidade assumida.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Saída prevista<input className={field} type="datetime-local" value={departure} onChange={e=>{setDeparture(e.target.value);setComparison("");setSuccess("");}}/></label>
        <label className="text-xs">Velocidade de simulação (km/h)<input className={field} type="number" min="5" max="100" value={speed} onChange={e=>{setSpeed(e.target.value);setComparison("");setSuccess("");}}/></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={back} onChange={e=>{setBack(e.target.checked);setComparison("");setSuccess("");}}/>Incluir retorno à origem</label>
      <label className="block text-xs">Adicionar operação<select className={field} value="" disabled={stops.length>=MAX_ROUTE_STOPS} onChange={e=>add(e.target.value)}><option value="">Selecione (até 30 paradas)</option>{available.slice(0,100).filter(j=>!stops.some(s=>s.id===j.id)).map(j=><option key={j.id} value={j.id}>{j.kind==="pickup"?"Coleta":"Entrega"} · OS {j.order_number??"—"} · {j.address}</option>)}</select></label>
      {available.length>100&&<p className="text-xs text-muted-foreground">Lista limitada às primeiras 100 operações elegíveis.</p>}
      <label className="block text-xs">Marcar ponto no mapa<select className={field} value={target} onChange={e=>setTarget(e.target.value)}><option value="origin">Origem</option>{stops.map((s,i)=><option value={s.id} key={s.id}>Parada {i+1}</option>)}</select></label>
      <div className="relative isolate overflow-hidden rounded-lg border border-border">
        <MapContainer center={[-10.9472,-37.0731]} zoom={12} scrollWheelZoom={false} className="h-[340px] w-full">
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
          <MapPicker onPick={pick}/>
          {origin&&<CircleMarker center={[origin.latitude,origin.longitude]} radius={8} pathOptions={{color:"#059669"}}><Tooltip permanent>Origem</Tooltip></CircleMarker>}
          {stops.map((s,i)=>Number.isFinite(s.latitude)&&Number.isFinite(s.longitude)?<CircleMarker key={s.id} center={[s.latitude,s.longitude]} radius={7} pathOptions={{color:"#0131CD"}}><Tooltip permanent>{i+1}</Tooltip></CircleMarker>:null)}
          {path.length>1&&<Polyline positions={path} pathOptions={{color:"#0131CD",dashArray:"6 6"}}/>}
        </MapContainer>
      </div>
      <div className="grid gap-2 sm:grid-cols-3"><label className="text-xs">Latitude<input className={field} value={pickLat} onChange={e=>setPickLat(e.target.value)} placeholder="-10.95"/></label><label className="text-xs">Longitude<input className={field} value={pickLon} onChange={e=>setPickLon(e.target.value)} placeholder="-37.07"/></label><div className="self-end"><AdminButton variant="secondary" disabled={!pickLat.trim()||!pickLon.trim()||!Number.isFinite(Number(pickLat))||!Number.isFinite(Number(pickLon))||Math.abs(Number(pickLat))>90||Math.abs(Number(pickLon))>180} onClick={()=>pick({latitude:Number(pickLat),longitude:Number(pickLon)})}>Usar coordenadas</AdminButton></div></div>
      <p className="text-xs text-muted-foreground">Origem: {origin?origin.latitude.toFixed(5)+", "+origin.longitude.toFixed(5):"não marcada"}</p>
      {stops.map((s,i)=>{const job=available.find(j=>j.id===s.id);const row=estimate?.schedule[i];return <div key={s.id} className="space-y-2 rounded-lg border border-border p-3">
        <strong className="text-sm">{i+1}. {job? (job.kind==="pickup"?"Coleta":"Entrega")+" · OS "+(job.order_number??"—"):"Operação não disponível"}</strong>
        <p className="text-xs">{job?.address??"Atualize ou remova esta parada."}</p>
        <p className="text-xs text-muted-foreground">{time(s.window_start)} – {time(s.window_end)} · {Number.isFinite(s.latitude)?"Ponto definido":"Marque o ponto"}</p>
        {row&&<p className={"text-xs "+(row.lateMinutes>0?"text-red-600":"text-emerald-600")}>Chegada simulada: {time(row.arrival)}{row.waitMinutes>0?" · espera "+fmt(row.waitMinutes)+" min":""}{row.lateMinutes>0?" · atraso "+fmt(row.lateMinutes)+" min":""}</p>}
        <div className="flex flex-wrap items-end gap-2"><label className="w-28 text-xs">Atendimento (min)<input className={field} type="number" min="1" max="180" value={s.serviceMinutes} onChange={e=>{setStops(rows=>rows.map(x=>x.id===s.id?{...x,serviceMinutes:Number(e.target.value)}:x));setComparison("");setSuccess("");}}/></label>
          <AdminButton variant="secondary" disabled={i===0} onClick={()=>move(i,-1)}>Subir</AdminButton><AdminButton variant="secondary" disabled={i===stops.length-1} onClick={()=>move(i,1)}>Descer</AdminButton><AdminButton variant="secondary" onClick={()=>{setStops(rows=>rows.filter(x=>x.id!==s.id));if(target===s.id)setTarget("origin");setComparison("");setSuccess("");}}>Remover</AdminButton>
        </div>
      </div>;})}
      {stale&&<p role="alert" className="text-sm text-red-600">Há operações que mudaram. Remova ou adicione novamente as paradas desatualizadas.</p>}
      {estimate&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Distância em linha reta</p><strong>{fmt(estimate.km)} km</strong></div><div><p className="text-xs text-muted-foreground">Duração simulada</p><strong>{fmt(estimate.durationMinutes)} min</strong></div><div><p className="text-xs text-muted-foreground">Atrasos previstos</p><strong>{estimate.lateStops}</strong></div><p className="col-span-full text-xs">Término simulado: {time(estimate.finish)}</p></div>}
      {comparison&&<p className="text-xs text-muted-foreground">{comparison}</p>}
      {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{success&&<p role="status" className="text-sm text-emerald-600">{success}</p>}
      <div className="flex flex-wrap gap-2"><AdminButton variant="secondary" disabled={!estimate||stale||busy} onClick={optimize}>Sugerir ordem</AdminButton><AdminButton variant="primary" disabled={!estimate||stale||busy} loading={busy} onClick={()=>void save()}>Salvar versão</AdminButton><AdminButton variant="secondary" onClick={()=>void jobs.refetch()}>Atualizar operações</AdminButton></div>
    </AdminCard>
    <AdminCard className="space-y-2 p-3"><h2 className="font-semibold">Últimas versões planejadas</h2>{!plans.data?.length&&<p className="text-xs text-muted-foreground">Nenhuma versão salva.</p>}{plans.data?.map(p=><div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2" key={p.id}><span className="text-xs">{time(p.created_at)} · {p.stops.length} paradas</span><AdminButton variant="secondary" onClick={()=>load(p)}>Carregar versão</AdminButton></div>)}</AdminCard>
  </div>;
}
