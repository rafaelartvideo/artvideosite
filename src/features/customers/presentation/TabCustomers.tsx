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
  const controller = useCustomersController({ canCreate, canEdit, canDelete });

  return <div className="space-y-5">
    {controller.toast && <Toast
      message={controller.toast.msg}
      type={controller.toast.type}
      onClose={() => controller.setToast(null)}
    />}
    {controller.deleteId && <ConfirmDialog
      message="Excluir este cliente? Esta ação remove o registro principal e pode falhar se houver dependências existentes no schema."
      onConfirm={() => { void controller.remove(controller.deleteId as string); }}
      onCancel={() => controller.setDeleteId(null)}
    />}

    <CustomersList
      customers={controller.customers}
      filtered={controller.filtered}
      pagedCustomers={controller.pagedCustomers}
      loading={controller.loading}
      isFetching={controller.isFetching}
      search={controller.search}
      page={controller.page}
      safePage={controller.safePage}
      pageSize={controller.pageSize}
      totalPages={controller.totalPages}
      canCreate={canCreate}
      canDelete={canDelete}
      onSearchChange={controller.setSearch}
      onPageChange={controller.setPage}
      onPageSizeChange={controller.setPageSize}
      onCreate={controller.openCreate}
      onRefresh={() => { void controller.refetch(); }}
      onOpenDetail={(customer) => { void controller.openDetail(customer); }}
      onDelete={controller.setDeleteId}
    />

    <CustomerDetailsPage
      detail={controller.detail}
      detailQuotes={controller.detailQuotes}
      detailOrders={controller.detailOrders}
      detailLoading={controller.detailLoading}
      editForm={controller.editForm}
      setEditForm={controller.setEditForm}
      editAddress={controller.editAddress}
      setEditAddress={controller.setEditAddress}
      editingCustomerData={controller.editingCustomerData}
      setEditingCustomerData={controller.setEditingCustomerData}
      editingCustomerAddress={controller.editingCustomerAddress}
      setEditingCustomerAddress={controller.setEditingCustomerAddress}
      savingCustomer={controller.savingCustomer}
      savingAddress={controller.savingAddress}
      canEdit={canEdit}
      onSaveCustomer={() => { void controller.saveCustomer(); }}
      onSaveAddress={() => { void controller.saveAddress(); }}
      onOpenOrder={onOpenOrder}
      onClose={() => controller.setDetail(null)}
    />

    <CreateCustomerPage
      open={controller.createOpen}
      form={controller.createForm}
      setForm={controller.setCreateForm}
      address={controller.createAddress}
      setAddress={controller.setCreateAddress}
      saving={controller.saving}
      canCreate={canCreate}
      cpfError={controller.cpfError}
      setCpfError={controller.setCpfError}
      cpfInputRef={controller.cpfInputRef}
      cnpjLoading={controller.cnpjLoading}
      cnpjMessage={controller.cnpjMessage}
      setCnpjMessage={controller.setCnpjMessage}
      onLookupCnpj={controller.lookupCnpj}
      onCreate={() => { void controller.create(); }}
      onClose={controller.closeCreate}
    />
  </div>;
}

/* ─────────────────────────── TAB: EMPLOYEES ─────────────────────────── */
