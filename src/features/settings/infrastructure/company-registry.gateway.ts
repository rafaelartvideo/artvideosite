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

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!response.ok) {
    if (response.status === 404) throw new Error("CNPJ não encontrado.");
    throw new Error("Não foi possível consultar o CNPJ agora. Tente novamente.");
  }

  const data = await response.json();
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
