import { AdminPage } from "@/shared/ui/admin/AdminLayout";
import { OrderCustomerSection } from "@/features/orders/presentation/OrderCustomerSection";
import { OrderEquipmentSection } from "@/features/orders/presentation/OrderEquipmentSection";
import { OrderFormActions } from "@/features/orders/presentation/OrderFormActions";
import { OrderImagesField } from "@/features/orders/presentation/OrderImages";
import { OrderInformationSection } from "@/features/orders/presentation/OrderInformationSection";
import { OrderServiceLocationSection } from "@/features/orders/presentation/OrderServiceLocationSection";
import type { useOrderCustomerPersistence } from "@/features/orders/application/useOrderCustomerPersistence";
import type { useOrderCustomerSelection } from "@/features/orders/application/useOrderCustomerSelection";
import type { useOrderEditorWorkflow } from "@/features/orders/application/useOrderEditorWorkflow";
import type { useOrderFormState } from "@/features/orders/application/useOrderFormState";
import type { useOrderImages } from "@/features/orders/application/useOrderImages";
import type { useOrderServiceAddress } from "@/features/orders/application/useOrderServiceAddress";
import type { useOrdersWorkspace } from "@/features/orders/application/useOrdersWorkspace";

type PermissionCheck = (permission: string) => boolean;

interface OrderEditorPageProps {
  visible: boolean;
  saving: boolean;
  workspace: ReturnType<typeof useOrdersWorkspace>;
  formState: ReturnType<typeof useOrderFormState>;
  images: ReturnType<typeof useOrderImages>;
  customers: ReturnType<typeof useOrderCustomerSelection>;
  address: ReturnType<typeof useOrderServiceAddress>;
  customerPersistence: ReturnType<typeof useOrderCustomerPersistence>;
  hasPermission: PermissionCheck;
  getSituations: (
    serviceTypeId: string,
    currentSituationId?: string,
    currentSituation?: any,
  ) => any[];
  getSla: (
    serviceTypeId?: string,
    situationId?: string,
    relatedSituation?: any,
  ) => { hours: number; isDefault: boolean } | null;
  onSelectCustomer: ReturnType<typeof useOrderEditorWorkflow>["selectCustomer"];
  onSave: () => Promise<unknown>;
  onClose?: () => void;
}

