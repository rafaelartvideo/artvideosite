export const SAC_RESOURCE_GROUPS = [
  { id: 'attendance', label: 'Atendimento', areas: ['Protocolos', 'Atendimentos', 'Recados', 'Respostas Rápidas', 'Recuperar Contato'] },
  { id: 'registries', label: 'Cadastros', areas: ['Contatos', 'Grupos de Contatos', 'Etiquetas', 'Carteira de Clientes', 'Cupom'] },
  { id: 'communication', label: 'Comunicação', areas: ['Campanhas', 'Notificações', 'SMSIDEAL', 'Grupos de WhatsApp', 'Agendamento'] },
  { id: 'team', label: 'Equipe e canais', areas: ['Canais', 'Enterprise', 'Departamentos', 'Operadores', 'Monitores', 'Perfil'] },
  { id: 'services', label: 'Serviços', areas: ['Produtos', 'Correios', 'Portabilidade', 'API Telefonia'] },
  { id: 'integration', label: 'Integração', areas: ['Gestor — Login', 'Operador — Login'] },
];

export const SAC_AREA_LABELS: Record<string, string> = {
  'Gestor — Login': 'Conta Gestor', 'Operador — Login': 'Conta Operador', Enterprise: 'Templates aprovados',
  SMSIDEAL: 'SMS', 'API Telefonia': 'Telefonia', 'Recuperar Contato': 'Recuperar contato',
  'Respostas Rápidas': 'Respostas rápidas', 'Grupos de Contatos': 'Grupos de contatos',
  'Grupos de WhatsApp': 'Grupos de WhatsApp', 'Carteira de Clientes': 'Carteira de clientes',
};

export const SAC_MODULE_SECTIONS = [
  { id: 'conversations', label: 'Conversas' }, { id: 'resources', label: 'Recursos' },
  { id: 'delivery_history', label: 'Histórico de envios' }, { id: 'sms_replies', label: 'Respostas SMS' },
];
