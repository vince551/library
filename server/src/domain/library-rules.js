export function canTransitionAttendance(lastAction, nextAction) {
  if (nextAction === "check-in") return lastAction !== "check-in";
  if (nextAction === "check-out") return lastAction === "check-in";
  return false;
}

export function hasAvailableCapacity(occupancy, capacity) {
  const current = Number(occupancy);
  const maximum = Number(capacity);
  return Number.isFinite(current) && Number.isFinite(maximum) &&
    current >= 0 && maximum >= 1 && current < maximum;
}

export function effectiveLoanStatus(status, dueAt, now = Date.now()) {
  if (status !== "active" || !dueAt) return status;
  const dueTime = new Date(dueAt).getTime();
  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(dueTime) && Number.isFinite(currentTime) && dueTime < currentTime
    ? "overdue"
    : status;
}

export function withEffectiveLoanStatus(loan) {
  return { ...loan, status: effectiveLoanStatus(loan.status, loan.due_at ?? loan.dueAt) };
}
