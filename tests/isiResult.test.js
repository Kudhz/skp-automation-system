import { strict as assert } from "node:assert";
import { test } from "node:test";
import { summarizeIsiResult } from "../src/utils/isiResult.js";

test("ringkasan isi menghitung hasil retry dan menampilkan setiap percobaan", () => {
  const result = {
    status: "success",
    expected_count: 3,
    initial_success_count: 2,
    success_count: 3,
    retry_success_count: 1,
    retry_failure_count: 0,
    retries: 2,
    retry_summary: [
      { attempt: 1, success: false, http_code: 503, payload: "id=31&key=realisasi" },
      { attempt: 2, success: true, http_code: 200, payload: { id: "31", key: "realisasi" } },
    ],
  };
  const summary = summarizeIsiResult(result, 1, true);
  assert.equal(summary.success, true);
  assert.equal(summary.successCount, 3);
  assert.deepEqual(summary.retryDetails.map((retry) => retry.success), [false, true]);
  assert.deepEqual(summary.retryDetails.map((retry) => retry.field), ["realisasi", "realisasi"]);
  assert.equal(summarizeIsiResult({ ...result, status: "partial" }, 1, true).success, false);
  assert.equal(summarizeIsiResult({ ...result, success_count: 2, retry_success_count: 0 }, 1, true).success, false);
  assert.throws(() => summarizeIsiResult({ ...result, expected_count: 2 }, 1, true), /tidak valid/);
});
