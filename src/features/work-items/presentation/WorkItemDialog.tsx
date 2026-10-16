import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarClock, CheckCircle2, Circle, ClipboardList, History, Plus, Search, Trash2, Users } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminDialog, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { InlineLoading, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  addWorkChecklistItem, findCustomerWorkOrders, findWorkCustomers, loadWorkDetails,
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
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const toISO = (local: string) => local ? new Date(local).toISOString() : null;
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
type WorkCustomer = { id: string; full_name: string; trade_name: string | null; whatsapp: string | null };

export function WorkItemDialog({
  open, item, initialKind = "task", organizationId, employees, canEdit, onClose, onSaved,
}: {
  open: boolean; item: WorkItem | null; initialKind?: "task" | "commitment"; organizationId: string; employees: WorkEmployee[];
  canEdit: boolean; onClose: () => void; onSaved: (item: WorkItem) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WorkItemDraft>(emptyDraft);
  const [section, setSection] = useState<"details" | "checklist" | "history">("details");
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<WorkCustomer[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [orderOptions, setOrderOptions] = useState<{ id: string; os_number: number | string }[]>([]);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [detailBusy, setDetailBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(item ? toDraft(item) : { ...emptyDraft(), kind: initialKind });
    setSection("details");
    setCustomerSearch("");
    setCustomerResults([]);
    setCustomerName(item?.customer?.trade_name || item?.customer?.full_name || "");
    setOrderOptions([]);
    setChecklistTitle("");
  }, [open, item?.id, initialKind]);

  useEffect(() => {
    if (!open || !organizationId || !customerSearch.trim() || customerSearch.trim().length < 2 || draft.customer_id) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void findWorkCustomers(organizationId, customerSearch)
        .then(results => { if (alive) setCustomerResults(results as WorkCustomer[]); })
        .catch(error => { if (alive) notifyAdmin(error.message || "Não foi possível buscar clientes.", "error"); });
    }, 300);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [open, organizationId, customerSearch, draft.customer_id]);

  useEffect(() => {
    if (!open || !draft.customer_id) { setOrderOptions([]); return; }
    let alive = true;
    void findCustomerWorkOrders(organizationId, draft.customer_id)
      .then(results => { if (alive) setOrderOptions(results); })
      .catch(() => { if (alive) setOrderOptions([]); });
    return () => { alive = false; };
  }, [organizationId, draft.customer_id, open]);

  const details = useQuery({
    queryKey: ["work-item-details", organizationId, item?.id],
    enabled: open && Boolean(item?.id),
    queryFn: () => loadWorkDetails(organizationId, item!.id),
  });

  const set = <K extends keyof WorkItemDraft>(key: K, value: WorkItemDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
  };
  const save = async () => {
    if (!canEdit || saving || !organizationId) return;
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
      notifyAdmin(item ? "Atividade atualizada." : "Atividade registrada.", "success");
      onSaved(saved);
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Erro ao salvar atividade.", "error");
    } finally { setSaving(false); }
  };

  const mutateChecklist = async (action: () => Promise<void>) => {
    if (!item || !canEdit || detailBusy) return;
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
  const done = counts.filter(check => check.done).length;
  const isEditable = canEdit;

  return <AdminDialog
    open={open} onClose={() => { if (!saving) onClose(); }}
    title={item ? "Detalhes da atividade" : "Nova atividade"}
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

      {section === "details" && <div className="space-y-4">
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
          <div><label className={fieldLabel}>Data de início</label>
            <input type="datetime-local" className={selectClass} value={toLocal(draft.starts_at)} disabled={!isEditable}
              onChange={event => set("starts_at", toISO(event.target.value))} />
          </div>
          <div><label className={fieldLabel}>Prazo / término</label>
            <input type="datetime-local" className={selectClass} value={toLocal(draft.due_at)} disabled={!isEditable}
              onChange={event => set("due_at", toISO(event.target.value))} />
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
          <div className="grid max-h-40 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {employees.map(employee => <label key={employee.id}
              className={cn("flex cursor-default items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors",
                draft.assigned_employee_ids.includes(employee.id) ? "border-primary/35 bg-primary/5 text-primary" : "border-border hover:bg-muted/50")}>
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

        <div className="rounded-xl border border-border p-3">
          <label className={fieldLabel}>Cliente vinculado (opcional)</label>
          {draft.customer_id ? <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <span className="truncate font-medium">{customerName || item?.customer?.full_name || "Cliente selecionado"}</span>
            {isEditable && <BtnSecondary size="sm" onClick={() => { set("customer_id", null); set("service_order_id", null); setCustomerName(""); setCustomerResults([]); }}>Trocar</BtnSecondary>}
          </div> : <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
            <input className={cn(INPUT, "pl-9")} disabled={!isEditable} value={customerSearch}
              onChange={event => { setCustomerSearch(event.target.value); setCustomerResults([]); }}
              placeholder="Buscar por nome, CPF ou CNPJ" />
            {customerResults.length > 0 && <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-border bg-card">
              {customerResults.map(customer => <button key={customer.id} type="button"
                onClick={() => { set("customer_id", customer.id); setCustomerName(customer.trade_name || customer.full_name); setCustomerResults([]); setCustomerSearch(""); }}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">{customer.trade_name || customer.full_name}</button>)}
            </div>}
          </div>}
          {draft.customer_id && <div className="mt-3">
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
      </div>}

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
          <button type="button" disabled={!canEdit || detailBusy} aria-label={check.done ? "Reabrir etapa" : "Concluir etapa"}
            onClick={() => void mutateChecklist(() => updateWorkChecklistItem(organizationId, check.id, !check.done))}
            className="text-primary">{check.done ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Circle size={20} />}</button>
          <span className={cn("min-w-0 flex-1 text-sm", check.done && "text-muted-foreground line-through")}>{check.label}</span>
          {canEdit && <button type="button" disabled={detailBusy} aria-label="Excluir etapa" title="Excluir etapa"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => void mutateChecklist(() => removeWorkChecklistItem(organizationId, check.id))}><Trash2 size={15} /></button>}
        </div>)}
        {canEdit && <div className="flex gap-2">
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
  </AdminDialog>;
}