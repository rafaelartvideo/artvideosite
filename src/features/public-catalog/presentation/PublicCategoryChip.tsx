import type { LucideIcon } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { publicIcon } from "@/features/public-shell/domain/site-appearance";
import { MaterialSymbol, parseMaterialIcon } from "@/features/public-shell/presentation/MaterialSymbol";

export function PublicCategoryChip({
  name, icon, mediaId, fallbackIcon: FallbackIcon, active, onClick,
}: {
  name: string;
  icon?: string | null;
  mediaId?: string | null;
  fallbackIcon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  const { url } = useMediaUrl(mediaId);
  const Icon = icon ? publicIcon(icon) : FallbackIcon;

  return (
    <button type="button" onClick={onClick} aria-pressed={active} title={name}
      className="group flex min-w-max shrink-0 snap-start flex-col items-center gap-2 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)]">
      <span className={`flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-xl transition-colors ${active
        ? "bg-[#eef1ff] text-[var(--art-primary)]"
        : "bg-[#f5f5f5] text-[#273747] group-hover:bg-[#ededed]"}`}>
        {url ? (
          <img src={url} alt="" loading="lazy" className="h-12 w-12 object-contain" />
        ) : parseMaterialIcon(icon) ? (
          <MaterialSymbol icon={icon!} size={27} />
        ) : (
          <Icon size={26} strokeWidth={1.4} aria-hidden="true" />
        )}
      </span>
      <span className={`whitespace-nowrap text-[12px] font-medium leading-5 sm:text-[13px] ${active
        ? "text-[var(--art-primary)]"
        : "text-[#2d3a4a]"}`}>{name}</span>
    </button>
  );
}
