import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, List, ListOrdered, Heading3, Link2, RemoveFormatting, Undo2, Redo2 } from "lucide-react";

// A small allowlist is shared by the editor, paste handler and public rendering.
// No imported styles, event handlers, scripts, media or unsafe URLs reach the site.
const tags = new Set(["p","br","strong","em","u","ul","ol","li","blockquote","h3","a"]);
const discarded = new Set(["script","style","iframe","object","embed","svg","math","form","input","button","textarea","select","noscript","template","head"]);
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeLink = (href: string) => {
  try {
    const url = new URL(href);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? href : "";
  } catch { return ""; }
};

export function richTextPlain(value: string = ""): string {
  if (typeof document !== "undefined") {
    const box = document.createElement("div");
    box.innerHTML = sanitizeRichText(value);
    return box.textContent?.trim() || "";
  }
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim();
}

export function sanitizeRichText(value: string = ""): string {
  if (!value) return "";
  if (typeof DOMParser === "undefined") return escape(value).replace(/\r?\n/g, "<br>");
  // Plain text from legacy fields stays plain, with its existing line breaks.
  if (!/<\/?[a-z][^>]*>/i.test(value)) return escape(value).replace(/\r?\n/g, "<br>");
  const doc = new DOMParser().parseFromString(value, "text/html");
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return escape(node.textContent || "");
    if (node.nodeType !== 1) return "";
    const element = node as Element;
    const name = element.tagName.toLowerCase();
    if (discarded.has(name)) return "";
    const children = Array.from(element.childNodes).map(walk).join("");
    if (name === "br") return "<br>";
    const normalized = name === "b" ? "strong" : name === "i" ? "em" : /^h[1-6]$/.test(name) ? "h3" : name;
    let content = children;
    // Google Docs/Word often paste bold and italic as spans with inline styles.
    if (name === "span" || name === "font") {
      const style = element.getAttribute("style") || "";
      if (/font-weight\s*:\s*(?:bold|[6-9]00)/i.test(style)) content = "<strong>" + content + "</strong>";
      if (/font-style\s*:\s*italic/i.test(style)) content = "<em>" + content + "</em>";
      if (/text-decoration(?:-line)?\s*:[^;]*underline/i.test(style)) content = "<u>" + content + "</u>";
    }
    if (!tags.has(normalized)) return content;
    if (normalized === "a") {
      const href = safeLink(element.getAttribute("href") || "");
      return href ? '<a href="' + escape(href) + '" target="_blank" rel="noopener noreferrer">' + content + "</a>" : content;
    }
    return "<" + normalized + ">" + content + "</" + normalized + ">";
  };
  return Array.from(doc.body.childNodes).map(walk).join("");
}

const richClasses = [
  "whitespace-pre-wrap break-words",
  "[&_p+p]:mt-2 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-3",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-1 [&_strong]:font-bold [&_b]:font-bold [&_h3]:my-3 [&_h3]:font-semibold",
  "[&_a]:text-[var(--art-primary)] [&_a]:underline",
].join(" ");

export function RichTextContent({ value, className = "" }: { value: string; className?: string }) {
  return <div className={richClasses + " " + className} dangerouslySetInnerHTML={{ __html: sanitizeRichText(value || "") }} />;
}

type Props = {
  label: string; value: string; onChange: (value: string) => void;
  disabled?: boolean; minHeight?: number; placeholder?: string;
};
export function RichTextEditor({ label, value, onChange, disabled = false, minHeight = 110, placeholder = "Digite ou cole seu texto..." }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState("");
  const selection = useRef<Range | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const html = sanitizeRichText(value || "");
    if (sanitizeRichText(el.innerHTML) !== html) el.innerHTML = html;
  }, [value]);
  const emit = () => {
    if (root.current) onChange(sanitizeRichText(root.current.innerHTML));
  };
  const command = (cmd: string, argument?: string) => {
    if (disabled) return;
    root.current?.focus();
    document.execCommand(cmd, false, argument);
    emit();
  };
  const insert = (html: string) => {
    const el = root.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) {
      el.insertAdjacentHTML("beforeend", html);
    } else {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(html);
      const last = fragment.lastChild;
      range.insertNode(fragment);
      if (last) { range.setStartAfter(last); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
    }
    emit();
  };
  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const plain = event.clipboardData.getData("text/plain");
    insert(sanitizeRichText(html || plain));
  };
  const beginLink = () => {
    if (disabled) return;
    const sel = window.getSelection();
    selection.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    setLinkOpen(true);
  };
  const applyLink = () => {
    const href = safeLink(url.trim());
    if (!href) return;
    root.current?.focus();
    const sel = window.getSelection();
    if (sel && selection.current) { sel.removeAllRanges(); sel.addRange(selection.current); }
    command("createLink", href);
    setLinkOpen(false); setUrl(""); selection.current = null;
  };
  const actions = [
    {name:"Negrito",icon:Bold,cmd:"bold"},
    {name:"Itálico",icon:Italic,cmd:"italic"},
    {name:"Sublinhado",icon:Underline,cmd:"underline"},
    {name:"Lista com marcadores",icon:List,cmd:"insertUnorderedList"},
    {name:"Lista numerada",icon:ListOrdered,cmd:"insertOrderedList"},
    {name:"Subtítulo",icon:Heading3,cmd:"formatBlock",arg:"h3"},
    {name:"Desfazer",icon:Undo2,cmd:"undo"},
    {name:"Refazer",icon:Redo2,cmd:"redo"},
    {name:"Limpar formatação",icon:RemoveFormatting,cmd:"removeFormat"},
  ];
  return <div className="min-w-0 space-y-1.5">
    <label className="block text-xs font-semibold text-foreground">{label}</label>
    <div className="overflow-hidden rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
      <div role="toolbar" aria-label={"Formatação de " + label} className="flex flex-wrap gap-0.5 border-b border-border bg-muted/30 p-1.5">
        {actions.map(({name,icon:Icon,cmd,arg})=><button key={cmd} type="button" disabled={disabled} aria-label={name} title={name} onMouseDown={e=>e.preventDefault()} onClick={()=>command(cmd,arg)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"><Icon size={16}/></button>)}
        <button type="button" disabled={disabled} aria-label="Inserir link" title="Inserir link" onMouseDown={e=>e.preventDefault()} onClick={beginLink} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-40"><Link2 size={16}/></button>
      </div>
      {linkOpen && <div className="flex gap-2 border-b border-border p-2"><input aria-label="Endereço do link" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs" placeholder="https://..." value={url} onChange={e=>setUrl(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();applyLink();}}}/><button type="button" disabled={!safeLink(url.trim())} onClick={applyLink} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50">Aplicar</button><button type="button" onClick={()=>setLinkOpen(false)} className="px-2 text-xs">Cancelar</button></div>}
      <div ref={root} role="textbox" aria-label={label} aria-multiline="true" contentEditable={!disabled} suppressContentEditableWarning onPaste={onPaste} onInput={emit} onBlur={emit} data-placeholder={placeholder}
        className={richClasses + " min-h-[110px] max-h-96 overflow-y-auto px-3 py-3 text-sm leading-6 text-foreground outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]"}
        style={{minHeight}} />
    </div>
    <p className="text-[11px] text-muted-foreground">Aceita texto do Word, Google Docs e sites, mantendo negrito, listas e links seguros.</p>
  </div>;
}
