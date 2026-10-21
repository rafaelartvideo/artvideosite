import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { AdminButton, Section } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { addQuoteComment, listQuoteComments } from "../infrastructure/internal-quotes.repository";

type Props = {
  organizationId: string;
  quoteId: string;
  authorId: string | null;
  canComment: boolean;
};

export function QuoteCommentsSection({ organizationId, quoteId, authorId, canComment }: Props) {
  const [comments, setComments] = useState<any[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    const items = await listQuoteComments(organizationId, quoteId);
    setComments(items);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    void listQuoteComments(organizationId, quoteId).then(items => {
      if (active) setComments(items);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [organizationId, quoteId]);

  const submit = async () => {
    if (!canComment || !authorId || !body.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await addQuoteComment(organizationId, quoteId, authorId, body);
      setBody("");
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível comentar."); }
    finally { setSaving(false); }
  };

  return <Section title="Comentários" description="Histórico interno de observações e negociações deste orçamento.">
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {canComment && <div className="space-y-2">
        <textarea className={INPUT + " min-h-20 w-full"} rows={3} maxLength={4000}
          placeholder="Escreva um comentário para a equipe..." value={body}
          onChange={event => setBody(event.target.value)} />
        <div className="flex justify-end">
          <AdminButton onClick={() => void submit()} disabled={saving || !body.trim() || !authorId}>
            <MessageSquarePlus size={15}/> {saving ? "Salvando..." : "Adicionar comentário"}
          </AdminButton>
        </div>
      </div>}
      {loading ? <p className="text-sm text-muted-foreground">Carregando comentários...</p>
        : comments.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum comentário registrado.</p>
          : <div className="space-y-2">{comments.map(comment => <article key={comment.id} className="rounded-lg border border-border p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <strong className="text-xs">{comment.author?.full_name || "Colaborador"}</strong>
                <time className="text-xs text-muted-foreground" dateTime={comment.created_at}>
                  {new Date(comment.created_at).toLocaleString("pt-BR")}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
            </article>)}</div>}
    </div>
  </Section>;
}
