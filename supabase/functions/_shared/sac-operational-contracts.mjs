// Operational subset of sac-contracts.mjs; legacy catalog stays server-side.
export const SAC_ENDPOINTS = [
  {
    "id": 2,
    "area": "Contatos",
    "title": "Todos",
    "method": "GET",
    "path": "/client/contact/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "contact"
    ],
    "errors": "—",
    "purpose": "Listar contatos, com paginação.",
    "mode": "client",
    "fields": [
      {
        "name": "p",
        "label": "Página",
        "type": "number",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 3,
    "area": "Contatos",
    "title": "Filtrar",
    "method": "GET",
    "path": "/client/contact/search?p={p}&filter={filter}&search={search}",
    "bodyDescription": "—",
    "scopes": [
      "contact"
    ],
    "errors": "invalid_search",
    "purpose": "Buscar contatos por filtro; filtro 7 também define start e finish:string AAAA-MM-DD HH:mm:ss, não representados na URL do painel.",
    "mode": "client",
    "fields": [
      {
        "name": "p",
        "label": "Página",
        "type": "number",
        "required": true
      },
      {
        "name": "filter",
        "label": "Filtro",
        "type": "number",
        "required": true
      },
      {
        "name": "search",
        "label": "Busca",
        "type": "text",
        "required": true
      },
      {
        "name": "start",
        "label": "Início",
        "type": "text",
        "when": {
          "field": "filter",
          "values": [
            "7"
          ]
        },
        "required": false
      },
      {
        "name": "finish",
        "label": "Fim",
        "type": "text",
        "when": {
          "field": "filter",
          "values": [
            "7"
          ]
        },
        "required": false
      }
    ],
    "contractNote": ""
  },
  {
    "id": 4,
    "area": "Contatos",
    "title": "Perfil",
    "method": "GET",
    "path": "/client/contact/info?id={id}",
    "bodyDescription": "—",
    "scopes": [
      "contact"
    ],
    "errors": "invalid_contact",
    "purpose": "Consultar dados do contato.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 5,
    "area": "Contatos",
    "title": "Protocolos",
    "method": "GET",
    "path": "/client/contact/info/protocols?p={p}&id={id}",
    "bodyDescription": "—",
    "scopes": [
      "contact",
      "protocol"
    ],
    "errors": "invalid_contact",
    "purpose": "Listar protocolos de um contato.",
    "mode": "client",
    "fields": [
      {
        "name": "p",
        "label": "Página",
        "type": "number",
        "required": true
      },
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 6,
    "area": "Contatos",
    "title": "Mídias",
    "method": "GET",
    "path": "/client/contact/info/medias?p={p}&id={id}",
    "bodyDescription": "—",
    "scopes": [
      "contact"
    ],
    "errors": "invalid_contact",
    "purpose": "Consultar mídias do contato.",
    "mode": "client",
    "fields": [
      {
        "name": "p",
        "label": "Página",
        "type": "number",
        "required": true
      },
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": "Não chamado; galeria completa ausente."
  },
  {
    "id": 7,
    "area": "Contatos",
    "title": "Status",
    "method": "GET",
    "path": "/client/contact/status?p={p}&id={id}",
    "bodyDescription": "—",
    "scopes": [],
    "errors": "invalid_contact",
    "purpose": "Consultar publicações de status do contato: tipos 0 texto, 1 imagem, 3/13 vídeo.",
    "mode": "client",
    "fields": [
      {
        "name": "p",
        "label": "Página",
        "type": "number",
        "required": true
      },
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 42,
    "area": "Grupos de WhatsApp",
    "title": "Todos",
    "method": "GET",
    "path": "/client/groups_wa/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "group"
    ],
    "errors": "—",
    "purpose": "Listar grupos WhatsApp.",
    "mode": "client",
    "fields": [
      {
        "name": "p",
        "label": "Página",
        "type": "number",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 43,
    "area": "Grupos de WhatsApp",
    "title": "Participantes",
    "method": "GET",
    "path": "/client/groups_wa/members?id={id}",
    "bodyDescription": "—",
    "scopes": [
      "group"
    ],
    "errors": "invalid_group",
    "purpose": "Listar participantes do grupo.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 44,
    "area": "Grupos de WhatsApp",
    "title": "Histórico",
    "method": "GET",
    "path": "/client/groups_wa/messages?id={id}&page={p}",
    "bodyDescription": "—",
    "scopes": [
      "group"
    ],
    "errors": "invalid_group",
    "purpose": "Consultar mensagens do grupo.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "p",
        "label": "Página",
        "type": "number",
        "required": true
      }
    ],
    "contractNote": ""
  }
];
