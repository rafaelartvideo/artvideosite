import { ExternalLink, PanelTop, X } from "lucide-react";
import { AdminDialog, AdminPage, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { useAuth } from "@/lib/auth";
import { useOrganizationOrderRules } from "../application/useOrganizationOrderRules";
import { defaultRules, resolveRules, type RuleSet } from "../domain/order-rules";
import { OrderCustomValues } from "./OrderCustomValues";
import { OrderCustomerSection } from "@/features/orders/presentation/OrderCustomerSection";
import { OrderEquipmentSection } from "@/features/orders/presentation/OrderEquipmentSection";
import { OrderFormActions } from "@/features/orders/presentation/OrderFormActions";
import { OrderInformationSection } from "@/features/orders/presentation/OrderInformationSection";
import { OrderMobileEditBridge } from "@/features/orders/presentation/OrderMobileEditBridge";
import { OrderServiceLocationSection } from "@/features/orders/presentation/OrderServiceLocationSection";
import type { useOrderCustomerPersistence } from "@/features/orders/application/useOrderCustomerPersistence";
import type { useOrderCustomerSelection } from "@/features/orders/application/useOrderCustomerSelection";
import type { useOrderEditorWorkflow } from "@/features/orders/application/useOrderEditorWorkflow";
import type { useOrderFormState } from "@/features/orders/application/useOrderFormState";
import type { useOrderImages } from "@/features/orders/application/useOrderImages";
import type { useOrderServiceAddress } from "@/features/orders/application/useOrderServiceAddress";
import type { useOrdersWorkspace } from "@/features/orders/application/useOrdersWorkspace";
type PermissionCheck = (permission: string) => boolean;
interface OrderEditorPageProps { initialIntake?: import("../intake/order-intake.repository").IntakePrefill | null; visible: boolean; saving: boolean; workspace: ReturnType<typeof useOrdersWorkspace>; formState: ReturnType<typeof useOrderFormState>; images: ReturnType<typeof useOrderImages>; customers: ReturnType<typeof useOrderCustomerSelection>; address: ReturnType<typeof useOrderServiceAddress>; customerPersistence: ReturnType<typeof useOrderCustomerPersistence>; hasPermission: PermissionCheck; getSituations: (serviceTypeId: string,currentSituationId?: string,currentSituation?: any) => any[]; getSla: (serviceTypeId?: string,situationId?: string,relatedSituation?: any) => { hours: number; isDefault: boolean } | null; onSelectCustomer: ReturnType<typeof useOrderEditorWorkflow>["selectCustomer"]; onSave: () => Promise<unknown>; onClose?: () => void; embeddedDialog?: boolean; preparingEmbedded?: boolean; detached?: boolean; onDetach?: () => void; onReintegrate?: () => void; onDraftInteraction?: () => void; }
export function OrderEditorPage({ initialIntake, visible,saving,workspace,formState,images,customers,address,customerPersistence,hasPermission,getSituations,getSla,onSelectCustomer,onSave,onClose,embeddedDialog = false,preparingEmbedded = false,detached = false,onDetach,onReintegrate,onDraftInteraction }: OrderEditorPageProps) {
  const { activeOrganizationId } = useAuth();
  const orderRulesQuery = useOrganizationOrderRules(activeOrganizationId);
  const rules:RuleSet=formState.editingOS?((formState.editingOS.order_rules_snapshot as RuleSet|null)||defaultRules):resolveRules(orderRulesQuery.data||[],formState.form.service_type_id,formState.form.equipment_type_id);
  if (!visible) return null;
  const { equipmentTypes,equipmentBrands,equipmentModels,serviceTypes,serviceTypeSituations,employees,situations } = workspace;
  const { editingOS,selectedTechnicianIds,setSelectedTechnicianIds,selectedSellerIds,setSelectedSellerIds,setQuickEquipment,setQuickCustomer,form,setForm,needsScheduling,setNeedsScheduling,hasAccessories,setHasAccessories,updateField,closeOrderForm } = formState;
  const { orderImages,addOrderImages,removeOrderImage,setViewImage } = images;
  const isDisposal = serviceTypes.some((type: any) => type.id === form.service_type_id && type.is_disposal === true);
  const closePage = () => { if (saving) return; (onClose || closeOrderForm)(); };
  const technicalFields = workspace.technicalFieldLinks.filter((link:any)=>link.equipment_type_id===form.equipment_type_id).map((link:any)=>({...link,technical_field:link.technical_field||workspace.technicalFields.find((field:any)=>field.id===link.technical_field_id)})).filter((link:any)=>Boolean(editingOS)||link.technical_field?.is_active!==false);
  const { customerSearch,customerResults,customerSearchLoading,customerSearchError,selectingCustomer,customerSelectionError,cancelSearchSelection,selectSearchCustomer,retryCustomerSearch,selectedCustomer,editingCustomer,setEditingCustomer,customerDraft,setCustomerDraft,customerAddressDraft,setCustomerAddressDraft,addressExpanded,setAddressExpanded,searchCustomers,clearCustomer } = customers;
  const { serviceUseCustomerAddress,setServiceUseCustomerAddress,setServiceCustomerAddressOverride,serviceAddressMessage,setServiceAddressMessage,ibgeStates,ibgeStatesLoading,ibgeCities,ibgeCitiesLoading,customerAddresses,selectedServiceAddress,serviceAddressPreview,clearServiceAddress,copyCustomerAddressToForm,selectServiceAddress,loadIbgeCities } = address;
  const canAddEquipmentImages=editingOS?hasPermission("orders.edit"):hasPermission("orders.create"); const canRemoveEquipmentImage=(image:(typeof orderImages)[number])=>canAddEquipmentImages&&(!editingOS||!image.mediaId);
  const serviceLocationSection=<OrderServiceLocationSection form={form} setForm={setForm} serviceUseCustomerAddress={serviceUseCustomerAddress} setServiceUseCustomerAddress={setServiceUseCustomerAddress} setServiceCustomerAddressOverride={setServiceCustomerAddressOverride} selectedServiceAddress={selectedServiceAddress} serviceAddressPreview={serviceAddressPreview} serviceAddressMessage={serviceAddressMessage} setServiceAddressMessage={setServiceAddressMessage} ibgeStates={ibgeStates} ibgeCities={ibgeCities} ibgeStatesLoading={ibgeStatesLoading} ibgeCitiesLoading={ibgeCitiesLoading} onFieldChange={updateField} clearServiceAddress={clearServiceAddress} copyCustomerAddressToForm={copyCustomerAddressToForm} loadIbgeCities={loadIbgeCities}/>;
  const editorBody = preparingEmbedded ? null : <>
    <div className="p-5 space-y-5" onChangeCapture={onDraftInteraction} onClickCapture={event=>{const target=event.target as Element; if(target.closest?.("button, [role=option], [role=combobox], [role=checkbox]"))onDraftInteraction?.();}}>
      {initialIntake&&<div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm"><p className="font-semibold text-primary">Pré-OS recebida pelo WhatsApp</p><p className="text-xs text-muted-foreground">Confira os dados preenchidos pelo cliente e complete as informações internas antes de criar a OS.</p>{initialIntake.customerNotice&&<p className="text-xs text-amber-700 dark:text-amber-400">{initialIntake.customerNotice}</p>}{!selectedCustomer&&initialIntake.customerDraft&&<div className="space-y-1"><p className="font-medium">{initialIntake.customerDraft.values.full_name} · {initialIntake.customerDraft.values.phone}</p><p className="text-xs text-muted-foreground">Use Cadastrar cliente para conferir e salvar os dados recebidos.</p></div>}{(!form.equipment_brand_id||!form.equipment_model_id)&&<p className="text-xs text-amber-700 dark:text-amber-400">Equipamento informado: {initialIntake.payload.type_name} · {initialIntake.payload.brand_name||initialIntake.payload.brand_text} · {initialIntake.payload.model}. Selecione ou cadastre a marca/modelo no catálogo.</p>}</div>}
      <OrderCustomerSection hideAddress={isDisposal} selectedCustomer={selectedCustomer} editingCustomer={editingCustomer} customerDraft={customerDraft} customerAddressDraft={customerAddressDraft} customerFieldErrors={customerPersistence.customerFieldErrors} clearCustomerFieldError={customerPersistence.clearCustomerFieldError} saving={saving} editingOrder={Boolean(editingOS)} addressExpanded={addressExpanded} customerSearch={customerSearch} customerResults={customerResults} customerSearchLoading={customerSearchLoading} customerSearchError={customerSearchError} selectingCustomer={selectingCustomer} customerSelectionError={customerSelectionError} cancelSearchSelection={cancelSearchSelection} retryCustomerSearch={retryCustomerSearch} hasPermission={hasPermission} serviceCustomerAddresses={customerAddresses} selectedServiceAddress={selectedServiceAddress} setCustomerDraft={setCustomerDraft} setCustomerAddressDraft={setCustomerAddressDraft} setEditingCustomer={setEditingCustomer} setAddressExpanded={setAddressExpanded} saveCustomer={customerPersistence.saveCustomer} searchCustomers={query=>{void searchCustomers(query);}} selectCustomer={customer=>{void selectSearchCustomer(customer.id,onSelectCustomer);}} selectServiceAddress={selectServiceAddress} onClearCustomer={()=>{clearCustomer();updateField("customer_id","");clearServiceAddress();}} onCreateCustomer={()=>setQuickCustomer(true)}/>
      <OrderEquipmentSection intakeMode={Boolean(initialIntake)} disposalMode={isDisposal} form={form} rules={rules} equipmentTypes={equipmentTypes} equipmentBrands={equipmentBrands} equipmentModels={equipmentModels} technicalFields={technicalFields} technicalValues={form.technicalValues} technicalHistory={form.technicalHistory} onTechnicalValueChange={(fieldId,value)=>setForm(current=>({...current,technicalValues:{...current.technicalValues,[fieldId]:value}}))} orderId={editingOS?.id} unlockCanManage={hasPermission("orders.unlock.manage")} unlockCanView={hasPermission("orders.unlock.view")} onUnlockUpdate={patch=>setForm(current=>({...current,...patch}))} editing={Boolean(editingOS)} canCreate={hasPermission("equipment.create")} onFieldChange={updateField} onCreateEquipment={()=>setQuickEquipment(true)} images={orderImages} onAddImages={addOrderImages} onRemoveImage={removeOrderImage} onViewImage={setViewImage} showImages={!isDisposal && (hasPermission("orders.section.images") || (!editingOS && hasPermission("orders.create")))} canAddImages={canAddEquipmentImages} canRemoveImages={canRemoveEquipmentImage}/>
      {editingOS&&!isDisposal&&serviceLocationSection}
      <OrderInformationSection isDisposal={isDisposal} form={form} rules={rules} editingOrder={editingOS} serviceTypes={serviceTypes} serviceTypeSituations={serviceTypeSituations} employees={employees} employeesLoading={workspace.loading} selectedTechnicianIds={selectedTechnicianIds} selectedSellerIds={selectedSellerIds} canAssign={hasPermission("orders.assign")} situations={situations} needsScheduling={needsScheduling} setNeedsScheduling={setNeedsScheduling} hasAccessories={hasAccessories} setHasAccessories={setHasAccessories} onFieldChange={updateField} onTechniciansChange={setSelectedTechnicianIds} onSellersChange={setSelectedSellerIds} getSituations={getSituations} getSla={getSla}/>
      {!isDisposal && <OrderCustomValues fields={rules.custom_fields} values={form.custom_field_values||{}} editing={Boolean(editingOS)} orderId={editingOS?.id} organizationId={activeOrganizationId} canUpload={Boolean(editingOS && hasPermission("orders.edit") && hasPermission("orders.section.images"))} onChange={value=>updateField("custom_field_values",value)}/>}
      {!editingOS&&!isDisposal&&serviceLocationSection}
    </div>
  </>;
  const editorActions = <OrderFormActions saving={saving} canSave={editingOS?hasPermission("orders.edit"):hasPermission("orders.create")} editing={Boolean(editingOS)} onCancel={closePage} onSave={onSave} inDialog={embeddedDialog} rightActions={editingOS && hasPermission("orders.edit") ? <OrderMobileEditBridge orderId={editingOS.id} osNumber={editingOS.os_number} disabled={saving}/> : undefined}/>;
  // Reutiliza exatamente as mesmas sections/campos/regras do editor de OS.
  // A janela secundária não desenha backdrop porque o WhatsApp já o possui.
  if (embeddedDialog && detached) return <section data-order-editor-detached="true" className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
      <div><h2 className="text-base font-bold">Nova OS</h2><p className="text-xs text-muted-foreground">Cadastre os dados do atendimento</p></div>
      <div className="flex items-center gap-1">
        <AdminIconButton ariaLabel="Reintegrar janela" title="Voltar ao CRM" onClick={onReintegrate} disabled={saving}><PanelTop size={16}/></AdminIconButton>
        <AdminIconButton ariaLabel="Fechar Nova OS" title="Fechar" onClick={closePage} disabled={saving}><X size={16}/></AdminIconButton>
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{preparingEmbedded ? <p role="status" className="p-5 text-sm text-muted-foreground">Carregando Nova OS...</p> : editorBody}</div>
    {!preparingEmbedded && <div className="shrink-0 border-t border-border bg-card px-5 py-3">{editorActions}</div>}
  </section>;
  if (embeddedDialog) return <AdminDialog
    open onClose={closePage} title="Nova OS" description="Cadastre os dados do atendimento"
    draggable floating modal showOverlay={false} minimizable={!saving} minimizedTitle="Nova OS" minimizedDescription={selectedCustomer?.full_name || selectedCustomer?.trade_name || "Cadastro em andamento"} nestedScrollAssist
    headerActions={onDetach && <AdminIconButton ariaLabel="Destacar janela" title="Destacar janela" className="hidden md:inline-flex" onClick={onDetach} disabled={saving || preparingEmbedded}><ExternalLink size={15}/></AdminIconButton>}
    preparing={preparingEmbedded} preparingText="Carregando Nova OS..."
    className="!h-[min(78dvh,760px)] !w-[calc(100vw-1rem)] !max-w-[930px] sm:!w-[calc(100vw-2rem)] max-md:!h-[calc(100dvh-var(--admin-shell-header-height,4rem)-0.5rem)]"
    bodyClassName="!min-h-0 !min-w-0 !flex-1 !overflow-y-auto !overscroll-contain !p-0 [scrollbar-gutter:stable] [touch-action:pan-y]"
    footerClassName="!border-t !border-border !bg-card !px-5 !py-3" footer={editorActions}
  >{editorBody}</AdminDialog>;
  return <AdminPage open onClose={closePage} breadcrumb={editingOS?`Ordens de Serviço > OS #${editingOS.os_number||editingOS.id.slice(0,8)}`:"Ordens de Serviço"} title={editingOS?"Editar OS":"Nova OS"} subtitle={editingOS?"Atualize os dados do atendimento":"Cadastre os dados do atendimento"} maxW="max-w-2xl" fullPage={Boolean(editingOS)} smoothMotion={false}>
    {editorBody}
    {editorActions}
  </AdminPage>;
}

