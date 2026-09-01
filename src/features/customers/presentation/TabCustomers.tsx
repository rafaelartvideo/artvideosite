import { useAuth } from "@/lib/auth";
import { ConfirmDialog, Toast } from "@/shared/ui/admin/AdminFeedback";
import { useCustomersController } from "../application/useCustomersController";
import { CreateCustomerPage } from "./CreateCustomerPage";
import { CustomerDetailsPage } from "./CustomerDetailsPage";
import { CustomersList } from "./CustomersList";

export function TabCustomers({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("customers.create");
  const canEdit = hasPermission("customers.edit");
  const canDelete = hasPermission("customers.delete");
  const { list, details, creation, toast, setToast } = useCustomersController({
    canCreate,
    canEdit,
    canDelete,
  });

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {list.deleteId && <ConfirmDialog
      message="Excluir este cliente? Esta ação remove o registro principal e pode falhar se houver dependências existentes no schema."
      onConfirm={() => { void list.remove(list.deleteId as string); }}
      onCancel={() => list.setDeleteId(null)}
    />}

    <CustomersList
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
      onCreate={creation.openPage}
      onRefresh={() => { void list.refetch(); }}
      onOpenDetail={(customer) => { void details.open(customer); }}
      onDelete={list.setDeleteId}
    />

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
      editingCustomerAddress={details.editingAddress}
      setEditingCustomerAddress={details.setEditingAddress}
      savingCustomer={details.savingCustomer}
      savingAddress={details.savingAddress}
      canEdit={canEdit}
      onSaveCustomer={() => { void details.saveCustomer(); }}
      onSaveAddress={() => { void details.saveAddress(); }}
      onOpenOrder={onOpenOrder}
      onClose={details.close}
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
      onCreate={() => { void creation.create(); }}
      onClose={creation.closePage}
    />
  </div>;
}

/* ─────────────────────────── TAB: EMPLOYEES ─────────────────────────── */
