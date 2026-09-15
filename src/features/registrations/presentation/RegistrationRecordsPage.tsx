import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { cn } from "@/shared/domain/formatters";
import { AdminCard, AdminDialog, AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import type { Registration } from "../infrastructure/registrations.repository";
import {
  createRegistrationRecord,
  listRegistrationRecords,
  type RegistrationRecord,
} from "../infrastructure/registration-records.repository";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function RegistrationRecordsPage({
  registration,
  organizationId,
  canCreate,
  onClose,
}: {
  registration: Registration;
  organizationId: string;
  canCreate: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.registrations.records(organizationId, registration.id);
  const recordsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await listRegistrationRecords(organizationId, registration.id);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const records = recordsQuery.data ?? [];
  const loading = recordsQuery.isPending && !recordsQuery.data;
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    if (!recordsQuery.error) return;
    notifyAdmin(`Erro ao carregar registros: ${recordsQuery.error instanceof Error ? recordsQuery.error.message : String(recordsQuery.error)}`, "error");
  }, [recordsQuery.error]);

  const authorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    records.forEach(record => {
      const key = record.created_by || "system";
      if (!byId.has(key)) byId.set(key, record.author_name || (key === "system" ? "Sistema" : "Usuário"));
    });
    return Array.from(byId.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [records]);

  const filtered = useMemo(() => {
    const result = records.filter(record => {
      const authorKey = record.created_by || "system";
      if (authorFilter && authorKey !== authorFilter) return false;
      if (dateFilter && record.created_at.slice(0, 10) !== dateFilter) return false;
      return true;
    });
    return [...result].sort((a, b) => {
      const difference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === "asc" ? difference : -difference;
    });
  }, [records, authorFilter, dateFilter, sort]);

  const submit = async () => {
    const content = text.trim();
    if (!content) return;
    if (content.length > 2000) {
      notifyAdmin("O registro deve ter no máximo 2000 caracteres.", "error");
      return;
    }
    setSaving(true);
    const result = await createRegistrationRecord(organizationId, registration.id, content);
    setSaving(false);
    if (result.error || !result.data) {
      notifyAdmin(`Erro ao adicionar registro: ${result.error?.message || "Registro não retornado após salvar."}`, "error");
      return;
    }
    queryClient.setQueryData<RegistrationRecord[]>(queryKey, current => [
      result.data!,
      ...(current || []).filter(record => record.id !== result.data!.id),
    ]);
    setText("");
    setModalOpen(false);
    notifyAdmin("Registro adicionado.");
  };

  return <>
    <AdminPage open onClose={onClose} breadcrumb={`Cadastros > ${registration.name} > Registros`} title="Registros" subtitle="Linha do tempo de observações permanentes deste cadastro" maxW="max-w-4xl">
      <div className="space-y-4 p-4 sm:p-5">
        <AdminCard className="bg-[#f8fafc] p-3 shadow-none">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-bold uppercase text-[#5a6a82]">Usuário</label>
              <AdminSelect
                value={authorFilter}
                onValueChange={setAuthorFilter}
                ariaLabel="Usuário"
                className="min-w-0 text-xs font-medium normal-case"
                options={[{ value: "", label: "Todos os usuários" }, ...authorOptions]}
              />
            </div>
            <label className="min-w-0 text-[10px] font-bold uppercase text-[#5a6a82]">Data
              <input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} className={cn(INPUT, "mt-1 min-w-0 text-xs font-medium normal-case")} />
            </label>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-bold uppercase text-[#5a6a82]">Ordenação</label>
              <AdminSelect
                value={sort}
                onValueChange={value => setSort(value as "desc" | "asc")}
                ariaLabel="Ordenação"
                className="min-w-0 text-xs font-medium normal-case"
                options={[
                  { value: "desc", label: "Mais recentes primeiro" },
                  { value: "asc", label: "Mais antigos primeiro" },
                ]}
              />
            </div>
            {(authorFilter || dateFilter) && <button type="button" onClick={() => { setAuthorFilter(""); setDateFilter(""); }} className="h-10 self-end rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50">Limpar</button>}
          </div>
        </AdminCard>

        {loading ? <LoadingState text="Carregando registros..." /> : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-[#0d1b2e]/15 bg-white p-8 text-center text-sm text-[#5a6a82]">Nenhum registro encontrado.</div> : <div className="space-y-3">{filtered.map(record => <AdminCard key={record.id} className="min-w-0 border-[#0057e7]/15 p-4 shadow-none">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-[#0d1b2e]">{record.author_name}</p>
              <p className="mt-0.5 break-words text-[10px] font-bold uppercase text-[#5a6a82]">{record.title || "Registro"}</p>
            </div>
            <span className="shrink-0 text-[10px] text-[#5a6a82]">{formatDateTime(record.created_at)}</span>
          </div>
          <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-[#0d1b2e]">{record.content}</p>
        </AdminCard>)}</div>}
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:justify-between sm:px-5">
        <BtnSecondary onClick={onClose} className="min-w-0 flex-1 sm:flex-none">Voltar</BtnSecondary>
        {canCreate && <BtnPrimary onClick={() => { setText(""); setModalOpen(true); }} className="min-w-0 flex-1 sm:flex-none"><Plus size={14} /> Novo registro</BtnPrimary>}
      </div>
    </AdminPage>

    <AdminDialog
      open={modalOpen}
      onClose={() => { if (!saving) setModalOpen(false); }}
      title="Novo registro"
      description="Adicione uma observação permanente ao histórico deste cadastro."
      className="max-w-lg"
      footer={<div className="flex w-full gap-2 sm:justify-end sm:gap-3"><BtnSecondary onClick={() => setModalOpen(false)} disabled={saving} className="min-w-0 flex-1 sm:flex-none">Cancelar</BtnSecondary><BtnPrimary onClick={() => void submit()} disabled={!text.trim() || saving} loading={saving} loadingText="Registrando..." className="min-w-0 flex-1 sm:flex-none">Registrar</BtnPrimary></div>}
    >
      <textarea autoFocus value={text} onChange={event => setText(event.target.value)} maxLength={2000} rows={6} placeholder="Escreva o que precisa ficar registrado neste cadastro..." className={cn(INPUT, "h-auto min-w-0 resize-y text-sm")} />
      <div className="mt-2 flex justify-between gap-3 text-[10px] text-[#5a6a82]"><span>O registro não poderá ser editado ou excluído.</span><span className="shrink-0">{text.length}/2000</span></div>
    </AdminDialog>
  </>;
}
