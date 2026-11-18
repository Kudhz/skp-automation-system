<?php

// Run with php -n so the cURL functions below are isolated test doubles.
if (extension_loaded('curl')) {
    fwrite(STDERR, "Run this test with php -n.\n");
    exit(1);
}

foreach ([
    'CURLOPT_RETURNTRANSFER', 'CURLOPT_HTTPHEADER', 'CURLOPT_FOLLOWLOCATION',
    'CURLOPT_CONNECTTIMEOUT', 'CURLOPT_TIMEOUT', 'CURLOPT_SSL_VERIFYPEER',
    'CURLOPT_SSL_VERIFYHOST', 'CURLINFO_HTTP_CODE', 'CURLOPT_COOKIEFILE',
    'CURLOPT_COOKIELIST',
] as $index => $name) {
    define($name, $index + 1);
}

$mock = ['http' => 302, 'response' => '', 'error' => '', 'calls' => 0];
function curl_init($url) {
    global $mock;
    $mock['url'] = $url;
    $mock['calls']++;
    return new stdClass();
}
function curl_setopt_array($handle, $options) {
    global $mock;
    $mock['options'] = $options;
    return true;
}
function curl_setopt($handle, $option, $value) {
    global $mock;
    $mock['cookieOptions'][] = [$option, $value];
    return true;
}
function curl_exec($handle) {
    global $mock;
    return $mock['response'];
}
function curl_getinfo($handle, $option) {
    global $mock;
    return $mock['http'];
}
function curl_error($handle) {
    global $mock;
    return $mock['error'];
}
function curl_close($handle) {}

require __DIR__ . '/../public/app_auth.php';

function expect($condition, $message) {
    if (!$condition) {
        fwrite(STDERR, $message . "\n");
        exit(1);
    }
}

$_SESSION = [
    'ekin_username' => 'previous-user',
    'allCookies' => 'session=previous',
    'csrf_token' => 'csrf',
    'id_skp' => 123,
    'unrelated' => 'kept',
];
expect(logoutBotEkinSession(), 'Logout should succeed on a redirect.');
expect($mock['url'] === 'https://e-kinerja.kemenhub.go.id/logout', 'Wrong logout endpoint.');
expect(in_array('Cookie: session=previous', $mock['options'][CURLOPT_HTTPHEADER], true), 'Previous cookie not sent.');
expect(!isset($_SESSION['ekin_username'], $_SESSION['allCookies'], $_SESSION['id_skp']), 'Previous session was not cleared.');
expect($_SESSION['unrelated'] === 'kept', 'Unrelated session data was cleared.');

$cookieJar = [
    "#HttpOnly_e-kinerja.kemenhub.go.id\tFALSE\t/\tTRUE\t0\tlaravel_session\tnew-session",
    "e-kinerja.kemenhub.go.id\tFALSE\t/skp\tTRUE\t0\tpage\tvalue",
    "other.example\tFALSE\t/\tTRUE\t0\tother\tprivate",
    "e-kinerja.kemenhub.go.id\tFALSE\t/\tTRUE\t1\texpired\told",
];
expect(
    botCookieHeaderValues($cookieJar, '/skp/renaksi/') === ['page=value', 'laravel_session=new-session'],
    'Cookie filtering or path ordering failed.'
);
$_SESSION = [
    'ekin_username' => 'previous-user',
    'allCookies' => 'laravel_session=new-session',
    'ekin_cookie_jar' => $cookieJar,
];
$mock['cookieOptions'] = [];
expect(logoutBotEkinSession(), 'Logout with a cookie jar should succeed.');
expect($mock['cookieOptions'][0] === [CURLOPT_COOKIEFILE, ''], 'Cookie engine not enabled.');
expect(count($mock['cookieOptions']) === count($cookieJar) + 1, 'Not all cookies were loaded.');
expect(!in_array('Cookie: laravel_session=new-session', $mock['options'][CURLOPT_HTTPHEADER], true), 'Cookie jar must control the logout cookie header.');
expect(!isset($_SESSION['ekin_cookie_jar']), 'Cookie jar was not cleared.');

$_SESSION = ['ekin_username' => 'previous-user', 'allCookies' => 'session=previous'];
$mock['response'] = false;
$mock['http'] = 0;
expect(!logoutBotEkinSession(), 'Logout failure must block account switching.');
expect(isset($_SESSION['allCookies']), 'Failed logout must retain the session for retry.');

$mock['response'] = 'error';
$mock['http'] = 500;
$_SESSION += [
    'ekin_cookie_jar' => $cookieJar,
    'csrf_token' => 'csrf',
    'id_skp' => 123,
    'mapping_pending' => ['nonce' => 'old'],
    'unrelated' => 'kept',
];
$calls = $mock['calls'];
expect(logoutBotEkinSession(), 'HTTP 500 should allow account switching.');
expect($mock['calls'] === $calls + 1, 'Remote logout must still be attempted.');
expect(!isset($_SESSION['ekin_username']) && !isset($_SESSION['allCookies']) &&
    !isset($_SESSION['ekin_cookie_jar']) && !isset($_SESSION['csrf_token']) &&
    !isset($_SESSION['id_skp']) && !isset($_SESSION['mapping_pending']),
    'HTTP 500 must clear the local E-Kinerja session.');
expect($_SESSION['unrelated'] === 'kept', 'Unrelated session data must remain.');

$_SESSION = ['ekin_username' => 'previous-user', 'allCookies' => 'session=previous'];
$mock['http'] = 503;
expect(!logoutBotEkinSession(), 'Other HTTP errors must block account switching.');
expect(isset($_SESSION['allCookies']), 'Other HTTP errors must retain the session for retry.');

$_SESSION = ['ekin_username' => 'previous-user'];
$calls = $mock['calls'];
expect(!logoutBotEkinSession(), 'Missing previous cookie must block account switching.');
expect($mock['calls'] === $calls, 'Logout was attempted without a cookie.');

$_SESSION = [];
expect(logoutBotEkinSession(), 'A new session should not need remote logout.');
echo "E-Kinerja logout checks passed.\n";
