export async function fetchCnpjData(cnpj: string) {
  const digits = cnpj.replace(/\D/g, "");
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
  if (!response.ok) throw new Error("CNPJ não encontrado.");
  return response.json();
}
