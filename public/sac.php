<?php

declare(strict_types=1);

// Stable Union-domain redirect URI; token exchange and identity validation stay
// in the private Edge backend. No client secret or access token passes here.
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    echo 'Método não permitido.';
    exit;
}
if (count($_GET) === 0) {
    http_response_code(200);
    echo 'Retorno de autorização SAC Digital da Union World disponível.';
    exit;
}
$state = $_GET['state'] ?? null;
$code = $_GET['code'] ?? null;
$error = $_GET['error'] ?? null;
if (!is_string($state) || !preg_match('/^[0-9a-f]{64}$/D', $state)
    || (!is_string($code) && !is_string($error))
    || (is_string($code) && ($code === '' || strlen($code) > 4096))
    || (is_string($error) && ($error === '' || strlen($error) > 200))) {
    http_response_code(400);
    echo 'Autorização inválida. Inicie a autorização pelo botão Autorizar Operador na Union.';
    exit;
}
$params = ['state' => $state];
if (is_string($error)) {
    $params['error'] = 'access_denied';
} else {
    $params['code'] = $code;
}
$target = 'https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/sac-digital-oauth';
header('Location: ' . $target . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986), true, 302);
exit;
