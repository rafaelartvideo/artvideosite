/** Padroniza referências de OS exibidas no Financeiro, sem alterar os dados originais. */
export function formatFinanceOriginLabel(input) {
  if (input == null) return "";
  return String(input).replace(/\b(?:OS|Ordem\s+de\s+Servi[cç]o)\s*#?\s*(\d+)\b/gi,
    (_, number) => `OS ${number.replace(/^0+(?=\d)/, "")}`);
}

export function financeServiceOrderLabel(number) {
  const value = String(number ?? "").trim();
  if (!value) return "Ordem de Serviço";
  return formatFinanceOriginLabel(/^OS\b/i.test(value) ? value : `OS ${value}`);
}
