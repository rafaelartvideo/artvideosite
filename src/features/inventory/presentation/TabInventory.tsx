import { TabProducts } from "@/features/products/presentation/TabProducts";
import { TabInventory as TabInventoryV2 } from "./TabInventoryV2";
import { InventoryMovementFinancePage } from "./InventoryMovementFinancePage";

type TabInventoryProps = {
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

export function TabInventory(props: TabInventoryProps) {
  if (props.routeResourceId && props.routeSubpage === "move" && props.onRouteChange) {
    return <InventoryMovementFinancePage
      itemId={props.routeResourceId}
      onClose={() => props.onRouteChange?.(null, null)}
    />;
  }

  if (props.routeResourceId && props.routeSubpage === "history") {
    return <TabInventoryV2 {...props} />;
  }

  return <TabProducts
    routeResourceId={props.routeResourceId}
    routeSubpage={props.routeSubpage}
    onRouteChange={props.onRouteChange}
  />;
}
