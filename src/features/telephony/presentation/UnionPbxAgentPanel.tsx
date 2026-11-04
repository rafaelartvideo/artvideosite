import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Agent = {
  id: string;
  label: string;
  enabled: boolean;
  last_seen_at: string | null;
};

export function UnionPbxAgentPanel({ organizationId }: { organizationId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [label, setLabel] = useState("VPS principal Union");
  const [publicKey, setPublicKey] = useState("");
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setRegisteredId(null);
    setAgents([]);
    void (async () => {
      const { data, error } = await supabase.rpc("pbx_list_agents", {
        p_organization_id: organizationId,
      });
      if (cancelled) return;
      setLoading(false);
      if (error) setError("Falha ao consultar a ponte: " + error.message);
      else setAgents((data || []) as Agent[]);
    })();
    return () => { cancelled = true; };
  }, [organizationId, reload]);

  async function register() {
    if (busy) return;
    if (!/^[A-Za-z0-9+/]{43}=$/.test(publicKey.trim())) {
      setError("Informe a chave pública Ed25519 de 44 caracteres emitida pela VPS.");
      return;
    }
    if (label.trim().length < 2 || label.trim().length > 80) {
      setError("Informe um nome entre 2 e 80 caracteres.");
      return;
    }
    setError("");
    setBusy(true);
    const { data, error } = await supabase.rpc("pbx_register_agent", {
      p_organization_id: organizationId,
      p_label: label.trim(),
      p_public_key: publicKey.trim(),
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRegisteredId(String(data));
    setPublicKey("");
    setReload(key => key + 1);
  }

  async function revoke(agent: Agent) {
    if (busy || !agent.enabled) return;
    if (!window.confirm("Revogar o agente " + agent.label + "? A VPS não receberá novos pedidos de ramais. As chamadas atuais continuarão funcionando.")) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("pbx_disable_agent", {
      p_organization_id: organizationId,
      p_agent_id: agent.id,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setReload(key => key + 1);
  }

  return <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="Ponte PABX com VPS">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck size={18} className="text-primary" /> Ponte com a VPS
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          A VPS consulta pendências por HTTPS e assina as requisições. A chave privada nunca sai da VPS.
          Esta integração não altera a linha FVX nem o ramal 301.
        </p>
      </div>
      <button type="button" onClick={() => setReload(key => key + 1)} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground">
        <RefreshCw size={14} /> Atualizar
      </button>
    </div>

    {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-400">{error}</p>}

    {loading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle size={16} className="animate-spin"/> Consultando agentes</p>
      : agents.length ? <div className="divide-y divide-border rounded-lg border border-border">
        {agents.map(agent => {
          const seen = agent.last_seen_at ? new Date(agent.last_seen_at) : null;
          const online = agent.enabled && seen && Date.now() - seen.getTime() < 120000;
          return <div key={agent.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{agent.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {agent.enabled ? online ? "Sinal recente da VPS" : "Aguardando sinal da VPS" : "Acesso revogado"}
                {seen && " · última comunicação: " + seen.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{agent.id}</p>
            </div>
            {agent.enabled && <button type="button" disabled={busy} onClick={() => void revoke(agent)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground">
              <Unplug size={14}/> Revogar
            </button>}
          </div>;
        })}
      </div> : <p className="text-xs text-muted-foreground">Nenhuma VPS autorizada para receber alterações de ramais.</p>}

    {registeredId && <div className="space-y-1 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
      <p className="text-sm font-semibold text-foreground">Agente registrado no CRM</p>
      <p className="text-xs text-muted-foreground">Copie o ID e a organização abaixo para configurar o serviço na VPS.</p>
      <code className="block break-all rounded bg-background p-2 text-xs text-foreground">{registeredId}</code>
      <code className="block break-all rounded bg-background p-2 text-xs text-foreground">python3 /opt/union-pbx-agent/agent.py configure {registeredId} {organizationId}</code>
    </div>}

    {!agents.some(agent => agent.enabled) && <div className="space-y-3 border-t border-border pt-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><KeyRound size={16} /> Autorizar uma VPS</h3>
      <p className="text-xs leading-5 text-muted-foreground">
        Na VPS, execute <code>python3 /opt/union-pbx-agent/agent.py init</code> e cole abaixo
        apenas a chave pública gerada. Não envie arquivos de chave privada.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-semibold text-foreground">Nome do agente
          <input value={label} onChange={e => setLabel(e.target.value)} maxLength={80}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"/>
        </label>
        <label className="space-y-1 text-xs font-semibold text-foreground">Chave pública Ed25519
          <input value={publicKey} onChange={e => setPublicKey(e.target.value)} maxLength={44}
            spellCheck={false} autoComplete="off" placeholder="44 caracteres em Base64"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-xs text-foreground"/>
        </label>
      </div>
      <button type="button" onClick={() => void register()} disabled={busy || !publicKey.trim()}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16}/>} Autorizar agente
      </button>
    </div>}
  </section>;
}
