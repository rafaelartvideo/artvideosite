export function AdminPanelLoader({
  progress = 12,
  status = "Carregando painel",
}: {
  progress?: number;
  status?: string;
}) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div
      className="admin-crm admin-primary-loader relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 text-white"
      role="status"
      aria-live="polite"
      aria-label={`${status}: ${safeProgress}%`}
    >
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center text-center">
        <img
          src="/assets/crm/logos/logosolo-semfundo.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-40 w-40 object-contain sm:h-48 sm:w-48"
        />

        <div className="mt-7 w-full">
          <div className="mb-2 flex items-center justify-between gap-4 text-xs font-semibold tracking-[0.06em] text-white/78">
            <span>{status}</span>
            <span className="tabular-nums text-white">{safeProgress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/18">
            <div
              className="h-full rounded-full bg-white transition-[width] duration-500 ease-out"
              style={{ width: `${safeProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
