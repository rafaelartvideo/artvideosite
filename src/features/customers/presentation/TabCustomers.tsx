import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { ConfirmDialog, Toast } from "@/shared/ui/admin/AdminFeedback";
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
  const canCreate = hasPermission("customers.create");
  const canEdit = hasPermission("customers.edit");
  const canDelete = hasPermission("customers.delete");
  const { list, details, creation, toast, setToast } = useCustomersController({
    canCreate,
    canEdit,
    canDelete,
  });

  useEffect(() => {
    if (!routeResourceId) {
      if (creation.open) creation.closePage();
      if (details.detail) details.close();
      return;
    }
    if (routeResourceId === "new") {
      if (!creation.open) creation.openPage();
      if (details.detail) details.close();
      return;
    }
    const customer = list.customers.find((item: any) => item.id === routeResourceId);
    if (!customer || details.detail?.id === customer.id) {
      if (details.detail && routeSubpage === "edit" && !details.editingData) details.setEditingData(true);
      return;
    }
    void details.open(customer).then(() => {
      if (routeSubpage === "edit") details.setEditingData(true);
    });
  }, [routeResourceId, routeSubpage, list.customers, details.detail?.id]);

  const closeRoute = () => onRouteChange?.(null, null);

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {list.deleteId && <ConfirmDialog
      message="Excluir este cliente? Esta ação remove o registro principal e pode falhar se houver dependências existentes no schema."
      onConfirm={() => { void list.remove(list.deleteId as string).then((removed) => { if (removed) details.close(); }); }}
      onCancel={() => list.setDeleteId(null)}
    />}

    {!routeResourceId && <CustomersList
      customers={list.customers}
      filtered={list.filtered}
      pagedCustomers={list.pagedCustomers}
      loading={list.loading}
      isFetching={list.isFetching}
      search={list.search}
      page={list.page}
      safePage={list.safePage}
      pageSize={list.pageSize}
      totalPages={list.totalPages}
      canCreate={canCreate}
      canDelete={canDelete}
      onSearchChange={list.setSearch}
      onPageChange={list.setPage}
      onPageSizeChange={list.setPageSize}
      onCreate={() => onRouteChange ? onRouteChange("new", null) : creation.openPage()}
      onRefresh={() => { void list.refetch(); }}
      onOpenDetail={(customer) => { if (onRouteChange) onRouteChange(customer.id, null); else void details.open(customer); }}
      onDelete={list.setDeleteId}
    />}

    <CustomerDetailsPage
      detail={details.detail}
      detailQuotes={details.quotes}
      detailOrders={details.orders}
      detailLoading={details.loading}
      editForm={details.form}
      setEditForm={details.setForm}
      editAddress={details.address}
      setEditAddress={details.setAddress}
      editingCustomerData={details.editingData}
      setEditingCustomerData={details.setEditingData}
      onEdit={() => onRouteChange?.(details.detail?.id, "edit")}
      onCancelEdit={() => onRouteChange?.(details.detail?.id, null)}
      editingCustomerAddress={details.editingAddress}
      setEditingCustomerAddress={details.setEditingAddress}
      savingCustomer={details.savingCustomer}
      savingAddress={details.savingAddress}
      canEdit={canEdit}
      onSaveCustomer={() => { void details.saveCustomer(); }}
      onSaveAddress={() => { void details.saveAddress(); }}
      onOpenOrder={(orderId, customerId) => onOpenOrder?.(orderId, customerId || details.detail?.id)}
      onClose={() => { details.close(); closeRoute(); }}
    />

    <CreateCustomerPage
      open={creation.open}
      form={creation.form}
      setForm={creation.setForm}
      address={creation.address}
      setAddress={creation.setAddress}
      saving={creation.saving}
      canCreate={canCreate}
      cpfError={creation.cpfError}
      setCpfError={creation.setCpfError}
      cpfInputRef={creation.cpfInputRef}
      cnpjLoading={creation.cnpjLoading}
      cnpjMessage={creation.cnpjMessage}
      setCnpjMessage={creation.setCnpjMessage}
      onLookupCnpj={creation.lookupCnpj}
      onCreate={() => { void creation.create().then((created) => { if (created) closeRoute(); }); }}
      onClose={() => { creation.closePage(); closeRoute(); }}
    />
  </div>;
}

/* ─────────────────────────── TAB: EMPLOYEES ─────────────────────────── */
