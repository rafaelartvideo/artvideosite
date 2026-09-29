import {
  listExactServiceOrdersPage,
  type ExactOrderPage,
  type ExactOrderPageInput,
} from "./orders-filtered-page.repository";

export type CustomerNameOrderPageInput = ExactOrderPageInput;

export async function listServiceOrdersPageWithCustomerName(
  input: CustomerNameOrderPageInput,
): Promise<ExactOrderPage> {
  return listExactServiceOrdersPage(input);
}
