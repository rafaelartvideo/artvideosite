import type React from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminIconButton } from "./AdminLayout";

type AdminActiveStateButtonProps = {
  active: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  loading?: boolean;
  entityLabel?: string;
  className?: string;
  iconSize?: number;
};

export function AdminActiveStateButton({
  active,
  onClick,
  disabled,
  loading,
  entityLabel,
  className,
  iconSize = 15,
}: AdminActiveStateButtonProps) {
  const action = active ? "Inativar" : "Ativar";
  const label = entityLabel?.trim() ? `${action} ${entityLabel.trim()}` : action;

  return <AdminIconButton
    ariaLabel={label}
    title={label}
    variant="secondary"
    disabled={disabled}
    loading={loading}
    onClick={onClick}
    className={cn(
      active
        ? "border border-red-500/35 bg-card text-red-500 hover:border-red-500/55 hover:bg-red-500/10 hover:text-red-500"
        : "border border-emerald-500/35 bg-card text-emerald-500 hover:border-emerald-500/55 hover:bg-emerald-500/10 hover:text-emerald-500",
      className,
    )}
  >
    {active ? <Pause size={iconSize} /> : <Play size={iconSize} />}
  </AdminIconButton>;
}
