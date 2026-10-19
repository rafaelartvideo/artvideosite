import React, { useEffect, useState } from "react";
import { Download, ExternalLink, MonitorCog, Printer, ShieldCheck } from "lucide-react";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { readOrderLabelLayout } from "@/features/orders/domain/order-label-print";
import { getOrderLabelPaper, preparePrinterScript, PRINTER_SETUP_PROFILES } from "../domain/printer-profiles";

type WebPrinterModel = {
  id: string;
  name: string;
  manufacturer: string;
  paperWidthMm: number;
  paperHeightMm: number;
  driverUrl: string;
  description: string;
};

const EXE_DOWNLOAD = "https://github.com/rafaelartvideo/artvideosite/releases/download/union-printer-configurator/UnionWorld-Configurador.exe";
const DEFAULT_MODELS: WebPrinterModel[] = [
  { id: "elgin-l42", name: "Elgin L42 / BTP-L42(U)", manufacturer: "Elgin", paperWidthMm: 104, paperHeightMm: 23, driverUrl: "https://www.elgin.com.br/download-center", description: "3 etiquetas por fileira" },
  { id: "custom", name: "Personalizado (outras impressoras)", manufacturer: "Outro", paperWidthMm: 104, paperHeightMm: 23, driverUrl: "", description: "Medidas definidas no aplicativo" },
];

export function PrinterSetupPanel() {
  const [models, setModels] = useState<WebPrinterModel[]>(DEFAULT_MODELS);
  const [profileId, setProfileId] = useState("elgin-l42");
  const [downloading, setDownloading] = useState(false);
  const profile = models.find(item => item.id === profileId);
  const labelPaper = getOrderLabelPaper(readOrderLabelLayout());

  useEffect(() => {
    const abort = new AbortController();
    fetch(import.meta.env.BASE_URL + "assets/crm/impressoras/perfis.json", { signal: abort.signal, cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error("Perfis indisponíveis");
        return response.json();
      })
      .then(json => {
        if (json?.schemaVersion === 1 && Array.isArray(json.profiles)) {
          const items = json.profiles.filter((item: WebPrinterModel) =>
            item && typeof item.id === "string" && typeof item.name === "string" &&
            Number.isFinite(item.paperWidthMm) && Number.isFinite(item.paperHeightMm));
          if (items.length > 0) setModels(items);
        }
      }).catch(() => { /* Lista local de perfis permanece disponível offline. */ });
    return () => abort.abort();
  }, []);

  async function downloadLegacyScript() {
    const legacyProfile = PRINTER_SETUP_PROFILES.find(item => item.id === profileId);
    if (!legacyProfile || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(import.meta.env.BASE_URL + "assets/crm/impressoras/configurar-impressora.ps1", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível obter o configurador PowerShell.");
      const script = preparePrinterScript(await response.text(), legacyProfile, labelPaper);
      const url = URL.createObjectURL(new Blob(["\uFEFF", script], { type: "text/plain;charset=utf-8" }));
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = "union-configurador-" + legacyProfile.id + ".ps1";
        document.body.appendChild(link);
        link.click();
        link.remove();
        notifyAdmin("Configuração alternativa baixada.", "success");
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      }
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Erro ao baixar o script.", "error");
    } finally {
      setDownloading(false);
    }
  }

  return <AdminCard className="p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600"><Printer size={21} /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-black text-foreground">Configurador de impressoras</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Aplicativo para Windows 10 e 11. Detecta impressoras instaladas, permite escolher uma delas e aplica o tamanho personalizado de papel.
        </p>
      </div>
    </div>

    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Modelos disponíveis</label>
          <AdminSelect value={profileId} onValueChange={setProfileId} options={models.map(item => ({ value: item.id, label: item.name }))} />
          <p className="mt-2 text-xs text-muted-foreground">{profile?.description || "Selecione o modelo que será usado no aplicativo."}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <p className="font-bold text-foreground">Configuração de referência</p>
          <p className="mt-1 text-muted-foreground">{profile?.paperWidthMm} × {profile?.paperHeightMm} mm</p>
          {profile?.id === "elgin-l42" && <p className="mt-1 text-muted-foreground">A etiqueta de OS configurada neste navegador usa {labelPaper.widthMm} × {labelPaper.heightMm} mm. No aplicativo, você poderá ajustar as medidas antes de aplicar.</p>}
        </div>
        <a href={EXE_DOWNLOAD} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#0057e7] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#0046c7] sm:w-auto">
          <Download size={17} /> Baixar aplicativo para Windows (.exe)
        </a>
        {PRINTER_SETUP_PROFILES.some(item => item.id === profileId) && <div>
          <button type="button" className="text-xs font-semibold text-blue-600 hover:underline" disabled={downloading} onClick={() => void downloadLegacyScript()}>
            {downloading ? "Preparando..." : "Baixar alternativa para PowerShell (.ps1)"}
          </button>
        </div>}
      </div>
      <div className="rounded-xl border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground"><MonitorCog size={17} /> Como usar</div>
        <ol className="list-inside list-decimal space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li>Instale o driver da impressora e conecte-a ao Windows.</li>
          <li>Baixe e abra o aplicativo. Autorize o administrador quando o Windows solicitar.</li>
          <li>Escolha a impressora detectada e confirme o modelo. Também existe a opção Personalizado.</li>
          <li>Confira largura e altura do papel em milímetros e clique em Configurar papel.</li>
          <li>Se necessário, selecione o papel nas preferências do driver e imprima pela Union.</li>
        </ol>
        {profile?.driverUrl && <a href={profile.driverUrl} target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
          Site oficial do driver · {profile.manufacturer} <ExternalLink size={13} />
        </a>}
      </div>
    </div>
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck size={17} className="mt-0.5 shrink-0 text-blue-600" />
      <span>O aplicativo não instala drivers nem modifica portas USB. Ele registra o papel no Windows, mas alguns drivers exigem selecionar esse papel em Preferências de impressão. O .exe não possui assinatura digital e pode exibir aviso do Windows SmartScreen.</span>
    </div>
  </AdminCard>;
}
