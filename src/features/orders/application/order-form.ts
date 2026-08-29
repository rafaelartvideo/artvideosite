import type { Address } from "@/lib/address";

type OrderForm = Record<string, any>;

export type PreparedOrderForm = {
  customerId: string;
  selectedAddress: Address | null;
  serviceAddress: {
    zipCode: string;
    state: string;
    city: string;
    neighborhood: string;
    street: string;
    number: string;
    complement: string;
  };
};

export function prepareOrderForm({
  form,
  editingOrder,
  userId,
  selectedCustomerId,
  serviceUseCustomerAddress,
  serviceCustomerAddressOverride,
  selectedServiceAddress,
  needsScheduling,
  equipmentBrands,
  equipmentModels,
}: {
  form: OrderForm;
  editingOrder: any;
  userId?: string;
  selectedCustomerId?: string;
  serviceUseCustomerAddress: boolean;
  serviceCustomerAddressOverride: boolean;
  selectedServiceAddress: Address | null;
  needsScheduling: boolean;
  equipmentBrands: any[];
  equipmentModels: any[];
}): { error: string } | { prepared: PreparedOrderForm } {
  if (!editingOrder && !userId) {
    return { error: "Não foi possível identificar o responsável pela OS." };
  }
  if (editingOrder?.is_solved) {
    return { error: "Esta OS está solucionada e é somente leitura." };
  }
  if (!form.general_service_id && !form.service_id) {
    return { error: "Selecione o serviço geral da OS." };
  }
  if (!editingOrder && !form.service_type_id) {
    return { error: "Selecione o tipo de atendimento da OS." };
  }

  const customerId = selectedCustomerId || form.customer_id;
  if (!customerId) return { error: "Selecione um cliente." };

  const historicalCustomerAddress: Address = {
    id: form.service_customer_address_id || undefined,
    zip_code: form.service_zip_code,
    state: form.service_state,
    city: form.service_city,
    neighborhood: form.service_neighborhood,
    street: form.service_street,
    number: form.service_number,
    complement: form.service_complement,
  };
  const selectedAddress = serviceUseCustomerAddress
    ? serviceCustomerAddressOverride
      ? selectedServiceAddress
      : historicalCustomerAddress
    : null;
  const address = selectedAddress || historicalCustomerAddress;
  const serviceAddress = {
    zipCode: String(address.zip_code ?? "").trim(),
    state: String(address.state ?? "").trim(),
    city: String(address.city ?? "").trim(),
    neighborhood: String(address.neighborhood ?? "").trim(),
    street: String(address.street ?? "").trim(),
    number: String(address.number ?? "").trim(),
    complement: String(address.complement ?? "").trim(),
  };

  if (
    form.order_type === "external" &&
    serviceUseCustomerAddress &&
    !selectedAddress
  ) {
    return {
      error: "Selecione um endereço cadastrado ou informe um endereço personalizado.",
    };
  }
  if (
    form.order_type === "external" &&
    (
      !serviceAddress.zipCode ||
      !serviceAddress.state ||
      !serviceAddress.city ||
      !serviceAddress.street ||
      !serviceAddress.number
    )
  ) {
    return {
      error: "Informe CEP, estado, cidade, rua e número para uma OS externa.",
    };
  }
  if (needsScheduling && !form.scheduled_at) {
    return {
      error: "Informe a data e hora agendadas ou selecione Não.",
    };
  }
  if (
    form.equipment_brand_id &&
    !equipmentBrands.some(brand =>
      brand.id === form.equipment_brand_id &&
      brand.equipment_type_id === form.equipment_type_id
    )
  ) {
    return { error: "A marca selecionada não pertence ao equipamento." };
  }
  if (
    form.equipment_model_id &&
    !equipmentModels.some(model =>
      model.id === form.equipment_model_id &&
      model.equipment_brand_id === form.equipment_brand_id
    )
  ) {
    return { error: "O modelo selecionado não pertence à marca." };
  }

  return {
    prepared: {
      customerId,
      selectedAddress,
      serviceAddress,
    },
  };
}

export function buildOrderPayload({
  form,
  editingOrder,
  userId,
  statusId,
  prepared,
  selectedTechnicianIds,
  selectedSellerIds,
  needsScheduling,
  serviceUseCustomerAddress,
}: {
  form: OrderForm;
  editingOrder: any;
  userId?: string;
  statusId: string;
  prepared: PreparedOrderForm;
  selectedTechnicianIds: string[];
  selectedSellerIds: string[];
  needsScheduling: boolean;
  serviceUseCustomerAddress: boolean;
}) {
  const external = form.order_type === "external";
  return {
    service_id: editingOrder ? form.service_id || null : null,
    general_service_id: form.general_service_id || null,
    service_type_id: form.service_type_id || null,
    seller_id: selectedSellerIds[0] || null,
    estimated_price: form.estimated_price
      ? Number(form.estimated_price)
      : null,
    status_id: statusId,
    situation_id: form.situation_id || null,
    customer_id: prepared.customerId,
    ...(!editingOrder ? { assigned_to: userId } : {}),
    technician_id: selectedTechnicianIds[0] || null,
    equipment_type_id: form.equipment_type_id || null,
    equipment_brand_id: form.equipment_brand_id || null,
    equipment_model_id: form.equipment_model_id || null,
    brand_id: form.brand_id || null,
    product_id: form.product_id || null,
    model: form.model || null,
    ...(!editingOrder ? {
      serial_number: form.serial_number || null,
      external_os_number: form.external_os_number.trim() || null,
    } : {}),
    accessories: form.accessories || null,
    equipment_condition: form.equipment_condition || null,
    priority: form.priority || "normal",
    scheduled_at: needsScheduling ? form.scheduled_at || null : null,
    started_at: form.started_at || null,
    completed_at: form.completed_at || null,
    internal_notes: form.internal_notes || null,
    customer_notes: form.customer_notes || null,
    order_type: form.order_type,
    service_zip_code: external ? prepared.serviceAddress.zipCode : null,
    service_state: external ? prepared.serviceAddress.state : null,
    service_city: external ? prepared.serviceAddress.city : null,
    service_neighborhood: external
      ? prepared.serviceAddress.neighborhood
      : null,
    service_street: external ? prepared.serviceAddress.street : null,
    service_number: external ? prepared.serviceAddress.number : null,
    service_complement: external
      ? prepared.serviceAddress.complement
      : null,
    service_address_source: external
      ? serviceUseCustomerAddress ? "customer" : "custom"
      : null,
    service_customer_address_id:
      external && serviceUseCustomerAddress
        ? prepared.selectedAddress?.id || null
        : null,
  };
}
