import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { AdminOverviewPageSkeleton } from "@/shared/ui/admin/AdminOverviewPageSkeleton";
import { useWorkspaceFirstVisit } from "@/shared/ui/admin/useWorkspaceFirstVisit";
import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router";
import {
  BarChart3, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, FileText, Grid2X2, Heart,
  List, Minus, Package, Plus, ShoppingBag, ShoppingCart, Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminDialog, AdminIconButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchClearButton, AdminSearchSortMenu, AdminSearchPanel, AdminSearchTextField } from "@/shared/ui/admin/AdminSearchPanel";
import { EmptyState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { SalesProductDetailsDialog } from "./SalesProductDetailsDialog";
import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";
import { getMediaPreview } from "@/shared/infrastructure/media.repository";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { salesHomologationImage } from "../domain/sales-homologation-images";
import { listCompatibleModelsForProducts, type CompatibleDeviceModel } from "@/features/products/infrastructure/product-compatible-models.repository";
import type { PdvProduct } from "@/features/pdv/infrastructure/pdv.repository";
import { searchSalesCatalog,loadSalesCatalogCategories,getSalesProductDetails,listSalesProductRelations } from "../infrastructure/sales.repository";
import { SalesCheckoutDialog } from "./SalesCheckoutDialog";
import { SalesOrdersPage } from "./SalesOrdersPage";
import { SalesProposalsPage } from "./SalesProposalsPage";
import { SalesManagementPage } from "./SalesManagementPage";
import { SalesProposalEditorDialog } from "./SalesProposalEditorDialog";

type CartLine = { product: PdvProduct; quantity: number };
type ProductSort = "name" | "price_low" | "price_high" | "stock";

function availableQuantity(product: PdvProduct) {
  const quantity = Math.max(0, Number(product.quantity) || 0);
  const factor = Math.max(1, Number(product.conversion_factor) || 1);
  return product.unit === "cx" ? Math.floor(quantity / factor) : quantity;
}

function useDebouncedSearch(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setResult(value), 260);
    return () => window.clearTimeout(id);
  }, [value]);
  return result;
}

function readCart(key: string): CartLine[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is CartLine =>
      line && typeof line === "object"
      && typeof line.product?.product_id === "string"
      && typeof line.product?.name === "string"
      && Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.quantity <= 9999,
    ).slice(0, 80);
  } catch {
    return [];
  }
}

function readFavorites(key: string): string[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 250) : [];
  } catch {
    return [];
  }
}

function SalesProductPhoto({
  mediaId, name, sku, className = "h-full w-full",
}: { mediaId: string | null; name: string;sku?:string|null; className?: string }) {
  const { url } = useMediaUrl(mediaId);
  const illustration = salesHomologationImage(sku);
  return <div className={"flex items-center justify-center overflow-hidden bg-muted/30 " + className}>
    {url||illustration
      ? <img src={url||illustration||""} alt={name} loading="lazy" className="h-full max-h-full w-full object-contain p-2.5" />
      : <Package size={33} className="text-muted-foreground/50" aria-label="Produto sem foto" />}
  </div>;
}

