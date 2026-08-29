import { normalizeSearchText } from "./order-search";

const normalizeDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeIdentifier = (value: unknown) =>
  String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

type CityFilter = { name: string; state: string };
type OrderSort = "asc" | "desc" | "";

export const filterServiceOrders = ({
  orders,
  search,
  statusId,
  situationId,
  orderType,
  serviceTypeId,
  states,
  stateOptions,
  cities,
  dateFrom,
  dateTo,
  invalidPeriod,
  getStateLabel,
  getEquipmentSummary,
}: {
  orders: any[];
  search: string;
  statusId: string;
  situationId: string;
  orderType: string;
  serviceTypeId: string;
  states: string[];
  stateOptions: Array<{ sigla: string; nome: string }>;
  cities: CityFilter[];
  dateFrom: string;
  dateTo: string;
  invalidPeriod: boolean;
  getStateLabel: (state: unknown) => string;
  getEquipmentSummary: (order: any) => string;
}) =>
  orders.filter((order) => {
    const query = normalizeSearchText(search);
    const queryDigits = normalizeDigits(search);
    const queryIdentifier = normalizeIdentifier(search);
    const customer = order.customer || {};
    const normalizedState = normalizeSearchText(order.service_state);
    const orderTypeLabel =
      order.order_type === "external" ? "externa external" : "interna internal";
    const searchableText = [
      order.os_number,
      `OS ${order.os_number || ""}`,
      order.external_os_number,
      orderTypeLabel,
      order.service?.title,
      customer.full_name,
      customer.trade_name,
      order.service_type?.title,
      getEquipmentSummary(order),
      order.model,
      order.serial_number,
      order.service_zip_code,
      order.service_state,
      getStateLabel(order.service_state),
      order.service_city,
      order.service_neighborhood,
      order.service_street,
      order.service_number,
      order.service_complement,
    ]
      .map(normalizeSearchText)
      .join(" ");

    const normalizedOrderNumbers = [
      order.os_number,
      `OS ${order.os_number || ""}`,
    ].map(normalizeIdentifier);
    const customerIdentifiers = [customer.document, customer.cnpj];
    const matchesSearch =
      !query ||
      searchableText.includes(query) ||
      normalizedOrderNumbers.some((value) => value.includes(queryIdentifier)) ||
      (queryDigits.length > 0 &&
        customerIdentifiers.some((value) =>
          normalizeDigits(value).includes(queryDigits),
        ));

    const matchesState =
      states.length === 0 ||
      states.some((state) => {
        const normalizedOption = normalizeSearchText(state);
        const stateOption = stateOptions.find(
          (item) => normalizeSearchText(item.sigla) === normalizedOption,
        );
        return (
          normalizedState === normalizedOption ||
          (stateOption &&
            normalizedState === normalizeSearchText(stateOption.nome))
        );
      });
    const matchesCity =
      cities.length === 0 ||
      cities.some(
        (city) =>
          normalizeSearchText(order.service_city) === normalizeSearchText(city.name) &&
          normalizedState === normalizeSearchText(city.state),
      );

    const createdAt = order.created_at ? new Date(order.created_at) : null;
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toExclusive = dateTo ? new Date(`${dateTo}T00:00:00`) : null;
    if (toExclusive) toExclusive.setDate(toExclusive.getDate() + 1);
    const matchesPeriod =
      invalidPeriod ||
      (!!createdAt &&
        (!from || createdAt >= from) &&
        (!toExclusive || createdAt < toExclusive));

    return (
      matchesSearch &&
      (!statusId || order.status_id === statusId) &&
      (!situationId || order.situation_id === situationId) &&
      (!orderType || order.order_type === orderType) &&
      (!serviceTypeId || order.service_type_id === serviceTypeId) &&
      matchesState &&
      matchesCity &&
      matchesPeriod
    );
  });

export const sortServiceOrders = (orders: any[], order: OrderSort) => {
  if (!order) return orders;
  return [...orders].sort((left, right) => {
    const leftNumber = Number(
      String(left.os_number ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY,
    );
    const rightNumber = Number(
      String(right.os_number ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY,
    );
    const numberComparison = leftNumber - rightNumber;
    if (numberComparison !== 0) {
      return order === "asc" ? numberComparison : -numberComparison;
    }
    const dateComparison = String(left.created_at ?? "").localeCompare(
      String(right.created_at ?? ""),
    );
    if (dateComparison !== 0) {
      return order === "asc" ? dateComparison : -dateComparison;
    }
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  });
};
