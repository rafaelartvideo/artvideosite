-- A função é interna ao trigger e não deve ser chamável via API.\nrevoke all on function private.block_order_configuration_delete_when_in_use()
from public, anon, authenticated, service_role;\n