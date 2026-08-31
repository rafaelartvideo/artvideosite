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
  | "equipment" | "generalServices" | "serviceTypes" | "inventory" | "situations" | "orderStatuses"
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
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export type CustomerType = "PF" | "PJ";
export type CustomerForm = {
  customerType: CustomerType;
  full_name: string;
  email: string;
  phone: string;
  whatsapp: string;
  document: string;
  trade_name: string;
  legal_name: string;
  cnpj: string;
  state_registration: string;
  foundation_date: string;
  birth_date: string;
};

export const emptyCustomerForm: CustomerForm = { customerType: "PF", full_name: "", email: "", phone: "", whatsapp: "", document: "", trade_name: "", legal_name: "", cnpj: "", state_registration: "", foundation_date: "", birth_date: "" };

export function formatCpf(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
  return digits.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function isValidCpf(value: string): boolean {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 11 || /^([0-9])\1{10}$/.test(digits)) return false;
  const firstCheckDigit = digits.slice(0, 9).split("").reduce((sum, digit, index) => sum + Number(digit) * (10 - index), 0);
  const firstRemainder = (firstCheckDigit * 10) % 11;
  const firstExpected = firstRemainder === 10 ? 0 : firstRemainder;
  if (firstExpected !== Number(digits[9])) return false;
  const secondCheckDigit = digits.slice(0, 10).split("").reduce((sum, digit, index) => sum + Number(digit) * (11 - index), 0);
  const secondRemainder = (secondCheckDigit * 10) % 11;
  const secondExpected = secondRemainder === 10 ? 0 : secondRemainder;
  return secondExpected === Number(digits[10]);
}

export function formatCnpj(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 14);
  return digits.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4").replace(/(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function formatFoundationDate(value: string) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{2})(\d)/, "$1/$2").replace(/(\d{2})\/(\d{2})(\d)/, "$1/$2/$3");
}

