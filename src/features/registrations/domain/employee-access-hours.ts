export type AccessInterval = { start: string; end: string };
export type WeekdayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type AccessWeekday = { weekday: WeekdayNumber; intervals: AccessInterval[] };
export type EmployeeAccessHours = {
  enabled: boolean;
  timezone: "America/Sao_Paulo";
  days: AccessWeekday[];
};

export const ACCESS_WEEKDAYS: Array<{ weekday: WeekdayNumber; short: string; name: string }> = [
  { weekday: 1, short: "Seg", name: "Segunda-feira" },
  { weekday: 2, short: "Ter", name: "Terça-feira" },
  { weekday: 3, short: "Qua", name: "Quarta-feira" },
  { weekday: 4, short: "Qui", name: "Quinta-feira" },
  { weekday: 5, short: "Sex", name: "Sexta-feira" },
  { weekday: 6, short: "Sáb", name: "Sábado" },
  { weekday: 0, short: "Dom", name: "Domingo" },
];

export function emptyEmployeeAccessHours(): EmployeeAccessHours {
  return {
    enabled: false,
    timezone: "America/Sao_Paulo",
    days: ACCESS_WEEKDAYS.map(item => ({ weekday: item.weekday, intervals: [] })),
  };
}

export function normalizeEmployeeAccessHours(value: unknown): EmployeeAccessHours {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const days = Array.isArray(record.days) ? record.days : [];
  return {
    enabled: record.enabled === true,
    timezone: "America/Sao_Paulo",
    days: ACCESS_WEEKDAYS.map(({ weekday }) => {
      const day = days.find((entry: any) => Number(entry?.weekday) === weekday) as any;
      return {
        weekday,
        intervals: Array.isArray(day?.intervals)
          ? day.intervals.map((entry: any) => ({
            start: String(entry?.start ?? ""), end: String(entry?.end ?? ""),
          }))
          : [],
      };
    }),
  };
}

export function accessTimeMinutes(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function validateEmployeeAccessHours(hours: EmployeeAccessHours): string | null {
  if (hours.days.length !== 7 || new Set(hours.days.map(day => day.weekday)).size !== 7) {
    return "A agenda deve conter os sete dias da semana.";
  }
  for (const day of hours.days) {
    const name = ACCESS_WEEKDAYS.find(entry => entry.weekday === day.weekday)?.name || "Dia";
    if (day.intervals.length > 12) return name + ": limite de 12 intervalos por dia.";
    const intervals: Array<{ start: number; end: number }> = [];
    for (const interval of day.intervals) {
      const start = accessTimeMinutes(interval.start);
      const end = accessTimeMinutes(interval.end);
      if (start === null || end === null || start >= end) {
        return name + ": o início precisa ser anterior ao término.";
      }
      intervals.push({ start, end });
    }
    intervals.sort((a, b) => a.start - b.start);
    if (intervals.some((entry, index) => index > 0 && entry.start < intervals[index - 1].end)) {
      return name + ": existem intervalos sobrepostos.";
    }
  }
  return null;
}

export function withAccessDayIntervals(
  hours: EmployeeAccessHours,
  weekday: WeekdayNumber,
  intervals: AccessInterval[],
): EmployeeAccessHours {
  return {
    ...hours,
    days: hours.days.map(day => day.weekday === weekday ? { weekday, intervals } : day),
  };
}

export function nextFreeAccessInterval(intervals: AccessInterval[]): AccessInterval | null {
  if (intervals.length >= 12) return null;
  const sorted = intervals.map(entry => ({
    start: accessTimeMinutes(entry.start), end: accessTimeMinutes(entry.end),
  })).filter((entry): entry is { start: number; end: number } =>
    entry.start !== null && entry.end !== null && entry.start < entry.end,
  ).sort((a, b) => a.start - b.start);
  // Priorizar intervalos comerciais; ao adicionar um segundo, tentar 13:00-14:00.
  for (const proposedStart of [13 * 60, 8 * 60, ...Array.from({ length: 24 }, (_, i) => i * 60)]) {
    const proposedEnd = proposedStart + 60;
    if (proposedEnd > 23 * 60 + 59) continue;
    if (!sorted.some(entry => proposedStart < entry.end && proposedEnd > entry.start)) {
      const format = (minute: number) => String(Math.floor(minute / 60)).padStart(2, "0") + ":"
        + String(minute % 60).padStart(2, "0");
      return { start: format(proposedStart), end: format(proposedEnd) };
    }
  }
  return null;
}
