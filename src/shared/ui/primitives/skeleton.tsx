import { cn } from "./utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md bg-neutral-200 animate-pulse dark:bg-neutral-700 motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Skeleton };

