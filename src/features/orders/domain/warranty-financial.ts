/** Customer-facing values recorded on the completed OS. Never derive prices from the catalog. */
export type WarrantyFinancial = {
  service_price: number | string | null;
  parts_total: number | string | null;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  final_total: number | string | null;
  no_charge?: boolean;
};

export function warrantyMoney(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Não registrado";
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("pt-BR", {style:"currency",currency:"BRL"}) : "Não registrado";
}

export function warrantyFinancialRows(values: WarrantyFinancial) {
  if (values.no_charge) return [{label:"Total cobrado do cliente",value:warrantyMoney(values.final_total),kind:"total"}];
  return [
    {label:"Total de serviços",value:warrantyMoney(values.service_price),kind:"normal"},
    {label:"Total de produtos",value:warrantyMoney(values.parts_total),kind:"normal"},
    {label:"Subtotal",value:warrantyMoney(values.subtotal),kind:"normal"},
    {label:"Desconto",value:warrantyMoney(values.discount_amount),kind:"discount"},
    {label:"Valor final",value:warrantyMoney(values.final_total),kind:"total"},
  ];
}
