-- Evita que uma aprovação automática de orçamento se apresente como nota manual.
-- Preserva a conciliação completa em private.service_order_quote_reconciliation_history.
-- Não apaga notas existentes: a UI oculta apenas o formato antigo gerado automaticamente.
do $migration$
declare
  v_definition text;
  v_note_start integer;
  v_note_end integer;
begin
  v_definition := pg_get_functiondef('private.apply_approved_os_quote_items()'::regprocedure);
  if v_definition is null then
    raise exception 'Função de conciliação do orçamento não encontrada';
  end if;

  v_note_start := strpos(v_definition,
    '  insert into public.service_order_history_notes(');
  if v_note_start = 0 then
    -- Migration idempotente: o gatilho já não grava notas automáticas.
    return;
  end if;
  v_note_end := strpos(v_definition,
    '  update public.service_order_quote_proposals set applied_at=now() where id=new.id;');

  if v_note_end <= v_note_start
     or strpos(substr(v_definition, v_note_start, v_note_end - v_note_start),
       '''Orçamento versão ''') = 0
     or strpos(v_definition, 'private.service_order_quote_reconciliation_history') = 0 then
    raise exception 'A conciliação do orçamento mudou; revise a remoção da nota automática';
  end if;

  -- Remove também o comentário legado para não indicar uma gravação inexistente.
  v_note_start := coalesce(nullif(strpos(v_definition,
    '  -- Além do backup privado, registra uma nota legível no Histórico da OS.'), 0),
    v_note_start);
  v_definition := left(v_definition, v_note_start - 1)
    || '  -- A auditoria da conciliação permanece na tabela privada.'
    || chr(10)
    || substr(v_definition, v_note_end);

  execute v_definition;
end;
$migration$;
