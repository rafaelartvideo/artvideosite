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
  return <TabInventoryV2 {...props} />;
}
