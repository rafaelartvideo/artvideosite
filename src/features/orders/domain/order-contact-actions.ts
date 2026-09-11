export const PHONE_CALL_EVENT = "artvideo:phone-call";

export function normalizeBrazilPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

export function phoneContactLinks(value?: string | null) {
  const phone = normalizeBrazilPhone(value);
  return {
    phone,
    tel: phone ? `tel:+${phone}` : "",
    whatsapp: phone ? `https://wa.me/${phone}` : "",
  };
}

/**
 * Integration point for the ArtVideo telephony layer and optional desktop
 * softphones/extensions. Returning true means a listener accepted the call
 * action and the regular tel: navigation should be cancelled.
 */
export function notifyPhoneCallIntegration(phone: string, serviceOrderId?: string) {
  if (typeof window === "undefined" || !phone) return false;
  const event = new CustomEvent(PHONE_CALL_EVENT, {
    cancelable: true,
    detail: {
      phone: `+${phone}`,
      serviceOrderId: serviceOrderId || null,
      source: "service-order-customer",
    },
  });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
