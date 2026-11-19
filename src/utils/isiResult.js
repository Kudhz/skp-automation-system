export function summarizeIsiResult(result, rhkCount, responseOk) {
  const expected = rhkCount * 3;
  const integer = (value) => Number.isSafeInteger(value) && value >= 0;
  if (
    !integer(rhkCount) ||
    rhkCount === 0 ||
    !result ||
    result.expected_count !== expected ||
    !integer(result.success_count) ||
    result.success_count > expected ||
    !integer(result.initial_success_count) ||
    !integer(result.retry_success_count) ||
    !integer(result.retry_failure_count) ||
    !integer(result.retries) ||
    result.initial_success_count + result.retry_success_count !== result.success_count ||
    !Array.isArray(result.retry_summary) ||
    result.retry_summary.length !== result.retries ||
    result.retry_success_count + result.retry_failure_count > result.retries ||
    result.retry_summary.some((item) =>
      !item || typeof item.success !== "boolean" || !integer(item.attempt) || item.attempt === 0,
    )
  ) {
    throw new Error(result?.message || "Ringkasan hasil simpan tidak valid.");
  }

  const success =
    responseOk &&
    result.status === "success" &&
    result.success_count === expected;

  const retryDetails = result.retry_summary.map((item) => {
    const payload = typeof item.payload === "string"
      ? Object.fromEntries(new URLSearchParams(item.payload))
      : item.payload;
    return {
      attempt: item.attempt,
      success: item.success,
      id: String(payload?.id ?? ""),
      field: String(payload?.key ?? ""),
      httpCode: item.http_code,
    };
  });

  return {
    success,
    expected,
    successCount: result.success_count,
    initialSuccessCount: result.initial_success_count,
    retrySuccessCount: result.retry_success_count,
    retryFailureCount: result.retry_failure_count,
    retryDetails,
  };
}
