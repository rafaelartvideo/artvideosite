import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { formatCurrency } from "@/shared/domain/formatters";
import {
  emptyInternalQuote,
  listInternalQuoteItems,
  saveInternalQuote,
  searchQuoteCatalog,
  searchQuoteCustomers,
  type InternalQuoteDraft,
  type QuoteCatalogOption,
  type QuoteCustomerOption,
  type QuoteLineDraft,
} from "../infrastructure/internal-quotes.repository";

type Props = {
  organizationId: string;
  quote?: any | null;
  onClose: () => void;
  onSaved: (id: string) => void;
};

const fieldLabel = "mb-1.5 block text-xs font-bold text-foreground";
const fieldBox = "space-y-1.5 min-w-0";
const number = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export function InternalQuoteEditor({ organizationId, quote, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<InternalQuoteDraft>(() => emptyInternalQuote());
  const [items, setItems] = useState<QuoteLineDraft[]>([]);
  const [comment, setComment] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOptions, setCustomerOptions] = useState<QuoteCustomerOption[]>([]);
  const [catalogCategory, setCatalogCategory] = useState<"service" | "product">("service");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogOptions, setCatalogOptions] = useState<QuoteCatalogOption[]>([]);
  const [loading, setLoading] = useState(Boolean(quote));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const quoteId = quote?.id || null;
  const editable = !quote || ["RASCUNHO", "PENDENTE", "EM_ANALISE", "RENEGOCIACAO"].includes(quote.request_status?.slug);

  const field = (key: keyof InternalQuoteDraft, value: string | number) => {
    setDraft(current => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (!quoteId) return;
    let active = true;
    setLoading(true);
    setDraft({
      ...emptyInternalQuote(),
      ...Object.fromEntries(Object.keys(emptyInternalQuote()).map(key => [key, quote[key] ?? emptyInternalQuote()[key as keyof InternalQuoteDraft]])),
      customer_id: quote.customer_id || "",
      valid_until: quote.valid_until || "",
      discount_type: quote.discount_type === "percentage" ? "percentage" : "amount",
      discount_value: number(quote.discount_value),
    } as InternalQuoteDraft);
    setCustomerSearch(quote.customer?.full_name || quote.customer?.trade_name || "");
    void listInternalQuoteItems(organizationId, quoteId).then(rows => {
      if (active) setItems(rows);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [quoteId, organizationId]);

  useEffect(() => {
    if (draft.customer_id || customerSearch.trim().length < 2) {
      setCustomerOptions([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchQuoteCustomers(organizationId, customerSearch)
        .then(rows => { if (active) setCustomerOptions(rows); })
        .catch(() => { if (active) setCustomerOptions([]); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [draft.customer_id, customerSearch, organizationId]);

  useEffect(() => {
    if (catalogSearch.trim().length < 2) {
      setCatalogOptions([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void searchQuoteCatalog(organizationId, catalogCategory, catalogSearch)
        .then(rows => { if (active) setCatalogOptions(rows); })
        .catch(() => { if (active) setCatalogOptions([]); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [organizationId, catalogCategory, catalogSearch]);

  const subtotal = useMemo(() => items.reduce(
    (sum, item) => sum + number(item.quantity) * number(item.unit_price) + number(item.additional_cost), 0,
  ), [items]);
  const discountValue = number(draft.discount_value);
  const discount = draft.discount_type === "percentage" ? subtotal * Math.min(100, discountValue) / 100 : discountValue;
  const total = Math.max(0, subtotal - discount);

  const addCatalogItem = (catalog: QuoteCatalogOption) => {
    setItems(current => [...current, {
      item_type: catalogCategory,
      general_service_id: catalogCategory === "service" ? catalog.id : null,
      inventory_item_id: catalogCategory === "product" ? catalog.id : null,
      title_snapshot: catalog.name,
      description_snapshot: catalog.description || "",
      quantity: 1, unit_price: number(catalog.price), additional_cost: 0,
    }]);
    setCatalogSearch("");
    setCatalogOptions([]);
  };

  const addCustomService = () => {
    const name = catalogSearch.trim();
    if (!name) return;
    setItems(current => [...current, {
      item_type: "custom_service", general_service_id: null, inventory_item_id: null,
      title_snapshot: name, description_snapshot: "", quantity: 1, unit_price: 0, additional_cost: 0,
    }]);
    setCatalogSearch("");
    setCatalogOptions([]);
  };

  const updateItem = (index: number, key: keyof QuoteLineDraft, value: string | number) => {
    setItems(current => current.map((row, i) => i === index ? { ...row, [key]: value } : row));
  };

  const save = async () => {
    if (saving || !editable) return;
    setError("");
    if (!draft.customer_id) { setError("Selecione um cliente cadastrado."); return; }
    if (draft.discount_type === "amount" && discountValue > subtotal) {
      setError("O desconto não pode ultrapassar o subtotal."); return;
    }
    if (draft.discount_type === "percentage" && discountValue > 100) {
      setError("O desconto não pode ultrapassar 100%."); return;
    }
    if (items.some(item => !item.title_snapshot.trim() || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      setError("Revise o nome e a quantidade dos itens."); return;
    }
    setSaving(true);
    try {
      const id = await saveInternalQuote({
        organizationId, quoteId, draft, items,
        comment,
      });
      onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o orçamento.");
    } finally { setSaving(false); }
  };

  return <AdminPage open onClose={onClose}
    breadcrumb={quote ? "Orçamentos > Editar" : "Orçamentos > Novo"}
    title={quote ? "Editar orçamento " + quote.protocol : "Novo orçamento"}
    subtitle="Avaliação técnica e proposta comercial. Nenhuma OS será criada nesta etapa."
  >
    {loading ? <div className="p-8"><LoadingState /></div> : <div className="space-y-4 p-3 sm:p-5">
      {error && <div role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-600">{error}</div>}

      <Section title="Cliente">
        <div className={fieldBox}>
          <label className={fieldLabel}>Buscar cliente <span className="text-red-500">*</span></label>
          <div className="relative">
            <Search size={17} className="absolute left-3 top-3 text-muted-foreground" />
            <input className={INPUT + " w-full pl-10"} placeholder="Nome ou CPF/CNPJ" value={customerSearch}
              disabled={!editable}
              onChange={event => { setCustomerSearch(event.target.value); field("customer_id", ""); }} />
          </div>
          {customerOptions.length > 0 && <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
            {customerOptions.map(customer => <button type="button" key={customer.id}
              className="block w-full border-b border-border p-3 text-left text-sm hover:bg-muted"
              onClick={() => { field("customer_id", customer.id); setCustomerSearch(customer.full_name || customer.trade_name || ""); setCustomerOptions([]); }}>
              <span className="font-semibold">{customer.full_name || customer.trade_name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{customer.document || customer.cnpj || ""}</span>
            </button>)}
          </div>}
          {draft.customer_id && <p className="text-xs font-semibold text-green-600">Cliente selecionado</p>}
        </div>
      </Section>

      <Section title="Equipamento">
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ["equipment_name","Equipamento","Ex.: Televisão"],
            ["equipment_brand","Marca","Ex.: Samsung"],
            ["equipment_model","Modelo","Modelo do equipamento"],
            ["serial_number","Número de série","Número de série"],
            ["accessories","Acessórios","Controle, cabo, carregador..."],
            ["equipment_condition","Estado de entrada","Condição informada na avaliação"],
          ] as const).map(([key,label,placeholder]) => <div className={fieldBox} key={key}>
            <label className={fieldLabel}>{label}</label>
            <input className={INPUT + " w-full"} placeholder={placeholder} value={draft[key]} disabled={!editable}
              onChange={event => field(key, event.target.value)} />
          </div>)}
        </div>
      </Section>

      <Section title="Avaliação técnica">
        <div className="grid gap-3">
          {([
            ["issue_reported","Problema relatado","Descreva o que o cliente relatou"],
            ["diagnosis","Diagnóstico","O que foi identificado na avaliação"],
            ["proposed_solution","Solução proposta","O que deverá ser executado caso o orçamento seja aprovado"],
            ["internal_notes","Observações internas","Informações que não devem constar no documento enviado ao cliente"],
          ] as const).map(([key,label,placeholder]) => <div className={fieldBox} key={key}>
            <label className={fieldLabel}>{label}</label>
            <textarea className={INPUT + " w-full min-h-20"} rows={3} placeholder={placeholder}
              value={draft[key]} disabled={!editable} onChange={event => field(key, event.target.value)} />
          </div>)}
        </div>
      </Section>

      <Section title="Produtos e serviços" description="Itens previstos no orçamento, sem movimentar o estoque.">
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!editable} className={"rounded-lg border px-4 py-2 text-sm font-semibold " + (catalogCategory === "service" ? "border-primary bg-primary/10 text-primary" : "border-border")}
            onClick={() => { setCatalogCategory("service"); setCatalogSearch(""); }}>Serviços</button>
          <button type="button" disabled={!editable} className={"rounded-lg border px-4 py-2 text-sm font-semibold " + (catalogCategory === "product" ? "border-primary bg-primary/10 text-primary" : "border-border")}
            onClick={() => { setCatalogCategory("product"); setCatalogSearch(""); }}>Produtos</button>
        </div>
        <div className="mt-3 space-y-2">
          <input className={INPUT + " w-full"} disabled={!editable} placeholder={"Buscar " + (catalogCategory === "service" ? "serviço" : "produto") + " no catálogo"}
            value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)} />
          {catalogOptions.length > 0 && <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card">
            {catalogOptions.map(option => <button key={option.id} type="button" className="flex w-full items-center justify-between gap-3 border-b border-border p-3 text-left text-sm hover:bg-muted"
              onClick={() => addCatalogItem(option)}>
              <span className="font-medium">{option.name}</span>
              <span className="shrink-0 font-bold">{formatCurrency(option.price)}</span>
            </button>)}
          </div>}
          {catalogCategory === "service" && catalogSearch.trim() && <button type="button" disabled={!editable}
            className="inline-flex items-center gap-2 text-xs font-bold text-primary" onClick={addCustomService}>
            <Plus size={14}/> Adicionar serviço avulso: {catalogSearch.trim()}
          </button>}
        </div>

        <div className="mt-4 space-y-3">
          {items.length === 0 && <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum produto ou serviço adicionado.</p>}
          {items.map((item,index) => <div key={index} className="rounded-lg border border-border p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div><p className="text-xs text-muted-foreground">{item.item_type === "product" ? "Produto" : "Serviço"}</p>
                <p className="font-semibold">{item.title_snapshot}</p></div>
              {editable && <button type="button" aria-label="Remover item" title="Remover item"
                className="rounded-lg p-2 text-red-600 hover:bg-red-500/10"
                onClick={() => setItems(current => current.filter((_,i) => i !== index))}><Trash2 size={16}/></button>}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                ["quantity","Quantidade"],["unit_price","Preço unitário"],["additional_cost","Custo adicional"],
              ] as const).map(([key,label]) => <div key={key} className={fieldBox}>
                <label className={fieldLabel}>{label}</label>
                <input className={INPUT + " w-full"} type="number" min={key === "quantity" ? 1 : 0}
                  step={key === "quantity" ? 1 : "0.01"} disabled={!editable} value={item[key]}
                  onChange={event => updateItem(index,key,key === "quantity" ? Math.trunc(number(event.target.value)) : number(event.target.value))} />
              </div>)}
              <div className="flex flex-col justify-end pb-2">
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="font-bold">{formatCurrency(number(item.quantity) * number(item.unit_price) + number(item.additional_cost))}</p>
              </div>
            </div>
            <div className="mt-3">
              <label className={fieldLabel}>Descrição</label>
              <input className={INPUT + " w-full"} disabled={!editable} value={item.description_snapshot}
                onChange={event => updateItem(index,"description_snapshot",event.target.value)} placeholder="Detalhes do item" />
            </div>
          </div>)}
        </div>
      </Section>

      <Section title="Valores e condições">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={fieldBox}>
            <label className={fieldLabel}>Desconto</label>
            <select className={INPUT + " w-full"} disabled={!editable} value={draft.discount_type}
              onChange={event => field("discount_type",event.target.value)}>
              <option value="amount">Valor (R$)</option>
              <option value="percentage">Percentual (%)</option>
            </select>
          </div>
          <div className={fieldBox}>
            <label className={fieldLabel}>Valor do desconto</label>
            <input className={INPUT + " w-full"} type="number" min="0" step="0.01" disabled={!editable}
              value={draft.discount_value} onChange={event => field("discount_value",number(event.target.value))} />
          </div>
          <div className={fieldBox}>
            <label className={fieldLabel}>Válido até</label>
            <input className={INPUT + " w-full"} type="date" disabled={!editable}
              value={draft.valid_until} onChange={event => field("valid_until",event.target.value)} />
          </div>
        </div>
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex justify-between gap-3 text-sm"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
          <div className="flex justify-between gap-3 text-sm"><span>Desconto</span><strong>{formatCurrency(discount)}</strong></div>
          <div className="flex justify-between gap-3 border-t border-border pt-3"><strong>Total da proposta</strong><strong className="text-lg">{formatCurrency(total)}</strong></div>
        </div>
      </Section>

      {editable && <Section title="Comentário" description="Registre uma observação no histórico deste orçamento ao salvar.">
        <textarea rows={3} maxLength={4000} className={INPUT + " min-h-24 w-full"}
          placeholder="Comentário para a equipe, informações da negociação ou detalhes do atendimento"
          value={comment} onChange={event => setComment(event.target.value)} />
      </Section>}
    </div>}

    <AdminStickyToolbar className="flex items-center justify-between gap-3 p-3 sm:p-4">
      <BtnSecondary onClick={onClose}><ArrowLeft size={16}/> Voltar</BtnSecondary>
      {editable && <BtnPrimary disabled={saving || loading} onClick={() => void save()}>
        {saving ? "Salvando..." : quoteId ? "Salvar alterações" : "Criar orçamento"}
      </BtnPrimary>}
    </AdminStickyToolbar>
  </AdminPage>;
}
