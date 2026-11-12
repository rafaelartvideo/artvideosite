import { Clock3, Headset, ListTree, Network, PhoneCall, UsersRound } from "lucide-react";
import { AdminSubsectionTabs } from "@/shared/ui/admin/AdminSubsectionTabs";

export type UnionPbxSection = "telefone" | "historico" | "ramais" | "filas" | "fluxos" | "entrada" | "troncos" | "gravacoes";

/** Navegação compartilhada com os demais módulos do CRM; a rota controla a seleção. */
export function UnionPbxSectionTabs({
  active, onSelect, canManage, canManageInbound, canAccessRecordings = false, canUsePhone = true,
}: {
  active: UnionPbxSection;
  onSelect: (section: UnionPbxSection) => void;
  canManage: boolean;
  canManageInbound: boolean;
  canAccessRecordings?: boolean;
  canUsePhone?: boolean;
}) {
  const items = [
    ...(canUsePhone ? [
      { id: "telefone" as const, label: "Telefone", Icon: Headset },
      { id: "historico" as const, label: "Histórico", Icon: Clock3 },
    ] : []),
    ...(canAccessRecordings ? [{ id: "gravacoes" as const, label: "Gravações", Icon: Clock3 }] : []),
    ...(canManage ? [
      { id: "ramais" as const, label: "Ramais", Icon: UsersRound },
      { id: "filas" as const, label: "Filas", Icon: ListTree },
      { id: "fluxos" as const, label: "URA e horários", Icon: Network },
      { id: "troncos" as const, label: "Troncos SIP", Icon: PhoneCall },
    ] : []),
    ...(canManageInbound ? [
      { id: "entrada" as const, label: "Entrada FVX", Icon: PhoneCall },
    ] : []),
  ];

  return <AdminSubsectionTabs<UnionPbxSection>
    ariaLabel="Subseções do PABX Union"
    value={active}
    items={items}
    onChange={onSelect}
  />;
}
