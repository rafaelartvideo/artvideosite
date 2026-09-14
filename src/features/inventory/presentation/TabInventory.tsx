import type { ComponentProps } from "react";
import { TabInventory as InventoryModule } from "./TabInventoryV2";
import { InventoryOverview } from "./InventoryOverview";

type Props = ComponentProps<typeof InventoryModule>;

export function TabInventory(props: Props) {
  if (props.routeResourceId) return <InventoryModule {...props} />;
  return <div className="space-y-5">
    <InventoryOverview />
    <InventoryModule {...props} />
  </div>;
}
