import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { friendlyEntries, resultItems } from "../domain/resource-ui.mjs";
import { SacResourceValue } from "./SacDigitalResources";
import {
  listSacDigitalContactsPage,
  operateSacDigitalResource,
  type SacDigitalContactPageItem,
  type SacDigitalResourceResult,
} from "../infrastructure/sac-digital.repository";

type Props = {
  organizationId: string;
  canView: boolean;
  canSendMessages: boolean;
  hasPermission: (permission: string) => boolean;
  onStartConversation: (contact: { name: string; phone: string }) => void;
};
type ContactAction = "profile" | "protocols" | "medias" | "status";

const actions: Array<{ key: ContactAction; id: number; label: string }> = [
  { key: "profile", id: 4, label: "Perfil" },
  { key: "protocols", id: 5, label: "Protocolos" },
  { key: "medias", id: 6, label: "Mídias" },
  { key: "status", id: 7, label: "Status" },
];

function contactName(contact: SacDigitalContactPageItem) {
  return contact.customer_name || contact.name || formatPhone(contact.phone || "") || "Contato sem nome";
}

function contactPhoto(value: string | null) {
  const raw = String(value || "").trim();
  if (/^data:image\/jpg;base64,/i.test(raw)) return raw.replace(/^data:image\/jpg;/i, "data:image/jpeg;");
  if (/^data:image\/(?:jpeg|png|webp|gif);base64,/i.test(raw)) return raw;
  return /^https?:\/\//i.test(raw) ? raw : "";
}

