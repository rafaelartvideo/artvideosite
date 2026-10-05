import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Megaphone, Pencil, Pin, Plus, Power, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminDialog,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  broadcastAdminHomeRefresh,
  loadPlatformAnnouncementsAdmin,
  savePlatformAnnouncement,
  setPlatformAnnouncementActive,
  type HomeAnnouncementPriority,
  type PlatformAnnouncementAdmin,
} from "@/features/home/infrastructure/home.repository";

const priorityOptions = [
  { value: "info", label: "Informativo" },
  { value: "attention", label: "Atenção" },
  { value: "important", label: "Importante" },
  { value: "critical", label: "Crítico" },
];

const priorityLabels: Record<HomeAnnouncementPriority, string> = {
  info: "Informativo",
  attention: "Atenção",
  important: "Importante",
  critical: "Crítico",
};

function toLocalInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localInputToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function currentLocalInput() {
  return toLocalInput(new Date().toISOString());
}

export function PlatformAnnouncementsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission("platform.announcements.manage");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformAnnouncementAdmin | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<HomeAnnouncementPriority>("info");
  const [startsAt, setStartsAt] = useState(currentLocalInput());
  const [endsAt, setEndsAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [requiresAcknowledgment, setRequiresAcknowledgment] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [targetMode, setTargetMode] = useState<"all" | "selected">("all");
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ["platform-announcements-admin"],
    queryFn: loadPlatformAnnouncementsAdmin,
  });

  const data = query.data;

  const resetForm = () => {
    setEditing(null);
    setTitle("");
    setMessage("");
    setPriority("info");
    setStartsAt(currentLocalInput());
    setEndsAt("");
    setIsPinned(false);
    setRequiresAcknowledgment(false);
    setLinkUrl("");
    setIsActive(true);
    setTargetMode("all");
    setSelectedCompanyIds([]);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (announcement: PlatformAnnouncementAdmin) => {
    setEditing(announcement);
    setTitle(announcement.title);
    setMessage(announcement.message);
    setPriority(announcement.priority);
    setStartsAt(toLocalInput(announcement.starts_at));
    setEndsAt(toLocalInput(announcement.ends_at));
    setIsPinned(announcement.is_pinned);
    setRequiresAcknowledgment(announcement.requires_acknowledgment);
    setLinkUrl(announcement.link_url || "");
    setIsActive(announcement.is_active);
    setSelectedCompanyIds(announcement.target_organization_ids || []);
    setTargetMode((announcement.target_organization_ids || []).length ? "selected" : "all");
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => savePlatformAnnouncement({
      id: editing?.id,
      title,
      message,
      priority,
      startsAt: localInputToIso(startsAt) || new Date().toISOString(),
      endsAt: localInputToIso(endsAt),
      isPinned,
      requiresAcknowledgment,
      linkUrl,
      isActive,
      targetOrganizationIds: targetMode === "all" ? [] : selectedCompanyIds,
    }),
    onSuccess: async () => {
      setDialogOpen(false);
      resetForm();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-announcements-admin"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-home", "announcements"] }),
      ]);
      broadcastAdminHomeRefresh("announcements");
      notifyAdmin(editing ? "Aviso atualizado." : "Aviso publicado.");
    },
    onError: error => notifyAdmin(systemErrorMessage(error, "Não foi possível salvar o aviso."), "error"),
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setPlatformAnnouncementActive(id, active),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["platform-announcements-admin"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-home", "announcements"] }),
      ]);
      broadcastAdminHomeRefresh("announcements");
      notifyAdmin(variables.active ? "Aviso ativado." : "Aviso encerrado.");
    },
    onError: error => notifyAdmin(systemErrorMessage(error, "Não foi possível alterar o aviso."), "error"),
  });

  const selectedNames = useMemo(() => {
    const names = new Map((data?.companies || []).map(company => [company.id, company.name]));
    return selectedCompanyIds.map(id => names.get(id)).filter(Boolean) as string[];
  }, [data?.companies, selectedCompanyIds]);

  const toggleCompany = (organizationId: string) => {
    setSelectedCompanyIds(current =>
      current.includes(organizationId)
        ? current.filter(id => id !== organizationId)
        : [...current, organizationId],
    );
  };

  const invalidSelectedAudience = targetMode === "selected" && selectedCompanyIds.length === 0;
  const saveDisabled = !title.trim() || !message.trim() || !startsAt || invalidSelectedAudience;

  return <div className="min-w-0 space-y-4">
    <PageHeader
      title="Avisos"
      subtitle="Publique comunicados, manutenções e informações para todas as empresas ou para empresas específicas."
      actions={canManage ? <AdminButton onClick={openNew}><Plus size={15} /> Novo aviso</AdminButton> : undefined}
    />

    {query.isPending ? <LoadingState text="Carregando avisos..." /> : query.isError || !data ? (
      <AdminCard><AdminCardContent><p className="text-sm text-red-600">{systemErrorMessage(query.error, "Não foi possível carregar os avisos.")}</p></AdminCardContent></AdminCard>
    ) : data.announcements.length === 0 ? (
      <AdminCard>
        <AdminCardContent className="flex min-h-[240px] flex-col items-center justify-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary"><Megaphone size={21} /></span>
          <h3 className="mt-4 text-sm font-black text-foreground">Nenhum aviso publicado</h3>
          <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">Crie o primeiro comunicado para informar manutenções, mudanças e orientações às empresas.</p>
          {canManage && <AdminButton size="sm" className="mt-4" onClick={openNew}>Novo aviso</AdminButton>}
        </AdminCardContent>
      </AdminCard>
    ) : <div className="space-y-3">
      {data.announcements.map(announcement => <AdminCard key={announcement.id}>
        <AdminCardHeader>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={priorityLabels[announcement.priority]} />
              <StatusBadge status={announcement.is_active ? "Ativo" : "Encerrado"} />
              {announcement.is_pinned && <span
                role="img"
                aria-label="Aviso fixado"
                title="Aviso fixado"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted text-foreground"
              ><Pin size={12} className="shrink-0" /></span>}
              {announcement.requires_acknowledgment && <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-1 text-[9px] font-black uppercase text-primary"><CheckCircle2 size={11} /> Confirmação</span>}
            </div>
            <h3 className="mt-2 text-sm font-black text-foreground">{announcement.title}</h3>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{announcement.message}</p>
          </div>
          {canManage && <div className="flex shrink-0 items-center gap-2">
            <AdminButton size="sm" variant="secondary" onClick={() => openEdit(announcement)}><Pencil size={13} /> Editar</AdminButton>
            <AdminButton
              size="sm"
              variant="secondary"
              disabled={activeMutation.isPending}
              onClick={() => activeMutation.mutate({ id: announcement.id, active: !announcement.is_active })}
            ><Power size={13} /> {announcement.is_active ? "Encerrar" : "Ativar"}</AdminButton>
          </div>}
        </AdminCardHeader>
        <AdminCardContent className="grid gap-3 border-t border-border sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Público</p>
            <p className="mt-1 text-xs font-bold text-foreground">{announcement.target_organization_names.length ? announcement.target_organization_names.join(", ") : "Todas as empresas"}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Início</p>
            <p className="mt-1 text-xs font-bold text-foreground">{formatDateTime(announcement.starts_at)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Término</p>
            <p className="mt-1 text-xs font-bold text-foreground">{announcement.ends_at ? formatDateTime(announcement.ends_at) : "Sem data final"}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.1em] text-muted-foreground">Confirmações</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-foreground"><Users size={13} /> {announcement.acknowledgment_count}</p>
          </div>
        </AdminCardContent>
      </AdminCard>)}
    </div>}

    <AdminDialog
      open={dialogOpen}
      onClose={() => !saveMutation.isPending && setDialogOpen(false)}
      title={editing ? "Editar aviso" : "Novo aviso"}
      description="Configure a mensagem, o período e quais empresas devem recebê-la."
      className="max-w-3xl"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={saveMutation.isPending} onClick={() => setDialogOpen(false)}>Cancelar</AdminButton>
        <AdminButton loading={saveMutation.isPending} disabled={saveDisabled} onClick={() => saveMutation.mutate()}>{editing ? "Salvar" : "Publicar"}</AdminButton>
      </div>}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><FInput label="Título" value={title} onChange={(event: any) => setTitle(event.target.value)} maxLength={160} required /></div>
          <div className="sm:col-span-2"><FTextarea label="Mensagem" value={message} onChange={(event: any) => setMessage(event.target.value)} rows={5} required /></div>
          <FSelect label="Prioridade" value={priority} onChange={(event: any) => setPriority(event.target.value)} options={priorityOptions} />
          <FInput label="Link opcional" value={linkUrl} onChange={(event: any) => setLinkUrl(event.target.value)} placeholder="https://..." />
          <FInput label="Exibir a partir de" type="datetime-local" value={startsAt} onChange={(event: any) => setStartsAt(event.target.value)} required />
          <FInput label="Encerrar em" type="datetime-local" value={endsAt} onChange={(event: any) => setEndsAt(event.target.value)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <FToggle label="Aviso ativo" description="Pode ser encerrado manualmente depois." checked={isActive} onChange={setIsActive} />
          <FToggle label="Fixar aviso" description="Mantém o aviso antes dos demais." checked={isPinned} onChange={setIsPinned} />
          <FToggle label="Exigir confirmação" description="Exibe Li e estou ciente para o usuário." checked={requiresAcknowledgment} onChange={setRequiresAcknowledgment} />
        </div>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.1em] text-foreground">Público do aviso</h3>
            <p className="mt-1 text-xs text-muted-foreground">Sem empresas selecionadas, o aviso é enviado a todas as empresas parceiras.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setTargetMode("all"); setSelectedCompanyIds([]); }}
              className={targetMode === "all" ? "rounded-lg border border-primary bg-primary-soft px-3 py-3 text-left" : "rounded-lg border border-border px-3 py-3 text-left"}
            >
              <strong className="block text-xs text-foreground">Todas as empresas</strong>
              <span className="mt-1 block text-[10px] text-muted-foreground">Entrega global para todas as empresas parceiras.</span>
            </button>
            <button
              type="button"
              onClick={() => setTargetMode("selected")}
              className={targetMode === "selected" ? "rounded-lg border border-primary bg-primary-soft px-3 py-3 text-left" : "rounded-lg border border-border px-3 py-3 text-left"}
            >
              <strong className="block text-xs text-foreground">Empresas específicas</strong>
              <span className="mt-1 block text-[10px] text-muted-foreground">Escolha uma ou mais empresas abaixo.</span>
            </button>
          </div>

          {targetMode === "selected" && <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {(data?.companies || []).map(company => <label key={company.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-xs">
              <input type="checkbox" checked={selectedCompanyIds.includes(company.id)} onChange={() => toggleCompany(company.id)} className="h-4 w-4 accent-primary" />
              <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{company.name}</span>
            </label>)}
          </div>}
          {targetMode === "selected" && <p className="text-[10px] font-semibold text-muted-foreground">{selectedNames.length ? selectedNames.length + " empresa(s) selecionada(s): " + selectedNames.join(", ") : "Selecione pelo menos uma empresa."}</p>}
        </div>
      </div>
    </AdminDialog>
  </div>;
}
