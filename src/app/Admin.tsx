import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import {
  LayoutDashboard, Wrench, FolderTree, Package, Tag, FileText, ClipboardList,
  Users, Settings, Phone, LogOut, Search, Plus, Edit2, Trash2, CheckCircle,
  AlertCircle, Clock, RefreshCw, X, ArrowLeft, Menu, Upload, AlertTriangle,
  Star, Filter, DollarSign, List, HelpCircle, ChevronDown, MessageCircle,
  Mail, MapPin, Instagram, Globe, Hash, Activity, Shield,
} from "lucide-react";

type AdminTab =
  | "dashboard" | "services" | "categories" | "products" | "brands"
  | "quotes" | "orders" | "customers" | "employees" | "settings" | "contact";

/* ─────────────────────────── SHARED PRIMITIVES ─────────────────────────── */

function cn(...cls: (string | false | null | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}

function slugify(value: string) {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generateOsProtocol() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `OS-${y}${m}${d}-${rand}`;
}

async function generateUniqueSlug(table: "service_categories" | "product_categories" | "products" | "brands", value: string, excludeId?: string) {
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

const INPUT = "w-full bg-[#f8fafc] border border-[#0d1b2e]/15 rounded-lg px-3 py-2.5 text-sm text-[#0d1b2e] focus:outline-none focus:ring-2 focus:ring-[#0057e7]/50 focus:border-[#0057e7] focus:bg-white transition-all placeholder-[#5a6a82]/50";

function FInput({ label, required, hint, ...props }: { label?: string; required?: boolean; hint?: string; [k: string]: any }) {
  return (
    <div>
      {label && (
        <label className="flex items-baseline gap-1 text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">
          {label}{required && <span className="text-red-400">*</span>}
        </label>
      )}
      <input className={INPUT} {...props} />
      {hint && <p className="text-[10px] text-[#5a6a82] mt-1">{hint}</p>}
    </div>
  );
}

function FTextarea({ label, rows = 3, ...props }: { label?: string; rows?: number; [k: string]: any }) {
  return (
    <div>
      {label && <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>}
      <textarea rows={rows} className={cn(INPUT, "resize-none")} {...props} />
    </div>
  );
}

function FSelect({ label, options, ...props }: { label?: string; options: { value: string; label: string }[]; [k: string]: any }) {
  return (
    <div>
      {label && <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>}
      <select className={cn(INPUT, "cursor-pointer")} {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FToggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
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

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  let cls = "bg-blue-100 text-blue-800";
  if (s.includes("conclu") || s.includes("pronto") || s.includes("finaliz") || s.includes("entregue") || s.includes("aprovad")) cls = "bg-emerald-100 text-emerald-800";
  else if (s.includes("pendent") || s.includes("aguard") || s.includes("anál") || s.includes("analise")) cls = "bg-amber-100 text-amber-800";
  else if (s.includes("cancel") || s.includes("recusad")) cls = "bg-red-100 text-red-800";
  else if (s.includes("ativo") || s.includes("ativa")) cls = "bg-emerald-100 text-emerald-800";
  else if (s.includes("inativo") || s.includes("inativa")) cls = "bg-red-100 text-red-800";
  return <span className={cn("inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", cls)}>{status || "—"}</span>;
}

function LoadingState({ text = "Carregando..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Clock size={28} className="animate-spin text-[#0057e7]" />
      <p className="text-sm text-[#5a6a82]">{text}</p>
    </div>
  );
}

function EmptyState({ icon: Icon = Package, title, message, onAdd, addLabel = "Adicionar" }: {
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

function Toast({ message, type = "success", onClose }: { message: string; type?: "success" | "error"; onClose: () => void }) {
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

function Drawer({ open, onClose, title, subtitle, children, maxW = "max-w-2xl" }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; maxW?: string;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[90]" onClick={onClose} />
      <div className={cn("fixed right-0 top-0 h-full bg-white shadow-2xl z-[100] flex flex-col w-full", maxW)}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#0d1b2e]/10 flex-shrink-0 bg-white">
          <div>
            <h2 className="font-black text-[#0d1b2e] text-xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{title}</h2>
            {subtitle && <p className="text-xs text-[#5a6a82] mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 text-[#5a6a82] hover:text-[#0d1b2e] hover:bg-[#f5f7fa] rounded-lg transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[#f8fafc]">{children}</div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#0d1b2e]/8 overflow-hidden">
      <div className="px-5 py-3 border-b border-[#0d1b2e]/8 bg-[#f8fafc]">
        <h3 className="text-[10px] font-black text-[#0d1b2e] uppercase tracking-widest">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ImageUpload({ bucket, currentMediaId, onUpload, label = "Imagem" }: {
  bucket: "service-images" | "product-images" | "brand-images" | "avatars" | "public-assets"; currentMediaId?: string | null; onUpload: (mediaId: string) => void; label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { url: currentUrl } = useMediaUrl(currentMediaId);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: media, error: mediaError } = await supabase.from("media").insert({ bucket_name: bucket, storage_path: path, file_name: file.name, file_size: file.size, mime_type: file.type || null, created_by: user?.id || null }).select("id").single();
      if (mediaError) throw mediaError;
      onUpload(media.id);
    } catch (error) {
      console.error("[ADMIN] media upload error:", error);
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div>
      <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-2">{label}</label>
      {currentUrl && (
        <div className="mb-3 w-36 h-28 rounded-xl overflow-hidden border border-[#0d1b2e]/15 bg-[#f5f7fa]">
          <img src={currentUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <button type="button" onClick={() => ref.current?.click()} disabled={uploading}
        className="flex items-center gap-2 text-xs font-bold text-[#0057e7] border border-[#0057e7]/40 hover:border-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
        <Upload size={13} /> {uploading ? "Enviando..." : currentUrl ? "Trocar imagem" : "Selecionar imagem"}
      </button>
    </div>
  );
}

function ProductAdminThumb({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#0d1b2e]/10" /> : <div className="w-10 h-10 bg-[#f5f7fa] rounded-lg flex-shrink-0 border border-[#0d1b2e]/10 flex items-center justify-center"><Package size={16} className="text-[#5a6a82]" /></div>;
}

function BrandAdminLogo({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="h-12 w-auto object-contain max-w-full" /> : <div className="w-12 h-12 bg-[#f5f7fa] rounded-lg flex items-center justify-center"><Tag size={20} className="text-[#5a6a82]" /></div>;
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
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

function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-black text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{title}</h1>
        {subtitle && <p className="text-sm text-[#5a6a82] mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function BtnPrimary({ children, onClick, disabled, type = "button", className = "" }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; className?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cn("flex items-center gap-2 bg-[#0057e7] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#0046c0] transition-colors disabled:opacity-50 cursor-pointer", className)}>
      {children}
    </button>
  );
}

function BtnSecondary({ children, onClick, className = "" }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex items-center gap-2 border border-[#0d1b2e]/15 text-[#0d1b2e] px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#f5f7fa] transition-colors cursor-pointer", className)}>
      {children}
    </button>
  );
}

/* ─────────────────────────── ADMIN LOGIN ─────────────────────────── */

export function AdminLogin({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) { setError("Credenciais inválidas. Verifique seu e-mail e senha."); setLoading(false); return; }
    if (data.user) {
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
      if (prof && (prof as any).is_active === false) {
        await supabase.auth.signOut();
        setError("Usuário inativo. Entre em contato com o gestor.");
        setLoading(false);
        return;
      }
      onLoginSuccess();
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d1b2e] via-[#0a1520] to-[#06101a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 bg-[#0057e7] rounded-xl flex items-center justify-center">
              <Settings size={20} className="text-white" />
            </div>
            <div className="text-left">
              <span className="text-[9px] font-bold tracking-[0.3em] uppercase text-[#00b4ff] block">Painel Admin</span>
              <span className="text-xl font-black text-white block" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl border border-white/5">
          <h1 className="text-2xl font-black text-[#0d1b2e] mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Bem-vindo de volta</h1>
          <p className="text-sm text-[#5a6a82] mb-6">Entre com suas credenciais para acessar o painel.</p>
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={16} className="flex-shrink-0" /> {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="space-y-4">
            <FInput label="E-mail" type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} required placeholder="seu@email.com" />
            <FInput label="Senha" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} required placeholder="••••••••" />
            <button type="submit" disabled={loading}
              className="w-full bg-[#0057e7] text-white font-bold py-3 px-6 rounded-xl text-sm hover:bg-[#0046c0] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-2">
              {loading ? <Clock size={18} className="animate-spin" /> : null}
              {loading ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── ADMIN DASHBOARD WRAPPER ─────────────────────────── */

export function AdminDashboard({ onBackToSite }: { onBackToSite: () => void }) {
  const { user, profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const roleName = (profile as any)?.role_id === "gestor" || (profile as any)?.role === "gestor" ? "GESTOR" : "FUNCIONARIO";
  const isGestor = roleName === "GESTOR";

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "services", label: "Serviços", icon: Wrench },
    { id: "categories", label: "Categorias", icon: FolderTree },
    { id: "products", label: "Produtos", icon: Package },
    { id: "brands", label: "Marcas", icon: Tag },
    { id: "quotes", label: "Orçamentos", icon: FileText },
    { id: "orders", label: "Ordens de Serviço", icon: ClipboardList },
    { id: "customers", label: "Clientes", icon: Users },
    { id: "employees", label: "Funcionários", icon: Users, gestorOnly: true },
    { id: "settings", label: "Configurações", icon: Settings },
    { id: "contact", label: "Contato", icon: Phone },
  ];

  const SidebarContent = () => (
    <>
      <div className="flex-1 overflow-y-auto">
        {/* Logo */}
        <div className="px-4 pt-5 pb-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#0057e7] rounded-lg flex items-center justify-center flex-shrink-0">
              <Settings size={16} className="text-white" />
            </div>
            <div>
              <span className="text-[8px] font-bold tracking-[0.3em] uppercase text-[#00b4ff] block">Eletrônica</span>
              <span className="text-base font-black text-white block leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>ARTVIDEO</span>
            </div>
          </div>
        </div>
        {/* Nav */}
        <div className="px-3 py-4 space-y-0.5">
          {menuItems.map((item) => {
            if (item.gestorOnly && !isGestor) return null;
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => { setActiveTab(item.id as AdminTab); setSidebarOpen(false); }}
                className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all text-left",
                  active ? "bg-[#0057e7] text-white shadow-lg shadow-[#0057e7]/25" : "text-white/60 hover:bg-white/8 hover:text-white")}>
                <Icon size={17} className="flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        {/* Back to site */}
        <div className="px-3 pb-3">
          <button onClick={onBackToSite} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
            <ArrowLeft size={16} /> <span>Ver site público</span>
          </button>
        </div>
      </div>
      {/* User footer */}
      <div className="px-4 py-4 border-t border-white/8 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 bg-[#0057e7]/30 rounded-full flex items-center justify-center flex-shrink-0">
            <Users size={14} className="text-[#00b4ff]" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate">{profile?.full_name || user?.email?.split("@")[0] || "Admin"}</p>
            <span className="text-[9px] font-bold text-[#00b4ff] bg-[#00b4ff]/10 px-1.5 py-0.5 rounded uppercase tracking-wide">{roleName}</span>
          </div>
        </div>
        <button onClick={() => signOut()} title="Sair" className="p-1.5 text-white/40 hover:text-red-400 hover:bg-white/8 rounded-lg transition-colors flex-shrink-0">
          <LogOut size={16} />
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-shrink-0 bg-[#0d1b2e] flex-col fixed left-0 top-0 h-full z-40">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed left-0 top-0 h-full w-64 bg-[#0d1b2e] flex flex-col z-50 md:hidden">
            <SidebarContent />
          </aside>
        </>
      )}

      {/* Main */}
      <main className="flex-1 md:ml-60 flex flex-col min-h-screen overflow-x-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-[#0d1b2e]/8 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="md:hidden text-[#0d1b2e] p-1.5 hover:bg-[#f5f7fa] rounded-lg">
              <Menu size={20} />
            </button>
            <div>
              <h2 className="text-base font-black text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {menuItems.find(m => m.id === activeTab)?.label}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5a6a82]">
            <span className="w-2 h-2 bg-emerald-500 rounded-full inline-block" />
            <span className="hidden sm:inline font-medium">Supabase conectado</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-6">
          {activeTab === "dashboard" && <TabDashboard />}
          {activeTab === "services" && <TabServices />}
          {activeTab === "categories" && <TabCategories />}
          {activeTab === "products" && <TabProducts />}
          {activeTab === "brands" && <TabBrands />}
          {activeTab === "quotes" && <TabQuotes onNavigate={setActiveTab} />}
          {activeTab === "orders" && <TabOrders onNavigate={setActiveTab} />}
          {activeTab === "customers" && <TabCustomers />}
          {activeTab === "employees" && <TabEmployees />}
          {activeTab === "settings" && <TabSettings />}
          {activeTab === "contact" && <TabContact />}
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────────── TAB: DASHBOARD ─────────────────────────── */

function TabDashboard() {
  const [stats, setStats] = useState({ quotesPending: 0, quotesAnalysis: 0, ordersActive: 0, ordersWaiting: 0, servicesActive: 0, productsActive: 0 });
  const [recentQuotes, setRecentQuotes] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [qAll, oAll, sActive, pActive, rQuotes, rOrders] = await Promise.all([
      supabase.from("quote_requests").select("id, status_id, request_status:request_statuses(name)"),
      supabase.from("service_orders").select("id, status_id, order_status:order_statuses(name)"),
      supabase.from("services").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("quote_requests").select("id, protocol, created_at, customer_id, service_id, brand_id, request_status:request_statuses(name), customer:customers(full_name), service:services(title), brand:brands(name)").order("created_at", { ascending: false }).limit(5),
      supabase.from("service_orders").select("id, title, description, created_at, updated_at, status_id, order_status:order_statuses(name), customer:customers(full_name)").order("created_at", { ascending: false }).limit(5),
    ]);
    const quotes = qAll.data || [];
    const orders = oAll.data || [];
    setStats({
      quotesPending: quotes.filter((q: any) => ((q.request_status as any)?.name || "").toLowerCase().includes("pend")).length,
      quotesAnalysis: quotes.filter((q: any) => { const n = ((q.request_status as any)?.name || "").toLowerCase(); return n.includes("anál") || n.includes("analise") || n.includes("análise"); }).length,
      ordersActive: orders.filter((o: any) => { const n = ((o.order_status as any)?.name || "").toLowerCase(); return n.includes("manutenç") || n.includes("andamento") || n.includes("execuç"); }).length,
      ordersWaiting: orders.filter((o: any) => { const n = ((o.order_status as any)?.name || "").toLowerCase(); return n.includes("aguard") || n.includes("client"); }).length,
      servicesActive: sActive.count || 0,
      productsActive: pActive.count || 0,
    });
    setRecentQuotes(rQuotes.data || []);
    setRecentOrders(rOrders.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const cards = [
    { label: "Orçamentos pendentes", val: stats.quotesPending, icon: FileText, color: "text-amber-600 bg-amber-50 border-amber-100" },
    { label: "Orçamentos em análise", val: stats.quotesAnalysis, icon: Activity, color: "text-blue-600 bg-blue-50 border-blue-100" },
    { label: "OS em andamento", val: stats.ordersActive, icon: ClipboardList, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    { label: "OS aguardando cliente", val: stats.ordersWaiting, icon: Clock, color: "text-orange-600 bg-orange-50 border-orange-100" },
    { label: "Serviços ativos", val: stats.servicesActive, icon: Wrench, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
    { label: "Produtos ativos", val: stats.productsActive, icon: Package, color: "text-purple-600 bg-purple-50 border-purple-100" },
  ];

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Visão geral do sistema em tempo real" actions={
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors">
          <RefreshCw size={13} /> Atualizar
        </button>
      } />

      {loading ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="bg-white rounded-xl p-5 border border-[#0d1b2e]/8 shadow-sm flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[#5a6a82] mb-1 leading-tight">{c.label}</p>
                    <p className="text-3xl font-black text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{c.val}</p>
                  </div>
                  <div className={cn("p-3 rounded-xl border flex-shrink-0", c.color)}>
                    <Icon size={22} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Recent Quotes */}
            <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0d1b2e]/8 flex items-center justify-between">
                <h3 className="font-bold text-[#0d1b2e] text-sm">Orçamentos Recentes</h3>
                <FileText size={16} className="text-[#5a6a82]" />
              </div>
              {recentQuotes.length === 0 ? (
                <p className="text-sm text-[#5a6a82] text-center py-8">Nenhuma solicitação.</p>
              ) : (
                <div className="divide-y divide-[#0d1b2e]/5">
                  {recentQuotes.map(q => (
                    <div key={q.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[#0d1b2e] text-sm truncate">{(q.customer as any)?.full_name || "Cliente"}</p>
                        <p className="text-xs text-[#5a6a82] truncate">{(q.service as any)?.title || (q.brand as any)?.name || q.protocol || "—"}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <StatusBadge status={(q.request_status as any)?.name || "Pendente"} />
                        <p className="text-[10px] text-[#5a6a82] mt-1">{fmtDate(q.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#0d1b2e]/8 flex items-center justify-between">
                <h3 className="font-bold text-[#0d1b2e] text-sm">Ordens de Serviço Recentes</h3>
                <ClipboardList size={16} className="text-[#5a6a82]" />
              </div>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-[#5a6a82] text-center py-8">Nenhuma OS cadastrada.</p>
              ) : (
                <div className="divide-y divide-[#0d1b2e]/5">
                  {recentOrders.map(o => (
                    <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[#0057e7] text-sm">#{typeof o.id === "string" ? o.id.slice(0, 8) : o.id}</p>
                        <p className="text-xs text-[#5a6a82] truncate">{(o.customer as any)?.full_name || o.title || o.description || "Assistência Técnica"}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <StatusBadge status={(o.order_status as any)?.name || "Em andamento"} />
                        <p className="text-[10px] text-[#5a6a82] mt-1">{fmtDate(o.updated_at || o.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: SERVICES ─────────────────────────── */

const SERVICE_STATUSES = ["Solicitação recebida", "Em análise", "Aguardando aprovação", "Em manutenção", "Pronto", "Finalizado"];

function TabServices() {
  const { user } = useAuth();
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const [sRes, cRes, bRes, pRes] = await Promise.all([
      supabase.from("services").select("*, service_variants(*), service_inclusions(*), service_exclusions(*), service_price_factors(*), service_faqs(*), service_sections(*)").order("sort_order"),
      supabase.from("service_categories").select("id, name").order("sort_order"),
      supabase.from("brands").select("id, name").eq("is_active", true).order("sort_order"),
      supabase.from("products").select("id, name").eq("is_active", true).order("created_at", { ascending: false }),
    ]);
    if (sRes.error) setToast({ msg: `Erro ao carregar serviços: ${sRes.error.message}`, type: "error" }); else setServices(sRes.data || []);
    if (cRes.error) setToast({ msg: `Erro ao carregar categorias: ${cRes.error.message}`, type: "error" }); else setCategories(cRes.data || []);
    if (bRes.error) setToast({ msg: `Erro ao carregar marcas: ${bRes.error.message}`, type: "error" }); else setBrands(bRes.data || []);
    if (pRes.error) setToast({ msg: `Erro ao carregar produtos: ${pRes.error.message}`, type: "error" }); else setProducts(pRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditItem(null); setDrawerOpen(true); };
  const openEdit = (s: any) => { setEditItem(s); setDrawerOpen(true); };

  const handleDelete = async (id: string) => {
    console.log("[ADMIN] Deleting service:", id);
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      console.error("[ADMIN] Delete error:", error);
      setToast({ msg: `Erro ao excluir: ${error.message}`, type: "error" });
      return;
    }
    setDelId(null);
    setToast({ msg: "Serviço excluído com sucesso.", type: "success" });
    load();
  };

  const toggleActive = async (s: any) => {
    console.log("[ADMIN] Toggling service active status:", s.id);
    const { error } = await supabase.from("services").update({ is_active: !s.is_active }).eq("id", s.id);
    if (error) {
      console.error("[ADMIN] Toggle active error:", error);
      setToast({ msg: `Erro ao atualizar: ${error.message}`, type: "error" });
      return;
    }
    setToast({ msg: "Status atualizado com sucesso.", type: "success" });
    load();
  };

  const filtered = services.filter(s =>
    !search || s.title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir este serviço e todos os dados associados?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Serviços" subtitle={`${services.length} serviço${services.length !== 1 ? "s" : ""} cadastrado${services.length !== 1 ? "s" : ""}`} actions={
        <BtnPrimary onClick={openNew}><Plus size={16} /> Novo serviço</BtnPrimary>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar serviços..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Wrench} title={search ? "Nenhum resultado" : "Nenhum serviço cadastrado"} message={search ? `Nenhum serviço com "${search}"` : "Clique em + Novo serviço para começar."} onAdd={!search ? openNew : undefined} addLabel="+ Novo serviço" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Serviço</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Variações</th>
                  <th className="px-4 py-3 text-left">Destaque</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {filtered.map(s => {
                  const cat = categories.find(c => c.id === s.category_id);
                  return (
                    <tr key={s.id} className="hover:bg-[#f8fafc]/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <div>
                          <p className="font-bold text-[#0d1b2e]">{s.title}</p>
                          {s.short_description && <p className="text-xs text-[#5a6a82] truncate max-w-xs">{s.short_description}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{cat?.name || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{s.service_variants?.length || 0}</td>
                      <td className="px-4 py-3.5">
                        {s.is_featured ? <Star size={15} className="text-amber-400 fill-amber-400" /> : <span className="text-xs text-[#5a6a82]">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={s.is_active ? "Ativo" : "Inativo"} />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(s)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors" title="Editar"><Edit2 size={15} /></button>
                          <button onClick={() => toggleActive(s)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={s.is_active ? "Desativar" : "Ativar"}>
                            {s.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                          </button>
                          <button onClick={() => setDelId(s.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={15} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ServiceDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); load(); }} editItem={editItem} categories={categories} brands={brands} products={products} userId={user?.id || null} onToast={setToast} />
    </div>
  );
}

function ServiceDrawer({ open, onClose, editItem, categories, brands, products, userId, onToast }: {
  open: boolean; onClose: () => void; editItem: any | null; categories: any[]; brands: any[]; products: any[]; userId: string | null; onToast: (t: { msg: string; type: "success" | "error" }) => void;
}) {
  const [tab, setTab] = useState("info");
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [coverMediaId, setCoverMediaId] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [description, setDescription] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [priceMode, setPriceMode] = useState<"FIXED" | "STARTING_FROM" | "QUOTE" | "HIDDEN">("QUOTE");
  const [active, setActive] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  // Variants
  const [variants, setVariants] = useState<{ title: string; description: string; price: string }[]>([]);
  // Features (incluso)
  const [features, setFeatures] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [priceFactors, setPriceFactors] = useState<{ name: string; description: string; impact: "increase" | "decrease"; amount: string; unit: string }[]>([]);
  const [sections, setSections] = useState<{ title: string; content: string }[]>([]);
  // FAQs
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>([]);

  useEffect(() => {
    if (open) {
      setTab("info");
      if (editItem) {
        setName(editItem.title || "");
        setSlug(editItem.slug || "");
        setCategoryId(editItem.category_id || "");
        setBrandId(editItem.brand_id || ""); setProductId(editItem.product_id || ""); setCoverMediaId(editItem.cover_media_id || "");
        setShortDesc(editItem.short_description || "");
        setDescription(editItem.description || "");
        setBasePrice(editItem.base_price == null ? "" : String(editItem.base_price));
        setPriceMode(["FIXED", "STARTING_FROM", "QUOTE", "HIDDEN"].includes(editItem.price_mode) ? editItem.price_mode : "QUOTE");
        setActive(editItem.is_active ?? true);
        setFeatured(editItem.is_featured ?? false);
        setSortOrder(editItem.sort_order ?? 0);
        setVariants((editItem.service_variants || []).map((v: any) => ({ title: v.title || "", description: v.description || "", price: v.price == null ? "" : String(v.price) })));
        setFeatures((editItem.service_inclusions || []).map((f: any) => f.description || ""));
        setExclusions((editItem.service_exclusions || []).map((item: any) => item.description || ""));
        setPriceFactors((editItem.service_price_factors || []).map((factor: any) => ({ name: factor.name || "", description: factor.description || "", impact: factor.impact || "increase", amount: factor.amount == null ? "" : String(factor.amount), unit: factor.unit || "" })));
        setSections((editItem.service_sections || []).map((section: any) => ({ title: section.title || "", content: section.content || "" })));
        setFaqs((editItem.service_faqs || []).map((f: any) => ({ question: f.question || "", answer: f.answer || "" })));
      } else {
        setName(""); setSlug(""); setCategoryId(""); setBrandId(""); setProductId(""); setCoverMediaId(""); setShortDesc(""); setDescription(""); setBasePrice(""); setPriceMode("QUOTE");
        setActive(true); setFeatured(false); setSortOrder(0);
        setVariants([]); setFeatures([]); setExclusions([]); setPriceFactors([]); setSections([]); setFaqs([]);
      }
    }
  }, [open, editItem]);


  const autoSlug = slugify;

  // Generate unique slug by checking for conflicts in Supabase
  const generateUniqueServiceSlug = async (title: string, excludeId?: string): Promise<string> => {
    const baseSlug = autoSlug(title);
    console.log("[ADMIN] Generating slug for title:", title, "base slug:", baseSlug);
    
    // Query all services to find existing slugs
    const { data: existingServices, error: queryError } = await supabase.from("services").select("id, slug");
    if (queryError) {
      console.error("[ADMIN] Error querying services for slug check:", queryError);
      return baseSlug;
    }
    
    // Filter out the current service being edited
    const existingSlugs = existingServices
      ?.filter((s: any) => !excludeId || s.id !== excludeId)
      .map((s: any) => s.slug) || [];
    
    // Check if base slug is available
    if (!existingSlugs.includes(baseSlug)) {
      console.log("[ADMIN] Slug available:", baseSlug);
      return baseSlug;
    }
    
    // Find next available slug with number suffix
    let counter = 2;
    let candidateSlug = `${baseSlug}-${counter}`;
    while (existingSlugs.includes(candidateSlug)) {
      counter++;
      candidateSlug = `${baseSlug}-${counter}`;
    }
    
    console.log("[ADMIN] Slug available (with suffix):", candidateSlug);
    return candidateSlug;
  };

  const handleSave = async () => {
    if (!name.trim()) { onToast({ msg: "Nome do serviço é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      console.log("[ADMIN] Saving service:", { title: name, is_active: active, is_featured: featured });
      
      
      let finalSlug = slug;
      
      // For new services, always generate a unique slug
      if (!editItem) {
        finalSlug = await generateUniqueServiceSlug(name);
        console.log("[ADMIN] Generated unique slug for new service:", finalSlug);
      } else {
        // For edits, only regenerate slug if title changed
        const previousSlug = autoSlug(editItem.title || "");
        const newSlug = autoSlug(name);
        
        if (previousSlug !== newSlug) {
          // Title changed, generate new unique slug (excluding current service)
          finalSlug = await generateUniqueServiceSlug(name, editItem.id);
          console.log("[ADMIN] Title changed, generated new slug:", finalSlug);
        } else {
          // Title unchanged, keep existing slug
          finalSlug = slug;
          console.log("[ADMIN] Title unchanged, keeping existing slug:", finalSlug);
        }
      }
      
      const payload = { title: name.trim(), slug: finalSlug, category_id: categoryId || null, brand_id: brandId || null, product_id: productId || null, cover_media_id: coverMediaId || null, short_description: shortDesc || null, description: description || null, base_price: basePrice ? Number(basePrice) : null, price_mode: priceMode, is_active: active, is_featured: featured, sort_order: sortOrder, updated_by: userId };
      let serviceId = editItem?.id;
      
      // Insert or Update main service
      if (editItem) {
        console.log("[ADMIN] Updating service:", serviceId);
        const { error: updateError } = await supabase.from("services").update(payload).eq("id", serviceId);
        if (updateError) {
          console.error("[ADMIN] Service update error:", updateError);
          onToast({ msg: `Erro ao atualizar serviço: ${updateError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service updated successfully");
      } else {
        console.log("[ADMIN] Creating new service");
        const { data, error: insertError } = await supabase.from("services").insert({ ...payload, created_by: userId }).select().single();
        if (insertError) {
          console.error("[ADMIN] Service insert error:", insertError);
          onToast({ msg: `Erro ao criar serviço: ${insertError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        serviceId = data?.id;
        console.log("[ADMIN] Service created with ID:", serviceId);
      }
      
      if (!serviceId) {
        onToast({ msg: "Erro: ID do serviço não obtido.", type: "error" });
        setSaving(false);
        return;
      }
      
      // Save service variants
      console.log("[ADMIN] Saving service variants:", variants.length);
      const { error: deleteVariantsError } = await supabase.from("service_variants").delete().eq("service_id", serviceId);
      if (deleteVariantsError) {
        console.error("[ADMIN] Error deleting old variants:", deleteVariantsError);
        onToast({ msg: `Erro ao remover variantes antigas: ${deleteVariantsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (variants.length > 0) {
        const { error: insertVariantsError } = await supabase.from("service_variants").insert(
          variants.map((v, i) => ({
            service_id: serviceId,
            title: v.title,
            description: v.description || null,
            price: v.price ? Number(v.price) : null,
            icon: null,

            is_active: true,
            sort_order: i,
          }))
        );
        if (insertVariantsError) {
          console.error("[ADMIN] Error inserting variants:", insertVariantsError);
          onToast({ msg: `Erro ao salvar variantes: ${insertVariantsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service variants saved");
      }
      
      // Save service inclusions (formerly called "features" in the UI)
      console.log("[ADMIN] Saving service inclusions:", features.filter(Boolean).length);
      const { error: deleteInclusionsError } = await supabase.from("service_inclusions").delete().eq("service_id", serviceId);
      if (deleteInclusionsError) {
        console.error("[ADMIN] Error deleting old inclusions:", deleteInclusionsError);
        onToast({ msg: `Erro ao remover inclusões antigas: ${deleteInclusionsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (features.filter(Boolean).length > 0) {
        const { error: insertInclusionsError } = await supabase.from("service_inclusions").insert(
          features.filter(Boolean).map((f, i) => ({
            service_id: serviceId,
            description: f,
            sort_order: i,
          }))
        );
        if (insertInclusionsError) {
          console.error("[ADMIN] Error inserting inclusions:", insertInclusionsError);
          onToast({ msg: `Erro ao salvar inclusões: ${insertInclusionsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service inclusions saved");
      }

      const { error: deleteExclusionsError } = await supabase.from("service_exclusions").delete().eq("service_id", serviceId);
      if (deleteExclusionsError) { onToast({ msg: `Erro ao remover exclusões antigas: ${deleteExclusionsError.message}`, type: "error" }); return; }
      const validExclusions = exclusions.filter(Boolean);
      if (validExclusions.length > 0) {
        const { error } = await supabase.from("service_exclusions").insert(validExclusions.map((description, sort_order) => ({ service_id: serviceId, description, sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar exclusões: ${error.message}`, type: "error" }); return; }
      }

      const { error: deleteFactorsError } = await supabase.from("service_price_factors").delete().eq("service_id", serviceId);
      if (deleteFactorsError) { onToast({ msg: `Erro ao remover fatores antigos: ${deleteFactorsError.message}`, type: "error" }); return; }
      const validFactors = priceFactors.filter((factor) => factor.name.trim());
      if (validFactors.length > 0) {
        const { error } = await supabase.from("service_price_factors").insert(validFactors.map((factor, sort_order) => ({ service_id: serviceId, name: factor.name.trim(), description: factor.description || null, impact: factor.impact, amount: Number(factor.amount) || 0, unit: factor.unit || null, sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar fatores: ${error.message}`, type: "error" }); return; }
      }

      const { error: deleteSectionsError } = await supabase.from("service_sections").delete().eq("service_id", serviceId);
      if (deleteSectionsError) { onToast({ msg: `Erro ao remover seções antigas: ${deleteSectionsError.message}`, type: "error" }); return; }
      const validSections = sections.filter((section) => section.title.trim() && section.content.trim());
      if (validSections.length > 0) {
        const { error } = await supabase.from("service_sections").insert(validSections.map((section, sort_order) => ({ service_id: serviceId, title: section.title.trim(), content: section.content.trim(), sort_order })));
        if (error) { onToast({ msg: `Erro ao salvar seções: ${error.message}`, type: "error" }); return; }
      }
      
      // Save service FAQs
      console.log("[ADMIN] Saving service FAQs:", faqs.filter(f => f.question).length);
      const { error: deleteFaqsError } = await supabase.from("service_faqs").delete().eq("service_id", serviceId);
      if (deleteFaqsError) {
        console.error("[ADMIN] Error deleting old FAQs:", deleteFaqsError);
        onToast({ msg: `Erro ao remover FAQs antigas: ${deleteFaqsError.message}`, type: "error" });
        setSaving(false);
        return;
      }
      
      if (faqs.filter(f => f.question).length > 0) {
        const { error: insertFaqsError } = await supabase.from("service_faqs").insert(
          faqs.filter(f => f.question).map((f, i) => ({
            service_id: serviceId,
            question: f.question,
            answer: f.answer,
            section_id: null, is_active: true, sort_order: i,
          }))
        );
        if (insertFaqsError) {
          console.error("[ADMIN] Error inserting FAQs:", insertFaqsError);
          onToast({ msg: `Erro ao salvar FAQs: ${insertFaqsError.message}`, type: "error" });
          setSaving(false);
          return;
        }
        console.log("[ADMIN] Service FAQs saved");
      }
      
      console.log("[ADMIN] Service save completed successfully");
      onToast({ msg: editItem ? "Serviço atualizado com sucesso!" : "Serviço criado com sucesso!", type: "success" });
      onClose();
    } catch (err) {
      console.error("[ADMIN] Unexpected error saving service:", err);
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      onToast({ msg: `Erro ao salvar: ${errorMessage}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "info", label: "Informações", icon: List },
    { id: "price", label: "Preço", icon: DollarSign },
    { id: "features", label: "Incluso", icon: CheckCircle },
    { id: "exclusions", label: "Não incluso", icon: X },
    { id: "factors", label: "Fatores", icon: Activity },
    { id: "faq", label: "FAQ", icon: HelpCircle },
    { id: "sections", label: "Seções", icon: FileText },
    { id: "publish", label: "Publicação", icon: Star },
  ];

  const catOptions = [{ value: "", label: "Selecionar categoria..." }, ...categories.map(c => ({ value: c.id, label: c.name }))];
  const brandOptions = [{ value: "", label: "Sem marca" }, ...brands.map(brand => ({ value: brand.id, label: brand.name }))];
  const productOptions = [{ value: "", label: "Sem produto vinculado" }, ...products.map(product => ({ value: product.id, label: product.name }))];

  return (
    <Drawer open={open} onClose={onClose} title={editItem ? `Editar: ${editItem.title}` : "Novo Serviço"} subtitle="Preencha todas as seções para publicar o serviço" maxW="max-w-3xl">
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#0d1b2e]/8 px-4 flex gap-0 overflow-x-auto flex-shrink-0">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap",
                tab === t.id ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>
              <Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="p-5 space-y-4">
        {/* INFO TAB */}
        {tab === "info" && (
          <>
            <Section title="Identificação">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <FInput label="Nome do Serviço" value={name} required onChange={(e: any) => { setName(e.target.value); if (!editItem) setSlug(autoSlug(e.target.value)); }} placeholder="Ex: Instalação de Ar-condicionado" />
                </div>
                <FInput label="Slug (URL)" value={slug} onChange={(e: any) => setSlug(e.target.value)} placeholder="instalacao-ar-condicionado" hint="Gerado automaticamente a partir do nome." />
                <FSelect label="Categoria" value={categoryId} onChange={(e: any) => setCategoryId(e.target.value)} options={catOptions} />
                <FSelect label="Marca" value={brandId} onChange={(e: any) => setBrandId(e.target.value)} options={brandOptions} />
                <FSelect label="Produto relacionado" value={productId} onChange={(e: any) => setProductId(e.target.value)} options={productOptions} />
              </div>
            </Section>
            <Section title="Descrição">
              <div className="space-y-4">
                <FTextarea label="Descrição curta" value={shortDesc} onChange={(e: any) => setShortDesc(e.target.value)} rows={2} placeholder="Frase resumida que aparece nos cards e listagens." />
                <FTextarea label="Descrição completa" value={description} onChange={(e: any) => setDescription(e.target.value)} rows={5} placeholder="Texto completo que aparece na página do serviço." />
              </div>
            </Section>
            <Section title="Imagem de capa">
              <ImageUpload bucket="service-images" currentMediaId={coverMediaId} onUpload={setCoverMediaId} label="Imagem do serviço" />
            </Section>
          </>
        )}

        {/* PRICE TAB */}
        {tab === "price" && (
          <>
            <Section title="Preço base">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FInput label="Preço base (R$)" type="number" min="0" step="0.01" value={basePrice} onChange={(e: any) => setBasePrice(e.target.value)} placeholder="Vazio para consultar" />
                <FSelect label="Modo de preço" value={priceMode} onChange={(e: any) => setPriceMode(e.target.value)} options={[{ value: "FIXED", label: "Preço fixo" }, { value: "STARTING_FROM", label: "Preço a partir de" }, { value: "QUOTE", label: "Consultar orçamento" }, { value: "HIDDEN", label: "Não exibir preço" }]} />
              </div>
            </Section>
            <Section title="Variações de Preço">
              <p className="text-xs text-[#5a6a82] mb-3">Adicione variações para mostrar opções diferentes de preço. Deixe em branco o preço para indicar "Consultar".</p>
              {variants.map((v, i) => (
                <div key={i} className="flex gap-3 items-start mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <FInput label={i === 0 ? "Título" : undefined} value={v.title} onChange={(e: any) => { const n = [...variants]; n[i].title = e.target.value; setVariants(n); }} placeholder="Ex: 12.000 BTUs" />
                    <FInput label={i === 0 ? "Preço (R$)" : undefined} value={v.price} onChange={(e: any) => { const n = [...variants]; n[i].price = e.target.value; setVariants(n); }} placeholder="Ex: 250.00 (vazio = consultar)" type="number" min="0" step="0.01" />
                    <FInput label={i === 0 ? "Descrição" : undefined} value={v.description} onChange={(e: any) => { const n = [...variants]; n[i].description = e.target.value; setVariants(n); }} placeholder="Descrição da variação" />
                  </div>
                  <button type="button" onClick={() => setVariants(variants.filter((_, idx) => idx !== i))} className="mt-5 p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                    <X size={15} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setVariants([...variants, { title: "", description: "", price: "" }])}
                className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center transition-colors">
                <Plus size={14} /> Adicionar variação
              </button>
            </Section>
          </>
        )}

        {/* FEATURES TAB */}
        {tab === "features" && (
          <Section title="O que está incluso">
            <p className="text-xs text-[#5a6a82] mb-3">Liste os itens inclusos no serviço. Se não houver itens, a seção não aparecerá no site.</p>
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" />
                <input value={f} onChange={(e) => { const n = [...features]; n[i] = e.target.value; setFeatures(n); }}
                  className={cn(INPUT, "py-2 text-xs flex-1")} placeholder={`Item ${i + 1}...`} />
                <button type="button" onClick={() => setFeatures(features.filter((_, idx) => idx !== i))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setFeatures([...features, ""])}
              className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center mt-2 transition-colors">
              <Plus size={14} /> Adicionar item
            </button>
          </Section>
        )}

        {tab === "exclusions" && (
          <Section title="O que não está incluso">
            {exclusions.map((item, index) => <div key={index} className="flex items-center gap-2 mb-2"><X size={14} className="text-red-500" /><input value={item} onChange={(event) => { const next = [...exclusions]; next[index] = event.target.value; setExclusions(next); }} className={cn(INPUT, "py-2 text-xs flex-1")} placeholder={`Item ${index + 1}...`} /><button type="button" onClick={() => setExclusions(exclusions.filter((_, itemIndex) => itemIndex !== index))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><X size={14} /></button></div>)}
            <button type="button" onClick={() => setExclusions([...exclusions, ""])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center mt-2"><Plus size={14} /> Adicionar item</button>
          </Section>
        )}

        {tab === "factors" && (
          <Section title="Fatores que alteram preço">
            {priceFactors.map((factor, index) => <div key={index} className="mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 grid grid-cols-1 sm:grid-cols-2 gap-3"><FInput label="Título" value={factor.name} onChange={(event: any) => { const next = [...priceFactors]; next[index].name = event.target.value; setPriceFactors(next); }} /><FSelect label="Impacto" value={factor.impact} onChange={(event: any) => { const next = [...priceFactors]; next[index].impact = event.target.value; setPriceFactors(next); }} options={[{ value: "increase", label: "Aumenta" }, { value: "decrease", label: "Reduz" }]} /><FInput label="Valor" type="number" value={factor.amount} onChange={(event: any) => { const next = [...priceFactors]; next[index].amount = event.target.value; setPriceFactors(next); }} /><FInput label="Unidade" value={factor.unit} onChange={(event: any) => { const next = [...priceFactors]; next[index].unit = event.target.value; setPriceFactors(next); }} /><div className="sm:col-span-2"><FTextarea label="Descrição" value={factor.description} onChange={(event: any) => { const next = [...priceFactors]; next[index].description = event.target.value; setPriceFactors(next); }} rows={2} /></div><button type="button" onClick={() => setPriceFactors(priceFactors.filter((_, factorIndex) => factorIndex !== index))} className="text-xs text-red-600 font-bold">Remover fator</button></div>)}
            <button type="button" onClick={() => setPriceFactors([...priceFactors, { name: "", description: "", impact: "increase", amount: "", unit: "" }])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center"><Plus size={14} /> Adicionar fator</button>
          </Section>
        )}

        {/* FAQ TAB */}
        {tab === "faq" && (
          <Section title="Perguntas Frequentes">
            <p className="text-xs text-[#5a6a82] mb-3">Adicione perguntas e respostas frequentes sobre este serviço. Se não houver, a seção não aparecerá no site.</p>
            {faqs.map((f, i) => (
              <div key={i} className="mb-4 p-4 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-[#5a6a82] mt-2.5 flex-shrink-0">P.</span>
                  <input value={f.question} onChange={(e) => { const n = [...faqs]; n[i].question = e.target.value; setFaqs(n); }}
                    className={cn(INPUT, "py-2 text-xs flex-1")} placeholder="Pergunta..." />
                  <button type="button" onClick={() => setFaqs(faqs.filter((_, idx) => idx !== i))} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 mt-0.5">
                    <X size={14} />
                  </button>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-[#5a6a82] mt-2.5 flex-shrink-0">R.</span>
                  <textarea value={f.answer} onChange={(e) => { const n = [...faqs]; n[i].answer = e.target.value; setFaqs(n); }}
                    rows={2} className={cn(INPUT, "resize-none text-xs flex-1")} placeholder="Resposta..." />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}
              className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center transition-colors">
              <Plus size={14} /> Adicionar pergunta
            </button>
          </Section>
        )}

        {tab === "sections" && (
          <Section title="Seções personalizadas">
            {sections.map((section, index) => <div key={index} className="mb-3 p-3 bg-[#f8fafc] rounded-lg border border-[#0d1b2e]/8 space-y-3"><FInput label="Título" value={section.title} onChange={(event: any) => { const next = [...sections]; next[index].title = event.target.value; setSections(next); }} /><FTextarea label="Conteúdo" value={section.content} onChange={(event: any) => { const next = [...sections]; next[index].content = event.target.value; setSections(next); }} rows={3} /><button type="button" onClick={() => setSections(sections.filter((_, sectionIndex) => sectionIndex !== index))} className="text-xs text-red-600 font-bold">Remover seção</button></div>)}
            <button type="button" onClick={() => setSections([...sections, { title: "", content: "" }])} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-2 rounded-lg border border-dashed border-[#0057e7]/40 w-full justify-center"><Plus size={14} /> Adicionar seção</button>
          </Section>
        )}

        {/* PUBLISH TAB */}
        {tab === "publish" && (
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Serviço ativo" description="Serviços inativos não aparecem no site." checked={active} onChange={setActive} />
              <FToggle label="Destaque" description="Exibe o serviço como destaque na Home e na listagem." checked={featured} onChange={setFeatured} />
              <FInput label="Ordem de exibição" type="number" min="0" value={sortOrder} onChange={(e: any) => setSortOrder(Number(e.target.value))} hint="Menor número aparece primeiro." />
            </div>
          </Section>
        )}
      </div>

      {/* Save footer */}
      <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-6 py-4 flex items-center justify-between gap-3">
        <p className="text-xs text-[#5a6a82]">
          {tab !== "publish" ? "Complete todas as seções antes de publicar." : "Revise e salve as alterações."}
        </p>
        <div className="flex gap-3">
          <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={handleSave} disabled={saving}>
            {saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
            {saving ? "Salvando..." : "Salvar serviço"}
          </BtnPrimary>
        </div>
      </div>
    </Drawer>
  );
}

/* ─────────────────────────── TAB: CATEGORIES ─────────────────────────── */

function TabCategories() {
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("service_categories").select("*").order("sort_order");
    if (error) setToast({ msg: `Erro ao carregar categorias: ${error.message}`, type: "error" });
    else setCats(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const autoSlug = slugify;

  const openNew = () => { setForm({ name: "", slug: "", is_active: true, sort_order: 0 }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (c: any) => { setForm({ name: c.name || "", slug: c.slug || "", is_active: c.is_active ?? true, sort_order: c.sort_order ?? 0 }); setEditItem(c); setDrawerOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setToast({ msg: "Nome obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("service_categories", form.name, editItem?.id) : editItem.slug;
      const payload = { ...form, name: form.name.trim(), slug: finalSlug };
      const { data, error } = editItem
        ? await supabase.from("service_categories").update(payload).eq("id", editItem.id).select().single()
        : await supabase.from("service_categories").insert(payload).select().single();
      if (error) {
        console.error("[ADMIN] service_categories save error:", error);
        throw error;
      }
      setDrawerOpen(false);
      setToast({ msg: editItem ? "Categoria atualizada!" : "Categoria criada!", type: "success" });
      load();
    } catch (error) {
      setToast({ msg: `Erro ao salvar categoria: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("service_categories").delete().eq("id", id);
    if (error) { console.error("[ADMIN] service_categories delete error:", error); setToast({ msg: `Erro ao excluir categoria: ${error.message}`, type: "error" }); return; }
    setDelId(null); setToast({ msg: "Categoria excluída.", type: "success" }); load();
  };

  const toggleActive = async (category: any) => {
    const { error } = await supabase.from("service_categories").update({ is_active: !category.is_active }).eq("id", category.id);
    if (error) { console.error("[ADMIN] service_categories toggle error:", error); setToast({ msg: `Erro ao atualizar categoria: ${error.message}`, type: "error" }); return; }
    setToast({ msg: "Status atualizado!", type: "success" }); load();
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir esta categoria? Serviços vinculados perderão a referência." onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Categorias" subtitle={`${cats.length} categoria${cats.length !== 1 ? "s" : ""}`} actions={
        <BtnPrimary onClick={openNew}><Plus size={16} /> Nova categoria</BtnPrimary>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : cats.length === 0 ? (
          <EmptyState icon={FolderTree} title="Nenhuma categoria cadastrada" message="Crie categorias para organizar seus serviços." onAdd={openNew} addLabel="+ Nova categoria" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Slug</th>
                  <th className="px-4 py-3 text-left">Ordem</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {cats.map(c => (
                  <tr key={c.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{c.name}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82] font-mono">{c.slug}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{c.sort_order}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={c.is_active ? "Ativo" : "Inativo"} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(c)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors"><Edit2 size={15} /></button>
                        <button onClick={() => toggleActive(c)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={c.is_active ? "Desativar" : "Ativar"}>{c.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</button>
                        <button onClick={() => setDelId(c.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editItem ? "Editar Categoria" : "Nova Categoria"} maxW="max-w-lg">
        <div className="p-5 space-y-4">
          <Section title="Informações">
            <div className="space-y-4">
              <FInput label="Nome" value={form.name} required onChange={(e: any) => { setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) }); }} placeholder="Ex: Ar-condicionado" />
              <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} placeholder="ar-condicionado" hint="Gerado automaticamente ao digitar o nome. Pode ser editado manualmente." />
            </div>
          </Section>
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Categoria ativa" description="Categorias inativas ficam ocultas nos filtros do site." checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
              <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar categoria"}</BtnPrimary>
        </div>
      </Drawer>
    </div>
  );
}

/* ─────────────────────────── TAB: PRODUCTS ─────────────────────────── */

function TabProducts() {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [form, setForm] = useState({ name: "", slug: "", sku: "", short_description: "", description: "", price: "", compare_at_price: "", cover_media_id: "", is_active: true, is_featured: false, category_id: "", brand_id: "", external_platform: "", external_product_id: "", external_url: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [pRes, cRes] = await Promise.all([
      supabase.from("products").select("*, product_categories(name)").order("created_at", { ascending: false }),
      supabase.from("product_categories").select("id, name").order("sort_order"),
    ]);
    if (pRes.error) setToast({ msg: `Erro ao carregar produtos: ${pRes.error.message}`, type: "error" });
    else setProducts(pRes.data || []);
    if (cRes.error) setToast({ msg: `Erro ao carregar categorias: ${cRes.error.message}`, type: "error" });
    else setCategories(cRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const autoSlug = slugify;
  const catOptions = [{ value: "", label: "Sem categoria" }, ...categories.map(c => ({ value: c.id, label: c.name }))];

  const openNew = () => { setForm({ name: "", slug: "", sku: "", short_description: "", description: "", price: "", compare_at_price: "", cover_media_id: "", is_active: true, is_featured: false, category_id: "", brand_id: "", external_platform: "", external_product_id: "", external_url: "" }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (p: any) => { setForm({ name: p.name || "", slug: p.slug || "", sku: p.sku || "", short_description: p.short_description || "", description: p.description || "", price: p.price == null ? "" : String(p.price), compare_at_price: p.compare_at_price == null ? "" : String(p.compare_at_price), cover_media_id: p.cover_media_id || "", is_active: p.is_active ?? true, is_featured: p.is_featured ?? false, category_id: p.category_id || "", brand_id: p.brand_id || "", external_platform: p.external_platform || "", external_product_id: p.external_product_id || "", external_url: p.external_url || "" }); setEditItem(p); setDrawerOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setToast({ msg: "Nome do produto é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("products", form.name, editItem?.id) : editItem.slug;
      const payload = { name: form.name.trim(), slug: finalSlug, sku: form.sku || null, short_description: form.short_description || null, description: form.description || null, price: form.price ? Number(form.price) : null, compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null, cover_media_id: form.cover_media_id || null, is_active: form.is_active, is_featured: form.is_featured, category_id: form.category_id || null, brand_id: form.brand_id || null, external_platform: form.external_platform || null, external_product_id: form.external_product_id || null, external_url: form.external_url || null, updated_by: user?.id || null };
      const { data, error } = editItem ? await supabase.from("products").update(payload).eq("id", editItem.id).select().single() : await supabase.from("products").insert({ ...payload, created_by: user?.id || null }).select().single();
      if (error) { console.error("[ADMIN] products save error:", error); throw error; }
      setDrawerOpen(false);
      setToast({ msg: editItem ? "Produto atualizado!" : "Produto criado!", type: "success" });
      load();
    } catch (error) {
      setToast({ msg: `Erro ao salvar produto: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => { const { error } = await supabase.from("products").delete().eq("id", id); if (error) { console.error("[ADMIN] products delete error:", error); setToast({ msg: `Erro ao excluir produto: ${error.message}`, type: "error" }); return; } setDelId(null); setToast({ msg: "Produto excluído.", type: "success" }); load(); };
  const toggleActive = async (p: any) => { const { error } = await supabase.from("products").update({ is_active: !p.is_active, updated_by: user?.id || null }).eq("id", p.id); if (error) { setToast({ msg: `Erro ao atualizar produto: ${error.message}`, type: "error" }); return; } setToast({ msg: "Status atualizado!", type: "success" }); load(); };
  const toggleFeatured = async (p: any) => { const { error } = await supabase.from("products").update({ is_featured: !p.is_featured, updated_by: user?.id || null }).eq("id", p.id); if (error) { setToast({ msg: `Erro ao atualizar destaque: ${error.message}`, type: "error" }); return; } setToast({ msg: "Destaque atualizado!", type: "success" }); load(); };

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir este produto permanentemente?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Produtos" subtitle={`${products.length} produto${products.length !== 1 ? "s" : ""} cadastrado${products.length !== 1 ? "s" : ""}`} actions={
        <BtnPrimary onClick={openNew}><Plus size={16} /> Novo produto</BtnPrimary>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produtos..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Package} title={search ? "Nenhum resultado" : "Nenhum produto cadastrado"} message="Adicione produtos para exibi-los na loja." onAdd={!search ? openNew : undefined} addLabel="+ Novo produto" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Produto</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Preço</th>
                  <th className="px-4 py-3 text-left">Destaque</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProductAdminThumb mediaId={p.cover_media_id} name={p.name} />
                        <span className="font-bold text-[#0d1b2e]">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{p.categories?.name || "—"}</td>
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{p.price ? `R$ ${Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Consultar"}</td>
                    <td className="px-4 py-3.5"><button onClick={() => toggleFeatured(p)} title={p.is_featured ? "Remover destaque" : "Destacar produto"}>{p.is_featured ? <Star size={15} className="text-amber-400 fill-amber-400" /> : <Star size={15} className="text-[#5a6a82]" />}</button></td>
                    <td className="px-4 py-3.5"><StatusBadge status={p.is_active ? "Ativo" : "Inativo"} /></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors"><Edit2 size={15} /></button>
                        <button onClick={() => toggleActive(p)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><CheckCircle size={15} /></button>
                        <button onClick={() => setDelId(p.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editItem ? "Editar Produto" : "Novo Produto"} maxW="max-w-xl">
        <div className="p-5 space-y-4">
          <Section title="Informações Principais">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><FInput label="Nome do produto" value={form.name} required onChange={(e: any) => { setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) }); }} placeholder="Nome do produto" /></div>
                <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} placeholder="slug-do-produto" />
                <FSelect label="Categoria" value={form.category_id} onChange={(e: any) => setForm({ ...form, category_id: e.target.value })} options={catOptions} />
              </div>
              <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Descreva o produto..." />
            </div>
          </Section>
          <Section title="Preço e Imagem">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FInput label="Preço (R$)" type="number" min="0" step="0.01" value={form.price} onChange={(e: any) => setForm({ ...form, price: e.target.value })} placeholder="Deixe em branco para consultar" hint="Vazio = 'Consultar preço'" />
              <FInput label="Preço de comparação (R$)" type="number" min="0" step="0.01" value={form.compare_at_price} onChange={(e: any) => setForm({ ...form, compare_at_price: e.target.value })} />
            </div>
            <ImageUpload bucket="product-images" currentMediaId={form.cover_media_id} onUpload={mediaId => setForm({ ...form, cover_media_id: mediaId })} label="Imagem do produto" />
          </Section>
          <Section title="Publicação">
            <div className="space-y-4">
              <FToggle label="Produto ativo" checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
              <FToggle label="Destaque" description="Exibe na Home e em destaques da loja." checked={form.is_featured} onChange={v => setForm({ ...form, is_featured: v })} />
            </div>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar produto"}</BtnPrimary>
        </div>
      </Drawer>
    </div>
  );
}

/* ─────────────────────────── TAB: BRANDS ─────────────────────────── */

function TabBrands() {
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", description: "", logo_media_id: "", website_url: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const { data, error } = await supabase.from("brands").select("*").order("sort_order"); if (error) setToast({ msg: `Erro ao carregar marcas: ${error.message}`, type: "error" }); else setBrands(data || []); setLoading(false); };
  useEffect(() => { load(); }, []);

  const autoSlug = slugify;
  const openNew = () => { setForm({ name: "", slug: "", description: "", logo_media_id: "", website_url: "", is_active: true, sort_order: 0 }); setEditItem(null); setDrawerOpen(true); };
  const openEdit = (b: any) => { setForm({ name: b.name || "", slug: b.slug || "", description: b.description || "", logo_media_id: b.logo_media_id || "", website_url: b.website_url || "", is_active: b.is_active ?? true, sort_order: b.sort_order ?? 0 }); setEditItem(b); setDrawerOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { setToast({ msg: "Nome da marca é obrigatório.", type: "error" }); return; }
    setSaving(true);
    try {
      const nameChanged = editItem && editItem.name !== form.name.trim();
      const finalSlug = !editItem || nameChanged || !editItem.slug ? await generateUniqueSlug("brands", form.name, editItem?.id) : editItem.slug;
      const payload = { ...form, name: form.name.trim(), slug: finalSlug, logo_media_id: form.logo_media_id || null, website_url: form.website_url || null, description: form.description || null };
      const { data, error } = editItem ? await supabase.from("brands").update(payload).eq("id", editItem.id).select().single() : await supabase.from("brands").insert(payload).select().single();
      if (error) { console.error("[ADMIN] brands save error:", error); throw error; }
      setDrawerOpen(false);
      setToast({ msg: editItem ? "Marca atualizada!" : "Marca criada!", type: "success" });
      load();
    } catch (error) {
      setToast({ msg: `Erro ao salvar marca: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id: string) => { const { error } = await supabase.from("brands").delete().eq("id", id); if (error) { setToast({ msg: `Erro ao excluir marca: ${error.message}`, type: "error" }); return; } setDelId(null); setToast({ msg: "Marca excluída.", type: "success" }); load(); };
  const toggleActive = async (brand: any) => { const { error } = await supabase.from("brands").update({ is_active: !brand.is_active }).eq("id", brand.id); if (error) { setToast({ msg: `Erro ao atualizar marca: ${error.message}`, type: "error" }); return; } setToast({ msg: "Status atualizado!", type: "success" }); load(); };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir esta marca?" onConfirm={() => handleDelete(delId)} onCancel={() => setDelId(null)} />}

      <PageHeader title="Marcas" subtitle={`${brands.length} marca${brands.length !== 1 ? "s" : ""}`} actions={
        <BtnPrimary onClick={openNew}><Plus size={16} /> Nova marca</BtnPrimary>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : brands.length === 0 ? (
          <EmptyState icon={Tag} title="Nenhuma marca cadastrada" onAdd={openNew} addLabel="+ Nova marca" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 p-5">
            {brands.map(b => (
              <div key={b.id} className={cn("rounded-xl border p-4 flex flex-col items-center gap-3 transition-all hover:shadow-md", b.is_active ? "border-[#0d1b2e]/10 bg-white" : "border-[#0d1b2e]/5 bg-[#f8fafc] opacity-60")}>
                <BrandAdminLogo mediaId={b.logo_media_id} name={b.name} />
                <div className="text-center">
                  <p className="font-bold text-[#0d1b2e] text-sm">{b.name}</p>
                  <StatusBadge status={b.is_active ? "Ativo" : "Inativo"} />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(b)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#0057e7]/8 rounded-lg transition-colors"><Edit2 size={14} /></button>
                  <button onClick={() => toggleActive(b)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">{b.is_active ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</button>
                  <button onClick={() => setDelId(b.id)} className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editItem ? "Editar Marca" : "Nova Marca"} maxW="max-w-md">
        <div className="p-5 space-y-4">
          <Section title="Informações">
            <div className="space-y-4">
              <FInput label="Nome da marca" value={form.name} required onChange={(e: any) => setForm({ ...form, name: e.target.value, slug: editItem ? form.slug : autoSlug(e.target.value) })} placeholder="Ex: Samsung" />
              <FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} />
              <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={2} />
              <FInput label="Site" value={form.website_url} onChange={(e: any) => setForm({ ...form, website_url: e.target.value })} />
              <FToggle label="Marca ativa" checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
              <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </Section>
          <Section title="Logo">
            <div className="space-y-3">
              <ImageUpload bucket="brand-images" currentMediaId={form.logo_media_id} onUpload={mediaId => setForm({ ...form, logo_media_id: mediaId })} label="Logo da marca" />
            </div>
          </Section>
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar marca"}</BtnPrimary>
        </div>
      </Drawer>
    </div>
  );
}

/* ─────────────────────────── TAB: QUOTES ─────────────────────────── */

function TabQuotes({ onNavigate }: { onNavigate?: (tab: AdminTab) => void }) {
  const { user } = useAuth();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const [quotesResult, statusResult] = await Promise.all([
      supabase.from("quote_requests").select("id, protocol, created_at, updated_at, status_id, customer_id, service_id, brand_id, product_id, customer_message, estimated_price, final_price, request_status:request_statuses(id,name), customer:customers(id,full_name,whatsapp,email,document,phone), service:services(title), brand:brands(name)").order("created_at", { ascending: false }),
      supabase.from("request_statuses").select("id, name, sort_order").order("sort_order"),
    ]);
    if (quotesResult.error) setToast({ msg: `Erro ao carregar orçamentos: ${quotesResult.error.message}`, type: "error" });
    else setQuotes((quotesResult.data || []).map((q: any) => ({ ...q, statusName: q.request_status?.name || "Sem status" })));
    if (statusResult.error) setToast({ msg: `Erro ao carregar status: ${statusResult.error.message}`, type: "error" });
    else setStatuses(statusResult.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, statusId: string) => {
    const selectedStatus = statuses.find((status) => status.id === statusId);
    const { error: updateError } = await supabase.from("quote_requests").update({ status_id: statusId }).eq("id", id);
    if (updateError) { console.error("[ADMIN] quote status update error:", updateError); setToast({ msg: `Erro ao atualizar status: ${updateError.message}`, type: "error" }); return; }
    const { error: historyError } = await supabase.from("quote_status_history").insert({ quote_request_id: id, status_id: statusId, created_by: user?.id || null });
    if (historyError) console.warn("[ADMIN] quote status history warning:", historyError.message);
    if (detail?.id === id) setDetail({ ...detail, status_id: statusId, statusName: selectedStatus?.name || "Sem status" });
    setToast({ msg: "Status atualizado!", type: "success" });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  const filtered = quotes.filter(q => {
    const customerName = (q.customer as any)?.full_name || "";
    const customerWa = (q.customer as any)?.whatsapp || "";
    const customerDoc = (q.customer as any)?.document || "";
    const protocol = q.protocol || "";
    const matchSearch = !search || customerName.toLowerCase().includes(search.toLowerCase()) || customerWa.includes(search) || customerDoc.includes(search) || protocol.includes(search);
    const matchStatus = !filterStatus || q.status_id === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Orçamentos" subtitle={`${quotes.length} solicitaç${quotes.length !== 1 ? "ões" : "ão"} recebida${quotes.length !== 1 ? "s" : ""}`} actions={
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors">
          <RefreshCw size={13} /> Atualizar
        </button>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por cliente, CPF, protocolo..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={cn(INPUT, "py-2 text-xs sm:w-48")}>
            <option value="">Todos os status</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhuma solicitação" message="As solicitações de orçamento aparecem aqui." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Protocolo</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Serviço / Marca</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {filtered.map(q => (
                  <tr key={q.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-[#0d1b2e] text-sm">{(q.customer as any)?.full_name || "—"}</p>
                      <p className="text-xs text-[#5a6a82]">{(q.customer as any)?.whatsapp || ""}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">
                      {(q.service as any)?.title && <div className="font-medium text-[#0d1b2e]">{(q.service as any).title}</div>}
                      {(q.brand as any)?.name && <div>{(q.brand as any).name}</div>}
                      {!(q.service as any)?.title && !(q.brand as any)?.name && "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <select value={q.status_id || ""} onChange={e => updateStatus(q.id, e.target.value)}
                        className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1 font-bold bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0057e7]/30">
                        {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{fmtDate(q.created_at)}</td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => setDetail(q)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:underline ml-auto">Ver detalhes</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quote Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100] overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl my-4">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-black text-[#0d1b2e] text-xl" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Orçamento</h3>
                {detail.protocol && <p className="text-xs text-[#0057e7] font-mono font-bold">{detail.protocol}</p>}
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 text-[#5a6a82] hover:text-[#0d1b2e] rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Customer info */}
              <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#0d1b2e]/8">
                <p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Dados do cliente</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-[10px] text-[#5a6a82]">Nome</p><p className="font-bold text-[#0d1b2e]">{(detail.customer as any)?.full_name || "—"}</p></div>
                  <div><p className="text-[10px] text-[#5a6a82]">WhatsApp</p><p className="font-medium text-[#0d1b2e]">{(detail.customer as any)?.whatsapp || "—"}</p></div>
                  {(detail.customer as any)?.email && <div><p className="text-[10px] text-[#5a6a82]">E-mail</p><p className="font-medium text-[#0d1b2e] text-xs">{(detail.customer as any).email}</p></div>}
                  {(detail.customer as any)?.document && <div><p className="text-[10px] text-[#5a6a82]">CPF</p><p className="font-medium text-[#0d1b2e]">{(detail.customer as any).document}</p></div>}
                </div>
              </div>
              {/* Service / Brand */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-[#5a6a82] font-semibold uppercase">Serviço</p><p className="font-medium text-[#0d1b2e]">{(detail.service as any)?.title || "—"}</p></div>
                <div><p className="text-xs text-[#5a6a82] font-semibold uppercase">Marca</p><p className="font-medium text-[#0d1b2e]">{(detail.brand as any)?.name || "—"}</p></div>
                {detail.estimated_price && <div><p className="text-xs text-[#5a6a82] font-semibold uppercase">Valor estimado</p><p className="font-bold text-[#0d1b2e]">R$ {Number(detail.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div>}
                {detail.final_price && <div><p className="text-xs text-[#5a6a82] font-semibold uppercase">Valor final</p><p className="font-bold text-[#0d1b2e]">R$ {Number(detail.final_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div>}
              </div>
              {detail.customer_message && (
                <div className="bg-[#f8fafc] rounded-lg p-3 border border-[#0d1b2e]/8">
                  <p className="text-xs text-[#5a6a82] font-semibold uppercase mb-1">Mensagem do cliente</p>
                  <p className="text-sm text-[#0d1b2e]">{detail.customer_message}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-[#5a6a82] font-semibold uppercase mb-2">Status</p>
                <select value={detail.status_id || ""} onChange={e => updateStatus(detail.id, e.target.value)}
                  className={cn(INPUT, "py-2 text-sm max-w-xs")}>
                  {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-[#0d1b2e]/8 flex items-center justify-between gap-3">
              <button onClick={async () => {
                if (!detail) return;
                const { data: existing } = await supabase.from("service_orders").select("id, protocol").eq("quote_request_id", detail.id).maybeSingle();
                if (existing) { setToast({ msg: `OS ${existing.protocol || existing.id.slice(0,8)} já existe para este orçamento.`, type: "error" }); return; }
                const protocol = generateOsProtocol();
                const { data: status } = await supabase.from("order_statuses").select("id").order("sort_order").limit(1).maybeSingle();
                const { error } = await supabase.from("service_orders").insert({
                  protocol, title: (detail.service as any)?.title || detail.customer_message || "Ordem de Serviço",
                  description: detail.customer_message || null, quote_request_id: detail.id,
                  customer_id: detail.customer_id, brand_id: detail.brand_id, product_id: detail.product_id,
                  status_id: status?.id || null, priority: "normal", origin: "orcamento",
                  estimated_price: detail.estimated_price || null, created_by: user?.id || null, updated_by: user?.id || null,
                });
                if (error) { setToast({ msg: `Erro ao criar OS: ${error.message}`, type: "error" }); return; }
                setDetail(null);
                setToast({ msg: `OS criada com protocolo ${protocol}! Acesse a aba Ordens de Serviço.`, type: "success" });
                if (onNavigate) setTimeout(() => onNavigate("orders"), 1200);
              }} className="flex items-center gap-2 text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors">
                <ClipboardList size={13} /> Converter em OS
              </button>
              <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: ORDERS ─────────────────────────── */

const PRIORITY_COLORS: Record<string, string> = {
  baixa:   "bg-[#e8eef8] text-[#5a6a82]",
  normal:  "bg-[#e8f5e9] text-[#2e7d32]",
  alta:    "bg-[#fff3e0] text-[#e65100]",
  urgente: "bg-[#ffebee] text-[#c62828]",
};
const PRIORITY_LABELS: Record<string, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };

function PriorityBadge({ priority }: { priority?: string }) {
  const p = priority || "normal";
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap", PRIORITY_COLORS[p] || PRIORITY_COLORS.normal)}>{PRIORITY_LABELS[p] || p}</span>;
}

function OSSituationsView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("os_situations").select("*").order("sort_order");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditItem(null); setForm({ name: "", description: "", is_active: true, sort_order: items.length }); setDrawerOpen(true); };
  const openEdit = (s: any) => { setEditItem(s); setForm({ name: s.name, description: s.description || "", is_active: s.is_active, sort_order: s.sort_order }); setDrawerOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description || null, is_active: form.is_active, sort_order: Number(form.sort_order) };
    const { error } = editItem
      ? await supabase.from("os_situations").update(payload).eq("id", editItem.id)
      : await supabase.from("os_situations").insert(payload);
    setSaving(false);
    if (error) { setToast({ msg: `Erro: ${error.message}`, type: "error" }); return; }
    setToast({ msg: "Situação salva!", type: "success" });
    setDrawerOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Remover esta situação?")) return;
    await supabase.from("os_situations").delete().eq("id", id);
    load();
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <PageHeader title="Situações da OS" subtitle="Etapas de progresso das ordens de serviço" actions={
        <div className="flex gap-2">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-[#5a6a82] border border-[#0d1b2e]/20 px-3 py-2 rounded-lg hover:bg-[#f5f7fa] transition-colors"><ArrowLeft size={13} /> Voltar</button>
          <button onClick={openNew} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0] transition-colors"><Plus size={13} /> Nova Situação</button>
        </div>
      } />
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={List} title="Nenhuma situação" message="Crie situações para acompanhar as etapas das OS." /> : (
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
              <tr><th className="px-4 py-3 text-left">Ordem</th><th className="px-4 py-3 text-left">Nome</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Ações</th></tr>
            </thead>
            <tbody className="divide-y divide-[#0d1b2e]/5">
              {items.map(s => (
                <tr key={s.id} className="hover:bg-[#f8fafc]/80">
                  <td className="px-4 py-3 text-[#5a6a82] text-xs font-mono">{s.sort_order}</td>
                  <td className="px-4 py-3"><p className="font-semibold text-[#0d1b2e]">{s.name}</p>{s.description && <p className="text-xs text-[#5a6a82]">{s.description}</p>}</td>
                  <td className="px-4 py-3"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", s.is_active ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{s.is_active ? "Ativa" : "Inativa"}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#e8eef8] rounded-lg"><Edit2 size={14} /></button>
                      <button onClick={() => del(s.id)} className="p-1.5 text-[#5a6a82] hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {drawerOpen && (
        <Drawer open={true} onClose={() => setDrawerOpen(false)} title={editItem ? "Editar Situação" : "Nova Situação"} maxW="max-w-md">
          <div className="p-5 space-y-4">
            <FInput label="Nome" value={form.name} required onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Em análise" />
            <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={2} />
            <FInput label="Ordem de exibição" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            <FToggle label="Situação ativa" checked={form.is_active} onChange={v => setForm({ ...form, is_active: v })} />
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>
            <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function TabOrders({ onNavigate }: { onNavigate?: (tab: AdminTab) => void }) {
  const { user } = useAuth();
  const [subView, setSubView] = useState<"list" | "situations">("list");
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [situations, setSituations] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSituation, setFilterSituation] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [detailHistory, setDetailHistory] = useState<any[]>([]);
  const [detailNewStatus, setDetailNewStatus] = useState("");
  const [detailNewNote, setDetailNewNote] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

  const emptyForm = { title: "", description: "", diagnosis: "", solution: "", notes: "", status_id: "", situation_id: "", priority: "normal", origin: "manual", customer_id: "", brand_id: "", product_id: "", model: "", serial_number: "", accessories: "", equipment_condition: "", assigned_to: "", scheduled_date: "", completion_date: "", estimated_price: "", final_price: "" };
  const [form, setForm] = useState(emptyForm);
  const upF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const load = async () => {
    setLoading(true);
    const [ordRes, statRes, sitRes, profRes, brandRes, prodRes] = await Promise.all([
      supabase.from("service_orders").select("*, order_status:order_statuses(id,name), situation:os_situations(id,name), customer:customers(id,full_name,phone,whatsapp,document,email), brand:brands(id,name), product:products(id,name), assigned_profile:profiles!assigned_to(id,full_name)").order("created_at", { ascending: false }),
      supabase.from("order_statuses").select("id,name,sort_order").order("sort_order"),
      supabase.from("os_situations").select("id,name,sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("profiles").select("id,full_name").order("full_name"),
      supabase.from("brands").select("id,name").eq("is_active", true).order("name"),
      supabase.from("products").select("id,name").eq("is_active", true).order("name"),
    ]);
    if (ordRes.error) setToast({ msg: `Erro ao carregar OS: ${ordRes.error.message}`, type: "error" });
    else setOrders(ordRes.data || []);
    setStatuses(statRes.data || []);
    setSituations(sitRes.data || []);
    setProfiles(profRes.data || []);
    setBrands(brandRes.data || []);
    setProducts(prodRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (o: any) => {
    const { data: hist } = await supabase.from("service_order_status_history").select("*, order_status:order_statuses(name)").eq("service_order_id", o.id).order("created_at", { ascending: false });
    setDetailHistory(hist || []);
    setDetailNewStatus(o.status_id || "");
    setDetailNewNote("");
    setDetail(o);
  };

  const openNew = () => {
    setEditingOS(null); setForm(emptyForm); setSelectedCustomer(null); setCustomerSearch(""); setCustomerResults([]); setFormOpen(true);
  };

  const openEdit = (o: any) => {
    setEditingOS(o);
    setForm({ title: o.title || "", description: o.description || "", diagnosis: o.diagnosis || "", solution: o.solution || "", notes: o.notes || "", status_id: o.status_id || "", situation_id: o.situation_id || "", priority: o.priority || "normal", origin: o.origin || "manual", customer_id: o.customer_id || "", brand_id: o.brand_id || "", product_id: o.product_id || "", model: o.model || "", serial_number: o.serial_number || "", accessories: o.accessories || "", equipment_condition: o.equipment_condition || "", assigned_to: o.assigned_to || "", scheduled_date: o.scheduled_date ? o.scheduled_date.slice(0, 10) : "", completion_date: o.completion_date ? o.completion_date.slice(0, 10) : "", estimated_price: o.estimated_price ?? "", final_price: o.final_price ?? "" });
    setSelectedCustomer((o.customer as any) || null);
    setCustomerSearch(""); setCustomerResults([]);
    setFormOpen(true);
  };

  const saveOS = async () => {
    if (!form.title.trim()) { setToast({ msg: "Informe o título da OS.", type: "error" }); return; }
    const cid = selectedCustomer?.id || form.customer_id;
    if (!cid) { setToast({ msg: "Selecione um cliente.", type: "error" }); return; }
    setSaving(true);
    const protocol = editingOS?.protocol || generateOsProtocol();
    const payload: any = { protocol, title: form.title.trim(), description: form.description || null, diagnosis: form.diagnosis || null, solution: form.solution || null, notes: form.notes || null, status_id: form.status_id || null, situation_id: form.situation_id || null, priority: form.priority, origin: form.origin, customer_id: cid, brand_id: form.brand_id || null, product_id: form.product_id || null, model: form.model || null, serial_number: form.serial_number || null, accessories: form.accessories || null, equipment_condition: form.equipment_condition || null, assigned_to: form.assigned_to || null, scheduled_date: form.scheduled_date || null, completion_date: form.completion_date || null, estimated_price: form.estimated_price ? Number(form.estimated_price) : null, final_price: form.final_price ? Number(form.final_price) : null, updated_by: user?.id || null };
    let error;
    if (editingOS) {
      const r = await supabase.from("service_orders").update(payload).eq("id", editingOS.id);
      error = r.error;
    } else {
      const r = await supabase.from("service_orders").insert({ ...payload, created_by: user?.id || null });
      error = r.error;
    }
    setSaving(false);
    if (error) { setToast({ msg: `Erro ao salvar OS: ${error.message}`, type: "error" }); return; }
    setToast({ msg: `OS ${editingOS ? "atualizada" : "criada"} com sucesso!`, type: "success" });
    setFormOpen(false); setDetail(null); load();
  };

  const updateStatus = async (statusId: string, note: string) => {
    if (!detail) return;
    const { error: e1 } = await supabase.from("service_orders").update({ status_id: statusId, updated_by: user?.id || null }).eq("id", detail.id);
    if (e1) { setToast({ msg: `Erro: ${e1.message}`, type: "error" }); return; }
    await supabase.from("service_order_status_history").insert({ service_order_id: detail.id, status_id: statusId, notes: note || null, is_visible_to_customer: Boolean(note), created_by: user?.id || null });
    setToast({ msg: "Status atualizado!", type: "success" });
    const updated = orders.map(o => o.id === detail.id ? { ...o, status_id: statusId } : o);
    setOrders(updated);
    setDetail(null); load();
  };

  const searchCustomers = async (q: string) => {
    setCustomerSearch(q);
    if (q.length < 2) { setCustomerResults([]); return; }
    const { data } = await supabase.from("customers").select("id,full_name,document,whatsapp,phone").or(`full_name.ilike.%${q}%,document.ilike.%${q}%,whatsapp.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setCustomerResults(data || []);
  };

  const fmtDate = (d?: string | null, time = false) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
  };

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !search || (o.protocol || "").toLowerCase().includes(q) || (o.title || "").toLowerCase().includes(q) || ((o.customer as any)?.full_name || "").toLowerCase().includes(q) || (o.model || "").toLowerCase().includes(q);
    const matchStatus = !filterStatus || o.status_id === filterStatus;
    const matchSituation = !filterSituation || o.situation_id === filterSituation;
    const matchPriority = !filterPriority || o.priority === filterPriority;
    return matchSearch && matchStatus && matchSituation && matchPriority;
  });

  if (subView === "situations") return <OSSituationsView onBack={() => setSubView("list")} />;

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">{label}</p><p className="text-sm font-medium text-[#0d1b2e]">{value}</p></div> : null;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Ordens de Serviço" subtitle={`${orders.length} OS cadastrada${orders.length !== 1 ? "s" : ""}`} actions={
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setSubView("situations")} className="flex items-center gap-1.5 text-xs text-[#5a6a82] border border-[#0d1b2e]/20 px-3 py-2 rounded-lg hover:bg-[#f5f7fa]"><List size={13} /> Situações</button>
          <button onClick={openNew} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0]"><Plus size={13} /> Nova OS</button>
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5"><RefreshCw size={13} /> Atualizar</button>
        </div>
      } />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar OS, cliente, modelo..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={cn(INPUT, "py-2 text-xs")}>
          <option value="">Todos os status</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterSituation} onChange={e => setFilterSituation(e.target.value)} className={cn(INPUT, "py-2 text-xs")}>
          <option value="">Todas as situações</option>{situations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={cn(INPUT, "py-2 text-xs")}>
          <option value="">Todas as prioridades</option>
          {[["baixa","Baixa"],["normal","Normal"],["alta","Alta"],["urgente","Urgente"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma OS encontrada" message={search || filterStatus || filterSituation || filterPriority ? "Tente ajustar os filtros." : "Crie a primeira OS com o botão + Nova OS."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left w-28">Protocolo</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Título / Equipamento</th>
                  <th className="px-4 py-3 text-left w-28">Status</th>
                  <th className="px-4 py-3 text-left w-32">Situação</th>
                  <th className="px-4 py-3 text-left w-24">Prioridade</th>
                  <th className="px-4 py-3 text-left w-28">Abertura</th>
                  <th className="px-4 py-3 text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {filtered.map(o => (
                  <tr key={o.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs font-black text-[#0057e7]">{o.protocol || o.id.slice(0, 8)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[#0d1b2e] text-sm">{(o.customer as any)?.full_name || "—"}</p>
                      <p className="text-[11px] text-[#5a6a82]">{(o.customer as any)?.whatsapp || (o.customer as any)?.phone || ""}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-[#0d1b2e] text-sm">{o.title || "—"}</p>
                      <p className="text-[11px] text-[#5a6a82]">{[(o.brand as any)?.name, o.model].filter(Boolean).join(" · ") || ""}</p>
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={(o.order_status as any)?.name || "—"} /></td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{(o.situation as any)?.name || "—"}</td>
                    <td className="px-4 py-3.5"><PriorityBadge priority={o.priority} /></td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{fmtDate(o.created_at)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openDetail(o)} className="p-1.5 text-[#0057e7] hover:bg-[#e8eef8] rounded-lg" title="Ver detalhes"><AlertCircle size={14} /></button>
                        <button onClick={() => openEdit(o)} className="p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa] rounded-lg" title="Editar"><Edit2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OS Detail Drawer */}
      {detail && (
        <Drawer open={true} onClose={() => setDetail(null)} title={detail.protocol || `OS #${detail.id.slice(0,8)}`} subtitle={detail.title || "Ordem de Serviço"} maxW="max-w-2xl">
            <div className="p-5 space-y-5">
              <div className="flex flex-wrap gap-2 items-center">
                <StatusBadge status={(detail.order_status as any)?.name || "—"} />
                <PriorityBadge priority={detail.priority} />
                {(detail.situation as any)?.name && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e8eef8] text-[#0057e7]">{(detail.situation as any).name}</span>}
                {detail.origin === "orcamento" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Via Orçamento</span>}
              </div>
              <Section title="Cliente">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Nome" value={(detail.customer as any)?.full_name} />
                  <InfoRow label="CPF/Documento" value={(detail.customer as any)?.document} />
                  <InfoRow label="WhatsApp" value={(detail.customer as any)?.whatsapp} />
                  <InfoRow label="Telefone" value={(detail.customer as any)?.phone} />
                  <InfoRow label="E-mail" value={(detail.customer as any)?.email} />
                </div>
              </Section>
              {(detail.brand_id || detail.product_id || detail.model || detail.serial_number || detail.accessories || detail.equipment_condition) && (
                <Section title="Equipamento">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <InfoRow label="Marca" value={(detail.brand as any)?.name} />
                    <InfoRow label="Produto" value={(detail.product as any)?.name} />
                    <InfoRow label="Modelo" value={detail.model} />
                    <InfoRow label="Nº de Série" value={detail.serial_number} />
                    <InfoRow label="Acessórios recebidos" value={detail.accessories} />
                    <InfoRow label="Estado do equipamento" value={detail.equipment_condition} />
                  </div>
                </Section>
              )}
              <Section title="Problema e Diagnóstico">
                <div className="space-y-3">
                  <InfoRow label="Problema relatado" value={detail.description} />
                  <InfoRow label="Diagnóstico" value={detail.diagnosis} />
                  <InfoRow label="Solução aplicada" value={detail.solution} />
                </div>
              </Section>
              {(detail.estimated_price || detail.final_price) && (
                <Section title="Valores">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {detail.estimated_price && <InfoRow label="Valor estimado" value={`R$ ${Number(detail.estimated_price).toLocaleString("pt-BR",{minimumFractionDigits:2})}`} />}
                    {detail.final_price && <InfoRow label="Valor final" value={`R$ ${Number(detail.final_price).toLocaleString("pt-BR",{minimumFractionDigits:2})}`} />}
                  </div>
                </Section>
              )}
              <Section title="Datas e Responsável">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Abertura" value={fmtDate(detail.created_at, true)} />
                  <InfoRow label="Previsão" value={fmtDate(detail.scheduled_date)} />
                  <InfoRow label="Conclusão" value={fmtDate(detail.completion_date)} />
                  <InfoRow label="Responsável" value={(detail.assigned_profile as any)?.full_name} />
                </div>
              </Section>
              <Section title="Histórico">
                {detailHistory.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhum registro de alteração.</p> : (
                  <div className="space-y-2">
                    {detailHistory.map((h: any) => (
                      <div key={h.id} className="flex gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#0057e7] mt-1.5 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-[#0d1b2e]">{(h.order_status as any)?.name || "Status alterado"}</span>
                          {h.notes && <span className="text-[#5a6a82] ml-1">— {h.notes}</span>}
                          <p className="text-[#5a6a82] text-[10px]">{fmtDate(h.created_at, true)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
              {detail.notes && <Section title="Observações"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.notes}</p></Section>}
              <Section title="Atualizar Status">
                <div className="space-y-3">
                  <FSelect label="Novo status" value={detailNewStatus} onChange={(e: any) => setDetailNewStatus(e.target.value)} options={[{ value: "", label: "Selecionar..." }, ...statuses.map(s => ({ value: s.id, label: s.name }))]} />
                  <FTextarea label="Observação (visível ao cliente)" value={detailNewNote} onChange={(e: any) => setDetailNewNote(e.target.value)} rows={2} placeholder="Mensagem opcional..." />
                </div>
              </Section>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-between gap-3">
              <button onClick={() => { setDetail(null); openEdit(detail); }} className="flex items-center gap-1.5 text-xs font-bold text-[#5a6a82] border border-[#0d1b2e]/20 px-3 py-2 rounded-lg hover:bg-[#f5f7fa]"><Edit2 size={13} /> Editar OS</button>
              <div className="flex gap-2">
                <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
                <BtnPrimary onClick={() => updateStatus(detailNewStatus, detailNewNote)} disabled={!detailNewStatus || saving}><CheckCircle size={14} /> Salvar Status</BtnPrimary>
              </div>
            </div>
        </Drawer>
      )}

      {/* OS Create/Edit Form Drawer */}
      {formOpen && (
        <Drawer open={true} onClose={() => setFormOpen(false)} title={editingOS ? `Editar OS — ${editingOS.protocol || editingOS.id.slice(0,8)}` : "Nova Ordem de Serviço"} maxW="max-w-2xl">
          <div className="p-5 space-y-5">
            {/* Cliente */}
            <Section title="Cliente">
              {selectedCustomer ? (
                <div className="flex items-start justify-between bg-[#f8fafc] rounded-lg p-3 border border-[#0d1b2e]/8">
                  <div>
                    <p className="font-bold text-[#0d1b2e]">{selectedCustomer.full_name}</p>
                    <p className="text-xs text-[#5a6a82]">{selectedCustomer.document} {selectedCustomer.whatsapp && `· ${selectedCustomer.whatsapp}`}</p>
                  </div>
                  <button onClick={() => { setSelectedCustomer(null); upF("customer_id", ""); }} className="text-xs text-red-500 hover:underline">Trocar</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
                    <input value={customerSearch} onChange={e => searchCustomers(e.target.value)} placeholder="Buscar cliente por nome, CPF ou WhatsApp..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
                  </div>
                  {customerResults.length > 0 && (
                    <div className="border border-[#0d1b2e]/10 rounded-lg overflow-hidden">
                      {customerResults.map(c => (
                        <button key={c.id} onClick={() => { setSelectedCustomer(c); upF("customer_id", c.id); setCustomerResults([]); setCustomerSearch(""); }} className="w-full text-left px-3 py-2 hover:bg-[#e8eef8] border-b last:border-b-0 border-[#0d1b2e]/5">
                          <p className="font-semibold text-sm text-[#0d1b2e]">{c.full_name}</p>
                          <p className="text-xs text-[#5a6a82]">{c.document} {c.whatsapp && `· ${c.whatsapp}`}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* Informações Básicas */}
            <Section title="Informações da OS">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><FInput label="Título" value={form.title} required onChange={(e: any) => upF("title", e.target.value)} placeholder="Ex: Manutenção de ar-condicionado" /></div>
                <FSelect label="Status" value={form.status_id} onChange={(e: any) => upF("status_id", e.target.value)} options={[{ value: "", label: "Selecionar status..." }, ...statuses.map(s => ({ value: s.id, label: s.name }))]} />
                <FSelect label="Situação" value={form.situation_id} onChange={(e: any) => upF("situation_id", e.target.value)} options={[{ value: "", label: "Selecionar situação..." }, ...situations.map(s => ({ value: s.id, label: s.name }))]} />
                <FSelect label="Prioridade" value={form.priority} onChange={(e: any) => upF("priority", e.target.value)} options={[["baixa","Baixa"],["normal","Normal"],["alta","Alta"],["urgente","Urgente"]].map(([v,l]) => ({ value: v, label: l }))} />
                <FSelect label="Responsável" value={form.assigned_to} onChange={(e: any) => upF("assigned_to", e.target.value)} options={[{ value: "", label: "Sem responsável" }, ...profiles.map(p => ({ value: p.id, label: p.full_name || p.id }))]} />
                <FInput label="Data prevista" type="date" value={form.scheduled_date} onChange={(e: any) => upF("scheduled_date", e.target.value)} />
                <FInput label="Data de conclusão" type="date" value={form.completion_date} onChange={(e: any) => upF("completion_date", e.target.value)} />
              </div>
            </Section>

            {/* Equipamento */}
            <Section title="Equipamento">
              <div className="grid sm:grid-cols-2 gap-4">
                <FSelect label="Marca" value={form.brand_id} onChange={(e: any) => upF("brand_id", e.target.value)} options={[{ value: "", label: "Selecionar marca..." }, ...brands.map(b => ({ value: b.id, label: b.name }))]} />
                <FSelect label="Produto" value={form.product_id} onChange={(e: any) => upF("product_id", e.target.value)} options={[{ value: "", label: "Selecionar produto..." }, ...products.map(p => ({ value: p.id, label: p.name }))]} />
                <FInput label="Modelo" value={form.model} onChange={(e: any) => upF("model", e.target.value)} placeholder="Ex: Split 12.000 BTU" />
                <FInput label="Nº de Série" value={form.serial_number} onChange={(e: any) => upF("serial_number", e.target.value)} placeholder="SN123456" />
                <FInput label="Acessórios recebidos" value={form.accessories} onChange={(e: any) => upF("accessories", e.target.value)} placeholder="Controle remoto, cabo..." />
                <FInput label="Estado do equipamento" value={form.equipment_condition} onChange={(e: any) => upF("equipment_condition", e.target.value)} placeholder="Amassado, riscado..." />
              </div>
            </Section>

            {/* Problema / Diagnóstico / Solução */}
            <Section title="Problema e Diagnóstico">
              <div className="space-y-4">
                <FTextarea label="Problema relatado" value={form.description} onChange={(e: any) => upF("description", e.target.value)} rows={3} placeholder="Descrição do problema informado pelo cliente..." />
                <FTextarea label="Diagnóstico" value={form.diagnosis} onChange={(e: any) => upF("diagnosis", e.target.value)} rows={3} placeholder="Diagnóstico técnico após análise..." />
                <FTextarea label="Solução aplicada" value={form.solution} onChange={(e: any) => upF("solution", e.target.value)} rows={3} placeholder="Solução ou serviço realizado..." />
              </div>
            </Section>

            {/* Valores */}
            <Section title="Valores">
              <div className="grid sm:grid-cols-2 gap-4">
                <FInput label="Valor estimado (R$)" type="number" min="0" step="0.01" value={form.estimated_price} onChange={(e: any) => upF("estimated_price", e.target.value)} placeholder="0,00" />
                <FInput label="Valor final (R$)" type="number" min="0" step="0.01" value={form.final_price} onChange={(e: any) => upF("final_price", e.target.value)} placeholder="0,00" />
              </div>
            </Section>

            {/* Observações */}
            <Section title="Observações Internas">
              <FTextarea label="Observações" value={form.notes} onChange={(e: any) => upF("notes", e.target.value)} rows={3} placeholder="Informações internas sobre esta OS..." />
            </Section>
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>
            <BtnPrimary onClick={saveOS} disabled={saving}>{saving ? <Clock size={14} className="animate-spin" /> : <CheckCircle size={14} />}{saving ? "Salvando..." : editingOS ? "Salvar alterações" : "Criar OS"}</BtnPrimary>
          </div>
        </Drawer>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: CUSTOMERS ─────────────────────────── */

function TabCustomers() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [detailQuotes, setDetailQuotes] = useState<any[]>([]);
  const [detailOrders, setDetailOrders] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", phone: "", whatsapp: "", document: "" });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    if (error) setToast({ msg: `Erro ao carregar clientes: ${error.message}`, type: "error" });
    else setCustomers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openDetail = async (c: any) => {
    setDetail(c);
    setEditForm({ full_name: c.full_name || "", email: c.email || "", phone: c.phone || "", whatsapp: c.whatsapp || "", document: c.document || "" });
    setEditMode(false);
    setDetailLoading(true);
    const [quotesRes, ordersRes] = await Promise.all([
      supabase.from("quote_requests").select("id, protocol, created_at, status_id, estimated_price, final_price, customer_message, request_status:request_statuses(name), service:services(title), brand:brands(name)").eq("customer_id", c.id).order("created_at", { ascending: false }),
      supabase.from("service_orders").select("id, title, description, created_at, scheduled_date, completion_date, notes, status_id, order_status:order_statuses(name)").eq("customer_id", c.id).order("created_at", { ascending: false }),
    ]);
    setDetailQuotes(quotesRes.data || []);
    setDetailOrders(ordersRes.data || []);
    setDetailLoading(false);
  };

  const handleSave = async () => {
    if (!editForm.full_name.trim()) { setToast({ msg: "Nome é obrigatório.", type: "error" }); return; }
    setSaving(true);
    const { error } = await supabase.from("customers").update({ full_name: editForm.full_name.trim(), email: editForm.email || null, phone: editForm.phone || null, whatsapp: editForm.whatsapp || null, document: editForm.document ? editForm.document.replace(/\D/g, "") : null }).eq("id", detail.id);
    if (error) { setToast({ msg: `Erro ao salvar: ${error.message}`, type: "error" }); setSaving(false); return; }
    setToast({ msg: "Cliente atualizado!", type: "success" });
    setSaving(false);
    setEditMode(false);
    load();
    openDetail({ ...detail, ...editForm, document: editForm.document ? editForm.document.replace(/\D/g, "") : null });
  };

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  const normalizeDoc = (doc: string) => doc.replace(/\D/g, "");

  const filtered = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.full_name || "").toLowerCase().includes(s) || (c.whatsapp || "").includes(search) || (c.email || "").toLowerCase().includes(s) || normalizeDoc(c.document || "").includes(normalizeDoc(search));
  });

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Clientes" subtitle={`${customers.length} cliente${customers.length !== 1 ? "s" : ""} cadastrado${customers.length !== 1 ? "s" : ""}`} actions={
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors">
          <RefreshCw size={13} /> Atualizar
        </button>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, CPF, WhatsApp ou e-mail..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente cadastrado" message="Os clientes aparecem aqui ao enviar um orçamento." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">CPF</th>
                  <th className="px-4 py-3 text-left">WhatsApp</th>
                  <th className="px-4 py-3 text-left">E-mail</th>
                  <th className="px-4 py-3 text-left">Cadastrado em</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-[#f8fafc]/80">
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{c.full_name}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]">{c.document ? c.document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{c.whatsapp || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82] truncate max-w-[160px]">{c.email || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{fmtDate(c.created_at)}</td>
                    <td className="px-4 py-3.5">
                      <button onClick={() => openDetail(c)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:underline ml-auto">Ver detalhes</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Detail Drawer */}
      {detail && (
        <Drawer open={true} onClose={() => setDetail(null)} title={detail.full_name} subtitle={detail.document ? detail.document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "Cliente"} maxW="max-w-2xl">
          <div className="p-5 space-y-5">
            {/* Customer info */}
            <Section title="Informações do cliente">
              {editMode ? (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <FInput label="Nome completo" value={editForm.full_name} required onChange={(e: any) => setEditForm({ ...editForm, full_name: e.target.value })} />
                    <FInput label="CPF" value={editForm.document} onChange={(e: any) => setEditForm({ ...editForm, document: e.target.value })} placeholder="000.000.000-00" />
                    <FInput label="WhatsApp" value={editForm.whatsapp} onChange={(e: any) => setEditForm({ ...editForm, whatsapp: e.target.value })} />
                    <FInput label="Telefone" value={editForm.phone} onChange={(e: any) => setEditForm({ ...editForm, phone: e.target.value })} />
                    <div className="sm:col-span-2"><FInput label="E-mail" type="email" value={editForm.email} onChange={(e: any) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <BtnPrimary onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</BtnPrimary>
                    <BtnSecondary onClick={() => setEditMode(false)}>Cancelar</BtnSecondary>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Nome</p><p className="font-bold text-[#0d1b2e]">{detail.full_name}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">CPF</p><p className="font-medium text-[#0d1b2e]">{detail.document ? detail.document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">WhatsApp</p><p className="font-medium text-[#0d1b2e]">{detail.whatsapp || "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Telefone</p><p className="font-medium text-[#0d1b2e]">{detail.phone || "—"}</p></div>
                    <div className="sm:col-span-2"><p className="text-[10px] text-[#5a6a82] font-bold uppercase">E-mail</p><p className="font-medium text-[#0d1b2e]">{detail.email || "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Cadastrado em</p><p className="font-medium text-[#0d1b2e]">{fmtDate(detail.created_at)}</p></div>
                  </div>
                  <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-1.5 rounded-lg border border-[#0057e7]/30 transition-colors">
                    <Edit2 size={12} /> Editar dados
                  </button>
                </div>
              )}
            </Section>

            {detailLoading ? <LoadingState text="Carregando histórico..." /> : (
              <>
                {/* Quotes */}
                <Section title={`Orçamentos (${detailQuotes.length})`}>
                  {detailQuotes.length === 0 ? (
                    <p className="text-xs text-[#5a6a82]">Nenhum orçamento para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailQuotes.map(q => (
                        <div key={q.id} className="bg-[#f8fafc] border border-[#0d1b2e]/8 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span>
                            <StatusBadge status={(q.request_status as any)?.name || "—"} />
                          </div>
                          <p className="text-xs text-[#5a6a82]">{(q.service as any)?.title || "Serviço não informado"}{(q.brand as any)?.name ? ` — ${(q.brand as any).name}` : ""}</p>
                          {q.customer_message && <p className="text-xs text-[#0d1b2e] mt-1 italic">&quot;{q.customer_message}&quot;</p>}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#5a6a82]">
                            <span>{fmtDate(q.created_at)}</span>
                            {q.estimated_price && <span>Est: R$ {Number(q.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                            {q.final_price && <span>Final: R$ {Number(q.final_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Orders */}
                <Section title={`Ordens de Serviço (${detailOrders.length})`}>
                  {detailOrders.length === 0 ? (
                    <p className="text-xs text-[#5a6a82]">Nenhuma OS para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailOrders.map(o => (
                        <div key={o.id} className="bg-[#f8fafc] border border-[#0d1b2e]/8 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-xs text-[#0057e7]">#{o.id.slice(0, 8)}</span>
                            <StatusBadge status={(o.order_status as any)?.name || "—"} />
                          </div>
                          <p className="text-xs font-semibold text-[#0d1b2e]">{o.title}</p>
                          {o.description && <p className="text-xs text-[#5a6a82] mt-0.5">{o.description}</p>}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#5a6a82]">
                            <span>Criada: {fmtDate(o.created_at)}</span>
                            {o.scheduled_date && <span>Agendado: {fmtDate(o.scheduled_date)}</span>}
                            {o.completion_date && <span>Concluído: {fmtDate(o.completion_date)}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-6 py-4 text-right">
            <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
          </div>
        </Drawer>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: EMPLOYEES ─────────────────────────── */

function TabEmployees() {
  const { profile: currentProfile } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const isGestor = (currentProfile as any)?.role_id === "gestor" || (currentProfile as any)?.role === "gestor";

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").order("created_at");
    if (error) { console.error("[ADMIN] profiles load error:", error); setToast({ msg: `Erro ao carregar funcionários: ${error.message}`, type: "error" }); }
    else setEmployees(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (emp: any) => {
    if (!isGestor) return;
    const currentlyActive = emp.is_active !== false;
    const { error } = await supabase.from("profiles").update({ is_active: !currentlyActive }).eq("id", emp.id);
    if (error) { console.error("[ADMIN] profile toggle error:", error); setToast({ msg: `Erro ao atualizar usuário: ${error.message}`, type: "error" }); return; }
    setToast({ msg: `Usuário ${currentlyActive ? "desativado" : "ativado"}.`, type: "success" });
    load();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Funcionários" subtitle="Usuários com acesso ao painel administrativo" />

      {!isGestor && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-center gap-2">
          <Shield size={16} className="flex-shrink-0" />
          Somente gestores podem alterar permissões de usuários.
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : employees.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum funcionário cadastrado" message="Funcionários são criados via Supabase Auth." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[550px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Funcionário</th>
                  <th className="px-4 py-3 text-left">Cargo / Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Cadastrado em</th>
                  {isGestor && <th className="px-4 py-3 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {employees.map(emp => {
                  const active = emp.is_active !== false;
                  return (
                    <tr key={emp.id} className="hover:bg-[#f8fafc]/80">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-[#0057e7]/10 rounded-full flex items-center justify-center flex-shrink-0">
                            {emp.avatar_url ? <img src={emp.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : <Users size={16} className="text-[#0057e7]" />}
                          </div>
                          <span className="font-bold text-[#0d1b2e]">{emp.full_name || "Sem nome"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                          (emp.role_id || "").toLowerCase() === "gestor" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800")}>
                          {emp.role_id || "Funcionário"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={active ? "Ativo" : "Inativo"} /></td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{fmtDate(emp.created_at)}</td>
                      {isGestor && (
                        <td className="px-4 py-3.5">
                          <button onClick={() => toggleActive(emp)} className={cn("ml-auto flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors",
                            active ? "text-amber-700 bg-amber-50 hover:bg-amber-100" : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100")}>
                            {active ? "Desativar" : "Ativar"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── TAB: SETTINGS ─────────────────────────── */

function TabSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("site_settings").select("setting_key, setting_value");
    const map: Record<string, any> = {};
    if (error) setToast({ msg: `Erro ao carregar configurações: ${error.message}`, type: "error" });
    (data || []).forEach((row: any) => { map[row.setting_key] = row.setting_value; });
    setSettings(map);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateSetting = (key: string, value: any) => setSettings(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase.from("site_settings").upsert({ setting_key: key, setting_value: value, updated_by: user?.id || null }, { onConflict: "setting_key" });
        if (error) throw error;
      }
      setToast({ msg: "Configurações salvas com sucesso!", type: "success" });
    } catch (error) {
      console.error("[ADMIN] site_settings save error:", error);
      setToast({ msg: `Erro ao salvar configurações: ${error instanceof Error ? error.message : "erro desconhecido"}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const groups = [
    {
      title: "Identidade Visual", keys: [
        { key: "primary_color", label: "Cor primária", type: "text", placeholder: "#0057e7" },
        { key: "secondary_color", label: "Cor secundária", type: "text", placeholder: "#0d1b2e" },
        { key: "logo_url", label: "URL do logo", type: "text", placeholder: "https://..." },
      ]
    },
    {
      title: "Home — Textos", keys: [
        { key: "hero_title", label: "Título do Hero", type: "text", placeholder: "Tecnologia, produtos e serviços em um só lugar." },
        { key: "hero_subtitle", label: "Subtítulo do Hero", type: "text", placeholder: "Descrição curta da empresa." },
        { key: "hero_image_url", label: "Imagem do Hero (URL)", type: "text", placeholder: "https://..." },
      ]
    },
    {
      title: "Site — Informações Gerais", keys: [
        { key: "site_name", label: "Nome do site", type: "text", placeholder: "Eletrônica Artvideo" },
        { key: "site_description", label: "Descrição do site", type: "text", placeholder: "Meta description..." },
        { key: "whatsapp_number", label: "Número WhatsApp (com DDI)", type: "text", placeholder: "5579999999999" },
      ]
    },
  ];

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Configurações do Site" subtitle="Controle as configurações globais do site" actions={
        <BtnPrimary onClick={handleSave} disabled={saving}>
          {saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
          {saving ? "Salvando..." : "Salvar tudo"}
        </BtnPrimary>
      } />

      {loading ? <LoadingState /> : (
        <div className="space-y-4 max-w-2xl">
          {groups.map(group => (
            <Section key={group.title} title={group.title}>
              <div className="space-y-4">
                {group.keys.map(field => (
                  <FInput key={field.key} label={field.label} type={field.type} value={settings[field.key] || ""} onChange={(e: any) => updateSetting(field.key, e.target.value)} placeholder={field.placeholder} />
                ))}
              </div>
            </Section>
          ))}

          {Object.keys(settings).length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <p className="font-bold mb-1">Tabela site_settings vazia ou sem dados.</p>
              <p>As configurações serão criadas ao salvar pela primeira vez.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: CONTACT ─────────────────────────── */

function TabContact() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("site_settings").select("setting_key, setting_value");
    if (error) setToast({ msg: `Erro ao carregar contato: ${error.message}`, type: "error" });
    else setSettings(Object.fromEntries((data || []).map((setting: any) => [setting.setting_key, setting.setting_value || ""])));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      for (const [setting_key, setting_value] of Object.entries(settings)) {
        const { data, error } = await supabase.from("site_settings").upsert({ setting_key, setting_value, updated_by: user?.id || null }, { onConflict: "setting_key" }).select().single();
        if (error) {
          console.error("[ADMIN] Contact save error:", error);
          throw error;
        }
      }
      setToast({ msg: "Informações de contato salvas!", type: "success" });
    } catch (error) {
      console.error("[ADMIN] site settings contact save error:", error);
      const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String(error.message) : String(error);
      setToast({ msg: `Erro ao salvar: ${message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => setSettings((current) => ({ ...current, [key]: value }));
  const groups = [
    { title: "Contato", fields: [["phone", "Telefone", "(79) 0000-0000"], ["whatsapp", "WhatsApp", "(79) 99999-9999"], ["email", "E-mail", "contato@empresa.com"]] },
    { title: "Redes sociais", fields: [["instagram", "Instagram", "@empresa"]] },
    { title: "Endereço", fields: [["zip_code", "CEP", "00000-000"], ["street", "Rua", "Rua da empresa"], ["number", "Número", "123"], ["complement", "Complemento", "Sala, bloco..."], ["neighborhood", "Bairro", "Bairro"], ["city", "Cidade", "Cidade"], ["state", "Estado", "SE"]] },
    { title: "Horário", fields: [["business_hours", "Horário de funcionamento", "Seg a Sex: 8h às 18h"]] },
    { title: "Identidade", fields: [["company_name", "Nome da empresa", "Eletrônica Artvideo"]] },
  ];

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <PageHeader title="Informações de Contato" subtitle="Dados exibidos no site e usados nos botões de ação" />

      {loading ? <LoadingState /> : (
        <form onSubmit={handleSave} className="max-w-xl space-y-5">
          {groups.map((group) => <Section key={group.title} title={group.title}><div className="space-y-4">{group.fields.map(([key, label, placeholder]) => <FInput key={key} label={label} value={settings[key] || ""} onChange={(event: any) => updateSetting(key, event.target.value)} placeholder={placeholder} />)}</div></Section>)}

          <div className="flex items-center gap-3">
            <BtnPrimary type="submit" disabled={saving}>
              {saving ? <Clock size={15} className="animate-spin" /> : <CheckCircle size={15} />}
              {saving ? "Salvando..." : "Salvar contato"}
            </BtnPrimary>
            <p className="text-xs text-[#5a6a82]">Essas informações alimentam o site público.</p>
          </div>
        </form>
      )}
    </div>
  );
}
