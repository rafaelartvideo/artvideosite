import { useEffect, useState } from "react";
import * as queries from "./queries";
import type { Service, ServiceCategory, Product, Brand, Media } from "./database.types";

// ── Services ──────────────────────────────────────────────────
export function useServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await queries.getServices();
        if (err) throw err;
        setServices(data || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao buscar serviços");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { services, loading, error };
}

export function useServiceById(id: string) {
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await queries.getServiceById(id);
        if (err) throw err;
        setService(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao buscar serviço");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return { service, loading, error };
}

export function useServiceDetailBySlug(slug: string | null) {
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!slug) {
      setDetail(null);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    queries.getServiceDetailBySlug(slug).then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setDetail(data);
      setLoading(false);
    });

    return () => { active = false; };
  }, [slug]);

  return { detail, loading, error };
}

// ── Service Categories ────────────────────────────────────────
export function useServiceCategories() {
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await queries.getServiceCategories();
        if (err) throw err;
        setCategories(data || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao buscar categorias");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { categories, loading, error };
}

// ── Products ──────────────────────────────────────────────────
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await queries.getProducts();
        if (err) throw err;
        setProducts(data || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao buscar produtos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { products, loading, error };
}

export function useFeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await queries.getFeaturedProducts();
        if (err) throw err;
        setProducts(data || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao buscar produtos em destaque");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { products, loading, error };
}

// ── Brands ────────────────────────────────────────────────────
export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await queries.getBrands();
        if (err) throw err;
        setBrands(data || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao buscar marcas");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { brands, loading, error };
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    queries.getSiteSettings().then(({ data, error: queryError }) => {
      if (queryError) setError(queryError.message);
      else setSettings(Object.fromEntries((data || []).map((setting) => [setting.setting_key, setting.setting_value ?? ""])));
      setLoading(false);
    });
  }, []);

  return { settings, loading, error };
}

// ── Media ─────────────────────────────────────────────────────
export function useMediaUrl(mediaId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!mediaId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaId) {
      setUrl(null);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error: err } = await queries.getMediaById(mediaId);
        if (err) throw err;
        if (data?.bucket_name && data?.storage_path) {
          setUrl(queries.getPublicStorageUrl(data.bucket_name, data.storage_path));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao buscar imagem");
      } finally {
        setLoading(false);
      }
    })();
  }, [mediaId]);

  return { url, loading, error };
}
