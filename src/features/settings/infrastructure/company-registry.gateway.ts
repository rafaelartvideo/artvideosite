export type CompanyRegistryData = {
  cnpj: string;
  legalName: string;
  tradeName: string;
  phone: string;
  email: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

export async function lookupCompanyByCnpj(cnpj: string): Promise<CompanyRegistryData> {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) throw new Error("Informe um CNPJ válido com 14 números.");

  let response: Response;
  try {
    response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  } catch {
    throw new Error("Não foi possível conectar ao serviço de consulta de CNPJ. Você pode continuar preenchendo os dados manualmente.");
  }

  if (!response.ok) {
    if (response.status === 400) throw new Error("O CNPJ informado não pôde ser consultado.");
    if (response.status === 404) throw new Error("CNPJ não encontrado.");
    if (response.status === 429) throw new Error("O serviço de consulta de CNPJ recebeu muitas solicitações. Tente novamente em instantes ou preencha manualmente.");
    if (response.status >= 500) throw new Error("O serviço de consulta de CNPJ está temporariamente indisponível. Preencha os dados manualmente ou tente novamente.");
    throw new Error("Não foi possível consultar o CNPJ agora. Você pode continuar preenchendo os dados manualmente.");
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error("O serviço de consulta de CNPJ retornou uma resposta inválida. Preencha os dados manualmente.");
  }
  return {
    cnpj: text(data.cnpj) || digits,
    legalName: text(data.razao_social),
    tradeName: text(data.nome_fantasia),
    phone: text(data.ddd_telefone_1),
    email: text(data.email),
    zipCode: text(data.cep),
    street: text(data.logradouro),
    number: text(data.numero),
    complement: text(data.complemento),
    neighborhood: text(data.bairro),
    city: text(data.municipio),
    state: text(data.uf).toUpperCase(),
  };
}
