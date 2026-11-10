import { ArrowRightLeft, Pause, Play } from 'lucide-react';
import { AdminButton } from '@/shared/ui/admin/AdminLayout';
import { AdminSelect } from '@/shared/ui/admin/AdminFormControls';

type Props = {
  idPrefix: string;
  held: boolean;
  holdUncertain: boolean;
  transferUncertain: boolean;
  busy: 'hold' | 'transfer' | null;
  destination: string;
  extensions: { number: number; display_name: string }[];
  onDestination: (value: string) => void;
  onHold: () => void;
  onTransfer: () => void;
};

/** Presentation only: both phone surfaces use the parent's single SIP session. */
export function UnionPbxCallActions({ idPrefix, held, holdUncertain, transferUncertain, busy, destination, extensions, onDestination, onHold, onTransfer }: Props) {
  const valid = extensions.some(item => String(item.number) === destination);
  return <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <AdminButton variant="secondary" size="sm" onClick={onHold} disabled={Boolean(busy)}
        loading={busy === 'hold'} loadingText="Negociando áudio..." aria-pressed={held}>
        {held ? <Play size={15} /> : <Pause size={15} />} {held ? 'Retomar chamada' : 'Colocar em espera'}
      </AdminButton>
      {(held || holdUncertain) && <span role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-300">{holdUncertain ? 'Estado de espera sem confirmação' : 'Chamada em espera'}</span>}
    </div>
    <div className="space-y-2">
      <p id={`${idPrefix}-transfer-label`} className="block text-xs font-semibold text-foreground">Transferir para outro ramal</p>
      <div className="flex flex-wrap gap-2">
        <div className="min-w-0 flex-1"><AdminSelect value={destination} disabled={Boolean(busy) || transferUncertain || !extensions.length}
          onValueChange={onDestination} ariaLabel="Transferir para outro ramal"
          options={[{value:'',label:'Selecione um ramal'},...extensions.map(item=>({value:String(item.number),label:`${item.number} · ${item.display_name}`}))]} /></div>
        <AdminButton size="sm" onClick={onTransfer} disabled={!valid || Boolean(busy) || transferUncertain}
          loading={busy === 'transfer'} loadingText="Transferindo...">
          <ArrowRightLeft size={15} /> Transferir
        </AdminButton>
      </div>
      <p role={transferUncertain ? 'status' : undefined} className="text-xs leading-5 text-muted-foreground">{transferUncertain
        ? 'Transferência sem confirmação final. Aguarde ou encerre a chamada; uma nova transferência fica bloqueada para evitar duplicação.'
        : extensions.length
        ? 'A transferência só é concluída após o destino atender. Se falhar, verifique se a chamada original continua ativa.'
        : 'Não há outro ramal disponível para transferência nesta chamada.'}</p>
    </div>
  </div>;
}
