// Contract catalog audited visually against the SAC Digital Apiary documentation.
export const SAC_ENDPOINTS = [
  {
    "id": 1,
    "area": "Gestor — Login",
    "title": "Login",
    "method": "POST",
    "path": "/client/auth2/login",
    "bodyDescription": "client:string; password:string; scopes:array de strings",
    "scopes": [],
    "errors": "invalid_params, invalid_scope, invalid_auth",
    "purpose": "Obter token OAuth2 do Gestor.",
    "mode": "client",
    "fields": [
      {
        "name": "client",
        "label": "Client ID",
        "type": "text",
        "required": true
      },
      {
        "name": "password",
        "label": "Credencial",
        "type": "text",
        "required": true
      },
      {
        "name": "scopes",
        "label": "Permissões externas",
        "type": "array",
        "required": true
      }
    ],
    "contractNote": ""
  },
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
    "id": 8,
    "area": "Contatos",
    "title": "Edição",
    "method": "PATCH",
    "path": "/client/contact/edit",
    "bodyDescription": "id:string; type: name/email/block/gender/observation/social_medias; name/email:string; block usa status:boolean; gender:M/F/I; observation usa obs:string; social_medias usa social e url",
    "scopes": [
      "contact",
      "edit"
    ],
    "errors": "invalid_contact, error_update, invalid_param",
    "purpose": "Editar propriedades do contato; status bloqueia/desbloqueia conforme contrato.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "type",
        "label": "Tipo",
        "type": "select",
        "required": true,
        "options": [
          "name",
          "email",
          "block",
          "gender",
          "observation",
          "social_medias"
        ]
      },
      {
        "name": "name",
        "label": "Nome",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "name"
          ]
        }
      },
      {
        "name": "email",
        "label": "Email",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "email"
          ]
        }
      },
      {
        "name": "status",
        "label": "Ativo / bloqueado",
        "type": "boolean",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "block"
          ]
        }
      },
      {
        "name": "gender",
        "label": "Gênero",
        "type": "select",
        "required": false,
        "options": [
          "M",
          "F",
          "I"
        ],
        "when": {
          "field": "type",
          "values": [
            "gender"
          ]
        }
      },
      {
        "name": "obs",
        "label": "Observação",
        "type": "textarea",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "observation"
          ]
        }
      },
      {
        "name": "social",
        "label": "Rede social",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "social_medias"
          ]
        }
      },
      {
        "name": "url",
        "label": "URL do arquivo",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "social_medias"
          ]
        }
      }
    ],
    "contractNote": ""
  },
  {
    "id": 9,
    "area": "Contatos",
    "title": "Enriquecimento",
    "method": "POST",
    "path": "/client/contact/register",
    "bodyDescription": "id:string; type:cpf/cnpj/cep/social_medias/email; cpf usa cpf e primary:boolean; cnpj usa cnpj e primary:boolean; cep usa cep,address,number,complement,neighborhood,city,uf,primary:boolean; social_medias usa social_type/social_url; email usa email",
    "scopes": [
      "contact",
      "write"
    ],
    "errors": "invalid_contact, error_insert, invalid_param, cpf_exist, cpf_not_found, cnpj_exist, cnpj_not_found, cep_exist, url_exist, email_exist, type_required",
    "purpose": "Adicionar registros complementares ao contato.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "type",
        "label": "Tipo",
        "type": "select",
        "required": true,
        "options": [
          "cpf",
          "cnpj",
          "cep",
          "social_medias",
          "email"
        ]
      },
      {
        "name": "cpf",
        "label": "CPF",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cpf"
          ]
        }
      },
      {
        "name": "cnpj",
        "label": "CNPJ",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cnpj"
          ]
        }
      },
      {
        "name": "cep",
        "label": "CEP",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cep"
          ]
        }
      },
      {
        "name": "address",
        "label": "Endereço",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cep"
          ]
        }
      },
      {
        "name": "number",
        "label": "Número com DDI e DDD",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cep"
          ]
        }
      },
      {
        "name": "complement",
        "label": "Complemento",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cep"
          ]
        }
      },
      {
        "name": "neighborhood",
        "label": "Bairro",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cep"
          ]
        }
      },
      {
        "name": "city",
        "label": "Cidade",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cep"
          ]
        }
      },
      {
        "name": "uf",
        "label": "UF",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cep"
          ]
        }
      },
      {
        "name": "primary",
        "label": "Principal",
        "type": "boolean",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "cpf",
            "cnpj",
            "cep"
          ]
        }
      },
      {
        "name": "social_type",
        "label": "Rede social",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "social_medias"
          ]
        }
      },
      {
        "name": "social_url",
        "label": "Perfil social",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "social_medias"
          ]
        }
      },
      {
        "name": "email",
        "label": "Email",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "email"
          ]
        }
      }
    ],
    "contractNote": ""
  },
  {
    "id": 10,
    "area": "Contatos",
    "title": "Importação",
    "method": "POST",
    "path": "/client/contact/import",
    "bodyDescription": "number; name; channel opcional, condicionado ao tipo/configuração do canal",
    "scopes": [
      "contact",
      "import"
    ],
    "errors": "exist_contact, invalid_param, invalid_channel, error_valid_wpp, invalid_wpp, error_import",
    "purpose": "Importar contato, validando WhatsApp.",
    "mode": "client",
    "fields": [
      {
        "name": "number",
        "label": "Número com DDI e DDD",
        "type": "text",
        "required": true
      },
      {
        "name": "name",
        "label": "Nome",
        "type": "text",
        "required": true
      },
      {
        "name": "channel",
        "label": "Canal",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 11,
    "area": "Contatos",
    "title": "Encaminhar",
    "method": "POST",
    "path": "/client/contact/forward",
    "bodyDescription": "id; department OU operator",
    "scopes": [
      "contact",
      "protocol",
      "write"
    ],
    "errors": "invalid_contact, invalid_params, invalid_department, invalid_operator, operator_offline, contact_in_att, invalid_channel, operators_offline",
    "purpose": "Direcionar contato a operador/departamento.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "department",
        "label": "Departamento",
        "type": "text",
        "required": false
      },
      {
        "name": "operator",
        "label": "Operador",
        "type": "text",
        "required": false
      }
    ],
    "contractNote": ""
  },
  {
    "id": 12,
    "area": "Recados",
    "title": "Todos",
    "method": "GET",
    "path": "/client/inbox/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "inbox"
    ],
    "errors": "—",
    "purpose": "Listar recados.",
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
    "id": 13,
    "area": "Recados",
    "title": "Detalhes",
    "method": "GET",
    "path": "/client/inbox/info?protocol={protocol}",
    "bodyDescription": "—",
    "scopes": [
      "inbox"
    ],
    "errors": "invalid_protocol",
    "purpose": "Consultar um recado/protocolo.",
    "mode": "client",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 14,
    "area": "Canais",
    "title": "Todos",
    "method": "GET",
    "path": "/client/channel/all",
    "bodyDescription": "—",
    "scopes": [
      "channel"
    ],
    "errors": "—",
    "purpose": "Listar canais.",
    "mode": "client",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 15,
    "area": "Enterprise",
    "title": "Modelos",
    "method": "GET",
    "path": "/client/channel/templates?id={id}",
    "bodyDescription": "—",
    "scopes": [
      "channel"
    ],
    "errors": "—",
    "purpose": "Obter modelos aprovados de canal Enterprise.",
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
    "id": 16,
    "area": "Departamentos",
    "title": "Todos",
    "method": "GET",
    "path": "/client/department/all",
    "bodyDescription": "—",
    "scopes": [
      "department"
    ],
    "errors": "—",
    "purpose": "Listar departamentos.",
    "mode": "client",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 17,
    "area": "Operadores",
    "title": "Todos",
    "method": "GET",
    "path": "/client/operator/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "operator"
    ],
    "errors": "—",
    "purpose": "Listar operadores.",
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
    "id": 18,
    "area": "Monitores",
    "title": "Todos",
    "method": "GET",
    "path": "/client/monitor/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "monitor"
    ],
    "errors": "—",
    "purpose": "Listar monitores.",
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
    "id": 19,
    "area": "Grupos de Contatos",
    "title": "Todos",
    "method": "GET",
    "path": "/client/groups/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "group"
    ],
    "errors": "—",
    "purpose": "Listar grupos de contatos.",
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
    "id": 20,
    "area": "Grupos de Contatos",
    "title": "Contatos",
    "method": "GET",
    "path": "/client/groups/contacts?id={id}&p={p}",
    "bodyDescription": "—",
    "scopes": [
      "group"
    ],
    "errors": "—",
    "purpose": "Listar contatos de um grupo.",
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
  },
  {
    "id": 21,
    "area": "Grupos de Contatos",
    "title": "Vincular",
    "method": "POST",
    "path": "/client/groups/add",
    "bodyDescription": "id; contact",
    "scopes": [
      "group",
      "contact",
      "write"
    ],
    "errors": "invalid_group, invalid_contact, exists_contact",
    "purpose": "Vincular contato ao grupo.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "contact",
        "label": "Contato",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 22,
    "area": "Grupos de Contatos",
    "title": "Remover",
    "method": "DELETE",
    "path": "/client/groups/remove",
    "bodyDescription": "id; contact",
    "scopes": [
      "group",
      "contact",
      "remove"
    ],
    "errors": "invalid_group, invalid_contact, exists_contact",
    "purpose": "Remover vínculo do contato com grupo.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "contact",
        "label": "Contato",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": "Não chamado. exists_contact também é listado para contato não vinculado; confirmar semântica do erro."
  },
  {
    "id": 23,
    "area": "Campanhas",
    "title": "Todas",
    "method": "GET",
    "path": "/client/campaign/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "campaign"
    ],
    "errors": "—",
    "purpose": "Listar campanhas.",
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
    "id": 24,
    "area": "Campanhas",
    "title": "Resumo",
    "method": "GET",
    "path": "/client/campaign/resume?id={id}",
    "bodyDescription": "—",
    "scopes": [
      "campaign"
    ],
    "errors": "invalid_campaign",
    "purpose": "Consultar resumo e indicadores da campanha.",
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
    "id": 25,
    "area": "Campanhas",
    "title": "Mensagens",
    "method": "GET",
    "path": "/client/campaign/messages?id={id}&p={p}",
    "bodyDescription": "—",
    "scopes": [
      "campaign"
    ],
    "errors": "invalid_campaign",
    "purpose": "Listar mensagens da campanha.",
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
  },
  {
    "id": 26,
    "area": "Campanhas",
    "title": "Criar",
    "method": "POST",
    "path": "/client/campaign/create",
    "bodyDescription": "Obrigatórios: canal_id:string codificado, titulo:string até 255, tipo_campanha:number 1 ou 3, conteudo:array de itens com type e value obrigatórios (caption/color opcionais conforme tipo). Para transmissão: tipo_filtro:string obrigatório; contatos_filtro:array<string ou number> se contatos; grupos_filtro:array IDs codificados se grupos; sexo_filtro:string M/F/I se sexo; etiquetas_filtro:array<string ou number> se etiquetas. etiquetas_campanha:array<string ou number> opcional",
    "scopes": [
      "campaign"
    ],
    "errors": "validation_error",
    "purpose": "Criar campanha broadcast ou status, conforme canal e conteúdo.",
    "mode": "client",
    "fields": [
      {
        "name": "canal_id",
        "label": "Canal",
        "type": "text",
        "required": true
      },
      {
        "name": "titulo",
        "label": "Título",
        "type": "text",
        "required": true
      },
      {
        "name": "tipo_campanha",
        "label": "Tipo da campanha",
        "type": "number",
        "required": true,
        "options": [
          "1",
          "3"
        ]
      },
      {
        "name": "conteudo",
        "label": "Conteúdo da campanha",
        "type": "content",
        "required": true
      },
      {
        "name": "tipo_filtro",
        "label": "Destinatários",
        "type": "select",
        "required": false,
        "options": [
          "todos",
          "contatos",
          "grupos",
          "sexo",
          "etiquetas"
        ],
        "when": {
          "field": "tipo_campanha",
          "values": [
            "1"
          ]
        }
      },
      {
        "name": "contatos_filtro",
        "label": "Contatos",
        "type": "array",
        "required": false,
        "when": {
          "field": "tipo_filtro",
          "values": [
            "contatos"
          ]
        }
      },
      {
        "name": "grupos_filtro",
        "label": "Grupos",
        "type": "array",
        "required": false,
        "when": {
          "field": "tipo_filtro",
          "values": [
            "grupos"
          ]
        }
      },
      {
        "name": "sexo_filtro",
        "label": "Gênero",
        "type": "select",
        "required": false,
        "options": [
          "M",
          "F",
          "I"
        ],
        "when": {
          "field": "tipo_filtro",
          "values": [
            "sexo"
          ]
        }
      },
      {
        "name": "etiquetas_filtro",
        "label": "Etiquetas",
        "type": "array",
        "required": false,
        "when": {
          "field": "tipo_filtro",
          "values": [
            "etiquetas"
          ]
        }
      },
      {
        "name": "etiquetas_campanha",
        "label": "Etiquetas da campanha",
        "type": "array",
        "required": false
      }
    ],
    "contractNote": ""
  },
  {
    "id": 27,
    "area": "Etiquetas",
    "title": "Todas",
    "method": "GET",
    "path": "/client/tag/all",
    "bodyDescription": "—",
    "scopes": [
      "tag"
    ],
    "errors": "—",
    "purpose": "Listar etiquetas.",
    "mode": "client",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 28,
    "area": "Etiquetas",
    "title": "Vincular",
    "method": "POST",
    "path": "/client/tag/contact/add",
    "bodyDescription": "tag; contact",
    "scopes": [
      "tag",
      "write"
    ],
    "errors": "invalid_param, invalid_tag, invalid_contact, tag_exists",
    "purpose": "Vincular etiqueta ao contato.",
    "mode": "client",
    "fields": [
      {
        "name": "tag",
        "label": "Etiqueta",
        "type": "text",
        "required": true
      },
      {
        "name": "contact",
        "label": "Contato",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 29,
    "area": "Etiquetas",
    "title": "Remover",
    "method": "DELETE",
    "path": "/client/tag/contact/remove",
    "bodyDescription": "contact",
    "scopes": [
      "tag",
      "remove"
    ],
    "errors": "invalid_param, invalid_contact",
    "purpose": "Remover etiquetas do contato.",
    "mode": "client",
    "fields": [
      {
        "name": "contact",
        "label": "Contato",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 30,
    "area": "Protocolos",
    "title": "Todos",
    "method": "GET",
    "path": "/client/protocol/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "—",
    "purpose": "Listar protocolos do Gestor.",
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
    "id": 31,
    "area": "Protocolos",
    "title": "Filtros",
    "method": "POST",
    "path": "/client/protocol/search?p={p}&filter={filter}",
    "bodyDescription": "Campos condicionados ao filtro: open:boolean, att:boolean, search:string, start_at/finish_at:string (AAAA-MM-DD), operator/department/tag:string; posição de filter:int diverge entre descrição e painel",
    "scopes": [
      "protocol"
    ],
    "errors": "—",
    "purpose": "Buscar protocolos por estado, contato, período, operador, departamento ou etiqueta.",
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
        "name": "open",
        "label": "Aberto",
        "type": "boolean",
        "required": false
      },
      {
        "name": "att",
        "label": "Em atendimento",
        "type": "boolean",
        "required": false
      },
      {
        "name": "search",
        "label": "Busca",
        "type": "text",
        "required": false
      },
      {
        "name": "start_at",
        "label": "Data inicial",
        "type": "text",
        "required": false
      },
      {
        "name": "finish_at",
        "label": "Data final",
        "type": "text",
        "required": false
      },
      {
        "name": "operator",
        "label": "Operador",
        "type": "text",
        "required": false
      },
      {
        "name": "department",
        "label": "Departamento",
        "type": "text",
        "required": false
      },
      {
        "name": "tag",
        "label": "Etiqueta",
        "type": "text",
        "required": false
      }
    ],
    "contractNote": ""
  },
  {
    "id": 32,
    "area": "Protocolos",
    "title": "Detalhes",
    "method": "GET",
    "path": "/client/protocol/info?protocol={protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "invalid_protocol",
    "purpose": "Consultar protocolo.",
    "mode": "client",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 33,
    "area": "Protocolos",
    "title": "Mensagens",
    "method": "GET",
    "path": "/client/protocol/messages?protocol={protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "invalid_protocol",
    "purpose": "Consultar mensagens do protocolo.",
    "mode": "client",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 34,
    "area": "Protocolos",
    "title": "Observações",
    "method": "GET",
    "path": "/client/protocol/observations?protocol={protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "invalid_protocol",
    "purpose": "Listar observações de protocolo.",
    "mode": "client",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 35,
    "area": "Protocolos",
    "title": "Adicionar observação",
    "method": "POST",
    "path": "/client/protocol/addObservations",
    "bodyDescription": "protocolo; observacao",
    "scopes": [
      "protocol"
    ],
    "errors": "invalid_protocol",
    "purpose": "Adicionar observação.",
    "mode": "client",
    "fields": [
      {
        "name": "protocolo",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "observacao",
        "label": "Observação",
        "type": "textarea",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 36,
    "area": "Protocolos",
    "title": "Enviar",
    "method": "POST",
    "path": "/client/protocol/send",
    "bodyDescription": "protocol; type; campos do contrato G-MENSAGEM (ver dicionário)",
    "scopes": [
      "protocol",
      "send"
    ],
    "errors": "invalid_protocol, closed_protocol, protocol_in_att, invalid_type, invalid_param, error_send",
    "purpose": "Enviar mensagem em protocolo aberto em AUTOATENDIMENTO.",
    "mode": "client",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "type",
        "label": "Tipo",
        "type": "select",
        "required": true,
        "options": [
          "text",
          "image",
          "audio",
          "video",
          "file",
          "map",
          "vcard"
        ]
      },
      {
        "name": "text",
        "label": "Texto",
        "type": "textarea",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "text",
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "url",
        "label": "URL do arquivo",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "vname",
        "label": "Nome do contato",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "vcard"
          ]
        }
      },
      {
        "name": "phone",
        "label": "Telefone do contato",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "vcard"
          ]
        }
      },
      {
        "name": "place",
        "label": "Local",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "lat",
        "label": "Latitude",
        "type": "number",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "lon",
        "label": "Longitude",
        "type": "number",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      }
    ],
    "contractNote": "Usado também em atendimento operacional: divergência confirmada com o contrato. Limites de mídia e fallback data URL também divergem. E1:1741,2523,2974,3185."
  },
  {
    "id": 37,
    "area": "Protocolos",
    "title": "Recados",
    "method": "PUT",
    "path": "/client/protocol/to_inbox?protocol={protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "write"
    ],
    "errors": "invalid_protocol",
    "purpose": "Transformar protocolo de autoatendimento em recado.",
    "mode": "client",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 38,
    "area": "Protocolos",
    "title": "Finalizar",
    "method": "DELETE",
    "path": "/client/protocol/finish",
    "bodyDescription": "protocol; notify_contact:boolean; notify_text opcional",
    "scopes": [
      "protocol",
      "remove"
    ],
    "errors": "invalid_protocol, closed_protocol",
    "purpose": "Finalizar protocolo aberto pelo Gestor; notificação opcional.",
    "mode": "client",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "notify_contact",
        "label": "Notificar contato",
        "type": "boolean",
        "required": true
      },
      {
        "name": "notify_text",
        "label": "Texto da notificação",
        "type": "textarea",
        "required": false
      },
      {
        "name": "vote",
        "label": "Avaliação operacional",
        "type": "number",
        "required": false
      }
    ],
    "contractNote": ""
  },
  {
    "id": 39,
    "area": "Notificações",
    "title": "Contato",
    "method": "POST",
    "path": "/client/notification/contact",
    "bodyDescription": "contact; type; campos G-MENSAGEM; channel?; template?; variables? (body/header/buttons)",
    "scopes": [
      "send",
      "contact",
      "notification"
    ],
    "errors": "invalid_param, invalid_type, invalid_contact",
    "purpose": "Enfileirar envio a contato existente, mesmo sem protocolo aberto.",
    "mode": "client",
    "fields": [
      {
        "name": "contact",
        "label": "Contato",
        "type": "text",
        "required": true
      },
      {
        "name": "type",
        "label": "Tipo",
        "type": "select",
        "required": true,
        "options": [
          "text",
          "image",
          "audio",
          "video",
          "file",
          "map",
          "vcard",
          "template",
          "waba_template"
        ]
      },
      {
        "name": "text",
        "label": "Texto",
        "type": "textarea",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "text",
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "url",
        "label": "URL do arquivo",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "vname",
        "label": "Nome do contato",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "vcard"
          ]
        }
      },
      {
        "name": "phone",
        "label": "Telefone do contato",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "vcard"
          ]
        }
      },
      {
        "name": "place",
        "label": "Local",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "lat",
        "label": "Latitude",
        "type": "number",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "lon",
        "label": "Longitude",
        "type": "number",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "channel",
        "label": "Canal",
        "type": "text",
        "required": false
      },
      {
        "name": "template",
        "label": "Template aprovado",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "template",
            "waba_template"
          ]
        }
      },
      {
        "name": "variables",
        "label": "Variáveis do template",
        "type": "variables",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "template",
            "waba_template"
          ]
        }
      }
    ],
    "contractNote": ""
  },
  {
    "id": 40,
    "area": "Notificações",
    "title": "Direto",
    "method": "POST",
    "path": "/client/notification/direct",
    "bodyDescription": "number; name; type; campos G-MENSAGEM; channel?; template?; variables? (body/header/buttons)",
    "scopes": [
      "send",
      "import",
      "contact",
      "notification"
    ],
    "errors": "invalid_param, invalid_type, invalid_number, invalid_channel, error_valid_wpp, invalid_wpp, error_import",
    "purpose": "Enviar por número, com importação/validação interna do contato.",
    "mode": "client",
    "fields": [
      {
        "name": "number",
        "label": "Número com DDI e DDD",
        "type": "text",
        "required": true
      },
      {
        "name": "name",
        "label": "Nome",
        "type": "text",
        "required": true
      },
      {
        "name": "type",
        "label": "Tipo",
        "type": "select",
        "required": true,
        "options": [
          "text",
          "image",
          "audio",
          "video",
          "file",
          "map",
          "vcard",
          "template",
          "waba_template"
        ]
      },
      {
        "name": "text",
        "label": "Texto",
        "type": "textarea",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "text",
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "url",
        "label": "URL do arquivo",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "vname",
        "label": "Nome do contato",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "vcard"
          ]
        }
      },
      {
        "name": "phone",
        "label": "Telefone do contato",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "vcard"
          ]
        }
      },
      {
        "name": "place",
        "label": "Local",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "lat",
        "label": "Latitude",
        "type": "number",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "lon",
        "label": "Longitude",
        "type": "number",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "channel",
        "label": "Canal",
        "type": "text",
        "required": true
      },
      {
        "name": "template",
        "label": "Template aprovado",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "template",
            "waba_template"
          ]
        }
      },
      {
        "name": "variables",
        "label": "Variáveis do template",
        "type": "variables",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "template",
            "waba_template"
          ]
        }
      }
    ],
    "contractNote": ""
  },
  {
    "id": 41,
    "area": "Notificações",
    "title": "Status",
    "method": "GET",
    "path": "/client/notification/status?id={id}",
    "bodyDescription": "—",
    "scopes": [
      "notification"
    ],
    "errors": "—",
    "purpose": "Consultar status da notificação enfileirada.",
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
  },
  {
    "id": 45,
    "area": "Cupom",
    "title": "Todos",
    "method": "GET",
    "path": "/client/coupon/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "coupon"
    ],
    "errors": "permission_denied",
    "purpose": "Listar cupons.",
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
    "id": 46,
    "area": "Cupom",
    "title": "Contatos",
    "method": "GET",
    "path": "/client/coupon/codes?id={id}&p={p}",
    "bodyDescription": "—",
    "scopes": [
      "coupon"
    ],
    "errors": "permission_denied, invalid_coupon",
    "purpose": "Listar códigos/contatos do cupom.",
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
  },
  {
    "id": 47,
    "area": "Cupom",
    "title": "Usar",
    "method": "PATCH",
    "path": "/client/coupon/code/used",
    "bodyDescription": "id; code",
    "scopes": [
      "coupon",
      "edit"
    ],
    "errors": "permission_denied, invalid_coupon, invalid_code",
    "purpose": "Marcar código do cupom como utilizado.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "code",
        "label": "Código",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 48,
    "area": "SMSIDEAL",
    "title": "Contato",
    "method": "POST",
    "path": "/client/sms/contact",
    "bodyDescription": "id; com:1,2 ou 4; flash:boolean; text",
    "scopes": [
      "send",
      "contact",
      "smsideal"
    ],
    "errors": "permission_denied, invalid_contact, invalid_param",
    "purpose": "Enviar SMS a contato.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "com",
        "label": "Serviço SMS",
        "type": "select",
        "required": true,
        "options": [
          "1",
          "2",
          "4"
        ]
      },
      {
        "name": "flash",
        "label": "SMS flash",
        "type": "boolean",
        "required": true
      },
      {
        "name": "text",
        "label": "Texto",
        "type": "textarea",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 49,
    "area": "SMSIDEAL",
    "title": "Direto",
    "method": "POST",
    "path": "/client/sms/direct",
    "bodyDescription": "number; com:1,2 ou 4; flash:boolean; text",
    "scopes": [
      "send",
      "smsideal"
    ],
    "errors": "permission_denied, invalid_param, invalid_service",
    "purpose": "Enviar SMS diretamente por número.",
    "mode": "client",
    "fields": [
      {
        "name": "number",
        "label": "Número com DDI e DDD",
        "type": "text",
        "required": true
      },
      {
        "name": "com",
        "label": "Serviço SMS",
        "type": "select",
        "required": true,
        "options": [
          "1",
          "2",
          "4"
        ]
      },
      {
        "name": "flash",
        "label": "SMS flash",
        "type": "boolean",
        "required": true
      },
      {
        "name": "text",
        "label": "Texto",
        "type": "textarea",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 50,
    "area": "Produtos",
    "title": "Categorias",
    "method": "GET",
    "path": "/products/cat/all?p={p}",
    "bodyDescription": "—",
    "scopes": [
      "product"
    ],
    "errors": "permission_denied",
    "purpose": "Listar categorias de produtos.",
    "mode": "client",
    "fields": [
      {
        "name": "p",
        "label": "Página",
        "type": "number",
        "required": true
      }
    ],
    "contractNote": "Não chamado. Rota sem /client na documentação; confirmar antes de implementar."
  },
  {
    "id": 51,
    "area": "Produtos",
    "title": "Produtos da categoria",
    "method": "GET",
    "path": "/client/products/cat/itens?id={id}&p={p}",
    "bodyDescription": "—",
    "scopes": [
      "product"
    ],
    "errors": "permission_denied, invalid_cat",
    "purpose": "Listar produtos de categoria.",
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
  },
  {
    "id": 52,
    "area": "Correios",
    "title": "Contato",
    "method": "POST",
    "path": "/client/correios/contact",
    "bodyDescription": "id; code",
    "scopes": [
      "correios",
      "write"
    ],
    "errors": "permission_denied, invalid_param, invalid_contact, exists_code, invalid_code",
    "purpose": "Vincular código de rastreamento ao contato.",
    "mode": "client",
    "fields": [
      {
        "name": "id",
        "label": "Identificador",
        "type": "text",
        "required": true
      },
      {
        "name": "code",
        "label": "Código",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 53,
    "area": "Correios",
    "title": "Status",
    "method": "GET",
    "path": "/client/correios/status?code={code}",
    "bodyDescription": "—",
    "scopes": [
      "correios"
    ],
    "errors": "permission_denied",
    "purpose": "Consultar status de rastreamento.",
    "mode": "client",
    "fields": [
      {
        "name": "code",
        "label": "Código",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 54,
    "area": "Portabilidade",
    "title": "Verificar",
    "method": "GET",
    "path": "/client/portable/check?number={number}",
    "bodyDescription": "—",
    "scopes": [
      "portable"
    ],
    "errors": "permission_denied",
    "purpose": "Consultar portabilidade/operadora de número.",
    "mode": "client",
    "fields": [
      {
        "name": "number",
        "label": "Número com DDI e DDD",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 55,
    "area": "Agendamento",
    "title": "Operador",
    "method": "GET",
    "path": "/client/schedule/operator?operator={operator}&start_at={start_at}&finish_at={finish_at}&p={p}",
    "bodyDescription": "—",
    "scopes": [
      "operator",
      "schedule"
    ],
    "errors": "invalid_operator, invalid_param",
    "purpose": "Listar agendamentos de operador entre datas.",
    "mode": "client",
    "fields": [
      {
        "name": "operator",
        "label": "Operador",
        "type": "text",
        "required": true
      },
      {
        "name": "start_at",
        "label": "Data inicial",
        "type": "text",
        "required": true
      },
      {
        "name": "finish_at",
        "label": "Data final",
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
  },
  {
    "id": 56,
    "area": "Carteira de Clientes",
    "title": "Todos",
    "method": "GET",
    "path": "/client/wallet/all?operator={operator}&p={p}",
    "bodyDescription": "—",
    "scopes": [
      "operator",
      "wallet_client"
    ],
    "errors": "permission_denied, invalid_operator",
    "purpose": "Listar carteira de clientes do operador.",
    "mode": "client",
    "fields": [
      {
        "name": "operator",
        "label": "Operador",
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
  },
  {
    "id": 57,
    "area": "Carteira de Clientes",
    "title": "Adicionar",
    "method": "POST",
    "path": "/client/wallet/add",
    "bodyDescription": "operator; contact",
    "scopes": [
      "operator",
      "contact",
      "wallet_client",
      "write"
    ],
    "errors": "permission_denied, invalid_operator, invalid_contact, exist_contact",
    "purpose": "Vincular contato à carteira.",
    "mode": "client",
    "fields": [
      {
        "name": "operator",
        "label": "Operador",
        "type": "text",
        "required": true
      },
      {
        "name": "contact",
        "label": "Contato",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 58,
    "area": "Carteira de Clientes",
    "title": "Remover",
    "method": "POST",
    "path": "/client/wallet/remove",
    "bodyDescription": "operator; contact",
    "scopes": [
      "operator",
      "contact",
      "remove",
      "wallet_client"
    ],
    "errors": "permission_denied, invalid_operator, invalid_contact, invalid_client",
    "purpose": "Remover contato da carteira.",
    "mode": "client",
    "fields": [
      {
        "name": "operator",
        "label": "Operador",
        "type": "text",
        "required": true
      },
      {
        "name": "contact",
        "label": "Contato",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 59,
    "area": "API Telefonia",
    "title": "Ramais",
    "method": "GET",
    "path": "/client/voip/extensions",
    "bodyDescription": "—",
    "scopes": [
      "voip"
    ],
    "errors": "permission_denied",
    "purpose": "Listar ramais.",
    "mode": "client",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 60,
    "area": "API Telefonia",
    "title": "Solicitar chamada",
    "method": "POST",
    "path": "/client/voip/call",
    "bodyDescription": "Descrição: contact e extension opcional. Painel: operator e contact. Contrato ambíguo",
    "scopes": [
      "voip"
    ],
    "errors": "permission_denied, invalid_contact, error_voip_request",
    "purpose": "Solicitar chamada VoIP.",
    "mode": "client",
    "fields": [
      {
        "name": "contact",
        "label": "Contato",
        "type": "text",
        "required": true
      },
      {
        "name": "extension",
        "label": "Ramal",
        "type": "text",
        "required": false
      },
      {
        "name": "operator",
        "label": "Operador",
        "type": "text",
        "required": false
      }
    ],
    "contractNote": ""
  },
  {
    "id": 61,
    "area": "Operador — Login",
    "title": "Login",
    "method": "POST",
    "path": "/operator/auth2/login",
    "bodyDescription": "client; password; operator_id; scopes (descrição) OU scope (painel)",
    "scopes": [],
    "errors": "invalid_params, invalid_scope, invalid_auth",
    "purpose": "Autenticar operador; introdução também exige fluxo Authorization Code.",
    "mode": "operator",
    "fields": [
      {
        "name": "client",
        "label": "Client ID",
        "type": "text",
        "required": true
      },
      {
        "name": "password",
        "label": "Credencial",
        "type": "text",
        "required": true
      },
      {
        "name": "operator_id",
        "label": "Operador vinculado",
        "type": "text",
        "required": true
      },
      {
        "name": "scopes",
        "label": "Permissões externas",
        "type": "array",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 62,
    "area": "Perfil",
    "title": "Dados",
    "method": "GET",
    "path": "/operator/perfil/info",
    "bodyDescription": "—",
    "scopes": [
      "profile"
    ],
    "errors": "—",
    "purpose": "Consultar perfil do operador autenticado.",
    "mode": "operator",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 63,
    "area": "Perfil",
    "title": "Editar",
    "method": "PATCH",
    "path": "/operator/perfil/edit",
    "bodyDescription": "type:string status ou nickname; status usa status:boolean e motivation:string; nickname usa nickname:string",
    "scopes": [
      "profile",
      "edit"
    ],
    "errors": "invalid_type, invalid_param",
    "purpose": "Editar apelido ou disponibilidade do operador.",
    "mode": "operator",
    "fields": [
      {
        "name": "type",
        "label": "Tipo",
        "type": "select",
        "required": true,
        "options": [
          "status",
          "nickname"
        ]
      },
      {
        "name": "status",
        "label": "Ativo / bloqueado",
        "type": "boolean",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "status"
          ]
        }
      },
      {
        "name": "motivation",
        "label": "Motivo",
        "type": "textarea",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "status"
          ]
        }
      },
      {
        "name": "nickname",
        "label": "Apelido",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "nickname"
          ]
        }
      }
    ],
    "contractNote": ""
  },
  {
    "id": 64,
    "area": "Perfil",
    "title": "Módulos",
    "method": "GET",
    "path": "/operator/perfil/modules",
    "bodyDescription": "—",
    "scopes": [
      "profile"
    ],
    "errors": "—",
    "purpose": "Listar módulos habilitados para operador.",
    "mode": "operator",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 65,
    "area": "Respostas Rápidas",
    "title": "Listar",
    "method": "GET",
    "path": "/answers/all",
    "bodyDescription": "—",
    "scopes": [
      "quick_anwser"
    ],
    "errors": "—",
    "purpose": "Listar respostas rápidas.",
    "mode": "operator",
    "fields": [],
    "contractNote": "Não chamado. Prefixo e grafia do scope inconsistentes; confirmar."
  },
  {
    "id": 66,
    "area": "Respostas Rápidas",
    "title": "Adicionar",
    "method": "POST",
    "path": "/answers/add",
    "bodyDescription": "title; text (painel)",
    "scopes": [
      "quick_awnser",
      "write"
    ],
    "errors": "—",
    "purpose": "Cadastrar resposta rápida.",
    "mode": "operator",
    "fields": [
      {
        "name": "title",
        "label": "Título",
        "type": "text",
        "required": true
      },
      {
        "name": "text",
        "label": "Texto",
        "type": "textarea",
        "required": true
      }
    ],
    "contractNote": "Não chamado. Prefixo e grafia do scope inconsistentes; confirmar."
  },
  {
    "id": 67,
    "area": "Respostas Rápidas",
    "title": "Remover",
    "method": "DELETE",
    "path": "/operator/answers/remove",
    "bodyDescription": "id (painel)",
    "scopes": [
      "quick_awnser",
      "remove"
    ],
    "errors": "invalid_answer",
    "purpose": "Remover resposta rápida.",
    "mode": "operator",
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
    "id": 68,
    "area": "Recuperar Contato",
    "title": "Últimos",
    "method": "GET",
    "path": "/operator/recover/list",
    "bodyDescription": "—",
    "scopes": [
      "recover_contact"
    ],
    "errors": "permission_denied",
    "purpose": "Listar dez últimos contatos recuperáveis.",
    "mode": "operator",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 69,
    "area": "Recuperar Contato",
    "title": "Filtro",
    "method": "GET",
    "path": "/operator/recover/search?s={s}",
    "bodyDescription": "—",
    "scopes": [
      "recover_contact"
    ],
    "errors": "permission_denied",
    "purpose": "Buscar contato para recuperação.",
    "mode": "operator",
    "fields": [
      {
        "name": "s",
        "label": "Busca",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 70,
    "area": "Recuperar Contato",
    "title": "Encaminhar",
    "method": "POST",
    "path": "/operator/recover/contact",
    "bodyDescription": "id",
    "scopes": [
      "recover_contact",
      "write"
    ],
    "errors": "permission_denied, contact_in_att, invalid_departments, invalid_channel, invalid_contact",
    "purpose": "Recuperar/direcionar contato para atendimento operacional.",
    "mode": "operator",
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
    "id": 71,
    "area": "Atendimentos",
    "title": "Últimos",
    "method": "GET",
    "path": "/operator/att/access",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "—",
    "purpose": "Listar dez últimos atendimentos de acesso do operador.",
    "mode": "operator",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 72,
    "area": "Atendimentos",
    "title": "Fila",
    "method": "GET",
    "path": "/operator/att/queue",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "—",
    "purpose": "Consultar fila operacional.",
    "mode": "operator",
    "fields": [],
    "contractNote": ""
  },
  {
    "id": 73,
    "area": "Atendimentos",
    "title": "Selecionar",
    "method": "PATCH",
    "path": "/operator/att/select/{protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "edit"
    ],
    "errors": "protocol_finished, protocol_not_avaliable, invalid_protocol",
    "purpose": "Selecionar atendimento antes das operações do operador.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 74,
    "area": "Atendimentos",
    "title": "Protocolo",
    "method": "GET",
    "path": "/operator/att/info/{protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "OP-BASE",
    "purpose": "Consultar atendimento selecionado.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 75,
    "area": "Atendimentos",
    "title": "Contato",
    "method": "GET",
    "path": "/operator/att/contact/{protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "contact"
    ],
    "errors": "OP-BASE",
    "purpose": "Consultar contato do atendimento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 76,
    "area": "Atendimentos",
    "title": "Mensagens",
    "method": "GET",
    "path": "/operator/att/messages/{protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "OP-BASE",
    "purpose": "Consultar mensagens do atendimento selecionado.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 77,
    "area": "Atendimentos",
    "title": "Histórico",
    "method": "GET",
    "path": "/operator/att/historic/{protocol}",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "historic_permission, historic_complete",
    "purpose": "Carregar histórico de protocolos anteriores do contato, sujeito à permissão.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 78,
    "area": "Atendimentos",
    "title": "Enviar mensagem",
    "method": "POST",
    "path": "/operator/att/send/{protocol}",
    "bodyDescription": "type; campos O-MENSAGEM (ver dicionário); protocol no path",
    "scopes": [
      "protocol",
      "send"
    ],
    "errors": "OP-BASE, invalid_param, size_url",
    "purpose": "Enviar mensagem no atendimento operacional selecionado.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "type",
        "label": "Tipo",
        "type": "select",
        "required": true,
        "options": [
          "text",
          "image",
          "audio",
          "video",
          "file",
          "map",
          "vcard"
        ]
      },
      {
        "name": "text",
        "label": "Texto",
        "type": "textarea",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "text",
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "url",
        "label": "URL do arquivo",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "caption",
        "label": "Legenda",
        "type": "textarea",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "image",
            "audio",
            "video",
            "file"
          ]
        }
      },
      {
        "name": "vname",
        "label": "Nome do contato",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "vcard"
          ]
        }
      },
      {
        "name": "phone",
        "label": "Telefone do contato",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "vcard"
          ]
        }
      },
      {
        "name": "place",
        "label": "Local",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "lat",
        "label": "Latitude",
        "type": "number",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      },
      {
        "name": "lon",
        "label": "Longitude",
        "type": "number",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "map"
          ]
        }
      }
    ],
    "contractNote": ""
  },
  {
    "id": 79,
    "area": "Atendimentos",
    "title": "Mensagem",
    "method": "GET",
    "path": "/operator/att/message/{protocol}/{message}",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "OP-BASE, invalid_message",
    "purpose": "Consultar uma mensagem pelo identificador.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "message",
        "label": "Mensagem",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 80,
    "area": "Atendimentos",
    "title": "Reenvio",
    "method": "PATCH",
    "path": "/operator/att/resend/{protocol}/{message}",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "send"
    ],
    "errors": "OP-BASE, invalid_message",
    "purpose": "Reenviar mensagem do atendimento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "message",
        "label": "Mensagem",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 81,
    "area": "Atendimentos",
    "title": "Observações",
    "method": "GET",
    "path": "/operator/att/observations/{protocol}/all",
    "bodyDescription": "—",
    "scopes": [
      "protocol"
    ],
    "errors": "OP-BASE",
    "purpose": "Listar observações.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 82,
    "area": "Atendimentos",
    "title": "Nova observação",
    "method": "POST",
    "path": "/operator/att/observations/{protocol}/add",
    "bodyDescription": "text (painel)",
    "scopes": [
      "protocol",
      "write"
    ],
    "errors": "OP-BASE",
    "purpose": "Adicionar observação ao atendimento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "text",
        "label": "Texto",
        "type": "textarea",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 83,
    "area": "Atendimentos",
    "title": "Grupos",
    "method": "GET",
    "path": "/operator/att/groups/{protocol}/all",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "group"
    ],
    "errors": "OP-BASE",
    "purpose": "Listar grupos vinculados ao contato em atendimento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 84,
    "area": "Atendimentos",
    "title": "Vincular grupo",
    "method": "PATCH",
    "path": "/operator/att/groups/{protocol}/add/{group}",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "group",
      "write"
    ],
    "errors": "OP-BASE, exists_contact, invalid_group",
    "purpose": "Vincular contato a grupo pelo atendimento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "group",
        "label": "Grupo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 85,
    "area": "Atendimentos",
    "title": "Desvincular grupo",
    "method": "PATCH",
    "path": "/operator/att/groups/{protocol}/remove/{group}",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "group",
      "remove"
    ],
    "errors": "OP-BASE, invalid_group, error_contact",
    "purpose": "Remover vínculo com grupo.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "group",
        "label": "Grupo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 86,
    "area": "Atendimentos",
    "title": "Etiquetas",
    "method": "GET",
    "path": "/operator/att/tags/{protocol}/all",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "tag"
    ],
    "errors": "OP-BASE",
    "purpose": "Listar etiquetas do contato em atendimento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 87,
    "area": "Atendimentos",
    "title": "Vincular etiqueta",
    "method": "PATCH",
    "path": "/operator/att/tags/{protocol}/add/{tag}",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "tag",
      "write"
    ],
    "errors": "OP-BASE, invalid_tag",
    "purpose": "Vincular etiqueta pelo atendimento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "tag",
        "label": "Etiqueta",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 88,
    "area": "Atendimentos",
    "title": "Operadores",
    "method": "GET",
    "path": "/operator/att/operators/{protocol}/all",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "operator"
    ],
    "errors": "OP-BASE",
    "purpose": "Listar operadores disponíveis para encaminhamento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 89,
    "area": "Atendimentos",
    "title": "Departamentos",
    "method": "GET",
    "path": "/operator/att/departments/{protocol}/all",
    "bodyDescription": "—",
    "scopes": [
      "protocol",
      "department"
    ],
    "errors": "OP-BASE",
    "purpose": "Listar departamentos disponíveis para encaminhamento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      }
    ],
    "contractNote": ""
  },
  {
    "id": 90,
    "area": "Atendimentos",
    "title": "Encaminhar",
    "method": "PATCH",
    "path": "/operator/att/forward/{protocol}",
    "bodyDescription": "to:operator com operator; OU to:department com department",
    "scopes": [
      "protocol",
      "write"
    ],
    "errors": "OP-BASE, invalid_param, invalid_department, operators_off, invalid_operator, operator_off, error_forward",
    "purpose": "Transferir atendimento selecionado a operador/departamento.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "to",
        "label": "Destino",
        "type": "select",
        "required": true,
        "options": [
          "operator",
          "department"
        ]
      },
      {
        "name": "operator",
        "label": "Operador",
        "type": "text",
        "required": false,
        "when": {
          "field": "to",
          "values": [
            "operator"
          ]
        }
      },
      {
        "name": "department",
        "label": "Departamento",
        "type": "text",
        "required": false,
        "when": {
          "field": "to",
          "values": [
            "department"
          ]
        }
      }
    ],
    "contractNote": ""
  },
  {
    "id": 91,
    "area": "Atendimentos",
    "title": "Editar contato",
    "method": "PATCH",
    "path": "/operator/att/contact/{protocol}/edit",
    "bodyDescription": "type:string name/email/gender; name:string, email:string ou gender:M/F/I conforme type",
    "scopes": [
      "protocol",
      "contact",
      "edit"
    ],
    "errors": "OP-BASE",
    "purpose": "Editar contato do atendimento selecionado.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "type",
        "label": "Tipo",
        "type": "select",
        "required": true,
        "options": [
          "name",
          "email",
          "gender"
        ]
      },
      {
        "name": "name",
        "label": "Nome",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "name"
          ]
        }
      },
      {
        "name": "email",
        "label": "Email",
        "type": "text",
        "required": false,
        "when": {
          "field": "type",
          "values": [
            "email"
          ]
        }
      },
      {
        "name": "gender",
        "label": "Gênero",
        "type": "select",
        "required": false,
        "options": [
          "M",
          "F",
          "I"
        ],
        "when": {
          "field": "type",
          "values": [
            "gender"
          ]
        }
      }
    ],
    "contractNote": ""
  },
  {
    "id": 92,
    "area": "Atendimentos",
    "title": "Finalizar",
    "method": "PATCH",
    "path": "/operator/att/finish/{protocol}",
    "bodyDescription": "vote: número na descrição; string no painel",
    "scopes": [
      "protocol",
      "edit"
    ],
    "errors": "OP-BASE",
    "purpose": "Finalizar atendimento operacional com parâmetro de votação.",
    "mode": "operator",
    "fields": [
      {
        "name": "protocol",
        "label": "Protocolo",
        "type": "text",
        "required": true
      },
      {
        "name": "vote",
        "label": "Votação",
        "type": "number",
        "required": true
      }
    ],
    "contractNote": "Não chamado. Finalização atual do Gestor é documentada; votação e fluxo do operador ausentes."
  }
];

