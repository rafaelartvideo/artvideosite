import { AdminButton } from '@/shared/ui/admin/AdminLayout';

type Props = {
  disabled: boolean;
  onDigit: (digit: string) => void;
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

/** Presentation only; the phone owns the existing call and handles send errors. */
export function UnionPbxDtmfPad({ disabled, onDigit }: Props) {
  return <section aria-label="Teclado" className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
    <h3 className="text-xs font-semibold text-foreground">Teclado</h3>
    <div className="grid grid-cols-3 gap-2">
      {DIGITS.map(digit => <AdminButton key={digit} type="button" variant="secondary" disabled={disabled}
        aria-label={`Enviar tecla ${digit}`} onClick={() => { if (!disabled) onDigit(digit); }}
        className="min-h-11 text-base font-semibold">{digit}</AdminButton>)}
    </div>
  </section>;
}
