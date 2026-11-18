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


// The site's explicit 30-invite default is a *display/data policy*, not a
// contributor report. A dated owner report always takes precedence, and
// policy-derived figures never gain a usageReportedAt or quotaUpdateCount.
export function displayQuota(record) {
  const knownDate = typeof record?.usageReportedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(record.usageReportedAt);
  if (knownDate && validReportedQuota(record)) {
    if (record.reportedRemaining !== undefined) {
      return {capacity:MAX_INVITES_PER_CODE,remaining:record.reportedRemaining,
        basis:"reported-remaining",reportedAt:record.usageReportedAt};
    }
    return {capacity:record.reportedCapacity,
      remaining:record.reportedCapacity-record.reportedUses,
      basis:"reported",reportedAt:record.usageReportedAt};
  }
  // Invalid/incomplete owner reports are never silently turned into proof
  // that all invites are available.
  if (record && ["reportedCapacity","reportedUses","reportedRemaining",
      "usageReportedAt"].some(key=>record[key]!==undefined)) {
    return {capacity:MAX_INVITES_PER_CODE,remaining:null,
      basis:"invalid",reportedAt:null};
  }
  return {capacity:MAX_INVITES_PER_CODE,remaining:MAX_INVITES_PER_CODE,
    basis:"default",reportedAt:null};
}

export function withDisplayQuota(records) {
  if (!Array.isArray(records)) throw Error("Expected invite catalog records");
  return records.map(record=>({...record,quotaDisplay:displayQuota(record)}));
}
