export const STORE_ORDER_COLUMNS = "id,order_number,created_at,status,payment_issue_status,payment_issue_at,quantity,inventory_item_id,product_name,unit_price,shipping_price,shipping_service_id,shipping_service_name,postal_code,buyer,preference_id,payment_id,payment_provider,paid_at,expires_at";

// Advance by the actual response size: PostgREST may cap a requested range.
async function readPages(makeQuery, signal, maximum = Infinity) {
  const rows = [];
  while (rows.length < maximum) {
    signal.throwIfAborted();
    const { data, error, count } = await makeQuery()
      .range(rows.length, Math.min(rows.length + 199, maximum - 1)).abortSignal(signal);
    if (error) throw error;
    if (!data?.length) {
      if (count != null && rows.length < Math.min(count, maximum)) throw new Error("A consulta de pedidos retornou uma página incompleta.");
      break;
    }
    rows.push(...data);
    if (count != null && rows.length >= count) break;
  }
  return rows;
}

export async function loadStoreOrdersSnapshot(client, organizationId, signal) {
  if (!organizationId) return { orders: [], lines: [], fulfillments: [], supportCases: [] };
  const orders = await readPages(() => client.from("artvideo_store_orders")
    .select(STORE_ORDER_COLUMNS, { count: "exact" }).eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }), signal, 500);
  const ids = orders.map(order => order.id);
  if (!ids.length) return { orders, lines: [], fulfillments: [], supportCases: [] };
  const children = async (table, columns, orderKey) => {
    const rows = [];
    // Keep UUID filters below proxy URL limits even for the full order window.
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);
      rows.push(...await readPages(() => client.from(table)
        .select(columns, { count: "exact" }).eq("organization_id", organizationId)
        .in("order_id", batch).order(orderKey, { ascending: true }), signal));
    }
    return rows;
  };
  const [lines, fulfillments, supportCases] = await Promise.all([
    children("artvideo_store_order_items", "id,order_id,inventory_item_id,product_name,quantity,unit_price", "id"),
    children("artvideo_store_fulfillments", "order_id,status,updated_at,recipient_name,delivered_at", "order_id"),
    children("artvideo_store_support_cases", "order_id,status", "id"),
  ]);
  return { orders, lines, fulfillments, supportCases };
}

// All triggers share one request; events received in flight require one final
// reconciliation. Disposed company/page instances cannot publish late results.
export function createStoreOrdersRefresh({ load, onSnapshot, onError = () => {}, onLoading = () => {}, delay = 200 }) {
  const controller = new AbortController();
  let disposed = false, pending = false, flight = null, timer = null;
  const request = (silent = false) => {
    if (disposed) return Promise.resolve();
    if (timer !== null) { clearTimeout(timer); timer = null; }
    pending = true;
    if (!silent) onLoading(true);
    if (flight) return flight;
    flight = (async () => {
      try {
        while (pending && !disposed) {
          pending = false;
          try {
            const snapshot = await load(controller.signal);
            if (!disposed && !pending) onSnapshot(snapshot);
          } catch (error) {
            if (!disposed && !pending) onError(error);
          }
        }
      } finally {
        flight = null;
        if (!disposed) onLoading(false);
      }
    })();
    return flight;
  };
  return {
    request,
    schedule() {
      if (disposed) return;
      if (flight) { pending = true; return; }
      if (timer === null) timer = setTimeout(() => { timer = null; void request(true); }, delay);
    },
    dispose() {
      disposed = true;
      pending = false;
      if (timer !== null) clearTimeout(timer);
      controller.abort();
    },
  };
}
