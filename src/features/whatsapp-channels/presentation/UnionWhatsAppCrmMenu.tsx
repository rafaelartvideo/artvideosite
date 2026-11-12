import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, ContactRound, Cpu, UserRound } from "lucide-react";

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

function LineField({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return <div className="min-w-0 break-words text-xs leading-5 text-foreground">
    <span className="font-semibold text-foreground">{label}:</span>{" "}
    <span>{value}</span>
  </div>;
}

function ColumnField({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  return <div className="min-w-0">
    <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground">{label}</div>
    <div className="break-words text-xs leading-5 text-foreground">{value}</div>
  </div>;
}

function addressText(address: CrmAddress) {
  const street = [address.street, address.number].filter(Boolean).join(", ");
  return [
    street,
    address.complement,
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join(" - "),
    address.zip_code ? "CEP " + address.zip_code : "",
    address.reference ? "Referência: " + address.reference : "",
  ].filter(Boolean).join(" · ") || "Endereço não informado";
}

function technicalValue(value: NonNullable<CrmEquipment["technical_values"]>[number]) {
  if (value.value_text !== null && value.value_text !== undefined && value.value_text !== "") return value.value_text;
  return value.value_number === null || value.value_number === undefined ? "—" : String(value.value_number);
}

const panelLabels: Record<Panel, string> = {
  registration: "Dados de cadastro",
  equipments: "Equipamentos",
  orders: "OS recentes",
};

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
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const selectedEquipment = activePanel === "equipments" && selectedEquipmentId
    ? context?.equipments.find(equipment => equipment.id === selectedEquipmentId)
    : null;
  const openPanel = (panel: Panel) => {
    setSelectedEquipmentId(null);
    setActivePanel(panel);
  };
  const back = () => {
    if (selectedEquipmentId) setSelectedEquipmentId(null);
    else setActivePanel(null);
  };
  const menuRef = useRef<HTMLDivElement>(null);
  const regionId = useId();
  const customer = context?.customer;

  useEffect(() => {
    if (!open) {
      setActivePanel(null);
      setSelectedEquipmentId(null);
      return;
    }
    const handlePointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onToggle();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onToggle();
      }
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onToggle]);

  const mainRow = "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return <section aria-label="Dados do cliente no CRM" className="relative z-20 shrink-0 border-b border-border bg-muted/20 px-3 py-2">
    <div ref={menuRef} className="relative">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={regionId}
        aria-haspopup="dialog"
        className="inline-flex max-w-full items-center gap-2 text-left text-xs font-semibold text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <ContactRound size={15} className="shrink-0 text-foreground"/>
        <span className="shrink-0">Dados do CRM</span>
        <span className="min-w-0 truncate font-normal text-muted-foreground">
          {customer?.name || (context ? "Sem vínculo confirmado" : "Clique para consultar")}
        </span>
        {open ? <ChevronUp size={15} className="shrink-0 text-foreground"/> : <ChevronDown size={15} className="shrink-0 text-foreground"/>}
      </button>

      {open && <div id={regionId} role="dialog" aria-label="Consultar dados do CRM"
        className="absolute left-0 top-[calc(100%+9px)] z-50 flex max-h-[min(62vh,470px)] w-[min(90vw,860px)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border bg-card p-3 text-foreground shadow-xl">
        <div className="mb-2 flex shrink-0 items-center gap-2 border-b border-border pb-2">
          {activePanel ? <button type="button" onClick={back}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted"
            aria-label={selectedEquipmentId ? "Voltar aos equipamentos" : "Voltar às opções do CRM"}
            title={selectedEquipmentId ? "Voltar aos equipamentos" : "Voltar às opções do CRM"}>
            <ChevronLeft size={18}/>
          </button> : null}
          <p className="min-w-0 flex-1 truncate text-sm font-bold">
            {selectedEquipment ? [selectedEquipment.equipment_brand_name, selectedEquipment.equipment_model_name].filter(Boolean).join(" · ") || "Detalhes do equipamento"
              : activePanel ? panelLabels[activePanel] : "Dados do CRM"}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!context ? <div role="status" className="px-3 py-5 text-center text-xs text-muted-foreground">
            Consultando dados do CRM...
          </div>
          : context.error ? <div role="status" className="px-3 py-4 text-xs text-muted-foreground">
              Não foi possível consultar os dados do CRM.
              <button type="button" onClick={onRetry} className="ml-2 font-semibold text-primary underline underline-offset-2">Tentar novamente</button>
            </div>
          : !customer ? <div className="px-3 py-4 text-xs text-muted-foreground">
              {context.ambiguous ? "Mais de um cadastro possui este número. Verifique antes de vincular." : "Nenhum cliente do CRM encontrado para este número."}
            </div>
          : activePanel === null ? <div className="space-y-0.5">
              <button type="button" className={mainRow} onClick={() => openPanel("registration")}>
                <UserRound size={17} className="shrink-0 text-foreground"/>
                <span className="min-w-0 flex-1">Dados de cadastro</span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground"/>
              </button>
              <button type="button" className={mainRow} onClick={() => openPanel("equipments")}>
                <Cpu size={17} className="shrink-0 text-foreground"/>
                <span className="min-w-0 flex-1">Equipamentos</span>
                <span className="text-[11px] font-normal text-muted-foreground">{context.equipments.length}</span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground"/>
              </button>
              {canViewOrders && <button type="button" className={mainRow} onClick={() => openPanel("orders")}>
                <ClipboardList size={17} className="shrink-0 text-foreground"/>
                <span className="min-w-0 flex-1">OS recentes</span>
                <span className="text-[11px] font-normal text-muted-foreground">{context.orders.length}</span>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground"/>
              </button>}
            </div>
          : activePanel === "registration" ? <div className="space-y-3 px-1 py-1">
              <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 md:grid-cols-4">
                <ColumnField label="Cliente" value={customer.name}/>
                <ColumnField label={customer.customer_type === "PJ" || customer.cnpj ? "CNPJ" : "CPF"}
                  value={formatDocument(customer.cnpj || customer.document || "Não informado")}/>
                <ColumnField label="E-mail" value={customer.email || "Não informado"}/>
                <ColumnField label="Telefone" value={customer.phone || customer.whatsapp || "Não informado"}/>
                {customer.whatsapp && customer.whatsapp !== customer.phone && <ColumnField label="WhatsApp" value={customer.whatsapp}/>}
                <ColumnField label="Nome fantasia" value={customer.trade_name}/>
                <ColumnField label="Razão social" value={customer.legal_name}/>
                <ColumnField label="Inscrição estadual" value={customer.state_registration}/>
                <ColumnField label="Inscrição municipal" value={customer.municipal_registration}/>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-2 border-t border-border pt-2 sm:grid-cols-2">
                {customer.addresses?.length ? customer.addresses.map((address, index) =>
                  <ColumnField key={address.id} label={address.is_default ? "Endereço principal" : "Endereço " + (index + 1)} value={addressText(address)}/>
                ) : <ColumnField label="Endereço" value="Nenhum endereço cadastrado."/>}
              </div>
              {onOpenCustomer && <button type="button" onClick={() => onOpenCustomer(customer.id)}
                className="text-xs font-normal text-primary underline underline-offset-2 hover:text-primary/80">
                Abrir cadastro completo
              </button>}
            </div>
          : activePanel === "equipments" ? <div className="px-1 py-1">
              {selectedEquipment ? <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 md:grid-cols-4">
                    <ColumnField label="Tipo" value={selectedEquipment.equipment_type_name || "Não informado"}/>
                    <ColumnField label="Marca" value={selectedEquipment.equipment_brand_name || "Não informada"}/>
                    <ColumnField label="Modelo" value={selectedEquipment.equipment_model_name || "Não informado"}/>
                    <ColumnField label="Número de série" value={selectedEquipment.serial_number || "Não informado"}/>
                    {Array.isArray(selectedEquipment.technical_values) && selectedEquipment.technical_values.map((value, index) =>
                      <ColumnField key={value.technical_field_id || index}
                        label={value.label_snapshot || value.field_key_snapshot || "Campo técnico"}
                        value={technicalValue(value)}/>)}
                    <ColumnField label="Cadastrado em" value={dateLabel(selectedEquipment.created_at)}/>
                    <ColumnField label="Atualizado em" value={dateLabel(selectedEquipment.updated_at)}/>
                  </div>
                </div>
              : !context.equipments.length ? <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum equipamento cadastrado.</p>
              : <div className="space-y-0.5">
                  {context.equipments.map(equipment => <button type="button" key={equipment.id}
                    onClick={() => setSelectedEquipmentId(equipment.id)}
                    className={mainRow} aria-label={"Ver detalhes do equipamento " + [equipment.equipment_brand_name, equipment.equipment_model_name].filter(Boolean).join(" ")}>
                    <Cpu size={16} className="shrink-0 text-foreground"/>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {[equipment.equipment_brand_name, equipment.equipment_model_name].filter(Boolean).join(" · ") ||
                        equipment.equipment_type_name || "Equipamento sem modelo"}
                    </span>
                    {equipment.equipment_type_name && <span className="hidden max-w-44 shrink-0 truncate text-[11px] font-normal text-muted-foreground sm:inline">
                      {equipment.equipment_type_name}
                    </span>}
                    <ChevronRight size={16} className="shrink-0 text-muted-foreground"/>
                  </button>)}
                </div>}
              {context.equipments.length === 50 && !selectedEquipment && <p className="mt-2 px-3 text-[11px] text-muted-foreground">
                Exibindo até 50 equipamentos. Consulte o cadastro completo para visualizar os demais.
              </p>}
            </div>
          : <div className="divide-y divide-border px-1">
              {!context.orders.length ? <p className="px-2 py-3 text-xs text-muted-foreground">Nenhuma OS encontrada.</p>
              : context.orders.map(order => <div key={order.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 text-xs first:pt-1">
                  <a target="_blank" rel="noopener noreferrer"
                    href={"/admin/orders/" + encodeURIComponent(order.id) + "?org=" + encodeURIComponent(organizationId)}
                    className="shrink-0 font-semibold text-primary underline-offset-2 hover:underline">OS {order.os_number}</a>
                  <LineField label="Status" value={order.order_status?.name || "Não informado"}/>
                  <LineField label="Situação" value={order.situation?.name || "Não definida"}/>
                  <LineField label="Abertura" value={dateLabel(order.created_at) || "Não informada"}/>
                </div>)}
            </div>}
        </div>
      </div>}
    </div>
  </section>;
}
