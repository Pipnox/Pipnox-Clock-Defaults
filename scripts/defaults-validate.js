// defaults-validate.js
// ---------------------------------------------------------------------
// Pure validation + normalization of the four "factory default" config
// files (sessions.json / ranges.json / timepoints.json / modes.json).
//
// Used in two places, with this exact same file:
//   1) inside the app (defaults-loader.js) -- every config, bundled or
//      downloaded from GitHub, is checked here before the clock ever sees
//      it. A config that fails ANY rule is ignored as a whole and the
//      previous known-good one is used instead, so a typo in the GitHub
//      repo can never break the clock.
//   2) inside the Pipnox-Clock-Defaults GitHub repo (scripts/validate.js,
//      run by GitHub Actions on every push) so a mistake is caught before
//      it is even published.
//
// No Electron / Node-only APIs here on purpose. Keep both copies identical.
// ---------------------------------------------------------------------
"use strict";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// These strings end up inside innerHTML / SVG text in the clock UI, so
// characters that could form markup or break out of an attribute are
// rejected outright. ("&" is allowed: names like "BM&FBOVESPA" need it, and
// an & on its own can never create a tag.)
const TEXT_BAD_RE = /[<>"'`\\\u0000-\u001f\u007f]/;

// Same values as the UTC-offset dropdown in the app (TIMEZONES in index.html).
const OFFSETS = new Set([-12, -11, -10, -9.5, -9, -8, -7, -6, -5, -4, -3.5, -3, -2, -1, 0, 1, 2, 3, 3.5, 4, 4.5, 5, 5.5, 5.75, 6, 6.5, 7, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12, 12.75, 13, 14]);
const DEFAULT_OFFSET = 3; // Tehran, what ranges/time points have always used

const LIMITS = {
  sessions: 60,
  ranges: 60,
  timepoints: 100,
  modes: 12,
  nameMax: 60,
  labelMax: 24,
};

function timeToMin(str) {
  const m = TIME_RE.exec(str);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function validateAll(raw) {
  const errors = [];
  const err = (msg) => errors.push(msg);

  function text(value, where, max) {
    if (typeof value !== "string") return err(`${where}: must be text`), null;
    const v = value.trim();
    if (!v) return err(`${where}: must not be empty`), null;
    if (v.length > max) return err(`${where}: longer than ${max} characters`), null;
    if (TEXT_BAD_RE.test(v))
      return err(`${where}: contains a forbidden character (< > " ' \` \\)`), null;
    return v;
  }
  function id(value, where) {
    if (typeof value !== "string" || !ID_RE.test(value))
      return err(`${where}: id must be 1-40 letters/digits/-/_ (got ${JSON.stringify(value)})`), null;
    return value;
  }
  function time(value, where) {
    const mins = typeof value === "string" ? timeToMin(value) : null;
    if (mins === null) return err(`${where}: time must look like "09:30" (got ${JSON.stringify(value)})`), null;
    return mins;
  }
  // Optional "offset" (UTC offset the times are written in). Omitted -> 3.
  function offset(value, where) {
    if (value === undefined) return DEFAULT_OFFSET;
    if (typeof value !== "number" || !OFFSETS.has(value))
      return err(`${where} offset: must be a UTC offset from the app's list, e.g. 3 or 3.5 or -5 (got ${JSON.stringify(value)})`), null;
    return value;
  }
  function list(file, key, max) {
    const arr = raw && raw[file] && raw[file][key];
    if (!Array.isArray(arr)) {
      err(`${file}.json: must contain a "${key}" list`);
      return [];
    }
    if (arr.length > max) err(`${file}.json: more than ${max} entries`);
    return arr;
  }

  const config = { sessions: [], ranges: [], timepoints: [], modes: [] };

  // ---- sessions ----
  const sessionIds = new Set();
  list("sessions", "sessions", LIMITS.sessions).forEach((s, i) => {
    const w = `sessions.json #${i + 1}`;
    if (!s || typeof s !== "object") return err(`${w}: must be an object`);
    const sid = id(s.id, w);
    if (sid !== null) {
      if (sessionIds.has(sid)) err(`${w}: duplicate id "${sid}"`);
      sessionIds.add(sid);
    }
    const nameFa = text(s.nameFa, `${w} nameFa`, LIMITS.nameMax);
    const abbr = text(s.abbr, `${w} abbr`, LIMITS.nameMax);
    const startUTC = time(s.start, `${w} start`);
    const endUTC = time(s.end, `${w} end`);
    config.sessions.push({ id: sid, nameFa, abbr, startUTC, endUTC });
  });

  // ---- ranges ----
  const rangeIds = new Set();
  list("ranges", "ranges", LIMITS.ranges).forEach((r, i) => {
    const w = `ranges.json #${i + 1}`;
    if (!r || typeof r !== "object") return err(`${w}: must be an object`);
    const rid = id(r.id, w);
    if (rid !== null) {
      if (rangeIds.has(rid)) err(`${w}: duplicate id "${rid}"`);
      rangeIds.add(rid);
    }
    const start = time(r.start, `${w} start`) === null ? null : r.start;
    const end = time(r.end, `${w} end`) === null ? null : r.end;
    let color = null;
    if (typeof r.color === "string" && COLOR_RE.test(r.color)) color = r.color.toLowerCase();
    else err(`${w} color: must look like "#rrggbb" (got ${JSON.stringify(r.color)})`);
    const label = text(r.label, `${w} label`, LIMITS.labelMax);
    const off = offset(r.offset, w);
    config.ranges.push({ id: rid, start, end, color, label, offset: off });
  });

  // ---- time points ----
  const tpIds = new Set();
  list("timepoints", "timepoints", LIMITS.timepoints).forEach((t, i) => {
    const w = `timepoints.json #${i + 1}`;
    if (!t || typeof t !== "object") return err(`${w}: must be an object`);
    const tid = id(t.id, w);
    if (tid !== null) {
      if (tpIds.has(tid)) err(`${w}: duplicate id "${tid}"`);
      tpIds.add(tid);
    }
    const tm = time(t.time, `${w} time`) === null ? null : t.time;
    const off = offset(t.offset, w);
    config.timepoints.push({ id: tid, time: tm, offset: off });
  });

  // ---- modes (reference sessions/ranges/time points by id) ----
  function selection(value, known, where, what) {
    if (value === "all" || value === "none") return value;
    if (!Array.isArray(value)) {
      err(`${where}: must be "all", "none" or a list of ${what} ids`);
      return "none";
    }
    const seen = new Set();
    value.forEach((x) => {
      if (!known.has(x)) err(`${where}: unknown ${what} id ${JSON.stringify(x)}`);
      if (seen.has(x)) err(`${where}: ${what} id ${JSON.stringify(x)} listed twice`);
      seen.add(x);
    });
    return value.slice();
  }
  const modeIds = new Set();
  list("modes", "modes", LIMITS.modes).forEach((m, i) => {
    const w = `modes.json #${i + 1}`;
    if (!m || typeof m !== "object") return err(`${w}: must be an object`);
    const mid = id(m.id, w);
    if (mid !== null) {
      if (modeIds.has(mid)) err(`${w}: duplicate id "${mid}"`);
      modeIds.add(mid);
    }
    config.modes.push({
      id: mid,
      nameFa: text(m.nameFa, `${w} nameFa`, LIMITS.nameMax),
      nameEn: text(m.nameEn, `${w} nameEn`, LIMITS.nameMax),
      sessions: selection(m.sessions, sessionIds, `${w} sessions`, "session"),
      ranges: selection(m.ranges, rangeIds, `${w} ranges`, "range"),
      timepoints: selection(m.timepoints, tpIds, `${w} timepoints`, "time point"),
    });
  });

  if (errors.length) return { ok: false, errors, config: null };
  return { ok: true, errors: [], config };
}

module.exports = { validateAll, timeToMin };
