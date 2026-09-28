const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

function musicSource() {
  const source = fs.readFileSync("script.js", "utf8");
  const start = source.indexOf("  (function initMusic() {");
  const end = source.indexOf("\n  /* ============ 9. RSVP", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

function makeButton() {
  const classes = new Set();
  const listeners = {};
  return {
    hidden: true,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) { return classes.has(name); },
    },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, fn) { listeners[name] = fn; },
    listeners,
  };
}

function runMusic(playResults) {
  const button = makeButton();
  const windowListeners = {};
  let playCalls = 0;
  const audio = {
    paused: true,
    volume: 1,
    addEventListener() {},
    load() {},
    play() {
      const next = playResults[playCalls++];
      const result = typeof next === "function" ? next() : next;
      return Promise.resolve(result).then(() => { audio.paused = false; });
    },
    pause() { audio.paused = true; },
  };

  const context = {
    cfg: { music: { enabled: true, src: "theme.mp3", autoplay: true } },
    $: () => button,
    Audio: function () { return audio; },
    uiStr: (_key, fallback) => fallback,
    musicApplyAria: null,
    document: { hidden: false, addEventListener() {} },
    window: {
      addEventListener(name, fn) { windowListeners[name] = fn; },
      removeEventListener(name, fn) {
        if (windowListeners[name] === fn) delete windowListeners[name];
      },
    },
    clearInterval() {},
    setInterval(fn) {
      for (let i = 0; i < 20; i += 1) fn();
      return 1;
    },
  };

  vm.runInNewContext(musicSource(), context);
  return { audio, button, getPlayCalls: () => playCalls, windowListeners };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("autoplay starts on load and the control reflects successful playback", async () => {
  const player = runMusic([Promise.resolve()]);
  await flushPromises();

  assert.equal(player.getPlayCalls(), 1);
  assert.equal(player.audio.paused, false);
  assert.equal(player.button.classList.contains("is-playing"), true);
  assert.equal(player.button["aria-pressed"], "true");
});

test("blocked autoplay keeps the control stopped and retries on a gesture", async () => {
  const player = runMusic([
    () => Promise.reject(new Error("autoplay blocked")),
    () => Promise.resolve(),
  ]);
  await flushPromises();

  assert.equal(player.getPlayCalls(), 1);
  assert.equal(player.button.classList.contains("is-playing"), false);
  assert.equal(player.button["aria-pressed"], "false");

  player.windowListeners.pointerdown({ target: {} });
  await flushPromises();

  assert.equal(player.getPlayCalls(), 2);
  assert.equal(player.button.classList.contains("is-playing"), true);
});
