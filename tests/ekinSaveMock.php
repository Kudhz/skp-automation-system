<?php

// Test-only cURL doubles: run with php -n and never contact E-Kinerja.
if (extension_loaded('curl')) {
    fwrite(STDERR, "Run this test with php -n.\n");
    exit(1);
}
foreach ([
    'CURLOPT_POST', 'CURLOPT_RETURNTRANSFER', 'CURLOPT_HTTPHEADER',
    'CURLOPT_POSTFIELDS', 'CURLOPT_CONNECTTIMEOUT', 'CURLOPT_TIMEOUT',
    'CURLOPT_SSL_VERIFYPEER', 'CURLOPT_SSL_VERIFYHOST', 'CURLINFO_HTTP_CODE',
    'CURLM_OK',
] as $index => $name) {
    define($name, $name === 'CURLM_OK' ? 0 : $index + 1);
}

$scenario = $argv[1] ?? 'all';
$attempts = [];

function curl_init($url) { return (object)['url' => $url, 'options' => []]; }
function curl_setopt($handle, $option, $value) { $handle->options[$option] = $value; return true; }
function curl_multi_init() { return (object)['handles' => []]; }
function curl_multi_add_handle($multi, $handle) { $multi->handles[] = $handle; }
function curl_multi_exec($multi, &$running) {
    global $scenario, $attempts;
    foreach ($multi->handles as $handle) {
        parse_str($handle->options[CURLOPT_POSTFIELDS], $payload);
        $key = $payload['key'];
        $attempts[$key] = ($attempts[$key] ?? 0) + 1;
        $handle->http = 200;
        $handle->body = '{"status":true}';
        $handle->error = '';
        if ($scenario === 'retry' && $key === 'realisasi' && $attempts[$key] === 1) {
            $handle->http = 503;
            $handle->body = 'unavailable';
        } elseif ($scenario === 'retry-fifth' && $key === 'realisasi' && $attempts[$key] <= 5) {
            $handle->http = 500;
            $handle->body = 'unavailable';
        } elseif ($scenario === 'failure') {
            if ($key === 'renaksi') $handle->http = 403;
            if ($key === 'bukti_dukung') $handle->body = '{"status":false}';
            if ($key === 'realisasi') {
                $handle->http = 503;
                $handle->body = 'unavailable';
            }
        } elseif ($scenario === 'retry-client-error' && $key === 'renaksi') {
            $handle->http = $attempts[$key] === 1 ? 503 : 400;
        }
    }
    $running = 0;
    return CURLM_OK;
}
function curl_multi_select($multi, $timeout) { return 0; }
function curl_multi_getcontent($handle) { return $handle->body; }
function curl_error($handle) { return $handle->error; }
function curl_getinfo($handle, $option) { return $handle->http; }
function curl_multi_remove_handle($multi, $handle) {}
function curl_close($handle) {}
function curl_multi_close($multi) {}

session_start();
$_SESSION = [
    'ekin_username' => 'operator',
    'allCookies' => 'session=mock',
    'csrf_token' => 'csrf-mock',
    'id_skp' => 123,
];
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = [
    'username' => 'operator',
    'jumlahUnikIndikatorKinerja' => '999',
    'id_indikator' => $scenario === 'missing-id' ? '[]' : ($scenario === 'two' ? '[31,32]' : '[31]'),
    'rhk' => $scenario === 'two' ? '["Rencana 1","Rencana 2"]' : '["Rencana Uji"]',
    'bukti_dukung' => 'evidence',
];
require __DIR__ . '/../public/ekinprocess.php';
