import { useCallback, useEffect, useMemo, useState } from "react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { CompanyCatalogTemplateSuggestions } from "./CompanyCatalogTemplateSuggestions";
import { BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
  addOfficialBrand, addOfficialEquipment, loadCompanyOfficialCatalog,
  type CompanyOfficialCatalog, type OfficialEquipmentSuggestion,
} from "../infrastructure/company-official-catalog.repository";

type Props = {
  organizationId: string;
  canCreate: boolean;
  canEdit: boolean;
  canManageFields: boolean;
  canManageChecklists: boolean;
  onImported: () => Promise<unknown>;
};

export function CompanyOfficialCatalogSuggestions({ organizationId, canCreate, canEdit, canManageFields, canManageChecklists, onImported }: Props) {
  const [catalog, setCatalog] = useState<CompanyOfficialCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingKey, setWorkingKey] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    const next = await loadCompanyOfficialCatalog(organizationId);
    setCatalog(next);
    return next;
  }, [organizationId]);

  useEffect(() => {
    let current = true;
    setCatalog(null);
    setSelectedTypeId(null);
    setLoading(true);
    setError("");
    void loadCompanyOfficialCatalog(organizationId)
      .then(data => { if (current) setCatalog(data); })
      .catch(cause => { if (current) setError(systemErrorMessage(cause, "Não foi possível consultar o catálogo Union.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [organizationId]);

  const choices = useMemo(() => (catalog?.equipmentTypes || []).filter(item =>
    item.name.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))
  ), [catalog, search]);
  const activeType: OfficialEquipmentSuggestion | undefined =
    catalog?.equipmentTypes.find(item => item.id === selectedTypeId);
  const filteredBrands = useMemo(() => (catalog?.brands || [])
    .filter(item => item.equipment_type_id === selectedTypeId)
    .filter(item => item.name.toLocaleLowerCase("pt-BR")
      .includes(brandSearch.trim().toLocaleLowerCase("pt-BR"))), [catalog, selectedTypeId, brandSearch]);

  const execute = async (key: string, work: () => Promise<unknown>, success: string) => {
    if (workingKey || !canCreate) return;
    setWorkingKey(key);
    setError("");
    setNotice("");
    try {
      await work();
      await Promise.all([reload(), onImported()]);
      setNotice(success);
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível adicionar o cadastro."));
    } finally {
      setWorkingKey("");
    }
  };

  return <section className="space-y-4 rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-base font-extrabold">Sugestões do Catálogo Union</h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Itens oficiais compatíveis com os segmentos desta empresa. Adicione somente o que utiliza.
          Nenhum modelo será importado.
        </p>
      </div>
      <BtnSecondary size="sm" disabled={Boolean(workingKey) || loading} onClick={() => {
        setLoading(true);
        setError("");
        void reload().catch(cause => setError(systemErrorMessage(cause, "Falha ao atualizar sugestões.")))
          .finally(() => setLoading(false));
      }}>Atualizar sugestões</BtnSecondary>
    </div>

    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</p>}
    {loading && <p className="py-5 text-sm text-muted-foreground">Carregando sugestões...</p>}

    {!loading && catalog && !catalog.hasSegments && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
      Esta empresa ainda não escolheu um segmento. O proprietário pode selecionar um em Dados da Empresa.
      Os equipamentos já cadastrados continuam disponíveis normalmente.
    </p>}
    {!loading && catalog?.hasSegments && catalog.equipmentTypes.length === 0 && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
      A Union ainda não publicou equipamentos aprovados para os segmentos desta empresa.
      Continue utilizando seus cadastros existentes.
    </p>}

    {!loading && catalog?.hasSegments && catalog.equipmentTypes.length > 0 && <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <label className="block text-xs font-bold text-muted-foreground" htmlFor="union-equipment-search">Buscar equipamento</label>
        <input id="union-equipment-search" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
          value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do equipamento"/>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {choices.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhuma sugestão encontrada.</p>}
          {choices.map(item => <div key={item.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${selectedTypeId === item.id ? "border-primary bg-primary/5" : "border-border"}`}>
            <button type="button" onClick={() => { setSelectedTypeId(item.id); setBrandSearch(""); }}
              className="min-w-0 flex-1 text-left text-sm font-bold hover:text-primary">
              {item.name}
              {item.local_equipment_type_id && <span className="block text-xs font-normal text-muted-foreground">
                {item.local_is_active ? "Já cadastrado" : "Já cadastrado (inativo)"}
              </span>}
            </button>
            {item.local_equipment_type_id
              ? <BtnSecondary size="sm" disabled={Boolean(workingKey)} onClick={() => { setSelectedTypeId(item.id); setBrandSearch(""); }}>
                  Ver marcas
                </BtnSecondary>
              : <BtnPrimary size="sm" disabled={!canCreate || Boolean(workingKey)} loading={workingKey === item.id}
                  onClick={() => void execute(item.id,
                    () => addOfficialEquipment(organizationId, item.id),
                    "Equipamento adicionado ao cadastro local. Já pode ser usado nas OS.",
                  )}>Adicionar</BtnPrimary>}
          </div>)}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-extrabold">Marcas compatíveis</h3>
        {!activeType && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">Selecione um equipamento para ver as marcas recomendadas.</p>}
        {activeType && !activeType.local_equipment_type_id && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          Adicione primeiro o equipamento <strong>{activeType.name}</strong>, depois escolha as marcas necessárias.
        </p>}
        {activeType?.local_equipment_type_id && <>
          <input aria-label="Buscar marca" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            value={brandSearch} onChange={event => setBrandSearch(event.target.value)} placeholder="Buscar marca"/>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {filteredBrands.length === 0 && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              Nenhuma marca oficial disponível para este equipamento.
            </p>}
            {filteredBrands.map(brand => <div key={brand.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <span className="block text-sm font-semibold">{brand.name}</span>
                {brand.local_equipment_brand_id && <span className="block text-xs text-muted-foreground">
                  {brand.local_is_active ? "Já cadastrada" : "Já cadastrada (inativa)"}
                </span>}
              </div>
              {brand.local_equipment_brand_id
                ? <span className="text-xs text-muted-foreground">Adicionada</span>
                : <BtnPrimary size="sm" disabled={!canCreate || Boolean(workingKey)}
                    loading={workingKey === brand.id}
                    onClick={() => void execute(brand.id,
                      () => addOfficialBrand(organizationId, activeType.id, brand.id),
                      "Marca vinculada ao equipamento. Modelos não foram importados.",
                    )}>Adicionar</BtnPrimary>}
            </div>)}
          </div>
        </>}
      </div>
    </div>}
    {activeType?.local_equipment_type_id && <CompanyCatalogTemplateSuggestions
      key={organizationId + ":" + activeType.id}
      organizationId={organizationId}
      equipmentCatalogId={activeType.id}
      canManage={canEdit && canManageFields}
      canManageChecklists={canEdit && canManageChecklists}
      onAdded={onImported}
    />}
    {!canCreate && <p className="text-xs text-muted-foreground">
      Sua função permite consultar as sugestões, mas não adicionar equipamentos ou marcas.
    </p>}
  </section>;
}
