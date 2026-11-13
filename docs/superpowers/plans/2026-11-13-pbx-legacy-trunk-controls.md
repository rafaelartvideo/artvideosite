# Troncos existentes na VPS e reutilização sem registros concorrentes

Entrega na main; manter FVX Union ativa na implantação. A mesma conta pode ter
cadastros salvos e inativos em empresas diferentes. Uma só empresa pode ativá-la;
a reserva da conta só é liberada depois da confirmação de desativação no motor.
Não transferir credenciais automaticamente nem alterar a empresa dos históricos.
Para usar noutra empresa, configurar nela uma vez, desativar na atual, aguardar
aplicação e ativar a configuração já salva no destino. Entrada de troncos novos
continua fora do escopo; não prometer que mover a saída move o número de entrada.

1. Banco: catálogo separado para metadados/estado do tronco legado existente,
   sem senha; RPCs de consulta e ativação com escopo e revisão esperada. Claim
   privado global por servidor/usuário, mantido até desativação aplicada, para
   impedir dupla ativação entre legado e troncos gerenciados. Testar isolamento,
   estados pendentes, falhas e concorrência em PostgreSQL descartável.
2. VPS: helper root preparado explicitamente com cópia privada das duas
   configurações FVX verificadas. Pausar remove somente os objetos PJSIP desses
   arquivos; reativar restaura bytes originais. Nenhuma alteração de dialplan,
   senha, gravação ou arquivo de outra empresa. Aplicar com lock, zero chamadas,
   backup/reversão e relatório redigido. Instalar mantendo o estado ativo.
3. Edge: poll assinado do agente plataforma recebe controles legados somente
   com capacidade explícita; relatórios próprios não renovam acesso. Nada de
   senhas ou conteúdo dos arquivos na API. Outras empresas continuam no runtime
   de troncos já existente.
4. CRM: FVX aparece na Union como configurada na VPS, com estado observado e
   horários; botões Desativar/Ativar preservam dados e aguardam confirmação.
   Troncos gerenciados têm o mesmo atalho; manter formulário e senha vazia para
   preservar segredo. Explicar uma conta por empresa ativa e limite da entrada.
5. Validar testes/qualidade/builds, revisão, migração e Edge separadamente,
   agente preparado sem mudança da linha, main e envio HostGator conferido.
