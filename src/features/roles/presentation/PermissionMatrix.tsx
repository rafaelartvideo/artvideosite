import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { buildPermissionGroups, permissionLabelForEditor, permissionPresentationKind, type PermissionRecord, type PermissionPresentationKind } from "@/features/employees/domain/permission-taxonomy";

type Props = {
  permissions: PermissionRecord[];
  selectedIds: ReadonlySet<string>;
  inheritedIds?: ReadonlySet<string>;
  individualIds?: ReadonlySet<string>;
  canManage: boolean;
  onToggle: (permission: PermissionRecord) => void;
  onToggleMany?: (permissions: PermissionRecord[]) => void;
};

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const kinds: Array<{ key: PermissionPresentationKind; title: string }> = [
  { key: "visual", title: "Visualizar" },
  { key: "actions", title: "Ações" },
];

export function PermissionMatrix({ permissions, selectedIds, inheritedIds, individualIds, canManage, onToggle, onToggleMany }: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const term = normalize(search.trim());
  const groups = buildPermissionGroups(permissions).map(group => {
    const sections = group.sections.map(section => ({
      ...section,
      permissions: section.permissions.filter(permission => !term || normalize([
        permissionLabelForEditor(permission), permission.description || "", permission.key, group.name, section.name,
      ].join(" ")).includes(term)),
    })).filter(section => section.permissions.length > 0);
    return { ...group, sections, permissions: sections.flatMap(section => section.permissions) };
  }).filter(group => group.permissions.length > 0);

  return <div className="space-y-3">
    <div className="flex justify-end">
      <input type="search" aria-label="Buscar permissões" placeholder="Buscar permissões"
        value={search} onChange={event => setSearch(event.target.value)}
        className="w-full min-w-0 rounded-md border border-[#0d1b2e]/15 bg-transparent px-3 py-2 text-xs text-[#0d1b2e] outline-none focus:border-[#1032DC] sm:max-w-[300px]" />
    </div>
    <p className="text-xs text-[#65748b]">
      Cada módulo reúne seus controles de visualização e ações. Desmarcar uma visualização também desmarca as ações que dependem dela.
    </p>
    <div className="divide-y divide-[#0d1b2e]/10 border-y border-[#0d1b2e]/10">
      {groups.map(group => {
        const opened = expanded.includes(group.name) || term.length > 0;
        const checkedCount = group.permissions.filter(permission => selectedIds.has(permission.id)).length;
        const editable = group.permissions.filter(permission => !inheritedIds?.has(permission.id));
        const checkedAll = editable.length > 0 && editable.every(permission => selectedIds.has(permission.id));
        return <div key={group.name}>
          <div className="flex items-center gap-3 py-3">
            <button type="button" aria-expanded={opened} onClick={() => setExpanded(current =>
              current.includes(group.name) ? current.filter(name => name !== group.name) : [...current, group.name])}
              className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <ChevronDown size={16} className={"shrink-0 text-[#65748b] transition-transform " + (opened ? "rotate-180" : "")} />
              <span className="min-w-0 flex-1 text-sm font-bold text-[#0d1b2e]">{group.name}</span>
              <span className="text-xs text-[#65748b]">{checkedCount}/{group.permissions.length}</span>
            </button>
            {onToggleMany && canManage && editable.length > 0 && <button type="button"
              className="shrink-0 text-xs font-semibold text-[#1032DC]"
              onClick={() => onToggleMany(editable)}>{checkedAll ? "Desmarcar" : "Marcar"} grupo</button>}
          </div>
          {opened && <div className="pb-4 pl-0 sm:pl-6">
            {kinds.map(kind => {
              const sections = group.sections.map(section => ({
                ...section,
                permissions: section.permissions.filter(permission => permissionPresentationKind(permission) === kind.key),
              })).filter(section => section.permissions.length > 0);
              if (!sections.length) return null;
              return <div key={kind.key} className="border-t border-[#0d1b2e]/10 py-3">
                <div className="mb-2 text-xs font-bold text-[#0d1b2e]">{kind.title}</div>
                {sections.map(section => <div key={section.name} className="py-2">
                  <div className="mb-1 text-[11px] font-semibold text-[#65748b]">{section.name}</div>
                  {section.name === "Tabela" && <p className="mb-1 text-[11px] text-[#65748b]">Acesso à tabela e colunas exibidas.</p>}
                  <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                    {section.permissions.map(permission => {
                      const inherited = inheritedIds?.has(permission.id) || false;
                      return <button key={permission.id} type="button" title={permission.description || permission.key}
                        disabled={!canManage || inherited} onClick={() => onToggle(permission)}
                        className="flex min-w-0 items-start gap-2.5 border-b border-[#0d1b2e]/5 py-2.5 text-left disabled:cursor-default">
                        <Checkbox checked={selectedIds.has(permission.id)} tabIndex={-1} />
                        <span className="min-w-0 flex-1 text-xs font-medium leading-relaxed text-[#0d1b2e]">
                          {permissionLabelForEditor(permission)}
                          {inherited && <span className="ml-2 text-[10px] text-[#65748b]">Herdada</span>}
                          {!inherited && individualIds?.has(permission.id) && <span className="ml-2 text-[10px] text-[#1032DC]">Individual</span>}
                        </span>
                      </button>;
                    })}
                  </div>
                </div>)}
              </div>;
            })}
          </div>}
        </div>;
      })}
      {!groups.length && <p className="py-6 text-center text-sm text-[#65748b]">Nenhuma permissão encontrada.</p>}
    </div>
  </div>;
}
