import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });

function publicKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    return keys.default || Object.values(keys)[0] || "";
  } catch {
    return "";
  }
}

function textValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCosmos(item: any) {
  const gtin = textValue(item?.gtin);
  const avgPrice = numberValue(item?.avg_price);
  const minPrice = numberValue(item?.min_price);
  const maxPrice = numberValue(item?.max_price);
  const images = [item?.thumbnail, item?.picture, item?.image]
    .filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value));
  return {
    provider: "cosmos",
    external_id: gtin,
    name: textValue(item?.description) || "Produto",
    description: textValue(item?.full_description) || textValue(item?.description),
    gtin,
    brand: textValue(item?.brand?.name),
    model: textValue(item?.model),
    manufacturer_code: textValue(item?.manufacturer_code),
    category_name: textValue(item?.gpc?.description),
    category_code: textValue(item?.gpc?.code),
    ncm: textValue(item?.ncm?.code),
    gross_weight_grams: numberValue(item?.gross_weight),
    net_weight_grams: numberValue(item?.net_weight),
    width_mm: numberValue(item?.width),
    height_mm: numberValue(item?.height),
    length_mm: numberValue(item?.length),
    reference_price: avgPrice,
    min_price: minPrice,
    max_price: maxPrice,
    currency: avgPrice != null ? "BRL" : null,
    images: Array.from(new Set(images)),
    source_url: gtin ? `https://api.cosmos.bluesoft.com.br/produtos/${encodeURIComponent(gtin)}` : null,
  };
}

function normalizeUpc(item: any) {
  const gtin = textValue(item?.gtin) || textValue(item?.ean) || textValue(item?.upc);
  const images = Array.isArray(item?.images)
    ? item.images.filter((value: unknown): value is string => typeof value === "string" && /^https?:\/\//i.test(value))
    : [];
  const offers = Array.isArray(item?.offers) ? item.offers : [];
  const currencies = offers.map((offer: any) => textValue(offer?.currency)).filter(Boolean);
  const currency = textValue(item?.currency) || (currencies.length === 1 ? currencies[0] : null);
  return {
    provider: "upcitemdb",
    external_id: gtin,
    name: textValue(item?.title) || textValue(item?.description) || "Produto",
    description: textValue(item?.description),
    gtin,
    brand: textValue(item?.brand),
    model: textValue(item?.model),
    manufacturer_code: textValue(item?.model),
    category_name: textValue(item?.category),
    category_code: null,
    ncm: null,
    gross_weight_grams: null,
    net_weight_grams: null,
    width_mm: null,
    height_mm: null,
    length_mm: null,
    reference_price: numberValue(item?.lowest_recorded_price),
    min_price: numberValue(item?.lowest_recorded_price),
    max_price: numberValue(item?.highest_recorded_price),
    currency,
    images: Array.from(new Set(images)).slice(0, 8),
    source_url: gtin ? `https://www.upcitemdb.com/upc/${encodeURIComponent(gtin)}` : null,
  };
}

async function cosmosSearch(query: string) {
  const token = Deno.env.get("COSMOS_API_TOKEN");
  const userAgent = Deno.env.get("COSMOS_USER_AGENT");
  if (!token || !userAgent) return [] as any[];

  const digits = query.replace(/\D/g, "");
  const exact = /^\d{8,14}$/.test(digits);
  const url = exact
    ? `https://api.cosmos.bluesoft.com.br/gtins/${encodeURIComponent(digits)}.json`
    : `https://api.cosmos.bluesoft.com.br/products?query=${encodeURIComponent(query)}&per_page=20`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Cosmos-Token": token,
      "User-Agent": userAgent,
    },
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    if (response.status === 429) throw new Error("O limite de consultas do Cosmos foi atingido.");
    throw new Error(`Cosmos indisponível (HTTP ${response.status}).`);
  }

  const payload = await response.json().catch(() => null) as any;
  const rows = exact
    ? (payload ? [payload] : [])
    : Array.isArray(payload) ? payload : Array.isArray(payload?.products) ? payload.products : Array.isArray(payload?.items) ? payload.items : [];

  return rows.map(normalizeCosmos).filter((item: any) => item.name);
}

async function upcSearch(query: string) {
  const paidKey = Deno.env.get("UPCITEMDB_USER_KEY");
  const keyType = Deno.env.get("UPCITEMDB_KEY_TYPE") || "3scale";
  const base = paidKey
    ? "https://api.upcitemdb.com/prod/v1"
    : "https://api.upcitemdb.com/prod/trial";
  const digits = query.replace(/\D/g, "");
  const exact = /^\d{8,14}$/.test(digits);
  const url = exact
    ? `${base}/lookup?upc=${encodeURIComponent(digits)}`
    : `${base}/search?s=${encodeURIComponent(query)}&type=product`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (paidKey) {
    headers.user_key = paidKey;
    headers.key_type = keyType;
  }

  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => null) as any;
  if (response.status === 404) return [];
  if (!response.ok) {
    if (response.status === 429) throw new Error("O limite de consultas do catálogo alternativo foi atingido.");
    throw new Error(textValue(payload?.message) || `Catálogo alternativo indisponível (HTTP ${response.status}).`);
  }
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  return rows.map(normalizeUpc).filter((item: any) => item.name);
}

