import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getNextAvailableMonthNumber, getWorkflowMonthStatuses } from "../src/utils/workflowStatus.js";

const response = (assessments, indicators) =>
  `var penilaiaan = ${JSON.stringify(assessments)};` +
  `var penilaiaan_indikator = ${JSON.stringify(indicators)};`;

test("bulan dan penambahan mengikuti periode SKP Juli sampai Desember", () => {
  const months = [7, 8, 9, 10, 11, 12];
  const empty = getWorkflowMonthStatuses(response([], []), 2026, months);
  assert.deepEqual(empty.map((month) => month.monthNumber), months);
  assert.equal(empty[0].action, "tambah");
  assert.equal(empty[1].action, null);
  assert.match(empty[1].blockedReason, /Juli/);
  const assessments = [
    { id: 1, bulan: 1, tahun: 2026, status: 0 },
    { id: 2, bulan: 10, tahun: 2026, status: 0 },
  ];
  assert.equal(getNextAvailableMonthNumber(assessments, 2026, months), 11);
  assert.equal(getNextAvailableMonthNumber([{ bulan: 12, tahun: 2026 }], 2026, months), null);
  assert.equal(getNextAvailableMonthNumber([], 2026, []), null);
});

test("indikator bulan yang sudah dinilai dihitung terisi", () => {
  const assessments = [{ id: 1, bulan: 1, tahun: 2026, status: 2 }];
  const indicators = Array.from({ length: 18 }, () => ({
    id_penilaiaan: 1,
    realisasi: null,
  }));
  const [month] = getWorkflowMonthStatuses(response(assessments, indicators), 2026);
  assert.equal(month.status, "done");
  assert.equal(month.total, 18);
  assert.equal(month.filled, 18);
});

test("rating bulanan berasal dari penilaian tahun terkait dan mempertahankan perbedaan nilai", () => {
  const assessments = [
    { id: 1, bulan: 1, tahun: 2026, status: 2, nilai_kinerja_nama: "DI ATAS", nilai_perilaku_nama: "SESUAI", predikat_penilaian: "Baik" },
    { id: 2, bulan: 1, tahun: 2026, status: 2, nilai_kinerja_nama: "DI ATAS", nilai_perilaku_nama: "SESUAI", predikat_penilaian: "Baik" },
    { id: 3, bulan: 1, tahun: 2026, status: 2, nilai_kinerja_nama: "SESUAI", nilai_perilaku_nama: null, predikat_penilaian: null },
    { id: 4, bulan: 1, tahun: 2025, status: 2, nilai_kinerja_nama: "LAMA" },
  ];
  const months = getWorkflowMonthStatuses(response(assessments, []), 2026);
  assert.deepEqual(months[0].ratings, [
    { work: "DI ATAS", behavior: "SESUAI", predicate: "Baik" },
    { work: "SESUAI", behavior: null, predicate: null },
  ]);
  assert.deepEqual(months[1].ratings, []);
});
test("realisasi dengan satuan dihitung pada bulan yang belum dinilai", () => {
  const assessments = [{ id: 1, bulan: 2, tahun: 2026, status: 0 }];
  const indicators = ["1 Document", "100 Persen", "1 Bulan", "0 Persen", null]
    .map((realisasi) => ({ id_penilaiaan: 1, renaksi: "Rencana", realisasi }));
  const month = getWorkflowMonthStatuses(response(assessments, indicators), 2026)[1];
  assert.equal(month.status, "needs-fill");
  assert.equal(month.filled, 3);
  assert.equal(month.total, 5);
});

test("status dinilai hanya melengkapi indikator penilaian terkait", () => {
  const assessments = [
    { id: 1, bulan: 3, tahun: 2026, status: 2 },
    { id: 2, bulan: 3, tahun: 2026, status: 0 },
  ];
  const indicators = [
    { id_penilaiaan: 1, renaksi: "Rencana", realisasi: null },
    { id_penilaiaan: 2, renaksi: "Rencana", realisasi: 0 },
  ];
  const month = getWorkflowMonthStatuses(response(assessments, indicators), 2026)[2];
  assert.equal(month.status, "needs-fill");
  assert.equal(month.filled, 1);
  assert.equal(month.total, 2);
});

test("menampilkan dua belas bulan dan membedakan bulan tanpa data", () => {
  const assessments = [
    { id: 1, bulan: 3, tahun: 2026, status: 1 },
    { id: 2, bulan: 1, tahun: 2025, status: 2 },
  ];
  const months = getWorkflowMonthStatuses(response(assessments, []), 2026);

  assert.equal(months.length, 12);
  assert.deepEqual(months.map((month) => month.monthNumber), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(months[0].monthLabel, "Januari");
  assert.equal(months[0].status, "missing");
  assert.equal(months[0].action, null);
  assert.equal(months[2].status, "pending");
  assert.equal(months[11].monthLabel, "Desember");
  assert.equal(months.filter((month) => month.status === "missing").length, 11);
});

test("semua bulan ditampilkan ketika belum ada penilaian", () => {
  const months = getWorkflowMonthStatuses(response([], []), 2026);
  assert.equal(months.length, 12);
  assert.ok(months.every((month) => month.status === "missing"));
  assert.equal(months[0].action, "tambah");
  assert.equal(months[1].action, null);
  assert.match(months[1].blockedReason, /Januari harus ditambahkan/);
});

test("hanya bulan setelah penilaian terakhir dapat ditambahkan", () => {
  const assessments = [
    { id: 1, bulan: 10, tahun: 2026, status: 0 },
    { id: 2, bulan: 12, tahun: 2025, status: 2 },
  ];
  const months = getWorkflowMonthStatuses(response(assessments, []), 2026);
  assert.equal(months[10].action, "tambah");
  assert.equal(months[11].action, null);
  assert.match(months[11].blockedReason, /November harus ditambahkan/);
  assert.equal(months[0].action, null);
  assert.match(months[0].blockedReason, /tidak tersedia/);
});

test("bulan terakhir dihitung dari semua penilaian tahun yang sama", () => {
  const assessments = [
    { id: 1, bulan: "10", tahun: "2026", status: 3 },
  ];
  const months = getWorkflowMonthStatuses(response(assessments, []), 2026);
  assert.equal(months[10].action, "tambah");
  assert.equal(months[9].action, null);
});

test("tidak ada bulan yang bisa ditambahkan setelah Desember", () => {
  const months = getWorkflowMonthStatuses(response([
    { id: 1, bulan: 12, tahun: 2026, status: 2 },
  ], []), 2026);
  assert.ok(months.every((month) => month.action !== "tambah"));
});
