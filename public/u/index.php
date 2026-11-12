<?php
// Relé legado desativado. Nunca encaminhar webhooks.
http_response_code(410);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(['error'=>'Integracao desativada.']);
