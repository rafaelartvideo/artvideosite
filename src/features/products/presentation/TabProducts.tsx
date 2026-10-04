import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CircleHelp,
  Edit2,
  Eraser,
  FileText,
  Image as ImageIcon,
  List,
  Package,
  Plus,
  ShoppingBag,
  Star,
  Truck,
  Warehouse,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import {
  loadProductCatalog,
  saveCompleteProduct,
  updateProductFlags,
} from "../infrastructure/products.repository";
import {
  AdminButton,
  AdminCard,
  AdminDialog,
  AdminIconButton,
  AdminPage,
  AdminStickyToolbar,
  BtnPrimary,
  BtnSecondary,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminMobileSearchSwitch } from "@/shared/ui/admin/AdminMobileSearchSwitch";
import { cn, formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  AdminSelect,
  FCurrencyInput,
  FDecimalInput,
  FInput,
  FIntegerInput,
  FSelect,
  FTextarea,
  FToggle,
  INPUT,
} from "@/shared/ui/admin/AdminFormControls";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { ImageUpload, ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/primitives/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/primitives/tooltip";
import {
  listInventoryItemSuppliers,
  type InventorySupplier,
} from "@/features/inventory/infrastructure/inventory.repository";
import { InventorySuppliersEditor } from "@/features/inventory/presentation/InventorySuppliersEditor";
import {
  findOrCreateInventoryBrand,
  findOrCreateInventoryCategory,
  loadProductGallery,
  resolveProductMediaImage,
  type ImportedProductImage,
} from "../infrastructure/product-lookup.repository";

type ProductEditorTab = "general" | "commercial" | "suppliers" | "fiscal" | "photos" | "catalog";

type ProductForm = {
  name: string;
  sku: string;
  barcode: string;
  description: string;
  internal_notes: string;
  model: string;
  manufacturer_code: string;
  gpc_code: string;
  gross_weight_grams: string;
  net_weight_grams: string;
  width_mm: string;
  height_mm: string;
  length_mm: string;
  external_platform: string;
  external_product_id: string;
  external_url: string;
  external_reference_price: string;
  external_min_price: string;
  external_max_price: string;
  external_currency: string;
  price: string;
  is_active: boolean;

  commercial_unit: "un" | "cx";
  conversion_factor: string;
  min_quantity: string;
  initial_quantity: string;
  initial_unit_cost: string;
  initial_supplier_entity_id: string;
  initial_reference: string;
  storage_shelf: string;
  storage_level: string;
  storage_compartment: string;

  ncm: string;
  cest: string;
  merchandise_origin: string;
  cfop_entry: string;
  cfop_exit: string;
  csosn: string;
  cst_icms: string;
  cst_pis: string;
  cst_cofins: string;
  cst_ipi: string;
  internal_icms_rate: string;
  calculate_entry_difal: boolean;
  ipi_rate: string;
  pis_rate: string;
  cofins_rate: string;
  tax_unit: string;
  tax_barcode: string;
  fiscal_benefit_code: string;
  fiscal_notes: string;

  cover_media_id: string;

  show_in_catalog: boolean;
  short_description: string;
  compare_at_price: string;
  is_featured: boolean;
  category_id: string;
  brand_id: string;
};

type ProductFieldErrors = Partial<Record<
  "name"
  | "price"
  | "compare_at_price"
  | "barcode"
  | "conversion_factor"
  | "min_quantity"
  | "initial_quantity"
  | "initial_unit_cost"
  | "initial_supplier_entity_id"
  | "ncm"
  | "cest"
  | "cfop_entry"
  | "cfop_exit"
  | "csosn"
  | "cst_icms"
  | "cst_pis"
  | "cst_cofins"
  | "cst_ipi"
  | "internal_icms_rate"
  | "ipi_rate"
  | "pis_rate"
  | "cofins_rate",
  string
>>;

const originOptions = [
  { value: "0", label: "0 — Nacional (exceto 3, 4, 5 e 8)" },
  { value: "1", label: "1 — Estrangeira — importação direta" },
  { value: "2", label: "2 — Estrangeira — adquirida no mercado interno" },
  { value: "3", label: "3 — Nacional — conteúdo de importação > 40%" },
  { value: "4", label: "4 — Nacional — produção conforme processos produtivos básicos" },
  { value: "5", label: "5 — Nacional — conteúdo de importação ≤ 40%" },
  { value: "6", label: "6 — Estrangeira — importação direta sem similar nacional" },
  { value: "7", label: "7 — Estrangeira — mercado interno sem similar nacional" },
  { value: "8", label: "8 — Nacional — conteúdo de importação > 70%" },
];

function emptyForm(): ProductForm {
  return {
    name: "",
    sku: "",
    barcode: "",
    description: "",
    internal_notes: "",
    model: "",
    manufacturer_code: "",
    gpc_code: "",
    gross_weight_grams: "",
    net_weight_grams: "",
    width_mm: "",
    height_mm: "",
    length_mm: "",
    external_platform: "",
    external_product_id: "",
    external_url: "",
    external_reference_price: "",
    external_min_price: "",
    external_max_price: "",
    external_currency: "",
    price: "",
    is_active: true,

    commercial_unit: "un",
    conversion_factor: "1",
    min_quantity: "0",
    initial_quantity: "0",
    initial_unit_cost: "",
    initial_supplier_entity_id: "",
    initial_reference: "",
    storage_shelf: "",
    storage_level: "",
    storage_compartment: "",

    ncm: "",
    cest: "",
    merchandise_origin: "0",
    cfop_entry: "",
    cfop_exit: "",
    csosn: "",
    cst_icms: "",
    cst_pis: "",
    cst_cofins: "",
    cst_ipi: "",
    internal_icms_rate: "",
    calculate_entry_difal: false,
    ipi_rate: "",
    pis_rate: "",
    cofins_rate: "",
    tax_unit: "",
    tax_barcode: "",
    fiscal_benefit_code: "",
    fiscal_notes: "",

    cover_media_id: "",

    show_in_catalog: false,
    short_description: "",
    compare_at_price: "",
    is_featured: false,
    category_id: "",
    brand_id: "",
  };
}

function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function nullableNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function displayStockValue(value: unknown, unit: string, factor: number) {
  const base = Number(value ?? 0);
  return unit === "cx" ? base / Math.max(1, factor) : base;
}

function displayUnitCost(value: unknown, unit: string, factor: number) {
  if (value == null) return null;
  const base = Number(value);
  return unit === "cx" ? base * Math.max(1, factor) : base;
}

function FiscalField({
  label,
  help,
  children,
}: {
  label: string;
  help: string;
  children: React.ReactNode;
}) {
  return <div className="min-w-0">
    <div className="mb-1.5 flex items-center gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex h-4 w-4 items-center justify-center text-[#8a96a8]" aria-label={`Ajuda sobre ${label}`}>
            <CircleHelp size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent sideOffset={6} className="max-w-xs leading-relaxed">{help}</TooltipContent>
      </Tooltip>
    </div>
    {children}
  </div>;
}

function EditorTabTrigger({
  value,
  icon: Icon,
  children,
}: {
  value: ProductEditorTab;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return <TabsTrigger
    value={value}
    className="group relative h-10 shrink-0 rounded-none border-0 bg-transparent px-3 text-xs font-bold text-muted-foreground shadow-none transition-colors hover:bg-transparent hover:text-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-primary after:scale-x-0 after:transition-transform after:duration-300 data-[state=active]:after:scale-x-100"
  >
    <Icon size={14} />
    {children}
  </TabsTrigger>;
}

export function TabProducts({
  routeResourceId,
  routeSubpage,
  onRouteChange,
}: {
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
}) {
  const { user, activeOrganization, activeOrganizationId, hasPermission } = useAuth();
  const isArtvideoTenant = activeOrganization?.is_artvideo_tenant === true;

  const canViewTable = hasPermission("products.table.view") || hasPermission("inventory.table.view");
  const canViewDetails = hasPermission("products.details.view") || hasPermission("inventory.details.view");
  const canCreate = hasPermission("products.create") || hasPermission("inventory.create");
  const canEdit = hasPermission("products.update") || hasPermission("inventory.update");
  const canToggleActive = hasPermission("products.toggle_active") || hasPermission("inventory.toggle_active");
  const canViewMovements = hasPermission("inventory.movements.view");
  const canCreateMovements = hasPermission("inventory.movements.create");
  const canViewSuppliers = hasPermission("inventory.suppliers.view") || hasPermission("inventory.suppliers.manage");
  const canManageSuppliers = hasPermission("inventory.suppliers.manage");
  const canViewCategories = hasPermission("inventory.categories.view") || hasPermission("inventory.categories.manage") || hasPermission("categories.view");
  const canManageCategories = hasPermission("inventory.categories.manage") || (isArtvideoTenant && hasPermission("categories.create"));
  const canViewBrands = hasPermission("inventory.brands.view") || hasPermission("inventory.brands.manage") || hasPermission("brands.view");
  const canManageBrands = hasPermission("inventory.brands.manage") || (isArtvideoTenant && hasPermission("brands.create"));
  const canToggleFeatured = isArtvideoTenant && hasPermission("products.toggle_featured");
  const canViewCosts = hasPermission("inventory.costs.view");

  const showProduct = hasPermission("products.table.product") || hasPermission("inventory.table.name");
  const showCategory = canViewCategories;
  const showPrice = hasPermission("products.table.price") || hasPermission("inventory.table.sale_price");
  const showFeatured = isArtvideoTenant && hasPermission("products.table.featured");
  const showStatus = hasPermission("products.table.status") || hasPermission("inventory.table.status");
  const showActions = hasPermission("products.table.actions") || hasPermission("inventory.table.actions");

  const canLoadCategories = canViewCategories;
  const canLoadBrands = canViewBrands;
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({
    queryKey: [...queryKeys.catalog.products(), activeOrganizationId],
    queryFn: () => loadProductCatalog(activeOrganizationId!, {
      loadCategories: canLoadCategories,
      loadBrands: canLoadBrands,
    }),
    enabled: Boolean(activeOrganizationId && (canViewTable || canViewDetails || canCreate || canEdit)),
    staleTime: REFERENCE_DATA_CACHE_TIME,
    gcTime: REFERENCE_DATA_CACHE_TIME,
  });

  const products = catalogQuery.data?.products ?? [];
  const categories = catalogQuery.data?.categories ?? [];
  const brands = catalogQuery.data?.brands ?? [];
  const loading = catalogQuery.isPending;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editorTab, setEditorTab] = useState<ProductEditorTab>("general");
  const [nameSearch, setNameSearch] = useState("");
  const [gtinSearch, setGtinSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationSearch, setLocationSearch] = useState("");
  const [mobileSearchField, setMobileSearchField] = useState<"name" | "gtin" | "category" | "location">("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState<ProductForm>(() => emptyForm());
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [linkedSuppliers, setLinkedSuppliers] = useState<InventorySupplier[]>([]);
  const [galleryMedia, setGalleryMedia] = useState<ImportedProductImage[]>([]);
  const [masterDataDialog, setMasterDataDialog] = useState<"category" | "brand" | null>(null);
  const [masterDataName, setMasterDataName] = useState("");
  const [masterDataSaving, setMasterDataSaving] = useState(false);

  useEffect(() => {
    if (catalogQuery.error) {
      setToast({ msg: `Erro ao carregar estoque: ${systemErrorMessage(catalogQuery.error)}`, type: "error" });
    }
  }, [catalogQuery.error]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.products() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.products() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.featuredProducts() }),
  ]);

  const catOptions = [
    { value: "", label: "Sem categoria" },
    ...categories.map((item: any) => ({ value: item.id, label: item.name })),
  ];
  const brandOptions = [
    { value: "", label: "Sem marca" },
    ...brands.map((item: any) => ({ value: item.id, label: item.name })),
  ];

  const openNew = () => {
    if (!canCreate) return;
    setFieldErrors({});
    setForm(emptyForm());
    setEditItem(null);
    setLinkedSuppliers([]);
    setGalleryMedia([]);
    setEditorTab("general");
    setDrawerOpen(true);
  };

  const openEdit = (product: any) => {
    if (!(canViewDetails && canEdit)) return;

    const inventory = product.inventory;
    const unit = inventory?.unit === "cx" ? "cx" : (product.commercial_unit === "cx" ? "cx" : "un");
    const factor = Math.max(1, Number(inventory?.conversion_factor ?? 1) || 1);

    setFieldErrors({});
    setForm({
      name: product.name || "",
      sku: product.sku || inventory?.sku || "",
      barcode: product.barcode || "",
      description: product.description || "",
      internal_notes: product.internal_notes || "",
      model: product.model || "",
      manufacturer_code: product.manufacturer_code || "",
      gpc_code: product.gpc_code || "",
      gross_weight_grams: product.gross_weight_grams == null ? "" : String(product.gross_weight_grams),
      net_weight_grams: product.net_weight_grams == null ? "" : String(product.net_weight_grams),
      width_mm: product.width_mm == null ? "" : String(product.width_mm),
      height_mm: product.height_mm == null ? "" : String(product.height_mm),
      length_mm: product.length_mm == null ? "" : String(product.length_mm),
      external_platform: product.external_platform || "",
      external_product_id: product.external_product_id || "",
      external_url: product.external_url || "",
      external_reference_price: product.external_reference_price == null ? "" : String(product.external_reference_price),
      external_min_price: product.external_min_price == null ? "" : String(product.external_min_price),
      external_max_price: product.external_max_price == null ? "" : String(product.external_max_price),
      external_currency: product.external_currency || "",
      price: product.price == null ? "" : String(product.price),
      is_active: product.is_active ?? true,

      commercial_unit: unit,
      conversion_factor: String(factor),
      min_quantity: String(displayStockValue(inventory?.min_quantity, unit, factor)),
      initial_quantity: "0",
      initial_unit_cost: "",
      initial_supplier_entity_id: "",
      initial_reference: "",
      storage_shelf: inventory?.storage_shelf || "",
      storage_level: inventory?.storage_level || "",
      storage_compartment: inventory?.storage_compartment || "",

      ncm: product.ncm || "",
      cest: product.cest || "",
      merchandise_origin: String(product.merchandise_origin ?? 0),
      cfop_entry: product.cfop_entry || "",
      cfop_exit: product.cfop_exit || "",
      csosn: product.csosn || "",
      cst_icms: product.cst_icms || "",
      cst_pis: product.cst_pis || "",
      cst_cofins: product.cst_cofins || "",
      cst_ipi: product.cst_ipi || "",
      internal_icms_rate: product.internal_icms_rate == null ? "" : String(product.internal_icms_rate),
      calculate_entry_difal: product.calculate_entry_difal === true,
      ipi_rate: product.ipi_rate == null ? "" : String(product.ipi_rate),
      pis_rate: product.pis_rate == null ? "" : String(product.pis_rate),
      cofins_rate: product.cofins_rate == null ? "" : String(product.cofins_rate),
      tax_unit: product.tax_unit || "",
      tax_barcode: product.tax_barcode || "",
      fiscal_benefit_code: product.fiscal_benefit_code || "",
      fiscal_notes: product.fiscal_notes || "",

      cover_media_id: product.cover_media_id || "",

      show_in_catalog: isArtvideoTenant && product.show_in_catalog === true,
      short_description: product.short_description || "",
      compare_at_price: product.compare_at_price == null ? "" : String(product.compare_at_price),
      is_featured: product.is_featured ?? false,
      category_id: product.category_id || "",
      brand_id: product.brand_id || "",
    });
    setEditItem(product);
    setLinkedSuppliers([]);
    setGalleryMedia([]);
    if (canViewSuppliers && inventory?.inventory_item_id && activeOrganizationId) {
      void listInventoryItemSuppliers(String(inventory.inventory_item_id), activeOrganizationId)
        .then(setLinkedSuppliers)
        .catch(error => {
          setLinkedSuppliers([]);
          setToast({ msg: `Erro ao carregar fornecedores: ${systemErrorMessage(error)}`, type: "error" });
        });
    }
    if (activeOrganizationId) {
      void loadProductGallery(activeOrganizationId, product.id)
        .then(setGalleryMedia)
        .catch(() => setGalleryMedia([]));
    }
    setEditorTab("general");
    setDrawerOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setDrawerOpen(false);
    onRouteChange?.(null, null);
  };

  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: any) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));

  useEffect(() => {
    if (!routeResourceId) {
      if (drawerOpen) setDrawerOpen(false);
      return;
    }
    if (routeResourceId === "new") {
      if (canCreate && (!drawerOpen || editItem)) openNew();
      return;
    }
    if (!canViewDetails || !canEdit || routeSubpage !== "edit" || editItem?.id === routeResourceId) return;
    const item = products.find((entry: any) => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, products, drawerOpen, editItem?.id, canCreate, canViewDetails, canEdit]);

  const validate = () => {
    const errors: ProductFieldErrors = {};
    const price = nullableNumber(form.price);
    const compareAtPrice = nullableNumber(form.compare_at_price);
    const factor = Number(form.conversion_factor);
    const minQuantity = Number(form.min_quantity || 0);
    const initialQuantity = Number(form.initial_quantity || 0);
    const initialUnitCost = nullableNumber(form.initial_unit_cost);

    if (!form.name.trim()) errors.name = "Nome do item é obrigatório.";
    if (price !== null && price < 0) errors.price = "Informe um preço válido e não negativo.";
    if (form.barcode && !/^[0-9A-Za-z._-]{4,32}$/.test(form.barcode.trim())) {
      errors.barcode = "Informe um código de barras válido.";
    }

    if (!Number.isInteger(factor) || factor < 1) {
      errors.conversion_factor = "Informe um fator inteiro maior ou igual a 1.";
    }
    if (!Number.isFinite(minQuantity) || minQuantity < 0) {
      errors.min_quantity = "O estoque mínimo não pode ser negativo.";
    }
    if (!editItem && (!Number.isFinite(initialQuantity) || initialQuantity < 0)) {
      errors.initial_quantity = "O saldo inicial não pode ser negativo.";
    }
    if (!editItem && initialUnitCost !== null && initialUnitCost < 0) {
      errors.initial_unit_cost = "O custo inicial não pode ser negativo.";
    }
    if (
      !editItem
      && form.initial_supplier_entity_id
      && !linkedSuppliers.some(supplier => supplier.id === form.initial_supplier_entity_id)
    ) {
      errors.initial_supplier_entity_id = "O fornecedor do saldo inicial precisa estar vinculado ao item.";
    }

    if (form.ncm && !/^\d{1,8}$/.test(form.ncm)) errors.ncm = "NCM deve ter até 8 dígitos.";
    if (form.cest && !/^\d{7}$/.test(form.cest)) errors.cest = "CEST deve ter 7 dígitos.";
    if (form.cfop_entry && !/^\d{4}$/.test(form.cfop_entry)) errors.cfop_entry = "CFOP deve ter 4 dígitos.";
    if (form.cfop_exit && !/^\d{4}$/.test(form.cfop_exit)) errors.cfop_exit = "CFOP deve ter 4 dígitos.";
    if (form.csosn && !/^\d{3}$/.test(form.csosn)) errors.csosn = "CSOSN deve ter 3 dígitos.";
    if (form.cst_icms && !/^\d{3}$/.test(form.cst_icms)) errors.cst_icms = "CST ICMS deve ter 3 dígitos.";
    if (form.cst_pis && !/^\d{2}$/.test(form.cst_pis)) errors.cst_pis = "CST PIS deve ter 2 dígitos.";
    if (form.cst_cofins && !/^\d{2}$/.test(form.cst_cofins)) errors.cst_cofins = "CST COFINS deve ter 2 dígitos.";
    if (form.cst_ipi && !/^\d{2}$/.test(form.cst_ipi)) errors.cst_ipi = "CST IPI deve ter 2 dígitos.";

    const rateFields: Array<[keyof Pick<ProductFieldErrors, "internal_icms_rate" | "ipi_rate" | "pis_rate" | "cofins_rate">, string]> = [
      ["internal_icms_rate", form.internal_icms_rate],
      ["ipi_rate", form.ipi_rate],
      ["pis_rate", form.pis_rate],
      ["cofins_rate", form.cofins_rate],
    ];
    rateFields.forEach(([key, value]) => {
      const parsed = nullableNumber(value);
      if (parsed !== null && (parsed < 0 || parsed > 100)) errors[key] = "A alíquota deve estar entre 0 e 100%.";
    });

    if (isArtvideoTenant && form.show_in_catalog) {
      if (compareAtPrice !== null && compareAtPrice < 0) errors.compare_at_price = "Informe um preço de comparação válido.";
      if (price !== null && compareAtPrice !== null && compareAtPrice < price) {
        errors.compare_at_price = "O preço de comparação deve ser igual ou maior que o preço de venda.";
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      if (errors.name || errors.barcode) setEditorTab("general");
      else if (errors.price || errors.conversion_factor || errors.min_quantity || errors.initial_quantity || errors.initial_unit_cost || errors.initial_supplier_entity_id) setEditorTab("commercial");
      else if (errors.compare_at_price) setEditorTab("catalog");
      else setEditorTab("fiscal");
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!activeOrganizationId || !(editItem ? canEdit : canCreate)) return;
    if (!validate()) return;

    const price = nullableNumber(form.price);
    const compareAtPrice = nullableNumber(form.compare_at_price);
    const showInCatalog = isArtvideoTenant && form.show_in_catalog;

    setSaving(true);
    try {
      const finalSlug = await generateUniqueSlug("products", form.name, editItem?.id);
      const payload = {
        name: form.name.trim(),
        slug: finalSlug,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        description: form.description.trim() || null,
        internal_notes: form.internal_notes.trim() || null,
        model: form.model.trim() || null,
        manufacturer_code: form.manufacturer_code.trim() || null,
        gpc_code: form.gpc_code.trim() || null,
        gross_weight_grams: nullableNumber(form.gross_weight_grams),
        net_weight_grams: nullableNumber(form.net_weight_grams),
        width_mm: nullableNumber(form.width_mm),
        height_mm: nullableNumber(form.height_mm),
        length_mm: nullableNumber(form.length_mm),
        external_platform: form.external_platform.trim() || null,
        external_product_id: form.external_product_id.trim() || null,
        external_url: form.external_url.trim() || null,
        external_reference_price: nullableNumber(form.external_reference_price),
        external_min_price: nullableNumber(form.external_min_price),
        external_max_price: nullableNumber(form.external_max_price),
        external_currency: form.external_currency.trim() || null,
        price,
        is_active: form.is_active,
        commercial_unit: form.commercial_unit,

        ncm: form.ncm.trim() || null,
        cest: form.cest.trim() || null,
        merchandise_origin: Number(form.merchandise_origin || 0),
        cfop_entry: form.cfop_entry.trim() || null,
        cfop_exit: form.cfop_exit.trim() || null,
        csosn: form.csosn.trim() || null,
        cst_icms: form.cst_icms.trim() || null,
        cst_pis: form.cst_pis.trim() || null,
        cst_cofins: form.cst_cofins.trim() || null,
        cst_ipi: form.cst_ipi.trim() || null,
        internal_icms_rate: nullableNumber(form.internal_icms_rate),
        calculate_entry_difal: form.calculate_entry_difal,
        ipi_rate: nullableNumber(form.ipi_rate),
        pis_rate: nullableNumber(form.pis_rate),
        cofins_rate: nullableNumber(form.cofins_rate),
        tax_unit: form.tax_unit.trim() || null,
        tax_barcode: form.tax_barcode.trim() || null,
        fiscal_benefit_code: form.fiscal_benefit_code.trim() || null,
        fiscal_notes: form.fiscal_notes.trim() || null,

        cover_media_id: form.cover_media_id || null,

        show_in_catalog: showInCatalog,
        short_description: isArtvideoTenant ? (form.short_description.trim() || null) : null,
        compare_at_price: isArtvideoTenant ? compareAtPrice : null,
        is_featured: isArtvideoTenant ? form.is_featured : false,
        category_id: form.category_id || null,
        brand_id: form.brand_id || null,
        gallery_media_ids: galleryMedia.map(image => image.media_id),
        updated_by: user?.id || null,
      };

      await saveCompleteProduct(
        activeOrganizationId,
        editItem?.id,
        payload,
        {
          unit: form.commercial_unit,
          conversion_factor: Math.max(1, Number(form.conversion_factor || 1)),
          min_quantity: Math.max(0, Number(form.min_quantity || 0)),
          storage_shelf: form.storage_shelf.trim() || null,
          storage_level: form.storage_level.trim() || null,
          storage_compartment: form.storage_compartment.trim() || null,
          ...(canManageSuppliers ? {
            supplier_entity_ids: linkedSuppliers
              .filter(supplier => supplier.is_active !== false)
              .map(supplier => supplier.id),
            supplier_links: linkedSuppliers
              .filter(supplier => supplier.is_active !== false)
              .map(supplier => ({
                entity_id: supplier.id,
                supplier_reference: supplier.supplier_reference?.trim() || null,
              })),
          } : {}),
          initial_supplier_entity_id: !editItem && canManageSuppliers
            ? (form.initial_supplier_entity_id || null)
            : null,
          initial_reference: !editItem ? (form.initial_reference.trim() || null) : null,
        },
        editItem ? 0 : Number(form.initial_quantity || 0),
        editItem ? null : nullableNumber(form.initial_unit_cost),
      );

      setDrawerOpen(false);
      onRouteChange?.(null, null);
      setToast({ msg: editItem ? "Item atualizado!" : "Item criado!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao salvar item: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product: any) => {
    if (!activeOrganizationId || !canToggleActive) return;
    const nextActive = !product.is_active;
    try {
      await updateProductFlags(activeOrganizationId, product.id, { is_active: nextActive }, user?.id ?? null);
      queryClient.setQueryData([...queryKeys.catalog.products(), activeOrganizationId], (current: any) => current ? {
        ...current,
        products: (current.products ?? []).map((item: any) => item.id === product.id ? { ...item, is_active: nextActive } : item),
      } : current);
      setToast({ msg: "Status atualizado!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao atualizar item: ${systemErrorMessage(error)}`, type: "error" });
    }
  };

  const toggleFeatured = async (product: any) => {
    if (!activeOrganizationId || !canToggleFeatured || product.show_in_catalog !== true) return;
    try {
      await updateProductFlags(activeOrganizationId, product.id, { is_featured: !product.is_featured }, user?.id ?? null);
      setToast({ msg: "Destaque atualizado!", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao atualizar destaque: ${systemErrorMessage(error)}`, type: "error" });
    }
  };

  const saveMasterData = async () => {
    if (!activeOrganizationId || !masterDataDialog || !masterDataName.trim()) return;
    setMasterDataSaving(true);
    try {
      if (masterDataDialog === "category") {
        const item = await findOrCreateInventoryCategory(activeOrganizationId, masterDataName, canManageCategories);
        if (item) setForm(current => ({ ...current, category_id: item.id }));
      } else {
        const item = await findOrCreateInventoryBrand(activeOrganizationId, masterDataName, canManageBrands);
        if (item) setForm(current => ({ ...current, brand_id: item.id }));
      }
      setMasterDataDialog(null);
      setMasterDataName("");
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.products() });
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível criar o cadastro."), type: "error" });
    } finally {
      setMasterDataSaving(false);
    }
  };

  const filtered = products.filter((product: any) => {
    const inventory = product.inventory || {};
    const normalizedName = nameSearch.trim().toLocaleLowerCase("pt-BR");
    const normalizedGtin = gtinSearch.trim().toLocaleLowerCase("pt-BR");
    const normalizedLocation = locationSearch.trim().toLocaleLowerCase("pt-BR");

    const matchesName = !normalizedName
      || String(product.name || "").toLocaleLowerCase("pt-BR").includes(normalizedName);
    const matchesGtin = !normalizedGtin
      || String(product.barcode || product.tax_barcode || "").toLocaleLowerCase("pt-BR").includes(normalizedGtin);
    const matchesCategory = !categoryFilter || String(product.category_id || "") === categoryFilter;
    const matchesLocation = !normalizedLocation
      || [inventory.storage_shelf, inventory.storage_level, inventory.storage_compartment]
        .some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(normalizedLocation));

    return matchesName && matchesGtin && matchesCategory && matchesLocation;
  });

  const hasInventoryFilters = Boolean(nameSearch.trim() || gtinSearch.trim() || categoryFilter || locationSearch.trim());
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [nameSearch, gtinSearch, categoryFilter, locationSearch, activeOrganizationId]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const inventory = editItem?.inventory ?? null;
  const currentFactor = Math.max(1, Number(inventory?.conversion_factor ?? form.conversion_factor ?? 1) || 1);
  const currentQuantity = displayStockValue(inventory?.quantity, form.commercial_unit, currentFactor);
  const purchasePrice = displayUnitCost(inventory?.purchase_price, form.commercial_unit, currentFactor);
  const averageCost = displayUnitCost(inventory?.average_cost, form.commercial_unit, currentFactor);

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    {!routeResourceId && <>
      <PageHeader
        title="Estoque"
        subtitle={`${products.length} item${products.length !== 1 ? "s" : ""} cadastrado${products.length !== 1 ? "s" : ""} · cadastro, saldo, fornecedores, fiscal e vendas no mesmo lugar`}
        actions={canCreate ? <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16} /> Novo item</AdminButton> : undefined}
      />

      {canViewTable && <AdminSearchPanel title="Buscar no estoque">
        <AdminMobileSearchSwitch
          value={mobileSearchField}
          options={[
            { value: "name", label: "Nome" },
            { value: "gtin", label: "GTIN" },
            { value: "category", label: "Categoria" },
            { value: "location", label: "Localização" },
          ]}
          onChange={setMobileSearchField}
        >
          {mobileSearchField === "name" ? <FInput
            value={nameSearch}
            onChange={(event: any) => { setNameSearch(event.target.value); setPage(1); }}
            placeholder="Nome do item"
          /> : mobileSearchField === "gtin" ? <FInput
            value={gtinSearch}
            onChange={(event: any) => { setGtinSearch(event.target.value); setPage(1); }}
            placeholder="EAN, UPC ou GTIN"
          /> : mobileSearchField === "category" ? <FSelect
            value={categoryFilter}
            onChange={(event: any) => { setCategoryFilter(event.target.value); setPage(1); }}
            options={[
              { value: "", label: "Todas as categorias" },
              ...categories.map((item: any) => ({ value: item.id, label: item.name })),
            ]}
          /> : <FInput
            value={locationSearch}
            onChange={(event: any) => { setLocationSearch(event.target.value); setPage(1); }}
            placeholder="Estante, nível ou compartimento"
          />}
        </AdminMobileSearchSwitch>
        <div className="hidden grid-cols-1 gap-2 md:grid md:grid-cols-2 xl:grid-cols-4">
          <FInput
            label="Nome"
            value={nameSearch}
            onChange={(event: any) => { setNameSearch(event.target.value); setPage(1); }}
            placeholder="Nome do item"
          />
          <FInput
            label="GTIN"
            value={gtinSearch}
            onChange={(event: any) => { setGtinSearch(event.target.value); setPage(1); }}
            placeholder="EAN, UPC ou GTIN"
          />
          <FSelect
            label="Categoria"
            value={categoryFilter}
            onChange={(event: any) => { setCategoryFilter(event.target.value); setPage(1); }}
            options={[
              { value: "", label: "Todas as categorias" },
              ...categories.map((item: any) => ({ value: item.id, label: item.name })),
            ]}
          />
          <FInput
            label="Localização"
            value={locationSearch}
            onChange={(event: any) => { setLocationSearch(event.target.value); setPage(1); }}
            placeholder="Estante, nível ou compartimento"
          />
        </div>
        {hasInventoryFilters && <div className="mt-3 flex justify-end">
          <AdminButton
            variant="danger"
            size="sm"
            onClick={() => {
              setNameSearch("");
              setGtinSearch("");
              setCategoryFilter("");
              setLocationSearch("");
              setPage(1);
            }}
            className="bg-card text-red-600 hover:bg-red-50"
          >
            <Eraser size={14} /> Limpar filtros
          </AdminButton>
        </div>}
      </AdminSearchPanel>}

      {canViewTable && <AdminCard>
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={hasInventoryFilters ? "Nenhum resultado" : "Nenhum item cadastrado"}
            message="Cadastre o item uma única vez para estoque, vendas, PDV, dados fiscais e catálogo quando aplicável."
            onAdd={canCreate ? openNewPage : undefined}
            addLabel="Novo item"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[850px]">
              <thead>
                <tr>
                  {showProduct && <th className="text-left">Item</th>}
                  {showCategory && <th className="text-left">Categoria</th>}
                  {canViewBrands && <th className="text-left">Marca</th>}
                  {showPrice && <th className="text-left">Preço</th>}
                  <th className="text-left">Estoque</th>
                  <th className="text-left">Local</th>
                  {canViewCosts && <th className="text-left">Custo médio</th>}
                  {showFeatured && <th className="text-left">Destaque</th>}
                  {showStatus && <th className="text-left">Status</th>}
                  {showActions && <th className="text-right">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {pagedProducts.map((product: any) => {
                  const item = product.inventory;
                  const unit = item?.unit === "cx" ? "cx" : "un";
                  const factor = Math.max(1, Number(item?.conversion_factor ?? 1) || 1);
                  const stock = displayStockValue(item?.quantity, unit, factor);
                  const minStock = displayStockValue(item?.min_quantity, unit, factor);
                  const lowStock = stock <= minStock;

                  return <tr key={product.id}>
                    {showProduct && <td>
                      <div className="flex items-center gap-3">
                        <ProductAdminThumb mediaId={product.cover_media_id} name={product.name} />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-[#0d1b2e]">{product.name}</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-[#7a8aa0]">
                            {product.sku || item?.sku || "Sem SKU"}{product.barcode ? ` · ${product.barcode}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>}
                    {showCategory && <td className="text-xs text-[#5a6a82]">{product.product_categories?.name || "—"}</td>}
                    {canViewBrands && <td className="text-xs text-[#5a6a82]">{product.brands?.name || "—"}</td>}
                    {showPrice && <td className="font-bold text-[#0d1b2e]">{product.price == null ? "Consultar" : formatCurrency(product.price)}</td>}
                    <td>
                      <div className={cn("text-xs font-bold", lowStock ? "text-amber-700" : "text-[#0d1b2e]")}>
                        {formatNumber(stock)} {unit}
                      </div>
                      <div className="text-[10px] text-[#7a8aa0]">mín. {formatNumber(minStock)} {unit}</div>
                    </td>
                    <td className="text-xs text-[#5a6a82]">
                      {[item?.storage_shelf, item?.storage_level, item?.storage_compartment].filter(Boolean).join(" · ") || "—"}
                    </td>
                    {canViewCosts && <td className="text-xs font-bold text-[#0d1b2e]">
                      {displayUnitCost(item?.average_cost, unit, factor) == null ? "—" : formatCurrency(displayUnitCost(item?.average_cost, unit, factor))}
                    </td>}
                    {showFeatured && <td>
                      {product.show_in_catalog ? (
                        canToggleFeatured
                          ? <AdminIconButton ariaLabel={product.is_featured ? "Remover produto dos destaques" : "Destacar produto"} title={product.is_featured ? "Remover destaque" : "Destacar produto"} variant="ghost" onClick={() => toggleFeatured(product)}>
                              {product.is_featured ? <Star size={15} className="fill-amber-400 text-amber-400" /> : <Star size={15} className="text-[#5a6a82]" />}
                            </AdminIconButton>
                          : product.is_featured ? <Star size={15} className="fill-amber-400 text-amber-400" /> : <span>—</span>
                      ) : <span className="text-xs text-[#8a96a8]">Fora do catálogo</span>}
                    </td>}
                    {showStatus && <td><StatusBadge status={product.is_active ? "Ativo" : "Inativo"} /></td>}
                    {showActions && <td>
                      <div className="flex items-center justify-end gap-1">
                        {canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar item" title="Editar cadastro" onClick={() => openEditPage(product)}><Edit2 size={15} /></AdminIconButton>}
                        {canViewMovements && item?.inventory_item_id && <AdminIconButton ariaLabel="Histórico do estoque" title="Histórico" onClick={() => onRouteChange?.(String(item.inventory_item_id), "history")}><List size={15} /></AdminIconButton>}
                        {canCreateMovements && item?.inventory_item_id && <AdminIconButton ariaLabel="Movimentar estoque" title="Movimentar" onClick={() => onRouteChange?.(String(item.inventory_item_id), "move")}><ArrowLeftRight size={15} /></AdminIconButton>}
                        {canToggleActive && <AdminActiveStateButton active={product.is_active} entityLabel="item" onClick={() => toggleActive(product)} />}
                      </div>
                    </td>}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={nextPage => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={nextPageSize => { setPageSize(nextPageSize); setPage(1); }}
        />
      </AdminCard>}
    </>}

    {routeResourceId && !drawerOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}

    <AdminPage
      open={drawerOpen}
      onClose={closeEditor}
      breadcrumb="Estoque"
      title={editItem ? "Editar item" : "Novo item"}
      subtitle="Cadastro único para identificação, comercial, estoque, fornecedores, fiscal, fotos e catálogo."
      maxW="max-w-6xl"
      fullPage
    >
      <Tabs value={editorTab} onValueChange={value => setEditorTab(value as ProductEditorTab)} className="min-h-0">
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <TabsList className="mx-auto h-auto w-fit max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1.5">
            <EditorTabTrigger value="general" icon={Package}>Geral</EditorTabTrigger>
            <EditorTabTrigger value="commercial" icon={Warehouse}>Comercial e estoque</EditorTabTrigger>
            {canViewSuppliers && <EditorTabTrigger value="suppliers" icon={Truck}>Fornecedores</EditorTabTrigger>}
            <EditorTabTrigger value="fiscal" icon={FileText}>Fiscais</EditorTabTrigger>
            <EditorTabTrigger value="photos" icon={ImageIcon}>Fotos</EditorTabTrigger>
            {isArtvideoTenant && <EditorTabTrigger value="catalog" icon={ShoppingBag}>Catálogo</EditorTabTrigger>}
          </TabsList>
        </div>

        <div className="p-4 sm:p-5">
          <TabsContent value="general" className="mt-0 space-y-5">
            <Section title="Identificação do item">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FInput
                    label="Nome do item"
                    value={form.name}
                    required
                    disabled={saving}
                    error={fieldErrors.name}
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, name: undefined }));
                      setForm(current => ({ ...current, name: event.target.value }));
                    }}
                    placeholder="Nome completo do item"
                  />
                </div>

                <FInput
                  label="SKU / código interno"
                  value={form.sku}
                  disabled={saving}
                  onChange={(event: any) => setForm(current => ({ ...current, sku: event.target.value }))}
                  placeholder="Código interno"
                />
                <FInput
                  label="Código de barras / GTIN"
                  value={form.barcode}
                  disabled={saving}
                  error={fieldErrors.barcode}
                  onChange={(event: any) => {
                    setFieldErrors(current => ({ ...current, barcode: undefined }));
                    setForm(current => ({ ...current, barcode: event.target.value }));
                  }}
                  placeholder="EAN, GTIN, UPC ou código utilizado no PDV"
                  hint="GTIN é o identificador global; EAN e UPC são formatos usados em códigos de barras."
                />

                <div className="flex min-w-0 items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <FSelect
                      label="Categoria"
                      value={form.category_id}
                      disabled={saving || !canLoadCategories}
                      onChange={(event: any) => setForm(current => ({ ...current, category_id: event.target.value }))}
                      options={catOptions}
                    />
                  </div>
                  {canManageCategories && <AdminButton
                    type="button"
                    disabled={saving}
                    aria-label="Nova categoria"
                    title="Nova categoria"
                    onClick={() => {
                      setMasterDataName("");
                      setMasterDataDialog("category");
                    }}
                    className="h-[42px] w-[42px] shrink-0 !p-0"
                  ><Plus size={17} /></AdminButton>}
                </div>

                <div className="flex min-w-0 items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <FSelect
                      label="Marca"
                      value={form.brand_id}
                      disabled={saving || !canLoadBrands}
                      onChange={(event: any) => setForm(current => ({ ...current, brand_id: event.target.value }))}
                      options={brandOptions}
                    />
                  </div>
                  {canManageBrands && <AdminButton
                    type="button"
                    disabled={saving}
                    aria-label="Nova marca"
                    title="Nova marca"
                    onClick={() => {
                      setMasterDataName("");
                      setMasterDataDialog("brand");
                    }}
                    className="h-[42px] w-[42px] shrink-0 !p-0"
                  ><Plus size={17} /></AdminButton>}
                </div>

                <FInput
                  label="Modelo"
                  value={form.model}
                  disabled={saving}
                  onChange={(event: any) => setForm(current => ({ ...current, model: event.target.value }))}
                  placeholder="Modelo comercial"
                />
                <FInput
                  label="Código do fabricante / MPN"
                  value={form.manufacturer_code}
                  disabled={saving}
                  onChange={(event: any) => setForm(current => ({ ...current, manufacturer_code: event.target.value }))}
                  placeholder="Código original do fabricante"
                />

                <div className="sm:col-span-2">
                  <FTextarea
                    label="Descrição"
                    value={form.description}
                    disabled={saving}
                    onChange={(event: any) => setForm(current => ({ ...current, description: event.target.value }))}
                    rows={4}
                    placeholder="Descrição completa, aplicações, compatibilidades e informações úteis"
                  />
                </div>
                <div className="sm:col-span-2">
                  <FTextarea
                    label="Observações internas"
                    value={form.internal_notes}
                    disabled={saving}
                    onChange={(event: any) => setForm(current => ({ ...current, internal_notes: event.target.value }))}
                    rows={3}
                    placeholder="Anotações internas sobre o item, compra, compatibilidade ou operação"
                  />
                  <p className="mt-1 text-[10px] leading-4 text-[#7a8aa0]">Uso interno do CRM. Não aparece no catálogo, nota fiscal ou documentos.</p>
                </div>
              </div>
            </Section>

            <Section title="Características e classificação">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FInput
                  label="Código GPC / classificação externa"
                  value={form.gpc_code}
                  disabled={saving}
                  onChange={(event: any) => setForm(current => ({ ...current, gpc_code: event.target.value }))}
                  placeholder="Quando disponível"
                />
                <FDecimalInput
                  label="Peso bruto (g)"
                  value={form.gross_weight_grams}
                  disabled={saving}
                  decimalPlaces={3}
                  onChange={(event: any) => setForm(current => ({ ...current, gross_weight_grams: event.target.value }))}
                />
                <FDecimalInput
                  label="Peso líquido (g)"
                  value={form.net_weight_grams}
                  disabled={saving}
                  decimalPlaces={3}
                  onChange={(event: any) => setForm(current => ({ ...current, net_weight_grams: event.target.value }))}
                />
                <FDecimalInput
                  label="Largura (mm)"
                  value={form.width_mm}
                  disabled={saving}
                  decimalPlaces={3}
                  onChange={(event: any) => setForm(current => ({ ...current, width_mm: event.target.value }))}
                />
                <FDecimalInput
                  label="Altura (mm)"
                  value={form.height_mm}
                  disabled={saving}
                  decimalPlaces={3}
                  onChange={(event: any) => setForm(current => ({ ...current, height_mm: event.target.value }))}
                />
                <FDecimalInput
                  label="Comprimento (mm)"
                  value={form.length_mm}
                  disabled={saving}
                  decimalPlaces={3}
                  onChange={(event: any) => setForm(current => ({ ...current, length_mm: event.target.value }))}
                />
              </div>
            </Section>

            <Section title="Disponibilidade">
              <FToggle
                label="Item ativo"
                description="Disponibiliza o item para estoque, vendas, PDV e demais módulos comerciais."
                checked={form.is_active}
                disabled={saving}
                onChange={value => setForm(current => ({ ...current, is_active: value }))}
              />
            </Section>
          </TabsContent>

          <TabsContent value="commercial" className="mt-0 space-y-5">
            <Section title="Comercial">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <FCurrencyInput
                  label="Preço de venda"
                  value={form.price}
                  disabled={saving}
                  error={fieldErrors.price}
                  onChange={(event: any) => {
                    setFieldErrors(current => ({ ...current, price: undefined, compare_at_price: undefined }));
                    setForm(current => ({ ...current, price: event.target.value }));
                  }}
                  placeholder="0,00"
                />
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Unidade comercial</label>
                  <AdminSelect
                    value={form.commercial_unit}
                    onValueChange={value => setForm(current => ({ ...current, commercial_unit: value === "cx" ? "cx" : "un" }))}
                    options={[
                      { value: "un", label: "Unidade (un)" },
                      { value: "cx", label: "Caixa (cx)" },
                    ]}
                    disabled={saving}
                    ariaLabel="Unidade comercial"
                  />
                </div>
                <FIntegerInput
                  label="Unidades por caixa"
                  value={form.conversion_factor}
                  disabled={saving || form.commercial_unit !== "cx"}
                  error={fieldErrors.conversion_factor}
                  onChange={(event: any) => {
                    setFieldErrors(current => ({ ...current, conversion_factor: undefined }));
                    setForm(current => ({ ...current, conversion_factor: event.target.value || "1" }));
                  }}
                  hint={form.commercial_unit === "cx" ? "Quantidade de unidades existentes em cada caixa." : "Para unidade simples, o fator permanece 1."}
                />
              </div>
            </Section>

            <Section title="Estoque">
              <div className="space-y-4">
                {editItem && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <AdminCard className="bg-[#f8fafc] p-3 shadow-none">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a96a8]">Saldo atual</p>
                    <p className="mt-1 text-base font-black text-[#0d1b2e]">{formatNumber(currentQuantity)} {form.commercial_unit}</p>
                  </AdminCard>
                  {canViewCosts && <AdminCard className="bg-[#f8fafc] p-3 shadow-none">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a96a8]">Último custo</p>
                    <p className="mt-1 text-base font-black text-[#0d1b2e]">{purchasePrice == null ? "—" : formatCurrency(purchasePrice)}</p>
                  </AdminCard>}
                  {canViewCosts && <AdminCard className="bg-[#f8fafc] p-3 shadow-none">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a96a8]">Custo médio</p>
                    <p className="mt-1 text-base font-black text-[#0d1b2e]">{averageCost == null ? "—" : formatCurrency(averageCost)}</p>
                  </AdminCard>}
                  <AdminCard className="bg-[#f8fafc] p-3 shadow-none">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a96a8]">Cadastro</p>
                    <p className="mt-1 text-sm font-black text-[#0d1b2e]">Item único do estoque</p>
                  </AdminCard>
                </div>}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {!editItem && <FIntegerInput
                    label={`Saldo inicial (${form.commercial_unit})`}
                    value={form.initial_quantity}
                    disabled={saving}
                    error={fieldErrors.initial_quantity}
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, initial_quantity: undefined }));
                      setForm(current => ({ ...current, initial_quantity: event.target.value }));
                    }}
                  />}
                  {!editItem && canViewCosts && <FCurrencyInput
                    label={`Custo do saldo inicial (${form.commercial_unit})`}
                    value={form.initial_unit_cost}
                    disabled={saving}
                    error={fieldErrors.initial_unit_cost}
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, initial_unit_cost: undefined }));
                      setForm(current => ({ ...current, initial_unit_cost: event.target.value }));
                    }}
                    hint="Opcional. Registra o custo inicial com histórico."
                  />}
                  <FIntegerInput
                    label={`Estoque mínimo (${form.commercial_unit})`}
                    value={form.min_quantity}
                    disabled={saving}
                    error={fieldErrors.min_quantity}
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, min_quantity: undefined }));
                      setForm(current => ({ ...current, min_quantity: event.target.value }));
                    }}
                  />
                </div>

                {!editItem && Number(form.initial_quantity || 0) > 0 && <div className="grid grid-cols-1 gap-4 border-t border-[#0d1b2e]/8 pt-4 sm:grid-cols-2">
                  {canManageSuppliers && <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Fornecedor do saldo inicial</label>
                    <AdminSelect
                      value={form.initial_supplier_entity_id}
                      onValueChange={value => {
                        setFieldErrors(current => ({ ...current, initial_supplier_entity_id: undefined }));
                        setForm(current => ({ ...current, initial_supplier_entity_id: value }));
                      }}
                      options={[
                        { value: "", label: "Sem fornecedor informado" },
                        ...linkedSuppliers
                          .filter(supplier => supplier.is_active !== false)
                          .map(supplier => ({ value: supplier.id, label: supplier.name })),
                      ]}
                      disabled={saving}
                      ariaLabel="Fornecedor do saldo inicial"
                    />
                    {fieldErrors.initial_supplier_entity_id && <p className="mt-1 text-[10px] font-semibold text-red-600">{fieldErrors.initial_supplier_entity_id}</p>}
                    {linkedSuppliers.length === 0 && <p className="mt-1 text-[10px] leading-4 text-[#5a6a82]">Vincule fornecedores na aba Fornecedores para selecioná-los aqui.</p>}
                  </div>}
                  <FInput
                    label="Documento / referência do saldo inicial"
                    value={form.initial_reference}
                    disabled={saving}
                    onChange={(event: any) => setForm(current => ({ ...current, initial_reference: event.target.value }))}
                    placeholder="NF, pedido, inventário inicial..."
                  />
                </div>}

                <div className="grid grid-cols-1 gap-4 border-t border-[#0d1b2e]/8 pt-4 sm:grid-cols-3">
                  <FInput label="Estante" value={form.storage_shelf} disabled={saving} onChange={(event: any) => setForm(current => ({ ...current, storage_shelf: event.target.value }))} placeholder="Ex.: A" />
                  <FInput label="Prateleira" value={form.storage_level} disabled={saving} onChange={(event: any) => setForm(current => ({ ...current, storage_level: event.target.value }))} placeholder="Ex.: 2" />
                  <FInput label="Compartimento" value={form.storage_compartment} disabled={saving} onChange={(event: any) => setForm(current => ({ ...current, storage_compartment: event.target.value }))} placeholder="Ex.: C3" />
                </div>

                {editItem && <p className="text-xs leading-5 text-[#5a6a82]">
                  O saldo atual não é alterado pela edição do cadastro. Entradas, saídas e ajustes continuam sendo registrados como movimentações de estoque para preservar o histórico.
                </p>}
              </div>
            </Section>
          </TabsContent>

          {canViewSuppliers && <TabsContent value="suppliers" className="mt-0">
            <InventorySuppliersEditor
              organizationId={activeOrganizationId}
              value={linkedSuppliers}
              onChange={setLinkedSuppliers}
              disabled={!canManageSuppliers || saving}
            />
          </TabsContent>}

          <TabsContent value="fiscal" className="mt-0">
            <Section title="Dados fiscais do item">
              <p className="mb-5 text-xs leading-5 text-[#7a8aa0]">
                Campos usados em NF-e / NFC-e e escrituração de ICMS, PIS/COFINS e IPI. Preencha conforme o regime da empresa e orientação contábil.
              </p>

              <div className="grid grid-cols-1 gap-x-4 gap-y-5 lg:grid-cols-2">
                <FiscalField label="NCM" help="Classificação fiscal da mercadoria. Informe até 8 dígitos.">
                  <FInput
                    value={form.ncm}
                    disabled={saving}
                    error={fieldErrors.ncm}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="ex.: 85171231"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, ncm: undefined }));
                      setForm(current => ({ ...current, ncm: digitsOnly(event.target.value, 8) }));
                    }}
                    hint="Até 8 dígitos."
                  />
                </FiscalField>

                <FiscalField label="CEST" help="Código Especificador da Substituição Tributária. Use quando aplicável ao item.">
                  <FInput
                    value={form.cest}
                    disabled={saving}
                    error={fieldErrors.cest}
                    inputMode="numeric"
                    maxLength={7}
                    placeholder="7 dígitos quando aplicável"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, cest: undefined }));
                      setForm(current => ({ ...current, cest: digitsOnly(event.target.value, 7) }));
                    }}
                    hint="Opcional — 7 dígitos quando aplicável."
                  />
                </FiscalField>

                <div className="lg:col-span-2">
                  <FiscalField label="Origem da mercadoria" help="Código de origem utilizado no ICMS e na NF-e/NFC-e.">
                    <AdminSelect
                      value={form.merchandise_origin}
                      onValueChange={value => setForm(current => ({ ...current, merchandise_origin: value }))}
                      options={originOptions}
                      disabled={saving}
                      ariaLabel="Origem da mercadoria"
                    />
                  </FiscalField>
                </div>

                <FiscalField label="CFOP padrão (entrada)" help="CFOP sugerido para operações típicas de compra ou devolução de venda. A operação fiscal poderá sobrescrever esse padrão.">
                  <FInput
                    value={form.cfop_entry}
                    disabled={saving}
                    error={fieldErrors.cfop_entry}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="1102"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, cfop_entry: undefined }));
                      setForm(current => ({ ...current, cfop_entry: digitsOnly(event.target.value, 4) }));
                    }}
                    hint="Compra / devolução de venda."
                  />
                </FiscalField>

                <FiscalField label="CFOP padrão (saída)" help="CFOP sugerido para operações típicas de venda ou remessa. A operação fiscal poderá sobrescrever esse padrão.">
                  <FInput
                    value={form.cfop_exit}
                    disabled={saving}
                    error={fieldErrors.cfop_exit}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="5102"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, cfop_exit: undefined }));
                      setForm(current => ({ ...current, cfop_exit: digitsOnly(event.target.value, 4) }));
                    }}
                    hint="Venda / remessa típica."
                  />
                </FiscalField>

                <FiscalField label="CSOSN" help="Código de Situação da Operação no Simples Nacional, usado principalmente nas saídas.">
                  <FInput
                    value={form.csosn}
                    disabled={saving}
                    error={fieldErrors.csosn}
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="102"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, csosn: undefined }));
                      setForm(current => ({ ...current, csosn: digitsOnly(event.target.value, 3) }));
                    }}
                    hint="Simples Nacional."
                  />
                </FiscalField>

                <FiscalField label="CST ICMS" help="Código de Situação Tributária do ICMS para empresas fora do Simples Nacional.">
                  <FInput
                    value={form.cst_icms}
                    disabled={saving}
                    error={fieldErrors.cst_icms}
                    inputMode="numeric"
                    maxLength={3}
                    placeholder="000"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, cst_icms: undefined }));
                      setForm(current => ({ ...current, cst_icms: digitsOnly(event.target.value, 3) }));
                    }}
                    hint="Lucro presumido / real."
                  />
                </FiscalField>

                <FiscalField label="CST PIS" help="Código de Situação Tributária do PIS aplicável ao item.">
                  <FInput
                    value={form.cst_pis}
                    disabled={saving}
                    error={fieldErrors.cst_pis}
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="01"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, cst_pis: undefined }));
                      setForm(current => ({ ...current, cst_pis: digitsOnly(event.target.value, 2) }));
                    }}
                  />
                </FiscalField>

                <FiscalField label="CST COFINS" help="Código de Situação Tributária da COFINS aplicável ao item.">
                  <FInput
                    value={form.cst_cofins}
                    disabled={saving}
                    error={fieldErrors.cst_cofins}
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="01"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, cst_cofins: undefined }));
                      setForm(current => ({ ...current, cst_cofins: digitsOnly(event.target.value, 2) }));
                    }}
                  />
                </FiscalField>

                <FiscalField label="CST IPI" help="Código de Situação Tributária do IPI, quando houver incidência.">
                  <FInput
                    value={form.cst_ipi}
                    disabled={saving}
                    error={fieldErrors.cst_ipi}
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="99"
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, cst_ipi: undefined }));
                      setForm(current => ({ ...current, cst_ipi: digitsOnly(event.target.value, 2) }));
                    }}
                  />
                </FiscalField>

                <FiscalField label="Alíquota ICMS interna (%)" help="Alíquota interna do estado para o produto. Pode ser usada no cálculo do diferencial de alíquota em entradas interestaduais.">
                  <FDecimalInput
                    value={form.internal_icms_rate}
                    disabled={saving}
                    error={fieldErrors.internal_icms_rate}
                    decimalPlaces={4}
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, internal_icms_rate: undefined }));
                      setForm(current => ({ ...current, internal_icms_rate: event.target.value }));
                    }}
                    hint="Valor entre 0 e 100."
                  />
                </FiscalField>

                <div className="lg:col-span-2 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4">
                  <FToggle
                    label="Calcular diferencial de ICMS na entrada (compra interestadual)"
                    description="Marque quando este produto, comprado de outro estado para revenda, gerar diferencial de alíquota. O cálculo efetivo dependerá das configurações fiscais da empresa."
                    checked={form.calculate_entry_difal}
                    disabled={saving}
                    onChange={value => setForm(current => ({ ...current, calculate_entry_difal: value }))}
                  />
                </div>

                <FiscalField label="Alíquota IPI (%)" help="Alíquota padrão de IPI para o produto, quando aplicável.">
                  <FDecimalInput
                    value={form.ipi_rate}
                    disabled={saving}
                    error={fieldErrors.ipi_rate}
                    decimalPlaces={4}
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, ipi_rate: undefined }));
                      setForm(current => ({ ...current, ipi_rate: event.target.value }));
                    }}
                  />
                </FiscalField>

                <FiscalField label="Unidade tributável" help="Unidade usada para tributação na NF-e. Se vazia, será usada a unidade comercial do cadastro.">
                  <FInput
                    value={form.tax_unit}
                    disabled={saving}
                    maxLength={6}
                    placeholder={form.commercial_unit.toUpperCase()}
                    onChange={(event: any) => setForm(current => ({ ...current, tax_unit: event.target.value.toUpperCase() }))}
                    hint="Se vazio, usa a unidade comercial."
                  />
                </FiscalField>

                <FiscalField label="Alíquota PIS (%)" help="Alíquota padrão de PIS, quando o regime e a operação exigirem.">
                  <FDecimalInput
                    value={form.pis_rate}
                    disabled={saving}
                    error={fieldErrors.pis_rate}
                    decimalPlaces={4}
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, pis_rate: undefined }));
                      setForm(current => ({ ...current, pis_rate: event.target.value }));
                    }}
                  />
                </FiscalField>

                <FiscalField label="Alíquota COFINS (%)" help="Alíquota padrão de COFINS, quando o regime e a operação exigirem.">
                  <FDecimalInput
                    value={form.cofins_rate}
                    disabled={saving}
                    error={fieldErrors.cofins_rate}
                    decimalPlaces={4}
                    onChange={(event: any) => {
                      setFieldErrors(current => ({ ...current, cofins_rate: undefined }));
                      setForm(current => ({ ...current, cofins_rate: event.target.value }));
                    }}
                  />
                </FiscalField>

                <FiscalField label="GTIN tributável" help="Código GTIN/EAN da unidade tributável. Se vazio, pode ser usado o código de barras comercial.">
                  <FInput
                    value={form.tax_barcode}
                    disabled={saving}
                    placeholder="Opcional"
                    onChange={(event: any) => setForm(current => ({ ...current, tax_barcode: event.target.value }))}
                  />
                </FiscalField>

                <FiscalField label="Código de benefício fiscal" help="cBenef informado na NF-e quando exigido pela legislação estadual para a operação/produto.">
                  <FInput
                    value={form.fiscal_benefit_code}
                    disabled={saving}
                    placeholder="Opcional"
                    onChange={(event: any) => setForm(current => ({ ...current, fiscal_benefit_code: event.target.value }))}
                  />
                </FiscalField>

                <div className="lg:col-span-2">
                  <FTextarea
                    label="Observações fiscais"
                    value={form.fiscal_notes}
                    disabled={saving}
                    rows={4}
                    onChange={(event: any) => setForm(current => ({ ...current, fiscal_notes: event.target.value }))}
                    placeholder="Informações fiscais específicas do produto"
                  />
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="photos" className="mt-0">
            <Section title="Fotos do item">
              <p className="mb-4 text-xs leading-5 text-[#7a8aa0]">
                A foto principal identifica o item no CRM e pode ser reutilizada no catálogo da Artvideo quando a publicação estiver habilitada.
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                <ImageUpload
                  bucket="product-images"
                  organizationId={activeOrganizationId || undefined}
                  currentMediaId={form.cover_media_id}
                  onUpload={mediaId => setForm(current => ({ ...current, cover_media_id: mediaId }))}
                  canUpload={!saving && (editItem ? canEdit : canCreate)}
                  label="Foto principal"
                />
                <ImageUpload
                  bucket="product-images"
                  organizationId={activeOrganizationId || undefined}
                  currentMediaId={null}
                  onUpload={mediaId => {
                    setForm(current => ({ ...current, cover_media_id: current.cover_media_id || mediaId }));
                    if (!activeOrganizationId) return;
                    void resolveProductMediaImage(activeOrganizationId, mediaId)
                      .then(image => {
                        setGalleryMedia(current => current.some(entry => entry.media_id === image.media_id)
                          ? current
                          : [...current, image].slice(0, 10));
                      })
                      .catch(error => setToast({ msg: `Imagem enviada, mas não foi possível carregar a prévia: ${systemErrorMessage(error)}`, type: "error" }));
                  }}
                  canUpload={!saving && (editItem ? canEdit : canCreate) && galleryMedia.length < 10}
                  label="Adicionar foto à galeria"
                />
              </div>

              {galleryMedia.length > 0 && <div className="mt-5 border-t border-[#0d1b2e]/8 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-[#0d1b2e]">Galeria de fotos</p>
                    <p className="mt-0.5 text-[10px] text-[#7a8aa0]">Fotos importadas pela busca ou enviadas manualmente. Escolha a principal ou remova as que não quiser salvar.</p>
                  </div>
                  <span className="text-[10px] font-bold text-[#5a6a82]">{galleryMedia.length} foto{galleryMedia.length === 1 ? "" : "s"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {galleryMedia.map(image => <div key={image.media_id} className={cn("relative rounded-xl border bg-white p-1.5", form.cover_media_id === image.media_id ? "border-primary ring-1 ring-primary/20" : "border-[#0d1b2e]/10")}>
                    <div className="aspect-square overflow-hidden rounded-lg bg-[#f8fafc]">
                      {image.public_url
                        ? <img src={image.public_url} alt="" className="h-full w-full object-contain" />
                        : <div className="flex h-full items-center justify-center"><ImageIcon size={20} className="text-[#9aa6b5]" /></div>}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      <button
                        type="button"
                        onClick={() => setForm(current => ({ ...current, cover_media_id: image.media_id }))}
                        className={cn("flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-bold", form.cover_media_id === image.media_id ? "bg-primary text-white" : "bg-[#f1f4f8] text-[#5a6a82]")}
                      ><Star size={10} fill={form.cover_media_id === image.media_id ? "currentColor" : "none"} /> Capa</button>
                      <button
                        type="button"
                        onClick={() => {
                          setGalleryMedia(current => current.filter(entry => entry.media_id !== image.media_id));
                          if (form.cover_media_id === image.media_id) {
                            const next = galleryMedia.find(entry => entry.media_id !== image.media_id);
                            setForm(current => ({ ...current, cover_media_id: next?.media_id || "" }));
                          }
                        }}
                        className="rounded-md bg-red-50 px-2 py-1 text-[9px] font-bold text-red-700"
                      >Remover</button>
                    </div>
                  </div>)}
                </div>
              </div>}
            </Section>
          </TabsContent>

          {isArtvideoTenant && <TabsContent value="catalog" className="mt-0">
            <Section title="Catálogo da loja">
              <div className="space-y-5">
                <FToggle
                  label="Exibir no catálogo da loja"
                  description="Única configuração exclusiva da Artvideo. Quando desligada, o produto continua disponível normalmente para vendas, PDV e estoque."
                  checked={form.show_in_catalog}
                  disabled={saving}
                  onChange={value => setForm(current => ({ ...current, show_in_catalog: value }))}
                />

                {form.show_in_catalog && <div className="space-y-5 border-t border-[#0d1b2e]/8 pt-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <FInput
                        label="Descrição curta"
                        value={form.short_description}
                        disabled={saving}
                        onChange={(event: any) => setForm(current => ({ ...current, short_description: event.target.value }))}
                        placeholder="Resumo exibido no catálogo"
                      />
                    </div>
                    <FCurrencyInput
                      label="Preço de comparação"
                      value={form.compare_at_price}
                      disabled={saving}
                      error={fieldErrors.compare_at_price}
                      onChange={(event: any) => {
                        setFieldErrors(current => ({ ...current, compare_at_price: undefined }));
                        setForm(current => ({ ...current, compare_at_price: event.target.value }));
                      }}
                      hint="Opcional. Deve ser igual ou maior que o preço de venda."
                    />
                    <div className="flex items-end pb-1">
                      <FToggle
                        label="Destaque"
                        description="Exibe na Home e nos destaques da loja."
                        checked={form.is_featured}
                        disabled={saving}
                        onChange={value => setForm(current => ({ ...current, is_featured: value }))}
                      />
                    </div>
                  </div>
                </div>}
              </div>
            </Section>
          </TabsContent>}
        </div>
      </Tabs>

      <AdminStickyToolbar className="z-10 justify-end">
        <BtnSecondary onClick={closeEditor} disabled={saving}>Cancelar</BtnSecondary>
        {(editItem ? canEdit : canCreate) && <BtnPrimary onClick={handleSave} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
      </AdminStickyToolbar>
    </AdminPage>

    <AdminDialog
      open={Boolean(masterDataDialog)}
      onClose={() => {
        if (masterDataSaving) return;
        setMasterDataDialog(null);
        setMasterDataName("");
      }}
      title={masterDataDialog === "category" ? "Nova categoria" : "Nova marca"}
      description="O cadastro será vinculado à empresa atual e ficará disponível para todos os itens do Estoque."
      className="max-w-md"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={masterDataSaving} onClick={() => setMasterDataDialog(null)}>Cancelar</AdminButton>
        <AdminButton
          loading={masterDataSaving}
          loadingText="Criando..."
          disabled={!masterDataName.trim()}
          onClick={() => void saveMasterData()}
        >Criar</AdminButton>
      </div>}
    >
      <FInput
        label={masterDataDialog === "category" ? "Nome da categoria" : "Nome da marca"}
        value={masterDataName}
        disabled={masterDataSaving}
        onChange={(event: any) => setMasterDataName(event.target.value)}
        placeholder={masterDataDialog === "category" ? "Ex.: Controles remotos" : "Ex.: Samsung"}
      />
    </AdminDialog>
  </div>;
}
