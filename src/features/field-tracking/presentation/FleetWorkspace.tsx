import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import type { FieldTrackingUnit } from "../domain/field-tracking";
import { addDriver, addVehicle, finishShift, listFleet, startShift, type Shift } from "../infrastructure/logistics.repository";

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const numberText = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dateText = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function FleetWorkspace({ organizationId, units }: {organizationId:string; units:FieldTrackingUnit[]}) {
  const query = useQuery({ queryKey:["logistics-fleet",organizationId], queryFn:()=>listFleet(organizationId), staleTime:60000, refetchOnWindowFocus:false, retry:false });
  const [section,setSection] = useState<"shifts"|"drivers"|"vehicles">("shifts");
  const [employee,setEmployee] = useState("");
  const [name,setName] = useState("");
  const [plate,setPlate] = useState("");
  const [kg,setKg] = useState("");
  const [m3,setM3] = useState("");
  const [driver,setDriver] = useState("");
  const [vehicle,setVehicle] = useState("");
  const [tracker,setTracker] = useState("");
  const [initial,setInitial] = useState("");
  const [departure,setDeparture] = useState({tires:false,lights:false,cargo:false});
  const [closing,setClosing] = useState<Shift|null>(null);
  const [final,setFinal] = useState("");
  const [cargo,setCargo] = useState(false);
  const [notes,setNotes] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const perform = async (action:()=>Promise<unknown>, reset:()=>void) => {
    if(busy) return;
    setBusy(true);setError("");setSuccess("");
    try { await action(); reset(); setSuccess("Registro salvo."); await query.refetch(); }
    catch(e) { setError(systemErrorMessage(e)); }
    finally { setBusy(false); }
  };
  if(query.isPending) return <AdminCard className="p-4">Carregando frota...</AdminCard>;
  if(query.isError || !query.data) return <AdminCard className="space-y-2 p-4">
    <p className="text-sm font-semibold" role="alert">Não foi possível carregar a frota. Confira a disponibilidade da estrutura logística e as permissões.</p>
    <AdminButton variant="secondary" onClick={()=>void query.refetch()}>Tentar novamente</AdminButton>
  </AdminCard>;
  const {drivers,vehicles,employees,activeShifts,recentShifts}=query.data;
  const orgUnits=units.filter(u=>u.organization_id===organizationId);
  const employeeName=(id:string)=>employees.find(e=>e.id===id)?.full_name??"Funcionário não disponível";
  const driverName=(id:string)=>employeeName(drivers.find(d=>d.id===id)?.employee_id??"");
  const vehicleName=(id:string)=>vehicles.find(v=>v.id===id)?.name??"Veículo não disponível";
  const trackerName=(id:string)=>orgUnits.find(u=>u.id===id)?.name??"Rastreador não disponível";
  const freeDrivers=drivers.filter(d=>d.is_active&&employees.some(e=>e.id===d.employee_id&&e.is_active)&&!activeShifts.some(s=>s.driver_id===d.id));
  const freeVehicles=vehicles.filter(v=>v.is_active&&!activeShifts.some(s=>s.vehicle_id===v.id));
  const freeTrackers=orgUnits.filter(u=>u.is_active&&!activeShifts.some(s=>s.tracker_id===u.id));
  const normalizedPlate=plate.toUpperCase().replace(/[^A-Z0-9]/g,"");
  const validOptional=(s:string)=>s===""||(Number.isFinite(Number(s))&&Number(s)>0);
  const validInitial=initial.trim()!==""&&Number.isFinite(Number(initial))&&Number(initial)>=0;
  const validFinal=closing&&final.trim()!==""&&Number.isFinite(Number(final))&&Number(final)>=Number(closing.initial_odometer_km);
  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[["Motoristas ativos",drivers.filter(d=>d.is_active).length],["Veículos ativos",vehicles.filter(v=>v.is_active).length],["Jornadas abertas",activeShifts.length]].map(([label,count])=><AdminCard key={label} className="p-3"><p className="text-xs text-muted-foreground">{label}</p><strong className="text-xl">{count}</strong></AdminCard>)}
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Seções da frota">
      {(["shifts","drivers","vehicles"] as const).map(s=><AdminButton key={s} variant={s===section?"primary":"secondary"} onClick={()=>{setSection(s);setError("");setSuccess("");}}>{s==="shifts"?"Jornadas":s==="drivers"?"Motoristas":"Veículos"}</AdminButton>)}
      <AdminButton variant="secondary" loading={query.isFetching} onClick={()=>void query.refetch()}>Atualizar</AdminButton>
    </div>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    {success&&<p role="status" className="text-sm text-emerald-600">{success}</p>}
    {section==="drivers"&&<AdminCard className="space-y-3 p-4">
      <h2 className="font-semibold">Motoristas</h2>
      <p className="text-xs text-muted-foreground">Vincule um funcionário ativo existente. A lista respeita as permissões de funcionários.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();if(employee)void perform(()=>addDriver(organizationId,employee),()=>setEmployee(""));}}>
        <label className="flex-1 min-w-[180px] text-xs">Funcionário<select className={inputClass} value={employee} onChange={e=>setEmployee(e.target.value)} required><option value="">Selecione</option>{employees.filter(e=>e.is_active&&!drivers.some(d=>d.employee_id===e.id)).map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={busy||!employee}>Cadastrar motorista</button>
      </form>
      {!drivers.length&&<p className="text-sm text-muted-foreground">Nenhum motorista cadastrado.</p>}
      {drivers.map(d=><div key={d.id} className="flex justify-between border-t border-border pt-2 text-sm"><span>{employeeName(d.employee_id)}</span><span className="text-muted-foreground">{d.is_active?"Ativo":"Inativo"}</span></div>)}
    </AdminCard>}
    {section==="vehicles"&&<AdminCard className="space-y-3 p-4">
      <h2 className="font-semibold">Veículos</h2>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(name.trim()&&/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizedPlate)&&validOptional(kg)&&validOptional(m3))void perform(()=>addVehicle(organizationId,{name:name.trim(),plate:normalizedPlate,capacity_kg:kg?Number(kg):null,capacity_m3:m3?Number(m3):null}),()=>{setName("");setPlate("");setKg("");setM3("");});}}>
        <label className="text-xs">Nome<input className={inputClass} value={name} onChange={e=>setName(e.target.value)} required maxLength={120}/></label>
        <label className="text-xs">Placa<input className={inputClass} value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())} required maxLength={8} placeholder="ABC1D23"/></label>
        <label className="text-xs">Capacidade (kg)<input className={inputClass} type="number" min="0.01" step="0.01" value={kg} onChange={e=>setKg(e.target.value)}/></label>
        <label className="text-xs">Capacidade (m³)<input className={inputClass} type="number" min="0.001" step="0.001" value={m3} onChange={e=>setM3(e.target.value)}/></label>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2" disabled={busy||!name.trim()||!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizedPlate)||!validOptional(kg)||!validOptional(m3)}>Cadastrar veículo</button>
      </form>
      {!vehicles.length&&<p className="text-sm text-muted-foreground">Nenhum veículo cadastrado.</p>}
      {vehicles.map(v=><div key={v.id} className="border-t border-border pt-2 text-sm"><strong>{v.name} · {v.plate}</strong><p className="text-xs text-muted-foreground">{v.capacity_kg??"—"} kg · {v.capacity_m3??"—"} m³ · {v.is_active?"Ativo":"Inativo"}</p></div>)}
    </AdminCard>}
    {section==="shifts"&&<>
      <AdminCard className="space-y-3 p-4">
        <h2 className="font-semibold">Iniciar jornada</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(validInitial&&freeDrivers.some(d=>d.id===driver)&&freeVehicles.some(v=>v.id===vehicle)&&freeTrackers.some(t=>t.id===tracker)&&Object.values(departure).every(Boolean))void perform(()=>startShift(organizationId,{driver_id:driver,vehicle_id:vehicle,tracker_id:tracker,initial_odometer_km:Number(initial),departure_checklist:departure}),()=>{setDriver("");setVehicle("");setTracker("");setInitial("");setDeparture({tires:false,lights:false,cargo:false});});}}>
          <label className="text-xs">Motorista<select className={inputClass} required value={driver} onChange={e=>setDriver(e.target.value)}><option value="">Selecione</option>{freeDrivers.map(d=><option key={d.id} value={d.id}>{employeeName(d.employee_id)}</option>)}</select></label>
          <label className="text-xs">Veículo<select className={inputClass} required value={vehicle} onChange={e=>setVehicle(e.target.value)}><option value="">Selecione</option>{freeVehicles.map(v=><option key={v.id} value={v.id}>{v.name} · {v.plate}</option>)}</select></label>
          <label className="text-xs">Rastreador<select className={inputClass} required value={tracker} onChange={e=>setTracker(e.target.value)}><option value="">Selecione</option>{freeTrackers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="text-xs">Hodômetro inicial (km)<input className={inputClass} type="number" min="0" step="0.1" value={initial} onChange={e=>setInitial(e.target.value)} required/></label>
          <fieldset className="space-y-2 sm:col-span-2"><legend className="text-xs font-semibold">Checklist de saída</legend>
            {(["tires","lights","cargo"] as const).map(k=><label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={departure[k]} onChange={e=>setDeparture(d=>({...d,[k]:e.target.checked}))}/>{k==="tires"?"Pneus conferidos":k==="lights"?"Luzes conferidas":"Carga conferida"}</label>)}
          </fieldset>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:col-span-2" disabled={busy||!driver||!vehicle||!tracker||!validInitial||!Object.values(departure).every(Boolean)}>Iniciar jornada</button>
        </form>
      </AdminCard>
      <AdminCard className="space-y-3 p-4">
        <h2 className="font-semibold">Jornadas em andamento</h2>
        {!activeShifts.length&&<p className="text-sm text-muted-foreground">Nenhuma jornada aberta.</p>}
        {activeShifts.map(s=><div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3" key={s.id}><div><strong className="text-sm">{driverName(s.driver_id)} · {vehicleName(s.vehicle_id)}</strong><p className="text-xs text-muted-foreground">{trackerName(s.tracker_id)} · {dateText(s.started_at)} · {numberText(s.initial_odometer_km)} km inicial</p></div><AdminButton variant="secondary" onClick={()=>{setClosing(s);setFinal("");setCargo(false);setNotes("");}}>Encerrar</AdminButton></div>)}
        {closing&&<form className="space-y-3 rounded-lg border border-border p-3" onSubmit={e=>{e.preventDefault();if(validFinal&&(cargo||notes.trim()))void perform(()=>finishShift(organizationId,closing.id,Number(final),{cargo,damage_notes:notes.trim()}),()=>setClosing(null));}}>
          <h3 className="text-sm font-semibold">Retorno: {vehicleName(closing.vehicle_id)}</h3>
          <label className="block text-xs">Hodômetro final (km)<input className={inputClass} type="number" min={closing.initial_odometer_km} step="0.1" value={final} onChange={e=>setFinal(e.target.value)} required/></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cargo} onChange={e=>setCargo(e.target.checked)}/>Carga conferida no retorno</label>
          <label className="block text-xs">Ocorrências ou avarias<textarea className={inputClass} value={notes} onChange={e=>setNotes(e.target.value)} required={!cargo} maxLength={1000}/></label>
          <div className="flex flex-wrap gap-2"><button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={busy||!validFinal||(!cargo&&!notes.trim())}>Confirmar encerramento</button><AdminButton variant="secondary" onClick={()=>setClosing(null)}>Cancelar</AdminButton></div>
        </form>}
      </AdminCard>
      <AdminCard className="space-y-3 p-4">
        <h2 className="font-semibold">Últimas 50 jornadas encerradas</h2>
        {!recentShifts.length&&<p className="text-sm text-muted-foreground">Nenhuma jornada encerrada.</p>}
        {recentShifts.map(s=><div key={s.id} className="flex justify-between gap-2 border-t border-border pt-2 text-sm"><div><strong>{driverName(s.driver_id)} · {vehicleName(s.vehicle_id)}</strong><p className="text-xs text-muted-foreground">{dateText(s.started_at)} – {s.ended_at?dateText(s.ended_at):"—"}</p></div><strong className="shrink-0">{s.final_odometer_km==null?"—":numberText(Number(s.final_odometer_km)-Number(s.initial_odometer_km))+" km"}</strong></div>)}
      </AdminCard>
    </>}
  </div>;
}
