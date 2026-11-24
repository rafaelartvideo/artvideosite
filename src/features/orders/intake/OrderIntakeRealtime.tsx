import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
export function OrderIntakeRealtime(){
  const {activeOrganizationId,user,hasPermission}=useAuth();
  const queryClient=useQueryClient();
  const enabled=Boolean(activeOrganizationId&&user?.id&&hasPermission("orders.create")&&hasPermission("orders.view"));
  useEffect(()=>{
    if(!enabled||!activeOrganizationId||!user?.id)return;
    const org=activeOrganizationId;
    const channel=supabase.channel("order-intake-events:"+org+":"+user.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"order_intake_events",filter:"organization_id=eq."+org},event=>{
        const row=event.new as {organization_id?:string;status?:string};
        if(row.organization_id!==org)return;
        void queryClient.invalidateQueries({queryKey:["order-intake",org]});
        if(row.status==="received")notifyAdmin("Nova Pré-OS recebida. Abra Pré-OS Digital para conferir.","success");
      }).subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[enabled,activeOrganizationId,user?.id,queryClient]);
  return null;
}
