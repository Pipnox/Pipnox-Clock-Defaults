// node scripts/validate.js
// Checks the four config files in the repo root with the SAME validator the
// app uses, so a mistake is caught here instead of on users' computers.
const fs = require("fs");
const path = require("path");
const { validateAll } = require("./defaults-validate");

const root = path.join(__dirname, "..");
const raw = {};
for (const f of ["sessions", "ranges", "timepoints", "modes"]) {
  try {
    raw[f] = JSON.parse(fs.readFileSync(path.join(root, f + ".json"), "utf-8"));
  } catch (e) {
    console.error(`${f}.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }
}
const res = validateAll(raw);
if (!res.ok) {
  console.error("INVALID:\n - " + res.errors.join("\n - "));
  process.exit(1);
}
console.log(`OK: ${res.config.sessions.length} sessions, ${res.config.ranges.length} ranges, ` +
  `${res.config.timepoints.length} time points, ${res.config.modes.length} modes`);
