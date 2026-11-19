import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getActiveSkp, getSkpDetails, getSkpMonthNumbers, validateRenaksiPage } from "../src/utils/skpPage.js";
import { clearUserMappingCache, fetchUserMapping } from "../src/services/mappingService.js";
import { getMonthIndicatorMappings } from "../src/utils/monthOptions.js";

const skp = (entries) => `var dataList = ${JSON.stringify(entries)};`;
const page = 'var penilaiaan = []; var penilaiaan_indikator = []; var rkh_indikator = [];';

test("memilih SKP aktif berdasarkan periode dan tanggal server", () => {
  const source = skp([
    { id: 12, tanggal_awal: "2026-01-01", tanggal_akhir: "2026-06-30" },
    { id: "345", tanggal_awal: "2026-07-01", tanggal_akhir: "2026-12-31" },
  ]);
  assert.equal(getActiveSkp(source, "2026-06-30").id, "12");
  assert.deepEqual(getActiveSkp(source, "2026-07-01"), {
    id: "345", startDate: "2026-07-01", endDate: "2026-12-31",
  });
  assert.throws(() => getActiveSkp(source, "2027-01-01"), /Tidak ada SKP/);
  assert.throws(() => getActiveSkp(skp([
    { id: 1, tanggal_awal: "2026-01-01", tanggal_akhir: "2026-12-31" },
    { id: 2, tanggal_awal: "2026-07-01", tanggal_akhir: "2026-12-31" },
  ]), "2026-08-01"), /lebih dari satu/);
  assert.throws(() => getActiveSkp(skp([{ id: 1, tanggal_awal: "2026-02-30", tanggal_akhir: "2026-12-31" }]), "2026-07-01"), /Periode SKP/);
  assert.throws(() => getActiveSkp(skp([{ id: "../1", tanggal_awal: "2026-01-01", tanggal_akhir: "2026-12-31" }]), "2026-07-01"), /ID SKP/);
  assert.throws(() => getActiveSkp(source, "invalid"), /Tanggal server/);
  assert.throws(() => getActiveSkp("var dataList = [oops];", "2026-07-01"), SyntaxError);
  assert.throws(() => getActiveSkp("", "2026-07-01"), /dataList/);
});

test("bulan yang terlihat mengikuti periode SKP pada tahun server", () => {
  assert.deepEqual(getSkpMonthNumbers({ startDate: "2026-07-01", endDate: "2026-12-31" }, 2026), [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(getSkpMonthNumbers({ startDate: "2026-01-01", endDate: "2026-12-31" }, 2026), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual(getSkpMonthNumbers({ startDate: "2025-12-15", endDate: "2026-02-15" }, 2026), [1, 2]);
  assert.throws(() => getSkpMonthNumbers({ startDate: "2026-07-01", endDate: "2026-06-30" }, 2026), /Periode/);
});
test("halaman rencana aksi harus memuat JSON yang dapat diproses", () => {
  assert.doesNotThrow(() => validateRenaksiPage(page));
  assert.throws(() => validateRenaksiPage("var penilaiaan = [];"), /penilaiaan_indikator/);
  assert.throws(() => validateRenaksiPage(page.replace("rkh_indikator = []", "rkh_indikator = [oops]")), SyntaxError);
});

test("detail SKP dibaca dari objek sumber dan harus sesuai akun yang aktif", () => {
  const source = `var skp = ${JSON.stringify({ id: 345, nip: "000", tanggal_awal: "2026-01-01", tanggal_akhir: "2026-12-31", keterangan: 'teks }; "uji"' })};` +
    `var pegawai = ${JSON.stringify({ id_skp: 345, nama: "Pegawai Uji", jabatan_fungsional: "Jabatan Uji", unit: "Unit Uji" })};`;
  assert.equal(getSkpDetails(source, "345").name, "Pegawai Uji");
  assert.throws(() => getSkpDetails(source, "346"), /tidak sesuai/);
  assert.throws(() => getSkpDetails("var skp = {};", "345"), /pegawai/);
  assert.throws(() => getSkpDetails("var skp = {bad}; var pegawai = {};", "345"), SyntaxError);
});

test("invalidasi mapping yang sedang berjalan memuat status terbaru setelah simpan", async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => {
      globalThis.fetch = originalFetch;
      clearUserMappingCache();
    });
    clearUserMappingCache();

    let releaseOldPage;
    let oldPageRequested;
    const oldPageStarted = new Promise((resolve) => { oldPageRequested = resolve; });
    const oldPageBlocked = new Promise((resolve) => { releaseOldPage = resolve; });
    const calls = [];
    let filled = false;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.stage);
      let response;
      if (body.stage === "login") {
        response = {
          success: true,
          year: 2026,
          current_date: "2026-08-01",
          nonce: "nonce",
          skp_source: skp([{ id: 345, tanggal_awal: "2026-01-01", tanggal_akhir: "2026-12-31" }]),
        };
      } else if (body.stage === "renaksi" || body.stage === "refresh") {
        const currentValue = filled ? "100 Persen" : "0";
        response = {
          success: true,
          raw_response: `var penilaiaan = [{"id":1,"bulan":8,"tahun":2026,"status":0}];` +
            `var penilaiaan_indikator = [{"id":2,"id_penilaiaan":1,"id_indikator":3,"realisasi":"${currentValue}"}];` +
            "var rkh_indikator = [];",
        };
        if (!filled) {
          oldPageRequested();
          await oldPageBlocked;
        }
      } else {
        response = { success: true };
      }
      return { ok: true, status: 200, json: async () => response };
    };
    const account = { unit: "unit", category: "category", username: "operator" };
    const oldRequest = fetchUserMapping(account);
    await oldPageStarted;
    filled = true;
    clearUserMappingCache(account.username);
    const refreshedRequest = fetchUserMapping(account);
    const concurrentRefresh = fetchUserMapping(account);
    releaseOldPage();

    const [oldResult, refreshed, shared] = await Promise.all([
      oldRequest,
      refreshedRequest,
      concurrentRefresh,
    ]);
    assert.notEqual(oldResult.raw_response, refreshed.raw_response);
    assert.equal(refreshed.raw_response, shared.raw_response);
    assert.deepEqual(calls, ["login", "renaksi", "complete", "refresh"]);

    const assessments = [{ id: 1, bulan: 8, tahun: 2026, status: 0 }];
    const getLabels = (result) => {
      const match = result.raw_response.match(/var penilaiaan_indikator = (\[[\s\S]*?\]);/);
      return Object.keys(getMonthIndicatorMappings(assessments, JSON.parse(match[1]), 2026).mappingBulanId);
    };
    assert.deepEqual(getLabels(oldResult), ["Agustus - Belum diisi"]);
    assert.deepEqual(getLabels(refreshed), ["Agustus - Sudah diisi"]);
    assert.equal((await fetchUserMapping(account)).raw_response, refreshed.raw_response);
    assert.equal(calls.length, 4);
});

