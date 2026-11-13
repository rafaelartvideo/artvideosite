# FVX existente e configurações reutilizáveis

Entrega de 13/11/2026: a linha FVX já configurada na VPS aparece no cadastro
de troncos da Union como **Configurada na VPS**, sem um segundo registro SIP.
Os metadados do histórico e a empresa das chamadas existentes permanecem iguais.

## Uso

1. Na Union, abra PABX → Troncos SIP. O cartão mostra estado solicitado,
   observado, registro e horário da verificação. Preparação pendente ou agente
   indisponível não são apresentados como linha conectada.
2. **Desativar** exige confirmação da interrupção da entrada e saída. A central
   aguarda ausência de chamadas e preserva os arquivos originais privadamente.
3. **Ativar** restaura a configuração salva, sem solicitar a senha novamente.
   Configuração aplicada e registro na operadora são estados distintos.
4. Para usar a mesma conta em outra empresa, configure-a uma vez naquela empresa
   e salve inativa. Desative na atual, aguarde aplicação e ative no destino.
   Depois é possível alternar usando os cadastros já salvos. As credenciais não
   são copiadas automaticamente entre empresas.

Uma reserva privada por servidor/usuário impede duas ativações concorrentes.
Desativação pendente, falha ou confirmação antiga não liberam a reserva. Os
cadastros inativos preservam a senha. Os novos troncos de empresas parceiras
continuam com saída apenas: alternar a saída não transfere o atendimento de
entrada do número FVX para outra empresa.

## Implantação e verificação

- Migração isolada `20261113124416_pbx_legacy_trunk_controls.sql`, sem dados de
  senha da FVX. Importação dos metadados somente por poll assinado do agente
  plataforma, com capacidade preparada e validade curta.
- Helper lê apenas os dois arquivos FVX aprovados. Instalação e preparação não
  modificam esses arquivos nem recarregam o Asterisk. Desativação/reativação
  posterior usa lock compartilhado, guarda de chamadas e reversão.
- Instalador revisado altera somente agente/helper e reinicia somente o agente
  plataforma. Não inicia empresas novas nem altera filas, dialplan ou gravações.
- PostgreSQL 14 descartável: isolamento, revisões, estados pendentes/falhas,
  segredo preservado e concorrência real de duas conexões aprovados.
- Linux: 266 testes aprovados como root e como nobody, incluindo transações e
  falhas do instalador. Nenhuma chamada externa nos testes.
- CRM: suíte completa, qualidade e builds de site e CRM aprovados. Revisão
  independente sem defeitos materiais pendentes.
- Pré-validação somente de leitura dos arquivos reais FVX aprovada na VPS.

A linha da Union permanece ativa na entrega. O teste com interrupção real deve
ser feito pelo responsável pelo botão de desativar, quando a linha puder parar.
Conferir separadamente commit main, migração, Edge, agente e publicação HostGator.