export function foundationDateToIso(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

export function foundationDateFromCustomer(value?: string | null) {
  if (!value) return "";
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatDateOnly(value?: string | null) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function todayDateOnly() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function customerFormFromCustomer(customer: any): CustomerForm {
  const customerType: CustomerType = customer.customer_type === "PJ" ? "PJ" : "PF";
  return {
    customerType,
    full_name: customer.full_name || "",
    email: customer.email || "",
    phone: formatPhone(customer.phone),
    whatsapp: formatPhone(customer.whatsapp),
    document: formatCpf(customer.document || ""),
    trade_name: customer.trade_name || "",
    legal_name: customer.legal_name || "",
    cnpj: formatCnpj(customer.cnpj || ""),
    state_registration: customer.state_registration || "",
    foundation_date: foundationDateFromCustomer(customer.foundation_date),
    birth_date: customer.birth_date || "",
  };
}

export function customerPayload(form: CustomerForm) {
  return {
    customer_type: form.customerType,
    full_name: (form.customerType === "PJ" ? form.trade_name : form.full_name).trim(),
    email: form.email.trim() || null,
    phone: form.phone.replace(/\D/g, "") || null,
    whatsapp: form.whatsapp.replace(/\D/g, "") || null,
    document: form.customerType === "PF" ? form.document.replace(/\D/g, "") || null : null,
    trade_name: form.customerType === "PJ" ? form.trade_name.trim() || null : null,
    legal_name: form.customerType === "PJ" ? form.legal_name.trim() || null : null,
    cnpj: form.customerType === "PJ" ? form.cnpj.replace(/\D/g, "") || null : null,
    state_registration: form.customerType === "PJ" ? form.state_registration.trim() || null : null,
    foundation_date: form.customerType === "PJ" ? foundationDateToIso(form.foundation_date) : null,
    birth_date: form.customerType === "PF" ? form.birth_date || null : null,
  };
}

export function customerUpdatePayload(form: CustomerForm) {
  const payload = customerPayload(form);
  const { customer_type: _customerType, document: _document, cnpj: _cnpj, ...editableFields } = payload;
  return editableFields;
}

export function validateCustomerForm(form: CustomerForm) {
  if (!form.whatsapp.trim() && !form.phone.trim()) return "Telefone ou WhatsApp é obrigatório.";
  if (form.customerType === "PF" && !form.full_name.trim()) return "Nome completo é obrigatório.";
  if (form.customerType === "PF" && form.document.replace(/\D/g, "").length !== 11) return "CPF é obrigatório e deve estar completo.";
  if (form.customerType === "PF" && !form.birth_date) return "Data de nascimento é obrigatória.";
  if (form.customerType === "PF" && form.birth_date > todayDateOnly()) return "A data de nascimento não pode ser futura.";
  if (form.customerType === "PJ" && !form.trade_name.trim()) return "Nome fantasia é obrigatório.";
  if (form.customerType === "PJ" && form.cnpj.replace(/\D/g, "").length !== 14) return "CNPJ é obrigatório e deve estar completo.";
  return null;
}

export async function fetchCnpjData(cnpj: string) {
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj.replace(/\D/g, "")}`);
  if (!response.ok) throw new Error("CNPJ não encontrado.");
  return response.json();
}

export function applyCnpjData(form: CustomerForm, address: Address, data: any) {
  return {
    form: {
      ...form,
      full_name: form.full_name || data.nome_fantasia || data.razao_social || "",
      trade_name: form.trade_name || data.nome_fantasia || "",
      legal_name: form.legal_name || data.razao_social || "",
      state_registration: form.state_registration || data.inscricao_estadual || "",
      foundation_date: form.foundation_date || (data.data_inicio_atividade ? formatFoundationDate(data.data_inicio_atividade.split("-").reverse().join("/")) : ""),
      email: form.email || data.email || "",
      phone: formatPhone(form.phone || data.ddd_telefone_1 || ""),
      whatsapp: formatPhone(form.whatsapp || data.ddd_telefone_1 || ""),
    },
    address: {
      ...address,
      zip_code: address.zip_code || data.cep || "",
      street: address.street || data.logradouro || "",
      number: address.number || data.numero || "",
      complement: address.complement || data.complemento || "",
      neighborhood: address.neighborhood || data.bairro || "",
      city: address.city || data.municipio || "",
      state: address.state || data.uf || "",
    },
  };
}

export async function generateUniqueSlug(table: "service_categories" | "product_categories" | "products" | "brands", value: string, excludeId?: string) {
  const baseSlug = slugify(value);
  const { data, error } = await supabase.from(table).select("id, slug");
  if (error) {
    console.error("[ADMIN] Slug lookup error:", error);
    throw error;
  }

  const existingSlugs = new Set((data || []).filter((item: any) => item.id !== excludeId).map((item: any) => item.slug));
  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) suffix += 1;
  return `${baseSlug}-${suffix}`;
}

export const INPUT = "w-full bg-[#f8fafc] border border-[#0d1b2e]/15 rounded-lg px-3 py-2.5 text-sm text-[#0d1b2e] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/50 focus:border-[#0057e7] focus:bg-white transition-all placeholder-[#5a6a82]/50";

export function FInput({ label, required, hint, disabled = false, ...props }: { label?: string; required?: boolean; hint?: string; disabled?: boolean; [k: string]: any }) {
  const isColorInput = props.type === "color";
  const { className, ...restProps } = props;
  const inputProps = { ...restProps, type: isColorInput ? "text" : props.type, maxLength: isColorInput ? 7 : props.maxLength, placeholder: isColorInput ? "#2563EB" : props.placeholder };
  return (
    <div>
      {label && (
        <label className="flex items-baseline gap-1 text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">
          {label}{required && <span className="text-red-400">*</span>}
        </label>
      )}
      <input className={cn(INPUT, disabled && "disabled:cursor-not-allowed disabled:bg-slate-100/60 disabled:text-slate-500 disabled:opacity-70 disabled:hover:bg-slate-100/60 disabled:focus:ring-0", className)} disabled={disabled} {...inputProps} />
      {(hint || isColorInput) && <p className="text-[10px] text-[#5a6a82] mt-1">{hint || "Use o formato #RRGGBB."}</p>}
    </div>
  );
}


function currencyInputDisplay(value: unknown) {
  if (value == null || value === "") return "";
  const raw = String(value);
  const numericValue = /^\d+(?:\.\d+)?$/.test(raw)
    ? Number(raw)
    : Number(raw.replace(/[^\d]/g, "")) / 100;
  if (!Number.isFinite(numericValue)) return "";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numericValue);
}

function currencyInputValue(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return (Number(digits) / 100).toFixed(2);
}

export function FCurrencyInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [k: string]: any }) {
  return <FInput {...props} type="text" inputMode="numeric" value={currencyInputDisplay(value)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: currencyInputValue(event.target.value) } })} />;
}

function hoursInputDisplay(value: unknown) {
  if (value == null || value === "") return "";
  const totalMinutes = Math.max(0, Math.round(Number(value) * 60));
  if (!Number.isFinite(totalMinutes)) return "";
  const hours = Math.min(99, Math.floor(totalMinutes / 60));
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function hoursInputValue(value: string) {
  const rawDigits = value.replace(/\D/g, "");
  if (!rawDigits) return "";
  const digits = rawDigits.slice(-4).padStart(4, "0");
  const hours = Number(digits.slice(0, 2));
  const minutes = Math.min(59, Number(digits.slice(2)));
  return String(hours + minutes / 60);
}

export function FHoursInput({ value, onChange, ...props }: { value: unknown; onChange: (event: { target: { value: string } }) => void; [k: string]: any }) {
  return <FInput {...props} type="text" inputMode="numeric" maxLength={5} value={hoursInputDisplay(value)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange({ target: { value: hoursInputValue(event.target.value) } })} />;
}

export function CustomerTypeToggle({ value, onChange, disabled = false }: { value: CustomerType; onChange: (value: CustomerType) => void; disabled?: boolean }) {
  return (
    <div className="sm:col-span-2">
      <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Tipo de cliente</label>
      <div className="grid grid-cols-2 rounded-lg border border-[#0d1b2e]/15 overflow-hidden">
        {[{ value: "PF" as const, label: "PESSOA FÍSICA" }, { value: "PJ" as const, label: "PESSOA JURÍDICA" }].map(option => (
          <button key={option.value} type="button" disabled={disabled} onClick={() => onChange(option.value)} className={`px-3 py-2.5 text-xs font-black tracking-wide transition-colors ${value === option.value ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]"} ${disabled ? "cursor-not-allowed opacity-70" : ""}`} aria-pressed={value === option.value}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}

export function FTextarea({ label, rows = 3, ...props }: { label?: string; rows?: number; [k: string]: any }) {
  return (
    <div>
      {label && <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>}
      <textarea rows={rows} className={cn(INPUT, "resize-none")} {...props} />
    </div>
  );
}

export function FSelect({ label, options, ...props }: { label?: string; options: { value: string; label: string }[]; [k: string]: any }) {
  return (
    <div>
      {label && <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>}
      <select className={cn(INPUT, "cursor-pointer")} {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function FToggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left">
      <div className={cn("relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200", checked ? "bg-[#0057e7]" : "bg-[#0d1b2e]/20")}>
        <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200", checked ? "translate-x-6" : "translate-x-1")} />
      </div>
      <div>
        <span className="text-sm font-semibold text-[#0d1b2e]">{label}</span>
        {description && <p className="text-xs text-[#5a6a82]">{description}</p>}
      </div>
    </button>
  );
}

export function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export function StatusBadge({ status, color }: { status: string; color?: string | null }) {
  const s = (status || "").toLowerCase();
  let cls = "bg-blue-100 text-blue-800";
  if (s.includes("conclu") || s.includes("pronto") || s.includes("finaliz") || s.includes("entregue") || s.includes("aprovad")) cls = "bg-emerald-100 text-emerald-800";
  else if (s.includes("pendent") || s.includes("aguard") || s.includes("anál") || s.includes("analise")) cls = "bg-amber-100 text-amber-800";
  else if (s.includes("cancel") || s.includes("recusad")) cls = "bg-red-100 text-red-800";
  else if (s.includes("ativo") || s.includes("ativa")) cls = "bg-emerald-100 text-emerald-800";
  else if (s.includes("inativo") || s.includes("inativa")) cls = "bg-red-100 text-red-800";
  return <span className={cn("inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", color && isHexColor(color) ? "border" : cls)} style={color && isHexColor(color) ? { color, backgroundColor: `${color}20`, borderColor: `${color}55` } : undefined}>{status || "—"}</span>;
}

export function LoadingState({ text = "Carregando..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Clock size={28} className="animate-spin text-[#0057e7]" />
      <p className="text-sm text-[#5a6a82]">{text}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon = Package, title, message, onAdd, addLabel = "Adicionar" }: {
  icon?: React.ElementType; title: string; message?: string; onAdd?: () => void; addLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-16 h-16 bg-[#0057e7]/8 rounded-2xl flex items-center justify-center">
        <Icon size={28} className="text-[#0057e7]/50" />
      </div>
      <div className="text-center max-w-xs">
        <p className="font-bold text-[#0d1b2e] mb-1">{title}</p>
        {message && <p className="text-sm text-[#5a6a82]">{message}</p>}
      </div>
      {onAdd && (
        <button onClick={onAdd} className="flex items-center gap-2 bg-[#0057e7] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#0046c0] transition-colors">
          <Plus size={16} /> {addLabel}
        </button>
      )}
    </div>
  );
}

export function PaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-[#0d1b2e]/8 bg-[#f8fafc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-[#5a6a82]">
        <span>Linhas:</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className={cn(INPUT, "w-[82px] py-2 text-xs")}
        >
          {[5, 10, 20, 30, 50, 100].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]" aria-label="Primeira página">
          «
        </button>
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]" aria-label="Página anterior">
          ‹
        </button>
        <span className="min-w-[92px] text-center text-xs font-bold text-[#0d1b2e]">{page} de {totalPages}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]" aria-label="Próxima página">
          ›
        </button>
        <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]" aria-label="Última página">
          »
        </button>
      </div>
    </div>
  );
}

export function Toast({ message, type = "success", onClose }: { message: string; type?: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={cn("fixed bottom-6 right-6 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl border text-sm font-semibold max-w-sm",
      type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800")}>
      {type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose}><X size={15} /></button>
    </div>
  );
}

export function AdminPage({ open, onClose, title, subtitle, breadcrumb, children, fullPage = false }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; breadcrumb: string; children: React.ReactNode; maxW?: string; fullPage?: boolean;
}) {
  const navigation = React.useContext(AdminPageContext);
  const setPage = navigation?.setPage;

  useEffect(() => {
    if (!open) return;
    setPage?.({ breadcrumb, title, subtitle, onBack: onClose });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setPage?.(null);
    };
  }, [open, breadcrumb, title, subtitle, setPage]);

  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[35] bg-[#f8fafc]">
      {!fullPage && <button type="button" onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 z-10 p-2 text-[#5a6a82] bg-white border border-[#0d1b2e]/10 rounded-lg shadow-sm hover:text-[#0057e7] hover:bg-[#f5f7fa]"><X size={16} /></button>}
      <div className="max-w-6xl mx-auto w-full p-4 sm:p-8">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#0d1b2e]/8 overflow-hidden">
      <div className="px-5 py-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">
        <h3 className="text-[10px] font-black text-[#0d1b2e] uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export async function getAuthenticatedSession() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session?.user?.id) throw new Error("Não existe sessão autenticada. Faça login novamente para enviar imagens.");
  console.log("[MEDIA] auth user:", session.user.id);
  console.log("[MEDIA] access token exists:", !!session.access_token);
  return session;
}

export async function createMediaRecord({
  bucket,
  path,
  file,
}: {
  bucket: "service-images" | "product-images" | "brand-images" | "avatars" | "public-assets";
  path: string;
  file: File;
}) {
  const session = await getAuthenticatedSession();
  const { data: media, error } = await supabase
    .from("media")
    .insert({
      bucket_id: bucket,
      storage_path: path,
      file_name: file.name,
      file_size: file.size || null,
      mime_type: file.type || null,
      alt_text: file.name,
      uploaded_by: session.user.id,
    })
    .select("id")
    .single();

  if (error || !media?.id) {
    console.error("[MEDIA] media insert error:", error);
    throw new Error(error?.message || "Não foi possível registrar a imagem.");
  }

  console.log("[MEDIA] record created:", { mediaId: media.id, uploadedBy: session.user.id });
  return media.id as string;
}

export function supabaseErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const value = error as { message?: string; details?: string; hint?: string; code?: string };
    return [value.message, value.details, value.hint, value.code ? `Código: ${value.code}` : ""].filter(Boolean).join(" | ");
  }
  return error instanceof Error ? error.message : String(error);
}

export function ImageUpload({ bucket, currentMediaId, onUpload, label = "Imagem", canUpload = true }: {
  bucket: "service-images" | "product-images" | "brand-images" | "avatars" | "public-assets"; currentMediaId?: string | null; onUpload: (mediaId: string) => void; label?: string; canUpload?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const { url: currentUrl } = useMediaUrl(currentMediaId);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

const handleFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      e.target.files?.[0];

    if (!file) return;

    const objectUrl =
      URL.createObjectURL(file);

    setPreviewUrl(objectUrl);
    setUploading(true);

    try {
      const ext =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase();

      const path =
        `${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 6)}.${ext}`;

      /* ================================================
        Upload para Storage
        ================================================ */

      const {
        error: uploadError,
      } =
        await supabase.storage
          .from(bucket)
          .upload(
            path,
            file,
            {
              upsert: true,
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      /* ================================================
        Registro em public.media através da Edge Function
        ================================================ */

      try {
        const mediaId =
          await createMediaRecord({
            bucket,
            path,
            file,
          });

        onUpload(mediaId);
        setPreviewUrl(null);
      } catch (mediaError) {
        /*
        * Se Storage funcionou mas public.media falhou,
        * remove o arquivo para evitar arquivo órfão.
        */

        console.error(
          "[MEDIA] media record error:",
          mediaError
        );

        const {
          error: removeError,
        } =
          await supabase.storage
            .from(bucket)
            .remove([
              path,
            ]);

        if (removeError) {
          console.warn(
            "[MEDIA] orphan cleanup failed:",
            removeError
          );
        }

        throw mediaError;
      }
    } catch (error) {
      console.error(
        "[SUPABASE] Image upload error:",
        error
      );

      alert(
        supabaseErrorMessage(
          error
        )
      );
    } finally {
      setUploading(false);

      /*
      * Permite selecionar novamente o mesmo arquivo.
      */
      e.currentTarget.value = "";
    }
  };

  const displayUrl = previewUrl || currentUrl;

  return (
    <div>
      <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-2">{label}</label>
      {displayUrl && (
        <div className="mb-3 w-36 h-28 rounded-xl overflow-hidden border border-[#0d1b2e]/15 bg-[#f5f7fa]">
          <img src={displayUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      {canUpload && <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
        className="flex items-center gap-2 text-xs font-bold text-[#0057e7] border border-[#0057e7]/40 hover:border-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
        <Upload size={13} /> {uploading ? "Enviando..." : displayUrl ? "Trocar imagem" : "Selecionar imagem"}
      </button>}
    </div>
  );
}

export function ProductAdminThumb({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#0d1b2e]/10" /> : <div className="w-10 h-10 bg-[#f5f7fa] rounded-lg flex-shrink-0 border border-[#0d1b2e]/10 flex items-center justify-center"><Package size={16} className="text-[#5a6a82]" /></div>;
}

export function BrandAdminLogo({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="h-12 w-auto object-contain max-w-full" /> : <div className="w-12 h-12 bg-[#f5f7fa] rounded-lg flex items-center justify-center"><Tag size={20} className="text-[#5a6a82]" /></div>;
}

export function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[150]">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#0d1b2e]/10">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <p className="font-bold text-[#0d1b2e] mb-1">Confirmar exclusão</p>
            <p className="text-sm text-[#5a6a82] leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 border border-[#0d1b2e]/15 rounded-lg text-sm font-bold text-[#0d1b2e] hover:bg-[#f5f7fa] transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">Excluir</button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const onBack = React.useContext(AdminBackContext);
  return (
    <div className="flex items-start justify-between gap-4 mb-5">
      <div className="min-w-0">
        
        {subtitle && null}
      </div>
      {(actions || onBack) && <div className="flex items-center gap-2 flex-shrink-0">{onBack && <InternalBackButton onBack={onBack} inHeader />}{actions}</div>}
    </div>
  );
}

export function BtnPrimary({ children, onClick, disabled, type = "button", className = "" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cn("inline-flex items-center gap-2 whitespace-nowrap bg-[#0057e7] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#0046c0] transition-colors disabled:opacity-50 cursor-pointer", className)}>
      {children}
    </button>
  );
}

export function BtnSecondary({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("inline-flex items-center gap-2 whitespace-nowrap border border-[#0d1b2e]/15 text-[#0d1b2e] px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#f5f7fa] transition-colors cursor-pointer", className)}>
      {children}
    </button>
  );
}


export function InternalBackButton({ onBack, inHeader = false }: { onBack: () => void; inHeader?: boolean }) {
  const contextualBack = React.useContext(AdminBackContext);
  if (!inHeader && contextualBack === onBack) return null;
  return <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5a6a82] hover:text-[#0057e7] transition-colors"><ArrowLeft size={14} /> Voltar</button>;
}