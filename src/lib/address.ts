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

export type AddressSuggestion = Partial<Address> & { label: string };

export async function searchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];

  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    countrycodes: "br",
    limit: "5",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!response.ok) return [];
  const results = await response.json();

  return results.map((result: any) => ({
    label: result.display_name,
    street: result.address?.road || result.address?.pedestrian || "",
    neighborhood: result.address?.suburb || result.address?.neighbourhood || "",
    city: result.address?.city || result.address?.town || result.address?.municipality || "",
    state: result.address?.state_code?.replace(/^BR-/, "") || "",
    zip_code: formatZipCode(result.address?.postcode || ""),
  }));
}
