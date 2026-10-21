import { useCallback, useEffect, useRef, useState } from "react";
import { AdminPage, Section } from "@/shared/ui/admin/AdminLayout";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { useAuth } from "@/lib/auth";
import { useOrdersWorkspace } from "@/features/orders/application/useOrdersWorkspace";
import { useOrderCustomerSelection } from "@/features/orders/application/useOrderCustomerSelection";
import { useOrderCustomerPersistence } from "@/features/orders/application/useOrderCustomerPersistence";
import { useOrderImages } from "@/features/orders/application/useOrderImages";
import { OrderCustomerSection } from "@/features/orders/presentation/OrderCustomerSection";
import { OrderEquipmentSection } from "@/features/orders/presentation/OrderEquipmentSection";
import { OrderFormActions } from "@/features/orders/presentation/OrderFormActions";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import { QuickEquipmentModal } from "@/features/orders/presentation/OrderQuickCreateModals";
import { OrderImageLightbox } from "@/features/orders/presentation/OrderImages";
import { QuoteCommercialEditor } from "./QuoteCommercialEditor";
import {
  emptyInternalQuote, listInternalQuoteItems, saveInternalQuote,
  type InternalQuoteDraft, type QuoteLineDraft,
} from "../infrastructure/internal-quotes.repository";
import {
  loadQuoteEquipmentImages, uploadQuoteEquipmentImage, deleteQuoteEquipmentImage,
} from "../infrastructure/quote-equipment-images.repository";

