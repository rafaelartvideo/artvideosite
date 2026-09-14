import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  fetchAddressByZipCode,
  formatZipCode,
  type Address,
} from "@/lib/address";

export type IbgeState = { sigla: string; nome: string };
type IbgeCity = { nome: string };

const FALLBACK_STATES: IbgeState[] = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" }, { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" }, { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" }, { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" }, { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" }, { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

const normalizeDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeLookup = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function useOrderServiceAddress({
  form,
  setForm,
  selectedCustomer,
}: {
  form: Record<string, any>;
  setForm: Dispatch<SetStateAction<any>>;
  selectedCustomer: any;
}) {
  const [serviceUseCustomerAddress, setServiceUseCustomerAddress] = useState(false);
  const [serviceCustomerAddressOverride, setServiceCustomerAddressOverride] = useState(false);
  const [serviceAddressMessage, setServiceAddressMessage] = useState("");
  const [ibgeStates, setIbgeStates] = useState<IbgeState[]>([]);
  const [ibgeStatesLoading, setIbgeStatesLoading] = useState(false);
  const [ibgeCities, setIbgeCities] = useState<IbgeCity[]>([]);
  const [ibgeCitiesLoading, setIbgeCitiesLoading] = useState(false);
  const citiesCacheRef = useRef<Record<string, IbgeCity[]>>({});
  const citiesRequestRef = useRef(0);
  const zipRequestRef = useRef(0);

  const updateFields = (fields: Record<string, unknown>) => {
    setForm((current: any) => ({ ...current, ...fields }));
  };

  const customerAddresses = ((selectedCustomer?.addresses || []) as Address[]).filter(Boolean);
  const selectedServiceAddress =
    customerAddresses.find(address => address.id && address.id === form.service_customer_address_id) ||
    customerAddresses.find(address => address.is_default) ||
    customerAddresses[0] ||
    null;

  const serviceAddressPreview: Address | null = serviceUseCustomerAddress
    ? serviceCustomerAddressOverride
      ? selectedServiceAddress
      : {
          id: form.service_customer_address_id || undefined,
          zip_code: form.service_zip_code,
          state: form.service_state,
          city: form.service_city,
          neighborhood: form.service_neighborhood,
          street: form.service_street,
          number: form.service_number,
          complement: form.service_complement,
        }
    : null;

  const clearServiceAddress = () => {
    updateFields({
      service_customer_address_id: "",
      service_zip_code: "",
      service_state: "",
      service_city: "",
      service_neighborhood: "",
      service_street: "",
      service_number: "",
      service_complement: "",
    });
  };

  const loadIbgeCities = async (state: string, preferredCity?: string) => {
    const uf = state.trim().toUpperCase();
    if (!uf) {
      setIbgeCities([]);
      return [];
    }

    const requestId = ++citiesRequestRef.current;
    const cached = citiesCacheRef.current[uf];
    if (cached) {
      setIbgeCities(cached);
      if (preferredCity) {
        const officialCity = cached.find(city => normalizeLookup(city.nome) === normalizeLookup(preferredCity));
        if (officialCity) updateFields({ service_city: officialCity.nome });
      }
      return cached;
    }

    setIbgeCitiesLoading(true);
    try {
      const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
      if (!response.ok) throw new Error("Falha ao carregar cidades.");
      const cities = await response.json() as IbgeCity[];
      if (requestId !== citiesRequestRef.current) return [];
      citiesCacheRef.current[uf] = cities;
      setIbgeCities(cities);
      if (preferredCity) {
        const officialCity = cities.find(city => normalizeLookup(city.nome) === normalizeLookup(preferredCity));
        if (officialCity) updateFields({ service_city: officialCity.nome });
      }
      return cities;
    } catch {
      if (requestId === citiesRequestRef.current) setIbgeCities([]);
      return [];
    } finally {
      if (requestId === citiesRequestRef.current) setIbgeCitiesLoading(false);
    }
  };

  const copyCustomerAddressToForm = (address: Address | null) => {
    updateFields({
      service_customer_address_id: address?.id || "",
      service_zip_code: address?.zip_code || "",
      service_state: address?.state || "",
      service_city: address?.city || "",
      service_neighborhood: address?.neighborhood || "",
      service_street: address?.street || "",
      service_number: address?.number || "",
      service_complement: address?.complement || "",
    });
    if (address?.state) void loadIbgeCities(address.state, address.city);
  };

  const selectServiceAddress = (address: Address) => {
    setServiceUseCustomerAddress(true);
    setServiceCustomerAddressOverride(true);
    setServiceAddressMessage("");
    copyCustomerAddressToForm(address);
  };

  const resetServiceAddressState = () => {
    setServiceUseCustomerAddress(false);
    setServiceCustomerAddressOverride(false);
    setServiceAddressMessage("");
    setIbgeCities([]);
  };

  const hydrateServiceAddress = ({
    useCustomerAddress,
    state,
    city,
  }: {
    useCustomerAddress: boolean;
    state?: string;
    city?: string;
  }) => {
    setServiceUseCustomerAddress(useCustomerAddress);
    setServiceCustomerAddressOverride(false);
    setServiceAddressMessage("");
    setIbgeCities([]);
    if (state) void loadIbgeCities(state, city);
  };

  useEffect(() => {
    let active = true;
    setIbgeStatesLoading(true);
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome")
      .then(response => response.ok ? response.json() as Promise<IbgeState[]> : Promise.reject(new Error("Falha ao carregar estados.")))
      .then(states => { if (active) setIbgeStates(states); })
      .catch(() => { if (active) setIbgeStates(FALLBACK_STATES); })
      .finally(() => { if (active) setIbgeStatesLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (form.order_type !== "external" || serviceUseCustomerAddress || normalizeDigits(form.service_zip_code).length !== 8) return;

    const requestId = ++zipRequestRef.current;
    setServiceAddressMessage("");
    const zipCode = formatZipCode(form.service_zip_code);
    setIbgeCitiesLoading(true);
    fetchAddressByZipCode(zipCode)
      .then(async address => {
        if (requestId !== zipRequestRef.current) return;
        if (!address) {
          setServiceAddressMessage("CEP não encontrado. Verifique ou preencha o endereço manualmente.");
          return;
        }
        updateFields({
          service_state: address.state || "",
          service_neighborhood: address.neighborhood || "",
          service_street: address.street || "",
        });
        const cities = await loadIbgeCities(address.state || "", address.city || "");
        if (requestId !== zipRequestRef.current) return;
        if (!cities.some(city => normalizeLookup(city.nome) === normalizeLookup(address.city))) {
          updateFields({ service_city: address.city || "" });
        }
        setServiceAddressMessage("");
      })
      .catch(() => {
        if (requestId === zipRequestRef.current) setServiceAddressMessage("Não foi possível consultar o CEP agora. Preencha o endereço manualmente.");
      })
      .finally(() => { if (requestId === zipRequestRef.current) setIbgeCitiesLoading(false); });

    return () => { zipRequestRef.current += 1; };
  }, [form.order_type, form.service_zip_code, serviceUseCustomerAddress]);

  return {
    serviceUseCustomerAddress,
    setServiceUseCustomerAddress,
    serviceCustomerAddressOverride,
    setServiceCustomerAddressOverride,
    serviceAddressMessage,
    setServiceAddressMessage,
    ibgeStates,
    ibgeStatesLoading,
    ibgeCities,
    ibgeCitiesLoading,
    customerAddresses,
    selectedServiceAddress,
    serviceAddressPreview,
    clearServiceAddress,
    copyCustomerAddressToForm,
    selectServiceAddress,
    loadIbgeCities,
    resetServiceAddressState,
    hydrateServiceAddress,
  };
}
