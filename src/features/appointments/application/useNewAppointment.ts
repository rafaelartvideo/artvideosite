import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { fetchAddressByZipCode, formatZipCode, type Address } from "@/lib/address";
import type { AppointmentSituation } from "@/lib/database.types";
import { isValidIsoDate } from "@/shared/domain/formatters";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";
import {
  createAppointment,
  listCustomerServiceOrders,
  searchAppointmentCustomers,
} from "../infrastructure/appointments.repository";
import { dayKey, type AppointmentWithRelations } from "./agenda-calendar";
import { createAppointmentForm } from "./appointment-form";

type Technician = { id: string; full_name: string };
type ToastType = "success" | "error";
type AppointmentSubmodal = "address" | "technicians" | null;

type Options = {
  organizationId: string;
  userId: string | null;
  cursor: Date;
  situations: AppointmentSituation[];
  situationsLoading: boolean;
  technicians: Technician[];
  onCreated: (appointment: AppointmentWithRelations) => void;
  onToast: (message: string, type: ToastType) => void;
};

export function useNewAppointment({
  organizationId,
  userId,
  cursor,
  situations,
  situationsLoading,
  technicians,
  onCreated,
  onToast,
}: Options) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submodal, setSubmodal] = useState<AppointmentSubmodal>(null);
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [changingCustomer, setChangingCustomer] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [form, setForm] = useState(createAppointmentForm);
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || form.situation_id || situations.length === 0) return;
    const defaultSituation = situations.find(item => String(item.name).trim().toLowerCase() === "agendado") ?? situations[0];
    setForm(current => ({ ...current, situation_id: defaultSituation?.id ?? "" }));
  }, [open, situations, form.situation_id]);

  const openDialog = () => {
    const defaultSituation = situations.find(item => String(item.name).trim().toLowerCase() === "agendado") ?? situations[0];
    setForm(createAppointmentForm(dayKey(cursor), defaultSituation?.id ?? ""));
    setCustomer(null);
    setOrders([]);
    setSelectedTechnicianIds([]);
    setCustomers([]);
    setCustomerSearch("");
    setChangingCustomer(false);
    setOpen(true);
  };

  const searchCustomers = async (value: string) => {
    setCustomerSearch(value);
    if (value.trim().length < 2) {
      setCustomers([]);
      return;
    }
    setCustomerSearchLoading(true);
    try {
      setCustomers(await searchAppointmentCustomers(organizationId, value.trim()));
    } catch (error) {
      console.error("[ADMIN] appointment customer search error:", error);
      setCustomers([]);
      onToast(`Erro ao buscar clientes: ${supabaseErrorMessage(error)}`, "error");
    } finally {
      setCustomerSearchLoading(false);
    }
  };

  const selectCustomer = async (selectedCustomer: any) => {
    const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
    setCustomer(selectedCustomer);
    setChangingCustomer(false);
    setCustomers([]);
    setCustomerSearch("");
    try {
      setOrders(await listCustomerServiceOrders(organizationId, selectedCustomer.id));
    } catch (error) {
      setOrders([]);
      onToast(`Erro ao carregar OS do cliente: ${supabaseErrorMessage(error)}`, "error");
    }
    setForm(current => ({
      ...current,
      customer_id: selectedCustomer.id,
      service_order_id: "",
      address_source: address ? "customer" : "custom",
      customer_address_id: address?.id || "",
      zip_code: address?.zip_code || "",
      street: address?.street || "",
      number: address?.number || "",
      complement: address?.complement || "",
      neighborhood: address?.neighborhood || "",
      city: address?.city || "",
      state: address?.state || "",
    }));
  };

  const lookupZip = async () => {
    const zipCode = formatZipCode(form.zip_code);
    if (zipCode.replace(/\D/g, "").length !== 8) return;
    const address = await fetchAddressByZipCode(zipCode);
    if (!address) return;
    setForm(current => ({
      ...current,
      zip_code: zipCode,
      street: address.street || current.street,
      neighborhood: address.neighborhood || current.neighborhood,
      city: address.city || current.city,
      state: address.state || current.state,
    }));
  };

  const save = async () => {
    if (!form.customer_id || !customer) {
      onToast("Selecione um cliente para o agendamento.", "error");
      return;
    }
    if (!form.appointment_date || !isValidIsoDate(form.appointment_date)) {
      onToast("Informe uma data de agendamento válida.", "error");
      return;
    }
    if (form.period === "custom" && (!form.start_time || !form.end_time || form.end_time <= form.start_time)) {
      onToast("Informe um horário personalizado válido, com término após o início.", "error");
      return;
    }
    const selectedSituation = situations.find(item => item.id === form.situation_id);
    if (!selectedSituation) {
      onToast("Selecione uma situação válida para o agendamento.", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customer_id: form.customer_id,
        service_order_id: form.service_order_id || null,
        appointment_date: form.appointment_date,
        period: form.period,
        start_time: form.period === "custom" ? form.start_time : null,
        end_time: form.period === "custom" ? form.end_time : null,
        sector_location: form.sector_location.trim() || null,
        situation_id: selectedSituation.id,
        description: form.description.trim() || null,
        is_return: form.is_return,
        address_source: form.address_source,
        customer_address_id: form.address_source === "customer" ? form.customer_address_id || null : null,
        zip_code: form.zip_code || null,
        street: form.street || null,
        number: form.number || null,
        complement: form.complement || null,
        neighborhood: form.neighborhood || null,
        city: form.city || null,
        state: form.state || null,
        created_by: userId,
      };
      const data = await createAppointment(organizationId, payload, selectedTechnicianIds);
      onCreated({
        ...data,
        appointment_technicians: selectedTechnicianIds.map(employee_id => ({
          employee_id,
          employee: technicians.find(item => item.id === employee_id) || null,
        })),
      } as AppointmentWithRelations);
      setOpen(false);
      onToast("Agendamento criado.", "success");
      await queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
    } catch (error) {
      console.error("[ADMIN] appointment save error:", error);
      onToast(`Erro ao criar agendamento: ${supabaseErrorMessage(error)}`, "error");
    } finally {
      setSaving(false);
    }
  };

  return {
    open,
    setOpen,
    openDialog,
    submodal,
    setSubmodal,
    saving,
    form,
    setForm,
    customer,
    setCustomer,
    changingCustomer,
    setChangingCustomer,
    customerSearch,
    setCustomerSearch,
    customerSearchLoading,
    customers,
    setCustomers,
    searchCustomers,
    selectCustomer,
    orders,
    setOrders,
    situations,
    situationsLoading,
    technicians,
    selectedTechnicianIds,
    setSelectedTechnicianIds,
    lookupZip,
    save,
  };
}

export type NewAppointmentController = ReturnType<typeof useNewAppointment>;
