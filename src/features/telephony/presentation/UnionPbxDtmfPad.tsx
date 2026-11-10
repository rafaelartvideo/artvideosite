import { AdminButton } from '@/shared/ui/admin/AdminLayout';

type Props = {
  disabled: boolean;
  onDigit: (digit: string) => void;
  title?: string;
  allowSymbols?: boolean;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/** Teclado telefônico compartilhado pelo discador e pela sessão DTMF. */
export function UnionPbxDtmfPad({ disabled, onDigit, title = 'Teclado DTMF', allowSymbols = true }: Props) {
  return <section aria-label={title} className="mx-auto w-full max-w-[300px] space-y-3">
    <h3 className="text-center text-xs font-semibold tracking-wide text-muted-foreground">{title}</h3>
    <div className="grid grid-cols-3 place-items-center gap-2">
      {DIGITS.map(digit => {
        const inactive = disabled || (!allowSymbols && (digit === '*' || digit === '#'));
        return <AdminButton key={digit} type="button" variant="secondary" disabled={inactive}
          aria-label={`Enviar tecla ${digit}`}
          onClick={() => { if (!inactive) onDigit(digit); }}
          className="!flex !h-16 !w-16 !min-w-0 !items-center !justify-center !rounded-full !p-0 text-xl font-medium tabular-nums transition-colors hover:!bg-primary/10 sm:!h-[70px] sm:!w-[70px]">{digit}</AdminButton>;
      })}
    </div>
  </section>;
}
