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

export function resolveDialogModalMode(isManaged, requestedModal) {
  return isManaged ? false : requestedModal;
}

export function dialogSizingClass(isAdminDialog) {
  return isAdminDialog
    ? "w-[calc(100%-2rem)] max-w-none"
    : "w-full max-w-[calc(100%-2rem)] sm:max-w-lg";
}

export function preventAdminDialogOutsideInteraction(event) {
  event.preventDefault();
}
