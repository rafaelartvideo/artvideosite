/**
 * Evita que o navegador preencha cadastros e pesquisas do CRM ao abrir telas.
 *
 * Os campos começam com autocomplete="off" e recuperam as sugestões do
 * navegador somente por interação real (clique/toque, Tab ou digitação).
 * Não altera o value nem os dados preenchidos pela própria aplicação.
 * Abrange também campos criados depois, inclusive em modais com portal.
 */
type TextControl = HTMLInputElement | HTMLTextAreaElement;

const INPUT_SELECTOR = "input, textarea";
const IGNORED_INPUT_TYPES = new Set([
  "button", "checkbox", "color", "file", "hidden", "image",
  "radio", "range", "reset", "submit",
]);
const CRM_ROUTE = /^\/(?:admin|captura|editar-os-mobile|checklist-mobile)(?:\/|$)/;

let installed = false;

function inCrm(): boolean {
  return CRM_ROUTE.test(window.location.pathname);
}

function asTextControl(target: EventTarget | null): TextControl | null {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return null;
  if (target instanceof HTMLInputElement && IGNORED_INPUT_TYPES.has(target.type)) return null;
  if (target.disabled || target.readOnly) return null;
  return target;
}

export function installCrmAutofillPolicy(): void {
  if (installed || typeof document === "undefined" || typeof window === "undefined") return;
  installed = true;

  const originalHints = new WeakMap<TextControl, string | null>();
  const userActivated = new WeakSet<TextControl>();
  let keyboardTabDown = false;

  function protect(control: TextControl): void {
    if (!inCrm() || !asTextControl(control) || userActivated.has(control)) return;

    const current = control.getAttribute("autocomplete");
    if (!originalHints.has(control) || (current !== null && current !== "off")) {
      originalHints.set(control, current);
    }
    if (current !== "off") control.setAttribute("autocomplete", "off");
  }

  function activate(control: TextControl | null): void {
    if (!inCrm() || !control) return;
    if (!originalHints.has(control)) originalHints.set(control, control.getAttribute("autocomplete"));
    userActivated.add(control);

    const previous = originalHints.get(control);
    const suggestionHint = previous && previous !== "off" ? previous : "on";
    if (control.getAttribute("autocomplete") !== suggestionHint) {
      control.setAttribute("autocomplete", suggestionHint);
    }
  }

  function protectTree(node: Element): void {
    if (node.matches(INPUT_SELECTOR)) {
      const control = asTextControl(node);
      if (control) protect(control);
    }
    node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(INPUT_SELECTOR).forEach(protect);
  }

  // Registrado antes do primeiro render do React, para impedir autofill na
  // criação dos campos em qualquer tela administrativa.
  protectTree(document.documentElement);
  const observer = new MutationObserver(records => {
    if (!inCrm()) return;
    for (const record of records) {
      if (record.type === "attributes") {
        const control = asTextControl(record.target);
        if (control) {
          if (userActivated.has(control)) {
            const hint = control.getAttribute("autocomplete");
            if (hint && hint !== "on" && hint !== "off") originalHints.set(control, hint);
          } else {
            protect(control);
          }
        }
        continue;
      }
      for (const added of record.addedNodes) {
        if (added instanceof Element) protectTree(added);
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["autocomplete"],
  });

  document.addEventListener("pointerdown", event => {
    if (!inCrm()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const control = asTextControl(target)
      ?? asTextControl(target.closest("label")?.control ?? null);
    activate(control);
  }, true);

  document.addEventListener("keydown", event => {
    if (!inCrm()) return;
    if (event.key === "Tab") {
      keyboardTabDown = true;
      return;
    }
    // Campo que recebeu foco programaticamente só libera o autocomplete quando
    // a pessoa efetivamente começa a interagir com o teclado.
    activate(asTextControl(event.target));
  }, true);
  document.addEventListener("keyup", event => {
    if (event.key === "Tab") keyboardTabDown = false;
  }, true);

  document.addEventListener("focusin", event => {
    if (keyboardTabDown) activate(asTextControl(event.target));
  }, true);

  document.addEventListener("focusout", event => {
    const control = asTextControl(event.target);
    if (!control || !userActivated.has(control)) return;
    userActivated.delete(control);
    protect(control);
  });
}
