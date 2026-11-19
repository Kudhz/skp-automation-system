import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("PHP counts successful RHK requests and retry outcomes without network access", () => {
  const script = fileURLToPath(new URL("ekinSaveMock.php", import.meta.url));
  const run = (scenario) => {
    const process = spawnSync("php", ["-n", script, scenario], { encoding: "utf8" });
    assert.equal(process.status, 0, process.stderr);
    return JSON.parse(process.stdout);
  };

  const all = run("all");
  assert.equal(all.status, "success");
  assert.equal(all.expected_count, 3);
  assert.equal(all.success_count, 3);

  const two = run("two");
  assert.equal(two.status, "success");
  assert.equal(two.expected_count, 6);
  assert.equal(two.success_count, 6);

  const retry = run("retry");
  assert.equal(retry.status, "success");
  assert.equal(retry.initial_success_count, 2);
  assert.equal(retry.retry_success_count, 1);
  assert.equal(retry.retry_failure_count, 0);
  assert.equal(retry.success_count, 3);
  assert.equal(retry.retry_summary[0].success, true);

  const fifth = run("retry-fifth");
  assert.equal(fifth.status, "success");
  assert.equal(fifth.success_count, 3);
  assert.deepEqual(fifth.retry_summary.map((item) => item.success), [false, false, false, false, true]);
  assert.equal(fifth.retry_summary[4].attempt, 5);

  const failure = run("failure");
  assert.equal(failure.status, "partial");
  assert.equal(failure.success_count, 0);
  assert.equal(failure.retry_failure_count, 1);
  assert.deepEqual(failure.retry_summary.map((item) => item.success), [false, false, false, false, false]);
  assert.equal(failure.final_failures.length, 3);

  const clientError = run("retry-client-error");
  assert.equal(clientError.status, "partial");
  assert.equal(clientError.success_count, 2);
  assert.equal(clientError.retry_failure_count, 1);

  assert.match(run("missing-id").message, /Jumlah RHK dan ID indikator/);
});
