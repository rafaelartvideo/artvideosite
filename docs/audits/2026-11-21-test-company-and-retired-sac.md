# Empresa Teste: medições, Cadastros e remoção da SAC aposentada

## Evidência local

Sessão existente de Rafael Gestor, empresa selecionada pela interface como Teste. Nenhuma credencial foi gravada em arquivos ou no repositório. Coleta voluntária no navegador, build bf520280337f63af186041457e40fde60167b86a, mesma sessão/empresa/rede 4G declarada pelo navegador, cache não controlado. Arquivo bruto permanece apenas local. Sem varredura de logs Supabase, carga artificial ou envio de telemetria.

46 registros locais, 17 respostas RPC completas, zero erros registrados e zero pendências no momento da exportação. Não inclui todos os GET/POST REST/Storage nem substitui monitoramento de produção. Cabeçalhos e corpo da mesma RPC não contam como duas operações. Amostra insuficiente para p50/p95/p99 por contexto; números abaixo são observações individuais.

| Operação | Tempo observado | Limite |
| --- | ---: | --- |
| OS: confirmação RPC create_service_order_atomic | 1.210,1 ms | Não inclui uploads e todo o processo visual |
| Estoque: conteúdo pronto | 1.079,7 ms | Primeira visita desta coleta; cache não controlado |
| Financeiro: conteúdo pronto | 835,7 ms | Mesmas restrições |
| OS: lista pronta | 102,1 ms | Cache já existente, não comparar com primeira visita |
| Cadastros: RPC de busca | 239,1 e 241,9 ms | Página e contagem global duplicadas sem filtros |
| WhatsApp: contadores | 1.129,0 ms | Somente contagem, não prontidão da caixa toda |
| WhatsApp: relógio de expediente | 1.058,2 ms | Uma resposta, não percentil |

Foi criada pela interface a OS sintética 71, externa AUDIT-PERF-20261121, com cliente já existente de teste e duas imagens sintéticas. ID 87d077e6-8e2e-4201-9515-3ff27a96ccf9. Descrição identifica auditoria e determina não executar serviço/enviar mensagens. A criação e as duas imagens foram confirmadas na tela. Nenhuma mensagem, ligação, cobrança ou mudança de permissões foi realizada. Registro mantido na empresa Teste para inspeção.

## Correções

1. Cadastros sem filtros reutiliza o total exato retornado pela página, eliminando a RPC separada de contagem (duas chamadas da busca para uma nesse caso). Ordenação/paginação não afetam o total. Nome, documento, papel, estado, responsável, data e modo somente funcionários mantêm a contagem independente. Chaves por empresa e permissões preservadas.
2. Removidas 32 fontes antigas da SAC, incluindo dois componentes transferidos para shared/ui/whatsapp por ainda serem utilizados: seletor de emojis e atalho de WhatsApp externo. Restantes 30 arquivos eram implementação/testes do provedor aposentado e diálogo de orçamento. Cerca de oito mil linhas líquidas removidas. A API legada já estava desativada antes desta rodada; não se atribui a limpeza economia de consultas que já estavam bloqueadas.
3. Retirados diálogo antigo, efeitos de status constante e botão com texto SAC dos detalhes da OS. Modal Union WhatsApp e preparação/envio de documentos atuais permanecem. Atalho externo usa wa.me diretamente, sem status intermediário ou envio automático. Permissão antiga do atalho foi mantida por compatibilidade.
4. Orçamentos usam atalho externo funcional em lugar do diálogo de provedor desativado. SAC não aparece mais para ativação nas integrações nem nos grupos fixos/dinâmicos das empresas parceiras. Nenhuma configuração persistida foi modificada.
5. Endpoints inertes, redirecionamento da rota antiga, histórico de migrações e dados do banco permanecem para compatibilidade; não há exclusão de dados de produção.

Comparação local do chunk TabOrders na mesma configuração: 707.005 para 697.725 bytes minificados; gzip de 192.675 para 189.908 bytes. Redução de 9.280 bytes minificados / 2.767 gzip no arquivo, não no sistema inteiro. Outros chunks compartilhados mudam de distribuição; isso não prova redução proporcional de latência ou transferência total.

## Validação

Testes escritos antes das mudanças falharam pelos caminhos antigos/consulta ainda redundante; depois passaram. Cobrem ausência de imports ativos da SAC, controles de reativação, abertura externa real do componente sem rede, restrições de contagem e preservação do WhatsApp multiempresa. Contratos exclusivos de telas/provedor removidos foram retirados; testes de upload atuais e endpoints inertes permanecem. Revisão independente sem bloqueios, seis testes focados aprovados.

Suíte final local: 1.044 testes, 1.042 aprovados, dois ignorados por ambiente, zero falhas. Qualidade incluída. Builds finais do site e CRM concluídos com sucesso; publicação e conferência posterior serão registradas após conclusão.

## Pontos ainda sem ganho comprovado

Após criar a OS houve duas consultas get_service_order_workspace_v1 (460,6 e 276,1 ms) e uma de referências (516,3 ms). Não foi removida atualização de Realtime/cache sem comprovar sua origem: podem refletir invalidações legítimas, e suprimir eventos poderia deixar dados antigos. A medição não comprova que todos os timeouts foram resolvidos nem que todo código sem uso foi eliminado. Stashes e arquivos locais anteriores continuam preservados fora de main.

## Publicação e verificação posterior

Código em main: 9d62eaf84615ca8617361153c9ea6cff585ab652. Pipeline https://github.com/rafaelartvideo/artvideosite/actions/runs/44920650995: testes, builds e ambos os jobs FTPS concluídos com sucesso na primeira tentativa. Logs confirmam Sync complete e fingerprints published-site/published-crm deste SHA. Nenhuma implantação Supabase, alteração SQL ou serviço VPS necessária.

Nova coleta local confirmou build 9d62eaf84615ca8617361153c9ea6cff585ab652. Ao abrir Cadastros sem filtros após recarregar, houve uma única resposta search_registration_page_v3 (246,1 ms), além da consulta distinta de responsáveis (221,4 ms). Antes eram duas buscas (239,1 e 241,9 ms). Ganho demonstrado: uma RPC de busca eliminada, 50% menos chamadas dessa função na abertura sem filtros; não há redução de 50% comprovada no tempo de tela. O total exibido permaneceu 64 cadastros. Filtro Rafael retornou os registros correspondentes e preservou o total global; filtros foram limpos. Arquivo bruto pós-publicação continua somente local.

A OS 71 foi reaberta com as duas imagens e a identificação da auditoria. O botão agora se chama Abrir WhatsApp do cliente. Seu modal atual carregou o atendimento existente da empresa Teste e foi fechado sem digitar ou enviar mensagem, sem ligação e sem abrir anexos históricos. A imagem de evidência fica somente no computador local. Não se validou cobrança real, envio externo ou todos os fluxos comerciais por ações destrutivas.
