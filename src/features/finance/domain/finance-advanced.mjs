function parseIsoDate(value) {
  const text = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error("Data de recorrência inválida.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) throw new Error("Data de recorrência inválida.");
  return { year, month, day, date };
}

function formatIsoDate(date) {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function nextRecurringDate(value, frequency, interval = 1) {
  const current = parseIsoDate(value);
  const step = Math.trunc(Number(interval));
  if (!Number.isInteger(step) || step < 1) throw new Error("Intervalo da recorrência inválido.");

  if (frequency === "weekly") {
    const next = new Date(current.date);
    next.setUTCDate(next.getUTCDate() + step * 7);
    return formatIsoDate(next);
  }

  if (frequency === "monthly") {
    const absoluteMonth = current.year * 12 + (current.month - 1) + step;
    const year = Math.floor(absoluteMonth / 12);
    const monthIndex = absoluteMonth % 12;
    const month = monthIndex + 1;
    const day = Math.min(current.day, daysInMonth(year, month));
    return formatIsoDate(new Date(Date.UTC(year, monthIndex, day)));
  }

  if (frequency === "yearly") {
    const year = current.year + step;
    const day = Math.min(current.day, daysInMonth(year, current.month));
    return formatIsoDate(new Date(Date.UTC(year, current.month - 1, day)));
  }

  throw new Error("Frequência de recorrência inválida.");
}

export function cashClosingDifference(expected, counted) {
  const expectedCents = Math.round(Number(expected || 0) * 100);
  const countedCents = Math.round(Number(counted || 0) * 100);
  return (countedCents - expectedCents) / 100;
}

export function validateRecurringWindow(startDate, nextDate, endDate = null) {
  const start = parseIsoDate(startDate).date.getTime();
  const next = parseIsoDate(nextDate).date.getTime();
  if (next < start) return false;
  if (!endDate) return true;
  const end = parseIsoDate(endDate).date.getTime();
  return end >= start && next <= end;
}
