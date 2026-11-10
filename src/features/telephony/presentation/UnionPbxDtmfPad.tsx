type Props = {
  disabled: boolean;
  onDigit: (digit: string) => void;
  title?: string;
  allowSymbols?: boolean;
};

const DIGITS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
] as const;

/** Um teclado telefônico para discagem inicial e envio de tons durante a chamada. */
export function UnionPbxDtmfPad({ disabled, onDigit, title = "Teclado DTMF", allowSymbols = true }: Props) {
  return <section aria-label={title} className="mx-auto w-full max-w-[300px] space-y-3">
    <h3 className="text-center text-xs font-semibold tracking-wide text-muted-foreground">{title}</h3>
    <div className="grid grid-cols-3 place-items-center gap-x-3 gap-y-2">
      {DIGITS.map(([digit, letters]) => {
        const inactive = disabled || (!allowSymbols && (digit === '*' || digit === '#'));
        return <button key={digit} type="button" disabled={inactive}
          aria-label={allowSymbols ? `Tecla ${digit}` : `Digitar ${digit}`}
          onClick={() => { if (!inactive) onDigit(digit); }}
          className="flex h-16 w-16 flex-col items-center justify-center rounded-full border border-border/70 bg-muted/40 text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 active:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-30 sm:h-[70px] sm:w-[70px]">
          <span className="text-[23px] font-medium leading-7 tabular-nums">{digit}</span>
          <span aria-hidden="true" className="h-3 text-[9px] font-medium tracking-widest text-muted-foreground">{letters}</span>
        </button>;
      })}
    </div>
  </section>;
}
