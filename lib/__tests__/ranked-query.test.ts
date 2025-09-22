import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const queriesSource = readFileSync(path.join(process.cwd(), "lib", "queries.ts"), "utf8");

test("ranked candidates query filters by activity window", () => {
  assert.match(
    queriesSource,
    /a\.window_end\s*>=\s*NOW\(\)\s*-\s*INTERVAL '\$\{sql\.raw\(intervalLiteral\)\}'/,
    "expected window_end based recency filter",
  );
});

test("ranked candidates query no longer filters by post timestamp", () => {
  assert.ok(
    !/AND\s+p\.timestamp\s*>=\s*NOW\(\)\s*-\s*INTERVAL '\$\{sql\.raw\(intervalLiteral\)\}'/.test(queriesSource),
    "post timestamp based filter should be removed from ranked candidates CTE",
  );
});

test("ranked candidates query decays by activity timestamp", () => {
  assert.match(
    queriesSource,
    /NOW\(\)\s*-\s*z\.activity_ts/,
    "recency decay should use activity timestamp",
  );
});