export function OrderEditorPage({
  visible,
  saving,
  workspace,
  formState,
  images,
  customers,
  address,
  customerPersistence,
  hasPermission,
  getSituations,
  getSla,
  onSelectCustomer,
  onSave,
  onClose,
}: OrderEditorPageProps) {
  if (!visible) return null;

  const {
    equipmentTypes,
    equipmentBrands,
    equipmentModels,
    serviceTypes,
    serviceTypeSituations,
    generalServices,
    employees,
    situations,
  } = workspace;
  const {
    editingOS,
    selectedTechnicianIds,
    setSelectedTechnicianIds,
    selectedSellerIds,
    setSelectedSellerIds,
    setQuickEquipment,
    setQuickCustomer,
    form,
    setForm,
    needsScheduling,
    setNeedsScheduling,
    updateField,
    closeOrderForm,
  } = formState;
  const { orderImages, addOrderImages, removeOrderImage, setViewImage } = images;
  const closePage = onClose || closeOrderForm;
  const {
    customerSearch,
    customerResults,
    selectedCustomer,
    editingCustomer,
    setEditingCustomer,
    customerDraft,
    setCustomerDraft,
    customerAddressDraft,
    setCustomerAddressDraft,
    addressExpanded,
    setAddressExpanded,
    searchCustomers,
    clearCustomer,
  } = customers;
  const {
    serviceUseCustomerAddress,
    setServiceUseCustomerAddress,
    setServiceCustomerAddressOverride,
    serviceAddressMessage,
    setServiceAddressMessage,
    ibgeStates,
    ibgeStatesLoading,
    ibgeCities,
    ibgeCitiesLoading,
    selectedServiceAddress,
    serviceAddressPreview,
    clearServiceAddress,
    copyCustomerAddressToForm,
    loadIbgeCities,
  } = address;

  return (
    <AdminPage
      open
      onClose={closePage}
      breadcrumb={editingOS ? `Ordens de Serviço > OS #${editingOS.os_number || editingOS.id.slice(0, 8)}` : "Ordens de Serviço"}
      title={editingOS ? "Editar OS" : "Nova OS"}
      subtitle={editingOS ? "Atualize os dados do atendimento" : "Cadastre os dados do atendimento"}
      maxW="max-w-2xl"
      fullPage={Boolean(editingOS)}
    >
      <div className="p-5 space-y-5">
        <OrderCustomerSection
          selectedCustomer={selectedCustomer}
          editingCustomer={editingCustomer}
          customerDraft={customerDraft}
          customerAddressDraft={customerAddressDraft}
          saving={saving}
          editingOrder={Boolean(editingOS)}
          addressExpanded={addressExpanded}
          customerSearch={customerSearch}
          customerResults={customerResults}
          hasPermission={hasPermission}
          setCustomerDraft={setCustomerDraft}
          setCustomerAddressDraft={setCustomerAddressDraft}
          setEditingCustomer={setEditingCustomer}
          setAddressExpanded={setAddressExpanded}
          saveCustomer={() => { void customerPersistence.saveCustomer(); }}
          searchCustomers={(query) => { void searchCustomers(query); }}
          selectCustomer={onSelectCustomer}
          onClearCustomer={() => {
            clearCustomer();
            updateField("customer_id", "");
          }}
          onCreateCustomer={() => setQuickCustomer(true)}
        />

        <OrderEquipmentSection
          form={form}
          equipmentTypes={equipmentTypes}
          equipmentBrands={equipmentBrands}
          equipmentModels={equipmentModels}
          editing={Boolean(editingOS)}
          canCreate={hasPermission("equipment.create")}
          onFieldChange={updateField}
          onCreateEquipment={() => setQuickEquipment(true)}
        />

        <OrderServiceLocationSection
          form={form}
          setForm={setForm}
          serviceUseCustomerAddress={serviceUseCustomerAddress}
          setServiceUseCustomerAddress={setServiceUseCustomerAddress}
          setServiceCustomerAddressOverride={setServiceCustomerAddressOverride}
          selectedServiceAddress={selectedServiceAddress}
          serviceAddressPreview={serviceAddressPreview}
          serviceAddressMessage={serviceAddressMessage}
          setServiceAddressMessage={setServiceAddressMessage}
          ibgeStates={ibgeStates}
          ibgeCities={ibgeCities}
          ibgeStatesLoading={ibgeStatesLoading}
          ibgeCitiesLoading={ibgeCitiesLoading}
          onFieldChange={updateField}
          clearServiceAddress={clearServiceAddress}
          copyCustomerAddressToForm={copyCustomerAddressToForm}
          loadIbgeCities={loadIbgeCities}
        />

        <OrderImagesField
          images={orderImages}
          onAdd={addOrderImages}
          onRemove={removeOrderImage}
          onView={setViewImage}
          canEdit={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")}
        />

        <OrderInformationSection
          form={form}
          editingOrder={editingOS}
          serviceTypes={serviceTypes}
          serviceTypeSituations={serviceTypeSituations}
          generalServices={generalServices}
          employees={employees}
          selectedTechnicianIds={selectedTechnicianIds}
          selectedSellerIds={selectedSellerIds}
          canAssign={hasPermission("orders.assign")}
          situations={situations}
          needsScheduling={needsScheduling}
          setNeedsScheduling={setNeedsScheduling}
          onFieldChange={updateField}
          onTechniciansChange={setSelectedTechnicianIds}
          onSellersChange={setSelectedSellerIds}
          getSituations={getSituations}
          getSla={getSla}
        />

        {hasPermission("orders.section.images") && (
          <OrderImagesField
            images={orderImages}
            onAdd={addOrderImages}
            onRemove={removeOrderImage}
            onView={setViewImage}
            canEdit={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")}
          />
        )}
      </div>

      <OrderFormActions
        saving={saving}
        canSave={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")}
        onCancel={closePage}
        onSave={() => { void onSave(); }}
      />
    </AdminPage>
  );
}
