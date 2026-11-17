export function setDialogMinimizedState(tasks, id, minimized) {
  return tasks.map(item => {
    if (item.id === id) return { ...item, minimized };
    if (!minimized && !item.minimized) return { ...item, minimized: true };
    return item;
  });
}

export function resolveAdminBrowserBottomInset(measuredInset, isMobile) {
  const normalized = Math.max(0, Math.round(Number(measuredInset) || 0));
  return isMobile ? Math.max(64, normalized) : normalized;
}

export function resolveDialogModalMode(_isManaged, requestedModal) {
  // Um modal restaurado conserva a mesma modalidade da primeira abertura.
  // O Radix faz o bloqueio de scroll, a camada escura e o focus trap.
  // Enquanto minimizado, a raiz fica fechada (ver primitives/dialog.tsx).
  return requestedModal;
}

export function dialogSizingClass(isAdminDialog) {
  return isAdminDialog
    ? "w-[calc(100%-2rem)] max-w-none"
    : "w-full max-w-[calc(100%-2rem)] sm:max-w-lg";
}

export function preventAdminDialogOutsideInteraction(event) {
  event.preventDefault();
}

export function clampAdminDialogPosition({ left, top, width, height, viewportWidth, viewportHeight, topInset = 72, gap = 8 }) {
  const minTop = Math.min(topInset, Math.max(gap, viewportHeight - height - gap));
  return {
    left: Math.max(gap, Math.min(left, Math.max(gap, viewportWidth - width - gap))),
    top: Math.max(minTop, Math.min(top, Math.max(minTop, viewportHeight - height - gap))),
  };
}

export function activateAdminFloatingDialog(node) {
  for (const dialog of node.ownerDocument.querySelectorAll('[data-admin-dialog-floating="true"]')) {
    // Keep ordinary dialogs at z-150 above parked windows and preserve their overlays.
    dialog.style.zIndex = dialog === node ? "150" : "149";
  }
}

