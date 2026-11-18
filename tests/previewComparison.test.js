import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compareWithPreviousMonth } from "../src/utils/previewComparison.js";

test("membandingkan indikator Oktober dengan September, bukan bulan pertama SKP", () => {
  const assessments = [
    { id: 1, tahun: 2026, bulan: 7 },
    { id: 2, tahun: 2026, bulan: 9 },
    { id: 3, tahun: 2026, bulan: 10 },
  ];
  const indicators = [
    { id_penilaiaan: 1, id_indikator: 10, renaksi: "Juli" },
    { id_penilaiaan: 2, id_indikator: 11, renaksi: "Rencana kedua" },
    { id_penilaiaan: 2, id_indikator: 10, renaksi: "Rencana pertama" },
    { id_penilaiaan: 3, id_indikator: 10, renaksi: " Rencana pertama " },
    { id_penilaiaan: 3, id_indikator: 11, renaksi: "Berubah" },
  ];
  const items = indicators.slice(3);
  assert.deepEqual(compareWithPreviousMonth(items, assessments, indicators, "2026-07-01"), {
    monthLabel: "September", year: 2026, hasReference: true, results: ["same", "different"],
  });
});

test("data kosong, hilang, atau acuan duplikat yang berbeda tidak dianggap sama", () => {
  const assessments = [{ id: 1, tahun: 2025, bulan: 12 }, { id: 2, tahun: 2026, bulan: 12 }];
  const indicators = [
    { id_penilaiaan: 1, id_indikator: 1, renaksi: "A" },
    { id_penilaiaan: 1, id_indikator: 1, renaksi: "B" },
    { id_penilaiaan: 1, id_indikator: 2, renaksi: "" },
    { id_penilaiaan: 1, id_indikator: 3, renaksi: "A" },
    { id_penilaiaan: 2, id_indikator: 4, renaksi: "A" },
  ];
  const items = [1, 2, 3, 4, null].map((id_indikator) => ({
    id_penilaiaan: 2,
    id_indikator,
    renaksi: "A",
  }));
  items[2].renaksi = " ";
  const result = compareWithPreviousMonth(items, assessments, indicators, "2025-01-01");
  assert.equal(result.year, 2026);
  assert.equal(result.monthLabel, "November");
  assert.deepEqual(result.results, Array(5).fill("unavailable"));
  assert.throws(() => compareWithPreviousMonth(items, assessments, indicators, "invalid"), /Tanggal awal/);
});

test("mengabaikan perbedaan spasi dan karakter tak terlihat tanpa mengabaikan perubahan isi", () => {
  const assessments = [
    { id: 1, tahun: 2026, bulan: 1 },
    { id: 2, tahun: 2026, bulan: 2 },
  ];
  const indicators = [
    { id_penilaiaan: 1, id_indikator: 1, renaksi: "Rencana  aksi\r\nbulanan" },
    { id_penilaiaan: 1, id_indikator: 1, renaksi: "Rencana\u00a0aksi bulanan" },
    { id_penilaiaan: 1, id_indikator: 2, renaksi: "Cafe\u0301" },
    { id_penilaiaan: 1, id_indikator: 3, renaksi: "\u200b \n" },
  ];
  const items = [
    { id_penilaiaan: 2, id_indikator: 1, renaksi: "Rencana aksi\u200b bulanan" },
    { id_penilaiaan: 2, id_indikator: 1, renaksi: "Rencana aksi tahunan" },
    { id_penilaiaan: 2, id_indikator: 2, renaksi: "Caf\u00e9" },
    { id_penilaiaan: 2, id_indikator: 3, renaksi: "Isi" },
  ];
  assert.deepEqual(compareWithPreviousMonth(items, assessments, indicators, "2026-01-01").results, [
    "same", "different", "same", "unavailable",
  ]);
});

test("bulan pertama periode SKP tidak dibandingkan dengan bulan di luar periode", () => {
  const assessments = [
    { id: 1, tahun: 2026, bulan: 6 },
    { id: 2, tahun: 2026, bulan: 7 },
  ];
  const indicators = [
    { id_penilaiaan: 1, id_indikator: 1, renaksi: "Juni" },
    { id_penilaiaan: 2, id_indikator: 1, renaksi: "Juli" },
  ];
  const result = compareWithPreviousMonth(
    [indicators[1]],
    assessments,
    indicators,
    "2026-07-01",
  );
  assert.equal(result.hasReference, false);
  assert.deepEqual(result.results, ["unavailable"]);
});
