import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getMonthIndicatorMappings, groupMonthOptions } from "../src/utils/monthOptions.js";

test("mengelompokkan semua bulan dan mempertahankan pilihan serta status", () => {
  const options = [
    { value: "[1]", label: "Januari - Belum diisi" },
    { value: "[2]", label: "Januari - Sudah diisi" },
    { value: "month_2", label: "Maret - Sudah Di Nilai", disabled: true },
    { value: "", label: "Gagal ambil data", disabled: true },
  ];
  const { months, otherOptions } = groupMonthOptions(options);

  assert.equal(months.length, 12);
  assert.equal(months[0].label, "Januari");
  assert.deepEqual(months[0].options, options.slice(0, 2));
  assert.deepEqual(months[1].options, []);
  assert.deepEqual(months[2].options, [options[2]]);
  assert.equal(months[11].label, "Desember");
  assert.deepEqual(otherOptions, [options[3]]);
});

test("status bulan mengikuti penilaian dan realisasi indikator tahun yang dipilih", () => {
  const assessments = [
    { id: 1, bulan: 1, tahun: "2026", status: 0 },
    { id: 2, bulan: 2, tahun: 2026, status: 1 },
    { id: 3, bulan: 3, tahun: 2026, status: 2 },
    { id: 4, bulan: 4, tahun: 2025, status: 2 },
  ];
  const indicators = [
    { id: 11, id_penilaiaan: 1, id_indikator: 101, realisasi: 0 },
    { id: 12, id_penilaiaan: 1, id_indikator: 102, realisasi: "1 Bulan" },
    { id: 13, id_penilaiaan: 2, id_indikator: 103 },
    { id: 14, id_penilaiaan: 3, id_indikator: 104 },
    { id: 15, id_penilaiaan: 4, id_indikator: 105 },
  ];
  const { mappingBulanId, mappingBulanIdIndikator } =
    getMonthIndicatorMappings(assessments, indicators, 2026);

  assert.deepEqual(mappingBulanId, {
    "Januari - Belum diisi": [11],
    "Januari - Sudah diisi": [12],
    "Februari - Sudah di Ajukan": [13],
    "Maret - Sudah Di Nilai": [14],
  });
  assert.deepEqual(mappingBulanIdIndikator["Januari - Sudah diisi"], [102]);
});
