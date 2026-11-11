import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const statuses = new Set(["unverified", "reported-working", "reported-not-working"]);
const allowedKeys = new Set(["id", "code", "status", "addedAt", "submittedBy", "note", "sourceUrl", "checkedAt", "reportedUses", "reportedCapacity", "usageReportedAt", "featured", "ownerConfirmed"]);

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateCatalog(data) {
  const errors = [];
  if (!Array.isArray(data)) return ["Catalog must be a JSON array."];
  const ids = new Set();
  const codes = new Set();
  let featuredCount = 0;

  data.forEach((item, index) => {
    const at = "Entry " + (index + 1);
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(at + ": must be an object.");
      return;
    }
    for (const key of Object.keys(item)) {
      if (!allowedKeys.has(key)) errors.push(at + ": unsupported field " + key + ".");
    }
    if (typeof item.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) {
      errors.push(at + ": id must be a lowercase slug.");
    } else if (ids.has(item.id)) {
      errors.push(at + ": duplicate id " + item.id + ".");
    } else ids.add(item.id);

    if (typeof item.code !== "string" || !/^[A-Z0-9-]{4,32}$/.test(item.code)) {
      errors.push(at + ": code must be 4–32 uppercase letters, digits or hyphens.");
    } else if (codes.has(item.code.toUpperCase())) {
      errors.push(at + ": duplicate code " + item.code + ".");
    } else codes.add(item.code.toUpperCase());

    if (!statuses.has(item.status)) errors.push(at + ": invalid community status.");
    if (item.featured !== undefined && typeof item.featured !== "boolean") errors.push(at + ": featured must be a boolean.");
    if (item.ownerConfirmed !== undefined && typeof item.ownerConfirmed !== "boolean") errors.push(at + ": ownerConfirmed must be a boolean.");
    if (item.ownerConfirmed === true && (item.featured !== true || item.submittedBy !== "hoangsvit")) errors.push(at + ": only the featured ePlus.DEV owner code may be ownerConfirmed.");
    if (item.featured === true) {
      featuredCount += 1;
      if (item.status !== "unverified" && item.status !== "reported-working") errors.push(at + ": do not feature a code reported not working.");
    }
    if (!validDate(item.addedAt)) errors.push(at + ": addedAt must be a real YYYY-MM-DD date.");
    if (item.checkedAt !== undefined && !validDate(item.checkedAt)) errors.push(at + ": checkedAt must be YYYY-MM-DD.");
    const usagePresent = item.reportedUses !== undefined || item.reportedCapacity !== undefined || item.usageReportedAt !== undefined;
    if (usagePresent) {
      if (!Number.isInteger(item.reportedUses) || item.reportedUses < 0) errors.push(at + ": reportedUses must be a non-negative integer.");
      if (!Number.isInteger(item.reportedCapacity) || item.reportedCapacity <= 0 || item.reportedCapacity > 1000) errors.push(at + ": reportedCapacity must be an integer from 1 to 1000.");
      if (!validDate(item.usageReportedAt)) errors.push(at + ": usageReportedAt must be YYYY-MM-DD when usage data exists.");
      if (Number.isInteger(item.reportedUses) && Number.isInteger(item.reportedCapacity) && item.reportedUses > item.reportedCapacity) {
        errors.push(at + ": reportedUses cannot exceed reportedCapacity.");
      }
    }
    if (item.note !== undefined && (typeof item.note !== "string" || item.note.length > 180)) errors.push(at + ": note must contain at most 180 characters.");
    if (item.submittedBy !== undefined && (typeof item.submittedBy !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(item.submittedBy))) errors.push(at + ": invalid GitHub username.");
    if (item.sourceUrl !== undefined) {
      try {
        const url = new URL(item.sourceUrl);
        if (url.protocol !== "https:" || !url.hostname.includes(".")) throw new Error("HTTPS only");
        if (url.hostname.toLowerCase() === "github.com") {
          const parts = url.pathname.split("/").filter(Boolean);
          if (parts.length >= 2 && (parts[0].toLowerCase() !== "eplus-dev" || parts[1].toLowerCase() !== "muse-invite-hub")) {
            errors.push(at + ": sourceUrl cannot point to an unrelated GitHub repository.");
          }
        }
      } catch { errors.push(at + ": sourceUrl must be a valid public HTTPS URL."); }
    }
  });
  if (featuredCount > 1) errors.push("Only one featured invite code is allowed.");
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = new URL("../data/invites.json", import.meta.url);
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error("Could not read catalog:", error.message);
    process.exitCode = 1;
  }
  if (data !== undefined) {
    const errors = validateCatalog(data);
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else {
      console.log("✓ Valid Muse invite catalog: " + data.length + " entries.");
    }
  }
}
