import { useCallback, useEffect, useState } from "react";
import { QUICK_REPLY_VARIABLES, renderWhatsAppQuickReply } from "../domain/quick-reply-variables.mjs";
import { MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  deleteWhatsAppQuickReply, listWhatsAppQuickReplies, saveWhatsAppQuickReply,
  type WhatsAppQuickReply,
} from "../infrastructure/whatsapp-quick-replies.repository";

type Draft = { id?: string; title: string; message: string; sort_order: number; is_active: boolean };
const emptyDraft = (sort_order = 0): Draft => ({
  title: "", message: "", sort_order, is_active: true,
});

export function WhatsAppQuickRepliesSettings() {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canManage = hasPermission("settings.channels.manage");
  const [items, setItems] = useState<WhatsAppQuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!activeOrganizationId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try { setItems(await listWhatsAppQuickReplies(activeOrganizationId)); }
    catch (reason) { notifyAdmin(systemErrorMessage(reason, "Não foi possível carregar as mensagens rápidas."), "error"); }
    finally { setLoading(false); }
  }, [activeOrganizationId]);
  useEffect(() => { setDraft(null); void refresh(); }, [refresh]);

  const save = async () => {
    if (!activeOrganizationId || !canManage || !draft || busy) return;
    setBusy(true); setError("");
    try {
      await saveWhatsAppQuickReply(activeOrganizationId, draft);
      setDraft(null);
      notifyAdmin("Mensagem rápida salva.", "success");
      await refresh();
    } catch (reason) { setError(systemErrorMessage(reason, "Não foi possível salvar a mensagem.")); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!activeOrganizationId || !canManage || deleting) return;
    setDeleting(id);
    try {
      await deleteWhatsAppQuickReply(activeOrganizationId, id);
      setItems(current => current.filter(item => item.id !== id));
      notifyAdmin("Mensagem rápida excluída.", "success");
    } catch (reason) { notifyAdmin(systemErrorMessage(reason, "Não foi possível excluir."), "error"); }
    finally { setDeleting(null); }
  };

  return <>
    <AdminCard>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-bold">Mensagens rápidas do WhatsApp</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Respostas reutilizáveis pela empresa em Atendimentos e na conversa da OS. Inserir não envia automaticamente.
          </p>
        </div>
        {canManage && <AdminButton size="sm" onClick={() => { setError(""); setDraft(emptyDraft(items.length)); }}>
          <Plus size={16}/> Nova mensagem
        </AdminButton>}
      </div>
      {loading ? <div className="flex min-h-40 items-center justify-center"><LoadingState text="Carregando mensagens rápidas..."/></div> :
        items.length===0 ? <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
          <MessageSquareText size={26}/>
          <p>Nenhuma mensagem rápida configurada nesta empresa.</p>
          <p className="max-w-lg text-xs">Crie saudações, endereços e respostas com variáveis como {"{operador}"} e {"{horario}"}.</p>
        </div> :
        <div className="divide-y divide-border">
          {items.map(item => <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{item.title}
                {!item.is_active && <span className="ml-2 text-xs font-normal text-muted-foreground">(Inativa)</span>}
              </p>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{item.message}</p>
            </div>
            {canManage && <div className="flex shrink-0 gap-1">
              <button type="button" aria-label={`Editar ${item.title}`} title="Editar"
                onClick={() => { setError(""); setDraft({id:item.id,title:item.title,message:item.message,sort_order:item.sort_order,is_active:item.is_active}); }}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Pencil size={16}/></button>
              <button type="button" aria-label={`Excluir ${item.title}`} title="Excluir"
                disabled={deleting===item.id} onClick={() => void remove(item.id)}
                className="rounded-md p-2 text-destructive hover:bg-muted disabled:opacity-50"><Trash2 size={16}/></button>
            </div>}
          </div>)}
        </div>}
    </AdminCard>
    <AdminDialog open={Boolean(draft)} onClose={() => { if(!busy)setDraft(null); }}
      title={draft?.id ? "Editar mensagem rápida" : "Nova mensagem rápida"}
      className="max-w-lg"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={busy} onClick={() => setDraft(null)}>Cancelar</AdminButton>
        <AdminButton loading={busy} disabled={busy || !draft?.title.trim() || !draft?.message.trim()} onClick={() => void save()}>Salvar</AdminButton>
      </div>}>
      {draft && <div className="space-y-4">
        <label className="block text-xs font-semibold">Título
          <input value={draft.title} maxLength={70} onChange={event => setDraft(current => current && ({...current,title:event.target.value}))}
            placeholder="Ex.: Saudação, Endereço" className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
        </label>
        <label className="block text-xs font-semibold">Mensagem
          <textarea value={draft.message} maxLength={4000} rows={6}
            onChange={event => setDraft(current => current && ({...current,message:event.target.value}))}
            placeholder="Texto que será inserido na conversa para revisão"
            className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-3 text-sm"/>
        </label>
        <section aria-label="Variáveis disponíveis" className="space-y-2">
          <p className="text-xs font-bold">Variáveis automáticas</p>
          <p className="text-xs text-muted-foreground">Clique em uma variável para inserir na mensagem. Ela será preenchida com os dados do operador e da conversa ao selecionar a resposta.</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_REPLY_VARIABLES.map(item=><button type="button" key={item.token} title={item.label}
              onClick={()=>setDraft(current=>current&&({...current,message:(current.message+" "+item.token).trimStart().slice(0,4000)}))}
              className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs font-semibold text-primary hover:border-primary/50 hover:bg-primary/10">
              {item.token}
            </button>)}
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-1 text-[11px] font-bold text-muted-foreground">Prévia com dados de exemplo</p>
            <p className="whitespace-pre-wrap break-words text-xs leading-5">{renderWhatsAppQuickReply(draft.message,{operatorName:"Rafael Ferreira",customerName:"Cliente de exemplo",protocol:"ATD-000001"})||"Escreva a mensagem para visualizar."}</p>
          </div>
        </section>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={draft.is_active}
            onChange={event => setDraft(current => current && ({...current,is_active:event.target.checked}))}/>
          Disponível aos operadores
        </label>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      </div>}
    </AdminDialog>
  </>;
}
