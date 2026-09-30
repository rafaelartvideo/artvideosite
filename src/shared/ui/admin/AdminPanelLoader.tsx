import unionLogo from "@/imports/LogoSoloSemFundo.png";

export function AdminPanelLoader() {
  return (
    <div
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#021a42_0%,#0048b8_38%,#0878e7_72%,#28a8ff_100%)] px-6 text-white"
      role="status"
      aria-live="polite"
      aria-label="Carregando painel"
    >
      <style>{`
        @keyframes union-loader-orbit {
          to { transform: rotate(360deg); }
        }

        @keyframes union-loader-orbit-reverse {
          to { transform: rotate(-360deg); }
        }

        @keyframes union-loader-float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-7px) scale(1.025); }
        }

        @keyframes union-loader-glow {
          0%, 100% { opacity: .5; transform: scale(.92); }
          50% { opacity: .95; transform: scale(1.12); }
        }

        @keyframes union-loader-shimmer {
          0% { transform: translateX(-130%); }
          100% { transform: translateX(330%); }
        }

        @keyframes union-loader-dot {
          0%, 100% { opacity: .35; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-3px); }
        }

        @keyframes union-loader-ambient-a {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(26px, 18px, 0) scale(1.08); }
        }

        @keyframes union-loader-ambient-b {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-22px, -16px, 0) scale(1.12); }
        }

        @media (prefers-reduced-motion: reduce) {
          .union-loader-motion {
            animation: none !important;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.20),transparent_31%),radial-gradient(circle_at_12%_18%,rgba(73,194,255,0.28),transparent_26%),radial-gradient(circle_at_88%_82%,rgba(0,41,118,0.35),transparent_31%)]" />

      <div
        className="union-loader-motion pointer-events-none absolute -left-20 top-[10%] h-72 w-72 rounded-full bg-[#4fc3ff]/20 blur-[90px]"
        style={{ animation: "union-loader-ambient-a 7s ease-in-out infinite" }}
      />
      <div
        className="union-loader-motion pointer-events-none absolute -bottom-24 right-[3%] h-80 w-80 rounded-full bg-[#001f68]/35 blur-[100px]"
        style={{ animation: "union-loader-ambient-b 8s ease-in-out infinite" }}
      />

      <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative flex h-[184px] w-[184px] items-center justify-center sm:h-[204px] sm:w-[204px]">
          <div
            className="union-loader-motion absolute inset-[20px] rounded-full bg-white/20 blur-3xl"
            style={{ animation: "union-loader-glow 2.8s ease-in-out infinite" }}
          />

          <div
            className="union-loader-motion absolute inset-0 rounded-full border border-white/12"
            style={{ animation: "union-loader-orbit 10s linear infinite" }}
          >
            <span className="absolute left-1/2 top-[-3px] h-2 w-2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_16px_rgba(255,255,255,.9)]" />
          </div>

          <div
            className="union-loader-motion absolute inset-[12px] rounded-full border-2 border-transparent border-r-white/45 border-t-white/90"
            style={{ animation: "union-loader-orbit 2.2s linear infinite" }}
          />

          <div
            className="union-loader-motion absolute inset-[25px] rounded-full border border-transparent border-b-[#79d5ff]/80 border-l-[#79d5ff]/30"
            style={{ animation: "union-loader-orbit-reverse 3.6s linear infinite" }}
          />

          <div
            className="union-loader-motion relative flex h-[104px] w-[104px] items-center justify-center rounded-[30px] border border-white/20 bg-white/[0.12] shadow-[0_18px_60px_rgba(0,30,92,.34),inset_0_1px_0_rgba(255,255,255,.24)] backdrop-blur-xl sm:h-[116px] sm:w-[116px]"
            style={{ animation: "union-loader-float 3s ease-in-out infinite" }}
          >
            <div className="absolute inset-2 rounded-[24px] bg-[linear-gradient(145deg,rgba(255,255,255,.10),rgba(255,255,255,.02))]" />
            <img
              src={unionLogo}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="relative z-10 h-[68px] w-[68px] object-contain drop-shadow-[0_10px_24px_rgba(0,30,90,.28)] sm:h-[76px] sm:w-[76px]"
            />
          </div>
        </div>

        <div className="mt-5 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.34em] text-white/65">
            Union World
          </div>
          <div className="mt-2 text-lg font-black tracking-tight text-white sm:text-xl">
            Carregando painel
          </div>
          <div className="mt-2 flex items-center justify-center gap-1.5" aria-hidden="true">
            {[0, 1, 2].map(index => (
              <span
                key={index}
                className="union-loader-motion h-1.5 w-1.5 rounded-full bg-white"
                style={{
                  animation: "union-loader-dot 1.2s ease-in-out infinite",
                  animationDelay: `${index * 160}ms`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-7 h-1 w-40 overflow-hidden rounded-full bg-white/15 sm:w-48">
          <div
            className="union-loader-motion h-full w-1/3 rounded-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.95),transparent)] shadow-[0_0_14px_rgba(255,255,255,.65)]"
            style={{ animation: "union-loader-shimmer 1.65s ease-in-out infinite" }}
          />
        </div>
      </div>
    </div>
  );
}
