const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync("script.js", "utf8");

// The countdown is section 7 of script.js, between the comment banners.
function countdownSource() {
  const start = source.indexOf("  /* ============ 7. Countdown");
  const end = source.indexOf("\n  /* ============ 8. Background music", start);
  assert.notEqual(start, -1, "missing countdown section");
  assert.notEqual(end, -1, "missing music section after countdown");
  return source.slice(start, end);
}

// Initial hidden state mirrors index.html.
const SELECTORS = {
  ".countdown__grid": false,
  '[data-i18n="countdownTitle"]': false,
  "[data-countdown-note]": false,
  '[data-i18n="saveEyebrow"]': false,
  "#cdToday": true,
  "#cdDays": false,
  "#cdHours": false,
  "#cdMinutes": false,
  "#cdSeconds": false,
};

function makeElement(hidden) {
  const classes = new Set();
  return {
    hidden,
    textContent: "",
    offsetWidth: 0,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    },
  };
}

// Runs the real countdown code against a fake clock. `tz` is the guest's
// timezone (process.env.TZ), not the venue's.
function runCountdown({ now, weddingDateTime, calTz, tz }) {
  const clock = { ms: Date.parse(now) };
  const els = {};
  for (const [selector, hidden] of Object.entries(SELECTORS)) {
    els[selector] = makeElement(hidden);
  }

  let tick = null;
  const previousTz = process.env.TZ;
  if (tz) process.env.TZ = tz;

  class FakeDate extends Date {
    static now() { return clock.ms; }
  }

  const context = {
    cfg: {
      weddingDateTime,
      events: [{ calTz }],
    },
    D: { countdownToday: "TODAY", countdownMarried: "MARRIED" },
    locNum: (value) => value,
    $: (selector) => els[selector] || null,
    Date: FakeDate,
    setInterval(fn) { tick = fn; return 1; },
  };

  vm.runInNewContext(countdownSource(), context);
  assert.equal(typeof tick, "function", "countdown should register a tick interval");

  return {
    els,
    state: () => context.cdState,
    weddingDay: context.weddingDay,
    target: context.target,
    advance(ms) {
      clock.ms += ms;
      tick();
    },
    restore() {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    },
  };
}

const DHaka = "Asia/Dhaka";
const wedding = {
  weddingDateTime: "2027-02-12T18:00:00+06:00",
  calTz: DHaka,
};

function assertCountdown(cd, expected) {
  assert.equal(cd.els["#cdDays"].textContent, expected.days);
  assert.equal(cd.els["#cdHours"].textContent, expected.hours);
  assert.equal(cd.els["#cdMinutes"].textContent, expected.minutes);
  assert.equal(cd.els["#cdSeconds"].textContent, expected.seconds);
  assert.equal(cd.els[".countdown__grid"].hidden, false);
  assert.equal(cd.els["#cdToday"].hidden, true);
  assert.equal(cd.state(), null);
}

function assertToday(cd) {
  assert.equal(cd.state(), "countdownToday");
  assert.equal(cd.els["#cdToday"].textContent, "TODAY");
  assert.equal(cd.els["#cdToday"].hidden, false);
  assert.equal(cd.els[".countdown__grid"].hidden, true);
  assert.equal(cd.els['[data-i18n="countdownTitle"]'].hidden, true);
  assert.equal(cd.els["[data-countdown-note]"].hidden, true);
  assert.equal(cd.els['[data-i18n="saveEyebrow"]'].hidden, true);
}

function assertMarried(cd) {
  assert.equal(cd.state(), "countdownMarried");
  assert.equal(cd.els["#cdToday"].textContent, "MARRIED");
  assert.equal(cd.els["#cdToday"].hidden, false);
  assert.equal(cd.els[".countdown__grid"].hidden, true);
}

test("counts down with days, hours, minutes and seconds before the wedding", () => {
  const cd = runCountdown({ ...wedding, now: "2027-02-11T17:59:59+06:00" });
  cd.restore();

  assertCountdown(cd, { days: "01", hours: "00", minutes: "00", seconds: "01" });
});

test("keeps counting down on the wedding morning until the ceremony starts", () => {
  const cd = runCountdown({ ...wedding, now: "2027-02-12T09:00:00+06:00" });
  cd.restore();

  assertCountdown(cd, { days: "00", hours: "09", minutes: "00", seconds: "00" });
});

test("shows Today at the ceremony instant and for the rest of the venue day", () => {
  const atCeremony = runCountdown({ ...wedding, now: "2027-02-12T18:00:00+06:00" });
  atCeremony.restore();
  assertToday(atCeremony);

  const lateEvening = runCountdown({ ...wedding, now: "2027-02-12T23:59:59+06:00" });
  lateEvening.restore();
  assertToday(lateEvening);
});

test("shows Married once the wedding day ends at venue midnight", () => {
  const cd = runCountdown({ ...wedding, now: "2027-02-13T00:00:00+06:00" });
  cd.restore();

  assert.equal(cd.weddingDay, "2027-02-12");
  assertMarried(cd);
});

test("the running interval flips Today to Married at venue midnight", () => {
  const cd = runCountdown({ ...wedding, now: "2027-02-12T23:59:59+06:00" });
  cd.restore();
  assertToday(cd);

  cd.advance(2000);
  assertMarried(cd);
});

test("a guest behind the venue is Married once the venue day ends, even if their local date is still the wedding day", (t) => {
  const cd = runCountdown({
    ...wedding,
    tz: "America/Los_Angeles",
    now: "2027-02-13T00:00:01+06:00",
  });
  t.after(cd.restore);

  // 2027-02-13T00:00+06:00 is still 11:00 on 12 Feb in Los Angeles.
  assert.equal(new Date("2027-02-13T00:00:01+06:00").getDate(), 12);
  assertMarried(cd);
});

test("a guest ahead of the venue still sees Today while the venue day lasts", (t) => {
  const cd = runCountdown({
    ...wedding,
    tz: "Pacific/Kiritimati",
    now: "2027-02-12T23:00:00+06:00",
  });
  t.after(cd.restore);

  // 23:00 in Dhaka is already 09:00 on 13 Feb in Kiritimati (UTC+14).
  assert.equal(new Date("2027-02-12T23:00:00+06:00").getDate(), 13);
  assertToday(cd);
  assert.equal(cd.weddingDay, "2027-02-12");
});

test("uses the venue timezone, not the guest timezone, for a +13 venue", (t) => {
  const nz = {
    weddingDateTime: "2027-02-12T18:00:00+13:00",
    calTz: "Pacific/Auckland",
  };
  const cd = runCountdown({ ...nz, tz: "UTC", now: "2027-02-12T23:59:59+13:00" });
  t.after(cd.restore);
  assertToday(cd);
  assert.equal(cd.weddingDay, "2027-02-12");

  cd.advance(2000);
  assertMarried(cd);
});

test("without a venue calTz the guest's own timezone defines the wedding day", (t) => {
  // 14 March 2027 is the US spring-forward DST change.
  const us = { weddingDateTime: "2027-03-14T18:00:00-04:00" };
  const cd = runCountdown({ ...us, tz: "America/New_York", now: "2027-03-14T18:00:01-04:00" });
  t.after(cd.restore);

  assertToday(cd);
  assert.equal(cd.weddingDay, "2027-03-14");

  cd.advance(Date.parse("2027-03-15T00:00:01-04:00") - Date.parse("2027-03-14T18:00:01-04:00"));
  assertMarried(cd);
});
