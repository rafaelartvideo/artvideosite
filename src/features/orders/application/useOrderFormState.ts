import { useState } from "react";
import type { ServiceOrderTechnicalValue } from "@/features/equipment/domain/equipment";

type OrderType = "internal" | "external";

const createEmptyOrderForm = () => ({
  service_id: "",
  general_service_id: "",
  service_type_id: "",
  seller_id: "",
  estimated_price: "",
  status_id: "",
  situation_id: "",
  customer_id: "",
  technician_id: "",
  brand_id: "",
  product_id: "",
  model: "",
  equipment_type_id: "",
  equipment_brand_id: "",
  equipment_model_id: "",
  serial_number: "",
  accessories: "",
  equipment_condition: "",
  priority: "normal",
  scheduled_at: "",
  started_at: "",
  completed_at: "",
  internal_notes: "",
  customer_notes: "",
  order_type: "internal" as OrderType,
  service_state: "",
  service_city: "",
  service_street: "",
  service_zip_code: "",
  service_neighborhood: "",
  service_number: "",
  service_complement: "",
  service_customer_address_id: "",
  external_os_number: "",
  technicalValues: {} as Record<string, string>,
  technicalHistory: [] as ServiceOrderTechnicalValue[],
});

export function useOrderFormState() {
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<any>(null);
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>([]);
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);
  const [quickEquipment, setQuickEquipment] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState(false);
  const [form, setForm] = useState(createEmptyOrderForm);
  const [needsScheduling, setNeedsScheduling] = useState(false);

  const updateField = (key: string, value: any) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const openNewForm = () => {
    setSelectedTechnicianIds([]);
    setSelectedSellerIds([]);
    setEditingOS(null);
    setForm(createEmptyOrderForm());
    setNeedsScheduling(false);
    setFormOpen(true);
  };

  const hydrateOrderForm = (order: any, technicalValues: ServiceOrderTechnicalValue[] = []) => {
    setEditingOS(order);
    setSelectedTechnicianIds(Array.from(new Set(
      (order.technician_links || [])
        .map((link: any) => link.employee_id)
        .filter(Boolean)
        .concat(order.technician_id ? [order.technician_id] : []),
    )));
    setSelectedSellerIds(Array.from(new Set(
      (order.seller_links || [])
        .map((link: any) => link.employee_id)
        .filter(Boolean)
        .concat(order.seller_id ? [order.seller_id] : []),
    )));
    setNeedsScheduling(true);
    setForm({
      ...createEmptyOrderForm(),
      service_id: order.service_id || "",
      general_service_id: order.general_service_id || "",
      service_type_id: order.service_type_id || "",
      seller_id: order.seller_id || "",
      estimated_price:
        order.estimated_price == null ? "" : String(order.estimated_price),
      status_id: order.status_id || "",
      situation_id: order.situation_id || "",
      customer_id: order.customer_id || "",
      technician_id: order.technician_id || "",
      brand_id: order.brand_id || "",
      product_id: order.product_id || "",
      model: order.model || "",
      equipment_type_id: order.equipment_type_id || "",
      equipment_brand_id: order.equipment_brand_id || "",
      equipment_model_id: order.equipment_model_id || "",
      serial_number: order.serial_number || "",
      accessories: order.accessories || "",
      equipment_condition: order.equipment_condition || "",
      priority: order.priority || "normal",
      scheduled_at: order.scheduled_at
        ? order.scheduled_at.slice(0, 16)
        : "",
      started_at: order.started_at ? order.started_at.slice(0, 16) : "",
      completed_at: order.completed_at ? order.completed_at.slice(0, 16) : "",
      internal_notes: order.internal_notes || "",
      customer_notes: order.customer_notes || "",
      order_type: order.order_type === "external" ? "external" : "internal",
      service_state:
        order.order_type === "external" ? order.service_state || "" : "",
      service_city:
        order.order_type === "external" ? order.service_city || "" : "",
      service_street:
        order.order_type === "external" ? order.service_street || "" : "",
      service_zip_code:
        order.order_type === "external" ? order.service_zip_code || "" : "",
      service_neighborhood:
        order.order_type === "external" ? order.service_neighborhood || "" : "",
      service_number:
        order.order_type === "external" ? order.service_number || "" : "",
      service_complement:
        order.order_type === "external" ? order.service_complement || "" : "",
      service_customer_address_id:
        order.order_type === "external"
          ? order.service_customer_address_id || ""
          : "",
      external_os_number: order.external_os_number || "",
      technicalValues: Object.fromEntries(technicalValues.map(value => [value.technical_field_id, value.field_type_snapshot === "number" ? String(value.value_number ?? "") : value.value_text || ""])),
      technicalHistory: technicalValues,
    });
    setFormOpen(true);
  };

  const closeOrderForm = () => {
    setFormOpen(false);
    updateField("external_os_number", "");
  };

  return {
    formOpen,
    setFormOpen,
    editingOS,
    setEditingOS,
    selectedTechnicianIds,
    setSelectedTechnicianIds,
    selectedSellerIds,
    setSelectedSellerIds,
    quickEquipment,
    setQuickEquipment,
    quickCustomer,
    setQuickCustomer,
    form,
    setForm,
    needsScheduling,
    setNeedsScheduling,
    updateField,
    openNewForm,
    hydrateOrderForm,
    closeOrderForm,
  };
}