async function searchProducts(query: string) {
  let cosmosError: string | null = null;
  try {
    const cosmos = await cosmosSearch(query);
    if (cosmos.length) return { provider: "cosmos", results: cosmos };
  } catch (error) {
    cosmosError = error instanceof Error ? error.message : "Falha no Cosmos.";
    console.warn("[PRODUCT LOOKUP] Cosmos:", cosmosError);
  }

  try {
    const upc = await upcSearch(query);
    return { provider: "upcitemdb", results: upc, warning: cosmosError };
  } catch (error) {
    const fallbackError = error instanceof Error ? error.message : "Falha no catálogo alternativo.";
    if (cosmosError) throw new Error(`${cosmosError} ${fallbackError}`);
    throw error;
  }
}

function extensionFor(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

function assertSafeExternalUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("A imagem externa usa um protocolo não permitido.");
  }
  if (url.username || url.password) {
    throw new Error("A URL da imagem externa é inválida.");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost"
    || host.endsWith(".localhost")
    || host.endsWith(".local")
    || host.endsWith(".internal")
    || host === "metadata.google.internal"
    || host === "::"
    || host === "::1"
    || /^f[cd][0-9a-f:]*$/i.test(host)
    || /^fe[89ab][0-9a-f:]*$/i.test(host)
  ) {
    throw new Error("A origem da imagem externa não é permitida.");
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some(value => value > 255)) throw new Error("A URL da imagem externa é inválida.");
    const [a, b] = octets;
    const blocked = a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
    if (blocked) throw new Error("A origem da imagem externa não é permitida.");
  }

  return url;
}

async function fetchExternalImage(rawUrl: string) {
  let currentUrl = assertSafeExternalUrl(rawUrl);
  for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
    const response = await fetch(currentUrl, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("A imagem externa retornou um redirecionamento inválido.");
      currentUrl = assertSafeExternalUrl(new URL(location, currentUrl).toString());
      continue;
    }
    return response;
  }
  throw new Error("A imagem externa excedeu o limite de redirecionamentos.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ success: false, error: "Usuário não autenticado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const key = publicKey();
    if (!supabaseUrl || !key) return json({ success: false, error: "Supabase não configurado para a consulta de produtos." }, 500);

    const client = createClient(supabaseUrl, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return json({ success: false, error: "Usuário não autenticado." }, 401);

    const body = await request.json().catch(() => ({})) as any;
    const organizationId = String(body?.organization_id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
      return json({ success: false, error: "Empresa inválida." }, 400);
    }

    const { data: permissions, error: permissionError } = await client.rpc("my_organization_permissions", {
      p_organization_id: organizationId,
    });
    if (permissionError) return json({ success: false, error: "Não foi possível validar sua permissão." }, 403);
    const permissionKeys = new Set((permissions || []).map((item: any) =>
      String(typeof item === "string" ? item : item?.permission_key || "")
    ));
    const canManage = ["inventory.create", "inventory.update", "products.create", "products.update"]
      .some(keyName => permissionKeys.has(keyName));
    if (!canManage) return json({ success: false, error: "Sem permissão para pesquisar ou importar produtos nesta empresa." }, 403);

    const action = String(body?.action || "search");

    if (action === "search") {
      const query = String(body?.query || "").trim();
      if (query.length < 3) return json({ success: false, error: "Digite pelo menos 3 caracteres ou informe um GTIN." }, 400);
      const result = await searchProducts(query);
      return json({ success: true, ...result });
    }

    if (action === "import-image") {
      const imageUrl = String(body?.image_url || "").trim();
      if (!/^https?:\/\//i.test(imageUrl)) return json({ success: false, error: "URL de imagem inválida." }, 400);

      const imageResponse = await fetchExternalImage(imageUrl);
      if (!imageResponse.ok) return json({ success: false, error: "Não foi possível baixar a imagem selecionada." }, 422);
      const contentType = String(imageResponse.headers.get("content-type") || "").toLowerCase().split(";")[0];
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        return json({ success: false, error: "A imagem externa possui um formato não suportado." }, 422);
      }
      const declaredSize = Number(imageResponse.headers.get("content-length") || 0);
      if (declaredSize > 8 * 1024 * 1024) return json({ success: false, error: "A imagem externa excede 8 MB." }, 422);

      const bytes = new Uint8Array(await imageResponse.arrayBuffer());
      if (bytes.byteLength > 8 * 1024 * 1024) return json({ success: false, error: "A imagem externa excede 8 MB." }, 422);

      const extension = extensionFor(contentType);
      const fileName = `external-${Date.now()}-${crypto.randomUUID()}.${extension}`;
      const storagePath = `${organizationId}/external/${fileName}`;

      const { error: uploadError } = await client.storage
        .from("product-images")
        .upload(storagePath, bytes, { contentType, upsert: false });
      if (uploadError) throw uploadError;

      const { data: media, error: mediaError } = await client
        .from("media")
        .insert({
          organization_id: organizationId,
          bucket_id: "product-images",
          storage_path: storagePath,
          file_name: fileName,
          file_size: bytes.byteLength,
          mime_type: contentType,
          alt_text: String(body?.alt_text || "Produto importado").slice(0, 300),
          uploaded_by: authData.user.id,
        })
        .select("id")
        .single();

      if (mediaError || !media?.id) {
        await client.storage.from("product-images").remove([storagePath]);
        throw mediaError || new Error("Não foi possível registrar a imagem importada.");
      }

      const publicUrl = client.storage.from("product-images").getPublicUrl(storagePath).data.publicUrl;
      return json({ success: true, media_id: media.id, public_url: publicUrl });
    }

    return json({ success: false, error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("[PRODUCT LOOKUP]", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Erro inesperado ao consultar produtos.",
    }, 500);
  }
});
