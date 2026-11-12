import { useId, useState } from "react";
import { ChevronDown, ChevronUp, ClipboardList, ContactRound, Cpu, UserRound } from "lucide-react";

type CrmAddress = {
  id: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  reference: string | null;
  is_default: boolean | null;
};
type CrmCustomer = {
  id: string;
  name: string;
  customer_type?: string | null;
  document?: string | null;
  cnpj?: string | null;
  legal_name?: string | null;
  trade_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  state_registration?: string | null;
  municipal_registration?: string | null;
  addresses?: CrmAddress[];
};
type CrmEquipment = {
  id: string;
  equipment_type_name: string | null;
  equipment_brand_name: string | null;
  equipment_model_name: string | null;
  serial_number: string | null;
  technical_values?: Array<{
    technical_field_id?: string;
    label_snapshot?: string | null;
    field_key_snapshot?: string | null;
    value_text?: string | null;
    value_number?: number | null;
  }> | null;
  created_at?: string | null;
  updated_at?: string | null;
};
type CrmOrder = {
  id: string;
  os_number: string;
  created_at: string;
  completed_at: string | null;
  model: string | null;
  order_status?: { name: string; color?: string | null } | null;
  situation?: { name: string; color?: string | null } | null;
};
export type CrmConversationContext = {
  customer: CrmCustomer | null;
  equipments: CrmEquipment[];
  orders: CrmOrder[];
  ambiguous?: boolean;
  error?: boolean;
};
type Panel = "registration" | "equipments" | "orders";

