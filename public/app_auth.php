<?php

const BOT_SESSION_DURATION = 7200;

function startBotSession()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', (string)BOT_SESSION_DURATION);
    session_set_cookie_params([
        'lifetime' => BOT_SESSION_DURATION,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function botPathAllowedByOpenBasedir($path)
{
    $openBasedir = ini_get('open_basedir');
    if ($openBasedir === false || $openBasedir === '') {
        return true;
    }

    $normalizedPath = str_replace('\\', '/', $path);
    foreach (explode(PATH_SEPARATOR, $openBasedir) as $allowedPath) {
        $normalizedAllowedPath = rtrim(str_replace('\\', '/', $allowedPath), '/');
        if (
            $normalizedPath === $normalizedAllowedPath ||
            strpos($normalizedPath, $normalizedAllowedPath . '/') === 0
        ) {
            return true;
        }
    }

    return false;
}

function botEnvironmentVariables()
{
    $environment = getenv();
    if (!is_array($environment)) {
        $environment = [];
    }

    $envPaths = [
        dirname(__DIR__) . '/.env',
        __DIR__ . '/.env',
    ];

    foreach ($envPaths as $envPath) {
        if (!botPathAllowedByOpenBasedir($envPath)) {
            continue;
        }

        if (!is_file($envPath) || !is_readable($envPath)) {
            continue;
        }

        $envLines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($envLines === false) {
            continue;
        }

        foreach ($envLines as $line) {
            if (
                preg_match('/^\s*#/', $line) ||
                !preg_match('/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/', $line, $matches)
            ) {
                continue;
            }

            $key = $matches[1];
            if (!array_key_exists($key, $environment)) {
                $value = trim($matches[2]);
                if (strlen($value) >= 2 && (
                    ($value[0] === '"' && substr($value, -1) === '"') ||
                    ($value[0] === "'" && substr($value, -1) === "'")
                )) {
                    $value = substr($value, 1, -1);
                }
                $environment[$key] = $value;
            }
        }

        break;
    }

    return $environment;
}

function botAccountPassword($unit, $category, $username)
{
    $unitKey = preg_replace('/[^A-Z0-9_]/', '_', strtoupper($unit));
    $categoryKey = preg_replace('/[^A-Z0-9_]/', '_', strtoupper($category));
    $prefixes = [
        "VITE_USER_{$unitKey}_{$categoryKey}_",
        "BOT_USER_{$unitKey}_{$categoryKey}_",
    ];
    $environment = botEnvironmentVariables();
    $passwords = [];

    foreach ($environment as $key => $value) {
        foreach ($prefixes as $prefix) {
            if (strpos($key, $prefix) !== 0 || substr($key, -9) !== '_USERNAME') {
                continue;
            }

            if (!hash_equals((string)$value, (string)$username)) {
                continue;
            }

            $accountName = substr($key, strlen($prefix), -9);
            foreach ($prefixes as $passwordPrefix) {
                $passwordKey = $passwordPrefix . $accountName . '_PASSWORD';
                $password = $environment[$passwordKey] ?? '';
                if ($password !== '') {
                    $passwords[] = $password;
                }
            }
        }
    }

    $passwords = array_values(array_unique($passwords));
    return count($passwords) === 1 ? $passwords[0] : null;
}

function botJsonResponse($statusCode, array $payload)
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
}

function botLoadCurlCookies($handle, array $cookies)
{
    if (!curl_setopt($handle, CURLOPT_COOKIEFILE, '')) {
        error_log('Gagal mengaktifkan penyimpanan cookie E-Kinerja.');
        return false;
    }
    foreach ($cookies as $cookie) {
        if (!is_string($cookie) || !curl_setopt($handle, CURLOPT_COOKIELIST, $cookie)) {
            error_log('Gagal memuat cookie sesi E-Kinerja.');
            return false;
        }
    }
    return true;
}

function botCookieHeaderValues(array $cookies, $path)
{
    $values = [];
    foreach ($cookies as $line) {
        if (!is_string($line)) {
            continue;
        }
        $line = preg_replace('/^#HttpOnly_/', '', $line);
        $parts = explode("\t", $line);
        if (count($parts) !== 7) {
            continue;
        }
        [$domain, $includeSubdomains, $cookiePath, , $expires, $name, $value] = $parts;
        $domain = strtolower(ltrim($domain, '.'));
        $host = 'e-kinerja.kemenhub.go.id';
        $domainMatches = $domain === $host ||
            ($includeSubdomains === 'TRUE' && substr($host, -strlen('.' . $domain)) === '.' . $domain);
        $pathMatches = $cookiePath !== '' && strpos($path, $cookiePath) === 0 &&
            (substr($cookiePath, -1) === '/' || strlen($path) === strlen($cookiePath) ||
                substr($path, strlen($cookiePath), 1) === '/');
        if (!$domainMatches || !$pathMatches || !ctype_digit($expires) ||
            ($expires !== '0' && (float)$expires <= time()) ||
            $name === '' || strpbrk($name . $value, ";\r\n") !== false) {
            continue;
        }
        $values[] = ['path' => $cookiePath, 'value' => $name . '=' . $value];
    }
    usort($values, function ($left, $right) {
        return strlen($right['path']) - strlen($left['path']);
    });
    return array_column($values, 'value');
}

function logoutBotEkinSession()
{
    $cookies = $_SESSION['allCookies'] ?? '';
    if ($cookies !== '') {
        if (!is_string($cookies)) {
            error_log('Cookie sesi E-Kinerja tidak valid.');
            return false;
        }

        $cookieJar = $_SESSION['ekin_cookie_jar'] ?? null;
        $headers = [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer: https://e-kinerja.kemenhub.go.id/',
            'User-Agent: Mozilla/5.0',
        ];
        if ($cookieJar === null) {
            $headers[] = 'Cookie: ' . $cookies;
        } elseif (!is_array($cookieJar) || !$cookieJar) {
            error_log('Penyimpanan cookie sesi E-Kinerja tidak valid.');
            return false;
        }
        $csrf = $_SESSION['csrf_token'] ?? '';
        if (is_string($csrf) && $csrf !== '') {
            $headers[] = 'X-Csrf-Token: ' . $csrf;
        }
        $handle = curl_init('https://e-kinerja.kemenhub.go.id/logout');
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
        ]);
        if ($cookieJar !== null && !botLoadCurlCookies($handle, $cookieJar)) {
            curl_close($handle);
            return false;
        }
        $response = curl_exec($handle);
        $httpCode = curl_getinfo($handle, CURLINFO_HTTP_CODE);
        $error = curl_error($handle);
        curl_close($handle);

        if ($response !== false && $httpCode === 500) {
            error_log('Logout E-Kinerja membalas HTTP 500; sesi lokal dibersihkan, sesi E-Kinerja mungkin masih aktif.');
        } elseif ($response === false || $httpCode < 200 || $httpCode >= 400) {
            error_log('Gagal logout E-Kinerja: HTTP ' . $httpCode . ' ' . $error);
            return false;
        }
    } elseif (!empty($_SESSION['ekin_username'])) {
        error_log('Cookie sesi E-Kinerja sebelumnya tidak tersedia untuk logout.');
        return false;
    }

    unset(
        $_SESSION['allCookies'],
        $_SESSION['ekin_cookie_jar'],
        $_SESSION['csrf_token'],
        $_SESSION['ekin_username'],
        $_SESSION['id_skp'],
        $_SESSION['mapping_pending'],
        $_SESSION['bulan'],
        $_SESSION['mapping_id_penilaiaan'],
        $_SESSION['mapping_id_penilaiaan1'],
        $_SESSION['mapping_tupoksi'],
        $_SESSION['mapping_rhk'],
        $_SESSION['mapping_bukti_dukung'],
        $_SESSION['jumlahUnikIndikatorKinerja']
    );
    return true;
}

function requireBotEkinSession($username)
{
    startBotSession();
    $ekinUsername = $_SESSION['ekin_username'] ?? '';
    $allCookies = $_SESSION['allCookies'] ?? '';
    $csrfToken = $_SESSION['csrf_token'] ?? '';

    if (
        !is_string($username) ||
        $username === '' ||
        !is_string($ekinUsername) ||
        !hash_equals($ekinUsername, $username) ||
        !is_string($allCookies) ||
        $allCookies === '' ||
        !is_string($csrfToken) ||
        $csrfToken === '' ||
        empty($_SESSION['id_skp']) ||
        isset($_SESSION['mapping_pending'])
    ) {
        botJsonResponse(409, [
            'success' => false,
            'message' => 'Sesi E-Kinerja tidak tersedia. Pilih pengguna dan muat ulang data.',
        ]);
        exit;
    }

    return ['allCookies' => $allCookies, 'csrf_token' => $csrfToken];
}

