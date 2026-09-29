import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { FInput, FIntegerInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  addPartnerMonitoredServiceType,
  createPartnerMonitoredServiceType,
  listPartnerServiceTypeMonitoring,
} from "../infrastructure/partner-companies.repository";

type Draft = {
  title: string;
  description: string;
  forecastDays: string;
};

const EMPTY_DRAFT: Draft = { title: "", description: "", forecastDays: "" };

export function PartnerCompanyOrderMonitoringSection({ organizationId }: { organizationId: string }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canView = hasPermission("orders.monitor.view") || hasPermission("orders.monitor.manage");
  const canManage = hasPermission("orders.monitor.manage");
  const [selectedExistingId, setSelectedExistingId] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [fieldError, setFieldError] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const query = useQuery({
    queryKey: ["partner-companies", organizationId, "order-monitoring"],
    enabled: canView,
    queryFn: () => listPartnerServiceTypeMonitoring(organizationId),
  });

  const types = query.data ?? [];
  const monitored = useMemo(() => types.filter(item => item.is_monitored), [types]);
  const available = useMemo(() => types.filter(item => !item.is_monitored), [types]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["partner-companies", organizationId, "order-monitoring"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceTypes.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
    ]);
  };

  const addExistingMutation = useMutation({
    mutationFn: () => addPartnerMonitoredServiceType(organizationId, selectedExistingId),
    onSuccess: async () => {
      setSelectedExistingId("");
      setToast({ msg: "Tipo adicionado ao monitoramento da Union.", type: "success" });
      await refresh();
    },
    onError: error => setToast({ msg: systemErrorMessage(error, "Não foi possível adicionar o tipo."), type: "error" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const title = draft.title.trim();
      const forecastDays = draft.forecastDays === "" ? null : Number(draft.forecastDays);
      if (!title) {
        setFieldError("Informe o nome do tipo de atendimento.");
        throw new Error("validation");
      }
      if (forecastDays !== null && (!Number.isInteger(forecastDays) || forecastDays < 0)) {
        setFieldError("A previsão deve ser informada em dias inteiros e não negativos.");
        throw new Error("validation");
      }
      return createPartnerMonitoredServiceType(organizationId, {
        title,
        description: draft.description.trim() || null,
        forecast_days: forecastDays,
      });
    },
    onSuccess: async () => {
      setDraft(EMPTY_DRAFT);
      setFieldError("");
      setToast({ msg: "Tipo criado e adicionado ao monitoramento.", type: "success" });
      await refresh();
    },
    onError: error => {
      if ((error as Error)?.message === "validation") return;
      setToast({ msg: systemErrorMessage(error, "Não foi possível criar o tipo monitorado."), type: "error" });
    },
  });

  if (!canView) return null;

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <AdminCard>
      <AdminCardHeader>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#0057e7]" />
            <h3 className="text-sm font-black text-[#0d1b2e]">Tipos de atendimento monitorados</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#5a6a82]">
            Somente OS vinculadas a estes tipos ficam visíveis no monitoramento da Union World.
          </p>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
        {query.isPending ? <LoadingState text="Carregando monitoramento..." /> : query.isError ? (
          <p className="text-sm font-semibold text-red-600">{systemErrorMessage(query.error, "Não foi possível carregar os tipos.")}</p>
        ) : monitored.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#0d1b2e]/15 bg-[#f8fafc] p-5 text-sm text-[#5a6a82]">
            Nenhum tipo está sendo monitorado. Enquanto isso, nenhuma OS desta empresa aparece na Union.
          </div>
        ) : (
          <div className="divide-y divide-[#0d1b2e]/8 rounded-xl border border-[#0d1b2e]/10">
            {monitored.map(item => <div key={item.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="font-bold text-[#0d1b2e]">{item.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#5a6a82]">{item.description || "Sem descrição"}</p>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#5a6a82]">
                <span>{item.forecast_days == null ? "Sem previsão" : `${item.forecast_days} ${item.forecast_days === 1 ? "dia" : "dias"}`}</span>
                <span className="rounded-full bg-[#eef5ff] px-2.5 py-1 text-[#0057e7]">Monitorado</span>
              </div>
            </div>)}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          Depois que um tipo entra no monitoramento, nome, descrição, previsão e status ficam protegidos. A empresa continua podendo configurar somente as situações e o SLA desse tipo.
        </div>
      </AdminCardContent>
    </AdminCard>

    {canManage && <AdminCard>
      <AdminCardHeader>
        <div>
          <h3 className="text-sm font-black text-[#0d1b2e]">Adicionar ao monitoramento</h3>
          <p className="mt-0.5 text-xs text-[#5a6a82]">Use um tipo já existente ou crie um novo diretamente para esta empresa.</p>
        </div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <FSelect
            label="Tipo existente"
            value={selectedExistingId}
            onChange={(event: any) => setSelectedExistingId(event.target.value)}
            options={[
              { value: "", label: available.length ? "Selecione um tipo" : "Nenhum tipo disponível" },
              ...available.map(item => ({ value: item.id, label: item.title })),
            ]}
            disabled={available.length === 0 || addExistingMutation.isPending}
          />
          <AdminButton
            onClick={() => addExistingMutation.mutate()}
            disabled={!selectedExistingId || addExistingMutation.isPending}
            loading={addExistingMutation.isPending}
            loadingText="Adicionando..."
          >
            Adicionar
          </AdminButton>
        </div>

        <div className="border-t border-[#0d1b2e]/8 pt-5">
          <div className="mb-4">
            <p className="text-sm font-bold text-[#0d1b2e]">Criar novo tipo monitorado</p>
            <p className="mt-1 text-xs leading-5 text-[#5a6a82]">O tipo já nasce vinculado a esta empresa e protegido pelo monitoramento.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FInput
              label="Nome do tipo"
              required
              error={fieldError}
              value={draft.title}
              onChange={(event: any) => {
                setFieldError("");
                setDraft(current => ({ ...current, title: event.target.value }));
              }}
              disabled={createMutation.isPending}
            />
            <FIntegerInput
              label="Previsão em dias"
              value={draft.forecastDays}
              onChange={(event: any) => {
                setFieldError("");
                setDraft(current => ({ ...current, forecastDays: event.target.value }));
              }}
              disabled={createMutation.isPending}
            />
            <div className="md:col-span-2">
              <FTextarea
                label="Descrição"
                value={draft.description}
                onChange={(event: any) => setDraft(current => ({ ...current, description: event.target.value }))}
                disabled={createMutation.isPending}
                rows={3}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <AdminButton
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              loading={createMutation.isPending}
              loadingText="Criando..."
            >
              <Plus size={15} /> Criar e monitorar
            </AdminButton>
          </div>
        </div>
      </AdminCardContent>
    </AdminCard>}
  </div>;
}
