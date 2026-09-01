import { supabase } from "@/lib/supabase";

type LoadAgendaInput = {
  userId: string | null;
  canViewOtherAgendas: boolean;
};

export async function loadAgendaData({
  userId,
  canViewOtherAgendas,
}: LoadAgendaInput) {
  let myEmployeeId: string | null = null;

  if (userId) {
    const { data, error } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle();

    if (error) throw error;
    myEmployeeId = data?.id ?? null;
  }

  let ordersQuery = supabase
    .from("service_orders")
    .select("id,os_number,scheduled_at,customer:customers(full_name),service:services(id,title),general_service:general_services(id,name),technician:employees!technician_id(id,full_name),technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)),order_status:order_statuses(id,name,color),situation:os_situations(id,name,color,hours)")
    .not("scheduled_at", "is", null)
    .order("scheduled_at");

  if (!canViewOtherAgendas) {
    const emptyUuid = "00000000-0000-0000-0000-000000000000";
    ordersQuery = myEmployeeId
      ? ordersQuery.or(`technician_id.eq.${myEmployeeId},assigned_to.eq.${userId ?? emptyUuid}`)
      : ordersQuery.eq("technician_id", emptyUuid);
  }

  const [
    ordersResult,
    appointmentsResult,
    employeesResult,
    servicesResult,
    generalServicesResult,
    situationsResult,
    appointmentSituationsResult,
  ] = await Promise.all([
    ordersQuery,
    supabase
      .from("appointments")
      .select("*, created_by_profile:profiles!created_by(id,full_name), customer:customers(id,full_name,document,cnpj,phone,whatsapp,addresses:customer_addresses(*)), service_order:service_orders(id,os_number,model,serial_number,service:services(title),general_service:general_services(name)), situation:appointment_situations(id,name,color,is_active,sort_order,created_at,updated_at), appointment_technicians(employee_id,employee:employees(id,full_name))")
      .order("appointment_date"),
    supabase.from("employees").select("id,full_name,is_active").eq("is_active", true).order("full_name"),
    supabase.from("services").select("id,title").eq("is_active", true).order("title"),
    supabase.from("general_services").select("id,name").eq("is_active", true).order("name"),
    supabase.from("os_situations").select("id,name,hours").eq("is_active", true).order("sort_order"),
    supabase
      .from("appointment_situations")
      .select("id,name,color,is_active,sort_order,created_at,updated_at")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  const error =
    ordersResult.error ||
    appointmentsResult.error ||
    employeesResult.error ||
    servicesResult.error ||
    generalServicesResult.error ||
    situationsResult.error ||
    appointmentSituationsResult.error;

  if (error) throw error;

  return {
    myEmployeeId,
    orders: ordersResult.data ?? [],
    appointments: appointmentsResult.data ?? [],
    employees: employeesResult.data ?? [],
    services: servicesResult.data ?? [],
    generalServices: generalServicesResult.data ?? [],
    situations: situationsResult.data ?? [],
    appointmentSituations: appointmentSituationsResult.data ?? [],
  };
}

export async function updateAppointmentDate(
  appointmentId: string,
  appointmentDate: string,
): Promise<void> {
  const { error } = await supabase
    .from("appointments")
    .update({ appointment_date: appointmentDate })
    .eq("id", appointmentId);

  if (error) throw error;
}

export async function updateServiceOrderSchedule(
  orderId: string,
  scheduledAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("service_orders")
    .update({ scheduled_at: scheduledAt })
    .eq("id", orderId);

  if (error) throw error;
}

export async function searchAppointmentCustomers(term: string) {
  const { data, error } = await supabase
    .from("customers")
    .select("id,customer_type,full_name,trade_name,document,cnpj,phone,whatsapp,addresses:customer_addresses(*)")
    .or(`full_name.ilike.%${term}%,trade_name.ilike.%${term}%,document.ilike.%${term}%,cnpj.ilike.%${term}%,phone.ilike.%${term}%,whatsapp.ilike.%${term}%`)
    .limit(8);

  if (error) throw error;
  return data ?? [];
}

export async function listCustomerServiceOrders(customerId: string) {
  const { data, error } = await supabase
    .from("service_orders")
    .select("id,os_number,model,serial_number,service:services(title),general_service:general_services(name)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createAppointment(
  payload: Record<string, unknown>,
  technicianIds: string[],
) {
  const { data, error } = await supabase
    .from("appointments")
    .insert(payload)
    .select("*, created_by_profile:profiles!created_by(id,full_name), customer:customers(id,full_name,document,cnpj,phone,whatsapp), service_order:service_orders(id,os_number,model,serial_number,service:services(title),general_service:general_services(name)), situation:appointment_situations(id,name,color,is_active,sort_order,created_at,updated_at)")
    .single();

  if (error || !data) throw error ?? new Error("Agendamento não criado.");
  if (technicianIds.length === 0) return data;

  const { error: techniciansError } = await supabase
    .from("appointment_technicians")
    .insert(
      technicianIds.map((employeeId) => ({
        appointment_id: data.id,
        employee_id: employeeId,
      })),
    );

  if (!techniciansError) return data;

  await supabase.from("appointments").delete().eq("id", data.id);
  throw techniciansError;
}
