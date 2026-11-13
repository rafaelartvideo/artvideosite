# Permissões internas e externas por ramal

**Objetivo:** dois seletores independentes (Só faz, Só recebe, Faz e recebe),
com gravação atômica e estados desejado/aplicado por empresa.
**Arquitetura:** evolução aditiva v2 do protocolo, preservando o modo anterior
nos dois escopos. Autoridade no Asterisk; interface só aplica modos confirmados.

- [ ] Testar combinações cruzadas antes de implementar; manter fixtures v1.
- [ ] Banco: colunas por escopo, RPCs v2, geração e bloqueio de escritores v1.
- [ ] Motor: origem pelo destino interno/nacional; entrada externa marcada em
      variável herdada antes de fila/Dial para preservar escopo nas transferências.
      O recebimento interno e externo usa listas separadas no pré-atendimento.
- [ ] CRM: seletores separados e bloqueios próprios em ramal/900 versus OS/telefone.
- [ ] Testes PostgreSQL descartável, Linux, chamada sintética, qualidade e builds.
- [ ] Main, migração isolada, Edge e VPS com backup/zero chamadas; FTPS confirmado.

Decisões: serviços internos e ramais têm até quatro dígitos; saída nacional
normalizada possui mais de quatro. Rota nacional continua validando o número.
Chamadas com participante externo preservam a marca de entrada ao transferir.
Não altera permissões reais escolhidas nem troncos. Sem novo ciclo de perguntas,
conforme instrução anterior do usuário para executar diretamente.


## Validação para entrega

- Qualidade, suíte test:ci e builds site/CRM aprovados.
- 24 testes focados do CRM/Edge, incluindo nove combinações e gravação atômica.
- 307 testes Linux aprovados; matriz do instalador cobre falhas e reversão.
- PostgreSQL descartável aprovado, incluindo migração dos modos antigos,
  escrita obsoleta bloqueada, isolamento, revisão e nove combinações aplicadas.
- Ensaio nativo 723d8b2047d14c95b8f79638aec873d4: 16 cenários aprovados,
  cleaned=true, zero chamadas humanas/externas. Fila e encaminhamento preservam
  o escopo externo, independentemente da permissão de recebimento interno.
- A implantação parte dos modos reais existentes, sem alterações de tronco.
