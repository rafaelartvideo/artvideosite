import type { Product, Service } from "@/lib/database.types";
import type { PublicPage } from "@/features/public-shell/domain/navigation";
import type { CatalogSlide } from "../presentation/PublicCatalogCarousel";

export type SiteBannerPlacement = "loja" | "servicos" | "ambos";
export type SiteBannerType = "livre" | "produto" | "servico";
export type SiteBannerAction = "" | "loja" | "servicos" | "assistencia" | "orcamento" | "contato";

export type SiteBanner = {
  id: string;
  placement: SiteBannerPlacement;
  type: SiteBannerType;
  referenceId: string;
  title: string;
  description: string;
  label: string;
  actionLabel: string;
  actionPage: SiteBannerAction;
  imageId: string;
  active: boolean;
};

// Estes banners são visuais institucionais próprios, independentes das fotos do catálogo.
// Ao salvar pelo CRM, a lista inteira passa a ser controlada pelas configurações.
export const DEFAULT_SITE_BANNERS: SiteBanner[] = [
  { id: "inicio-loja", placement: "loja", type: "livre", referenceId: "", title: "Tecnologia para o seu dia a dia", description: "Encontre eletrônicos, acessórios e soluções com a confiança da Eletrônica Artvideo.", label: "Loja Artvideo", actionLabel: "Explorar produtos", actionPage: "loja", imageId: "", active: true },
  { id: "solucoes-loja", placement: "loja", type: "livre", referenceId: "", title: "Produtos que fazem a diferença", description: "Escolha o que combina com suas necessidades e conte com nossa equipe para ajudar.", label: "Escolhas para você", actionLabel: "Ver nossa loja", actionPage: "loja", imageId: "", active: true },
  { id: "inicio-servicos", placement: "servicos", type: "livre", referenceId: "", title: "Cuidado especializado para seus equipamentos", description: "Diagnóstico, manutenção e instalação com atenção, transparência e experiência.", label: "Serviços Artvideo", actionLabel: "Conhecer serviços", actionPage: "servicos", imageId: "", active: true },
  { id: "orcamento-servicos", placement: "servicos", type: "livre", referenceId: "", title: "Seu equipamento merece atenção", description: "Conte o que aconteceu e solicite uma avaliação da nossa equipe.", label: "Assistência técnica", actionLabel: "Solicitar orçamento", actionPage: "orcamento", imageId: "", active: true },
];

export function siteBanners(value: unknown): SiteBanner[] {
  if (!Array.isArray(value)) return DEFAULT_SITE_BANNERS;
  return value.filter((row): row is Record<string, unknown> =>
    Boolean(row && typeof row === "object" && !Array.isArray(row) && typeof row.id === "string"))
    .map(row => ({
      id: String(row.id),
      placement: row.placement === "ambos" || row.placement === "servicos" ? row.placement : "loja",
      type: row.type === "produto" || row.type === "servico" ? row.type : "livre",
      referenceId: typeof row.referenceId === "string" ? row.referenceId : "",
      title: typeof row.title === "string" ? row.title : "",
      description: typeof row.description === "string" ? row.description : "",
      label: typeof row.label === "string" ? row.label : "",
      actionLabel: typeof row.actionLabel === "string" ? row.actionLabel : "",
      actionPage: ["loja", "servicos", "assistencia", "orcamento", "contato"].includes(String(row.actionPage || ""))
        ? row.actionPage as SiteBannerAction : "",
      imageId: typeof row.imageId === "string" ? row.imageId : "",
      active: row.active !== false,
    }));
}

export function buildSiteBannerSlides(
  records: SiteBanner[],
  placement: "loja" | "servicos",
  options: {
    products: Product[];
    services: Service[];
    setPage: (page: PublicPage) => void;
    onSelectProduct: (slug: string) => void;
    onSelectService: (slug: string) => void;
  },
): CatalogSlide[] {
  const { products, services, setPage, onSelectProduct, onSelectService } = options;
  return records.filter(banner => banner.active && (banner.placement === placement || banner.placement === "ambos"))
    .flatMap((banner): CatalogSlide[] => {
      const product = banner.type === "produto" ? products.find(item => item.id === banner.referenceId) : undefined;
      const service = banner.type === "servico" ? services.find(item => item.id === banner.referenceId) : undefined;
      if (banner.type === "produto" && !product) return [];
      if (banner.type === "servico" && !service) return [];
      const title = banner.title.trim() || product?.name || service?.title || "Eletrônica Artvideo";
      const description = banner.description.trim() || product?.short_description || service?.short_description ||
        "Conte com a nossa equipe para encontrar a melhor solução.";
      const action = product ? () => onSelectProduct(product.slug)
        : service ? () => onSelectService(service.slug)
        : banner.actionPage ? () => setPage(banner.actionPage as PublicPage) : undefined;
      return [{
        id: banner.id,
        title, description,
        label: banner.label.trim() || (product ? "Produto em destaque" : service ? "Serviço em destaque" : "Eletrônica Artvideo"),
        imageId: banner.imageId || undefined,
        actionLabel: banner.actionLabel.trim() || (product ? "Ver produto" : service ? "Ver serviço" : "Saiba mais"),
        onAction: action,
        theme: placement,
      }];
    });
}
