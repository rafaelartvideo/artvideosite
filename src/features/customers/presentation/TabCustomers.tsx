import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { useCustomersController } from "../application/useCustomersController";
import { CreateCustomerPage } from "./CreateCustomerPage";
import { CustomerDetailsPage } from "./CustomerDetailsPage";
import { CustomersList } from "./CustomersList";

type TabCustomersProps = {
  onOpenOrder?: (id: string, customerId?: string) => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId?: string | null, subpage?: string | null) => void;
};

export function TabCustomers({ onOpenOrder, routeResourceId, routeSubpage, onRouteChange }: TabCustomersProps) {
  const { hasPermission } = useAuth();
  const canViewTable = hasPermission("customers.table.view");
  const canViewDetails = hasPermission("customers.details.view");
  const canCreate = hasPermission("customers.create");
  const canEdit = hasPermission("customers.edit");
  const canRefresh = hasPermission("customers.refresh");
  const canViewAddress = hasPermission("customers.addresses.view");
  const canEditAddress = hasPermission("customers.addresses.edit");
  const canViewQuotes = hasPermission("quotes.view");
  const canViewOrders = hasPermission("orders.view");
  const canOpenOrders = hasPermission("orders.details.view");
  const { list, details, creation, toast, setToast } = useCustomersController({ canCreate, canEdit, canDelete: false });

  useEffect(() => {
    if (!routeResourceId) { if (creation.open) creation.closePage(); if (details.detail) details.close(); return; }
    if (routeResourceId === "new") { if (canCreate && !creation.open) creation.openPage(); if (details.detail) details.close(); return; }
    if (!canViewDetails) return;
    const customer = list.customers.find((item: any) => item.id === routeResourceId);
    if (!customer || details.detail?.id === customer.id) { if (details.detail && routeSubpage === "edit" && canEdit && !details.editingData) details.setEditingData(true); return; }
    void details.open(customer).then(() => { if (routeSubpage === "edit" && canEdit) details.setEditingData(true); });
  }, [routeResourceId, routeSubpage, list.customers, details.detail?.id, canCreate, canViewDetails, canEdit]);

  const closeRoute = () => onRouteChange?.(null, null);
  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {!routeResourceId && canViewTable && <CustomersList
      customers={list.customers}
      filtered={list.filtered}
      pagedCustomers={list.pagedCustomers}
      loading={list.loading}
      isFetching={list.isFetching}
      nameSearch={list.nameSearch}
      documentSearch={list.documentSearch}
      selectedStates={list.selectedStates}
      selectedCities={list.selectedCities}
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
      onClearFilters={list.clearFilters}
      onPageChange={list.setPage}
      onPageSizeChange={list.setPageSize}
      onCreate={() => canCreate && (onRouteChange ? onRouteChange("new", null) : creation.openPage())}
      onRefresh={() => { if (canRefresh) void list.refetch(); }}
      onOpenDetail={customer => { if (!canViewDetails) return; if (onRouteChange) onRouteChange(customer.id, null); else void details.open(customer); }}
      onDelete={() => undefined}
    />}
    {canViewDetails && <CustomerDetailsPage
      detail={details.detail} detailQuotes={details.quotes} detailOrders={details.orders} detailLoading={details.loading}
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
