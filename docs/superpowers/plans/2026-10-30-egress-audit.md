# Auditoria de consumo e desempenho

> Execução na sessão atual, em clone dedicado e branch `perf/egress-audit-20261030`.

**Objetivo:** reduzir trabalho repetido confirmado, preservando funcionalidades, Realtime, RLS e isolamento por empresa.

**Especificação:** arquivo de auditoria enviado pelo usuário em 30/10/2026. Publicação não destrutiva já autorizada.

- [x] Inspecionar arquitetura, histórico das otimizações, projetos, advisors e logs.
- [x] Registrar banco, Storage, conexões, consultas acumuladas e tráfego de 24 horas.
- [x] Eliminar consultas de metadados de fotos já presentes nos detalhes da OS; compartilhar assinaturas privadas com o cache existente, sem prolongar sua validade.
- [x] Comparar consulta de notificações atual com alternativa usando uma leitura materializada; publicar somente se os testes demonstrarem benefício sem regressão.
- [x] Executar testes de regressão, financeiro, SAC e builds; verificar equivalência SQL com identidades diferentes.
- [ ] Revisar diferenças, publicar pelo fluxo existente e conferir deploy.
- [ ] Entregar relatório com medições, limites de cobertura, riscos e plano de backup.

## Foco da revisão

Metadados ausentes ou de outro ID devem voltar à consulta autorizada. URLs de empresas diferentes nunca se misturam. Reutilizar uma URL não estende sua expiração. Falhas do Storage não provocam repetição em cada render. Imagens locais já disponíveis não disparam consultas de mídia.

Não excluir arquivos, criar índices em massa, desabilitar RLS, mudar planos nem reiniciar VPS. Métricas indisponíveis serão identificadas como tal.
