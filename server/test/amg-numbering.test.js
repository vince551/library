import test from "node:test";
import assert from "node:assert/strict";
import { formatAmgNumber, nextAmgNumber } from "../src/domain/amg-numbering.js";

test("formats each AMG identifier family with a four-digit minimum", () => {
  assert.equal(formatAmgNumber("M", 1), "AMG-M-0001");
  assert.equal(formatAmgNumber("B", 42), "AMG-B-0042");
  assert.equal(formatAmgNumber("C", 9999), "AMG-C-9999");
  assert.equal(formatAmgNumber("E", 10000), "AMG-E-10000");
  assert.equal(formatAmgNumber("L", 7), "AMG-L-0007");
  assert.equal(formatAmgNumber("R", 8), "AMG-R-0008");
  assert.equal(formatAmgNumber("A", 9), "AMG-A-0009");
});

test("rejects unknown types and invalid sequence values", () => {
  assert.throws(() => formatAmgNumber("X", 1), /Unsupported/);
  assert.throws(() => formatAmgNumber("M", 0), /positive/);
  assert.throws(() => formatAmgNumber("M", 1.5), /positive/);
});

test("delegates allocation to the atomic PostgreSQL counter function", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [{ number: "AMG-C-0012" }] };
    }
  };
  assert.equal(await nextAmgNumber(client, "C"), "AMG-C-0012");
  assert.deepEqual(calls, [{
    sql: "SELECT next_amg_number($1) AS number",
    params: ["C"]
  }]);
  await assert.rejects(() => nextAmgNumber(client, "UNKNOWN"), /Unsupported/);
});
