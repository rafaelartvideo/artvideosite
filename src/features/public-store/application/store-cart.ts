import { useSyncExternalStore } from "react";

export type StoreCartItem = { productId: string; quantity: number };
const STORAGE_KEY = "artvideo-public-cart-v1";
const EVENT_NAME = "artvideo-cart-changed";
const MAX_PRODUCTS = 15;
const MAX_QUANTITY = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let snapshot: StoreCartItem[] = [];
let serialized = "[]";
let initialized = false;

function validate(value: unknown): StoreCartItem[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, number>();
  for (const item of value.slice(0, MAX_PRODUCTS)) {
    if (!item || !UUID.test(String(item.productId))) continue;
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1) continue;
    byId.set(item.productId, Math.min(MAX_QUANTITY, qty));
  }
  return Array.from(byId, ([productId, quantity]) => ({ productId, quantity }));
}
function load() {
  if (initialized) return;
  initialized = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    serialized = JSON.stringify(validate(raw ? JSON.parse(raw) : []));
    snapshot = JSON.parse(serialized);
  } catch { snapshot = []; serialized = "[]"; }
}
function save(items: StoreCartItem[]) {
  load();
  const next = JSON.stringify(validate(items));
  if (next === serialized) return;
  serialized = next;
  snapshot = JSON.parse(next);
  try { localStorage.setItem(STORAGE_KEY, serialized); } catch { /* Sem armazenamento, o carrinho permanece em memória. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT_NAME));
}
function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const external = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const next = JSON.stringify(validate(raw ? JSON.parse(raw) : []));
      if (next !== serialized) { serialized = next; snapshot = JSON.parse(next); }
    } catch { /* Ignore dados inválidos. */ }
    onChange();
  };
  window.addEventListener(EVENT_NAME, onChange);
  window.addEventListener("storage", external);
  return () => {
    window.removeEventListener(EVENT_NAME, onChange);
    window.removeEventListener("storage", external);
  };
}
export function useStoreCart() {
  const items = useSyncExternalStore(subscribe, () => { load(); return snapshot; }, () => []);
  return { items, count: items.reduce((count, item) => count + item.quantity, 0) };
}
export function addStoreCartItem(productId: string, quantity = 1): boolean {
  load();
  if (!UUID.test(productId)) return false;
  const existing = snapshot.find(item => item.productId === productId);
  if (!existing && snapshot.length >= MAX_PRODUCTS) return false;
  const qty = Math.max(1, Math.min(MAX_QUANTITY, Math.floor(quantity)));
  save(existing ? snapshot.map(item => item.productId === productId
    ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + qty) } : item)
    : [...snapshot, { productId, quantity: qty }]);
  return true;
}
export function updateStoreCartQuantity(productId: string, quantity: number) {
  load();
  if (quantity <= 0) return removeStoreCartItem(productId);
  save(snapshot.map(item => item.productId === productId
    ? { ...item, quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.floor(quantity))) } : item));
}
export function removeStoreCartItem(productId: string) {
  load(); save(snapshot.filter(item => item.productId !== productId));
}
export function clearStoreCart() { save([]); }
