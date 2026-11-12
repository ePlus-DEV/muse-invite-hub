/* Browser-only directory helpers. No server account or Muse API access. */
(function (root, factory) {
  "use strict";
  const helpers = factory();
  if (typeof module === "object" && module.exports) module.exports = helpers;
  if (root) root.MuseDirectoryFeatures = helpers;
})(typeof window === "object" ? window : null, function () {
  "use strict";
  const STORAGE_KEY = "muse-invite-hub:saved-codes:v1";
  const REPO = "https://github.com/ePlus-DEV/muse-invite-hub";
  const CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;
  const MAX_SAVED = 200;

  function parseSaved(raw) {
    try {
      const values = JSON.parse(raw);
      if (!Array.isArray(values)) return [];
      return [...new Set(values.filter(value =>
        typeof value === "string" && CODE_PATTERN.test(value)))].slice(0, MAX_SAVED);
    } catch {
      return [];
    }
  }

  function activityDate(item) {
    // These are dated catalog records, never live redemption signals.
    const dates = [item?.addedAt, item?.usageReportedAt, item?.checkedAt]
      .filter(value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
    return dates.sort().at(-1) || "";
  }

  function compareCodes(a, b, sort) {
    if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
    if (sort === "code") return a.code.localeCompare(b.code);
    const aDate = sort === "updated" ? activityDate(a) : a.addedAt || "";
    const bDate = sort === "updated" ? activityDate(b) : b.addedAt || "";
    const first = sort === "oldest" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
    return first || (b.addedAt || "").localeCompare(a.addedAt || "") ||
      a.code.localeCompare(b.code);
  }

  function quickFeedbackUrl(code, outcome) {
    if (!CODE_PATTERN.test(code)) throw Error("Invalid public invite code");
    const choices = {
      worked: "Worked for me",
      failed: "Didn't work for me"
    };
    if (!Object.hasOwn(choices, outcome)) throw Error("Invalid feedback option");
    const details = "Quick feedback choice: " + choices[outcome] +
      ". Please confirm your experience and select the required Listing platform and " +
      "What happened? options before submitting. Only Muse can verify redemption.";
    const params = new URLSearchParams({
      template: "report-code.yml",
      invite_code: code,
      title: "[Code feedback] " + code,
      details
    });
    // GitHub Issue Forms dropdowns cannot be preselected by query parameters.
    return REPO + "/issues/new?" + params.toString();
  }

  return { STORAGE_KEY, MAX_SAVED, parseSaved, activityDate, compareCodes, quickFeedbackUrl };
});
