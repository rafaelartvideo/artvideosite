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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={name}
      className={`group inline-flex h-[54px] min-w-max shrink-0 snap-start items-center gap-3 rounded-xl border px-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] sm:snap-normal ${active
        ? "border-[var(--art-primary)] bg-[#edf3ff] text-[var(--art-primary)]"
        : "border-[#e2e8f0] bg-[#f8fafc] text-[#293d54] hover:border-[#b9cbed] hover:bg-[#f0f5ff]"}`}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded-md object-contain" />
      ) : (
        parseMaterialIcon(icon) ? <MaterialSymbol icon={icon!} size={23} className="shrink-0" />
          : <Icon size={23} strokeWidth={1.7} aria-hidden="true" className="shrink-0" />
      )}
      <span className="whitespace-nowrap text-[13px] font-semibold leading-5 sm:text-[14px]">{name}</span>
    </button>
  );
}
