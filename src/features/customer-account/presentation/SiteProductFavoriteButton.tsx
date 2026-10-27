import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { Heart } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const FAVORITES_QUERY_KEY = "artvideo-site-favorite-ids";

async function listFavoriteIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("artvideo_customer_favorites")
    .select("product_id").eq("user_id", userId).limit(250);
  if (error) throw error;
  return (data ?? []).map(row => row.product_id);
}

export function useSiteFavorites() {
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const query = useQuery({
    queryKey: [FAVORITES_QUERY_KEY, userId],
    queryFn: () => listFavoriteIds(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });
  return { userId, favoriteIds: query.data ?? [], loading: query.isPending && Boolean(userId), error: query.error };
}
export function ProductFavoriteButton({ productId, className = "" }: { productId: string; className?: string }) {
  const { userId, favoriteIds } = useSiteFavorites();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = favoriteIds.includes(productId);
  async function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    event.preventDefault();
    if (!userId) { navigate("/minha-conta"); return; }
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = active
        ? await supabase.from("artvideo_customer_favorites").delete().eq("user_id", userId).eq("product_id", productId)
        : await supabase.from("artvideo_customer_favorites").insert({ user_id: userId, product_id: productId });
      if (result.error) throw result.error;
      await queryClient.invalidateQueries({ queryKey: [FAVORITES_QUERY_KEY, userId] });
    } catch { setError("Não foi possível atualizar seu favorito."); }
    finally { setBusy(false); }
  }
  return <button type="button" onClick={event => void toggle(event)} disabled={busy} aria-pressed={active}
    aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"} title={error || (active ? "Remover dos favoritos" : "Adicionar aos favoritos")}
    className={"inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#e4eaf3] bg-white/95 text-[#6a819d] shadow-sm transition-colors hover:border-blue-200 hover:text-[var(--art-primary)] disabled:opacity-60 " + className}>
    <Heart size={19} strokeWidth={1.9} className={active ? "fill-[#ec566f] text-[#ec566f]" : ""}/>
  </button>;
}
