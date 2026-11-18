<?php
require_once __DIR__ . '/app_auth.php';
startBotSession();

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
require_once __DIR__ . '/loginAPI.php';

function pageArraySource($page, $name)
{
    $pattern = '/var\s+' . preg_quote($name, '/') . '\s*=\s*(\[[\s\S]*?\]);/i';
    return preg_match($pattern, $page, $match) ? $match[0] : '';
}

function pageObjectSource($page, $name)
{
    $pattern = '~var\s+' . preg_quote($name, '~') . '\s*=\s*(\{(?:"(?:\\\\.|[^"\\\\])*"|[^";])*?\})\s*;~i';
    return preg_match($pattern, $page, $match) ? $match[0] : '';
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    botJsonResponse(405, ['success' => false, 'message' => 'Metode tidak diizinkan.']);
    exit;
}

$request = json_decode(file_get_contents('php://input'), true);
$stage = is_array($request) ? ($request['stage'] ?? 'login') : null;
$username = is_array($request) ? ($request['username'] ?? null) : null;
if (!is_string($username) || $username === '') {
    botJsonResponse(400, ['success' => false, 'message' => 'Permintaan mapping tidak valid.']);
    exit;
}

if ($stage === 'login') {
    if (
        !isset($request['unit'], $request['category']) ||
        !is_string($request['unit']) || $request['unit'] === '' ||
        !is_string($request['category']) || $request['category'] === ''
    ) {
        botJsonResponse(400, ['success' => false, 'message' => 'Permintaan mapping tidak valid.']);
        exit;
    }

    $password = botAccountPassword($request['unit'], $request['category'], $username);
    if ($password === null) {
        botJsonResponse(403, ['success' => false, 'message' => 'Kredensial pengguna belum dikonfigurasi pada server.']);
        exit;
    }

    if (!logoutBotEkinSession()) {
        botJsonResponse(502, ['success' => false, 'message' => 'Gagal logout pengguna E-Kinerja sebelumnya. Silakan coba lagi.']);
        exit;
    }

    $cookieFile = tempnam(sys_get_temp_dir(), 'bot-ekin-');
    if ($cookieFile === false) {
        botJsonResponse(500, ['success' => false, 'message' => 'Gagal membuat penyimpanan cookie sementara.']);
        exit;
    }

    try {
        $loginResult = autoLogin($username, $password);
    } finally {
        if (is_file($cookieFile) && !unlink($cookieFile)) {
            error_log('Gagal menghapus file cookie sementara E-Kinerja.');
        }
    }

    if (!$loginResult['success']) {
        botJsonResponse(502, ['success' => false, 'message' => $loginResult['message']]);
        exit;
    }

    // Keep the remote session available for logout even if a later step fails.
    $_SESSION['allCookies'] = implode('; ', $loginResult['setCookies']);
    $_SESSION['ekin_cookie_jar'] = $loginResult['cookieJar'];
    $_SESSION['csrf_token'] = $loginResult['csrf_token'];
    $_SESSION['ekin_username'] = $username;
    $page = $loginResult['skp_page'];
    $source = is_string($page) ? pageArraySource($page, 'dataList') : '';
    if ($source === '' || empty($loginResult['csrf_token'])) {
        botJsonResponse(502, ['success' => false, 'message' => 'Halaman SKP atau token sesi tidak tersedia.']);
        exit;
    }

    $nonce = bin2hex(random_bytes(32));
    $_SESSION['mapping_pending'] = [
        'nonce' => $nonce,
        'source' => $source,
        'xsrf' => $loginResult['xsrfToken'],
    ];
    $today = new DateTimeImmutable('today');
    botJsonResponse(200, [
        'success' => true,
        'skp_source' => $source,
        'year' => (int)$today->format('Y'),
        'current_date' => $today->format('Y-m-d'),
        'nonce' => $nonce,
    ]);
    exit;
}

$pending = $_SESSION['mapping_pending'] ?? null;
$nonce = $request['nonce'] ?? null;
if (
    !is_array($pending) ||
    !is_string($nonce) ||
    !hash_equals($pending['nonce'], $nonce) ||
    !isset($_SESSION['ekin_username']) ||
    !hash_equals($_SESSION['ekin_username'], $username)
) {
    botJsonResponse(409, ['success' => false, 'message' => 'Sesi mapping berubah. Pilih pengguna dan muat ulang data.']);
    exit;
}

if ($stage === 'renaksi') {
    unset($_SESSION['mapping_pending']['id_skp']);
    $id = $request['id_skp'] ?? null;
    if (
        !is_string($id) ||
        !preg_match('/^[1-9][0-9]{0,15}$/D', $id) ||
        !preg_match('/"id"\s*:\s*(?:"' . preg_quote($id, '/') . '"|' . preg_quote($id, '/') . ')(?=\s*[,}])/i', $pending['source'])
    ) {
        botJsonResponse(400, ['success' => false, 'message' => 'ID SKP tidak valid untuk sesi ini.']);
        exit;
    }

    $cookieJar = $_SESSION['ekin_cookie_jar'] ?? null;
    $page = getRenaksiPage($_SESSION['allCookies'], $pending['xsrf'], $id, $cookieJar);
    if (is_array($cookieJar)) {
        $_SESSION['ekin_cookie_jar'] = $cookieJar;
        $_SESSION['allCookies'] = implode('; ', botCookieHeaderValues($cookieJar, '/skp/renaksi/'));
    }
    if (!is_string($page) || $page === '') {
        botJsonResponse(502, ['success' => false, 'message' => 'Gagal mengambil halaman rencana aksi.']);
        exit;
    }
    $source = '';
    foreach (['penilaiaan', 'penilaiaan_indikator', 'rkh_indikator'] as $name) {
        $source .= pageArraySource($page, $name) . "\n";
    }
    foreach (['skp', 'pegawai'] as $name) {
        $source .= pageObjectSource($page, $name) . "\n";
    }
    $_SESSION['mapping_pending']['id_skp'] = $id;
    botJsonResponse(200, ['success' => true, 'raw_response' => $source]);
    exit;
}

if ($stage === 'complete' && isset($pending['id_skp'])) {
    $_SESSION['id_skp'] = $pending['id_skp'];
    unset($_SESSION['mapping_pending']);
    botJsonResponse(200, ['success' => true]);
    exit;
}

botJsonResponse(400, ['success' => false, 'message' => 'Tahap mapping tidak valid.']);