test("refresh gagal ditampilkan tanpa login ulang", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearUserMappingCache();
  });
  clearUserMappingCache();
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body.stage);
    const result = body.stage === "login"
      ? { success: true, year: 2026, current_date: "2026-08-01", nonce: "nonce", skp_source: skp([{ id: 345, tanggal_awal: "2026-01-01", tanggal_akhir: "2026-12-31" }]) }
      : body.stage === "renaksi"
        ? { success: true, raw_response: page }
        : body.stage === "refresh"
          ? { success: false, message: "Sesi berakhir." }
          : { success: true };
    return { ok: result.success, status: result.success ? 200 : 409, json: async () => result };
  };
  const account = { unit: "unit", category: "category", username: "operator" };
  await fetchUserMapping(account);
  clearUserMappingCache(account.username);
  await assert.rejects(fetchUserMapping(account), /Sesi berakhir/);
  assert.deepEqual(calls, ["login", "renaksi", "complete", "refresh"]);
});

test("tahapan mapping berurutan, memakai cache, dan tidak menyelesaikan halaman rusak", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearUserMappingCache();
  });
  clearUserMappingCache();
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(`${body.username}:${body.stage}`);
    const response = body.stage === "login"
      ? { success: true, year: 2026, current_date: "2026-08-01", nonce: body.username, skp_source: skp([{ id: 345, tanggal_awal: "2026-07-01", tanggal_akhir: "2026-12-31" }]) }
      : body.stage === "renaksi"
        ? { success: true, raw_response: body.username === "bad" ? "invalid" : page }
        : { success: true };
    if (body.stage !== "login") assert.equal(body.nonce, body.username);
    return { ok: true, status: 200, json: async () => response };
  };
  const account = (username) => ({ unit: "unit", category: "category", username });
  const [first, second] = await Promise.all([
    fetchUserMapping(account("first")),
    fetchUserMapping(account("second")),
  ]);
  assert.equal(first.id_skp, "345");
  assert.deepEqual(first.period, { startDate: "2026-07-01", endDate: "2026-12-31" });
  assert.equal(second.raw_response, page);
  assert.deepEqual(calls, [
    "first:login", "first:renaksi", "first:complete",
    "second:login", "second:renaksi", "second:complete",
  ]);
  await fetchUserMapping(account("second"));
  assert.equal(calls.length, 6);
  await fetchUserMapping(account("first"));
  assert.deepEqual(calls.slice(6), ["first:login", "first:renaksi", "first:complete"]);
  await assert.rejects(fetchUserMapping(account("bad")), /penilaiaan/);
  assert.deepEqual(calls.slice(9), ["bad:login", "bad:renaksi"]);
});
