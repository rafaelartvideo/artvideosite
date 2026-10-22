import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Edit2,
  Eraser,
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
import { AdminSearchPanel, AdminSearchClearButton, AdminSearchSortMenu } from "@/shared/ui/admin/AdminSearchPanel";
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
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/primitives/tabs";
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

type ProductEditorTab = "general" | "commercial" | "suppliers" | "store";

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
    className="group relative h-11 shrink-0 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3.5 text-[13px] font-medium text-muted-foreground shadow-none transition-colors hover:bg-transparent hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
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
  const [inventorySort, setInventorySort] = useState<"name_asc" | "name_desc" | "newest">("name_asc");
  const [mobileSearchField, setMobileSearchField] = useState<"name" | "gtin" | "category" | "location">("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [form, setForm] = useState<ProductForm>(() => emptyForm());
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [linkedSuppliers, setLinkedSuppliers] = useState<InventorySupplier[]>([]);
  const [galleryMedia, setGalleryMedia] = useState<ImportedProductImage[]>([]);
  const { url: coverPreviewUrl } = useMediaUrl(form.cover_media_id);
  const storePhotos = [
    ...(form.cover_media_id && !galleryMedia.some(image => image.media_id === form.cover_media_id)
      ? [{media_id: form.cover_media_id, public_url: coverPreviewUrl || "", alt_text: null}] : []),
    ...galleryMedia,
  ];
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
    ...([...categories].sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }))).map((item: any) => ({ value: item.id, label: item.name })),
  ];
  const brandOptions = [
    { value: "", label: "Sem marca" },
    ...([...brands].sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }))).map((item: any) => ({ value: item.id, label: item.name })),
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
      else if (errors.compare_at_price) setEditorTab("general");
      else setEditorTab("general");
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!activeOrganizationId || !(editItem ? canEdit : canCreate)) return;
    if (!validate()) return;
    const photoCount = new Set([form.cover_media_id, ...galleryMedia.map(image => image.media_id)].filter(Boolean)).size;
    if (photoCount > 4) {
      setEditorTab("store");
      setToast({ msg: "Limite de 4 fotos por produto, incluindo a principal. Remova as fotos excedentes.", type: "error" });
      return;
    }

    const price = nullableNumber(form.price);
    const compareAtPrice = nullableNumber(form.compare_at_price);
    const showInCatalog = isArtvideoTenant && form.show_in_catalog;

    setSaving(true);
    try {
      const finalSlug = editItem?.name === form.name.trim() && editItem?.slug
        ? editItem.slug
        : await generateUniqueSlug("products", form.name, editItem?.id);
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
        gallery_media_ids: Array.from(new Set([form.cover_media_id, ...galleryMedia.map(image => image.media_id)].filter(Boolean))).slice(0, 4),
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
      void refresh();
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
      void refresh();
    } catch (error) {
      setToast({ msg: `Erro ao atualizar item: ${systemErrorMessage(error)}`, type: "error" });
    }
  };

  const toggleFeatured = async (product: any) => {
    if (!activeOrganizationId || !canToggleFeatured || product.show_in_catalog !== true) return;
    try {
      await updateProductFlags(activeOrganizationId, product.id, { is_featured: !product.is_featured }, user?.id ?? null);
      setToast({ msg: "Destaque atualizado!", type: "success" });
      void refresh();
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

  filtered.sort((a: any, b: any) => inventorySort === "newest"
    ? String(b.created_at || "").localeCompare(String(a.created_at || ""))
    : String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }) * (inventorySort === "name_desc" ? -1 : 1));
  const hasInventoryFilters = Boolean(nameSearch.trim() || gtinSearch.trim() || categoryFilter || locationSearch.trim());
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [nameSearch, gtinSearch, categoryFilter, locationSearch, inventorySort, activeOrganizationId]);
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
        subtitle={`${products.length} item${products.length !== 1 ? "s" : ""} cadastrado${products.length !== 1 ? "s" : ""}`}
      />

      {canViewTable && <AdminSearchPanel title="Buscar no estoque" headerActions={<>
        {(hasInventoryFilters || inventorySort !== "name_asc") && <AdminSearchClearButton onClick={() => {
          setNameSearch(""); setGtinSearch(""); setCategoryFilter(""); setLocationSearch("");
          setInventorySort("name_asc"); setPage(1);
        }} />}
        <AdminSearchSortMenu value={inventorySort} onChange={setInventorySort}
          options={[{ value: "name_asc", label: "Nome A–Z" }, { value: "name_desc", label: "Nome Z–A" }, { value: "newest", label: "Mais recentes" }]} />
      </>}>
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
      </AdminSearchPanel>}

      {canViewTable && <AdminCard>
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title={hasInventoryFilters ? "Nenhum resultado" : "Nenhum item cadastrado"}
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
      subtitle="Cadastre uma vez para estoque e vendas. Na Artvideo, você também pode publicar na loja."
      maxW="max-w-6xl"
      fullPage
    >
      <Tabs value={editorTab} onValueChange={value => setEditorTab(value as ProductEditorTab)} className="min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 sm:px-5">
          <TabsList className="flex h-auto max-w-full flex-1 justify-start gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-0 shadow-none">
            <EditorTabTrigger value="general" icon={Package}>Geral</EditorTabTrigger>
            <EditorTabTrigger value="commercial" icon={Warehouse}>Comercial e estoque</EditorTabTrigger>
            {canViewSuppliers && <EditorTabTrigger value="suppliers" icon={Truck}>Fornecedores</EditorTabTrigger>}
            {isArtvideoTenant && <EditorTabTrigger value="store" icon={ShoppingBag}>Loja</EditorTabTrigger>}
          </TabsList>
          <button type="button" role="switch" aria-checked={form.is_active} aria-label="Ativar ou inativar item"
            disabled={saving || !(editItem ? canEdit : canCreate)}
            onClick={() => setForm(current => ({ ...current, is_active: !current.is_active }))}
            className={cn("my-2 inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors disabled:opacity-50",
              form.is_active ? "border-green-200 bg-green-50 text-green-700" : "border-[#d9e1eb] bg-[#f3f5f8] text-[#65758b]")}>
            <span className={cn("h-2 w-2 rounded-full", form.is_active ? "bg-green-500" : "bg-[#98a3b5]")}/>
            {form.is_active ? "Ativo" : "Inativo"}
          </button>
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
                </div>
              </div>
            </Section>

            <details className="rounded-xl border border-border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold text-foreground">Características avançadas (opcional)</summary><div className="mt-4"><Section title="Características e classificação">
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

            </div></details>
            <Section title="Foto da capa">
              <ImageUpload bucket="product-images" organizationId={activeOrganizationId || undefined}
                currentMediaId={form.cover_media_id}
                onUpload={mediaId => setForm(current => ({ ...current, cover_media_id: mediaId }))}
                canUpload={!saving && (editItem ? canEdit : canCreate)}
                label="Imagem principal do item"/>
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

          {isArtvideoTenant && <TabsContent value="store" className="mt-0 space-y-5">
            <Section title="Informações comerciais do site">
              <div className="space-y-4">
                <FToggle
                  label="Exibir este produto na loja"
                  description="O mesmo item será usado no estoque, nas vendas e no site. Não cria outro cadastro."
                  checked={form.show_in_catalog}
                  disabled={saving}
                  onChange={value => setForm(current => ({ ...current, show_in_catalog: value, is_featured: value ? current.is_featured : false }))}
                />
                {form.show_in_catalog && <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <FTextarea label="Descrição curta para a loja" value={form.short_description} rows={2} disabled={saving} placeholder="Resumo que o cliente verá no site" onChange={(event: any) => setForm(current => ({ ...current, short_description: event.target.value }))} />
                  </div>
                  <FCurrencyInput label="Preço anterior (opcional)" value={form.compare_at_price} disabled={saving} error={fieldErrors.compare_at_price} hint="Usado apenas para comparação; deve ser igual ou maior que o preço atual." onChange={(event: any) => setForm(current => ({ ...current, compare_at_price: event.target.value }))} />
                  <div className="flex items-end pb-1">
                    <FToggle label="Destacar na página inicial" description="Exibe o produto entre os destaques da home." checked={form.is_featured} disabled={saving} onChange={value => setForm(current => ({ ...current, is_featured: value }))} />
                  </div>
                </div>}
              </div>
            </Section>
            <Section title="Fotos da loja">
              <p className="mb-4 text-xs leading-5 text-[#7a8aa0]">
                Máximo de 4 fotos por produto, incluindo a principal. JPG e PNG são convertidos e comprimidos automaticamente quando possível.
              </p>
              <div className="grid max-w-xl gap-5">
                <ImageUpload
                  bucket="product-images"
                  organizationId={activeOrganizationId || undefined}
                  currentMediaId={null}
                  onUpload={mediaId => {
                    setForm(current => ({ ...current, cover_media_id: current.cover_media_id || mediaId }));
                    if (!activeOrganizationId) return;
                    void resolveProductMediaImage(activeOrganizationId, mediaId)
                      .then(image => {
                        setGalleryMedia(current => {
                          if (current.some(entry => entry.media_id === image.media_id)) return current;
                          const total = new Set([form.cover_media_id, ...current.map(entry => entry.media_id)].filter(Boolean)).size;
                          return total >= 4 ? current : [...current, image];
                        });
                      })
                      .catch(error => setToast({ msg: `Imagem enviada, mas não foi possível carregar a prévia: ${systemErrorMessage(error)}`, type: "error" }));
                  }}
                  canUpload={!saving && (editItem ? canEdit : canCreate) && new Set([form.cover_media_id, ...galleryMedia.map(image => image.media_id)].filter(Boolean)).size < 4}
                  label="Adicionar foto do produto"
                />
              </div>

              {storePhotos.length > 0 && <div className="mt-5 border-t border-[#0d1b2e]/8 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-[#0d1b2e]">Galeria de fotos</p>
                    <p className="mt-0.5 text-[10px] text-[#7a8aa0]">Selecione a estrela para escolher a foto principal que aparecerá na loja.</p>
                  </div>
                  <span className="text-[10px] font-bold text-[#5a6a82]">{storePhotos.length} foto{storePhotos.length === 1 ? "" : "s"}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {storePhotos.map(image => <div key={image.media_id} className={cn("relative rounded-xl border bg-white p-1.5", form.cover_media_id === image.media_id ? "border-primary ring-1 ring-primary/20" : "border-[#0d1b2e]/10")}>
                    <div className="aspect-square overflow-hidden rounded-lg bg-[#f8fafc]">
                      {image.public_url
                        ? <img src={image.public_url} alt="" className="h-full w-full object-contain" />
                        : <div className="flex h-full items-center justify-center"><ImageIcon size={20} className="text-[#9aa6b5]" /></div>}
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (form.cover_media_id && form.cover_media_id !== image.media_id &&
                              !galleryMedia.some(entry => entry.media_id === form.cover_media_id)) {
                            const previous = {media_id: form.cover_media_id, public_url: coverPreviewUrl || "", alt_text: null};
                            setGalleryMedia(current => current.some(entry => entry.media_id === previous.media_id) ? current : [previous, ...current]);
                          }
                          setForm(current => ({ ...current, cover_media_id: image.media_id }));
                        }}
                        className={cn("flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-bold", form.cover_media_id === image.media_id ? "bg-primary text-white" : "bg-[#f1f4f8] text-[#5a6a82]")}
                      ><Star size={14} fill={form.cover_media_id === image.media_id ? "currentColor" : "none"}/> {form.cover_media_id === image.media_id ? "Principal" : "Definir principal"}</button>
                      <button
                        type="button"
                        onClick={() => {
                          setGalleryMedia(current => current.filter(entry => entry.media_id !== image.media_id));
                          if (form.cover_media_id === image.media_id) {
                            const next = storePhotos.find(entry => entry.media_id !== image.media_id);
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
