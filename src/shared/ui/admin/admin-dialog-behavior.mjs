export function setDialogMinimizedState(tasks, id, minimized) {
  return tasks.map(item => item.id === id ? { ...item, minimized } : item);
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
