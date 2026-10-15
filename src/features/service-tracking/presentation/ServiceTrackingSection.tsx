import { useState } from "react";
import { CheckCircle, Clock, Search, X } from "lucide-react";
import { PublicButton as Btn, PublicHeading as H2 } from "@/features/public-shell/presentation/PublicUi";
import { findPublicServiceOrder } from "../application/find-public-service-order";
import { formatTrackingDate, getTrackingStatusIndex, TRACKING_STATUS_STEPS } from "../domain/service-tracking";

export function ServiceTrackingSection() {
  const [osNumber, setOsNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOs = osNumber.trim();
    if (!cleanOs) return;

    setLoading(true);
    setSearched(true);
    setOrder(null);
    setErrorMsg("");

    try {
      const trackedOrder = await findPublicServiceOrder(cleanOs);
      if (trackedOrder) {
        setOrder(trackedOrder);
      } else {
        setErrorMsg("Ordem de Serviço não encontrada. Por favor, verifique o número digitado e tente novamente.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Ocorreu um erro ao consultar a OS. Tente novamente em alguns instantes.");
    } finally {
      setLoading(false);
    }
  };

  const currentStepIdx = order ? getTrackingStatusIndex(order.status) : 0;

  return (
    <section id="acompanhar-servico" className="scroll-mt-24 rounded-[7px] border border-[#d7e8ff] bg-gradient-to-r from-[#e4efff] via-[#eef6ff] to-[#dcecff] px-5 py-5 shadow-[0_2px_14px_rgba(24,83,162,.04)] sm:px-7">
      <div>
        <div className="grid items-center gap-x-8 gap-y-4 lg:grid-cols-[.95fr_1.05fr]">
          <div>
            <H2 className="!text-[20px] sm:!text-[23px]">Acompanhe seu serviço</H2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#5d6e86] sm:text-[13px]">
              Informe o número da sua OS para ver o status atualizado.
            </p>
          </div>
          <form onSubmit={handleTrack} className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <label htmlFor="artvideo-os-number" className="sr-only">Número da Ordem de Serviço</label>
            <input
              id="artvideo-os-number"
              type="text"
              value={osNumber}
              onChange={(event) => setOsNumber(event.target.value)}
              placeholder="Ex.: 12345"
              autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-[5px] border border-[#dbe6f4] bg-white px-4 py-2.5 text-[13px] font-medium text-[#0d1b2e] placeholder:text-[#8a98ab] shadow-sm transition-all focus:border-[var(--art-primary)] focus:outline-none focus:ring-2 focus:ring-blue-400/20"
              required
            />
            <Btn variant="primary" className="!min-h-11 shrink-0 whitespace-nowrap px-6" disabled={loading}>
              {loading ? <><Clock size={16} className="animate-spin"/> Buscando...</> :
                <><Search size={17}/> Acompanhar</>}
            </Btn>
          </form>
        </div>
        {/* Loading state */}
        {loading && (
          <div className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-xl p-8 text-center">
            <Clock size={32} className="animate-spin text-[#0057e7] mx-auto mb-3" />
            <p className="font-semibold text-[#0d1b2e] text-sm">Consultando informações da sua Ordem de Serviço...</p>
          </div>
        )}

        {/* Error / Not found state */}
        {!loading && searched && errorMsg && (
          <div className="bg-[#fff5f5] border border-[#f87171]/30 rounded-xl p-6 text-center max-w-xl mx-auto">
            <div className="w-12 h-12 bg-[#fee2e2] text-[#ef4444] rounded-full flex items-center justify-center mx-auto mb-3">
              <X size={24} />
            </div>
            <h3 className="font-bold text-[#0d1b2e] text-base mb-1">OS não encontrada</h3>
            <p className="text-sm text-[#5a6a82] leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Result state */}
        {!loading && order && (
          <div className="bg-[#f5f7fa] border border-[#0d1b2e]/10 rounded-xl p-6 sm:p-8 shadow-sm">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#0d1b2e]/10 gap-4">
              <div>
                <span className="text-xs font-bold text-[#0057e7] uppercase tracking-wider block mb-1">Ordem de Serviço</span>
                <h3 className="text-2xl font-black text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  #{order.os_number || order.id}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 bg-[#0057e7]/10 text-[#0057e7] font-bold text-xs px-3 py-1.5 rounded-full border border-[#0057e7]/20">
                  <CheckCircle size={14} />
                  Status: {order.status || "Em andamento"}
                </span>
              </div>
            </div>

            {/* General details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-6 border-b border-[#0d1b2e]/10 text-sm">
              <div>
                <span className="text-xs text-[#5a6a82] font-semibold block uppercase">Serviço / Produto</span>
                <span className="font-bold text-[#0d1b2e]">{order.title || order.description || "Assistência Técnica / Manutenção"}</span>
              </div>
              <div>
                <span className="text-xs text-[#5a6a82] font-semibold block uppercase">Data da solicitação</span>
                <span className="font-medium text-[#0d1b2e]">{formatTrackingDate(order.created_at)}</span>
              </div>
              <div>
                <span className="text-xs text-[#5a6a82] font-semibold block uppercase">Última atualização</span>
                <span className="font-medium text-[#0d1b2e]">{formatTrackingDate(order.updated_at || order.created_at)}</span>
              </div>
              {order.estimated_delivery && (
                <div>
                  <span className="text-xs text-[#5a6a82] font-semibold block uppercase">Previsão de conclusão</span>
                  <span className="font-medium text-[#0d1b2e]">{formatTrackingDate(order.estimated_delivery)}</span>
                </div>
              )}
            </div>

            {/* Status Timeline */}
            <div className="py-6 border-b border-[#0d1b2e]/10">
              <h4 className="text-sm font-bold text-[#0d1b2e] uppercase tracking-wide mb-6">Andamento do serviço</h4>
              
              {/* Desktop timeline */}
              <div className="hidden md:block relative">
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-[#0d1b2e]/10 -translate-y-1/2 z-0" />
                <div 
                  className="absolute top-1/2 left-0 h-1 bg-[#0057e7] -translate-y-1/2 z-0 transition-all duration-500"
                  style={{ width: `${(currentStepIdx / (TRACKING_STATUS_STEPS.length - 1)) * 100}%` }}
                />
                <div className="grid grid-cols-6 relative z-10 text-center">
                  {TRACKING_STATUS_STEPS.map((step, idx) => {
                    const isDone = idx <= currentStepIdx;
                    const isCurrent = idx === currentStepIdx;
                    return (
                      <div key={step} className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors mb-2 ${
                          isCurrent
                            ? "bg-[#0057e7] text-white ring-4 ring-[#0057e7]/20"
                            : isDone
                            ? "bg-[#0057e7] text-white"
                            : "bg-white text-[#5a6a82] border-2 border-[#0d1b2e]/20"
                        }`}>
                          {isDone ? <CheckCircle size={14} /> : idx + 1}
                        </div>
                        <span className={`text-xs font-semibold px-1 leading-tight ${isDone ? "text-[#0d1b2e]" : "text-[#5a6a82]/70"}`}>
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mobile timeline */}
              <div className="md:hidden space-y-3">
                {TRACKING_STATUS_STEPS.map((step, idx) => {
                  const isDone = idx <= currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  return (
                    <div key={step} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                        isCurrent
                          ? "bg-[#0057e7] text-white ring-2 ring-[#0057e7]/20"
                          : isDone
                          ? "bg-[#0057e7] text-white"
                          : "bg-white text-[#5a6a82] border border-[#0d1b2e]/20"
                      }`}>
                        {isDone ? <CheckCircle size={12} /> : idx + 1}
                      </div>
                      <span className={`text-xs font-semibold ${isDone ? "text-[#0d1b2e]" : "text-[#5a6a82]/70"}`}>
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Public messages / Custom History if present */}
            {order.history?.some((entry: any) => entry.notes) && (
              <div className="pt-6">
                <h4 className="text-sm font-bold text-[#0d1b2e] uppercase tracking-wide mb-2">Observações ao cliente</h4>
                <div className="bg-white border border-[#0d1b2e]/10 rounded-lg p-4 text-xs text-[#3a4a5e] leading-relaxed">
                  {order.history.filter((entry: any) => entry.notes).map((entry: any) => <p key={entry.created_at} className="mb-2 last:mb-0">{entry.notes}</p>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
