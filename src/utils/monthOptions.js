export const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function getMonthIndicatorMappings(assessments, indicators, year) {
  const mappingBulanId = {};
  const mappingBulanIdIndikator = {};
  if (!Array.isArray(assessments) || !Array.isArray(indicators)) {
    return { mappingBulanId, mappingBulanIdIndikator };
  }

  const bulanLookup = {};
  const statusLookup = {};
  assessments.forEach((item) => {
    if (
      Number(item.tahun) === year &&
      item.id &&
      item.bulan !== undefined &&
      item.status !== undefined &&
      [0, 1, 2].includes(item.status)
    ) {
      bulanLookup[item.id] = item.bulan;
      statusLookup[item.id] = item.status;
    }
  });

  indicators.forEach((indicator) => {
    if (!indicator.id || !indicator.id_penilaiaan || !indicator.id_indikator) return;
    const assessmentId = indicator.id_penilaiaan;
    if (!bulanLookup[assessmentId]) return;

    const monthName = MONTHS[parseInt(bulanLookup[assessmentId], 10) - 1];
    if (!monthName) return;

    const status = statusLookup[assessmentId];
    const realisasi = indicator.realisasi || 0;
    let label = monthName;
    if (status === 1) {
      label += " - Sudah di Ajukan";
    } else if (status === 2) {
      label += " - Sudah Di Nilai";
    } else if (status === 0) {
      label += realisasi == 0 ? " - Belum diisi" : " - Sudah diisi";
    }

    if (!mappingBulanId[label]) {
      mappingBulanId[label] = [];
      mappingBulanIdIndikator[label] = [];
    }
    mappingBulanId[label].push(indicator.id);
    mappingBulanIdIndikator[label].push(indicator.id_indikator);
  });

  return { mappingBulanId, mappingBulanIdIndikator };
}

export function groupMonthOptions(options) {
  const months = MONTHS.map((label) => ({ label, options: [] }));
  const otherOptions = [];

  for (const option of options) {
    const monthName = option.label.split(" - ")[0];
    const month = months.find((item) => item.label === monthName);
    if (month) {
      month.options.push(option);
    } else {
      otherOptions.push(option);
    }
  }

  return { months, otherOptions };
}
