import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Check, CircleAlert, Pencil, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";

type Department = { id: string; name: string; is_active: boolean; is_default?: boolean };
type StaffRole = "manager" | "operator" | "both";
type Operator = { id: string; name: string; eligible: boolean; can_attend: boolean; is_active: boolean; staff_role: StaffRole; is_manager?: boolean };
const staffRoleLabels: Record<StaffRole,string> = {
  manager: "Gestor", operator: "Operador", both: "Gestor + Operador",
};
export type WhatsAppOperationsSection = "departments" | "queues" | "operators";

const channelRequest = (organizationId: string, action: Parameters<typeof operateUnionWhatsAppInbox>[2],
  extra?: Parameters<typeof operateUnionWhatsAppInbox>[3]) =>
  operateUnionWhatsAppInbox(organizationId, crypto.randomUUID(), action, extra);

export function WhatsAppOperationsSettings({ section, createRequest = 0 }: {
  section: WhatsAppOperationsSection; createRequest?: number;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const [capabilities, setCapabilities] = useState<Record<string,boolean>>({});
  const canView = hasPermission("whatsapp.inbox.view");
  const canManage = canView && Boolean(section === "operators"
    ? capabilities.manage_operators : capabilities.manage_queues);
  const [selectedRoles, setSelectedRoles] = useState<Record<string,StaffRole>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [teamDepartment, setTeamDepartment] = useState<Department | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const previousCreateRequest = useRef(createRequest);

  const reload = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    setError("");
    try {
      const [dept, status] = await Promise.all([
        channelRequest(activeOrganizationId, "departments_list"),
        channelRequest(activeOrganizationId, "channel_status"),
      ]);
      const grants = status.capabilities || {};
      setCapabilities(grants);
      const permitted = canView && (grants.manage_operators || grants.manage_queues);
      const staff = permitted ? await channelRequest(activeOrganizationId, "operator_list") : null;
      setDepartments(dept.departments || []);
      setOperators(staff?.operators || []);
      setSelectedRoles(Object.fromEntries((staff?.operators || []).map(person => [person.id,person.staff_role])));
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível carregar as configurações de atendimento."));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, canView]);
  useEffect(() => { void reload(); }, [reload]);

  const startEdit = (department: Department | "new") => {
    setEditing(department);
    setName(department === "new" ? "" : department.name);
    setActive(department === "new" ? true : department.is_active);
    setError("");
  };
  // The "Novo" action belongs to the parent modal/page toolbar, not the table.
  useEffect(() => {
    if (previousCreateRequest.current === createRequest) return;
    previousCreateRequest.current = createRequest;
    if (section === "operators") return;
    setEditing("new");
    setName("");
    setActive(true);
    setError("");
  }, [createRequest, section]);

  const saveDepartment = async () => {
    if (!activeOrganizationId || busy || name.trim().length < 2) return;
    setBusy("department");
    setError("");
    try {
      await channelRequest(activeOrganizationId, "department_save", {
        department_id: editing && editing !== "new" ? editing.id : undefined,
        name: name.trim(), is_active: active,
      });
      setEditing(null);
      setNotice("Departamento salvo. As filas e equipes foram atualizadas.");
      await reload();
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível salvar o departamento."));
    } finally { setBusy(""); }
  };
  const chooseDefault = async (id: string) => {
    if (!activeOrganizationId || busy) return;
    setBusy(id); setError("");
    try {
      await channelRequest(activeOrganizationId, "queue_default", { department_id: id });
      setNotice(id ? "Fila principal configurada para novas conversas." : "Novas conversas serão encaminhadas para a fila geral.");
      await reload();
    } catch (reason) { setError(systemErrorMessage(reason, "Não foi possível configurar a fila.")); }
    finally { setBusy(""); }
  };
  const toggleOperator = async (person: Operator, enabled: boolean) => {
    if (!activeOrganizationId || busy || !person.eligible) return;
    const chosenRole=selectedRoles[person.id] || person.staff_role;
    setBusy(person.id); setError("");
    try {
      const result = await channelRequest(activeOrganizationId, "operator_set", {
        target_user_id: person.id, enabled, staff_role: chosenRole,
      });
      setOperators(result.operators || []);
      setSelectedRoles(Object.fromEntries((result.operators || []).map(item => [item.id,item.staff_role])));
      setNotice(enabled
        ? `Perfil ${staffRoleLabels[chosenRole]} salvo para este funcionário.`
        : "Vínculo de atendimento desativado.");
    } catch (reason) { setError(systemErrorMessage(reason, "Não foi possível atualizar o perfil do atendimento.")); }
    finally { setBusy(""); }
  };
  const openTeam = async (department: Department) => {
    if (!activeOrganizationId || busy) return;
    setBusy("team"); setError("");
    try {
      const result = await channelRequest(activeOrganizationId, "department_members", { department_id: department.id });
      setMemberIds(result.member_ids || []);
      setTeamDepartment(department);
    } catch (reason) { setError(systemErrorMessage(reason, "Não foi possível carregar a equipe.")); }
    finally { setBusy(""); }
  };
  const toggleMembership = async (person: Operator, enabled: boolean) => {
    if (!activeOrganizationId || !teamDepartment || busy) return;
    setBusy(person.id); setError("");
    try {
      const result = await channelRequest(activeOrganizationId, "department_set_member", {
        department_id: teamDepartment.id, target_user_id: person.id, enabled,
      });
      setMemberIds(result.member_ids || []);
    } catch (reason) { setError(systemErrorMessage(reason, "Não foi possível alterar o acesso à fila.")); }
    finally { setBusy(""); }
  };

  if (!loading && !canManage) return <p className="text-sm text-muted-foreground">Seu perfil não possui a permissão necessária para gerenciar esta seção dos atendimentos.</p>;

  return <div className="space-y-4">
    {error && <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-600"><CircleAlert size={16} className="mr-2 inline"/>{error}</div>}
    {notice && <p role="status" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{notice}</p>}
    {loading ? <LoadingState text="Carregando configuração..." /> :
      <AdminCard square>
        {section === "operators" ? <div className="overflow-x-auto">
          <table className="min-w-[750px] w-full">
            <thead><tr><th className="text-left">Funcionário</th><th className="text-left">Perfil no atendimento</th>
              <th className="text-left">Situação</th><th className="text-right">Ações</th></tr></thead>
            <tbody>
              {operators.length ? operators.map(person => {
                const chosenRole=selectedRoles[person.id] || person.staff_role;
                const changedRole=chosenRole !== person.staff_role;
                const allowed=person.eligible && (chosenRole==="manager" || person.can_attend);
                return <tr key={person.id}>
                  <td>
                    <p className="font-semibold">{person.name}</p>
                    {!person.eligible && <p className="text-xs text-muted-foreground">Sem acesso ao módulo de atendimentos</p>}
                  </td>
                  <td>
                    <select aria-label={`Perfil de atendimento de ${person.name}`}
                      value={chosenRole} disabled={!person.eligible || Boolean(busy)}
                      onChange={event=>setSelectedRoles(old=>({...old,[person.id]:event.target.value as StaffRole}))}
                      className="min-h-9 w-full max-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary">
                      <option value="manager">Gestor</option>
                      <option value="operator" disabled={!person.can_attend}>Operador</option>
                      <option value="both" disabled={!person.can_attend}>Gestor + Operador</option>
                    </select>
                  </td>
                  <td><StatusBadge status={person.is_active ? "Ativo" : "Inativo"}/></td>
                  <td><div className="flex justify-end gap-2">
                    {person.is_active && changedRole && <AdminButton size="sm" disabled={!allowed || Boolean(busy)}
                      loading={busy===person.id} onClick={()=>void toggleOperator(person,true)}>Salvar perfil</AdminButton>}
                    <AdminButton size="sm" variant="secondary" disabled={!allowed || Boolean(busy)}
                      loading={busy===person.id} onClick={()=>void toggleOperator(person,!person.is_active)}>
                      {person.is_active ? "Desvincular" : "Vincular"}
                    </AdminButton>
                  </div></td>
                </tr>;
              }) : <tr><td colSpan={4} className="py-9 text-center text-sm text-muted-foreground">Nenhum funcionário ativo encontrado.</td></tr>}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            Gestor supervisiona e configura sem responder mensagens. Operador atende somente as filas autorizadas e suas conversas. Gestor + Operador acumula as duas funções. O cargo do CRM não é alterado.
          </p>
        </div> : <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full">
            <thead><tr><th className="text-left">{section === "queues" ? "Fila" : "Departamento"}</th>
              <th className="text-left">Situação</th><th className="text-left">Entrada de conversas</th>
              <th className="text-right">Ações</th></tr></thead>
            <tbody>
              {departments.length ? departments.map(dept => <tr key={dept.id}>
                <td><div className="flex items-center gap-2 font-semibold"><Building2 size={16} className="text-primary"/>{dept.name}</div></td>
                <td className="text-xs font-semibold">{dept.is_active ? "Ativo" : "Inativo"}</td>
                <td className="text-xs text-muted-foreground">{dept.is_default ? "Fila principal" : "Por encaminhamento"}</td>
                <td><div className="flex justify-end gap-2">
                  {section === "queues" && <AdminButton size="sm" variant="secondary"
                    disabled={!dept.is_active || Boolean(busy) || Boolean(dept.is_default)}
                    loading={busy === dept.id} onClick={() => void chooseDefault(dept.id)}>
                    {dept.is_default ? <><Check size={15}/> Padrão</> : "Definir padrão"}
                  </AdminButton>}
                  <AdminButton size="sm" variant="secondary" onClick={() => void openTeam(dept)}
                    disabled={Boolean(busy)}><UsersRound size={15}/> Equipe</AdminButton>
                  <AdminButton size="sm" variant="secondary" onClick={() => startEdit(dept)}
                    disabled={Boolean(busy)}><Pencil size={15}/> Editar</AdminButton>
                </div></td>
              </tr>) : <tr><td colSpan={4} className="py-9 text-center text-sm text-muted-foreground">
                Nenhum departamento cadastrado. Crie o primeiro para organizar as filas.</td></tr>}
            </tbody>
          </table>
          {section === "queues" && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">Sem fila principal, novas conversas entram na fila geral, disponível aos operadores ativos.</p>
            {departments.some(dept => dept.is_default) && <AdminButton variant="secondary" size="sm"
              disabled={Boolean(busy)} onClick={() => void chooseDefault("")}>Usar fila geral</AdminButton>}
          </div>}
        </div>}
      </AdminCard>}
    <AdminDialog open={Boolean(editing)} onClose={() => { if(!busy)setEditing(null); }}
      title={editing === "new" ? "Novo departamento" : "Editar departamento"}
      className="max-w-xl"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={Boolean(busy)} onClick={() => setEditing(null)}>Cancelar</AdminButton>
        <AdminButton disabled={name.trim().length < 2 || Boolean(busy)} loading={busy === "department"} onClick={() => void saveDepartment()}>Salvar</AdminButton>
      </div>}>
      <div className="space-y-4">
        <label className="block text-sm font-semibold">Nome <span className="text-red-600">*</span>
          <input value={name} onChange={event => setName(event.target.value)} maxLength={80}
            autoFocus placeholder="Ex.: Suporte técnico, Vendas, Financeiro"
            className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"/>
        </label>
        {editing !== "new" && <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)}/>
          Departamento ativo</label>}
        <p className="text-xs leading-relaxed text-muted-foreground">Este departamento também pode receber atendimentos encaminhados e funcionar como uma fila. Defina sua equipe no botão Equipe.</p>
      </div>
    </AdminDialog>
    <AdminDialog open={Boolean(teamDepartment)} onClose={() => { if(!busy)setTeamDepartment(null); }}
      title={`Equipe · ${teamDepartment?.name || ""}`} className="max-w-xl"
      footer={<AdminButton variant="secondary" disabled={Boolean(busy)} onClick={() => setTeamDepartment(null)}>Fechar</AdminButton>}>
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-muted-foreground">Os operadores vinculados a esta fila podem ver e assumir conversas aguardando nela. Conversas em atendimento continuam visíveis somente ao responsável e aos gestores.</p>
        {operators.filter(person => person.eligible && person.can_attend && person.is_active && person.staff_role !== "manager").length ? operators.filter(person => person.eligible && person.can_attend && person.is_active && person.staff_role !== "manager").map(person =>
          <label key={person.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
            <div className="flex min-w-0 items-center gap-3">
              <input type="checkbox" checked={memberIds.includes(person.id)}
                disabled={!person.is_active || Boolean(busy)}
                onChange={event => void toggleMembership(person,event.target.checked)}/>
              <span className="min-w-0 truncate font-semibold">{person.name}</span>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">{person.is_active ? "Operador ativo" : "Desvinculado"}</span>
          </label>) : <p className="py-5 text-center text-sm text-muted-foreground">
            Vincule funcionários na subseção Operadores antes de montar a equipe.</p>}
      </div>
    </AdminDialog>
  </div>;
}
