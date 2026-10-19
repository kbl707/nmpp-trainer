// Run: node --test tests/*.test.js
// games.js attaches NMPPGames to `window`; give it a stub and load it as-is.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "games.js"), "utf8"), sandbox);
const G = sandbox.window.NMPPGames;
const plain = (o) => JSON.parse(JSON.stringify(o)); // vm objects have a foreign prototype

test("scoreEyeTrack: sweep values", () => {
  assert.deepStrictEqual(plain(G.scoreEyeTrack([1000, 5000], [1200, 9000], 1200, 350)), {
    hits: 1, misses: 1, false_taps: 1, rt_ms: [200],
  });
});

test("scoreEyeTrack: empty inputs give zeros", () => {
  assert.deepStrictEqual(plain(G.scoreEyeTrack([], [])), { hits: 0, misses: 0, false_taps: 0, rt_ms: [] });
  assert.deepStrictEqual(plain(G.scoreEyeTrack([1000], [])), { hits: 0, misses: 1, false_taps: 0, rt_ms: [] });
  assert.deepStrictEqual(plain(G.scoreEyeTrack([], [500])), { hits: 0, misses: 0, false_taps: 1, rt_ms: [] });
});

test("scoreEyeTrack: grace window edge and tap used once", () => {
  assert.strictEqual(G.scoreEyeTrack([1000], [2550], 1200, 350).hits, 1); // on + red + grace
  assert.strictEqual(G.scoreEyeTrack([1000], [2551], 1200, 350).hits, 0);
  assert.strictEqual(G.scoreEyeTrack([1000], [999], 1200, 350).hits, 0); // before onset
  const r = G.scoreEyeTrack([1000, 1500], [1600], 1200, 350);
  assert.strictEqual(r.hits, 1);
  assert.strictEqual(r.misses, 1);
});

test("huntOutcome", () => {
  assert.strictEqual(G.huntOutcome(5, 5, 0, 5, 1000).correct, true);
  assert.strictEqual(G.huntOutcome(5, 5, 1, 5, 1000).correct, true);
  assert.strictEqual(G.huntOutcome(5, 5, 2, 5, 1000).correct, false);
  assert.strictEqual(G.huntOutcome(4, 5, 0, 5, 1000).correct, false);
  assert.strictEqual(G.huntOutcome(4, 5, 0, 5, 1000).answer.missed, 1);
  assert.strictEqual(G.huntOutcome(5, 5, 0, undefined, 1000).correct, true); // count defaults to total
});

test("flashOutcome", () => {
  const t = (n, ok) => Array.from({ length: n }, (_, i) => ({ shown: "a", picked: i < ok ? "a" : "b" }));
  assert.strictEqual(G.flashOutcome(t(10, 9)).correct, true);
  assert.strictEqual(G.flashOutcome(t(10, 8)).correct, false);
  assert.strictEqual(G.flashOutcome(t(10, 9)).answer.accuracy, 0.9);
  const empty = G.flashOutcome([]);
  assert.strictEqual(empty.correct, false);
  assert.strictEqual(empty.answer.accuracy, 0);
});

test("traceStats", () => {
  assert.deepStrictEqual(plain(G.traceStats([], 500, 0, 0)), {
    mean_deviation_px: 0, max_deviation_px: 0, ms: 500, lifted_count: 0, laps_done: 0,
  });
  const s = G.traceStats([2, 4, 9], 1200, 1, 2);
  assert.strictEqual(s.mean_deviation_px, 5);
  assert.strictEqual(s.max_deviation_px, 9);
  assert.strictEqual(s.lifted_count, 1);
  assert.strictEqual(s.laps_done, 2);
});

test("pickChangeTimes: n sorted onsets at least 3 s apart", () => {
  const t = G.pickChangeTimes(3, 30);
  assert.strictEqual(t.length, 3);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 3);
});

function fakeStorage(init) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k),
  };
}

test("flushAbandoned: keeps the local copy when the insert fails, drops it on success", async () => {
  const saved = JSON.stringify({ answers: [{ correct: true }], lastElapsedMs: 5000 });
  for (const [label, insert, kept] of [
    ["error result", async () => ({ error: { message: "check violation" } }), true],
    ["thrown", async () => { throw new Error("offline"); }, true],
    ["success", async () => ({ error: null }), false],
  ]) {
    const st = fakeStorage({ "p:old": saved, "p:today": saved, "other": "x" });
    await G.flushAbandoned(st, "p:", new Set(["today"]), insert);
    assert.strictEqual(st.has("p:old"), kept, label);
    assert.ok(st.has("p:today") && st.has("other"), label + ": untouched keys");
  }
});

test("flushAbandoned: empty or unparsable copies are dropped without an insert", async () => {
  const st = fakeStorage({ "p:a": JSON.stringify({ answers: [] }), "p:b": "{bad" });
  let calls = 0;
  await G.flushAbandoned(st, "p:", new Set(), async () => { calls++; return {}; });
  assert.strictEqual(calls, 0);
  assert.ok(!st.has("p:a") && !st.has("p:b"));
});
