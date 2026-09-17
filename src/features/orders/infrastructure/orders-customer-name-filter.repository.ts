import {
  listExactServiceOrdersPage,
  type ExactOrderPage,
  type ExactOrderPageInput,
} from "./orders-filtered-page.repository";

export type CustomerNameOrderPageInput = ExactOrderPageInput & {
  customerNameSearch?: string;
};

const normalizeText = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .trim()
  .toLocaleLowerCase("pt-BR");

function matchesCustomerName(order: any, search: string) {
  const needle = normalizeText(search);
  if (!needle) return true;
  const customer = order?.customer || {};
  return [customer.full_name, customer.trade_name, customer.legal_name]
    .some(value => normalizeText(value).includes(needle));
}

export async function listServiceOrdersPageWithCustomerName(
  input: CustomerNameOrderPageInput,
): Promise<ExactOrderPage> {
  const { customerNameSearch = "", page, pageSize, ...baseFilters } = input;
  if (!customerNameSearch.trim()) {
    return listExactServiceOrdersPage({ ...baseFilters, page, pageSize });
  }

  const chunkSize = 200;
  const allItems: any[] = [];
  let sourcePage = 1;
  let sourceTotal = 0;

  do {
    const result = await listExactServiceOrdersPage({
      ...baseFilters,
      page: sourcePage,
      pageSize: chunkSize,
    });
    sourceTotal = result.total;
    allItems.push(...result.items);
    sourcePage += 1;
  } while (allItems.length < sourceTotal);

  const matched = allItems.filter(order => matchesCustomerName(order, customerNameSearch));
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const start = (safePage - 1) * safePageSize;

  return {
    items: matched.slice(start, start + safePageSize),
    total: matched.length,
  };
}