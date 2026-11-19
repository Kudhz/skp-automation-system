<?php
require_once __DIR__ . '/app_auth.php';
startBotSession();

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
$url = "https://e-kinerja.kemenhub.go.id/skp/renaksi/editdetailitem";

function ekinSaveResponseSucceeded($httpCode, $body, $error)
{
    $decoded = is_string($body) ? json_decode($body, true) : null;
    return !$error && $httpCode >= 200 && $httpCode < 300 &&
        is_array($decoded) && isset($decoded['status']) && $decoded['status'] === true;
}

function ekinHandleKey($handle)
{
    return is_object($handle) ? spl_object_id($handle) : (int)$handle;
}

// Get data from the HTML form (assuming you've already processed it)
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $session = requireBotEkinSession($_POST['username'] ?? '');
    $cookie = $session['allCookies'];
    $csrf = $session['csrf_token'];
    $key = "renaksi";
    $realisasi = "realisasi";
    $bukti = "bukti_dukung";
    $values = isset($_POST["rhk"]) ? json_decode($_POST["rhk"], true) : null;
    if (!is_array($values) || array_values($values) !== $values || count($values) === 0 || count($values) > 500) {
        botJsonResponse(400, ['success' => false, 'message' => 'Data RHK tidak valid.']);
        exit;
    }
    foreach ($values as $value) {
        if (!is_string($value)) {
            botJsonResponse(400, ['success' => false, 'message' => 'Data RHK tidak valid.']);
            exit;
        }
    }
    $totalValues = count($values);
    $loopId = $totalValues;
    $realValue = array ("1 Document", "100 Persen", "1 Bulan");
    $realIndex = 0;
    $drive = $_POST["bukti_dukung"];

    // Timeouts (seconds) - adjust these values to extend/reduce how long we wait
    $connectTimeout = 30; // seconds to wait for connection
    $requestTimeout = 300; // seconds maximum for each request

    // Build all POST requests first, then execute in parallel with curl_multi
    $mh = curl_multi_init();
    $handles = [];
    $handleMap = []; // map (int)$ch => postString for retries
    $headers = [
        "Host: e-kinerja.kemenhub.go.id",
        "Cookie: $cookie",
        "User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:134.0) Gecko/20100101 Firefox/134.0",
        "Accept: */*",
        "Accept-Language: en-US,en;q=0.5",
        "Accept-Encoding: gzip, deflate, br",
        "Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
        "X-Csrf-Token: $csrf",
        "X-Requested-With: XMLHttpRequest",
        "Origin: https://e-kinerja.kemenhub.go.id",
        "Referer: https://e-kinerja.kemenhub.go.id/skp/renaksi/262030",
        "Connection: keep-alive",
    ];

    // Parse id_indikator outside the loop
    $id = [];
    if (isset($_POST['id_indikator'])) {
        $rawIdIndikator = $_POST['id_indikator'];
        error_log("📥 Raw id_indikator: " . $rawIdIndikator);
        
        // Coba decode sebagai JSON array dulu
        $decodedIds = json_decode($rawIdIndikator, true);
        if (is_array($decodedIds)) {
            $id = $decodedIds;
            error_log("📥 Decoded as JSON array: " . implode(', ', $id));
        } else {
            // Fallback: explode dengan koma jika bukan JSON
            $id = explode(',', $rawIdIndikator);
            error_log("📥 Exploded by comma: " . implode(', ', $id));
        }

        if (count($id) !== $loopId) {
            botJsonResponse(400, ['success' => false, 'message' => 'Jumlah RHK dan ID indikator harus sama dan tidak boleh kosong.']);
            exit;
        }
        foreach ($id as $indicatorId) {
            if ((!is_string($indicatorId) && !is_int($indicatorId) && !is_float($indicatorId)) || trim((string)$indicatorId) === '') {
                botJsonResponse(400, ['success' => false, 'message' => 'Jumlah RHK dan ID indikator harus sama dan tidak boleh kosong.']);
                exit;
            }
        }
    }
    
    // Debug: Log all values
    error_log("📥 Received Values: " . json_encode($values));
    error_log("📥 Total IDs: " . count($id) . ", Total Values: " . count($values));
    
    for ($i = 0; $i < $loopId; $i++) {
        // Ensure we have the id for current index
        if (!isset($id[$i])) {
            error_log("❌ Missing ID for index $i");
            continue;
        }
        
        $currentId = trim(strval($id[$i])); // Pastikan ID adalah string bersih
        
        // Get value from rhk array - each index corresponds to one renaksi
        $value = isset($values[$i]) ? $values[$i] : '';
        
        // Debug log untuk melihat mapping - termasuk index 0
        $logPrefix = ($i === 0) ? "🔥 INDEX 0" : "Index $i";
        error_log("$logPrefix: ID = '$currentId' (clean), Value = '$value'");
        
        // Validasi ID tidak boleh kosong
        if (empty($currentId)) {
            error_log("❌ Empty ID at index $i, skipping...");
            continue;
        }

        $renaksi = [ 'id' => $currentId, 'key' => $key, 'value' => $value ];
        $realisasi2 = [ 'id' => $currentId, 'key' => $realisasi, 'value' => $realValue[$realIndex] ];
        $realIndex = ($realIndex + 1) % 3;
        $buktiDukung = [ 'id' => $currentId, 'key' => $bukti, 'value' => $drive ];

        $postStrings = [
            http_build_query($renaksi),
            http_build_query($realisasi2),
            http_build_query($buktiDukung),
        ];

    foreach ($postStrings as $ps) {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $ps);
            // timeouts (configurable above)
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeout);
            curl_setopt($ch, CURLOPT_TIMEOUT, $requestTimeout);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            curl_multi_add_handle($mh, $ch);
            $handleMap[ekinHandleKey($ch)] = ['index' => count($handles), 'payload' => $ps];
            $handles[] = $ch;
        }
    }

    // Execute all handles in parallel
    $running = null;
    do {
        $mrc = curl_multi_exec($mh, $running);
        // wait for activity on any curl-connection
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running && $mrc == CURLM_OK);

    // Collect responses and errors, and collect payloads that need retry
    $responses = [];
    $retryPayloads = [];
    foreach ($handles as $ch) {
        $content = curl_multi_getcontent($ch);
        $err = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $item = $handleMap[ekinHandleKey($ch)];
        $success = ekinSaveResponseSucceeded($httpCode, $content, $err);
        $responses[$item['index']] = ['http_code' => $httpCode, 'body' => $content, 'payload' => $item['payload'], 'err' => $err, 'success' => $success];
        if (!$success && ($err || $httpCode >= 500 || $httpCode === 0)) $retryPayloads[] = $item;
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    // Retry failed payloads with exponential backoff
    $maxRetries = 5; // additional attempts
    $finalResults = $responses;
    $retriedCount = count($retryPayloads);
    $retryResults = [];
    $attempt = 0;
    while (!empty($retryPayloads) && $attempt < $maxRetries) {
        $attempt++;
        // small backoff (ms)
        $waitMs = (int)((pow(2, $attempt) * 100) + rand(0, 200));
        usleep($waitMs * 1000);

        $mh2 = curl_multi_init();
        $handles2 = [];
        $handleMap2 = [];
        foreach ($retryPayloads as $item) {
            $ps = $item['payload'];
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $ps);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeout);
            curl_setopt($ch, CURLOPT_TIMEOUT, $requestTimeout);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            curl_multi_add_handle($mh2, $ch);
            $handles2[] = $ch;
            $handleMap2[ekinHandleKey($ch)] = $item;
        }

        // exec
        $running2 = null;
        do {
            $mrc2 = curl_multi_exec($mh2, $running2);
            if ($running2) curl_multi_select($mh2, 1.0);
        } while ($running2 && $mrc2 == CURLM_OK);

        // collect which still fail
        $newRetry = [];
        foreach ($handles2 as $ch) {
            $content = curl_multi_getcontent($ch);
            $err = curl_error($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $item = $handleMap2[ekinHandleKey($ch)];
            $success = ekinSaveResponseSucceeded($httpCode, $content, $err);
            $retryResults[] = ['attempt' => $attempt, 'http_code' => $httpCode, 'err' => $err, 'payload' => $item['payload'], 'body' => $content, 'success' => $success];
            $finalResults[$item['index']] = ['http_code' => $httpCode, 'body' => $content, 'payload' => $item['payload'], 'err' => $err, 'success' => $success];
            if (!$success && ($err || $httpCode >= 500 || $httpCode === 0)) $newRetry[] = $item;
            curl_multi_remove_handle($mh2, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh2);
        $retryPayloads = $newRetry;
    }

    $initialSuccessCount = count(array_filter($responses, function ($response) { return $response['success']; }));
    $successCount = count(array_filter($finalResults, function ($response) { return $response['success']; }));
    $retrySuccessCount = $successCount - $initialSuccessCount;
    $expectedCount = $totalValues * 3;
    $allSucceeded = $successCount === $expectedCount;
    botJsonResponse($allSucceeded ? 200 : 207, [
        'status' => $allSucceeded ? 'success' : 'partial',
        'count' => count($responses),
        'expected_count' => $expectedCount,
        'initial_success_count' => $initialSuccessCount,
        'success_count' => $successCount,
        'retry_success_count' => $retrySuccessCount,
        'retry_failure_count' => $retriedCount - $retrySuccessCount,
        'retries' => count($retryResults),
        'retry_summary' => $retryResults,
        'final_failures' => array_values(array_filter($finalResults, function ($response) { return !$response['success']; })),
        'final_success' => $successCount,
    ]);
    
}
