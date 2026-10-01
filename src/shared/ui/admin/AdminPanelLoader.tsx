export function AdminPanelLoader() {
  return (
    <div
      className="admin-crm admin-primary-loader relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-6 text-white"
      role="status"
      aria-live="polite"
      aria-label="Carregando painel"
    >
      <div className="relative z-10 flex flex-col items-center text-center">
        <img
          src="/assets/crm/logos/logosolo-semfundo.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-20 w-20 object-contain sm:h-24 sm:w-24"
        />

        <div className="mt-7 flex items-center gap-3 text-white/72">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white/85"
          />
          <span className="text-xs font-semibold tracking-[0.08em]">
            Carregando painel
          </span>
        </div>
      </div>
    </div>
  );
}
