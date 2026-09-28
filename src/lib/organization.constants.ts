// A instalação atual nasceu com a ArtVideo também exercendo o papel de operadora
// da plataforma. Os IDs são iguais por compatibilidade, mas os conceitos são
// separados para que o código não use "ArtVideo" como sinônimo de "Union World".
const LEGACY_ROOT_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

export const ARTVIDEO_ORGANIZATION_ID = LEGACY_ROOT_ORGANIZATION_ID;
export const PLATFORM_OPERATOR_ORGANIZATION_ID = LEGACY_ROOT_ORGANIZATION_ID;

/** @deprecated Use ARTVIDEO_ORGANIZATION_ID or PLATFORM_OPERATOR_ORGANIZATION_ID according to the domain. */
export const PLATFORM_ORGANIZATION_ID = PLATFORM_OPERATOR_ORGANIZATION_ID;
