const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const css = fs.readFileSync("styles.css", "utf8");
const script = fs.readFileSync("script.js", "utf8");

function declarations(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(escaped + "\\s*\\{([^}]*)\\}"));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[1];
}

function zIndex(selector) {
  const match = declarations(selector).match(/z-index\s*:\s*(-?\d+)/);
  assert.ok(match, `Missing z-index for ${selector}`);
  return Number(match[1]);
}

test("an opened envelope layers the card above the flap and behind the pocket", () => {
  const card = zIndex(".intro__card");
  const pocket = zIndex(".intro__pocket");
  const openedFlap = zIndex(".intro.is-opening .intro__flap");

  assert.ok(openedFlap < card, "the opened flap should sit behind the card");
  assert.ok(card < pocket, "the pocket should conceal the lower part of the card");
});

test("the pocket has a V-shaped opening that exposes the card", () => {
  assert.match(
    declarations(".intro__pocket"),
    /clip-path\s*:\s*polygon\(0 0,\s*50% 52%,\s*100% 0,\s*100% 100%,\s*0 100%\)/,
  );
});

test("the flap reveals the card before moving behind it", () => {
  assert.match(
    declarations(".intro__flap"),
    /z-index\s+0s\s+linear\s+0\.75s/,
  );
});

test("the opened flap has its point facing upward", () => {
  assert.match(
    declarations(".intro__flap-face--back"),
    /clip-path\s*:\s*polygon\(0 100%,\s*100% 100%,\s*50% 0\)/,
  );
});

test("each envelope stage finishes before the next transition starts", () => {
  function stageDelay(className) {
    const pattern = new RegExp(
      `setTimeout\\(function \\(\\) \\{[^}]*classList\\.add\\("${className}"\\)[^}]*\\},\\s*(\\d+)\\)`,
    );
    const match = script.match(pattern);
    assert.ok(match, `Missing timeout for ${className}`);
    return Number(match[1]);
  }

  const lifting = stageDelay("is-lifting");
  const revealing = stageDelay("is-revealing");
  const done = stageDelay("is-done");

  assert.ok(lifting >= 1000, "the flap should finish opening before the card lifts");
  assert.ok(revealing - lifting >= 950, "the card should finish lifting before it zooms away");
  assert.ok(done - revealing >= 800, "the reveal should nearly finish before the backdrop fades");
});
