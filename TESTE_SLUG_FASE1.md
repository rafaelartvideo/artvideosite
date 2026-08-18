# 🧪 TESTE FASE 1: GERAÇÃO DE SLUG ÚNICO

## Objetivo
Validar que a geração de slugs únicos funciona corretamente e evita colisões.

---

## TESTE 1: Criar serviço com nome único

**Passos:**
1. Acesse `/admin` → Painel → Serviços
2. Clique "+ Novo Serviço"
3. Preencha o nome: **"Instalação de TV"**
4. Preencha descrição: (qualquer coisa)
5. Clique "Salvar"

**Esperado:**
- Toast verde: "Serviço criado com sucesso!"
- Serviço aparece na lista

**Verificar no Supabase:**
- Vá para table `services`
- Filtro por título "Instalação de TV"
- Slug deve ser: **`instalacao-de-tv`**

**Console (F12):**
- Deve ver: `[ADMIN] Generated unique slug for new service: instalacao-de-tv`

---

## TESTE 2: Criar segundo serviço com mesmo nome

**Passos:**
1. Clique "+ Novo Serviço" novamente
2. Preencha o nome: **"Instalação de TV"** (idêntico)
3. Preencha descrição: (qualquer coisa)
4. Clique "Salvar"

**Esperado:**
- Toast verde: "Serviço criado com sucesso!"
- Novo serviço criado (não deve dar erro de duplicate key)

**Verificar no Supabase:**
- Vá para table `services`
- Filtro por título "Instalação de TV"
- Deve haver **2 registros**:
  - 1º com slug: **`instalacao-de-tv`**
  - 2º com slug: **`instalacao-de-tv-2`** ← Sufixo automático!

**Console (F12):**
- Deve ver: `[ADMIN] Slug available (with suffix): instalacao-de-tv-2`

---

## TESTE 3: Criar terceiro serviço com mesmo nome

**Passos:**
1. Clique "+ Novo Serviço" novamente
2. Preencha o nome: **"Instalação de TV"** (idêntico)
3. Preencha descrição: (qualquer coisa)
4. Clique "Salvar"

**Esperado:**
- Toast verde: "Serviço criado com sucesso!"

**Verificar no Supabase:**
- Vá para table `services`
- Filtro por título "Instalação de TV"
- Deve haver **3 registros**:
  - 1º com slug: **`instalacao-de-tv`**
  - 2º com slug: **`instalacao-de-tv-2`**
  - 3º com slug: **`instalacao-de-tv-3`** ← Sufixo incrementado!

---

## TESTE 4: Editar sem alterar título

**Passos:**
1. Na lista de serviços, clique no primeiro "Instalação de TV" (com slug `instalacao-de-tv`)
2. Altere apenas a descrição (não mude o título)
3. Clique "Salvar"

**Esperado:**
- Toast verde: "Serviço atualizado com sucesso!"

**Verificar no Supabase:**
- Vá para table `services`
- Filtro por ID do serviço editado
- Slug deve permanecer: **`instalacao-de-tv`** (não mudou!)

**Console (F12):**
- Deve ver: `[ADMIN] Title unchanged, keeping existing slug: instalacao-de-tv`

---

## TESTE 5: Editar alterando título

**Passos:**
1. Na lista de serviços, clique no segundo "Instalação de TV" (com slug `instalacao-de-tv-2`)
2. Altere o título para: **"Manutenção de TV"**
3. Clique "Salvar"

**Esperado:**
- Toast verde: "Serviço atualizado com sucesso!"

**Verificar no Supabase:**
- Vá para table `services`
- Filtro por ID do serviço editado
- Slug deve ser novo: **`manutencao-de-tv`** (gerado novo, sem colisão!)

**Console (F12):**
- Deve ver: `[ADMIN] Title changed, generated new slug: manutencao-de-tv`

---

## TESTE 6: Caracteres especiais

**Passos:**
1. Clique "+ Novo Serviço"
2. Preencha o nome: **"Instalação de Ar Condicionado 220V (C/Refrigeração)"**
3. Clique "Salvar"

**Esperado:**
- Toast verde: "Serviço criado com sucesso!"

**Verificar no Supabase:**
- Vá para table `services`
- Filtro por título "Instalação de Ar Condicionado..."
- Slug deve ser: **`instalacao-de-ar-condicionado-220v-crefrigeracao`**
  - Sem acentos: ✅
  - Sem parênteses: ✅
  - Sem espaços (substituídos por -): ✅
  - Sem hífens duplicados: ✅

---

## TESTE 7: Caracteres que criam hífens duplicados

**Passos:**
1. Clique "+ Novo Serviço"
2. Preencha o nome: **"Serviço - de - TV"** (com hífens no original)
3. Clique "Salvar"

**Esperado:**
- Toast verde: "Serviço criado com sucesso!"

**Verificar no Supabase:**
- Slug deve ser: **`servico-de-tv`**
  - NÃO: `servico---de---tv` ← Hífens duplicados removidos!
  - NÃO: `-servico-de-tv-` ← Hífens nas extremidades removidos!

---

## CHECKLIST DE VALIDAÇÃO

- [ ] Teste 1: Primeiro serviço cria com slug base
- [ ] Teste 2: Segundo serviço cria com slug-2 automaticamente
- [ ] Teste 3: Terceiro serviço cria com slug-3 automaticamente
- [ ] Teste 4: Editar sem título = slug não muda
- [ ] Teste 5: Editar com título = novo slug gerado
- [ ] Teste 6: Caracteres especiais removidos corretamente
- [ ] Teste 7: Hífens duplicados e nas extremidades removidos
- [ ] TypeScript: Sem erros de compilação
- [ ] Console: Logs [ADMIN] aparecem corretamente
- [ ] Supabase: Nenhuma duplicate key constraint error

---

## Se houver erro "duplicate key value violates unique constraint"

Isso significa que houve um problema:

1. **A função não foi chamada:** Verificar se `generateUniqueServiceSlug()` está sendo invocada no `handleSave`
2. **RLS bloqueou a query:** Verificar logs do Supabase para "permission denied"
3. **Concorrência:** Se dois usuários criarem com mesmo nome no mesmo segundo, pode haver colisão
4. **Falha da query:** Se a query de `SELECT id, slug` falhar, o fallback retorna o slug base (sem proteção)

**Debug:**
- Abra DevTools (F12)
- Vá para Console
- Procure por `[ADMIN]` logs
- Verifique se `generateUniqueServiceSlug` foi chamado
- Verifique se a query de SELECT retornou sem erros

---

## Sucesso! ✅

Quando todos os testes passarem:

1. Confirme ao usuário que Fase 1 está 100% completa
2. Anuncie que está pronto para Fase 2: CATEGORIAS
3. Aguarde aprovação antes de começar Fase 2
