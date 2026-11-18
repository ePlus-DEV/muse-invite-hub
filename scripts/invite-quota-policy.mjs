// Project catalog policy: one Muse invite code has at most 30 reported slots.
// This is an upper bound, NOT proof every code was issued 30 slots,
// and never a substitute for an owner-confirmed dated usage report.
export const MAX_INVITES_PER_CODE = 30;

export function validReportedQuota(record) {
  if (!record || typeof record !== "object") return false;
  if (record.reportedRemaining !== undefined) {
    return record.reportedCapacity === undefined &&
      record.reportedUses === undefined &&
      Number.isSafeInteger(record.reportedRemaining) &&
      record.reportedRemaining >= 0 &&
      record.reportedRemaining <= MAX_INVITES_PER_CODE;
  }
  return Number.isSafeInteger(record.reportedCapacity) &&
    Number.isSafeInteger(record.reportedUses) &&
    record.reportedCapacity >= 1 &&
    record.reportedCapacity <= MAX_INVITES_PER_CODE &&
    record.reportedUses >= 0 &&
    record.reportedUses <= record.reportedCapacity;
}
