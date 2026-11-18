import { MONTHS } from "./monthOptions.js";

export const readArrayAssignment = (source, variableName) => {
  if (typeof source !== "string" || !source) {
    throw new Error(`Data ${variableName} tidak tersedia.`);
  }
  const expression = new RegExp(
    `var\\s+${variableName}\\s*=\\s*(\\[[\\s\\S]*?\\]);`,
    "i",
  );
  const match = source.match(expression);
  if (!match) {
    throw new Error(`Data ${variableName} tidak ditemukan.`);
  }

  const value = JSON.parse(match[1]);
  if (!Array.isArray(value)) {
    throw new Error(`Format data ${variableName} tidak valid.`);
  }
  return value;
};

export function getNextAvailableMonthNumber(assessments, year, monthNumbers = MONTHS.map((_, index) => index + 1)) {
  if (monthNumbers.length === 0) return null;
  const lastMonth = assessments.reduce((latest, assessment) => {
    const month = parseInt(assessment.bulan, 10);
    return Number(assessment.tahun) === year && monthNumbers.includes(month) && month > latest
      ? month
      : latest;
  }, monthNumbers[0] - 1);
  return monthNumbers.includes(lastMonth + 1) ? lastMonth + 1 : null;
}

export function getWorkflowMonthStatuses(
  rawResponse,
  year = new Date().getFullYear(),
  monthNumbers = MONTHS.map((_, index) => index + 1),
) {
  if (typeof rawResponse !== "string" || !rawResponse) {
    throw new Error("Data rencana aksi belum tersedia.");
  }

  const assessments = readArrayAssignment(rawResponse, "penilaiaan");
  const indicators = readArrayAssignment(
    rawResponse,
    "penilaiaan_indikator",
  );
  const recordsById = new Map();
  const monthsByNumber = new Map();
  const nextAvailableMonth = getNextAvailableMonthNumber(assessments, year, monthNumbers);

  assessments.forEach((assessment) => {
    const monthNumber = Number(assessment.bulan);
    const status = Number(assessment.status);
    if (
      Number(assessment.tahun) !== year ||
      assessment.id === undefined ||
      monthNumber < 1 ||
      monthNumber > 12 ||
      !monthNumbers.includes(monthNumber) ||
      ![0, 1, 2].includes(status)
    ) {
      return;
    }

    const id = String(assessment.id);
    recordsById.set(id, { monthNumber, status });
    if (!monthsByNumber.has(monthNumber)) {
      monthsByNumber.set(monthNumber, {
        monthNumber,
        statuses: new Set(),
        total: 0,
        withRenaksi: 0,
        filled: 0,
        ratings: [],
      });
    }
    const month = monthsByNumber.get(monthNumber);
    month.statuses.add(status);
    const rating = {
      work: assessment.nilai_kinerja_nama,
      behavior: assessment.nilai_perilaku_nama,
      predicate: assessment.predikat_penilaian,
    };
    if (
      Object.values(rating).some((value) => typeof value === "string" && value.trim()) &&
      !month.ratings.some((existing) =>
        existing.work === rating.work &&
        existing.behavior === rating.behavior &&
        existing.predicate === rating.predicate,
      )
    ) {
      month.ratings.push(rating);
    }
  });

  indicators.forEach((indicator) => {
    const record = recordsById.get(String(indicator.id_penilaiaan));
    if (!record) return;

    const month = monthsByNumber.get(record.monthNumber);
    month.total += 1;
    if (String(indicator.renaksi || "").trim()) {
      month.withRenaksi += 1;
    }
    if (record.status === 2 || parseFloat(indicator.realisasi) > 0) {
      month.filled += 1;
    }
  });

  return MONTHS.flatMap((monthLabel, index) => {
    const monthNumber = index + 1;
    if (!monthNumbers.includes(monthNumber)) return [];
    const month = monthsByNumber.get(monthNumber);
    if (!month) {
      return [{
        monthNumber,
        monthLabel,
        total: 0,
        filled: 0,
        ratings: [],
        status: "missing",
        action: monthNumber === nextAvailableMonth ? "tambah" : null,
        label: "Belum ada data",
        blockedReason: monthNumber === nextAvailableMonth
          ? null
          : nextAvailableMonth !== null && monthNumber > nextAvailableMonth
            ? `Rencana aksi ${MONTHS[index - 1]} harus ditambahkan terlebih dahulu.`
            : "Bulan ini tidak tersedia untuk ditambahkan secara berurutan.",
      }];
    }

    const { statuses, total, withRenaksi, filled } = month;
    let status;
    let action;
    let label;

    if (statuses.has(0)) {
      if (total === 0 || withRenaksi < total) {
        status = "needs-renaksi";
        action = "tambah";
        label = "Perlu ditambahkan";
      } else if (filled < total) {
        status = "needs-fill";
        action = "isi";
        label = "Perlu diisi";
      } else {
        status = "ready";
        action = "ajukan";
        label = "Siap diajukan";
      }
    } else if (statuses.has(1)) {
      status = "pending";
      action = "preview";
      label = "Menunggu penilaian";
    } else {
      status = "done";
      action = "preview";
      label = "Sudah dinilai";
    }

    return [{
      ...month,
      monthLabel,
      status,
      action,
      label,
    }];
  });
}
