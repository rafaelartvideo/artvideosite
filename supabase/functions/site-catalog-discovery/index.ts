import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.112.3/cors";

// Limited, public HTML discovery. Never retrieves authenticated content or copies media files.
const headers = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const agent = "ArtvideoCatalogImporter/1.0";
const blocked = /\/(admin|login|signin|logout|account|conta|checkout|cart|carrinho|pagamento|api|auth|wp-admin|painel)(\/|$)/i;
const ext = /\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|mp4|mp3|css|js|woff|ico)(\?|$)/i;
const serviceTerms = /servi[cç]o|assist[eê]ncia|manuten[cç][aã]o|instala[cç][aã]o|conserto|reparo|suporte|revis[aã]o|montagem|limpeza|t[eé]cnico|solu[cç][aã]o/i;
const productTerms = /produto|equipamento|comprar|loja|shop|product|cat[aá]logo|pe[cç]a/i;
type Kind = "service" | "product" | "page";
type FAQ = { question: string; answer: string };
type Found = { id: string; type: Kind; title: string; summary: string; category: string; sourceUrl: string; faqs: FAQ[]; price: number | null; imageUrl: string | null };

function publicUrl(raw: string, host?: string) {
  const url = new URL(raw);
  const h = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!["http:", "https:"].includes(url.protocol) || !h.includes(".") || url.username || url.password || url.port && !["80", "443"].includes(url.port)) throw new Error("Endereço inválido.");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":") || /(^|\.)(local|localhost|internal|test|invalid|onion)$/.test(h)) throw new Error("Endereços de rede interna não são permitidos.");
  if (host && h !== host) throw new Error("O endereço sai do site escolhido.");
  url.hash = "";
  return url;
}
function privateIP(ip: string) {
  if (ip.includes(":")) { const s = ip.toLowerCase(); return s === "::" || s === "::1" || /^(fc|fd|fe[89ab]|::ffff:)/.test(s); }
  const n = ip.split(".").map(Number);
  if (n.length !== 4 || n.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return true;
  return n[0] === 0 || n[0] === 10 || n[0] === 127 || n[0] >= 224 || n[0] === 169 && n[1] === 254 ||
    n[0] === 172 && n[1] >= 16 && n[1] <= 31 || n[0] === 192 && (n[1] === 168 || n[1] === 0 && n[2] === 0) ||
    n[0] === 100 && n[1] >= 64 && n[1] <= 127 || n[0] === 198 && (n[1] === 18 || n[1] === 19);
}
async function validateDNS(host: string) {
  const values: string[] = [];
  for (const [type, code] of [["A", 1], ["AAAA", 28]] as const) {
    const response = await fetch("https://cloudflare-dns.com/dns-query?name=" + encodeURIComponent(host) + "&type=" + type, { headers: { Accept: "application/dns-json" }, redirect: "error", signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw Error("Falha ao validar o domínio.");
    const data = await response.json();
    for (const record of data.Answer || []) if (record.type === code) values.push(String(record.data));
  }
  if (!values.length || values.some(privateIP)) throw Error("O endereço não aponta para um servidor público válido.");
}
async function load(url: URL, host: string, kind: "html" | "txt" | "xml", limit = 450000): Promise<string | null> {
  let next = publicUrl(url.href, host);
  for (let i = 0; i < 3; i++) {
    const response = await fetch(next.href, { redirect: "manual", signal: AbortSignal.timeout(6500), headers: { "User-Agent": agent, Accept: kind === "html" ? "text/html" : kind === "xml" ? "application/xml,text/xml" : "text/plain" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      const target = publicUrl(new URL(location, next).href, host);
      if (target.protocol !== next.protocol) return null;
      next = target; continue;
    }
    if (!response.ok || kind === "html" && !/html/i.test(response.headers.get("content-type") || "") ||
      kind === "xml" && !/xml|text\/plain/i.test(response.headers.get("content-type") || "")) return null;
    if (Number(response.headers.get("content-length") || "0") > limit || !response.body) return null;
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      parts.push(chunk.value);
    }
    const data = new Uint8Array(size);
    let pos = 0;
    for (const part of parts) { data.set(part, pos); pos += part.length; }
    return new TextDecoder().decode(data);
  }
  return null;
}
const clean = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim();
function attr(tag: string, wanted: string) {
  const regex = new RegExp("(?:^|\\s)" + wanted + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
  const m = tag.match(regex);
  return m ? m[1] ?? m[2] ?? m[3] : "";
}
function meta(html: string, name: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if ((attr(tag, "name") || attr(tag, "property")).toLowerCase() === name) return clean(attr(tag, "content"));
  }
  return "";
}
function tagText(html: string, name: string) {
  const re = new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)<\\/" + name + ">", "i");
  return clean(html.match(re)?.[1] || "");
}
function structured(html: string): Record<string, any>[] {
  const nodes: Record<string, any>[] = [];
  const visit = (raw: any, depth = 0) => {
    if (!raw || depth > 4) return;
    if (Array.isArray(raw)) return raw.slice(0, 80).forEach(v => visit(v, depth + 1));
    if (typeof raw !== "object") return;
    if (raw["@type"]) nodes.push(raw);
    visit(raw["@graph"], depth + 1);
    visit(raw.itemListElement, depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1])); } catch { /* Some publishers embed invalid schema */ }
  }
  return nodes;
}
function value(raw: any): string { return typeof raw === "string" ? clean(raw).slice(0, 400) : typeof raw?.name === "string" ? clean(raw.name).slice(0, 400) : ""; }
function parse(html: string, url: URL, types: Set<Kind>): Found | null {
  const nodes = structured(html);
  const data = nodes.find(n => /Service|Product/i.test(String(n["@type"] || "")));
  const title = (value(data?.name) || tagText(html, "h1") || meta(html, "og:title") || tagText(html, "title")).replace(/\s+[|–—]\s+.{4,}$/, "").slice(0, 150);
  if (title.length < 4) return null;
  const hint = url.pathname + " " + title;
  const isIndex = url.pathname.split("/").filter(Boolean).length === 0 || /^(serviços|servicos|nossos serviços|produtos|loja|início|inicio|home|quem somos|soluções|solucoes)$/i.test(title.trim());
  const type: Kind = /Product/i.test(String(data?.["@type"] || "")) ? "product" : /Service/i.test(String(data?.["@type"] || "")) ? "service" : isIndex ? "page" : serviceTerms.test(hint) ? "service" : productTerms.test(hint) ? "product" : "page";
  if (!types.has(type)) return null;
  const breadcrumb = nodes.find(n => /BreadcrumbList/i.test(String(n["@type"] || "")));
  const crumbs = Array.isArray(breadcrumb?.itemListElement) ? breadcrumb.itemListElement : [];
  const category = crumbs.length > 1 ? value(crumbs[crumbs.length - 2]?.name || crumbs[crumbs.length - 2]?.item) : "";
  const faqs: FAQ[] = [];
  for (const node of nodes.filter(n => /FAQPage/i.test(String(n["@type"] || "")))) {
    for (const q of (Array.isArray(node.mainEntity) ? node.mainEntity : [node.mainEntity])) {
      if (q?.name && q?.acceptedAnswer?.text) faqs.push({ question: value(q.name).slice(0, 160), answer: value(q.acceptedAnswer.text).slice(0, 300) });
    }
  }
  const price = Number(data?.offers?.price);
  let imageUrl: string | null = null;
  try { const image = new URL(typeof data?.image === "string" ? data.image : meta(html, "og:image"), url); if (image.protocol === "https:") imageUrl = image.href; } catch { /* No image */ }
  return { id: url.href, type, title, summary: (value(data?.description) || meta(html, "description") || meta(html, "og:description") || tagText(html, "p")).slice(0, 290), category, sourceUrl: url.href, faqs: faqs.slice(0, 10), price: Number.isFinite(price) && price > 0 ? price : null, imageUrl };
}
function rules(text: string) {
  const disallowed: string[] = [], allowed: string[] = [], sitemap: string[] = [];
  let applies = false;
  for (const line of text.split(/\r?\n/)) {
    const m = line.split("#")[0].trim().match(/^([a-z-]+):\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2];
    if (key === "user-agent") applies = val === "*" || val.toLowerCase().includes("artvideocatalogimporter");
    if (key === "sitemap" && val) sitemap.push(val);
    if (applies && key === "disallow" && val) disallowed.push(val);
    if (applies && key === "allow" && val) allowed.push(val);
  }
  return { disallowed, allowed, sitemap };
}
function permitted(path: string, r: ReturnType<typeof rules>) {
  const starts = (pattern: string) => path.startsWith(pattern.split("*")[0]);
  const deny = r.disallowed.filter(starts).sort((a, b) => b.length - a.length)[0];
  if (!deny) return true;
  const allow = r.allowed.filter(starts).sort((a, b) => b.length - a.length)[0];
  return !!allow && allow.length >= deny.length;
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return respond({ error: "Método inválido." }, 405);
  try {
    const urlEnv = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY");
    if (!urlEnv || !anon) return respond({ error: "Servidor não configurado." }, 500);
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return respond({ error: "Faça login na Union World." }, 401);
    const client = createClient(urlEnv, anon, { auth: { persistSession: false }, global: { headers: { Authorization: "Bearer " + token } } });
    const { data: auth, error: authError } = await client.auth.getUser(token);
    if (authError || !auth.user) return respond({ error: "Sessão inválida." }, 401);
    const body = await req.json();
    if (typeof body.organizationId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.organizationId)) return respond({ error: "Empresa inválida." }, 400);
    const { data: permissions, error: permissionError } = await client.rpc("my_organization_permissions", { p_organization_id: body.organizationId });
    if (permissionError || !Array.isArray(permissions) || !permissions.some((p: { permission_key?: string } | string) => ["services.create", "products.create", "inventory.create"].includes(typeof p === "string" ? p : p.permission_key || ""))) return respond({ error: "Sem permissão para importar nesta empresa." }, 403);
    const root = publicUrl(String(body.url || ""));
    await validateDNS(root.hostname);
    const maxPages = Math.min(24, Math.max(1, Number(body.maxPages) || 16));
    const types = new Set<Kind>((Array.isArray(body.types) ? body.types : ["service", "product"]).filter((x: string) => ["service", "product", "page"].includes(x)));
    if (!types.size) return respond({ error: "Selecione o tipo de conteúdo." }, 400);
    const robots = await load(new URL("/robots.txt", root), root.hostname, "txt", 120000);
    const r = rules(robots || "");
    const queue: { url: URL; score: number }[] = [];
    const pending = new Set<string>(), seen = new Set<string>();
    const items: Found[] = [], warnings: string[] = [];
    let blockedCount = 0, visited = 0;
    const deadline = Date.now() + 45000;
    function enqueue(url: URL, score: number) {
      if (url.hostname !== root.hostname || url.protocol !== root.protocol || seen.has(url.href) || pending.has(url.href) || blocked.test(url.pathname) || ext.test(url.pathname)) return;
      if (!permitted(url.pathname + url.search, r)) { blockedCount += 1; return; }
      pending.add(url.href); queue.push({ url, score });
    }
    enqueue(root, 1000);
    for (const raw of [new URL("/sitemap.xml", root).href, ...r.sitemap.slice(0, 2)]) {
      try {
        const xml = await load(publicUrl(raw, root.hostname), root.hostname, "xml", 175000);
        if (xml) for (const m of [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].slice(0, 150)) {
          try {
            const u = publicUrl(clean(m[1]), root.hostname);
            u.search = ""; enqueue(u, serviceTerms.test(u.pathname) || productTerms.test(u.pathname) ? 75 : 2);
          } catch { /* Ignore external links */ }
        }
      } catch { /* Optional sitemap */ }
    }
    while (queue.length && visited < maxPages && Date.now() < deadline) {
      queue.sort((a, b) => b.score - a.score);
      const next = queue.shift()!;
      if (seen.has(next.url.href)) continue;
      seen.add(next.url.href);
      let html: string | null = null;
      try { html = await load(next.url, root.hostname, "html"); } catch { /* Timeout or blocked */ }
      visited += 1;
      if (!html) { blockedCount += 1; continue; }
      const item = parse(html, next.url, types);
      if (item) items.push(item);
      for (const match of html.match(/<a\b[^>]*>/gi) || []) {
        const href = attr(match, "href");
        if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
        try {
          const u = publicUrl(new URL(href, next.url).href, root.hostname);
          u.search = "";
          enqueue(u, (serviceTerms.test(u.pathname) || productTerms.test(u.pathname) ? 30 : 0) + Math.max(0, 6 - u.pathname.split("/").length));
        } catch { /* Outside the selected domain */ }
      }
    }
    if (queue.length) warnings.push("A leitura foi limitada por tempo ou quantidade de páginas. Escolha uma seção específica ou aumente o limite para descobrir mais.");
    if (!items.length && visited) warnings.push("Este site pode exigir JavaScript ou não ter páginas de catálogo identificáveis.");
    return respond({ items: items.slice(0, 100), pagesVisited: visited, blocked: blockedCount, warnings });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Erro desconhecido.";
    return respond({ error: /timed?out/i.test(message) ? "O site não respondeu a tempo." : message }, 400);
  }
});
