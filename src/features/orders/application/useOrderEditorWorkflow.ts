import type { Dispatch, SetStateAction } from "react";
import { buildOrderPayload, buildTechnicalValuesPayload, prepareOrderForm } from "./order-form";
import { getOrderEditState, getOrderSubmissionStatus } from "./order-management";
import { persistServiceOrder } from "./order-submission";
import { uploadOrderImage } from "../infrastructure/order-images.repository";
import { listServiceOrderTechnicalValues, saveServiceOrderTechnicalValues } from "../infrastructure/orders.repository";
import type { useOrderCustomerPersistence } from "./useOrderCustomerPersistence";
import type { useOrderCustomerSelection } from "./useOrderCustomerSelection";
import type { useOrderDetails } from "./useOrderDetails";
import type { useOrderFormState } from "./useOrderFormState";
import type { useOrderImages } from "./useOrderImages";
import type { useOrdersWorkspace } from "./useOrdersWorkspace";
import type { useOrderServiceAddress } from "./useOrderServiceAddress";

type PermissionCheck = (permission: string) => boolean;
type Toast = { msg: string; type: "success" | "error" };

type Options = {
  userId?: string;
  workspace: ReturnType<typeof useOrdersWorkspace>;
  formState: ReturnType<typeof useOrderFormState>;
  images: ReturnType<typeof useOrderImages>;
  customers: ReturnType<typeof useOrderCustomerSelection>;
  address: ReturnType<typeof useOrderServiceAddress>;
  customerPersistence: ReturnType<typeof useOrderCustomerPersistence>;
  details: ReturnType<typeof useOrderDetails>;
  hasPermission: PermissionCheck;
  showToast: Dispatch<SetStateAction<Toast | null>>;
  setSaving: Dispatch<SetStateAction<boolean>>;
  formatError: (error: unknown) => string;
};

export function useOrderEditorWorkflow({
  userId, workspace, formState, images, customers, address,
  customerPersistence, details, hasPermission, showToast, setSaving, formatError,
}: Options) {
  const selectCustomer = (customer: any) => {
    const customerAddress = customers.selectCustomer(customer);
    formState.updateField("customer_id", customer.id);
    if (formState.form.order_type !== "external" || !address.serviceUseCustomerAddress) return;
    if (customerAddress) {
      address.setServiceAddressMessage("");
      address.setServiceCustomerAddressOverride(true);
      address.copyCustomerAddressToForm(customerAddress);
    } else {
      address.setServiceUseCustomerAddress(false);
      address.setServiceAddressMessage("Este cliente não possui endereço cadastrado. Preencha o local do atendimento.");
      address.clearServiceAddress();
    }
  };

  const openNew = () => {
    formState.openNewForm();
    address.resetServiceAddressState();
    images.clearOrderImages();
    images.setViewImage(null);
    customers.clearCustomer();
  };

  const openEdit = async (order: any) => {
    const { data: currentOrder, error } = await getOrderEditState(order.id);
    if (error) {
      showToast({ msg: `Não foi possível verificar o estado da OS: ${formatError(error)}`, type: "error" });
      return;
    }
    if (currentOrder?.is_solved || order.is_solved) {
      showToast({ msg: "Esta OS está solucionada e é somente leitura.", type: "error" });
      return;
    }
    await images.loadOrderImages(order.id);
    const { data: technicalValues, error: technicalValuesError } = await listServiceOrderTechnicalValues(order.id);
    if (technicalValuesError) {
      showToast({ msg: `Não foi possível carregar os campos técnicos: ${formatError(technicalValuesError)}`, type: "error" });
      return;
    }
    formState.hydrateOrderForm(order, technicalValues || []);
    address.hydrateServiceAddress({
      useCustomerAddress: order.order_type === "external" && order.service_address_source === "customer",
      state: order.order_type === "external" ? order.service_state : undefined,
      city: order.order_type === "external" ? order.service_city : undefined,
    });
    customers.hydrateCustomer(order.customer || null);
  };

  const save = async () => {
    const editingOrder = formState.editingOS;
    if (editingOrder ? !hasPermission("orders.edit") : !hasPermission("orders.create")) {
      showToast({ msg: "Você não possui permissão para esta ação na OS.", type: "error" });
      return false;
    }
    const preparation = prepareOrderForm({
      form: formState.form,
      editingOrder,
      userId,
      selectedCustomerId: customers.selectedCustomer?.id,
      serviceUseCustomerAddress: address.serviceUseCustomerAddress,
      serviceCustomerAddressOverride: address.serviceCustomerAddressOverride,
      selectedServiceAddress: address.selectedServiceAddress,
      needsScheduling: formState.needsScheduling,
      equipmentBrands: workspace.equipmentBrands,
      equipmentModels: workspace.equipmentModels,
      technicalFields: workspace.technicalFieldLinks.filter((link: any) => link.equipment_type_id === formState.form.equipment_type_id).map((link: any) => ({ ...link, technical_field: link.technical_field || workspace.technicalFields.find((field: any) => field.id === link.technical_field_id) })),
      technicalValues: formState.form.technicalValues,
    });
    if ("error" in preparation) {
      showToast({ msg: preparation.error, type: "error" });
      return false;
    }
    const { status, error: statusError } = await getOrderSubmissionStatus({
      editingOrder,
      statusId: formState.form.status_id,
    });
    if (statusError || !status?.id) {
      showToast({ msg: "Não foi possível identificar um status válido para a OS.", type: "error" });
      return false;
    }

    setSaving(true);
    if (customers.editingCustomer && customers.selectedCustomer?.id && !(await customerPersistence.saveCustomerBeforeOrder())) return false;

    const payload = buildOrderPayload({
      form: formState.form,
      editingOrder,
      userId,
      statusId: status.id,
      prepared: preparation.prepared,
      selectedTechnicianIds: formState.selectedTechnicianIds,
      selectedSellerIds: formState.selectedSellerIds,
      needsScheduling: formState.needsScheduling,
      serviceUseCustomerAddress: address.serviceUseCustomerAddress,
    });
    const submission = await persistServiceOrder({
      editingOrder,
      payload,
      selectedTechnicianIds: formState.selectedTechnicianIds,
      selectedSellerIds: formState.selectedSellerIds,
      orderImages: images.orderImages,
      uploadImage: uploadOrderImage,
      saveTechnicalValues: async orderId => saveServiceOrderTechnicalValues(orderId, buildTechnicalValuesPayload({ serviceOrderId: orderId, technicalFields: workspace.technicalFieldLinks.filter((link: any) => link.equipment_type_id === formState.form.equipment_type_id).map((link: any) => ({ ...link, technical_field: link.technical_field || workspace.technicalFields.find((field: any) => field.id === link.technical_field_id) })), technicalValues: formState.form.technicalValues })),
    });
    if (!submission.success) {
      setSaving(false);
      const message = submission.stage === "record"
        ? `Erro ao salvar OS: ${formatError(submission.error)}`
        : submission.stage === "relations"
          ? `OS salva, mas não foi possível atualizar técnicos/vendedores: ${formatError(submission.error)}`
          : `OS salva, mas houve erro nas imagens: ${formatError(submission.error)}`;
      showToast({ msg: message, type: "error" });
      return false;
    }
    setSaving(false);
    showToast({ msg: `OS ${editingOrder ? "atualizada" : "criada"} com sucesso!`, type: "success" });
    formState.closeOrderForm();
    details.closeDetail();
    await workspace.reloadWorkspace();
    return true;
  };

  return { selectCustomer, openNew, openEdit, save };
}
