const cents = value => Math.round((Number(value) || 0) * 100);
const money = value => Math.round(value) / 100;

export function settlementCashAmount({ principal, interest = 0, penalty = 0, additions = 0, discount = 0 }) {
  const total = cents(principal) + cents(interest) + cents(penalty) + cents(additions) - cents(discount);
  return money(Math.max(0, total));
}

export function paymentMethodFee(gross, percentageFee = 0, fixedFee = 0) {
  const grossCents = Math.max(0, cents(gross));
  const percent = Math.min(100, Math.max(0, Number(percentageFee) || 0));
  const percentFee = Math.round(grossCents * percent / 100);
  return money(percentFee + Math.max(0, cents(fixedFee)));
}

export function settlementNetAmount(gross, fee) {
  return money(Math.max(0, cents(gross) - Math.max(0, cents(fee))));
}

export function validatePrincipalAgainstRemaining(principal, remaining) {
  const principalCents = cents(principal);
  const remainingCents = Math.max(0, cents(remaining));
  return {
    ok: principalCents > 0 && principalCents <= remainingCents,
    principal: money(principalCents),
    remaining: money(remainingCents),
  };
}

export function expectedSettlementDate(dateText, settlementDays = 0) {
  const [year, month, day] = String(dateText || "").slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.trunc(Number(settlementDays) || 0)));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
