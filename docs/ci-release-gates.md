# Validação antes de publicar CRM e site

## Por que o deploy falhava repetidamente

A `main` recebia alterações diretamente. O workflow de produção já interrompia o
FTPS se um teste ou build falhasse; portanto o erro era descoberto **depois
do commit na main**, não antes da integração. Além disso, os workflows de PR e
deploy executavam conjuntos de testes diferentes (por exemplo, o PR não
executava finance). Alguns testes antigos comparavam strings ou regexes
ultrapassadas após modificações legítimas da interface.

## Fluxo recomendado (obrigatório depois de ativar a proteção da main)

1. Criar uma branch curta para cada alteração, sem enviar commits diretamente
   para a `main`.
2. Abrir um pull request com destino `main`.
3. O check **PR Build Check / Validate release** instala dependências usando
   `npm ci`, roda qualidade, finanças, regressões, SAC Digital, testes PBX e
   os builds do CRM e site público.
4. Só mesclar quando o check estiver verde, sem usar `[skip ci]`.
5. Na `main`, o workflow Deploy HostGator executa a mesma bateria antes de
   publicar por FTPS. Caso o teste ou build falhe, **não ocorre publicação**.

## Configuração de proteção necessária no GitHub

A alteração dos arquivos YAML **não ativa proteção de branch por si só**.
Um administrador precisa configurar em
**Settings → Rules → Rulesets** (ou **Settings → Branches**) para a `main`:

- **Require a pull request before merging**.
- **Require status checks to pass before merging**, selecionando o check
  `Validate release` do workflow `PR Build Check`.
- **Require branches to be up to date before merging** (recomendado).
- Impedir bypass e push direto dos colaboradores que devem seguir esse fluxo.
- Evitar exigir o check de deploy de produção como requisito do PR.

Se o check ainda não aparece na lista de checks exigíveis, rode primeiro o
workflow com um PR e volte à configuração após ele existir.

## Comandos de verificação local

```bash
npm ci
npm run test:ci
python3 -m unittest discover -s scripts/union-pbx-agent -p 'test_*.py'
npm run build
```

Ou `npm run verify:release` para todos os testes Node e ambos os builds.
O teste PBX fica separado por depender do Python 3.

## Regras para escrever e atualizar regressões

- Testar comportamento: entrada, transformação, saída e regras de acesso.
- Usar testes de domínio e funções puras quando possível. Não copiar grandes
  trechos de JSX e não associar a aprovação à redação exata de um texto.
- Testes de layout que são contratos explícitos podem conferir estrutura,
  mas devem ser pequenos e não exigir detalhes incidentais de código.
- Regex em testes deve ser validada com uma amostra que **deve passar** e
  outra que **deve falhar**. Sempre preferir `includes` para texto literal.
- Ao editar UI, revisar a regressão relacionada **na mesma branch**.
  Nunca remover teste só para tornar o deploy verde sem confirmar a regra
  de negócio preservada.
- Usar `npm run test:quality` para impedir que os próprios checks de
  PR/deploy sejam removidos por engano.

## Limites

Este processo evita promover código sem validação, mas não substitui testes
reais de navegador, permissões por perfil, fluxos Supabase e inspeção do
ambiente publicado. O deploy da main ainda faz uma segunda validação antes
do FTPS. Em produção, executar smoke tests dos fluxos alterados.