function ContactAvatar({ contact }: { contact: SacDigitalContactPageItem }) {
  const photo = contactPhoto(contact.avatar_url);
  const name = contactName(contact).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (parts[0] || "?").slice(0, 2).toUpperCase();
  return <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-black text-muted-foreground">
    {initials}
    {photo && <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer"
      className="absolute inset-0 h-full w-full object-cover"
      onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}

function visibleDetails(row: any) {
  if (!row || typeof row !== "object") return [];
  return friendlyEntries(row)
    .filter(([key]) => !/(^id$|identificador|token|secret|password|senha|avatar|foto|photo|base64|^url$)/i.test(key))
    .slice(0, 16);
}

export function SacDigitalContactsPage({ organizationId, canView, canSendMessages, hasPermission, onStartConversation }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<SacDigitalContactPageItem | null>(null);
  const [operation, setOperation] = useState<ContactAction | null>(null);
  const [operationData, setOperationData] = useState<SacDigitalResourceResult | null>(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [advancedAction, setAdvancedAction] = useState<number | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: ["sac-digital", "contacts-page", organizationId, term, page, pageSize],
    queryFn: () => listSacDigitalContactsPage(organizationId, term, page, pageSize),
    enabled: Boolean(organizationId && canView),
    staleTime: 30_000,
  });
  const items = query.data?.items || [];
  const total = query.data?.total || 0;

  useEffect(() => {
    if (!query.data || page <= Math.max(1, Math.ceil(total / pageSize))) return;
    setPage(Math.max(1, Math.ceil(total / pageSize)));
  }, [page, pageSize, query.data, total]);

  const openDetails = (contact: SacDigitalContactPageItem) => {
    setSelected(contact);
    setNewName(contact.name || contact.customer_name || "");
    setEditingName(false);
    setAdvancedAction(null);
    setOperation(null);
    setOperationData(null);
    setOperationError("");
  };

  const loadAction = async (contact: SacDigitalContactPageItem, action: typeof actions[number]) => {
    if (operationBusy) return;
    setOperation(action.key);
    setAdvancedAction(null);
    setOperationData(null);
    setOperationError("");
    setEditingName(false);
    setOperationBusy(true);
    try {
      const response = await operateSacDigitalResource(organizationId, action.id, {
        id: contact.external_contact_id, p: 1,
      });
      setOperationData(response);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Não foi possível consultar este contato.");
    } finally {
      setOperationBusy(false);
    }
  };

  const saveName = async () => {
    if (!selected || !newName.trim() || operationBusy) return;
    setOperationBusy(true);
    setOperationError("");
    try {
      const response = await operateSacDigitalResource(organizationId, 8, {
        id: selected.external_contact_id, type: "name", name: newName.trim(),
      });
      if (response.outcome === "unknown") {
        setOperationError("A SAC ainda não confirmou o resultado. Não repita a operação automaticamente.");
        return;
      }
      setEditingName(false);
      setSelected({ ...selected, name: newName.trim() });
      await queryClient.invalidateQueries({ queryKey: ["sac-digital", "contacts-page", organizationId] });
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Não foi possível atualizar o nome do contato.");
    } finally {
      setOperationBusy(false);
    }
  };

  const records = (() => {
    if (!operationData) return [];
    const data: any = operationData.data;
    const items = resultItems(data);
    if (items.length) return items;
    const record = data?.info || data?.contact || data?.data || data;
    return record && typeof record === "object" ? [record] : [];
  })();

  if (!canView) return <p className="border border-border p-4 text-sm text-muted-foreground">Você não possui acesso aos contatos da SAC Digital.</p>;

  return <div className="min-w-0 space-y-4">
    <AdminSearchPanel title="Buscar contatos">
      <FInput label="Contato" value={search} onChange={(event: any) => { setSearch(event.target.value); setPage(1); }}
        placeholder="Pesquisar nome, telefone, CPF ou CNPJ" />
    </AdminSearchPanel>

    <AdminCard square>
      <AdminCardHeader>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-foreground">Clientes SAC Digital</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Busca e paginação realizadas no banco de dados da empresa.</p>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total de contatos</span>
          <p className="text-xl font-black tabular-nums text-foreground">{total.toLocaleString("pt-BR")}</p>
        </div>
      </AdminCardHeader>
      {query.isLoading ? <div className="p-8"><LoadingState text="Carregando contatos..." /></div>
        : query.isError ? <AdminCardContent><p role="alert" className="text-sm font-semibold text-red-600">Não foi possível carregar os contatos: {query.error instanceof Error ? query.error.message : "Erro na consulta."}</p></AdminCardContent>
        : items.length === 0 ? <AdminCardContent><p className="py-8 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</p></AdminCardContent>
        : <div className="overflow-x-auto"><table className="min-w-[720px] w-full">
          <thead><tr><th className="text-left">Contato</th><th className="text-left">Telefone</th><th className="text-left">CPF / CNPJ</th><th className="text-left">Cadastro</th><th className="text-right">Operações</th></tr></thead>
          <tbody>{items.map(contact => <tr key={contact.id}>
            <td><div className="flex min-w-0 items-center gap-3"><ContactAvatar contact={contact} /><span className="min-w-0 truncate font-bold">{contactName(contact)}</span></div></td>
            <td className="text-xs">{formatPhone(contact.phone || "") || "—"}</td>
            <td className="text-xs">{contact.cpf ? formatCpf(contact.cpf) : contact.cnpj ? formatCnpj(contact.cnpj) : "—"}</td>
            <td className="text-xs">{contact.customer_id ? <span className="rounded-full bg-emerald-500/10 px-2 py-1 font-bold text-emerald-700 dark:text-emerald-300">Vinculado ao CRM</span> : <span className="text-muted-foreground">SAC Digital</span>}</td>
            <td><div className="flex justify-end gap-2">
              <AdminButton variant="secondary" size="sm" onClick={() => openDetails(contact)}>Detalhes</AdminButton>
              {canSendMessages && contact.phone && <AdminButton size="sm" onClick={() => onStartConversation({ name: contactName(contact), phone: contact.phone || "" })}>Conversa</AdminButton>}
            </div></td>
          </tr>)}</tbody>
        </table></div>}
      <PaginationBar page={page} pageSize={pageSize} totalItems={total}
        onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      {query.isFetching && !query.isLoading && <p className="px-4 pb-2 text-[11px] text-muted-foreground">Atualizando contatos...</p>}
    </AdminCard>

    {selected && <AdminCard square>
      <AdminCardHeader>
        <div className="flex min-w-0 flex-1 items-center gap-3"><ContactAvatar contact={selected} />
          <div className="min-w-0"><h3 className="truncate text-sm font-black">{contactName(selected)}</h3>
            <p className="text-xs text-muted-foreground">{formatPhone(selected.phone || "") || "Sem telefone"}</p>
          </div>
        </div>
        <AdminButton variant="secondary" size="sm" onClick={() => setSelected(null)}>Fechar</AdminButton>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {actions.map(action => <AdminButton key={action.key} size="sm"
            variant={operation === action.key ? "primary" : "secondary"}
            disabled={operationBusy} onClick={() => void loadAction(selected, action)}>{action.label}</AdminButton>)}
          {hasPermission("sac_digital.protocols.manage") && <AdminButton variant="secondary" size="sm" disabled={operationBusy} onClick={() => {
            setOperation(null); setOperationData(null); setAdvancedAction(null); setEditingName(true); setOperationError("");
          }}>Editar nome</AdminButton>}
          {hasPermission("sac_digital.protocols.manage") && ([
            { id: 8, title: "Editar dados" },
            { id: 9, title: "Enriquecer" },
            { id: 10, title: "Importar contato" },
            { id: 11, title: "Encaminhar" },
          ] as const).map(action => <AdminButton key={action.id} size="sm"
            variant={advancedAction === action.id ? "primary" : "secondary"}
            disabled={operationBusy} onClick={() => {
              setAdvancedAction(action.id); setOperation(null); setOperationData(null); setEditingName(false); setOperationError("");
            }}>{action.title}</AdminButton>)}
          {canSendMessages && selected.phone && <AdminButton size="sm" onClick={() => onStartConversation({ name: contactName(selected), phone: selected.phone || "" })}>Iniciar conversa</AdminButton>}
        </div>
        {editingName && <div className="flex flex-col gap-2 border border-border bg-muted/30 p-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1"><FInput label="Nome do contato" value={newName} onChange={(event: any) => setNewName(event.target.value)} /></div>
          <AdminButton disabled={!newName.trim() || operationBusy} loading={operationBusy} onClick={() => void saveName()}>Salvar</AdminButton>
          <AdminButton variant="secondary" disabled={operationBusy} onClick={() => setEditingName(false)}>Cancelar</AdminButton>
        </div>}
        {advancedAction !== null && <SacDigitalResources key={selected.id + ":" + advancedAction}
          organizationId={organizationId} hasPermission={hasPermission} initialArea="Contatos"
          initialActionId={advancedAction} contextContactId={selected.external_contact_id} embedded />}
        {operationBusy && <LoadingState text="Consultando SAC Digital..." />}
        {operationError && <p role="alert" className="border border-red-500/30 bg-red-500/10 p-3 text-xs font-semibold text-red-700 dark:text-red-300">{operationError}</p>}
        {operation && !operationBusy && operationData && (records.length === 0
          ? <p className="py-4 text-sm text-muted-foreground">Nenhum registro encontrado nesta operação.</p>
          : <div className="grid gap-3 sm:grid-cols-2">{records.slice(0, 30).map((record: any, index: number) =>
              <div key={index} className="min-w-0 border border-border bg-muted/20 p-3">
                <p className="mb-2 text-xs font-black">{operation === "profile" ? "Dados do contato" : "Registro " + (index + 1)}</p>
                <div className="grid gap-2">{visibleDetails(record).map(([label, value]) =>
                  <div key={label} className="min-w-0"><p className="text-[10px] font-bold uppercase text-muted-foreground">{label}</p>
                    <div className="break-words text-xs text-foreground"><SacResourceValue value={value} /></div>
                  </div>)}</div>
              </div>)}</div>)}
      </AdminCardContent>
    </AdminCard>}
  </div>;
}