type Props = {
  organizationId: string;
  quote?: any | null;
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function InternalQuoteEditor({ organizationId, quote, onClose, onSaved }: Props) {
  const { hasPermission } = useAuth();
  const [draft, setDraft] = useState<InternalQuoteDraft>(emptyInternalQuote);
  const [items, setItems] = useState<QuoteLineDraft[]>([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(Boolean(quote));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [quickCustomer, setQuickCustomer] = useState(false);
  const [quickEquipment, setQuickEquipment] = useState(false);
  const [selectedServiceAddress, setSelectedServiceAddress] = useState<any>(null);
  const originalImages = useRef<Set<string>>(new Set());
  const quoteId = quote?.id || null;
  const editable = !quote || ["RASCUNHO", "PENDENTE", "EM_ANALISE", "RENEGOCIACAO"]
    .includes(quote.request_status?.slug);
  const showToast = useCallback((feedback: {msg: string; type: "success" | "error"}) =>
    setError(feedback.type === "error" ? feedback.msg : ""), []);

  const workspace = useOrdersWorkspace({ showToast, organizationIdOverride: organizationId });
  const customer = useOrderCustomerSelection(organizationId);
  const images = useOrderImages();
  const customerPersistence = useOrderCustomerPersistence({
    selectedCustomer: customer.selectedCustomer,
    setSelectedCustomer: customer.setSelectedCustomer,
    setEditingCustomer: customer.setEditingCustomer,
    customerDraft: customer.customerDraft,
    customerAddressDraft: customer.customerAddressDraft,
    setAddressExpanded: customer.setAddressExpanded,
    setSaving,
    hasPermission,
    showToast,
    organizationIdOverride: organizationId,
  });

  const updateField = (key: keyof InternalQuoteDraft, value: any) =>
    setDraft(current => ({ ...current, [key]: value }));
  const selectCustomer = (value: any) => {
    const address = customer.selectCustomer(value);
    setSelectedServiceAddress(address);
    updateField("customer_id", value.id);
  };

  useEffect(() => {
    if (!quoteId) return;
    let active = true;
    setLoading(true);
    const initial = emptyInternalQuote();
    setDraft({
      ...initial,
      ...Object.fromEntries(Object.keys(initial).map(key => [
        key, quote[key] ?? initial[key as keyof InternalQuoteDraft],
      ])),
      customer_id: quote.customer_id || "",
      equipment_type_id: quote.equipment_type_id || "",
      equipment_brand_id: quote.equipment_brand_id || "",
      equipment_model_id: quote.equipment_model_id || "",
      technical_values: quote.technical_values && typeof quote.technical_values === "object" ? quote.technical_values : {},
      valid_until: quote.valid_until || "",
      discount_type: quote.discount_type === "percentage" ? "percentage" : "amount",
      discount_value: Number(quote.discount_value || 0),
    } as InternalQuoteDraft);
    if (quote.customer) {
      const address = customer.hydrateCustomer(quote.customer);
      setSelectedServiceAddress(address);
    }
    void Promise.all([
      listInternalQuoteItems(organizationId, quoteId),
      loadQuoteEquipmentImages(organizationId, quoteId),
    ]).then(([rows, photos]) => {
      if (!active) return;
      setItems(rows);
      originalImages.current = new Set(photos.map(photo => photo.key));
      images.replaceOrderImages(photos);
    }).catch(err => {
      if (active) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [quoteId, organizationId]);

  const technicalFields = workspace.technicalFieldLinks
    .filter((link:any) => link.equipment_type_id === draft.equipment_type_id)
    .map((link:any) => ({
      ...link,
      technical_field: link.technical_field ||
        workspace.technicalFields.find((field:any) => field.id === link.technical_field_id),
    }))
    .filter((link:any) => link.technical_field?.is_active !== false);

  const save = async () => {
    if (saving || !editable) return;
    setError("");
    if (!organizationId || !draft.customer_id) {
      setError("Selecione um cliente cadastrado para criar o orçamento.");
      return;
    }
    if (workspace.loading) {
      setError("Aguarde os dados de equipamentos carregarem.");
      return;
    }
    for (const relation of technicalFields) {
      const value = String(draft.technical_values?.[relation.technical_field_id] || "").trim();
      if (relation.required && !value) {
        setError("Informe o campo técnico: " + (relation.technical_field?.label || "campo obrigatório"));
        return;
      }
      if (relation.technical_field?.field_type === "number" && value &&
        !Number.isFinite(Number(value.replace(",",".")))) {
        setError("O campo " + relation.technical_field.label + " precisa ser numérico.");
        return;
      }
    }
    const subtotal = items.reduce((sum,item) =>
      sum + item.quantity * Number(item.unit_price || 0) + Number(item.additional_cost || 0),0);
    if (draft.discount_value < 0 || (draft.discount_type === "percentage" && draft.discount_value > 100) ||
      (draft.discount_type === "amount" && draft.discount_value > subtotal)) {
      setError("Confira o valor do desconto do orçamento.");
      return;
    }
    if (items.some(item => !item.title_snapshot.trim() || item.quantity < 1 || !Number.isInteger(item.quantity))) {
      setError("Revise o nome e a quantidade dos produtos e serviços.");
      return;
    }
    setSaving(true);
    try {
      const id = await saveInternalQuote({ organizationId, quoteId, draft, items, comment });
      for (const image of images.orderImages) {
        if (image.file) await uploadQuoteEquipmentImage(organizationId,id,image);
      }
      for (const imageId of originalImages.current) {
        if (!images.orderImages.some(image => image.key === imageId)) {
          await deleteQuoteEquipmentImage(organizationId,id,imageId);
        }
      }
      onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o orçamento.");
    } finally {
      setSaving(false);
    }
  };

  return <AdminPage open onClose={onClose}
    breadcrumb={quote ? "Orçamentos > Editar" : "Orçamentos > Novo"}
    title={quote ? "Editar orçamento " + quote.protocol : "Novo orçamento"}
    subtitle="Cadastre o atendimento e prepare a proposta. A OS será criada somente após aprovação."
    maxW="max-w-6xl"
    fullPage={Boolean(quote)}
  >
    {loading ? <div className="p-8"><LoadingState /></div> :
      <div className="space-y-5 p-5">
        {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</div>}

        <OrderCustomerSection
          selectedCustomer={customer.selectedCustomer}
          editingCustomer={customer.editingCustomer}
          customerDraft={customer.customerDraft}
          customerAddressDraft={customer.customerAddressDraft}
          customerFieldErrors={customerPersistence.customerFieldErrors}
          clearCustomerFieldError={customerPersistence.clearCustomerFieldError}
          saving={saving}
          editingOrder={false}
          addressExpanded={customer.addressExpanded}
          customerSearch={customer.customerSearch}
          customerResults={customer.customerResults}
          hasPermission={hasPermission}
          serviceCustomerAddresses={customer.selectedCustomer?.addresses || []}
          selectedServiceAddress={selectedServiceAddress}
          setCustomerDraft={customer.setCustomerDraft}
          setCustomerAddressDraft={customer.setCustomerAddressDraft}
          setEditingCustomer={customer.setEditingCustomer}
          setAddressExpanded={customer.setAddressExpanded}
          saveCustomer={customerPersistence.saveCustomer}
          searchCustomers={query => { void customer.searchCustomers(query); }}
          selectCustomer={selectCustomer}
          selectServiceAddress={setSelectedServiceAddress}
          onClearCustomer={() => {
            customer.clearCustomer();
            updateField("customer_id", "");
            setSelectedServiceAddress(null);
          }}
          onCreateCustomer={() => setQuickCustomer(true)}
        />

        <OrderEquipmentSection
          mode="quote"
          form={{...draft, technicalValues:draft.technical_values, technicalHistory: []}}
          equipmentTypes={workspace.equipmentTypes}
          equipmentBrands={workspace.equipmentBrands}
          equipmentModels={workspace.equipmentModels}
          technicalFields={technicalFields}
          technicalValues={draft.technical_values}
          technicalHistory={[]}
          onTechnicalValueChange={(fieldId,value) =>
            setDraft(current => ({
              ...current,
              technical_values: {...current.technical_values,[fieldId]:value},
            }))}
          editing={false}
          canCreate={hasPermission("equipment.create")}
          onFieldChange={(key,value) => updateField(key === "technicalValues" ? "technical_values" : key as keyof InternalQuoteDraft,value)}
          onCreateEquipment={() => setQuickEquipment(true)}
          images={images.orderImages}
          onAddImages={images.addOrderImages}
          onRemoveImage={images.removeOrderImage}
          onViewImage={images.setViewImage}
          showImages
          canAddImages={editable}
          canRemoveImages={editable}
        />

        <Section title="Informações do orçamento">
          <div className="grid gap-4">
            {([
              ["issue_reported","Descrição do problema","Relate o problema informado pelo cliente"],
              ["diagnosis","Diagnóstico","Registre a avaliação técnica"],
              ["proposed_solution","Solução proposta","Descreva o serviço previsto se aprovado"],
              ["accessories","Acessórios","Controle, fonte, cabos e outros acessórios recebidos"],
              ["equipment_condition","Condição de entrada","Registre avarias e estado do equipamento"],
              ["internal_notes","Observações internas","Estas informações não aparecerão no documento do cliente"],
            ] as const).map(([key,label,placeholder]) =>
              <FTextarea key={key} label={label} rows={3} value={draft[key]} disabled={!editable}
                placeholder={placeholder} onChange={(event:any) => updateField(key,event.target.value)}/>)}
          </div>
        </Section>

        <QuoteCommercialEditor organizationId={organizationId}
          items={items} onItemsChange={setItems} draft={draft}
          onDraftChange={updateField} disabled={!editable}/>

        {editable && <Section title="Comentário" description="Registre informações ou observações da negociação ao salvar.">
          <FTextarea rows={3} value={comment} onChange={(event:any) => setComment(event.target.value)}
            placeholder="Adicione um comentário ao histórico do orçamento..."/>
        </Section>}
      </div>
    }

    <OrderFormActions saving={saving} canSave={editable && !loading}
      onCancel={onClose} onSave={save}/>

    {quickCustomer && <QuickCustomerModal onClose={() => setQuickCustomer(false)}
      onSaved={selectCustomer}/>}

    {quickEquipment && <QuickEquipmentModal
      onClose={() => setQuickEquipment(false)}
      technicalFields={workspace.technicalFields}
      technicalFieldLinks={workspace.technicalFieldLinks}
      equipmentTypes={workspace.equipmentTypes}
      equipmentBrands={workspace.equipmentBrands}
      equipmentModels={workspace.equipmentModels}
      initialTypeId={draft.equipment_type_id}
      initialBrandId={draft.equipment_brand_id}
      onSaved={({type,brand,model}) => {
        workspace.setEquipmentTypes(current => current.some((item:any) => item.id === type.id) ? current : [...current,type]);
        if (brand) workspace.setEquipmentBrands(current => current.some((item:any) => item.id === brand.id) ? current : [...current,brand]);
        if (model) workspace.setEquipmentModels(current => current.some((item:any) => item.id === model.id) ? current : [...current,model]);
        setDraft(current => ({
          ...current,
          equipment_type_id: type.id,
          equipment_brand_id: brand?.id || "",
          equipment_model_id: model?.id || "",
          technical_values: current.equipment_type_id === type.id ? current.technical_values : {},
        }));
        void workspace.reloadWorkspace();
      }}
    />}

    {images.viewImage && <OrderImageLightbox context="quote" image={images.viewImage}
      onClose={() => images.setViewImage(null)}/>}
  </AdminPage>;
}
