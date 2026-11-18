import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { getSkpDetails } from "../src/utils/skpPage.js";

test("tahapan PHP mengikat ID dan sesi sebelum mengizinkan operasi", async (t) => {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));

  const router = fileURLToPath(new URL("mappingMockRouter.php", import.meta.url));
  const server = spawn("php", ["-n", "-S", `127.0.0.1:${port}`, router], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let serverOutput = "";
  server.stderr.on("data", (chunk) => { serverOutput += chunk; });
  t.after(() => server.kill());
  const base = `http://127.0.0.1:${port}`;
  let setup;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`PHP server stopped: ${serverOutput}`);
    try {
      setup = await fetch(`${base}/setup`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.ok(setup, `PHP server did not start: ${serverOutput}`);
  assert.equal(setup.status, 200);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const post = (body) => fetch(`${base}/get_mapping.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  const guard = () => fetch(`${base}/guard`, { headers: { Cookie: cookie } });
  const body = { username: "first", nonce: "nonce-first" };

  assert.equal((await guard()).status, 409);
  assert.equal((await post({ ...body, stage: "complete" })).status, 400);
  assert.equal((await post({ ...body, stage: "renaksi", username: "second", id_skp: "123" })).status, 409);
  assert.equal((await post({ ...body, stage: "renaksi", nonce: "old", id_skp: "123" })).status, 409);
  assert.equal((await post({ ...body, stage: "renaksi", id_skp: "999" })).status, 400);
  assert.equal((await post({ ...body, stage: "renaksi", id_skp: "124" })).status, 502);
  assert.equal((await post({ ...body, stage: "complete" })).status, 400);
  assert.equal((await guard()).status, 409);

  const response = await post({ ...body, stage: "renaksi", id_skp: "123" });
  assert.equal(response.status, 200);
  const source = (await response.json()).raw_response;
  assert.match(source, /var penilaiaan = \[\];/);
  assert.doesNotMatch(source, /private-token/);
  assert.deepEqual(getSkpDetails(source, "123"), {
    name: 'Pegawai "Uji"',
    nip: "000",
    position: "Jabatan Uji",
    unit: "Unit Uji",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  });
  assert.equal((await post({ ...body, stage: "renaksi", id_skp: "124" })).status, 502);
  assert.equal((await post({ ...body, stage: "complete" })).status, 400);
  assert.equal((await post({ ...body, stage: "renaksi", id_skp: "123" })).status, 200);
  assert.equal((await guard()).status, 409);
  assert.equal((await post({ ...body, stage: "complete" })).status, 200);
  assert.equal((await guard()).status, 200);
  assert.equal((await post({ ...body, stage: "complete" })).status, 409);

  const secondSetup = await fetch(`${base}/setup?cookiejar=1`);
  const secondCookie = secondSetup.headers.get("set-cookie").split(";")[0];
  const renaksi = await fetch(`${base}/get_mapping.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: secondCookie },
    body: JSON.stringify({ ...body, stage: "renaksi", id_skp: "123" }),
  });
  assert.equal(renaksi.status, 200);
  const cookieCheck = await fetch(`${base}/cookie-check`, { headers: { Cookie: secondCookie } });
  assert.deepEqual(await cookieCheck.json(), { updated: true, initial: true });
});
