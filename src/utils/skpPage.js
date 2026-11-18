import { readArrayAssignment } from "./workflowStatus.js";

export function isValidSkpDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getActiveSkp(source, today) {
  if (!isValidSkpDate(today)) throw new Error("Tanggal server tidak valid.");
  const data = readArrayAssignment(source, "dataList");
  const active = data.filter((item) => {
    if (
      !isValidSkpDate(item?.tanggal_awal) ||
      !isValidSkpDate(item?.tanggal_akhir) ||
      item.tanggal_awal > item.tanggal_akhir
    ) {
      throw new Error("Periode SKP tidak valid atau tidak lengkap.");
    }
    return item.tanggal_awal <= today && today <= item.tanggal_akhir;
  });
  if (active.length === 0) throw new Error("Tidak ada SKP yang aktif pada tanggal server.");
  if (active.length > 1) throw new Error("Terdapat lebih dari satu SKP aktif. Periksa periode SKP.");
  const entry = active[0];
  const id = entry?.id;
  if (
    (typeof id !== "string" && typeof id !== "number") ||
    !/^[1-9][0-9]{0,15}$/.test(String(id)) ||
    !Number.isSafeInteger(Number(id))
  ) {
    throw new Error("ID SKP aktif tidak valid.");
  }
  return { id: String(id), startDate: entry.tanggal_awal, endDate: entry.tanggal_akhir };
}

export function getSkpMonthNumbers(period, year) {
  if (
    !period || !isValidSkpDate(period.startDate) || !isValidSkpDate(period.endDate) ||
    period.startDate > period.endDate || !Number.isInteger(year)
  ) {
    throw new Error("Periode SKP tidak valid atau tidak lengkap.");
  }
  const months = [];
  for (let month = 1; month <= 12; month += 1) {
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const last = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    if (period.startDate <= last && period.endDate >= first) months.push(month);
  }
  return months;
}

export function validateRenaksiPage(source) {
  for (const name of ["penilaiaan", "penilaiaan_indikator", "rkh_indikator"]) {
    readArrayAssignment(source, name);
  }
}

function readObjectAssignment(source, name) {
  const expression = new RegExp(
    String.raw`var\s+${name}\s*=\s*(\{(?:"(?:\\.|[^"\\])*"|[^";])*?\})\s*;`,
    "i",
  );
  const match = typeof source === "string" ? source.match(expression) : null;
  if (!match) throw new Error(`Data ${name} tidak ditemukan.`);
  const value = JSON.parse(match[1]);
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(`Format data ${name} tidak valid.`);
  }
  return value;
}

export function getSkpDetails(source, expectedId) {
  const skp = readObjectAssignment(source, "skp");
  const pegawai = readObjectAssignment(source, "pegawai");
  if (
    !expectedId ||
    String(skp.id) !== String(expectedId) ||
    (pegawai.id_skp != null && String(pegawai.id_skp) !== String(expectedId))
  ) {
    throw new Error("Detail SKP tidak sesuai dengan SKP pengguna yang dipilih.");
  }
  return {
    name: pegawai.nama,
    nip: skp.nip,
    position: pegawai.jabatan_fungsional,
    unit: pegawai.unit,
    startDate: skp.tanggal_awal,
    endDate: skp.tanggal_akhir,
  };
}
