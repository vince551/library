import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionAttendance,
  hasAvailableCapacity,
  effectiveLoanStatus
} from "../src/domain/library-rules.js";

test("attendance allows first check-in and check-in after checkout", () => {
  assert.equal(canTransitionAttendance(null, "check-in"), true);
  assert.equal(canTransitionAttendance("check-out", "check-in"), true);
});

test("attendance prevents duplicate check-in and invalid checkout", () => {
  assert.equal(canTransitionAttendance("check-in", "check-in"), false);
  assert.equal(canTransitionAttendance(null, "check-out"), false);
  assert.equal(canTransitionAttendance("check-out", "check-out"), false);
});

test("capacity is available only below the configured limit", () => {
  assert.equal(hasAvailableCapacity(0, 1), true);
  assert.equal(hasAvailableCapacity(99, 100), true);
  assert.equal(hasAvailableCapacity(100, 100), false);
  assert.equal(hasAvailableCapacity(101, 100), false);
});

test("active loans become overdue at read time without a database write", () => {
  const now = new Date("2026-11-23T12:00:00.000Z");
  assert.equal(effectiveLoanStatus("active", "2026-11-22T12:00:00.000Z", now), "overdue");
  assert.equal(effectiveLoanStatus("active", "2026-11-24T12:00:00.000Z", now), "active");
  assert.equal(effectiveLoanStatus("returned", "2026-11-22T12:00:00.000Z", now), "returned");
});
