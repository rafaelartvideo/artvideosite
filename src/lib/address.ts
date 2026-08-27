export type Address = {
  id?: string;
  customer_id?: string;
  zip_code: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
  is_default?: boolean;
};

export const emptyAddress: Address = {
  zip_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};

export function formatZipCode(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export async function fetchAddressByZipCode(value: string): Promise<Partial<Address> | null> {
  const zipCode = value.replace(/\D/g, "");
  if (zipCode.length !== 8) return null;

  const response = await fetch(`https://viacep.com.br/ws/${zipCode}/json/`);
  if (!response.ok) throw new Error("Não foi possível consultar o CEP.");
  const data = await response.json();
  if (data.erro) return null;

  return {
    zip_code: formatZipCode(zipCode),
    street: data.logradouro || "",
    neighborhood: data.bairro || "",
    city: data.localidade || "",
    state: data.uf || "",
  };
}
