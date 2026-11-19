import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import { createApiApp, resolveAccountPassword } from "../server/app.js";
import { createApiConfig } from "../src/config/api.js";

const environment = {
  SESSION_SECRET: "node-api-test-secret",
  BOT_USER_UNIT_PNS_EXAMPLE_USERNAME: "operator",
  BOT_USER_UNIT_PNS_EXAMPLE_PASSWORD: "server-password",
};

function createFakeClient() {
  const calls = [];
  return {
    calls,
    async login(username, password) {
      calls.push(["login", username, password]);
      return {
        cookieJar: [{ name: "session", value: "private", domain: "test", path: "/" }],
        allCookies: "session=private",
        csrfToken: "private-token",
        xsrfToken: "xsrf-token",
        skpPage: 'var dataList = [{"id":123,"tanggal_awal":"2026-01-01"}];',
      };
    },
    async logout() {
      calls.push(["logout"]);
      return { status: 204 };
    },
    async getRenaksiPage(_session, idSkp) {
      calls.push(["renaksi", idSkp]);
      return "var penilaiaan = []; var penilaiaan_indikator = []; var rkh_indikator = [];";
    },
    async postForm(_session, url, payload) {
      calls.push(["post", url, payload]);
      return { status: 200, body: '{"status":true}' };
    },
    async logoutAfterSubmit() {
      calls.push(["logout-after-submit"]);
      return { status: 200, body: "Logged out." };
    },
  };
}

async function startTestServer(t, client = createFakeClient()) {
  const app = createApiApp({ ekinClient: client, environment });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const request = async (path, body, contentType = "application/json") => {
    const multipart = contentType === "multipart";
    const headers = {
      ...(contentType && !multipart ? { "Content-Type": contentType } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    };
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body:
        contentType === "application/json"
          ? JSON.stringify(body)
          : multipart
            ? body
            : new URLSearchParams(body),
    });
    const setCookie = response.headers.getSetCookie()?.[0];
    if (setCookie) cookie = setCookie.split(";")[0];
    return response;
  };
  const get = (path) => fetch(`${base}${path}`);
  return { request, get, client };
}

test("resolves one server-side account password and rejects ambiguity", () => {
  assert.equal(
    resolveAccountPassword(
      { unit: "unit", category: "pns", username: "operator" },
      environment,
    ),
    "server-password",
  );
  assert.equal(
    resolveAccountPassword(
      { unit: "other", category: "pns", username: "operator" },
      environment,
    ),
    null,
  );
  assert.equal(
    resolveAccountPassword(
      { unit: "unit", category: "pns", username: "operator" },
      {
        ...environment,
        VITE_USER_UNIT_PNS_EXAMPLE_PASSWORD: "conflicting-password",
      },
    ),
    null,
  );
});

test("frontend configuration selects PHP or Node endpoints and credentials", () => {
  const php = createApiConfig({ VITE_API_BACKEND: "php" });
  assert.equal(php.endpoints.GET_MAPPING, "/get_mapping.php");
  assert.equal(php.credentials, "same-origin");
  assert.equal(php.endpoints.LOGOUT, null);

  const node = createApiConfig({
    VITE_API_BACKEND: "node",
    VITE_NODE_API_BASE_URL: "https://api.example.test/api/",
  });
  assert.equal(
    node.endpoints.GET_MAPPING,
    "https://api.example.test/api/get_mapping",
  );
  assert.equal(node.credentials, "include");
  assert.equal(node.endpoints.LOGOUT, "https://api.example.test/api/logout");
  assert.throws(() => createApiConfig({ VITE_API_BACKEND: "other" }), /php.*node/);
});

