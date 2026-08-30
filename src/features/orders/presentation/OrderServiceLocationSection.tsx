import type { Dispatch, SetStateAction } from "react";
import { formatZipCode } from "@/lib/address";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { OrderAddressSelect } from "./OrderFormControls";

type OrderType = "internal" | "external";

export function OrderServiceLocationSection({
  form,
  setForm,
  serviceUseCustomerAddress,
  setServiceUseCustomerAddress,
  setServiceCustomerAddressOverride,
  selectedServiceAddress,
  serviceAddressPreview,
  serviceAddressMessage,
  setServiceAddressMessage,
  ibgeStates,
  ibgeCities,
  ibgeStatesLoading,
  ibgeCitiesLoading,
  onFieldChange,
  clearServiceAddress,
  copyCustomerAddressToForm,
  loadIbgeCities,
}: {
  form: any;
  setForm: Dispatch<SetStateAction<any>>;
  serviceUseCustomerAddress: boolean;
  setServiceUseCustomerAddress: Dispatch<SetStateAction<boolean>>;
  setServiceCustomerAddressOverride: Dispatch<SetStateAction<boolean>>;
  selectedServiceAddress: any;
  serviceAddressPreview: any;
  serviceAddressMessage: string;
  setServiceAddressMessage: Dispatch<SetStateAction<string>>;
  ibgeStates: Array<{ sigla: string; nome: string }>;
  ibgeCities: Array<{ nome: string }>;
  ibgeStatesLoading: boolean;
  ibgeCitiesLoading: boolean;
  onFieldChange: (field: string, value: any) => void;
  clearServiceAddress: () => void;
  copyCustomerAddressToForm: (address: any) => void;
  loadIbgeCities: (state: string, preferredCity?: string) => Promise<any[]>;
}) {
  const upF = onFieldChange;
  return (
<Section title="Local do atendimento">
              <div className="space-y-4">
                <FSelect label="Tipo da OS" required value={form.order_type} onChange={(e: any) => {
                  const orderType = e.target.value as OrderType;
                  upF("order_type", orderType);
                  setServiceAddressMessage("");
                  if (orderType === "internal") { setServiceUseCustomerAddress(false); setServiceCustomerAddressOverride(false); clearServiceAddress(); }
                  else if (selectedServiceAddress) { setServiceUseCustomerAddress(true); setServiceCustomerAddressOverride(true); copyCustomerAddressToForm(selectedServiceAddress); }
                  else { setServiceUseCustomerAddress(false); setServiceAddressMessage("Este cliente não possui endereço cadastrado. Preencha o local do atendimento."); clearServiceAddress(); }
                }} options={[{ value: "internal", label: "Interna" }, { value: "external", label: "Externa" }]} />
                {form.order_type === "external" && <>
                  <label className="flex items-center gap-2 text-sm font-semibold text-[#0d1b2e]">
                    <input type="checkbox" checked={serviceUseCustomerAddress} onChange={event => {
                      if (event.target.checked && selectedServiceAddress) { setServiceUseCustomerAddress(true); setServiceCustomerAddressOverride(true); setServiceAddressMessage(""); copyCustomerAddressToForm(selectedServiceAddress); }
                      else if (event.target.checked) { setServiceUseCustomerAddress(false); setServiceAddressMessage("Este cliente não possui endereço cadastrado. Preencha o local do atendimento."); }
                      else { setServiceUseCustomerAddress(false); setServiceCustomerAddressOverride(false); setServiceAddressMessage(""); clearServiceAddress(); }
                    }} />
                    Usar endereço cadastrado do cliente
                  </label>
                  {serviceAddressMessage && <p className="text-xs text-[#5a6a82]">{serviceAddressMessage}</p>}
                  {serviceUseCustomerAddress && serviceAddressPreview ? <div className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3 text-xs text-[#5a6a82]">
                    <p className="mb-1 font-bold text-[#0d1b2e]">Endereço que será usado</p>
                    <p>{[serviceAddressPreview.zip_code, [serviceAddressPreview.street, serviceAddressPreview.number].filter(Boolean).join(", "), serviceAddressPreview.complement, serviceAddressPreview.neighborhood, [serviceAddressPreview.city, serviceAddressPreview.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ")}</p>
                  </div> : <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <FInput label="CEP" required value={form.service_zip_code} onChange={(e: any) => setForm(current => ({ ...current, service_zip_code: formatZipCode(e.target.value) }))} />
                      {ibgeCitiesLoading && <p className="mt-1 text-[10px] text-[#5a6a82]">Consultando endereço...</p>}
                      {serviceAddressMessage && <p className="mt-1 text-xs text-red-600">{serviceAddressMessage}</p>}
                      {!form.service_zip_code.trim() && <p className="mt-1 text-xs text-red-600">Informe o CEP.</p>}
                    </div>
                    <div>
                      <OrderAddressSelect label="Estado" value={form.service_state} disabled={ibgeStatesLoading} onChange={value => { upF("service_state", value); upF("service_city", ""); void loadIbgeCities(value); }} placeholder={ibgeStatesLoading ? "Carregando estados..." : "Selecionar estado..."} options={ibgeStates.map(state => ({ value: state.sigla, label: `${state.sigla} — ${state.nome}` }))} />
                      {!form.service_state.trim() && <p className="mt-1 text-xs text-red-600">Informe o estado.</p>}
                    </div>
                    <div>
                      <OrderAddressSelect label="Cidade" value={form.service_city} disabled={!form.service_state || ibgeCitiesLoading} onChange={value => upF("service_city", value)} placeholder={!form.service_state ? "Selecione o estado primeiro" : ibgeCitiesLoading ? "Carregando cidades..." : "Selecionar cidade..."} options={ibgeCities.map(city => ({ value: city.nome, label: city.nome }))} />
                      {!form.service_city.trim() && <p className="mt-1 text-xs text-red-600">Informe a cidade.</p>}
                    </div>
                    <FInput label="Bairro" value={form.service_neighborhood} onChange={(e: any) => upF("service_neighborhood", e.target.value)} />
                    <div className="sm:col-span-2 grid sm:grid-cols-[1fr_10rem] gap-4">
                      <div><FInput label="Rua" required value={form.service_street} onChange={(e: any) => upF("service_street", e.target.value)} />{!form.service_street.trim() && <p className="mt-1 text-xs text-red-600">Informe a rua.</p>}</div>
                      <div><FInput label="Número" required value={form.service_number} onChange={(e: any) => upF("service_number", e.target.value)} />{!form.service_number.trim() && <p className="mt-1 text-xs text-red-600">Informe o número.</p>}</div>
                    </div>
                    <div className="sm:col-span-2"><FInput label="Complemento" value={form.service_complement} onChange={(e: any) => upF("service_complement", e.target.value)} /></div>
                  </div>}
                </>}
              </div>
            </Section>
  );
}
