// Pure logic for the eye/letter training item types (SPEC.md §5.4–§5.8):
// path geometry, the red-moment scheduler and the scorers. No DOM, no session
// state — so it can be unit-tested on its own. app.js holds the renderers.
//
//   NMPPGames.buildPath(name)            -> sampled path {pts, cum, total, d, closed, W, H}
//   NMPPGames.positionAt(path, dist)     -> [x, y] at arc-length `dist`
//   NMPPGames.project(path, x, y)        -> { idx, dev } nearest sample + distance (path units)
//   NMPPGames.pickChangeTimes(n, dur)    -> n sorted onset times (s), >= 3 s apart
//   NMPPGames.scoreEyeTrack(on, taps)    -> { hits, misses, false_taps, rt_ms }
//   NMPPGames.huntOutcome(...) / flashOutcome(...) / traceStats(...)
(function (global) {
  "use strict";

  var W = 600;
  var H = 300;
  var SAMPLES = 720; // divisible by 6 so the zigzag vertices are exact samples

  // Each fn maps u in [0,1] to a point in the 600x300 viewBox.
  var DEFS = {
    // lemniscate of Bernoulli, starting at the centre and heading right
    infinity: {
      closed: true,
      fn: function (u) {
        var t = u * 2 * Math.PI;
        var d = 1 + Math.cos(t) * Math.cos(t);
        return [W / 2 + (265 * Math.sin(t)) / d, H / 2 + (265 * Math.sin(t) * Math.cos(t)) / d];
      },
    },
    // two full periods, left -> right
    wave: {
      closed: false,
      fn: function (u) {
        return [30 + 540 * u, H / 2 + 80 * Math.sin(2 * Math.PI * 2 * u)];
      },
    },
    // six straight segments, left -> right
    zigzag: {
      closed: false,
      fn: function (u) {
        var seg = Math.min(5, Math.floor(u * 6));
        var f = u * 6 - seg;
        var y0 = seg % 2 === 0 ? 230 : 70;
        var y1 = seg % 2 === 0 ? 70 : 230;
        return [30 + 540 * u, y0 + (y1 - y0) * f];
      },
    },
  };

  function buildPath(name) {
    var def = DEFS[name] || DEFS.wave; // unknown path name -> a safe default
    var pts = [];
    var cum = [0];
    var n = def.closed ? SAMPLES : SAMPLES + 1; // closed: last point == first, added below
    var i;
    for (i = 0; i < n; i++) pts.push(def.fn(def.closed ? i / SAMPLES : i / SAMPLES));
    if (def.closed) pts.push(pts[0]);
    for (i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0];
      var dy = pts[i][1] - pts[i - 1][1];
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    var d = "M" + pts.map(function (p) { return p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" L");
    return { name: DEFS[name] ? name : "wave", closed: def.closed, pts: pts, cum: cum, total: cum[cum.length - 1], d: d, W: W, H: H };
  }

  function positionAt(path, dist) {
    var total = path.total;
    var s = ((dist % total) + total) % total;
    var lo = 0;
    var hi = path.cum.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (path.cum[mid] <= s) lo = mid;
      else hi = mid;
    }
    var seg = path.cum[hi] - path.cum[lo] || 1;
    var f = (s - path.cum[lo]) / seg;
    return [path.pts[lo][0] + (path.pts[hi][0] - path.pts[lo][0]) * f, path.pts[lo][1] + (path.pts[hi][1] - path.pts[lo][1]) * f];
  }

  // Nearest sampled point; `dev` is the distance in path (viewBox) units.
  function project(path, x, y) {
    var best = Infinity;
    var idx = 0;
    for (var i = 0; i < path.pts.length; i++) {
      var dx = path.pts[i][0] - x;
      var dy = path.pts[i][1] - y;
      var dd = dx * dx + dy * dy;
      if (dd < best) {
        best = dd;
        idx = i;
      }
    }
    return { idx: idx, dev: Math.sqrt(best) };
  }

  // n onset times (seconds) inside [lead, durationS - redS - tail], each at
  // least minGap apart. Rejection sampling; falls back to an even spread with
  // jitter if the window is too tight for random placement.
  function pickChangeTimes(n, durationS, opts, rng) {
    opts = opts || {};
    rng = rng || Math.random;
    var minGap = opts.minGap || 3;
    var redS = opts.redS || 1.2;
    var lead = opts.lead === undefined ? 3 : opts.lead;
    var tail = opts.tail === undefined ? 1 : opts.tail;
    var lo = lead;
    var hi = Math.max(lo, durationS - redS - tail);
    var tries, i;
    for (tries = 0; tries < 400; tries++) {
      var t = [];
      for (i = 0; i < n; i++) t.push(lo + rng() * (hi - lo));
      t.sort(function (a, b) { return a - b; });
      var ok = true;
      for (i = 1; i < n; i++) if (t[i] - t[i - 1] < minGap) { ok = false; break; }
      if (ok) return t;
    }
    var step = n > 1 ? (hi - lo) / (n - 1) : 0;
    var out = [];
    for (i = 0; i < n; i++) {
      var jitter = (rng() - 0.5) * Math.max(0, step - minGap) * 0.5;
      out.push(Math.min(hi, Math.max(lo, lo + i * step + jitter)));
    }
    return out;
  }

  // onsets/taps in ms since the start. A tap counts for an onset if it lands
  // while the dot is red (redMs) or within `graceMs` after it (reaction time).
  // Each tap is used at most once; leftover taps are false taps.
  function scoreEyeTrack(onsetsMs, tapsMs, redMs, graceMs) {
    redMs = redMs === undefined ? 1200 : redMs;
    graceMs = graceMs === undefined ? 350 : graceMs;
    var used = {};
    var rt = [];
    onsetsMs.forEach(function (on) {
      for (var i = 0; i < tapsMs.length; i++) {
        if (used[i]) continue;
        if (tapsMs[i] >= on && tapsMs[i] <= on + redMs + graceMs) {
          used[i] = true;
          rt.push(Math.round(tapsMs[i] - on));
          return;
        }
      }
    });
    var hits = rt.length;
    return { hits: hits, misses: onsetsMs.length - hits, false_taps: tapsMs.length - hits, rt_ms: rt };
  }

  // letter_hunt: correct = every target found (== the item's count) with at
  // most one false tap.
  function huntOutcome(found, totalTargets, falseTaps, expectedCount, ms) {
    var count = typeof expectedCount === "number" ? expectedCount : totalTargets;
    return {
      answer: { found: found, missed: Math.max(0, totalTargets - found), false_taps: falseTaps, ms: ms },
      correct: found === count && falseTaps <= 1,
    };
  }

  // letter_flash: correct = accuracy >= 0.9
  function flashOutcome(trials) {
    var right = trials.filter(function (t) { return t.picked === t.shown; }).length;
    var accuracy = trials.length ? right / trials.length : 0;
    return { answer: { trials: trials, accuracy: Math.round(accuracy * 1000) / 1000 }, correct: accuracy >= 0.9, right: right };
  }

  // trace: deviations in screen px (already scaled by the caller)
  function traceStats(devPx, ms, lifted, lapsDone) {
    var n = devPx.length;
    var sum = 0;
    var max = 0;
    for (var i = 0; i < n; i++) {
      sum += devPx[i];
      if (devPx[i] > max) max = devPx[i];
    }
    return {
      mean_deviation_px: n ? Math.round((sum / n) * 10) / 10 : 0,
      max_deviation_px: Math.round(max * 10) / 10,
      ms: ms,
      lifted_count: lifted,
      laps_done: lapsDone,
    };
  }

  // Flush saved sessions that are not among `currentIds` to `results` as
  // interrupted, via the caller's `insert(taskSetId, data)` (resolves to
  // { error } like supabase-js). The local copy is deleted only after the
  // insert succeeded; on failure it stays and is retried on the next load.
  // Unparsable copies are dropped. Storage is any localStorage-like object.
  async function flushAbandoned(storage, prefix, currentIds, insert) {
    var keys = [];
    for (var i = 0; i < storage.length; i++) {
      var k = storage.key(i);
      if (k && k.indexOf(prefix) === 0) keys.push(k);
    }
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      var taskSetId = key.slice(prefix.length);
      if (currentIds.has(taskSetId)) continue;
      var data;
      try {
        data = JSON.parse(storage.getItem(key));
      } catch (e) {
        storage.removeItem(key);
        continue;
      }
      if (data && data.answers && data.answers.length > 0) {
        var ok = false;
        try {
          var res = await insert(taskSetId, data);
          ok = !(res && res.error);
        } catch (e) {
          ok = false;
        }
        if (!ok) continue; // keep the local copy
      }
      storage.removeItem(key);
    }
  }

  global.NMPPGames = {
    flushAbandoned: flushAbandoned,
    W: W, H: H,
    buildPath: buildPath, positionAt: positionAt, project: project,
    pickChangeTimes: pickChangeTimes, scoreEyeTrack: scoreEyeTrack,
    huntOutcome: huntOutcome, flashOutcome: flashOutcome, traceStats: traceStats,
  };
})(window);
