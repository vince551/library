import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionAttendance,
  hasAvailableCapacity,
  effectiveLoanStatus,
  canIssueCopy,
  canReturnLoan,
  hasBorrowingCapacity,
  canReduceAvailableStock
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

test("a physical copy can only be issued while available", () => {
  assert.equal(canIssueCopy("available"), true);
  assert.equal(canIssueCopy("loaned"), false);
  assert.equal(canIssueCopy("maintenance"), false);
});

test("a loan can only be returned once", () => {
  assert.equal(canReturnLoan("active"), true);
  assert.equal(canReturnLoan("overdue"), true);
  assert.equal(canReturnLoan("returned"), false);
  assert.equal(canReturnLoan("cancelled"), false);
});

test("borrowing capacity stops at three active or overdue loans", () => {
  assert.equal(hasBorrowingCapacity(0), true);
  assert.equal(hasBorrowingCapacity(2), true);
  assert.equal(hasBorrowingCapacity(3), false);
  assert.equal(hasBorrowingCapacity(4), false);
});

test("inventory reduction preserves copies needed for approved requests", () => {
  assert.equal(canReduceAvailableStock(5, 2, 3), true);
  assert.equal(canReduceAvailableStock(5, 3, 3), false);
  assert.equal(canReduceAvailableStock(2, 1, 2), false);
  assert.equal(canReduceAvailableStock(4, 2, 1), true);
});

test("inventory reduction rejects invalid quantities", () => {
  assert.equal(canReduceAvailableStock(-1, 1, 0), false);
  assert.equal(canReduceAvailableStock(3, -1, 0), false);
  assert.equal(canReduceAvailableStock(3, 1, 1.5), false);
});
