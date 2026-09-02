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
 * Integration point for desktop softphones and browser extensions.
 * A content script can listen for PHONE_CALL_EVENT and optionally handle the
 * call while the regular tel: link remains the native fallback.
 */
export function notifyPhoneCallIntegration(phone: string, serviceOrderId?: string) {
  if (typeof window === "undefined" || !phone) return;
  window.dispatchEvent(new CustomEvent(PHONE_CALL_EVENT, {
    detail: {
      phone: `+${phone}`,
      serviceOrderId: serviceOrderId || null,
      source: "service-order-customer",
    },
  }));
}
