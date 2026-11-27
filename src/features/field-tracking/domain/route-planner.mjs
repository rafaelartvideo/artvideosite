import { distanceKm } from "./field-trip.mjs";

export const MAX_ROUTE_STOPS = 30;
export function validRoutePoint(p) {
  return !!p && Number.isFinite(p.latitude) && Math.abs(p.latitude)<=90 &&
    Number.isFinite(p.longitude) && Math.abs(p.longitude)<=180;
}
function validate(input) {
  if(!validRoutePoint(input.origin)||!Number.isFinite(Date.parse(input.departure))||
    !Number.isFinite(input.speedKmh)||input.speedKmh<5||input.speedKmh>100||
    !Array.isArray(input.stops)||!input.stops.length||input.stops.length>MAX_ROUTE_STOPS) throw Error("Parâmetros de rota inválidos.");
  const ids=new Set();
  for(const stop of input.stops) {
    if(!stop.id||ids.has(stop.id)||!validRoutePoint(stop)||!Number.isFinite(Date.parse(stop.window_start))||
      !(Date.parse(stop.window_end)>Date.parse(stop.window_start))||
      !Number.isInteger(stop.serviceMinutes)||stop.serviceMinutes<1||stop.serviceMinutes>180) throw Error("Parada inválida ou repetida.");
    ids.add(stop.id);
  }
}
function leg(from,to,time,speed) {
  const km=distanceKm(from,to);
  const arrival=time+km/speed*3600000;
  return {km,arrival};
}
function schedule(from,stop,time,speed) {
  const {km,arrival}=leg(from,stop,time,speed);
  const begin=Math.max(arrival,Date.parse(stop.window_start));
  const end=begin+stop.serviceMinutes*60000;
  return {id:stop.id,km,arrival:new Date(arrival).toISOString(),serviceStart:new Date(begin).toISOString(),
    departure:new Date(end).toISOString(),lateMinutes:Math.max(0,(begin-Date.parse(stop.window_end))/60000),
    waitMinutes:Math.max(0,(begin-arrival)/60000)};
}
// Distância em linha reta: não representa ruas, trânsito ou navegação.
export function evaluateRoute(input) {
  validate(input);
  let point=input.origin,time=Date.parse(input.departure),km=0;
  const scheduleRows=[];
  for(const stop of input.stops) {
    const row=schedule(point,stop,time,input.speedKmh);
    scheduleRows.push(row);km+=row.km;time=Date.parse(row.departure);point=stop;
  }
  let returnKm=0;
  if(input.returnToOrigin) {const back=leg(point,input.origin,time,input.speedKmh);returnKm=back.km;km+=back.km;time=back.arrival;}
  return {km,returnKm,finish:new Date(time).toISOString(),durationMinutes:(time-Date.parse(input.departure))/60000,
    lateStops:scheduleRows.filter(s=>s.lateMinutes>0).length,
    lateMinutes:scheduleRows.reduce((sum,s)=>sum+s.lateMinutes,0),schedule:scheduleRows};
}
function compare(a,b) {
  return a.lateStops-b.lateStops||a.lateMinutes-b.lateMinutes||a.km-b.km;
}
export function optimizeRoute(input) {
  const baseline=evaluateRoute(input);
  let remaining=[...input.stops],ordered=[],from=input.origin,time=Date.parse(input.departure);
  while(remaining.length) {
    const choices=remaining.map(stop=>({stop,row:schedule(from,stop,time,input.speedKmh)}));
    choices.sort((a,b)=>Number(a.row.lateMinutes>0)-Number(b.row.lateMinutes>0)||
      a.row.lateMinutes-b.row.lateMinutes||
      Date.parse(a.row.departure)-Date.parse(b.row.departure)||a.row.km-b.row.km||
      a.stop.id.localeCompare(b.stop.id));
    const chosen=choices[0];ordered.push(chosen.stop);
    remaining=remaining.filter(s=>s.id!==chosen.stop.id);
    time=Date.parse(chosen.row.departure);from=chosen.stop;
  }
  // Busca local limitada: troca pares apenas quando melhora os atrasos ou distância.
  let bestStops=compare(evaluateRoute({...input,stops:ordered}),baseline)<0?ordered:[...input.stops];
  let best=evaluateRoute({...input,stops:bestStops});
  for(let pass=0;pass<2;pass++) {
    for(let i=0;i<bestStops.length-1;i++)for(let j=i+1;j<bestStops.length;j++) {
      const trial=[...bestStops];[trial[i],trial[j]]=[trial[j],trial[i]];
      const candidate=evaluateRoute({...input,stops:trial});
      if(compare(candidate,best)<0){bestStops=trial;best=candidate;}
    }
  }
  return {stops:bestStops,baseline,optimized:best};
}