test("mapping stages protect session identity and only accept an advertised SKP", async (t) => {
  const { request, get, client } = await startTestServer(t);
  assert.equal((await get("/api/get_mapping")).status, 405);
  assert.equal((await get("/api/get_mapping.php")).status, 404);
  const login = await request("/api/get_mapping", {
    stage: "login",
    unit: "unit",
    category: "pns",
    username: "operator",
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(loginBody.success, true);
  assert.match(loginBody.nonce, /^[a-f0-9]{64}$/);
  assert.match(loginBody.skp_source, /dataList/);
  assert.equal(client.calls[0][2], "server-password");

  const invalidSkp = await request("/api/get_mapping", {
    stage: "renaksi",
    username: "operator",
    nonce: loginBody.nonce,
    id_skp: "999",
  });
  assert.equal(invalidSkp.status, 400);

  const wrongUser = await request("/api/get_mapping", {
    stage: "renaksi",
    username: "someone-else",
    nonce: loginBody.nonce,
    id_skp: "123",
  });
  assert.equal(wrongUser.status, 409);

  const page = await request("/api/get_mapping", {
    stage: "renaksi",
    username: "operator",
    nonce: loginBody.nonce,
    id_skp: "123",
  });
  assert.equal(page.status, 200);
  assert.match((await page.json()).raw_response, /penilaiaan_indikator/);

  const complete = await request("/api/get_mapping", {
    stage: "complete",
    username: "operator",
    nonce: loginBody.nonce,
  });
  assert.equal(complete.status, 200);
  assert.deepEqual(client.calls[1], ["renaksi", "123"]);
  assert.equal((await request("/api/get_mapping", { stage: "refresh", username: "someone-else" })).status, 409);
  const refreshed = await request("/api/get_mapping", { stage: "refresh", username: "operator", id_skp: "999" });
  assert.equal(refreshed.status, 200);
  assert.match((await refreshed.json()).raw_response, /penilaiaan_indikator/);
  assert.deepEqual(client.calls[2], ["renaksi", "123"]);
});

test("submission endpoints use the server session and preserve legacy payloads", async (t) => {
  const { request, client } = await startTestServer(t);
  const login = await request("/api/get_mapping", {
    stage: "login",
    unit: "unit",
    category: "pns",
    username: "operator",
  });
  const loginBody = await login.json();
  await request("/api/get_mapping", {
    stage: "renaksi",
    username: "operator",
    nonce: loginBody.nonce,
    id_skp: "123",
  });
  await request("/api/get_mapping", {
    stage: "complete",
    username: "operator",
    nonce: loginBody.nonce,
  });

  const add = await request(
    "/api/tambakrenaksi",
    {
      username: "operator",
      tupoksi: "[11,12]",
      bulan: "8",
    },
    "application/x-www-form-urlencoded",
  );
  assert.equal(add.status, 200);
  const addPayload = client.calls.find((call) => call[0] === "post")[2];
  assert.deepEqual(addPayload.id_indikator_penilaiaan, [11, 12]);
  assert.equal(addPayload.id_skp, 123);

  const form = new FormData();
  form.append("username", "operator");
  form.append("jumlahUnikIndikatorKinerja", "1");
  form.append("id_indikator", "[31]");
  form.append("rhk", '["Rencana Uji"]');
  form.append("bukti_dukung", "https://example.test/evidence");
  const save = await request(
    "/api/ekinprocess",
    form,
    "multipart",
  );
  assert.equal(save.status, 200);
  const saveBody = await save.json();
  assert.equal(saveBody.status, "success");
  assert.equal(saveBody.expected_count, 3);
  assert.equal(saveBody.success_count, 3);
  assert.equal(saveBody.retry_success_count, 0);
  const savedFields = client.calls
    .filter((call) => call[0] === "post" && call[1].endsWith("editdetailitem"))
    .map((call) => call[2]);
  assert.deepEqual(savedFields, [
    { id: "31", key: "renaksi", value: "Rencana Uji" },
    { id: "31", key: "realisasi", value: "1 Document" },
    { id: "31", key: "bukti_dukung", value: "https://example.test/evidence" },
  ]);

  const submit = await request(
    "/api/ajukan",
    { username: "operator", tupoksi: "[123]" },
    "application/x-www-form-urlencoded",
  );
  assert.equal(submit.status, 200);
  assert.equal((await request("/api/get_mapping", { stage: "refresh", username: "operator" })).status, 200);
  assert.equal(client.calls.filter((call) => call[0] === "login").length, 1);
  assert.equal(client.calls.some((call) => call[0] === "logout-after-submit"), false);

  const missingSession = await request(
    "/api/ajukan",
    { username: "other", tupoksi: "123" },
    "application/x-www-form-urlencoded",
  );
  assert.equal(missingSession.status, 409);
});

test("isi counts each successful RHK request once, including retries", async (t) => {
  const client = createFakeClient();
  let scenario = "all";
  const attempts = new Map();
  client.postForm = async (_session, _url, payload) => {
    const attempt = (attempts.get(payload.key) || 0) + 1;
    attempts.set(payload.key, attempt);
    if (scenario === "retry" && payload.key === "realisasi" && attempt === 1) {
      return { status: 503, body: "unavailable" };
    }
    if (scenario === "retry-fifth" && payload.key === "realisasi" && attempt <= 5) {
      return { status: 500, body: "unavailable" };
    }
    if (scenario === "failure") {
      if (payload.key === "renaksi") return { status: 403, body: '{"status":true}' };
      if (payload.key === "bukti_dukung") return { status: 200, body: '{"status":false}' };
      return { status: 503, body: "unavailable" };
    }
    if (scenario === "retry-client-error" && payload.key === "renaksi") {
      return attempt === 1
        ? { status: 503, body: "unavailable" }
        : { status: 400, body: '{"status":true}' };
    }
    if (scenario === "retry-network" && payload.key === "renaksi") {
      if (attempt === 1) throw new Error("network error");
      if (attempt === 2) return { status: 503, body: "unavailable" };
    }
    if (scenario === "invalid-body" && payload.key === "renaksi") {
      return { status: 200, body: "not-json" };
    }
    return { status: 200, body: '{"status":true}' };
  };
  const { request } = await startTestServer(t, client);
  const login = await request("/api/get_mapping", {
    stage: "login", unit: "unit", category: "pns", username: "operator",
  });
  const { nonce } = await login.json();
  await request("/api/get_mapping", { stage: "renaksi", username: "operator", nonce, id_skp: "123" });
  await request("/api/get_mapping", { stage: "complete", username: "operator", nonce });

  const save = async (ids = "[31]", plans = '["Rencana Uji"]') => {
    const form = new FormData();
    form.append("username", "operator");
    form.append("jumlahUnikIndikatorKinerja", "999");
    form.append("id_indikator", ids);
    form.append("rhk", plans);
    form.append("bukti_dukung", "evidence");
    const response = await request("/api/ekinprocess", form, "multipart");
    return { status: response.status, body: await response.json() };
  };

  let result = await save();
  assert.equal(result.status, 200);
  assert.equal(result.body.expected_count, 3);
  assert.equal(result.body.success_count, 3);

  attempts.clear();
  result = await save("[31,32]", '["Rencana 1","Rencana 2"]');
  assert.equal(result.status, 200);
  assert.equal(result.body.expected_count, 6);
  assert.equal(result.body.success_count, 6);

  scenario = "retry";
  attempts.clear();
  result = await save();
  assert.equal(result.status, 200);
  assert.equal(result.body.initial_success_count, 2);
  assert.equal(result.body.retry_success_count, 1);
  assert.equal(result.body.retry_failure_count, 0);
  assert.equal(result.body.success_count, 3);
  assert.equal(result.body.retry_summary[0].success, true);

  scenario = "retry-fifth";
  attempts.clear();
  result = await save();
  assert.equal(result.status, 200);
  assert.equal(result.body.success_count, 3);
  assert.deepEqual(result.body.retry_summary.map((item) => item.success), [false, false, false, false, true]);
  assert.equal(attempts.get("realisasi"), 6);
  assert.equal(attempts.get("renaksi"), 1);
  assert.equal(attempts.get("bukti_dukung"), 1);

  scenario = "retry-network";
  attempts.clear();
  result = await save();
  assert.equal(result.status, 200);
  assert.equal(result.body.success_count, 3);
  assert.equal(result.body.retry_success_count, 1);
  assert.deepEqual(result.body.retry_summary.map((item) => item.success), [false, true]);

  scenario = "invalid-body";
  attempts.clear();
  result = await save();
  assert.equal(result.status, 207);
  assert.equal(result.body.success_count, 2);
  assert.equal(result.body.retries, 0);

  scenario = "failure";
  attempts.clear();
  result = await save();
  assert.equal(result.status, 207);
  assert.equal(result.body.status, "partial");
  assert.equal(result.body.success_count, 0);
  assert.equal(result.body.retry_success_count, 0);
  assert.equal(result.body.retry_failure_count, 1);
  assert.deepEqual(result.body.retry_summary.map((item) => item.success), [false, false, false, false, false]);
  assert.equal(attempts.get("realisasi"), 6);
  assert.equal(result.body.final_failures.length, 3);

  scenario = "retry-client-error";
  attempts.clear();
  result = await save();
  assert.equal(result.status, 207);
  assert.equal(result.body.success_count, 2);
  assert.equal(result.body.retry_failure_count, 1);
  assert.equal(result.body.retries, 1);

  attempts.clear();
  result = await save("[]");
  assert.equal(result.status, 400);
  assert.equal(attempts.size, 0);
});
