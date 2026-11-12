import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PbxSavedContactCard = { name: string | null; avatarUrl: string | null; source: "crm" | "pbx" | "whatsapp" | null };
type CacheEntry = { value: PbxSavedContactCard; expiresAt: number };
type EndpointResponse = {
  success?: boolean;
  contacts?: { number?: string; name?: string | null; source?: "crm" | "pbx" | "whatsapp" | null; avatar_url?: string | null }[];
};

const CACHE_FOUND_MS = 15 * 60 * 1000; // Well below the private Storage signed URL TTL.
const CACHE_MISSING_MS = 5 * 60 * 1000;

/** Only Brazilian external numbers, never ramals, can map to CRM / WhatsApp contacts. */
export function pbxContactPhoneKey(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (/^55[1-9][0-9]{9,10}$/.test(digits)) return digits;
  if (/^[1-9][0-9]{9,10}$/.test(digits)) return "55" + digits;
  return "";
}

export function usePbxSavedContactCards(
  organizationId: string | null, enabled: boolean, numbers: string[], revision = 0,
): Record<string, PbxSavedContactCard> {
  const cache = useRef(new Map<string, CacheEntry>());
  const cacheOrg = useRef(organizationId);
  const cacheRevision = useRef(revision);
  const [cards, setCards] = useState<Record<string, PbxSavedContactCard>>({});
  const keys = Array.from(new Set(numbers.map(pbxContactPhoneKey).filter(Boolean))).slice(0, 12).sort().join("|");

  useEffect(() => {
    if (cacheOrg.current !== organizationId || cacheRevision.current !== revision) {
      cacheRevision.current = revision;
      cacheOrg.current = organizationId;
      cache.current.clear();
      setCards({});
    }
    if (!organizationId || !enabled || !keys) return;
    const controller = new AbortController();
    const wanted = keys.split("|");
    const now = Date.now();
    const fresh = wanted.filter(key => !cache.current.get(key) || cache.current.get(key)!.expiresAt <= now);
    const fromCache = Object.fromEntries(wanted.flatMap(key => {
      const found = cache.current.get(key);
      return found && found.expiresAt > now ? [[key, found.value]] : [];
    }));
    setCards(old => ({ ...old, ...fromCache }));
    if (!fresh.length) return () => controller.abort();

    void supabase.functions.invoke<EndpointResponse>("union-pbx-contact-cards", {
      body: { organization_id: organizationId, numbers: fresh },
      signal: controller.signal,
    }).then(({ data, error }) => {
      if (controller.signal.aborted) return;
      if (error || !data?.success || !Array.isArray(data.contacts)) throw new Error("Consulta de contatos indisponível.");
      const byKey = new Map(data.contacts.map(row => [pbxContactPhoneKey(row.number || ""), row]));
      const updates: Record<string, PbxSavedContactCard> = {};
      for (const key of fresh) {
        const row = byKey.get(key);
        const identity = { name: row?.name || null, avatarUrl: row?.avatar_url || null, source: row?.source || null };
        cache.current.set(key, { value: identity, expiresAt: Date.now() + (row?.avatar_url || row?.name ? CACHE_FOUND_MS : CACHE_MISSING_MS) });
        updates[key] = identity;
      }
      setCards(old => ({ ...old, ...updates }));
    }).catch(() => {
      if (controller.signal.aborted) return;
      // Avoid retry storms when the optional cache service is unavailable.
      for (const key of fresh) cache.current.set(key, { value: { name: null, avatarUrl: null, source: null }, expiresAt: Date.now() + 60_000 });
    });
    return () => controller.abort();
  }, [organizationId, enabled, keys, revision]);
  return cards;
}
