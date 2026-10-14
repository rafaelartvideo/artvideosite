import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

type Props = {
  children: ReactNode;
  onOpen?: () => void;
  label?: string;
  className?: string;
};

// Células clicáveis sem interferir nos botões de editar/inativar existentes.
export function FinanceTableRow({ children, onOpen, label, className }: Props) {
  const isAction = (target: EventTarget | null) =>
    target instanceof Element && Boolean(target.closest("button, a, input, select, textarea, [role=menuitem]"));
  const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if (onOpen && !isAction(event.target)) onOpen();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (!onOpen || event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  return <tr className={className} role={onOpen ? "button" : undefined}
    aria-label={onOpen ? label : undefined} tabIndex={onOpen ? 0 : undefined}
    onClick={handleClick} onKeyDown={handleKeyDown}
    style={onOpen ? { cursor: "pointer" } : undefined}>{children}</tr>;
}
