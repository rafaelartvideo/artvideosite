import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";

const read=path=>readFileSync(path,"utf8");

test("Vitrine e detalhes têm TSX válido com carregamento antecipado e localização",async()=>{
  const files=[
    "src/features/sales/presentation/TabSales.tsx",
    "src/features/sales/presentation/SalesProductDetailsDialog.tsx",
    "src/features/products/presentation/CompatibleProductCarousel.tsx",
    "src/features/products/presentation/InventoryProductDetailsDialog.tsx",
    "src/shared/ui/admin/AdminMedia.tsx",
  ];
  for(const path of files){
    const source=read(path);
    const result=await transformWithEsbuild(source,path,{loader:"tsx"});
    assert.ok(result.code.length>350,path);
  }
  const vitrine=read(files[0]);
  assert.match(vitrine,/preparing=\{preparingProduct===selected\.product_id\}/);
  const dialog=read("src/features/sales/presentation/SalesProductDetailsDialog.tsx");
  assert.match(dialog,/Preparando produto/);
  assert.match(dialog,/min-h-\[300px\]/);
  assert.doesNotMatch(vitrine,/fixed inset-0 z-\[90\]/);
  assert.match(vitrine,/queryClient\.fetchQuery/);
  assert.match(vitrine,/queryKeys\.publicSite\.media/);
  assert.match(vitrine,/getSalesProductDetails\(organizationId,product\.product_id\)/);
  assert.match(vitrine,/searchSalesCatalog\(organizationId,/);
  assert.match(vitrine,/loadSalesCatalogCategories/);
  assert.match(vitrine,/categoriesRef/);
  assert.match(vitrine,/onRemove=\{productId=>setQuantity\(productId,0\)\}/);
  assert.match(vitrine,/<TopTableScrollbar\/>/);
  assert.match(vitrine,/min-w-\[750px\]/);
});

test("Detalhes têm características em três colunas sem linhas de separação ou descrição",()=>{
  const modal=read("src/features/sales/presentation/SalesProductDetailsDialog.tsx");
  assert.match(modal,/grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3/);
  assert.doesNotMatch(modal,/border-t border-border/);
  assert.doesNotMatch(modal,/>\s*Descrição\s*</);
  assert.match(modal,/stock_location/);
  assert.match(modal,/Localização no estoque/);
  assert.match(modal,/Produtos Relacionados/);
  assert.match(modal,/cartQuantity>0/);
  assert.match(modal,/onSetCartQuantity/);
  assert.match(modal,/AdminIconButton/);
  assert.match(modal,/variant="quaternary"/);
  assert.match(modal,/aria-label="Categoria, marca e condição"/);
  assert.match(modal,/bg-muted\/20 px-3 py-2\.5/);
  assert.match(modal,/<Trash2 size=\{17\}/);
  assert.match(modal,/text-emerald-700 dark:text-emerald-400/);
  assert.match(modal,/text-primary/);
  const related=read("src/features/products/presentation/CompatibleProductCarousel.tsx");
  assert.match(related,/stockLocation/);
  assert.match(related,/PopoverTrigger/);
  assert.match(related,/MapPin size=\{14\}/);
  assert.match(related,/salesAppearance/);
  assert.match(related,/itens"/);
  const vitrine=read("src/features/sales/presentation/TabSales.tsx");
  assert.match(vitrine,/AdminCard square/);
  for(const code of [vitrine,read("src/features/sales/presentation/SalesOrdersPage.tsx"),read("src/features/sales/presentation/SalesProposalsPage.tsx")]){
    assert.match(code,/AdminSearchSortMenu/);
  }
});

test("40 imagens demonstrativas têm fallback restrito a SKUs de homologação",()=>{
  const helper=read("src/shared/domain/catalog-homologation-image.ts");
  assert.match(helper,/HML26/);
  assert.match(helper,/homolog-sales/);
  const card=read("src/shared/ui/admin/AdminMedia.tsx");
  assert.match(card,/salesHomologationImage\(sku\)/);
  const sales=read("src/features/sales/presentation/TabSales.tsx");
  assert.match(sales,/salesHomologationImage\(sku\)/);
  const detail=read("src/features/products/presentation/InventoryProductDetailsDialog.tsx");
  assert.match(detail,/salesHomologationImage\(product\?\.sku\)/);
});

test("Semente exclusivamente Teste cria categorias, marcas, 40 produtos, relações e modelos",()=>{
  const migration=read("supabase/migrations/20261108242000_sales_test_40_homologation_products.sql");
  assert.match(migration,/5bcd7ec7-38f0-4dda-a84c-10429bd46b23/);
  assert.match(migration,/is distinct from 'Teste'/);
  assert.match(migration,/public\.product_categories/);
  assert.match(migration,/public\.brands/);
  assert.match(migration,/public\.product_variation_links/);
  assert.match(migration,/public\.product_similar_links/);
  assert.match(migration,/public\.product_related_codes/);
  assert.match(migration,/public\.product_device_compatible_models/);
  const rows=migration.match(/\(\d+,\d+,'HML26-\d{2}'/g)||[];
  assert.equal(rows.length,40);
  const stock=read("supabase/migrations/20261108242500_sales_test_stock_locations_after_product_sync.sql");
  assert.match(stock,/public\.inventory_items/);
  assert.match(stock,/storage_shelf/);
  assert.match(stock,/storage_level/);
  assert.match(stock,/storage_compartment/);
  assert.match(stock,/v_count<>40/);
});

test("Catálogo pagina e filtra antes de buscar imagens ou listar itens relacionados",()=>{
  const sql=read("supabase/migrations/20261108241000_sales_catalog_details_categories_locations.sql");
  assert.match(sql,/search_sales_catalog_v2/);
  assert.match(sql,/get_sales_catalog_categories_v1/);
  assert.match(sql,/p_category_id is null or p.category_id=p_category_id/);
  assert.match(sql,/public\.sales_stock_reservations/);
  assert.match(sql,/list_sales_product_relations_v2/);
  assert.match(sql,/storage_shelf/);
  assert.match(sql,/private\.has_tenant_module_permission\(p_organization_id,'sales','sales\.view'\)/);
});
