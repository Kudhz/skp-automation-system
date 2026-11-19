<?php
// Test-only server: mock E-Kinerja; never send a real remote request.
if (extension_loaded('curl')) {
    http_response_code(500);
    exit('Run with php -n and no cURL extension.');
}
foreach ([
    'CURLOPT_URL', 'CURLOPT_RETURNTRANSFER', 'CURLOPT_FOLLOWLOCATION',
    'CURLOPT_HEADER', 'CURLOPT_ENCODING', 'CURLOPT_SSL_VERIFYPEER',
    'CURLOPT_SSL_VERIFYHOST', 'CURLOPT_HTTPHEADER', 'CURLOPT_POST',
    'CURLOPT_POSTFIELDS', 'CURLINFO_HTTP_CODE', 'CURLINFO_HEADER_SIZE',
    'CURLOPT_COOKIEFILE', 'CURLOPT_COOKIELIST', 'CURLINFO_COOKIELIST',
] as $index => $name) {
    define($name, $index + 1);
}
function curl_init($url = null) { return (object)['url' => $url]; }
function curl_setopt($handle, $option, $value) {
    if ($option === CURLOPT_URL) $handle->url = $value;
    if ($option === CURLOPT_COOKIELIST) $handle->cookies[] = $value;
    return true;
}
function curl_setopt_array($handle, $options) { return true; }
function curl_exec($handle) {
    if ($handle->url === 'https://e-kinerja.kemenhub.go.id/skp/renaksi/pengajuan') {
        return '{"status":true}';
    }
    if ($handle->url !== 'https://e-kinerja.kemenhub.go.id/skp/renaksi/123') {
        return false;
    }
    if (isset($handle->cookies) && !in_array(
        "e-kinerja.kemenhub.go.id\tFALSE\t/\tTRUE\t0\tinitial\tkept",
        $handle->cookies,
        true
    )) {
        return false;
    }
    return '<meta name="csrf-token" content="private-token">var penilaiaan = []; var penilaiaan_indikator = []; var rkh_indikator = [];'
        . 'var skp = {"id":123,"nip":"000","tanggal_awal":"2026-01-01","tanggal_akhir":"2026-12-31","keterangan":"teks }; lain"};'
        . 'var pegawai = {"id_skp":123,"nama":"Pegawai \\"Uji\\"","jabatan_fungsional":"Jabatan Uji","unit":"Unit Uji"};';
}
function curl_errno($handle) {
    return $handle->url === 'https://e-kinerja.kemenhub.go.id/skp/renaksi/124' ? 7 : 0;
}
function curl_error($handle) { return 'mock network failure'; }
function curl_getinfo($handle, $option) {
    if ($option === CURLINFO_COOKIELIST) {
        return [
            "e-kinerja.kemenhub.go.id\tFALSE\t/\tTRUE\t0\tlaravel_session\trotated",
            "e-kinerja.kemenhub.go.id\tFALSE\t/\tTRUE\t0\tinitial\tkept",
        ];
    }
    return $option === CURLINFO_HTTP_CODE ? 200 : 0;
}
function curl_close($handle) {}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/setup') {
    require_once __DIR__ . '/../public/app_auth.php';
    startBotSession();
    $_SESSION['allCookies'] = 'session=mock';
    if (isset($_GET['cookiejar'])) {
        $_SESSION['ekin_cookie_jar'] = [
            "e-kinerja.kemenhub.go.id\tFALSE\t/\tTRUE\t0\tlaravel_session\toriginal",
            "e-kinerja.kemenhub.go.id\tFALSE\t/\tTRUE\t0\tinitial\tkept",
        ];
    }
    $_SESSION['csrf_token'] = 'csrf-mock';
    $_SESSION['ekin_username'] = 'first';
    unset($_SESSION['id_skp']);
    $_SESSION['mapping_pending'] = [
        'nonce' => 'nonce-first',
        'source' => 'var dataList = [{"id":123,"tanggal_awal":"2026-01-01"},{"id":124,"tanggal_awal":"2025-01-01"}];',
        'xsrf' => 'xsrf-mock',
    ];
    echo 'ok';
} elseif ($path === '/guard') {
    require_once __DIR__ . '/../public/app_auth.php';
    requireBotEkinSession('first');
    echo 'ready';
} elseif ($path === '/cookie-check') {
    require_once __DIR__ . '/../public/app_auth.php';
    startBotSession();
    header('Content-Type: application/json');
    echo json_encode([
        'updated' => strpos($_SESSION['allCookies'] ?? '', 'laravel_session=rotated') !== false,
        'initial' => strpos($_SESSION['allCookies'] ?? '', 'initial=kept') !== false,
    ]);
} elseif ($path === '/get_mapping.php') {
    require __DIR__ . '/../public/get_mapping.php';
} elseif ($path === '/ajukan.php') {
    require __DIR__ . '/../public/ajukan.php';
} else {
    http_response_code(404);
}
