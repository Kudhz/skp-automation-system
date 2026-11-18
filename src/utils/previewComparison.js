import { MONTHS } from "./monthOptions.js";
import { isValidSkpDate } from "./skpPage.js";

function normalizePlan(value) {
  return typeof value === "string"
    ? value.normalize("NFC").replace(/\u200B/g, "").replace(/\s+/g, " ").trim()
    : "";
}

export function compareWithPreviousMonth(items, assessments, indicators, startDate) {
  if (!isValidSkpDate(startDate)) {
    throw new Error("Tanggal awal SKP tidak valid.");
  }
  if (!Array.isArray(items) || !Array.isArray(assessments) || !Array.isArray(indicators)) {
    throw new Error("Data perbandingan rencana aksi tidak tersedia.");
  }

  const assessmentById = new Map(
    assessments
      .filter((assessment) => assessment.id != null)
      .map((assessment) => [String(assessment.id), assessment]),
  );
  const currentDates = new Set(
    items
      .map((item) => assessmentById.get(String(item.id_penilaiaan)))
      .filter(Boolean)
      .map((assessment) => `${assessment.tahun}-${String(assessment.bulan).padStart(2, "0")}`),
  );
  if (currentDates.size !== 1) {
    return {
      monthLabel: "",
      year: null,
      hasReference: false,
      results: items.map(() => "unavailable"),
    };
  }

  const [currentYear, currentMonth] = [...currentDates][0].split("-").map(Number);
  const previousDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const year = previousDate.getUTCFullYear();
  const month = previousDate.getUTCMonth() + 1;
  const previousMonthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  if (previousMonthStart < `${startDate.slice(0, 7)}-01`) {
    return {
      monthLabel: MONTHS[month - 1],
      year,
      hasReference: false,
      results: items.map(() => "unavailable"),
    };
  }

  const previousAssessmentIds = new Set(
    assessments
      .filter((assessment) =>
        Number(assessment.tahun) === year && Number(assessment.bulan) === month &&
        assessment.id != null,
      )
      .map((assessment) => String(assessment.id)),
  );
  const previousPlans = new Map();
  for (const indicator of indicators) {
    if (!previousAssessmentIds.has(String(indicator.id_penilaiaan)) || indicator.id_indikator == null) continue;
    const key = String(indicator.id_indikator);
    if (!previousPlans.has(key)) previousPlans.set(key, []);
    previousPlans.get(key).push(normalizePlan(indicator.renaksi));
  }

  const results = items.map((item) => {
    const current = normalizePlan(item.renaksi);
    const reference = item.id_indikator == null ? null : previousPlans.get(String(item.id_indikator));
    if (!current || !reference?.length || reference.some((plan) => !plan) ||
        new Set(reference).size !== 1) {
      return "unavailable";
    }
    return current === reference[0] ? "same" : "different";
  });

  return { monthLabel: MONTHS[month - 1], year, hasReference: true, results };
}
