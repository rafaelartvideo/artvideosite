import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import type { Address } from "@/lib/address";
import {
  Package, Tag, Clock, CheckCircle, AlertCircle, Plus, X, Upload, AlertTriangle,
  ArrowLeft,
} from "lucide-react";

export type AdminTab =
  | "dashboard" | "services" | "categories" | "products" | "brands"
  | "equipment" | "generalServices" | "serviceTypes" | "inventory" | "situations" | "orderStatuses" | "documents"
  | "quotes" | "orders" | "agenda" | "customers" | "site" | "operation" | "employees" | "settings" | "contact";

export type AdminPageState = {
  breadcrumb: string;
  title: string;
  subtitle?: string;
  onBack: () => void;
} | null;

export const AdminPageContext = React.createContext<{
  page: AdminPageState;
  setPage: React.Dispatch<React.SetStateAction<AdminPageState>>;
} | null>(null);
export const AdminBackContext = React.createContext<(() => void) | null>(null);

/* ─────────────────────────── SHARED PRIMITIVES ─────────────────────────── */

export function cn(...cls: (string | false | null | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

export function slugify(value: string) {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function initialOrderStatus(statuses: any[]) {
  const ordered = [...statuses].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  return ordered.find(status => /abert|novo|recebid|pendente/i.test(status.name || "")) || ordered[0] || null;
}

export function getWhatsAppUrl(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export function formatPhone(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