export const SAC_MEDIA_LIMITS = Object.freeze({image:1048576,audio:3145728,video:5242880,file:5242880});
export function mediaLimit(type) {
  const limit = SAC_MEDIA_LIMITS[type];
  if (!limit) throw new Error('Tipo de mídia não suportado.');
  return limit;
}
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonicalJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export function mergeDeliveryEvidence(current, next) {
  const rank={preparing:0,unknown:0,queued:1,sent:2,delivered:3,read:4};
  if (!(next in rank) && next !== 'failed') return current || 'unknown';
  if (next === 'failed') return ['delivered','read'].includes(current) ? current : 'failed';
  return (rank[next] ?? 0) >= (rank[current] ?? 0) ? next : current;
}
export function fieldVisible(field, values) {
  return !field.when || field.when.values.includes(String(values[field.when.field]));
}
function requireValue(values, key, label=key) {
  const value=values[key];
  if (value===undefined || value===null || value==='' || (Array.isArray(value)&&!value.length)) throw new Error(`${label} é obrigatório.`);
  return value;
}
function httpsUrl(value) {
  let url;
  try {url=new URL(String(value));} catch {throw new Error('Informe uma URL HTTPS válida.');}
  if(url.protocol!=='https:'||url.username||url.password) throw new Error('Informe uma URL HTTPS válida.');
  // Remote media are fetched by the provider, not by this gateway; keep signed public URLs intact.
  return String(value);
}
function validateMessage(values, endpoint) {
  const type=requireValue(values,'type','Tipo');
  if(type==='text') {
    const text=String(requireValue(values,'text','Texto')).trim();
    if(!text||text.length>5000) throw new Error('Texto deve conter de 1 a 5000 caracteres.');
  }
  if(['image','audio','video','file'].includes(type)) httpsUrl(requireValue(values,'url','URL da mídia'));
  if(type==='vcard') {
    requireValue(values,'vname','Nome do contato');
    if(!/^\d{8,15}$/.test(String(requireValue(values,'phone','Telefone')))) throw new Error('Telefone deve conter de 8 a 15 dígitos.');
  }
  if(type==='map') {
    requireValue(values,'place','Local');
    for(const [key,max] of [['lat',90],['lon',180]]) if(!Number.isFinite(Number(requireValue(values,key)))||Math.abs(Number(values[key]))>max) throw new Error('Coordenadas inválidas.');
  }
  if(type==='template'||type==='waba_template') {
    if(![39,40].includes(endpoint)) throw new Error('Template indisponível nesta operação.');
    requireValue(values,'template','Template aprovado');
    if(values.variables!==undefined && (!values.variables || typeof values.variables!=='object'||Array.isArray(values.variables))) throw new Error('Variáveis do template inválidas.');
    for(const [key,list] of Object.entries(values.variables||{})) {
      if(!['body','header','buttons'].includes(key)||!Array.isArray(list)) throw new Error('Variáveis do template inválidas.');
      if(list.length>50) throw new Error('Quantidade de variáveis excedida.');
    }
  }
}
function validateCampaign(values) {
  if(String(values.titulo).length>255) throw new Error('Título deve ter no máximo 255 caracteres.');
  if(!Array.isArray(values.conteudo)||!values.conteudo.length||values.conteudo.length>20) throw new Error('Adicione conteúdo à campanha.');
  const types=new Set();
  for(const item of values.conteudo) {
    if(!item||!['texto','imagem','video','audio','pdf','contato','localizacao','template'].includes(item.type)) throw new Error('Tipo de conteúdo inválido.');
    if(String(values.tipo_campanha)==='1'&&types.has(item.type)) throw new Error('Tipo de conteúdo repetido no broadcast.');
    if(String(values.tipo_campanha)==='3'&&!['texto','imagem','video'].includes(item.type)) throw new Error('Status permite texto, imagem e vídeo.');
    types.add(item.type);
    if(['imagem','video','audio','pdf'].includes(item.type)) httpsUrl(item.value);
    else if(item.type==='contato') {
      if(!Array.isArray(item.value)||item.value.length!==2||!item.value[0]||!/^\+?\d{8,15}$/.test(String(item.value[1]))) throw new Error('Contato da campanha inválido.');
    } else if(item.type==='localizacao') {
      if(!Array.isArray(item.value)||item.value.length!==3||!item.value[0]||!Number.isFinite(Number(item.value[1]))||Math.abs(Number(item.value[1]))>90||!Number.isFinite(Number(item.value[2]))||Math.abs(Number(item.value[2]))>180) throw new Error('Localização da campanha inválida.');
    } else if(typeof item.value!=='string'||!item.value.trim()) throw new Error('Conteúdo da campanha vazio.');
  }
  if(String(values.tipo_campanha)==='1') {
    requireValue(values,'tipo_filtro','Destinatários');
    if(values.tipo_filtro!=='todos') requireValue(values,values.tipo_filtro+'_filtro','Destinatários');
  }
}
export function buildSacRequest(id, input={}) {
  const endpoint=SAC_ENDPOINTS.find(e=>e.id===Number(id));
  if(!endpoint) throw new Error('Operação SAC desconhecida.');
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('Parâmetros inválidos.');
  const fields=new Map(endpoint.fields.map(f=>[f.name,f]));
  const values={};
  for(const [key,value] of Object.entries(input)) {
    const field=fields.get(key);
    if(!field) throw new Error(`Campo não permitido: ${key}.`);
    if(!fieldVisible(field,input)||value===undefined||value===null||value==='') continue;
    if(field.type==='boolean' && typeof value!=='boolean') throw new Error(`${field.label} deve ser verdadeiro ou falso.`);
    if(field.type==='number'&&!Number.isFinite(Number(value))) throw new Error(`${field.label} deve ser numérico.`);
    if(field.options&&!field.options.includes(String(value))) throw new Error(`Opção inválida para ${field.label}.`);
    if(field.type==='array'&&!Array.isArray(value)) throw new Error(`${field.label} deve ser uma lista.`);
    if(typeof value==='string'&&(value.length>20000||/[\u0000]/.test(value))) throw new Error(`${field.label} inválido.`);
    values[key]=field.type==='number'?Number(value):value;
  }
  for(const field of endpoint.fields) if(field.required&&fieldVisible(field,input)) requireValue(values,field.name,field.label);
  if(values.p!==undefined&&(!Number.isInteger(values.p)||values.p<1||values.p>100000)) throw new Error('Página inválida.');
  if([36,39,40,78].includes(endpoint.id)) validateMessage(values,endpoint.id);
  if(endpoint.id===26) validateCampaign(values);
  if([10,40,49,54].includes(endpoint.id)&&!/^\d{8,15}$/.test(String(values.number))) throw new Error('Número deve conter DDI, DDD e telefone, apenas dígitos.');
  if([8,9,63,91].includes(endpoint.id)) {
    const type=values.type;
    const targets={name:['name'],email:['email'],block:['status'],gender:['gender'],observation:['obs'],social_medias:endpoint.id===8?['social','url']:['social_type','social_url'],cpf:['cpf','primary'],cnpj:['cnpj','primary'],cep:['cep','address','number','neighborhood','city','uf','primary'],status:['status','motivation'],nickname:['nickname']}[type]||[];
    for(const key of targets) requireValue(values,key,fields.get(key)?.label||key);
  }
  if(endpoint.id===11&&Boolean(values.operator)===Boolean(values.department)) throw new Error('Escolha um operador ou departamento.');
  if(endpoint.id===90) requireValue(values,values.to,'Destino');
  if(endpoint.id===3&&Number(values.filter)===7) {requireValue(values,'start','Início');requireValue(values,'finish','Fim');}
  if(endpoint.id===31) {
    const byFilter={3:['search'],4:['open','att'],6:['search'],7:['start_at','finish_at'],8:['operator'],9:['department'],10:['tag']}[Number(values.filter)]||[];
    for(const key of byFilter) requireValue(values,key,fields.get(key)?.label||key);
  }
  const used=new Set();
  const path=endpoint.path.replace(/\{(\w+)\}/g,(_,key)=>{used.add(key);return encodeURIComponent(String(requireValue(values,key,fields.get(key)?.label||key)));});
  const body={};
  for(const [key,value] of Object.entries(values)) if(!used.has(key)) body[key]=value;
  let finalPath=path;
  if(endpoint.method==='GET'||(endpoint.method==='PUT'&&!endpoint.bodyDescription.includes(';'))) {
    const query=new URLSearchParams();
    for(const [key,value] of Object.entries(body)) query.set(key,String(value));
    if(query.size) finalPath+=(finalPath.includes('?')?'&':'?')+query.toString();
    return {method:endpoint.method,path:finalPath,body:undefined,mode:endpoint.mode,scopes:endpoint.scopes};
  }
  return {method:endpoint.method,path:finalPath,body:Object.keys(body).length?body:undefined,mode:endpoint.mode,scopes:endpoint.scopes};
}
