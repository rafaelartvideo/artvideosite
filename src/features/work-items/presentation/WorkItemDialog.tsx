import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, CheckCircle2, Circle, ClipboardList, History, Plus, Search, Trash2, Users } from "lucide-react";
import { cn, formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { useAuth } from "@/lib/auth";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import { WorkItemDateTimeField } from "./WorkItemDateTimeField";
import { WorkItemReadonlyDetails } from "./WorkItemReadonlyDetails";
import { AdminButton, AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/ui/primitives/popover";
import { InlineLoading, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  addWorkChecklistItem, addWorkChecklistItems, findCustomerWorkOrders, findWorkCustomers, findWorkOrders, loadWorkDetails,
  removeWorkChecklistItem, saveWorkItem, updateWorkChecklistItem,
  type WorkEmployee, type WorkItem, type WorkItemDraft, type WorkOutcome, type WorkPriority,
  type WorkStatus,
} from "../infrastructure/work-items.repository";

const STATUS: { value: WorkStatus; label: string }[] = [
  { value: "pending", label: "Pendente" }, { value: "in_progress", label: "Em andamento" },
  { value: "waiting", label: "Aguardando" }, { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];
const PRIORITY: { value: WorkPriority; label: string }[] = [
  { value: "low", label: "Baixa" }, { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" }, { value: "urgent", label: "Urgente" },
];
const OUTCOME: { value: WorkOutcome; label: string }[] = [
  { value: "fulfilled", label: "Cumprido" }, { value: "not_fulfilled", label: "Não cumprido" },
  { value: "no_show", label: "Não compareceu" }, { value: "cancelled", label: "Cancelado" },
];
const REMINDERS = [
  { value: 0, label: "No vencimento" }, { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" }, { value: 1440, label: "1 dia antes" },
  { value: 10080, label: "7 dias antes" },
];
const emptyDraft = (): WorkItemDraft => ({
  kind: "task", title: "", description: "", status: "pending", outcome: null,
  priority: "normal", category: "", starts_at: null, due_at: null,
  reminder_minutes: [1440, 60], assigned_employee_ids: [], customer_id: null, service_order_id: null,
});
const toDraft = (item: WorkItem) => ({
  kind: item.kind, title: item.title, description: item.description || "", status: item.status,
  outcome: item.outcome, priority: item.priority, category: item.category || "",
  starts_at: item.starts_at, due_at: item.due_at,
  reminder_minutes: item.reminder_minutes || [],
  assigned_employee_ids: item.assigned_employee_ids || [], customer_id: item.customer_id,
  service_order_id: item.service_order_id,
});
const fieldLabel = "mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
const selectClass = cn(INPUT, "h-10 w-full text-sm");
type WorkCustomer = { id: string; full_name: string; trade_name: string | null; document: string | null; cnpj: string | null; phone: string | null; whatsapp: string | null };

function CustomerSummary({ customer }: { customer: WorkCustomer }) {
  const document = customer.cnpj ? `CNPJ ${formatCnpj(customer.cnpj)}` : customer.document ? `CPF ${formatCpf(customer.document)}` : "";
  const phone = customer.whatsapp || customer.phone;
  return <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
    <span className="min-w-0 font-semibold text-foreground">{customer.trade_name || customer.full_name}</span>
    {document && <span className="text-xs text-muted-foreground">{document}</span>}
    {phone && <span className="text-xs text-muted-foreground">{formatPhone(phone)}</span>}
  </span>;
}

export function WorkItemDialog({
  open, item, initialKind = "task", organizationId, employees, canEdit, onClose, onSaved,
}: {
  open: boolean; item: WorkItem | null; initialKind?: "task" | "commitment"; organizationId: string; employees: WorkEmployee[];
  canEdit: boolean; onClose: () => void; onSaved: (item: WorkItem) => void;
}) {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canCreateCustomer = hasPermission("customers.create");
  const isFinalized = item?.status === "completed" || item?.status === "cancelled";
  const [draft, setDraft] = useState<WorkItemDraft>(emptyDraft);
  const [section, setSection] = useState<"details" | "checklist" | "history">("details");
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<WorkCustomer[]>([]);
  const [customerInfo, setCustomerInfo] = useState<WorkCustomer | null>(null);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerSearchResolved, setCustomerSearchResolved] = useState("");
  const [orderOptions, setOrderOptions] = useState<{ id: string; os_number: number | string }[]>([]);
  const [linkMode, setLinkMode] = useState<"customer" | "order">("customer");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderResults, setOrderResults] = useState<Array<{ id: string; os_number: number | string; customer_id: string | null }>>([]);
  const [searchingOrders, setSearchingOrders] = useState(false);
  const [stagedChecklist, setStagedChecklist] = useState<string[]>([]);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(item ? toDraft(item) : { ...emptyDraft(), kind: initialKind });
    setSection("details");
    setCustomerSearch("");
    setCustomerResults([]);
    setCustomerInfo(item?.customer || null);
    setQuickCustomerOpen(false);
    setSearchingCustomer(false);
    setCustomerSearchResolved("");
    setOrderOptions([]);
    setLinkMode(item?.service_order_id ? "order" : "customer");
    setOrderSearch("");
    setOrderResults([]);
    setSearchingOrders(false);
    setStagedChecklist([]);
    setChecklistTitle("");
  }, [open, item?.id, initialKind]);

  useEffect(() => {
    if (!open || isFinalized || !organizationId || !customerSearch.trim() || customerSearch.trim().length < 2 || draft.customer_id) {
      setSearchingCustomer(false);
      return;
    }
    let alive = true;
    setSearchingCustomer(true);
    const timer = window.setTimeout(() => {
      void findWorkCustomers(organizationId, customerSearch)
        .then(results => { if (alive) { setCustomerResults(results as WorkCustomer[]); setCustomerSearchResolved(customerSearch); } })
        .catch(error => { if (alive) notifyAdmin(error.message || "Não foi possível buscar clientes.", "error"); })
        .finally(() => { if (alive) setSearchingCustomer(false); });
    }, 300);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [open, organizationId, customerSearch, draft.customer_id, isFinalized]);

  useEffect(() => {
    if (!open || !draft.customer_id) { setOrderOptions([]); return; }
    let alive = true;
    void findCustomerWorkOrders(organizationId, draft.customer_id)
      .then(results => { if (alive) setOrderOptions(results); })
      .catch(() => { if (alive) setOrderOptions([]); });
    return () => { alive = false; };
  }, [organizationId, draft.customer_id, open]);

  useEffect(() => {
    if (!open || isFinalized || linkMode !== "order" || draft.service_order_id || !orderSearch.replace(/\D/g, "")) {
      setSearchingOrders(false);
      return;
    }
    let active = true;
    setSearchingOrders(true);
    const timer = window.setTimeout(() => {
      void findWorkOrders(organizationId, orderSearch)
        .then(rows => { if (active) setOrderResults(rows); })
        .catch(error => { if (active) notifyAdmin(error.message || "Não foi possível buscar OS.", "error"); })
        .finally(() => { if (active) setSearchingOrders(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, organizationId, orderSearch, draft.service_order_id, isFinalized, linkMode]);

  const details = useQuery({
    queryKey: ["work-item-details", organizationId, item?.id],
    enabled: open && Boolean(item?.id),
    queryFn: () => loadWorkDetails(organizationId, item!.id),
  });

  const set = <K extends keyof WorkItemDraft>(key: K, value: WorkItemDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
  };
  const save = async () => {
    if (!canEdit || isFinalized || saving || !organizationId) return;
    if (draft.title.trim().length < 3) { notifyAdmin("Informe um título com pelo menos 3 caracteres.", "error"); return; }
    if (draft.starts_at && draft.due_at && draft.starts_at > draft.due_at) {
      notifyAdmin("O prazo não pode ser anterior ao início.", "error"); return;
    }
    if (draft.status === "completed" && draft.kind === "commitment" && !draft.outcome) {
      notifyAdmin("Informe o resultado antes de concluir o compromisso.", "error"); return;
    }
    setSaving(true);
    try {
      const saved = await saveWorkItem(organizationId, draft, item?.id);
      if (!item && stagedChecklist.length) {
        try {
          await addWorkChecklistItems(organizationId, saved.id, stagedChecklist);
        } catch (checklistError) {
          notifyAdmin("Atividade salva, mas não foi possível adicionar todas as etapas. Abra o checklist para tentar novamente.", "error");
          onSaved(saved);
          return;
        }
      }
      notifyAdmin(item ? "Atividade atualizada." : "Atividade registrada.", "success");
      onSaved(saved);
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Erro ao salvar atividade.", "error");
    } finally { setSaving(false); }
  };

  const mutateChecklist = async (action: () => Promise<void>) => {
    if (!item || !canEdit || isFinalized || detailBusy) return;
    setDetailBusy(true);
    try {
      await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-item-details", organizationId, item.id] }),
        queryClient.invalidateQueries({ queryKey: ["work-items", organizationId] }),
      ]);
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Falha ao atualizar checklist.", "error");
    } finally { setDetailBusy(false); }
  };
  const addChecklist = () => {
    if (!item || !checklistTitle.trim()) return;
    void mutateChecklist(async () => {
      await addWorkChecklistItem(organizationId, item.id, checklistTitle, (details.data?.checklist.length || 0) + 1);
      setChecklistTitle("");
    });
  };
  const counts = details.data?.checklist || [];
  const addStagedChecklist = () => {
    const label = checklistTitle.trim();
    if (!label || stagedChecklist.length >= 50) return;
    setStagedChecklist(current => [...current, label]);
    setChecklistTitle("");
  };
  const chooseLinkMode = (mode: "customer" | "order") => {
    if (mode === linkMode) return;
    setLinkMode(mode);
    setDraft(current => ({ ...current, customer_id: null, service_order_id: null }));
    setCustomerSearch(""); setCustomerInfo(null); setCustomerResults([]);
    setOrderSearch(""); setOrderResults([]); setOrderOptions([]);
  };
  const done = counts.filter(check => check.done).length;
  const isEditable = canEdit && !isFinalized;
  const customerDocumentDigits = customerSearch.replace(/\D/g, "");

  return <><AdminDialog
    open={open} onClose={() => { if (!saving) onClose(); }}
    title={item ? (isFinalized ? "Detalhes da atividade" : "Editar atividade") : "Nova atividade"}
    description={item ? (item.kind === "commitment" ? "Compromisso registrado" : "Tarefa da equipe") : "Registre tarefas e compromissos em um só lugar"}
    minimizedDescription={draft.title || "Compromissos e Tarefas"}
    className="max-w-3xl"
    footer={<div className="flex justify-end gap-2">
      <BtnSecondary disabled={saving} onClick={onClose}>Fechar</BtnSecondary>
      {isEditable && <BtnPrimary onClick={() => { void save(); }} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
    </div>}
  >
    <div className="space-y-4 text-foreground">
      {item && <div className="flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {([{ key: "details", label: "Detalhes", icon: ClipboardList },
           { key: "checklist", label: "Checklist", icon: CheckCircle2 },
           { key: "history", label: "Histórico", icon: History }] as const).map(tab => {
          const Icon = tab.icon;
          return <button key={tab.key} type="button" onClick={() => setSection(tab.key)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold transition-all",
              section === tab.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            <Icon size={15} /><span>{tab.label}</span>
          </button>;
        })}
      </div>}

      {section === "details" && (isFinalized ? <WorkItemReadonlyDetails item={item!} employees={employees} /> : <div className="space-y-4">
        {!item && <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Começar com um modelo</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Retorno do cliente", kind: "commitment" as const, title: "Cliente retornará à loja", category: "Atendimento" },
              { label: "Ligar para cliente", kind: "task" as const, title: "Entrar em contato com o cliente", category: "Atendimento" },
              { label: "Verificar peça", kind: "task" as const, title: "Verificar disponibilidade da peça", category: "Estoque" },
            ].map(template => <button key={template.label} type="button" onClick={() => setDraft(current => ({
              ...current, kind: template.kind, title: template.title, category: template.category,
            }))} className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/10 motion-reduce:transform-none">{template.label}</button>)}
          </div>
        </div>}
        <div className="flex gap-2 rounded-xl bg-muted/60 p-1">
          {([{ value: "task", label: "Tarefa" }, { value: "commitment", label: "Compromisso" }] as const).map(option =>
            <button key={option.value} type="button" disabled={!isEditable}
              onClick={() => set("kind", option.value)}
              className={cn("flex-1 rounded-lg px-3 py-2.5 text-sm font-bold transition-all",
                draft.kind === option.value ? "bg-card text-primary shadow-sm ring-1 ring-primary/15" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>,
          )}
        </div>
        <div className="space-y-2 rounded-xl border border-border bg-card p-3.5">
          <label className={fieldLabel}>Cliente vinculado (opcional)</label>
          {draft.customer_id ? <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-primary/5 px-3 py-3">
            <div className="min-w-0 text-sm"><CustomerSummary customer={customerInfo || item?.customer || { id: draft.customer_id, full_name: "Cliente selecionado", trade_name: null, document: null, cnpj: null, phone: null, whatsapp: null }} /></div>
            {isEditable && <BtnSecondary size="sm" onClick={() => {
              set("customer_id", null); set("service_order_id", null);
              setCustomerInfo(null); setCustomerSearch(""); setCustomerResults([]);
            }}>Trocar</BtnSecondary>}
          </div> : <div className="space-y-2">
            <Popover open={customerResults.length > 0 && !draft.customer_id} onOpenChange={value => { if (!value) setCustomerResults([]); }}>
              <PopoverAnchor asChild><div className="flex min-w-0 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input className={cn(INPUT, "w-full pl-9")} disabled={!isEditable} value={customerSearch}
                  onChange={event => { setCustomerSearch(event.target.value); setCustomerSearchResolved(""); setCustomerResults([]); }}
                  placeholder="Nome, CPF ou CNPJ" />
              </div>
              {canCreateCustomer && isEditable && <AdminButton variant="tertiary" size="sm" className="min-h-10 shrink-0" onClick={() => setQuickCustomerOpen(true)}>
                <Plus size={14} /> Cadastrar
              </AdminButton>}
              </div></PopoverAnchor>
              <PopoverContent align="start" side="bottom" sideOffset={4} collisionPadding={12}
                onOpenAutoFocus={event => event.preventDefault()}
                className="z-[220] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-32px)] border-border bg-popover p-1 text-popover-foreground shadow-xl">
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {customerResults.map(customer => <button key={customer.id} type="button"
                onClick={() => { set("customer_id", customer.id); setCustomerInfo(customer); setCustomerResults([]); setCustomerSearch(""); }}
                className="block w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted">
                <CustomerSummary customer={customer} />
              </button>)}
              </div>
              </PopoverContent>
            </Popover>
            {searchingCustomer && <InlineLoading text="Buscando clientes..." />}
            {customerSearch.trim().length >= 2 && customerSearchResolved === customerSearch && !searchingCustomer && !customerResults.length && <p className="text-[11px] text-muted-foreground">Nenhum cliente encontrado nesta busca.</p>}
          </div>}
          {draft.customer_id && <div className="pt-1">
            <label className={fieldLabel}>OS vinculada (opcional)</label>
            <select className={selectClass} disabled={!isEditable} value={draft.service_order_id || ""}
              onChange={event => set("service_order_id", event.target.value || null)}>
              <option value="">Nenhuma OS</option>
              {draft.service_order_id && !orderOptions.some(order => order.id === draft.service_order_id) &&
                <option value={draft.service_order_id}>OS vinculada</option>}
              {orderOptions.map(order => <option key={order.id} value={order.id}>OS {order.os_number}</option>)}
            </select>
          </div>}
        </div>
        <div>
          <label className={fieldLabel}>Título *</label>
          <input className={INPUT} maxLength={180} value={draft.title} disabled={!isEditable}
            placeholder={draft.kind === "commitment" ? "O que foi combinado com o cliente?" : "O que precisa ser feito?"}
            onChange={event => set("title", event.target.value)} />
        </div>
        <div>
          <label className={fieldLabel}>Descrição</label>
          <textarea className={cn(INPUT, "min-h-24 resize-y")} value={draft.description} disabled={!isEditable}
            placeholder="Contexto, orientações e informações importantes…" onChange={event => set("description", event.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={fieldLabel}>Andamento</label>
            <select className={selectClass} value={draft.status} disabled={!isEditable}
              onChange={event => set("status", event.target.value as WorkStatus)}>
              {STATUS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div><label className={fieldLabel}>Prioridade</label>
            <select className={selectClass} value={draft.priority} disabled={!isEditable}
              onChange={event => set("priority", event.target.value as WorkPriority)}>
              {PRIORITY.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {draft.kind === "commitment" && draft.status === "completed" && <div className="sm:col-span-2">
            <label className={fieldLabel}>Resultado do compromisso *</label>
            <select className={selectClass} value={draft.outcome || ""} disabled={!isEditable}
              onChange={event => set("outcome", (event.target.value || null) as WorkOutcome | null)}>
              <option value="">Selecione o resultado</option>
              {OUTCOME.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>}
          <div className="space-y-3 rounded-xl border border-primary/15 bg-primary/[.035] p-3.5 sm:col-span-2">
            <div className="flex items-center gap-2">
              <CalendarClock size={17} className="text-primary" />
              <span className="text-sm font-bold text-foreground">Datas e horários</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <WorkItemDateTimeField label="Início" value={draft.starts_at} disabled={!isEditable}
                onChange={value => set("starts_at", value)} hint="Quando a atividade começa" />
              <WorkItemDateTimeField label="Prazo / término" value={draft.due_at} disabled={!isEditable}
                onChange={value => set("due_at", value)} hint="Quando deve estar concluída" />
            </div>
            <p className="text-[11px] text-muted-foreground">Digite o horário (HH:mm) ou selecione pela seta. A lista mostra quatro horários por vez, em intervalos de 15 minutos.</p>
          </div>
          <div className="sm:col-span-2"><label className={fieldLabel}>Categoria (opcional)</label>
            <input className={INPUT} value={draft.category} maxLength={80} disabled={!isEditable}
              placeholder="Ex.: Retornos, Fornecedores, Atendimento" onChange={event => set("category", event.target.value)} />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex items-center gap-2"><Users size={16} className="text-primary" /><span className="text-sm font-bold">Responsáveis</span>
            <span className="ml-auto text-xs text-muted-foreground">{draft.assigned_employee_ids.length} selecionado(s)</span>
          </div>
          <div className="grid max-h-48 grid-cols-1 gap-1 overflow-y-auto overscroll-contain sm:grid-cols-2">
            {[...employees].sort((a, b) =>
              Number(draft.assigned_employee_ids.includes(b.id)) - Number(draft.assigned_employee_ids.includes(a.id))
              || a.full_name.localeCompare(b.full_name, "pt-BR", { sensitivity: "base" })
            ).map(employee => <label key={employee.id}
              className={cn("flex cursor-default items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors",
                draft.assigned_employee_ids.includes(employee.id) ? "bg-primary/10 text-primary" : "hover:bg-muted/50")}>
              <input type="checkbox" className="accent-primary" checked={draft.assigned_employee_ids.includes(employee.id)}
                disabled={!isEditable} onChange={event => set("assigned_employee_ids",
                  event.target.checked
                    ? [...draft.assigned_employee_ids, employee.id]
                    : draft.assigned_employee_ids.filter(id => id !== employee.id))} />
              <span className="truncate font-medium">{employee.full_name}</span>
            </label>)}
            {!employees.length && <p className="p-2 text-sm text-muted-foreground">Nenhum funcionário ativo.</p>}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-bold"><Bell size={16} className="text-primary" /> Lembretes</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {REMINDERS.map(reminder => <label key={reminder.value} className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" disabled={!isEditable} checked={draft.reminder_minutes.includes(reminder.value)}
                onChange={event => set("reminder_minutes", event.target.checked
                  ? [...draft.reminder_minutes, reminder.value]
                  : draft.reminder_minutes.filter(value => value !== reminder.value))} />
              {reminder.label}
            </label>)}
          </div>
          <p className="text-[11px] text-muted-foreground">Os alertas são enviados no CRM para os responsáveis e para quem criou a atividade.</p>
        </div>

      </div>)}

      {section === "checklist" && <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">Etapas da atividade</span>
          <span className="text-xs text-muted-foreground">{done} de {counts.length} concluídas</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-300"
            style={{ width: (counts.length ? (done / counts.length) * 100 : 0) + "%" }} />
        </div>
        {details.isPending && <InlineLoading text="Carregando etapas..." />}
        {counts.map(check => <div key={check.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
          <button type="button" disabled={!isEditable || detailBusy} aria-label={check.done ? "Reabrir etapa" : "Concluir etapa"}
            onClick={() => void mutateChecklist(() => updateWorkChecklistItem(organizationId, check.id, !check.done))}
            className="text-primary">{check.done ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} />}</button>
          <span className={cn("min-w-0 flex-1 text-sm", check.done && "text-muted-foreground line-through")}>{check.label}</span>
          {isEditable && <button type="button" disabled={detailBusy} aria-label="Excluir etapa" title="Excluir etapa"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => void mutateChecklist(() => removeWorkChecklistItem(organizationId, check.id))}><Trash2 size={15} /></button>}
        </div>)}
        {isEditable && <div className="flex gap-2">
          <input value={checklistTitle} className={INPUT} placeholder="Adicionar etapa ao checklist"
            onChange={event => setChecklistTitle(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addChecklist(); } }} />
          <BtnPrimary disabled={detailBusy || !checklistTitle.trim()} onClick={addChecklist} aria-label="Adicionar etapa"><Plus size={17} /></BtnPrimary>
        </div>}
        {!counts.length && !details.isPending && <p className="py-4 text-center text-sm text-muted-foreground">Divida o trabalho em pequenas etapas acompanháveis.</p>}
      </div>}

      {section === "history" && <div className="space-y-3">
        <p className="text-sm font-bold">Linha do tempo</p>
        {details.isPending && <InlineLoading text="Carregando histórico..." />}
        {details.data?.activity.map(activity => <div className="flex gap-3" key={activity.id}>
          <div className="flex flex-col items-center">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
            <span className="min-h-8 w-px flex-1 bg-border" />
          </div>
          <div className="min-w-0 flex-1 pb-4">
            <p className="text-sm font-medium">{activity.action === "created" ? "Atividade criada"
              : activity.action === "rescheduled" ? "Prazo alterado"
              : activity.action === "assigned" ? "Responsáveis alterados"
              : activity.action === "checklist_added" ? "Etapa adicionada"
              : activity.action === "checklist_removed" ? "Etapa removida"
              : activity.action === "checklist_done" ? "Etapa concluída"
              : activity.action === "checklist_reopened" ? "Etapa reaberta"
              : activity.action.startsWith("status:") ? "Andamento: " + (STATUS.find(s => s.value === activity.action.slice(7))?.label || activity.action.slice(7))
              : "Atividade atualizada"}</p>
            {activity.note && <p className="mt-0.5 text-xs text-muted-foreground">{OUTCOME.find(outcome => outcome.value === activity.note)?.label || activity.note}</p>}
            <p className="text-xs text-muted-foreground">{new Date(activity.created_at).toLocaleString("pt-BR")}</p>
          </div>
        </div>)}
        {!details.isPending && !details.data?.activity.length && <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>}
      </div>}
    </div>
  </AdminDialog>
    {quickCustomerOpen && canCreateCustomer && <QuickCustomerModal
      onClose={() => setQuickCustomerOpen(false)}
      description="Cadastre o cliente e vincule-o à atividade."
      initialValues={customerDocumentDigits.length === 11
        ? { customerType: "PF", document: customerDocumentDigits }
        : customerDocumentDigits.length === 14
          ? { customerType: "PJ", cnpj: customerDocumentDigits }
          : {}}
      onSaved={customer => {
        set("customer_id", customer.id);
        set("service_order_id", null);
        setCustomerInfo(customer as WorkCustomer);
        setCustomerResults([]);
        setCustomerSearch("");
        setQuickCustomerOpen(false);
      }}
    />}
  </>;
}