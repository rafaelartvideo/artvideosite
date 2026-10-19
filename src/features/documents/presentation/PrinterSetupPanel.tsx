import React, { useState } from "react";
import { Download, ExternalLink, MonitorCog, Printer, ShieldCheck } from "lucide-react";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminCard, BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { readOrderLabelLayout } from "@/features/orders/domain/order-label-print";
import { getOrderLabelPaper, preparePrinterScript, PRINTER_SETUP_PROFILES } from "../domain/printer-profiles";

export function PrinterSetupPanel() {
  const [profileId, setProfileId] = useState(PRINTER_SETUP_PROFILES[0]?.id ?? "");
  const [downloading, setDownloading] = useState(false);
  const profile = PRINTER_SETUP_PROFILES.find(item => item.id === profileId);
  const paper = getOrderLabelPaper(readOrderLabelLayout());

  async function downloadSetup() {
    if (!profile || downloading) return;
    setDownloading(true);
    try {
      // O navegador somente entrega o arquivo; nunca executa comandos no Windows.
      const filePath = import.meta.env.BASE_URL + "assets/crm/impressoras/configurar-impressora.ps1";
      const response = await fetch(filePath, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível obter o configurador do servidor.");
      const script = preparePrinterScript(await response.text(), profile, paper);
      // BOM UTF-8 evita caracteres ilegíveis no PowerShell 5.1 do Windows 10.
      const url = URL.createObjectURL(new Blob(["\uFEFF", script], { type: "text/plain;charset=utf-8" }));
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = "union-configurador-" + profile.id + ".ps1";
        document.body.appendChild(a);
        a.click();
        a.remove();
        notifyAdmin("Configurador baixado. Execute o arquivo no Windows para continuar.", "success");
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      }
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Falha ao baixar o configurador.", "error");
    } finally {
      setDownloading(false);
    }
  }

  return <AdminCard className="p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <span className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600"><Printer size={21} /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-black text-foreground">Configurar impressora</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Selecione um modelo e prepare o papel de impressão no Windows 10 ou 11. Outros modelos poderão ser cadastrados aqui.</p>
      </div>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Modelo da impressora</label>
          <AdminSelect value={profileId} onValueChange={setProfileId} options={PRINTER_SETUP_PROFILES.map(item => ({ value: item.id, label: item.label }))} />
        </div>
        {profile && <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-bold text-foreground">Tamanho do papel</p>
          <p className="mt-1 text-muted-foreground">{paper.widthMm.toLocaleString("pt-BR")} × {paper.heightMm.toLocaleString("pt-BR")} mm · {paper.formName}</p>
          <p className="mt-1 text-xs text-muted-foreground">Medidas da aba Etiquetas salvas neste navegador.</p>
        </div>}
        <BtnPrimary onClick={() => void downloadSetup()} loading={downloading} disabled={!profile}>
          <Download size={15} className="mr-2" /> Baixar configurador Windows
        </BtnPrimary>
      </div>
      <div className="min-w-0 rounded-xl border border-border p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground"><MonitorCog size={17} /> Como configurar</div>
        <ol className="list-inside list-decimal space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li>Instale o driver oficial e conecte a impressora.</li>
          <li>Baixe o configurador do modelo escolhido.</li>
          <li>No Windows, clique com o botão direito no .ps1 e selecione "Executar com PowerShell". Autorize o administrador, se solicitado.</li>
          <li>O programa localizará a impressora e pedirá confirmação para cadastrar o papel.</li>
          <li>Confira o papel nas preferências do driver e faça um teste pela Union.</li>
        </ol>
        {profile && <a href={profile.driverUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">Driver oficial da {profile.manufacturer} <ExternalLink size={13} /></a>}
      </div>
    </div>
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck size={17} className="mt-0.5 shrink-0 text-blue-600" />
      <span>O configurador não instala drivers nem altera outras impressoras. Cadastra o tamanho do papel no Windows; alguns drivers ainda exigem selecionar esse papel manualmente em "Preferências de impressão" ou "Stocks".</span>
    </div>
  </AdminCard>;
}
