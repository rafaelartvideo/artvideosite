import type { AppointmentPeriod } from "@/lib/database.types";

export type AppointmentFormState = {
  customer_id: string;
  service_order_id: string;
  appointment_date: string;
  period: AppointmentPeriod;
  start_time: string;
  end_time: string;
  sector_location: string;
  situation_id: string;
  description: string;
  is_return: boolean;
  address_source: "customer" | "custom" | null;
  customer_address_id: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

export function createAppointmentForm(
  appointmentDate = "",
  situationId = "",
): AppointmentFormState {
  return {
    customer_id: "",
    service_order_id: "",
    appointment_date: appointmentDate,
    period: "no_time",
    start_time: "",
    end_time: "",
    sector_location: "",
    situation_id: situationId,
    description: "",
    is_return: false,
    address_source: null,
    customer_address_id: "",
    zip_code: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  };
}