function formatDocument(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
  if (digits.length === 14) return digits.slice(0, 2) + "." + digits.slice(2, 5) + "." + digits.slice(5, 8) + "/" + digits.slice(8, 12) + "-" + digits.slice(12);
  return value || "—";
}
function dateLabel(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR");
}
function Info({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return <div className="min-w-0">
    <dt className="text-[10px] font-semibold text-muted-foreground">{label}</dt>
    <dd className="break-words text-xs text-foreground">{value}</dd>
  </div>;
}
function Address({ address, index }: { address: CrmAddress; index: number }) {
  const firstLine = [address.street, address.number && "nº " + address.number, address.complement].filter(Boolean).join(", ");
  const secondLine = [address.neighborhood, [address.city, address.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ");
  return <div className="rounded-md border border-border bg-muted/20 p-2.5">
    <p className="mb-1 text-[11px] font-bold text-foreground">{address.is_default ? "Endereço principal" : "Endereço " + (index + 1)}</p>
    <p className="break-words text-xs">{firstLine || "Logradouro não informado"}</p>
    {secondLine && <p className="mt-0.5 break-words text-xs">{secondLine}</p>}
    {address.zip_code && <Info label="CEP" value={address.zip_code}/>}
    {address.reference && <Info label="Referência" value={address.reference}/>}
  </div>;
}
function technicalValue(value: NonNullable<CrmEquipment["technical_values"]>[number]) {
  if (value.value_text !== null && value.value_text !== undefined && value.value_text !== "") return value.value_text;
  return value.value_number === null || value.value_number === undefined ? "—" : String(value.value_number);
}

export function UnionWhatsAppCrmMenu({
  context, open, onToggle, onRetry, organizationId, canViewOrders, onOpenCustomer,
}: {
  context?: CrmConversationContext;
  open: boolean;
  onToggle: () => void;
  onRetry: () => void;
  organizationId: string;
  canViewOrders: boolean;
  onOpenCustomer?: (id: string) => void;
}) {
  const [activePanel, setActivePanel] = useState<Panel | null>(null);
  const regionId = useId();
  const customer = context?.customer;
  const togglePanel = (panel: Panel) => setActivePanel(current => current === panel ? null : panel);
  const menuClass = "flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";
  const detailClass = "space-y-2 border-t border-border bg-card px-3 py-3";
  return <section aria-label="Dados do cliente no CRM" className="shrink-0 border-b border-border bg-muted/20 px-3 py-2">
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={regionId}
      className="flex w-full items-center gap-2 text-left text-xs font-semibold text-foreground">
      <ContactRound size={15} className="shrink-0 text-primary"/>
      <span className="shrink-0">Dados do CRM</span>
      <span className="min-w-0 flex-1 truncate font-normal text-muted-foreground">
        {customer?.name || (context ? "Sem vínculo confirmado" : "Clique para consultar")}
      </span>
      {open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
    </button>
    {open && <div id={regionId} className="mt-2 max-h-[min(40vh,360px)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-card">
      {!context ? <div role="status" className="p-3 text-xs text-muted-foreground">Consultando cadastro, equipamentos e OS...</div>
      : context.error ? <div role="status" className="p-3 text-xs text-muted-foreground">
          Não foi possível consultar os dados do CRM.
          <button type="button" onClick={onRetry} className="ml-2 font-semibold text-primary hover:underline">Tentar novamente</button>
        </div>
      : !customer ? <div className="p-3 text-xs text-muted-foreground">
          {context.ambiguous ? "Mais de um cadastro possui este número. Verifique antes de vincular." : "Nenhum cliente do CRM encontrado para este número."}
        </div>
      : <div className="divide-y divide-border">
          <div>
            <button type="button" className={menuClass} onClick={() => togglePanel("registration")} aria-expanded={activePanel === "registration"}>
              <UserRound size={15} className="shrink-0 text-primary"/>
              <span className="flex-1">Dados de cadastro</span>
              {activePanel === "registration" ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
            </button>
            {activePanel === "registration" && <dl className={detailClass}>
              <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                <Info label="Cliente" value={customer.name}/>
                <Info label={customer.customer_type === "PJ" || customer.cnpj ? "CNPJ" : "CPF"}
                  value={customer.cnpj || customer.document ? formatDocument(customer.cnpj || customer.document) : "Não informado"}/>
                <Info label="Nome fantasia" value={customer.trade_name}/>
                <Info label="Razão social" value={customer.legal_name}/>
                <Info label="E-mail" value={customer.email}/>
                <Info label="Telefone" value={customer.phone}/>
                <Info label="WhatsApp" value={customer.whatsapp}/>
                <Info label="Inscrição estadual" value={customer.state_registration}/>
                <Info label="Inscrição municipal" value={customer.municipal_registration}/>
              </div>
              <p className="border-t border-border pt-2 text-[11px] font-bold">Endereço completo</p>
              {customer.addresses?.length ? <div className="space-y-2">
                {customer.addresses.map((address, index) => <Address key={address.id} address={address} index={index}/>)}
              </div> : <p className="text-xs text-muted-foreground">Nenhum endereço cadastrado.</p>}
              {onOpenCustomer && <button type="button" onClick={() => onOpenCustomer(customer.id)}
                className="font-semibold text-primary hover:underline">Abrir cadastro completo</button>}
            </dl>}
          </div>
          <div>
            <button type="button" className={menuClass} onClick={() => togglePanel("equipments")} aria-expanded={activePanel === "equipments"}>
              <Cpu size={15} className="shrink-0 text-primary"/>
              <span className="flex-1">Equipamentos</span>
              <span className="text-[10px] font-normal text-muted-foreground">{context.equipments.length}</span>
              {activePanel === "equipments" ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
            </button>
            {activePanel === "equipments" && <div className={detailClass}>
              {!context.equipments.length ? <p className="text-xs text-muted-foreground">Nenhum equipamento cadastrado.</p>
                : context.equipments.map(equipment => <div key={equipment.id} className="space-y-2 rounded-md border border-border bg-muted/15 p-3">
                    <p className="break-words text-xs font-bold">{[equipment.equipment_type_name, equipment.equipment_brand_name, equipment.equipment_model_name].filter(Boolean).join(" · ") || "Equipamento"}</p>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                      <Info label="Tipo" value={equipment.equipment_type_name}/>
                      <Info label="Marca" value={equipment.equipment_brand_name}/>
                      <Info label="Modelo" value={equipment.equipment_model_name}/>
                      <Info label="Número de série" value={equipment.serial_number || "Não informado"}/>
                      <Info label="Cadastrado em" value={dateLabel(equipment.created_at)}/>
                      <Info label="Atualizado em" value={dateLabel(equipment.updated_at)}/>
                      {Array.isArray(equipment.technical_values) && equipment.technical_values.map((value, index) =>
                        <Info key={value.technical_field_id || index} label={value.label_snapshot || value.field_key_snapshot || "Campo técnico"}
                          value={technicalValue(value)}/>)}
                    </dl>
                  </div>)}
              {context.equipments.length === 50 && <p className="text-[11px] text-muted-foreground">Exibindo até 50 equipamentos. Acesse o cadastro para consultar os demais.</p>}
            </div>}
          </div>
          {canViewOrders && <div>
            <button type="button" className={menuClass} onClick={() => togglePanel("orders")} aria-expanded={activePanel === "orders"}>
              <ClipboardList size={15} className="shrink-0 text-primary"/>
              <span className="flex-1">OS recentes</span>
              <span className="text-[10px] font-normal text-muted-foreground">{context.orders.length}</span>
              {activePanel === "orders" ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
            </button>
            {activePanel === "orders" && <div className={detailClass}>
              {!context.orders.length ? <p className="text-xs text-muted-foreground">Nenhuma OS encontrada.</p>
                : context.orders.map(order => <div key={order.id} className="rounded-md border border-border bg-muted/15 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <a target="_blank" rel="noopener noreferrer" className="font-semibold text-primary hover:underline"
                        href={"/admin/orders/" + encodeURIComponent(order.id) + "?org=" + encodeURIComponent(organizationId)}>
                        OS {order.os_number}
                      </a>
                      <span className="text-[10px] text-muted-foreground">{dateLabel(order.created_at)}</span>
                    </div>
                    {order.model && <p className="mt-1 break-words text-xs text-muted-foreground">{order.model}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Status:</span>
                      <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold">{order.order_status?.name || "Não informado"}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground">Situação:</span>
                      <span className="rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">{order.situation?.name || "Não definida"}</span>
                    </div>
                  </div>)}
            </div>}
          </div>}
        </div>}
    </div>}
  </section>;
}
