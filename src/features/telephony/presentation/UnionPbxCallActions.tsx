import { useState } from "react";
import { ArrowRightLeft, LoaderCircle, Mic, MicOff, Pause, PhoneOff, Play } from "lucide-react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";

type Props = {
  idPrefix: string;
  held: boolean;
  muted: boolean;
  holdUncertain: boolean;
  transferUncertain: boolean;
  busy: "hold" | "transfer" | null;
  destination: string;
  extensions: { number: number; display_name: string }[];
  onDestination: (value: string) => void;
  onHold: () => void;
  onMute: () => void;
  onHangup: () => void;
  onTransfer: () => void;
};

/** Uma barra de controles para a sessão SIP ativa, reutilizada no telefone completo e no flutuante. */
export function UnionPbxCallActions({
  idPrefix, held, muted, holdUncertain, transferUncertain, busy,
  destination, extensions, onDestination, onHold, onMute, onHangup, onTransfer,
}: Props) {
  const [transferOpen, setTransferOpen] = useState(false);
  const valid = extensions.some(item => String(item.number) === destination);
  const control = "inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";

  return <div className="space-y-2">
    <div role="group" aria-label="Controles da ligação" className="flex w-full items-center gap-2">
      <button type="button" aria-label={muted ? "Ativar microfone" : "Silenciar microfone"}
        title={muted ? "Ativar microfone" : "Silenciar microfone"} aria-pressed={muted}
        disabled={Boolean(busy)} onClick={onMute}
        className={`${control} ${muted ? "border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border bg-background text-foreground hover:bg-muted"}`}>
        {muted ? <MicOff size={20}/> : <Mic size={20}/>}
      </button>
      <button type="button" onClick={onHold} disabled={Boolean(busy)}
        aria-label={held ? "Retomar chamada" : "Colocar em espera"}
        title={held ? "Retomar chamada" : "Colocar em espera"} aria-pressed={held}
        className={`${control} ${held
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
          : "border-amber-400/35 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"}`}>
        {busy === "hold" ? <LoaderCircle size={20} className="animate-spin"/> : held ? <Play size={20}/> : <Pause size={20}/>}
      </button>
      <button type="button" aria-label="Transferir chamada" title="Transferir chamada"
        aria-expanded={transferOpen} aria-controls={`${idPrefix}-transfer-panel`}
        aria-pressed={transferOpen} onClick={() => setTransferOpen(value => !value)}
        disabled={Boolean(busy) || transferUncertain}
        className={`${control} border-primary/20 bg-primary/5 text-primary hover:bg-primary/10`}>
        <ArrowRightLeft size={20}/>
      </button>
      <button type="button" aria-label="Desligar" title="Desligar" onClick={onHangup}
        className={`${control} border-red-700 bg-red-700 text-white hover:bg-red-800 dark:border-red-600 dark:bg-red-600`}>
        <PhoneOff size={20}/>
      </button>
    </div>
    {holdUncertain && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">Confirmação de espera pendente.</p>}
    {transferOpen && <div id={`${idPrefix}-transfer-panel`} className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="min-w-[155px] flex-1">
        <AdminSelect value={destination} disabled={Boolean(busy) || transferUncertain || !extensions.length}
          onValueChange={onDestination} ariaLabel="Selecione o ramal para transferência"
          options={[{ value:"",label:"Selecione um ramal" },
            ...extensions.map(item => ({value:String(item.number),label:`${item.number} · ${item.display_name}`}))]}/>
      </div>
      <AdminButton size="sm" onClick={onTransfer} disabled={!valid || Boolean(busy) || transferUncertain}
        loading={busy === "transfer"} loadingText="Transferindo...">
        <ArrowRightLeft size={16}/> Transferir
      </AdminButton>
      {transferUncertain && <p role="status" className="w-full text-xs text-amber-700 dark:text-amber-300">
        Aguarde a confirmação da transferência para tentar novamente.
      </p>}
    </div>}
  </div>;
}
