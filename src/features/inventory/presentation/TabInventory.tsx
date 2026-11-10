import { TabProducts } from "@/features/products/presentation/TabProducts";

type TabInventoryProps = {
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

/** O estoque utiliza a listagem única; movimentação e histórico são estados do modal do produto. */
export function TabInventory(props: TabInventoryProps) {
  return <TabProducts
    routeResourceId={props.routeResourceId}
    routeSubpage={props.routeSubpage}
    onRouteChange={props.onRouteChange}
  />;
}
