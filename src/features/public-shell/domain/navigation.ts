export type PublicPage =
  | "home"
  | "loja"
  | "produto"
  | "servicos"
  | "servico"
  | "sobre"
  | "contato"
  | "orcamento"
  | "assistencia";

export const PUBLIC_NAV_LINKS = [
  "Início",
  "Loja",
  "Serviços",
  "Assistência Técnica",
  "Sobre nós",
  "Contato",
] as const;

export const PUBLIC_NAV_MAP: Record<(typeof PUBLIC_NAV_LINKS)[number], PublicPage> = {
  "Início": "home",
  "Loja": "loja",
  "Serviços": "servicos",
  "Assistência Técnica": "assistencia",
  "Sobre nós": "sobre",
  "Contato": "contato",
};
