# Otimização do login da Union World — 11/11/2026

- Função em produção: `public.load_auth_access_v1(uuid)`.
- Diagnóstico: duas avaliações de `public.my_organizations_v2()` (uma para lista e outra para escolher a organização).
- Alteração: uma `available AS MATERIALIZED`, com agregação e seleção usando a mesma CTE; `LEFT JOIN` garante o resultado esperado sem vínculo direto.
- Preservado: funções de organização/permissão existentes, `SECURITY DEFINER`, `STABLE`, search_path, GRANTs, perfil/funcionário, organização, módulos, termos pendentes e todos os nomes de campos JSON.
- Nenhuma tabela ou dado alterado; sem remoção de índices. Antes e depois devem ser medidos sob uso real, não inferidos da contagem de CTEs.
- Rollback exato: `supabase/scripts/rollback_auth_access_single_scan_20261111.sql`, obtido com `pg_get_functiondef` antes da alteração.
- Fonte aplicada: `supabase/scripts/optimize_auth_access_single_scan_20261111.sql`.
- Regressão SQL: `supabase/tests/auth_access_single_scan_contract.sql`.