/** Vitrine e venda comercial próprias: PDV não participa da conclusão. */
export function TabSales() {
  const { activeOrganizationId, user, hasPermission, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const currentView = location.pathname.startsWith("/admin/sales/orders") ? "orders"
    : location.pathname.startsWith("/admin/sales/proposals") ? "proposals"
      : location.pathname.startsWith("/admin/sales/management") ? "management" : "storefront";
  const salesModeSuffix = new URLSearchParams(location.search).get("mode") === "crm" ? "?mode=crm" : "";
  const organizationId = activeOrganizationId || "";
  const canView = hasPermission("sales.view");
  const canSell = hasPermission("sales.create");
  const cartStorageKey = organizationId && user?.id ? "union-sales-cart:v1:" + organizationId + ":" + user.id : "";
  const favoritesStorageKey = organizationId && user?.id ? "union-sales-favorites:v1:" + organizationId + ":" + user.id : "";
  const cartRef = useRef<HTMLDivElement>(null);
  const categoriesRef=useRef<HTMLDivElement>(null);
  const preparingSeqRef=useRef(0);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedSearch(search);
  const [sort, setSort] = useState<ProductSort>("name");
  const [display, setDisplay] = useState<"grid" | "list">("grid");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [categoryId,setCategoryId]=useState<string|null>(null);
  const [page,setPage]=useState(1);
  const [preparingProduct,setPreparingProduct]=useState<string|null>(null);
  // Troca de empresa/usuário jamais reutiliza o carrinho ou favoritos do tenant anterior.
  const [cartState,setCartState] = useState(()=>({
    key:cartStorageKey,items:readCart(cartStorageKey),
  }));
  const [favoritesState,setFavoritesState] = useState(()=>({
    key:favoritesStorageKey,items:readFavorites(favoritesStorageKey),
  }));
  const cart = cartState.key===cartStorageKey ? cartState.items : readCart(cartStorageKey);
  const favorites = favoritesState.key===favoritesStorageKey
    ? favoritesState.items : readFavorites(favoritesStorageKey);
  const setCart = (next:SetStateAction<CartLine[]>) => setCartState(previous=>{
    const items=previous.key===cartStorageKey ? previous.items : readCart(cartStorageKey);
    return {key:cartStorageKey,items:typeof next==="function"?next(items):next};
  });
  const setFavorites = (next:SetStateAction<string[]>) => setFavoritesState(previous=>{
    const items=previous.key===favoritesStorageKey ? previous.items : readFavorites(favoritesStorageKey);
    return {key:favoritesStorageKey,items:typeof next==="function"?next(items):next};
  });
  const [selection,setSelection]=useState<{organizationId:string;product:PdvProduct}|null>(null);
  const selected = selection?.organizationId===organizationId ? selection.product : null;
  const setSelected = (product:PdvProduct|null) =>
    setSelection(product?{organizationId,product}:null);
  const [checkoutFor,setCheckoutFor]=useState<string|null>(null);
  const [proposalFor,setProposalFor]=useState<string|null>(null);
  const checkoutIntent=Boolean(organizationId&&checkoutFor===organizationId);
  const proposalIntent=Boolean(organizationId&&proposalFor===organizationId);
  const setCheckoutIntent=(open:boolean)=>setCheckoutFor(open?organizationId:null);
  const setProposalIntent=(open:boolean)=>setProposalFor(open?organizationId:null);
  const [lastSaleCompleted, setLastSaleCompleted] = useState(false);
  const [mobileCartOpen,setMobileCartOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!cartStorageKey || cartState.key!==cartStorageKey) return;
    try {
      if (cartState.items.length) window.sessionStorage.setItem(cartStorageKey,JSON.stringify(cartState.items));
      else window.sessionStorage.removeItem(cartStorageKey);
    } catch { /* armazenamento bloqueado não impede a venda atual */ }
  },[cartStorageKey,cartState]);

  useEffect(() => {
    if (!favoritesStorageKey || favoritesState.key!==favoritesStorageKey) return;
    try {window.localStorage.setItem(favoritesStorageKey,JSON.stringify(favoritesState.items));}
    catch { /* favoritos permanecem disponíveis nesta sessão */ }
  },[favoritesStorageKey,favoritesState]);

  const categoriesQuery=useQuery({
    queryKey:["sales",organizationId,"catalog-categories"],
    queryFn:()=>loadSalesCatalogCategories(organizationId),
    enabled:Boolean(organizationId&&canView),
    staleTime:60_000,
  });

  useEffect(()=>{
    setCategoryId(null);
    setPage(1);
    setSearch("");
  },[organizationId]);

  const productsQuery=useQuery({
    queryKey:["sales",organizationId,"catalog-page",debouncedSearch,categoryId,page,sort,
      onlyAvailable,onlyFavorites,onlyFavorites?favorites.join(","):""],
    queryFn:()=>searchSalesCatalog(organizationId,{
      search:debouncedSearch,categoryId,page,pageSize:40,sort,
      onlyAvailable,favoriteIds:onlyFavorites?favorites:null,
    }),
    enabled:Boolean(organizationId&&canView&&(!debouncedSearch.trim()||debouncedSearch.trim().length>=2)),
    staleTime:20_000,
  });

  const catalogProductIds=useMemo(
    ()=>(productsQuery.data?.items||[]).map(row=>row.product_id),
    [productsQuery.data],
  );
  const deviceModelsQuery=useQuery({
    queryKey:["products","device-compatible-models","sales",organizationId,catalogProductIds.join(",")],
    queryFn:()=>listCompatibleModelsForProducts(organizationId,catalogProductIds),
    enabled:Boolean(organizationId&&canView&&catalogProductIds.length),
    staleTime:30_000,
  });
  const modelsByProduct = useMemo(() => {
    const result = new Map<string, CompatibleDeviceModel[]>();
    for (const row of deviceModelsQuery.data || []) {
      if (!row.product_id) continue;
      const current = result.get(row.product_id) || [];
      current.push(row);
      result.set(row.product_id, current);
    }
    return result;
  }, [deviceModelsQuery.data]);

  const relatedQuery = useQuery({
    queryKey: ["sales", organizationId, "relations", selected?.product_id || ""],
    queryFn: () => listSalesProductRelations(organizationId, [selected!.product_id]),
    enabled: Boolean(organizationId && canView && selected?.product_id),
    staleTime: 30_000,
  });

  // Filtros e ordenação rodam antes da paginação no servidor.
  const products=productsQuery.data?.items||[];
  const totalFiltered=Number(productsQuery.data?.total_count||0);
  const totalProducts=Number(categoriesQuery.data?.total_products||0);
  const totalPages=Math.max(1,Math.ceil(totalFiltered/40));
  // A vitrine e as três subseções são preparadas sem desmontar o cabeçalho.
  // A primeira entrada completa fica registrada apenas para este usuário/empresa.
  const [readyViews,setReadyViews]=useState<Record<string,true>>({});
  const markSalesSectionReady=useCallback((view:"orders"|"proposals"|"management")=>{
    if(!organizationId)return;
    const key=`${organizationId}:${view}`;
    setReadyViews(previous=>previous[key]?previous:{...previous,[key]:true});
  },[organizationId]);
  // Model compatibility and catalog rows settle together to avoid jumping cards.
  const catalogResultsLoading = (productsQuery.isPending && !productsQuery.data)
    || (catalogProductIds.length > 0 && deviceModelsQuery.isPending && !deviceModelsQuery.data);
  const storefrontReady=!canView || (
    !categoriesQuery.isPending && (debouncedSearch.trim().length===1 || !catalogResultsLoading)
  );
  const sectionReady=currentView==="storefront"
    ? storefrontReady
    : Boolean(readyViews[`${organizationId}:${currentView}`]);
  const firstPageLoading=useWorkspaceFirstVisit(
    "sales",
    organizationId&&user?.id?`${user.id}:${organizationId}`:"",
    !authLoading && sectionReady,
  );


  const prepareProduct=async(product:PdvProduct)=>{
    if(preparingProduct)return;
    const seq=++preparingSeqRef.current;
    setPreparingProduct(product.product_id);
    setSelected(product);
    setToast(null);
    try{
      const [detail,related]=await Promise.all([
        queryClient.fetchQuery({
          queryKey:["sales","product-details",organizationId,product.product_id],
          queryFn:()=>getSalesProductDetails(organizationId,product.product_id),
          staleTime:30_000,
        }),
        queryClient.fetchQuery({
          queryKey:["sales",organizationId,"relations",product.product_id],
          queryFn:()=>listSalesProductRelations(organizationId,[product.product_id]),
          staleTime:30_000,
        }),
        queryClient.fetchQuery({
          queryKey:["products","device-compatible-models",organizationId,product.product_id],
          queryFn:()=>listCompatibleModelsForProducts(organizationId,[product.product_id]),
          staleTime:30_000,
        }),
      ]).then(values=>[values[0],values[1]] as const);
      const mediaIds=[product.cover_media_id,...(detail.gallery_media_ids||[]),
        ...related.map(item=>item.cover_media_id)].filter((id):id is string=>Boolean(id));
      // A mesma chave usada pelo hook de mídia impede um segundo carregamento visível no modal.
      const previews=await Promise.all([...new Set(mediaIds)].slice(0,18).map(mediaId=>
        queryClient.fetchQuery({
          queryKey:queryKeys.publicSite.media(mediaId),
          queryFn:()=>getMediaPreview(queryClient,mediaId),
          staleTime:30*60_000,
        }).catch(()=>null)));
      // Aguarda a capa e algumas miniaturas realmente decodificarem no navegador.
      const illustration=salesHomologationImage(product.sku);
      const urls=[illustration,...previews.map(preview=>preview?.url||null)]
        .filter((url):url is string=>Boolean(url)).slice(0,10);
      await Promise.all(urls.map(url=>new Promise<void>(resolve=>{
        const image=new Image();
        image.onload=()=>resolve();image.onerror=()=>resolve();
        image.src=url;
        if(image.complete)resolve();
      })));
      // O modal já abriu: o indicador interno cessa quando os dados ficam prontos.
    }catch(error){
      if(seq===preparingSeqRef.current){
        setToast({type:"error",msg:systemErrorMessage(error,"Não foi possível preparar os detalhes do produto.")});
      }
    }finally{
      if(seq===preparingSeqRef.current)setPreparingProduct(null);
    }
  };

  const cartQuantities:Record<string,number>=Object.fromEntries(cart.map(line=>[line.product.product_id,line.quantity]));
  const cartQuantity = cart.reduce((total, line) => total + line.quantity, 0);
  const cartTotal = cart.reduce((total, line) => total + Number(line.product.price || 0) * line.quantity, 0);

  const addProduct = (product: PdvProduct, quantity = 1) => {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return;
    if (!canSell) return;
    if (product.price == null || !Number.isFinite(Number(product.price)) || Number(product.price) <= 0) {
      setToast({ type: "error", msg: "Defina o preço de venda deste produto no Estoque antes de vender." });
      return;
    }
    const max = availableQuantity(product);
    const current = cart.find(line => line.product.product_id === product.product_id)?.quantity || 0;
    if (max < current + quantity) {
      setToast({ type: "error", msg: "Não há mais unidades disponíveis para adicionar ao carrinho." });
      return;
    }
    setCart(previous => {
      const found = previous.find(line => line.product.product_id === product.product_id);
      return found
        ? previous.map(line => line.product.product_id === product.product_id
          ? { ...line, product, quantity: Math.min(max, line.quantity + quantity) } : line)
        : [...previous, { product, quantity }];
    });
    setToast(null);
  };

  const setQuantity = (productId: string, quantity: number) => {
    const existing = cart.find(line => line.product.product_id === productId);
    if (!existing) return;
    if (quantity <= 0) {
      setCart(previous => previous.filter(line => line.product.product_id !== productId));
      return;
    }
    if (!Number.isSafeInteger(quantity) || quantity > availableQuantity(existing.product)) {
      setToast({ type: "error", msg: "Quantidade maior que o estoque disponível." });
      return;
    }
    setCart(previous => previous.map(line => line.product.product_id === productId ? { ...line, quantity } : line));
  };

  const toggleFavorite = (productId: string) => setFavorites(previous =>
    previous.includes(productId) ? previous.filter(id => id !== productId) : [...previous, productId],
  );

  const addExactCode = () => {
    const code = search.trim().toLocaleLowerCase("pt-BR");
    const exact = productsQuery.data?.items.find(product =>
      product.sku?.toLocaleLowerCase("pt-BR") === code || product.barcode?.toLocaleLowerCase("pt-BR") === code,
    );
    if (exact) addProduct(exact);
  };

  return <div className="min-w-0 space-y-4 pb-20 md:pb-6">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {firstPageLoading && <AdminOverviewPageSkeleton variant="sales" salesSection={currentView}
      tabs={hasPermission("sales.reports.view")?4:3} rows={currentView==="storefront"?12:15} />}
    {/* Mount active section during first load so its query can signal readiness. */}
    <div className={firstPageLoading ? "hidden" : "min-w-0 space-y-5"} aria-hidden={firstPageLoading}>
    <PageHeader className="!border-b-0 !pb-0" title="Vendas" subtitle="Vitrine, propostas comerciais, pedidos e recebimentos integrados ao Financeiro, sem depender do PDV." />
    <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-0" role="tablist" aria-label="Seções de Vendas">
      <button type="button" role="tab" aria-selected={currentView === "storefront"}
        onClick={() => {setSelected(null);navigate("/admin/sales" + salesModeSuffix);}}
        className={"inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent bg-transparent px-1 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary " + (currentView==="storefront"
          ? "!border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
        <Package size={14} aria-hidden="true"/> Vitrine
      </button>
      <button type="button" role="tab" aria-selected={currentView === "proposals"}
        onClick={() => {setSelected(null);navigate("/admin/sales/proposals" + salesModeSuffix);}}
        className={"inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent bg-transparent px-1 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary " + (currentView==="proposals"
          ? "!border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
        <FileText size={14} aria-hidden="true"/> Propostas
      </button>
      <button type="button" role="tab" aria-selected={currentView === "orders"}
        onClick={() => {setSelected(null);navigate("/admin/sales/orders" + salesModeSuffix);}}
        className={"inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent bg-transparent px-1 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary " + (currentView==="orders"
          ? "!border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
        <ClipboardList size={14} aria-hidden="true"/> Pedidos
      </button>
      {hasPermission("sales.reports.view")&&<button type="button" role="tab"
        aria-selected={currentView === "management"}
        onClick={() => {setSelected(null);navigate("/admin/sales/management" + salesModeSuffix);}}
        className={"inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent bg-transparent px-1 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary " +
          (currentView==="management"?"!border-primary text-primary":"text-muted-foreground hover:text-foreground")}>
        <BarChart3 size={14} aria-hidden="true"/> Gestão
      </button>}
    </div>
    {currentView === "orders"
      ? <SalesOrdersPage onInitialReady={markSalesSectionReady} onNewSale={() => navigate("/admin/sales" + salesModeSuffix)} />
      : currentView === "management"
      ? <SalesManagementPage onInitialReady={markSalesSectionReady} />
      : currentView === "proposals"
      ? <SalesProposalsPage onInitialReady={markSalesSectionReady} />
      : <>
    {proposalIntent && <SalesProposalEditorDialog
      key={"new-proposal:" + organizationId + ":" + (user?.id || "")}
      organizationId={organizationId}
      cartItems={cart}
      onClose={() => setProposalIntent(false)}
      onSaved={message => {
        setProposalIntent(false);
        setCart([]);
        setToast({msg:message,type:"success"});
        void queryClient.invalidateQueries({queryKey:["sales",organizationId]});
        navigate("/admin/sales/proposals" + salesModeSuffix);
      }}
    />}
    {checkoutIntent && <SalesCheckoutDialog
      key={organizationId + ":" + (user?.id || "")}
      open
      items={cart}
      onClose={() => {
        setCheckoutIntent(false);
        if (lastSaleCompleted) {
          setLastSaleCompleted(false);
          navigate("/admin/sales/orders" + salesModeSuffix);
        }
      }}
      onCompleted={sale => {
        setCart([]);
        setLastSaleCompleted(true);
        setToast({ msg: "Pedido comercial #" + sale.order_number + " registrado com sucesso.", type: "success" });
        void queryClient.invalidateQueries({ queryKey: ["sales", organizationId] });
        void queryClient.invalidateQueries({ queryKey: ["inventory"] });
        void queryClient.invalidateQueries({ queryKey: ["finance"] });
      }}
    />}

    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,350px)]">
      <section className="min-w-0 space-y-3">
        {/* Keep the search, category chips and cart mounted when product results change. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Vitrine de produtos <span className="font-semibold text-muted-foreground">({totalProducts})</span>
            </h2>

          </div>
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            <button type="button" onClick={() => setDisplay("grid")} aria-label="Ver produtos em grade"
              aria-pressed={display === "grid"} className={"rounded-md p-2 " + (display === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
              <Grid2X2 size={17} />
            </button>
            <button type="button" onClick={() => setDisplay("list")} aria-label="Ver produtos em lista"
              aria-pressed={display === "list"} className={"rounded-md p-2 " + (display === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
              <List size={17} />
            </button>
          </div>
        </div>
        <AdminSearchPanel title="Buscar produtos"
          headerActions={<>
            {(search||onlyAvailable||onlyFavorites||categoryId||sort!=="name")
              && <AdminSearchClearButton onClick={()=>{
                setSearch("");setOnlyAvailable(false);setOnlyFavorites(false);
                setCategoryId(null);setPage(1);setSort("name");
              }}/>}
            <AdminSearchSortMenu label="Ordenar produtos" value={sort}
              onChange={value=>{setSort(value);setPage(1);}} options={[
                {value:"name",label:"Nome A–Z"},
                {value:"price_low",label:"Menor preço"},
                {value:"price_high",label:"Maior preço"},
                {value:"stock",label:"Mais estoque"},
              ]}/>
          </>}>
          <AdminSearchTextField label="Nome, SKU, GTIN, modelo ou código relacionado"
            value={search} onChange={value=>{setSearch(value);setPage(1);}}
            placeholder="Buscar produtos para venda..." ariaLabel="Buscar produtos para venda"
            onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();addExactCode();}}}/>
          <div className="mt-3 flex min-w-0 items-center gap-2">
            <div ref={categoriesRef} role="group" aria-label="Filtros por disponibilidade, favoritos e categorias"
              className="flex min-w-0 flex-1 snap-x items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button type="button" aria-pressed={categoryId===null}
                onClick={()=>{setCategoryId(null);setPage(1);}}
                className={"shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-semibold "+
                  (categoryId===null?"border-primary/30 bg-primary/10 text-primary":"border-border text-muted-foreground")}>
                Todas ({totalProducts})
              </button>
              <button type="button" aria-pressed={onlyAvailable}
                onClick={()=>{setOnlyAvailable(value=>!value);setPage(1);}}
                className={"shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-semibold "+
                  (onlyAvailable?"border-primary/30 bg-primary/10 text-primary":"border-border text-muted-foreground")}>
                Disponíveis
              </button>
              <button type="button" aria-pressed={onlyFavorites}
                onClick={()=>{setOnlyFavorites(value=>!value);setPage(1);}}
                className={"inline-flex shrink-0 snap-start items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold "+
                  (onlyFavorites?"border-primary/30 bg-primary/10 text-primary":"border-border text-muted-foreground")}>
                <Heart size={13}/> Favoritos
              </button>
              {(categoriesQuery.data?.categories||[]).map(category=><button type="button"
                key={category.id} aria-pressed={categoryId===category.id}
                onClick={()=>{setCategoryId(category.id);setPage(1);}}
                className={"shrink-0 snap-start rounded-full border px-3 py-1.5 text-xs font-semibold "+
                  (categoryId===category.id?"border-primary/30 bg-primary/10 text-primary":"border-border text-muted-foreground")}>
                {category.name} ({category.total})
              </button>)}
              {categoriesQuery.isPending&&<span className="shrink-0 text-xs text-muted-foreground">Preparando categorias...</span>}
            </div>
            {(categoriesQuery.data?.categories.length||0)>3&&<div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={()=>categoriesRef.current?.scrollBy({left:-280,behavior:"smooth"})}
                aria-label="Categorias anteriores" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <ChevronLeft size={16}/>
              </button>
              <button type="button" onClick={()=>categoriesRef.current?.scrollBy({left:280,behavior:"smooth"})}
                aria-label="Próximas categorias" className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <ChevronRight size={16}/>
              </button>
            </div>}
          </div>
        </AdminSearchPanel>

        {!canView ? <EmptyState icon={ShoppingBag} title="Sem permissão para visualizar Vendas"
          message="Solicite acesso ao módulo Vendas ao gestor da empresa." />
          : debouncedSearch.trim().length === 1 ? <p className="p-5 text-sm text-muted-foreground">Digite pelo menos dois caracteres para buscar.</p>
          
          : catalogResultsLoading
          ? <AdminWorkspaceSkeleton searchFields={0} columns={display==="list"?6:4}
              rows={40} variant={display==="list"?"table":"grid"} />
          : productsQuery.error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-card p-5 text-sm text-destructive">
            {systemErrorMessage(productsQuery.error, "Não foi possível carregar o catálogo.")}
          </div>
          : products.length === 0 ? <EmptyState icon={Package} title="Nenhum produto encontrado"
              message="Tente outra pesquisa ou altere os filtros. Cadastros são gerenciados no Estoque." />
          : display==="list"
          ?<AdminCard square className="[&_th]:py-3 [&_td]:py-3">
            <div className="divide-y divide-border md:hidden">
              {products.map(product=>{
                const available=Math.max(0,availableQuantity(product)-(cartQuantities[product.product_id]||0));
                const favorite=favorites.includes(product.product_id);
                const canAdd=canSell&&available>0&&product.price!=null&&Number(product.price)>0;
                const cartCount=cartQuantities[product.product_id]||0;
                return <div key={product.product_id} className="flex min-w-0 items-start gap-3 p-3">
                  <button type="button" onClick={()=>void prepareProduct(product)}
                    aria-label={"Ver detalhes de "+product.name}
                    className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
                    <SalesProductPhoto mediaId={product.cover_media_id} name={product.name} sku={product.sku}/>
                  </button>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <button type="button" onClick={()=>void prepareProduct(product)}
                      className="block break-words text-left text-sm font-semibold text-foreground hover:text-primary">
                      {product.name}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      {product.sku||product.barcode||"Sem código"} · {product.category_name||"Sem categoria"}
                    </p>
                    <p className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {product.price==null?"Sem preço":formatCurrency(product.price)}
                    </p>
                    <p className={"text-xs font-semibold "+(available>0?"text-primary":"text-destructive")}>
                      {available>0||cartCount>0?formatNumber(available)+" "+(product.unit||"un")+" disponíveis":"Sem estoque"}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button type="button" aria-label={favorite?"Remover favorito":"Favoritar produto"}
                        aria-pressed={favorite} onClick={()=>toggleFavorite(product.product_id)}
                        className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg "+
                          (favorite?"text-red-500":"text-muted-foreground hover:text-primary")}>
                        <Heart size={17} fill={favorite?"currentColor":"none"}/>
                      </button>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <AdminButton size="sm" disabled={!canAdd}
                          onClick={()=>addProduct(product)}><Plus size={14}/> Adicionar</AdminButton>
                        {cartCount>0&&<AdminIconButton variant="quaternary" className="h-9 w-9 shrink-0"
                          ariaLabel={"Remover "+product.name+" do carrinho"} onClick={()=>setQuantity(product.product_id,0)}>
                          <Trash2 size={15}/>
                        </AdminIconButton>}
                      </div>
                    </div>
                  </div>
                </div>;
              })}
            </div>
            <div className="hidden min-w-0 overflow-x-auto md:block">
              <TopTableScrollbar/>
              <table className="w-full min-w-[750px] text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Produto</th>
                    <th className="text-left">SKU / Código</th>
                    <th className="text-left">Categoria</th>
                    <th className="text-left">Preço</th>
                    <th className="text-left">Disponível</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product=>{
                    const available=Math.max(0,availableQuantity(product)-(cartQuantities[product.product_id]||0));
                    const favorite=favorites.includes(product.product_id);
                    const canAdd=canSell&&available>0&&product.price!=null&&Number(product.price)>0;
                    const cartCount=cartQuantities[product.product_id]||0;
                    return <tr key={product.product_id}>
                      <td className="min-w-[230px]">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <button type="button" onClick={()=>void prepareProduct(product)}
                            aria-label={"Ver detalhes de "+product.name}
                            className="h-12 w-14 shrink-0 overflow-hidden rounded-lg border border-border">
                            <SalesProductPhoto mediaId={product.cover_media_id} name={product.name} sku={product.sku}/>
                          </button>
                          <button type="button" onClick={()=>void prepareProduct(product)}
                            className="min-w-0 max-w-[300px] text-left text-xs font-semibold leading-5 hover:text-primary">
                            {product.name}
                          </button>
                        </div>
                      </td>
                      <td className="font-mono text-xs text-muted-foreground">{product.sku||product.barcode||"—"}</td>
                      <td className="text-xs text-muted-foreground">{product.category_name||"Sem categoria"}</td>
                      <td className="whitespace-nowrap text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {product.price==null?"Sem preço":formatCurrency(product.price)}
                      </td>
                      <td className={"whitespace-nowrap text-xs font-semibold "+(available>0?"text-primary":"text-destructive")}>
                        {available>0||cartCount>0?formatNumber(available)+" "+(product.unit||"un"):"Sem estoque"}
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" aria-label={favorite?"Remover favorito":"Favoritar produto"}
                            aria-pressed={favorite} onClick={()=>toggleFavorite(product.product_id)}
                            className={"flex h-9 w-9 items-center justify-center rounded-md "+
                              (favorite?"text-red-500":"text-muted-foreground hover:text-primary")}>
                            <Heart size={17} fill={favorite?"currentColor":"none"}/>
                          </button>
                          <AdminButton size="sm" disabled={!canAdd}
                            onClick={()=>addProduct(product)}><Plus size={14}/> Adicionar</AdminButton>
                          {cartCount>0&&<AdminIconButton variant="quaternary" className="h-9 w-9 shrink-0"
                            ariaLabel={"Remover "+product.name+" do carrinho"} onClick={()=>setQuantity(product.product_id,0)}>
                            <Trash2 size={15}/>
                          </AdminIconButton>}
                        </div>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </AdminCard>
          :<div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
            {products.map(product=>{
              const available=Math.max(0,availableQuantity(product)-(cartQuantities[product.product_id]||0));
              const favorite=favorites.includes(product.product_id);
              const deviceModels=modelsByProduct.get(product.product_id)||[];
              const canAdd=canSell&&available>0&&product.price!=null&&Number(product.price)>0;
              const cartCount=cartQuantities[product.product_id]||0;
              return <article key={product.product_id}
                className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                <button type="button" onClick={()=>void prepareProduct(product)}
                  aria-label={"Ver detalhes de "+product.name}
                  className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg">
                  <SalesProductPhoto mediaId={product.cover_media_id} name={product.name} sku={product.sku}/>
                </button>
                <div className="flex min-w-0 flex-1 flex-col gap-2 p-2.5">
                  <div className="flex min-w-0 items-start gap-1">
                    <button type="button" onClick={()=>void prepareProduct(product)}
                      className="line-clamp-2 min-w-0 flex-1 text-left text-sm font-bold leading-5 text-foreground hover:text-primary">
                      {product.name}
                    </button>
                    <button type="button" aria-label={favorite?"Remover favorito":"Favoritar produto"}
                      aria-pressed={favorite} onClick={()=>toggleFavorite(product.product_id)}
                      className={"shrink-0 rounded-md p-1 "+(favorite?"text-red-500":"text-muted-foreground")}>
                      <Heart size={17} fill={favorite?"currentColor":"none"}/>
                    </button>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{product.sku||product.barcode||"Sem código"}</p>
                  <p className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {product.price==null?"Sem preço":formatCurrency(product.price)}
                  </p>
                  <p className={"text-xs font-semibold "+(available>0?"text-primary":"text-destructive")}>
                    {available>0||cartCount>0?formatNumber(available)+" "+(product.unit||"un")+" disponíveis":"Sem estoque"}
                  </p>
                  {deviceModels.length>0&&<p className="line-clamp-2 text-xs leading-4 text-muted-foreground"
                    title={deviceModels.map(model=>model.brand+" "+model.model).join(" · ")}>
                    <span className="font-semibold text-foreground">Compatível: </span>
                    {deviceModels[0].brand} {deviceModels[0].model}
                    {deviceModels.length>1?" · +"+(deviceModels.length-1):""}
                  </p>}
                  <div className="mt-auto flex min-w-0 items-center gap-1.5">
                    <AdminButton size="sm" disabled={!canAdd} className="min-w-0 flex-1 justify-center"
                      onClick={()=>addProduct(product)}><Plus size={14}/> Adicionar</AdminButton>
                    {cartCount>0&&<AdminIconButton variant="quaternary" className="h-9 w-9 shrink-0"
                      ariaLabel={"Remover "+product.name+" do carrinho"} onClick={()=>setQuantity(product.product_id,0)}>
                      <Trash2 size={15}/>
                    </AdminIconButton>}
                  </div>
                </div>
              </article>;
            })}
          </div>}
        {canView&&totalPages>1&&!productsQuery.isPending&&<nav
          aria-label="Paginação de produtos"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages} · {totalFiltered} produtos
          </span>
          <div className="flex items-center gap-2">
            <AdminButton variant="secondary" size="sm" disabled={page<=1}
              onClick={()=>setPage(v=>Math.max(1,v-1))}>Anterior</AdminButton>
            <AdminButton variant="secondary" size="sm" disabled={page>=totalPages}
              onClick={()=>setPage(v=>Math.min(totalPages,v+1))}>Próxima</AdminButton>
          </div>
        </nav>}
      </section>

      <aside ref={cartRef} className="hidden min-w-0 rounded-xl border border-border bg-card xl:sticky xl:top-4 xl:block">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
            <ShoppingCart size={18} /> Carrinho <span className="text-xs font-medium text-muted-foreground">({cartQuantity})</span>
          </h2>
          {cart.length > 0 && <button type="button" onClick={() => setCart([])}
            className="flex items-center gap-1 text-xs font-semibold text-destructive"><Trash2 size={14} /> Limpar</button>}
        </div>
        <div className="max-h-[min(48vh,520px)] space-y-3 overflow-y-auto p-3">
          {cart.length === 0 ? <div className="py-10 text-center">
            <ShoppingBag size={28} className="mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm font-semibold text-foreground">Carrinho vazio</p>
            <p className="mt-1 text-xs text-muted-foreground">Adicione produtos pela vitrine.</p>
          </div> : cart.map(line => <div key={line.product.product_id} className="rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold text-foreground">{line.product.name}</p>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{formatCurrency(line.product.price || 0)} / {line.product.unit || "un"}</p>
              </div>
              <button type="button" onClick={() => setQuantity(line.product.product_id, 0)}
                aria-label={"Remover " + line.product.name} className="text-destructive"><Trash2 size={15} /></button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex h-8 items-center rounded-md border border-border">
                <button type="button" aria-label={"Diminuir " + line.product.name}
                  onClick={() => setQuantity(line.product.product_id, line.quantity - 1)}
                  className="flex h-full w-8 items-center justify-center"><Minus size={14} /></button>
                <span className="w-8 text-center text-xs font-bold tabular-nums">{line.quantity}</span>
                <button type="button" aria-label={"Aumentar " + line.product.name}
                  onClick={() => setQuantity(line.product.product_id, line.quantity + 1)}
                  className="flex h-full w-8 items-center justify-center"><Plus size={14} /></button>
              </div>
              <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency((line.product.price || 0) * line.quantity)}</span>
            </div>
          </div>)}
        </div>
        <div className="space-y-3 border-t border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Total estimado</span>
            <strong className="text-xl tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(cartTotal)}</strong>
          </div>
          <AdminButton className="w-full justify-center" disabled={!canSell || cart.length === 0}
            onClick={() => setCheckoutIntent(true)}><CheckCircle2 size={16} /> Finalizar venda</AdminButton>
          {hasPermission("sales.proposals.manage") && <AdminButton
            variant="secondary" className="w-full justify-center" disabled={cart.length===0}
            onClick={() => setProposalIntent(true)}>
            <ShoppingBag size={16} /> Criar proposta
          </AdminButton>}
          <p className="text-[11px] leading-4 text-muted-foreground">
            A venda é confirmada no próprio módulo Vendas. O carrinho fica salvo neste navegador para esta conta e empresa.
          </p>
        </div>
      </aside>
    </div>

    {cartQuantity > 0 && !mobileCartOpen && <button type="button" onClick={() => setMobileCartOpen(true)}
      className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 flex h-12 items-center justify-between rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg xl:hidden"
      aria-label="Abrir carrinho de vendas">
      <span className="flex items-center gap-2"><ShoppingCart size={17} /> {cartQuantity} {cartQuantity === 1 ? "item" : "itens"}</span>
      <span>{formatCurrency(cartTotal)}</span>
    </button>}


    {mobileCartOpen&&<AdminDialog open onClose={()=>setMobileCartOpen(false)}
      title={"Carrinho de vendas ("+cartQuantity+")"}
      description="Confira quantidades e valores antes de continuar."
      className="w-[calc(100vw-1rem)] max-w-lg"
      bodyClassName="max-h-[min(67dvh,650px)] overflow-y-auto"
      footer={<div className="flex w-full flex-col gap-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Total estimado</span>
          <strong className="text-xl tabular-nums text-emerald-700 dark:text-emerald-400">{formatCurrency(cartTotal)}</strong>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {hasPermission("sales.proposals.manage")&&<AdminButton size="sm" variant="secondary"
            className="w-full justify-center" disabled={cart.length===0}
            onClick={()=>{setMobileCartOpen(false);setProposalIntent(true);}}>
            <ShoppingBag size={15}/> Criar proposta
          </AdminButton>}
          <AdminButton size="sm" className="w-full justify-center"
            disabled={!canSell||cart.length===0}
            onClick={()=>{setMobileCartOpen(false);setCheckoutIntent(true);}}>
            <CheckCircle2 size={15}/> Finalizar venda
          </AdminButton>
        </div>
      </div>}>
      <div className="divide-y divide-border">
        {cart.length===0
          ?<p className="py-8 text-center text-sm text-muted-foreground">Carrinho vazio. Escolha produtos na Vitrine.</p>
          :cart.map(line=><div key={line.product.product_id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold">{line.product.name}</p>
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{formatCurrency(line.product.price||0)} por unidade</p>
              <strong className="mt-1 block text-sm tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency((line.product.price||0)*line.quantity)}
              </strong>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label={"Diminuir "+line.product.name}
                className="flex h-10 w-9 items-center justify-center rounded-lg border border-border"
                onClick={()=>setQuantity(line.product.product_id,line.quantity-1)}>
                <Minus size={16}/>
              </button>
              <span className="w-9 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
              <button type="button" aria-label={"Aumentar "+line.product.name}
                className="flex h-10 w-9 items-center justify-center rounded-lg border border-border"
                onClick={()=>setQuantity(line.product.product_id,line.quantity+1)}
                disabled={line.quantity>=availableQuantity(line.product)}>
                <Plus size={16}/>
              </button>
              <button type="button" aria-label={"Remover "+line.product.name}
                className="flex h-10 w-9 items-center justify-center text-destructive"
                onClick={()=>setQuantity(line.product.product_id,0)}>
                <Trash2 size={16}/>
              </button>
            </div>
          </div>)}
      </div>
    </AdminDialog>}

    {selected && <SalesProductDetailsDialog
      key={selected.product_id}
      organizationId={organizationId}
      product={selected}
      cartQuantity={cartQuantities[selected.product_id]||0}
       cartQuantities={cartQuantities}
      canSell={canSell}
      onAdd={addProduct}
      onRemove={productId=>setQuantity(productId,0)}
      onSetCartQuantity={setQuantity}
      preparing={preparingProduct===selected.product_id}
      onClose={() => {
        preparingSeqRef.current++;
        setPreparingProduct(null);
        setSelected(null);
      }}
      relatedProducts={relatedQuery.data || []}
      relatedLoading={relatedQuery.isPending}
      relatedError={relatedQuery.isError}
    />}
    </>}
    </div>
  </div>;
}
