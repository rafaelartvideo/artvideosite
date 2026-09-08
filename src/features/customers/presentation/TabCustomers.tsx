import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { useCustomersController } from "../application/useCustomersController";
import { CreateCustomerPage } from "./CreateCustomerPage";
import { CustomerDetailsPage } from "./CustomerDetailsPage";
import { CustomersList } from "./CustomersList";
import { PartnerCustomersList } from "./PartnerCustomersList";

type SharedAccessMode = "default" | "read";

type TabCustomersProps = {
  onOpenOrder?: (id: string, customerId?: string) => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId?: string | null, subpage?: string | null) => void;
  organizationIdOverride?: string | null;
  accessMode?: SharedAccessMode;
};

export function TabCustomers({
  onOpenOrder,
  routeResourceId,
  routeSubpage,
  onRouteChange,
  organizationIdOverride,
  accessMode = "default",
}: TabCustomersProps) {
  const { hasPermission, activeOrganizationId } = useAuth();
  const sharedReadOnly = accessMode === "read";
  const organizationId = organizationIdOverride || activeOrganizationId;

  const canViewTable = hasPermission("customers.table.view");
  const canViewDetails = hasPermission("customers.details.view");
  const canCreate = !sharedReadOnly && hasPermission("customers.create");
  const canEdit = !sharedReadOnly && hasPermission("customers.edit");
  const canViewAddress = hasPermission("customers.addresses.view");
  const canEditAddress = !sharedReadOnly && hasPermission("customers.addresses.edit");
  const canViewQuotes = !sharedReadOnly && hasPermission("quotes.view");
  const canViewOrders = !sharedReadOnly && hasPermission("orders.view");
  const canOpenOrders = !sharedReadOnly && hasPermission("orders.details.view");

  const { list, details, creation, toast, setToast } = useCustomersController({
    organizationId,
    canCreate,
    canEdit,
    canEditAddress,
    loadRelatedHistory: !sharedReadOnly,
  });

  useEffect(() => {
    if (!routeResourceId) { if (creation.open) creation.closePage(); if (details.detail) details.close(); return; }
    if (routeResourceId === "new") { if (canCreate && !creation.open) creation.openPage(); if (details.detail) details.close(); return; }
    if (!canViewDetails) return;
    const customer = list.customers.find((item: any) => item.id === routeResourceId);
    if (!customer || details.detail?.id === customer.id) { if (details.detail && routeSubpage === "edit" && canEdit && !details.editingData) details.setEditingData(true); return; }
    void details.open(customer).then(() => { if (routeSubpage === "edit" && canEdit) details.setEditingData(true); });
  }, [routeResourceId, routeSubpage, list.customers, details.detail?.id, canCreate, canViewDetails, canEdit, organizationId]);

  const closeRoute = () => onRouteChange?.(null, null);
  const openCustomerDetail = (customer: any) => {
    if (!canViewDetails) return;
    if (onRouteChange) onRouteChange(customer.id, null);
    else void details.open(customer);
  };

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    {!routeResourceId && canViewTable && (sharedReadOnly ? <PartnerCustomersList
      customers={list.customers}
      filtered={list.filtered}
      pagedCustomers={list.pagedCustomers}
      loading={list.loading}
      nameSearch={list.nameSearch}
      documentSearch={list.documentSearch}
      orderSort={list.orderSort}
      safePage={list.safePage}
      pageSize={list.pageSize}
      totalPages={list.totalPages}
      onNameSearchChange={list.setNameSearch}
      onDocumentSearchChange={list.setDocumentSearch}
      onOrderSortChange={list.setOrderSort}
      onClearFilters={list.clearFilters}
      onPageChange={list.setPage}
      onPageSizeChange={list.setPageSize}
      onOpenDetail={openCustomerDetail}
    /> : <CustomersList
      customers={list.customers}
      filtered={list.filtered}
      pagedCustomers={list.pagedCustomers}
      loading={list.loading}
      nameSearch={list.nameSearch}
      documentSearch={list.documentSearch}
      selectedStates={list.selectedStates}
      selectedCities={list.selectedCities}
      orderSort={list.orderSort}
      stateOptions={list.stateOptions}
      cityOptions={list.cityOptions}
      hasFilters={list.hasFilters}
      page={list.page}
      safePage={list.safePage}
      pageSize={list.pageSize}
      totalPages={list.totalPages}
      canCreate={canCreate}
      canDelete={false}
      onNameSearchChange={list.setNameSearch}
      onDocumentSearchChange={list.setDocumentSearch}
      onStateToggle={(value) => list.setSelectedStates(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])}
      onCityToggle={(value) => list.setSelectedCities(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])}
      onOrderSortChange={list.setOrderSort}
      onClearFilters={list.clearFilters}
      onPageChange={list.setPage}
      onPageSizeChange={list.setPageSize}
      onCreate={() => canCreate && (onRouteChange ? onRouteChange("new", null) : creation.openPage())}
      onOpenDetail={openCustomerDetail}
      onDelete={() => undefined}
    />)}

    {canViewDetails && <CustomerDetailsPage
      detail={details.detail} detailQuotes={details.quotes} detailOrders={details.orders} detailEquipments={details.equipments} detailLoading={details.loading}
      editForm={details.form} setEditForm={details.setForm} editAddress={details.address} setEditAddress={details.setAddress}
      editingCustomerData={details.editingData} setEditingCustomerData={details.setEditingData}
      onEdit={() => canEdit && onRouteChange?.(details.detail?.id, "edit")} onCancelEdit={() => onRouteChange?.(details.detail?.id, null)}
      editingCustomerAddress={details.editingAddress} setEditingCustomerAddress={details.setEditingAddress}
      savingCustomer={details.savingCustomer} savingAddress={details.savingAddress}
      canEdit={canEdit} canViewAddress={canViewAddress} canEditAddress={canEditAddress} canViewQuotes={canViewQuotes} canViewOrders={canViewOrders} canOpenOrders={canOpenOrders}
      onSaveCustomer={() => { if (canEdit) void details.saveCustomer(); }} onSaveAddress={() => { if (canEditAddress) void details.saveAddress(); }}
      onOpenOrder={(orderId, customerId) => canOpenOrders && onOpenOrder?.(orderId, customerId || details.detail?.id)}
      onClose={() => { details.close(); closeRoute(); }}
    />}

    <CreateCustomerPage open={creation.open && canCreate} form={creation.form} setForm={creation.setForm} address={creation.address} setAddress={creation.setAddress} saving={creation.saving} canCreate={canCreate} cpfError={creation.cpfError} setCpfError={creation.setCpfError} cpfInputRef={creation.cpfInputRef} cnpjLoading={creation.cnpjLoading} cnpjMessage={creation.cnpjMessage} setCnpjMessage={creation.setCnpjMessage} onLookupCnpj={creation.lookupCnpj} onCreate={() => { if (canCreate) void creation.create().then(created => { if (created) closeRoute(); }); }} onClose={() => { creation.closePage(); closeRoute(); }} />
  </div>;
}

/* ─────────────────────────── TAB: EMPLOYEES ─────────────────────────── */
