import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Clock3, Folder, Trash2 } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  listManagementFolders, listManagementRecords, purgeManagementTrash, restoreManagementFolder, restoreManagementRecord,
  type ManagementFolder, type ManagementRecord, type ManagementSpace,
} from "../infrastructure/management.repository";

type TrashItem = {
  id: string; space: ManagementSpace; kind: "folder" | "record"; name: string;
  deletedAt: string;
};
const expiration = (date: string) => new Date(new Date(date).getTime() + 7 * 86400000);
const remainingText = (date: string) => {
  const remaining = expiration(date).getTime() - Date.now();
  if (remaining <= 0) return "Prazo encerrado · aguardando expurgo";
  const days = Math.ceil(remaining / 86400000);
  return days === 1 ? "Menos de 1 dia restante" : `${days} dias restantes`;
};

export function ManagementTrashDialog({
  open, spaces, canManage, onClose, onChanged,
}: {
  open: boolean; spaces: ManagementSpace[]; canManage: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const [entries, setEntries] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    Promise.all(spaces.map(async space => {
      const [folders, records] = await Promise.all([
        listManagementFolders(space.id), listManagementRecords(space.id),
      ]);
      const deletedFolders = folders.filter(folder => Boolean(folder.deleted_at) &&
        (!folder.parent_id || !folders.find(parent => parent.id === folder.parent_id)?.deleted_at));
      const deletedRecords = records.filter(record => Boolean(record.deleted_at) &&
        !folders.find(folder => folder.id === record.folder_id)?.deleted_at);
      return [
        ...deletedFolders.map((folder: ManagementFolder) => ({
          id: folder.id, space, kind: "folder" as const, name: folder.name, deletedAt: folder.deleted_at!,
        })),
        ...deletedRecords.map((record: ManagementRecord) => ({
          id: record.id, space, kind: "record" as const, name: record.title, deletedAt: record.deleted_at!,
        })),
      ];
    })).then(parts => {
      if (alive) setEntries(parts.flat().sort((a,b) => b.deletedAt.localeCompare(a.deletedAt)));
    }).catch(error => {
      if (alive) notifyAdmin(systemErrorMessage(error, "Não foi possível carregar a lixeira."), "error");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, spaces, revision]);
  const count = useMemo(() => entries.length, [entries]);

  const restore = async (item: TrashItem) => {
    if (!canManage || busy) return;
    setBusy(true);
    try {
      if (item.kind === "folder") await restoreManagementFolder(item.id);
      else await restoreManagementRecord(item.id);
      notifyAdmin("Item restaurado.");
      setRevision(value => value + 1);
      onChanged();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível restaurar."), "error");
    } finally { setBusy(false); }
  };
  const permanentlyRemove = async (item?: TrashItem) => {
    if (!canManage || busy) return;
    const message = item
      ? `Excluir definitivamente "${item.name}"? Arquivos, versões e credenciais associadas também serão excluídos. Esta ação não pode ser desfeita.`
      : `Esvaziar toda a lixeira (${count} itens)? Tudo será excluído definitivamente, incluindo arquivos e credenciais. Esta ação não pode ser desfeita.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const result = await purgeManagementTrash(item
        ? { kind: item.kind, id: item.id, spaceId: item.space.id }
        : { kind: "all" });
      notifyAdmin(result.failed
        ? "Exclusão encaminhada, mas alguns itens serão reprocessados automaticamente."
        : "Exclusão definitiva processada.", result.failed ? "error" : "success");
      setRevision(value => value + 1);
      onChanged();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível excluir definitivamente."), "error");
    } finally { setBusy(false); }
  };

  return <AdminDialog open={open} title="Lixeira" className="max-w-3xl"
    description="Itens são excluídos definitivamente após 7 dias, caso não sejam restaurados."
    onClose={() => { if (!busy) onClose(); }}
    footer={<div className="flex flex-wrap justify-between gap-2">
      {canManage && <AdminButton variant="danger" size="sm" loading={busy} disabled={loading || count === 0}
        onClick={() => void permanentlyRemove()}><Trash2 size={15}/>Esvaziar lixeira</AdminButton>}
      <AdminButton variant="secondary" size="sm" disabled={busy} onClick={onClose}>Fechar</AdminButton>
    </div>}>
    {loading ? <LoadingState text="Carregando lixeira"/> :
      count === 0 ? <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <Trash2 size={32}/><p className="text-sm">A lixeira está vazia.</p>
      </div> : <div className="max-h-[54vh] space-y-2 overflow-y-auto">
        {entries.map(item => <div key={item.kind+item.id} className="flex flex-wrap items-center gap-3 border border-border bg-card p-3">
          {item.kind==="folder"?<Folder size={21} className="shrink-0 text-amber-500"/>:<Trash2 size={19} className="shrink-0 text-muted-foreground"/>}
          <div className="min-w-[140px] flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
            <p className="text-xs text-muted-foreground">{item.space.name} · {item.kind==="folder"?"Pasta":"Registro"}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock3 size={13}/>{remainingText(item.deletedAt)}
            </p>
          </div>
          {canManage&&<div className="flex flex-wrap items-center gap-2">
            <AdminButton variant="tertiary" size="sm" disabled={busy} onClick={()=>void restore(item)}><ArchiveRestore size={15}/>Restaurar</AdminButton>
            <AdminButton variant="danger" size="sm" disabled={busy} onClick={()=>void permanentlyRemove(item)}><Trash2 size={15}/>Excluir definitivamente</AdminButton>
          </div>}
        </div>)}
      </div>}
  </AdminDialog>;
}
