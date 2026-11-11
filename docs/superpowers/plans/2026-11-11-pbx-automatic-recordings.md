# Gravações automáticas por empresa — implementação

> Execução inline com revisão final independente. Continuar a missão original;
> não ativar a captura de voz real sem política configurada e aceite operacional.

Escolha do proprietário: gravação automática do escopo configurado por empresa;
aviso automático opcional. Consentimento não é pressuposto como única base legal.
A política declara finalidade, base legal, informação aos titulares, retenção,
quota e acesso. Nada é ativado pela instalação ou por escolher uma empresa piloto.

- [ ] Banco: políticas versionadas, escopos interno/entrada/saída, limite de
  armazenamento, retenção, permissões distintas de gestão e reprodução. Storage
  privado sem SELECT/upload direto pelo navegador. Testes SQL descartáveis.
- [ ] Motor: compilador puro e auxiliar transacional, identidade por empresa,
  arquivos em diretórios próprios, MixMonitor sem comandos de shell ou dados de
  número/nome no caminho. Verificar contextos carregados, guarda de chamadas,
  backups e reversão. Ausência/falha de política não impede uma chamada.
- [ ] Reconciliação: capacidade instalada e poll assinado; autorização com prazo
  curto para iniciar captura. Não entregar novas políticas a perfis inadequados.
  Captura limitada e identificação por uniqueid/event_id real, nunca aproximação
  por número/horário. Não enviar arquivo ainda aberto pelo Asterisk.
- [ ] Upload: ticket exclusivo de serviço para WAV validado, tamanho/hash,
  vínculo exato com CDR da mesma empresa/agente, quota reservada atomicamente,
  repetição idempotente e confirmação após Storage. Não mostrar tokens em logs.
- [ ] Reprodução: função autenticada com permissão própria e URL por 60 segundos;
  expiração verificada no servidor. Excluir expirados pelo Storage API e confirmar
  exclusão; sem apagar só a linha de storage.objects. Recuperar trabalho pendente.
- [ ] CRM: aba Gravações no padrão global, política inicialmente desativada,
  estados desejado/aplicado/erro, escopos e limites, lista autorizada e player.
  Isolar trocas de empresa e cancelar requisições antigas.
- [ ] Integração: testes puros, SQL, Edge assinada, builds e ensaio sintético no
  Asterisk sem voz humana. Só então solicitar o aceite necessário para teste real.
- [ ] Entrega: main preservando mudanças concorrentes, migração/Edge/agente
  coordenados e FTPS conferido. Não declarar recurso operacional antes do ensaio.

Ruling: aviso é configurável, não removido silenciosamente por padrão; a escolha
não dispensa a política de transparência. Ruling: iniciar desativado permite
validar isolamento e quota sem gravar conversas dos usuários durante a construção.
