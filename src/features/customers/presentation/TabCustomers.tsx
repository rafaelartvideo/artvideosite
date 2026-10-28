import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { TabRegistrations } from "@/features/registrations/presentation/TabRegistrations";
import { LegacyTabCustomers } from "./LegacyTabCustomers";

type SharedAccessMode = "default" | "read";

type TabCustomersProps = {
  onOpenOrder?: (id: string, customerId?: string) => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId?: string | null, subpage?: string | null) => void;
  organizationIdOverride?: string | null;
  accessMode?: SharedAccessMode;
};

// Links antigos de "Ficha do Cliente" podem carregar ID de customers, não de entities.
// Resolver apenas dentro da empresa ativa, sem reabrir a tela legada.
function LegacyCustomerAlias({id,onRouteChange,onOpenOrder}:{
  id:string;onRouteChange?:TabCustomersProps["onRouteChange"];
  onOpenOrder?:TabCustomersProps["onOpenOrder"];
}) {
  const {activeOrganizationId}=useAuth();
  const [resolved,setResolved]=useState<string|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;setError("");setResolved(null);
    if(!activeOrganizationId || !/^[0-9a-f-]{36}$/i.test(id)){
      setError("Cadastro inválido.");return ()=>{active=false;};
    }
    void supabase.from("entities").select("id")
      .eq("organization_id",activeOrganizationId)
      .or(`id.eq.${id},legacy_customer_id.eq.${id}`).limit(1).maybeSingle()
      .then(({data,error:lookupError})=>{
        if(!active)return;
        if(lookupError||!data){setError("Cadastro de cliente não encontrado nesta empresa.");return;}
        if(onRouteChange)onRouteChange(data.id,null);
        else setResolved(data.id);
      });
    return ()=>{active=false;};
  },[activeOrganizationId,id,onRouteChange]);
  if(resolved)return <TabRegistrations routeResourceId={resolved} onOpenOrder={onOpenOrder}/>;
  return error ? <p className="py-10 text-center text-sm text-destructive" role="alert">{error}</p>
    : <LoadingState text="Abrindo cadastro do cliente..."/>;
}

export function TabCustomers({
  onOpenOrder,
  routeResourceId,
  routeSubpage,
  onRouteChange,
  organizationIdOverride,
  accessMode = "default",
}: TabCustomersProps) {
  if (accessMode === "read") {
    return <LegacyTabCustomers
      onOpenOrder={onOpenOrder}
      routeResourceId={routeResourceId}
      routeSubpage={routeSubpage}
      onRouteChange={onRouteChange}
      organizationIdOverride={organizationIdOverride}
      accessMode={accessMode}
    />;
  }
  if(routeSubpage==="customer"&&routeResourceId) {
    return <LegacyCustomerAlias id={routeResourceId} onRouteChange={onRouteChange} onOpenOrder={onOpenOrder}/>;
  }
  return <TabRegistrations
    routeResourceId={routeResourceId}
    routeSubpage={routeSubpage}
    onRouteChange={onRouteChange}
    onOpenOrder={onOpenOrder}
  />;
}
