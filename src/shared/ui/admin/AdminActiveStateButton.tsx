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
        ? "border-red-200 bg-white text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        : "border-emerald-200 bg-white text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700",
      className,
    )}
  >
    {active ? <Pause size={iconSize} /> : <Play size={iconSize} />}
  </AdminIconButton>;
}
