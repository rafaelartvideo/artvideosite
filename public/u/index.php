<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    http_response_code(200);
    echo json_encode([
        'ok' => true,
        'service' => 'uniq-webhook-relay',
    ]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: GET, POST');
    echo json_encode(['ok' => false, 'error' => 'METHOD_NOT_ALLOWED']);
    exit;
}

$token = isset($_GET['t']) ? trim((string) $_GET['t']) : '';
if (!preg_match('/^[a-fA-F0-9]{32}$/', $token)) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'INVALID_TOKEN']);
    exit;
}

$payload = file_get_contents('php://input');
if ($payload === false) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'INVALID_BODY']);
    exit;
}

$target = 'https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/uniq-webhook?token=' . rawurlencode($token);
$contentType = $_SERVER['CONTENT_TYPE'] ?? 'application/json';

$ch = curl_init($target);
if ($ch === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'RELAY_INIT_FAILED']);
    exit;
}

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_HTTPHEADER => [
        'Content-Type: ' . $contentType,
        'Accept: application/json',
        'User-Agent: ArtVideo-Uniq-Webhook-Relay/1.0',
    ],
]);

$response = curl_exec($ch);
$status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    echo json_encode([
        'ok' => false,
        'error' => 'UPSTREAM_UNAVAILABLE',
        'detail' => $error !== '' ? $error : null,
    ]);
    exit;
}

http_response_code($status >= 100 ? $status : 502);
echo $response;
