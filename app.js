(() => {
  "use strict";

  const CONFIG = window.NMPP_CONFIG;
  const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  // Which learner this page is for (SPEC.md §13) — set by an inline script
  // before app.js loads (lilija/index.html); "/" leaves it unset, defaulting
  // to Henris so index.html needs no change.
  const LEARNER = window.NMPP_LEARNER || "henris";
  const TTS_ENABLED = LEARNER === "lilija";
  // End-screen emoji: Henris is the alien, Lilija keeps the star.
  const AVATAR = LEARNER === "lilija" ? "⭐" : "👽";

  const screenEl = document.getElementById("screen");
  const topbarEl = document.getElementById("topbar");
  const progressFillEl = document.getElementById("progress-fill");
  const progressLabelEl = document.getElementById("progress-label");
  const timerEl = document.getElementById("timer");
  const starsBadgeEl = document.getElementById("stars-badge");
  const soundToggleEl = document.getElementById("sound-toggle");
  const praiseToastEl = document.getElementById("praise-toast");

  const PROGRESS_PREFIX = `nmpp:progress:${LEARNER}:`;
  const SUBJECT_LABELS = { matematika: "Matematika", lietuviu: "Lietuvių kalba", pratimai: "Pratimai" };
  const PRAISE_WORDS = ["Puiku!", "Taip!", "Šaunu!", "Tiksliai!"];
  const SOUND_KEY = `nmpp:sound-on:${LEARNER}`;
  const BADGES = {
    pirma_savaite: { emoji: "🌟", label: "Pirma savaitė" },
    daugybos_meistras: { emoji: "🧮", label: "Daugybos meistras" },
    be_klaidu: { emoji: "🎯", label: "Be klaidų" },
    savaites_ugnis: { emoji: "🔥", label: "Savaitės ugnis" },
  };

  let timerHandle = null;
  let praiseToastTimer = null;
  let soundOn = false;

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // ?date=YYYY-MM-DD opens a past day's set instead of today's (catch-up).
  // Anything that isn't a real calendar date is ignored.
  function requestedDate() {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(new URLSearchParams(location.search).get("date") || "");
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const real = d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
    return real ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }

  function fmtTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function el(html) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---- text-to-speech (SPEC.md §13.3, Lilija only) ------------------------
  // Lithuanian only. Resolved once at boot (see init()); every 🔊 button in
  // every renderer checks `ttsVoice` and simply isn't rendered if it's null.

  let ttsVoice = null;

  function pickLtVoice() {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => /^lt(-|_|$)/i.test(v.lang)) || null;
  }

  function initTTS() {
    if (!TTS_ENABLED || !window.speechSynthesis) return Promise.resolve(null);
    return new Promise((resolve) => {
      let v = pickLtVoice();
      if (v) return resolve(v);
      const handle = () => {
        v = pickLtVoice();
        if (v) {
          window.speechSynthesis.removeEventListener("voiceschanged", handle);
          resolve(v);
        }
      };
      window.speechSynthesis.addEventListener("voiceschanged", handle);
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", handle);
        resolve(pickLtVoice());
      }, 1200);
    });
  }

  function speak(text) {
    if (!ttsVoice || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = ttsVoice;
    u.lang = "lt-LT";
    u.rate = 0.8;
    window.speechSynthesis.speak(u);
  }

  function speakButton(text, label) {
    const btn = el(`<button type="button" class="speak-btn" aria-label="${escapeHtml(label || "Ištarti")}">🔊</button>`);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      speak(text);
    });
    return btn;
  }

  // Appends a 🔊 next to a rendered `.prompt` element (choice/word_gap, and
  // comprehension questions after a read_aloud) — no-op with no LT voice.
  function attachSpeakToPrompt(container, text, label) {
    if (!ttsVoice) return;
    const prompt = container.querySelector(".prompt");
    if (!prompt) return;
    prompt.classList.add("prompt-with-speak");
    prompt.appendChild(speakButton(text, label));
  }

  // ---- rewards (SPEC.md §7.1) --------------------------------------------

  function updateStarsBadge(total) {
    starsBadgeEl.textContent = `⭐ ${total}`;
    starsBadgeEl.hidden = false;
  }

  function showPraiseToast(stars) {
    const word = PRAISE_WORDS[Math.floor(Math.random() * PRAISE_WORDS.length)];
    praiseToastEl.textContent = `✅ ${word}`;
    praiseToastEl.hidden = false;
    praiseToastEl.classList.remove("show");
    // restart the CSS animation even if a toast is already mid-fade
    void praiseToastEl.offsetWidth;
    praiseToastEl.classList.add("show");
    if (praiseToastTimer) clearTimeout(praiseToastTimer);
    praiseToastTimer = setTimeout(() => {
      praiseToastEl.classList.remove("show");
      praiseToastEl.hidden = true;
    }, 800);
  }

  function loadSoundPref() {
    try {
      soundOn = localStorage.getItem(SOUND_KEY) === "1";
    } catch (e) {
      soundOn = false;
    }
    reflectSoundToggle();
  }

  function reflectSoundToggle() {
    soundToggleEl.textContent = soundOn ? "🔈" : "🔇";
    soundToggleEl.setAttribute("aria-pressed", String(soundOn));
    soundToggleEl.setAttribute("aria-label", soundOn ? "Garsas įjungtas" : "Garsas išjungtas");
  }

  // One shared AudioContext. Browsers only let it run if it is created or
  // resumed inside a user gesture, so every tap/keypress calls ensureAudio()
  // — later sounds (which fire after network awaits) then just play.
  let audioCtx = null;

  function ensureAudio() {
    if (!soundOn) return null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  ["pointerdown", "keydown", "touchend"].forEach((ev) =>
    document.addEventListener(ev, () => ensureAudio(), { passive: true })
  );

  function tone(ctx, freq, start, dur, peak) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  // Softer single tick for each correct answer.
  function playTick() {
    const ctx = ensureAudio();
    if (!ctx) return;
    tone(ctx, 1046.5, ctx.currentTime + 0.005, 0.07, 0.05);
  }

  // Set completion: two ascending notes (C5 → G5), ~400ms in total.
  function playChime() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    tone(ctx, 523.25, t, 0.24, 0.16);
    tone(ctx, 783.99, t + 0.16, 0.24, 0.16);
  }

  soundToggleEl.addEventListener("click", () => {
    soundOn = !soundOn;
    try {
      localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
    } catch (e) {}
    reflectSoundToggle();
    // Created inside this click, so it is allowed to run; the tick confirms
    // to the child that sound is now on.
    if (soundOn) playTick();
  });

  function renderConfetti(container) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const burst = el(`<div class="confetti" aria-hidden="true"></div>`);
    for (let i = 0; i < 16; i++) {
      burst.appendChild(el(`<span class="confetti-piece"></span>`));
    }
    container.appendChild(burst);
    setTimeout(() => burst.remove(), 1500);
  }

  // ---- weekly stats card (SPEC.md §7.2) ------------------------------------

  const DOW_NAMES = ["pirmadienis", "antradienis", "trečiadienis", "ketvirtadienis", "penktadienis", "šeštadienis", "sekmadienis"];
  const DAY_LABELS = ["Pr", "An", "Tr", "Kt", "Pe", "Še"];
  const TYPE_NAMES = {
    quick_math: "Greita matematika",
    number_input: "Skaičių užduotys",
    choice: "Pasirinkimai",
    compare: "Palyginimai",
    match: "Poros",
    open_schema: "Uždaviniai",
    syllable_build: "Skiemenų dėliojimas",
    word_gap: "Žodžio spraga",
  };

  function isSaturday(dateStr) {
    const [y, m, d] = String(dateStr).split("-").map(Number);
    return new Date(y, m - 1, d).getDay() === 6;
  }

  // Lithuanian noun after a count (accusative, as after "Išsprendei …"):
  // 1 → one, 2–9 → few, 0 and 10–19 (and tens) → many.
  function ltCount(n, one, few, many) {
    const t = n % 100;
    const u = n % 10;
    if (t >= 11 && t <= 19) return many;
    if (u === 1) return one;
    if (u === 0) return many;
    return few;
  }

  function buildWeekChart(byDay) {
    const counts = [0, 0, 0, 0, 0, 0];
    (byDay || []).forEach((d) => {
      if (d.dow >= 1 && d.dow <= 6) counts[d.dow - 1] += d.total;
    });
    const max = Math.max(...counts, 1);
    const W = 300;
    const base = 112;
    const maxH = 80;
    const bw = 34;
    const gap = 14;
    const x0 = (W - (6 * bw + 5 * gap)) / 2;
    const bars = counts
      .map((n, i) => {
        const h = n ? Math.max(6, Math.round((n / max) * maxH)) : 3;
        const x = x0 + i * (bw + gap);
        const y = base - h;
        return (
          `<rect class="${n ? "chart-bar" : "chart-bar empty"}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="5"/>` +
          (n ? `<text class="chart-count" x="${x + bw / 2}" y="${y - 7}" text-anchor="middle">${n}</text>` : "") +
          `<text class="chart-day" x="${x + bw / 2}" y="${base + 24}" text-anchor="middle">${DAY_LABELS[i]}</text>`
        );
      })
      .join("");
    const label = "Užduotys per dieną: " + DAY_LABELS.map((d, i) => `${d} ${counts[i]}`).join(", ");
    return `<svg class="week-chart" viewBox="0 0 ${W} 146" role="img" aria-label="${label}">${bars}</svg>`;
  }

  // Aggregates only — weekly_stats() never returns raw answers.
  function buildWeekCard(s) {
    if (!s || !s.total_items) return null;
    const facts = [];
    facts.push(`Išsprendei <b>${s.total_items}</b> ${ltCount(s.total_items, "užduotį", "užduotis", "užduočių")}`);
    if (s.accuracy_pct !== null && s.accuracy_pct !== undefined) {
      facts.push(`Teisingai — <b>${s.accuracy_pct} %</b>`);
    }
    if (s.fastest_day && s.best_day && s.fastest_day.dow === s.best_day.dow) {
      facts.push(`Greičiausia ir tiksliausia diena — <b>${DOW_NAMES[s.best_day.dow - 1]}</b>`);
    } else {
      if (s.fastest_day) facts.push(`Greičiausia diena — <b>${DOW_NAMES[s.fastest_day.dow - 1]}</b>`);
      if (s.best_day) facts.push(`Tiksliausia diena — <b>${DOW_NAMES[s.best_day.dow - 1]}</b>`);
    }
    if (s.avg_seconds_per_item !== null && s.avg_seconds_per_item !== undefined) {
      facts.push(`Vienai užduočiai skyrei vidutiniškai <b>${Math.round(s.avg_seconds_per_item)} s</b>`);
    }
    facts.push(`Savaitės žvaigždutės — <b>⭐ ${s.stars_earned || 0}</b>`);

    const types = (s.by_type || [])
      .map(
        (t) =>
          `<li><span>${escapeHtml(TYPE_NAMES[t.type] || t.type)}</span><b>${t.accuracy_pct} %</b></li>`
      )
      .join("");

    return el(`
      <section class="week-card" aria-labelledby="week-title">
        <h2 id="week-title" class="week-title">Tavo savaitė</h2>
        <ul class="week-facts">${facts.map((f) => `<li>${f}</li>`).join("")}</ul>
        <p class="week-sub">Užduotys per dieną</p>
        ${buildWeekChart(s.by_day)}
        ${types ? `<p class="week-sub">Kaip sekėsi pagal tipą</p><ul class="week-types">${types}</ul>` : ""}
      </section>
    `);
  }

  // ---- localStorage progress -------------------------------------------

  function progressKey(taskSetId) {
    return PROGRESS_PREFIX + taskSetId;
  }

  function saveProgress(taskSetId, data) {
    try {
      localStorage.setItem(progressKey(taskSetId), JSON.stringify(data));
    } catch (e) {
      /* storage unavailable — session just won't survive a reload */
    }
  }

  function loadProgress(taskSetId) {
    try {
      const raw = localStorage.getItem(progressKey(taskSetId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearProgress(taskSetId) {
    try {
      localStorage.removeItem(progressKey(taskSetId));
    } catch (e) {}
  }

  function allProgressKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PROGRESS_PREFIX)) keys.push(k);
    }
    return keys;
  }

  // Any saved session that isn't one of today's candidate task_sets was
  // necessarily abandoned (a new day started before it was finished).
  // Flush it to `results` as interrupted, then drop it locally.
  async function flushAbandonedSessions(currentIds) {
    for (const key of allProgressKeys()) {
      const taskSetId = key.slice(PROGRESS_PREFIX.length);
      if (currentIds.has(taskSetId)) continue;
      let data;
      try {
        data = JSON.parse(localStorage.getItem(key));
      } catch (e) {
        localStorage.removeItem(key);
        continue;
      }
      if (data && data.answers && data.answers.length > 0) {
        const correct_count = data.answers.filter((a) => a.correct === true).length;
        const total_autochecked = data.answers.filter((a) => a.correct !== null).length;
        const duration_seconds = Math.round((data.lastElapsedMs || 0) / 1000);
        try {
          await client.from("results").insert({
            task_set_id: taskSetId,
            answers: data.answers,
            correct_count,
            total_autochecked,
            duration_seconds,
            interrupted: true,
            learner: LEARNER,
          });
        } catch (e) {
          /* best effort — if this fails we still clear so we don't loop forever */
        }
      }
      localStorage.removeItem(key);
    }
  }

  // ---- app state ----------------------------------------------------------

  let session = null; // { taskSet, index, answers, sessionStartMs, itemStartMs, attempts }

  function updateTopbar() {
    if (!session) {
      topbarEl.hidden = true;
      return;
    }
    topbarEl.hidden = false;
    const total = session.taskSet.items.length;
    const current = Math.min(session.index + 1, total);
    progressLabelEl.textContent = `${current} / ${total}`;
    progressFillEl.style.width = `${(session.index / total) * 100}%`;
  }

  function startTimer() {
    stopTimer();
    timerHandle = setInterval(() => {
      if (!session) return;
      const elapsed = Date.now() - session.sessionStartMs;
      timerEl.textContent = fmtTime(elapsed / 1000);
    }, 1000);
  }

  function stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  function persistSession() {
    saveProgress(session.taskSet.id, {
      index: session.index,
      answers: session.answers,
      sessionStartMs: session.sessionStartMs,
      lastElapsedMs: Date.now() - session.sessionStartMs,
    });
  }

  // ---- rendering ------------------------------------------------------

  function renderHintBlock(item) {
    if (!item.hint) return "";
    return `
      <button type="button" class="hint-btn" data-action="hint">Užuomina</button>
      <p class="hint-text" hidden></p>
    `;
  }

  function wireHint(container, item) {
    const btn = container.querySelector('[data-action="hint"]');
    if (!btn) return;
    const textEl = container.querySelector(".hint-text");
    btn.addEventListener("click", () => {
      textEl.textContent = item.hint;
      textEl.hidden = false;
      btn.hidden = true;
    });
  }

  function finalizeItem(item, answerValue, correct, extra) {
    const seconds = Math.round((Date.now() - session.itemStartMs) / 1000);
    const stars = correct ? (session.attempt <= 1 ? 2 : 1) : 0;
    const entry = { item_id: item.id, answer: answerValue, correct: correct, seconds, stars };
    if (extra) Object.assign(entry, extra);
    session.answers.push(entry);
    persistSession();
    if (stars > 0) showPraiseToast(stars);
    if (correct === true) playTick();
  }

  // One "Toliau" press per attempt. Correct → record and advance at once.
  // Wrong on the first press → stay, nudge, keep the answer editable; the
  // second press is final (recorded correct or not) and advances.
  function submitAttempt(item, retryMsg, evaluate) {
    if (!session || session.submitting) return false;
    session.attempt += 1;
    const { answer, correct } = evaluate();
    if (correct || session.attempt >= 2) {
      finalizeItem(item, answer, correct);
      nextItem();
      return true;
    }
    retryMsg.textContent = "Pabandyk dar kartą";
    retryMsg.hidden = false;
    return false;
  }

  // ---- anti-guessing retry flow (SPEC.md §7.3) -----------------------------
  // quick_math, number_input, choice, compare, match only. Up to 4 attempts;
  // correct → advance immediately. Wrong with attempts left → caller clears
  // its own UI and (for the three locked types) re-applies the think-lock.
  // Wrong on the 4th → recorded incorrect and reported "exhausted" so the
  // caller can reveal the answer + hint instead of advancing.

  const MAX_ATTEMPTS = 4;
  const THINK_LOCK_MS = 6000;
  const RUSHED_THRESHOLD_MS = 4000;
  // Same mechanic for both learners, different wording: on Henris's page
  // this flow only ever fires for math-context items; on Lilija's page the
  // only reachable type is `choice` (reading comprehension), where
  // "calculate in your notebook" doesn't fit.
  const SCORED_RETRY_MSG =
    LEARNER === "lilija" ? "Dar kartą. Paskaityk tekstą." : "Dar kartą. Skaičiuok sąsiuvinyje.";

  function submitScoredAttempt(item, retryMsg, evaluate) {
    if (!session || session.submitting) return "retry";
    const now = Date.now();
    session.attempt += 1;
    const { answer, correct } = evaluate();
    if (session.attempt === 1) {
      session.firstAnswer = answer;
      session.firstRushed = !correct && now - session.itemStartMs < RUSHED_THRESHOLD_MS;
    }
    const extra = {
      attempts: session.attempt,
      first_answer: session.firstAnswer,
      ...(session.firstRushed ? { rushed: true } : {}),
    };
    if (correct) {
      finalizeItem(item, answer, true, extra);
      nextItem();
      return "correct";
    }
    if (session.attempt >= MAX_ATTEMPTS) {
      finalizeItem(item, answer, false, extra);
      return "exhausted";
    }
    retryMsg.textContent = SCORED_RETRY_MSG;
    retryMsg.hidden = false;
    return "retry";
  }

  // (Re)starts the 6s think-lock: the fill animates via a CSS transition
  // (no countdown numbers), `onUnlock` fires once, after which the caller
  // decides whether the button can actually enable (e.g. is there still a
  // typed value / selection).
  function startThinkLock(fillEl, onUnlock, durationMs = THINK_LOCK_MS) {
    fillEl.style.transition = "none";
    fillEl.style.width = "0%";
    void fillEl.offsetWidth; // force reflow so the reset above isn't animated
    requestAnimationFrame(() => {
      fillEl.style.transition = `width ${durationMs}ms linear`;
      fillEl.style.width = "100%";
    });
    setTimeout(onUnlock, durationMs);
  }

  function revealBlock(answerHtml, hint) {
    return `
      <div class="reveal">
        <p class="reveal-answer">Teisingas atsakymas: <b>${answerHtml}</b></p>
        ${hint ? `<p class="reveal-hint">${escapeHtml(hint)}</p>` : ""}
      </div>
    `;
  }

  // The reveal block already shows `hint` as the explanation — hide the
  // now-redundant on-demand "Užuomina" toggle (and its text, if already open).
  function hideHintOnReveal(container) {
    const btn = container.querySelector('[data-action="hint"]');
    if (btn) btn.hidden = true;
    const text = container.querySelector(".hint-text");
    if (text) text.hidden = true;
  }

  // Enter = the item's primary button, unless focus is already on a
  // button/link (native Enter clicks it) or in an input (which handles
  // Enter itself so an empty field can show its own nudge).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.repeat) return;
    const tag = e.target && e.target.tagName;
    if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "TEXTAREA") return;
    const primary = screenEl.querySelector("[data-primary]:not([disabled])");
    if (primary) {
      e.preventDefault();
      primary.click();
    }
  });

  function nextItem() {
    session.index += 1;
    if (session.index >= session.taskSet.items.length) {
      submitSession();
    } else {
      persistSession();
      renderCurrentItem();
    }
  }

  function renderCurrentItem() {
    session.itemStartMs = Date.now();
    session.attempt = 0;
    session.firstAnswer = undefined;
    session.firstRushed = false;
    updateTopbar();
    const item = session.taskSet.items[session.index];
    const type = item.type || "open_schema";
    const renderer = RENDERERS[type] || RENDERERS.open_schema;
    screenEl.innerHTML = "";
    const card = el(`<div class="card"></div>`);
    screenEl.appendChild(card);

    let target = card;
    if (item.passage_ref) {
      const passage = findPassage(item.passage_ref);
      if (passage) {
        card.appendChild(buildPassagePanel(passage));
        target = el(`<div class="question-wrap"></div>`);
        card.appendChild(target);
      }
    }
    renderer(target, item);
  }

  // Only looks at items already shown before this one — a passage is meant
  // to precede the questions that reference it. A `read_aloud` item (§13.4)
  // is also a valid passage_ref target, for comprehension questions after it.
  function findPassage(refId) {
    for (let i = session.index - 1; i >= 0; i--) {
      const candidate = session.taskSet.items[i];
      if ((candidate.type === "passage" || candidate.type === "read_aloud") && candidate.id === refId) return candidate;
    }
    return null;
  }

  function paragraphsHtml(text) {
    return String(text || "")
      .split(/\n\n+/)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join("");
  }

  function buildPassagePanel(passage) {
    const isMobile = window.matchMedia("(max-width: 559px)").matches;
    let expanded = !isMobile;
    const panel = el(`
      <section class="passage-panel" role="region" aria-label="Tekstas">
        <div class="passage-panel-header">
          <h2 class="passage-title">${escapeHtml(passage.data.title || "")}</h2>
          <button type="button" class="passage-toggle" aria-expanded="${expanded}">${
      expanded ? "Suslėpti tekstą" : "Rodyti tekstą"
    }</button>
        </div>
        <div class="passage-body">${paragraphsHtml(passage.data.text)}</div>
      </section>
    `);
    const body = panel.querySelector(".passage-body");
    const toggle = panel.querySelector(".passage-toggle");
    body.hidden = !expanded;
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      body.hidden = !expanded;
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.textContent = expanded ? "Suslėpti tekstą" : "Rodyti tekstą";
    });
    return panel;
  }

  const RENDERERS = {
    quick_math(container, item) {
      renderNumericItem(container, item, item.data.expr || item.prompt);
    },

    number_input(container, item) {
      renderNumericItem(container, item, item.prompt || item.data.text);
    },

    choice(container, item) {
      container.innerHTML = `
        <p class="prompt">${escapeHtml(item.prompt)}</p>
        <div class="choice-list"></div>
        <button type="button" class="btn" data-primary disabled>Toliau</button>
        <p class="retry-msg" hidden></p>
        ${renderHintBlock(item)}
      `;
      attachSpeakToPrompt(container, item.prompt, "Ištarti klausimą");
      const list = container.querySelector(".choice-list");
      const nextBtn = container.querySelector("[data-primary]");
      const retryMsg = container.querySelector(".retry-msg");
      let selected = null;
      let revealed = false;
      (item.data.options || []).forEach((opt, idx) => {
        const btn = el(`<button type="button" class="option-btn" aria-pressed="false">${escapeHtml(opt)}</button>`);
        btn.addEventListener("click", () => {
          if (revealed) return;
          selected = idx;
          Array.from(list.children).forEach((b, i) => {
            b.classList.toggle("selected", i === idx);
            b.setAttribute("aria-pressed", String(i === idx));
          });
          nextBtn.disabled = false;
        });
        list.appendChild(btn);
      });
      wireHint(container, item);

      nextBtn.addEventListener("click", () => {
        if (revealed) {
          nextItem();
          return;
        }
        if (selected === null) return;
        const result = submitScoredAttempt(item, retryMsg, () => ({
          answer: { index: selected },
          correct: !!(item.answer && selected === item.answer.index),
        }));
        if (result === "exhausted") {
          revealed = true;
          hideHintOnReveal(container);
          retryMsg.hidden = true;
          Array.from(list.children).forEach((b) => (b.disabled = true));
          const correctText =
            item.data.options && item.answer ? item.data.options[item.answer.index] : "";
          container.insertAdjacentHTML("beforeend", revealBlock(escapeHtml(correctText), item.hint));
          nextBtn.disabled = false;
        } else if (result === "retry") {
          selected = null;
          nextBtn.disabled = true;
          Array.from(list.children).forEach((b) => {
            b.classList.remove("selected");
            b.setAttribute("aria-pressed", "false");
          });
        }
      });
    },

    compare(container, item) {
      container.innerHTML = `
        <p class="prompt">${item.data.left} &nbsp;&nbsp;?&nbsp;&nbsp; ${item.data.right}</p>
        <div class="compare-row"></div>
        <button type="button" class="btn" data-primary disabled>Toliau</button>
        <div class="think-lock" aria-hidden="true"><div class="think-lock-fill"></div></div>
        <p class="retry-msg" hidden></p>
        ${renderHintBlock(item)}
      `;
      const row = container.querySelector(".compare-row");
      const nextBtn = container.querySelector("[data-primary]");
      const retryMsg = container.querySelector(".retry-msg");
      const lockBar = container.querySelector(".think-lock");
      const lockFill = container.querySelector(".think-lock-fill");
      let selected = null;
      let locked = true;
      let revealed = false;

      function reapplyLock() {
        locked = true;
        nextBtn.disabled = true;
        startThinkLock(lockFill, () => {
          locked = false;
          nextBtn.disabled = selected === null;
        });
      }

      ["<", ">", "="].forEach((sign) => {
        const btn = el(
          `<button type="button" class="option-btn compare-btn" aria-pressed="false" aria-label="${
            sign === "<" ? "mažiau" : sign === ">" ? "daugiau" : "lygu"
          }">${sign}</button>`
        );
        btn.addEventListener("click", () => {
          if (revealed) return;
          selected = sign;
          Array.from(row.children).forEach((b) => {
            const on = b === btn;
            b.classList.toggle("selected", on);
            b.setAttribute("aria-pressed", String(on));
          });
          if (!locked) nextBtn.disabled = false;
        });
        row.appendChild(btn);
      });
      wireHint(container, item);
      reapplyLock();

      nextBtn.addEventListener("click", () => {
        if (revealed) {
          nextItem();
          return;
        }
        if (locked || selected === null) return;
        const result = submitScoredAttempt(item, retryMsg, () => ({
          answer: { sign: selected },
          correct: !!(item.answer && selected === item.answer.sign),
        }));
        if (result === "exhausted") {
          revealed = true;
          hideHintOnReveal(container);
          lockBar.hidden = true;
          retryMsg.hidden = true;
          Array.from(row.children).forEach((b) => (b.disabled = true));
          container.insertAdjacentHTML(
            "beforeend",
            revealBlock(`${item.data.left} ${item.answer.sign} ${item.data.right}`, item.hint)
          );
          nextBtn.disabled = false;
        } else if (result === "retry") {
          selected = null;
          Array.from(row.children).forEach((b) => {
            b.classList.remove("selected");
            b.setAttribute("aria-pressed", "false");
          });
          reapplyLock();
        }
      });
    },

    match(container, item) {
      const left = item.data.left || [];
      const right = item.data.right || [];
      container.innerHTML = `
        <p class="prompt">${escapeHtml(item.prompt || "Sujunk poras")}</p>
        <div class="match-cols">
          <div class="match-col" data-side="left"></div>
          <div class="match-col" data-side="right"></div>
        </div>
        <div class="paired-section" hidden>
          <p class="paired-title">Sujungta</p>
          <div class="paired-list"></div>
        </div>
        <button type="button" class="btn" data-primary disabled>Toliau</button>
        <p class="retry-msg" hidden></p>
        ${renderHintBlock(item)}
      `;
      const leftCol = container.querySelector('[data-side="left"]');
      const rightCol = container.querySelector('[data-side="right"]');
      const pairedSection = container.querySelector(".paired-section");
      const pairedList = container.querySelector(".paired-list");
      const checkBtn = container.querySelector("[data-primary]");
      const retryMsg = container.querySelector(".retry-msg");
      wireHint(container, item);

      let pairs = []; // [[leftIdx, rightIdx], ...] in the order they were made
      let pendingLeft = null;
      let revealed = false;

      function render() {
        const pairedLeft = new Set(pairs.map((p) => p[0]));
        const pairedRight = new Set(pairs.map((p) => p[1]));

        leftCol.innerHTML = "";
        left.forEach((text, idx) => {
          if (pairedLeft.has(idx)) return;
          const b = el(`<button type="button" class="match-item">${escapeHtml(text)}</button>`);
          b.classList.toggle("selected", pendingLeft === idx);
          b.addEventListener("click", () => onLeftClick(idx));
          leftCol.appendChild(b);
        });

        rightCol.innerHTML = "";
        right.forEach((text, idx) => {
          if (pairedRight.has(idx)) return;
          const b = el(`<button type="button" class="match-item">${escapeHtml(text)}</button>`);
          b.addEventListener("click", () => onRightClick(idx));
          rightCol.appendChild(b);
        });

        pairedSection.hidden = pairs.length === 0;
        pairedList.innerHTML = "";
        pairs.forEach(([lIdx, rIdx], i) => {
          const n = i + 1;
          const row = el(`
            <div class="paired-row">
              <div class="match-item paired-tile"><span class="pair-badge">${n}</span>${escapeHtml(left[lIdx])}</div>
              <div class="match-item paired-tile"><span class="pair-badge">${n}</span>${escapeHtml(right[rIdx])}</div>
              <button type="button" class="pair-undo" aria-label="Anuliuoti ${n} porą">✕</button>
            </div>
          `);
          row.querySelector(".pair-undo").addEventListener("click", () => onUndo(lIdx, rIdx));
          pairedList.appendChild(row);
        });

        checkBtn.disabled = pairs.length !== left.length;
      }

      function onLeftClick(idx) {
        pendingLeft = pendingLeft === idx ? null : idx;
        render();
      }

      function onRightClick(idx) {
        if (pendingLeft === null) return;
        pairs.push([pendingLeft, idx]);
        pendingLeft = null;
        render();
      }

      function onUndo(lIdx, rIdx) {
        pairs = pairs.filter((p) => !(p[0] === lIdx && p[1] === rIdx));
        render();
      }

      checkBtn.addEventListener("click", () => {
        if (revealed) {
          nextItem();
          return;
        }
        if (pairs.length !== left.length) return;
        const result = submitScoredAttempt(item, retryMsg, () => {
          const wanted = (item.answer && item.answer.pairs) || [];
          const wantedSet = new Set(wanted.map((p) => p[0] + ":" + p[1]));
          const gotSet = new Set(pairs.map((p) => p[0] + ":" + p[1]));
          return {
            answer: { pairs },
            correct: wantedSet.size === gotSet.size && [...wantedSet].every((p) => gotSet.has(p)),
          };
        });
        if (result === "exhausted") {
          revealed = true;
          hideHintOnReveal(container);
          retryMsg.hidden = true;
          leftCol.querySelectorAll("button").forEach((b) => (b.disabled = true));
          rightCol.querySelectorAll("button").forEach((b) => (b.disabled = true));
          pairedList.querySelectorAll("button").forEach((b) => (b.disabled = true));
          const wanted = (item.answer && item.answer.pairs) || [];
          const correctText = wanted
            .map(([l, r]) => `${escapeHtml(left[l])} — ${escapeHtml(right[r])}`)
            .join(", ");
          container.insertAdjacentHTML("beforeend", revealBlock(correctText, item.hint));
          checkBtn.disabled = false;
        } else if (result === "retry") {
          pairs = [];
          pendingLeft = null;
          render();
        }
      });
      render();
    },

    open_schema(container, item) {
      const text = item.prompt || (item.data && item.data.text) || "";
      const instruction = item.data && item.data.instruction;
      const hasNumericAnswer = item.answer && typeof item.answer.value === "number";
      container.innerHTML = `
        <p class="prompt">${escapeHtml(text)}</p>
        ${instruction ? `<p class="instruction">${escapeHtml(instruction)}</p>` : ""}
        ${hasNumericAnswer ? `<input type="number" inputmode="numeric" placeholder="Atsakymas" aria-label="Atsakymas" />` : ""}
        <button type="button" class="btn" data-primary data-action="done">Padariau ✔</button>
        ${renderHintBlock(item)}
      `;
      wireHint(container, item);
      const input = container.querySelector("input");
      const doneBtn = container.querySelector('[data-action="done"]');
      doneBtn.addEventListener(
        "click",
        () => {
          if (session.submitting) return;
          let correct = null;
          let answerValue = {};
          if (hasNumericAnswer && input && input.value.trim() !== "") {
            const val = Number(input.value);
            answerValue = { value: val };
            correct = val === item.answer.value;
          }
          doneBtn.disabled = true;
          finalizeItem(item, answerValue, correct);
          nextItem();
        },
        { once: true }
      );
      if (input) {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") doneBtn.click();
        });
      }
    },

    passage(container, item) {
      container.innerHTML = `
        <h2 class="passage-title">${escapeHtml((item.data && item.data.title) || "")}</h2>
        <div class="passage-body standalone">${paragraphsHtml(item.data && item.data.text)}</div>
      `;
      const btn = el(`<button type="button" class="btn" data-primary>Toliau</button>`);
      btn.addEventListener(
        "click",
        () => {
          if (session.submitting) return;
          finalizeItem(item, null, null);
          nextItem();
        },
        { once: true }
      );
      container.appendChild(btn);
    },

    printable(container, item) {
      const data = item.data || {};
      container.innerHTML = `
        ${data.title ? `<h2 class="passage-title">${escapeHtml(data.title)}</h2>` : ""}
        <p class="prompt">${escapeHtml(item.prompt || "")}</p>
        ${data.week_note ? `<p class="week-note">${escapeHtml(data.week_note)}</p>` : ""}
        ${renderHintBlock(item)}
      `;
      wireHint(container, item);
      const printLink = el(
        `<a class="btn" href="${escapeHtml(data.url || "#")}" target="_blank" rel="noopener">Atsispausdinti lapą</a>`
      );
      container.appendChild(printLink);
      const doneBtn = el(`<button type="button" class="btn btn-secondary" data-action="done">Padariau ✔</button>`);
      container.appendChild(doneBtn);
      doneBtn.addEventListener(
        "click",
        () => {
          finalizeItem(item, null, null);
          nextItem();
        },
        { once: true }
      );
    },

    // SPEC.md §13.4 — Lilija: syllable tiles assembled into a word slot.
    syllable_build(container, item) {
      const syllables = item.data.syllables || [];
      const target = item.data.target || "";
      container.innerHTML = `
        <p class="prompt">${escapeHtml(item.prompt || "Sudėk žodį")}</p>
        <div class="word-slot" data-action="slot" role="button" tabindex="0" aria-label="Ištrinti paskutinį skiemenį"><span></span></div>
        <div class="syllable-tiles"></div>
        <button type="button" class="btn" data-primary disabled>Toliau</button>
        <p class="retry-msg" hidden></p>
        ${renderHintBlock(item)}
      `;
      const slot = container.querySelector(".word-slot");
      const slotText = slot.querySelector("span");
      const tilesWrap = container.querySelector(".syllable-tiles");
      const nextBtn = container.querySelector("[data-primary]");
      const retryMsg = container.querySelector(".retry-msg");
      wireHint(container, item);

      const order = shuffle(syllables.map((s, i) => i));
      let built = []; // indices into `syllables`, in the order tapped
      let attempts = 0;
      let errors = 0; // tile taps that put a syllable in a wrong position

      // `data.syllables` is not necessarily in word order (the real sets list
      // them pre-scrambled), so the right syllable for each position comes
      // from `target`: every ordering of the syllables that spells it.
      const expectedAt = (() => {
        const orders = [];
        (function walk(used, pos, seq) {
          if (seq.length === syllables.length) {
            if (pos === target.length) orders.push(seq);
            return;
          }
          syllables.forEach((s, i) => {
            if (!used.has(i) && target.startsWith(s, pos)) {
              walk(new Set(used).add(i), pos + s.length, [...seq, s]);
            }
          });
        })(new Set(), 0, []);
        return orders.length
          ? syllables.map((_, p) => new Set(orders.map((o) => o[p])))
          : null; // syllables don't spell the target — author error
      })();

      function isWrongPosition(i) {
        const pos = built.length;
        if (expectedAt) return !expectedAt[pos].has(syllables[i]);
        const sofar = built.map((b) => syllables[b]).join("");
        return !target.startsWith(sofar + syllables[i]);
      }

      function isUsed(i) {
        return built.includes(i);
      }

      function render() {
        tilesWrap.innerHTML = "";
        order.forEach((i) => {
          const used = isUsed(i);
          const wrap = el(`<div class="syllable-tile-wrap"></div>`);
          const tile = el(
            `<button type="button" class="syllable-tile" aria-label="Skiemuo ${escapeHtml(syllables[i])}"${used ? " disabled" : ""}>${escapeHtml(syllables[i])}</button>`
          );
          if (!used) {
            tile.addEventListener("click", () => {
              if (isWrongPosition(i)) errors += 1;
              built.push(i);
              attempts += 1;
              render();
            });
          }
          wrap.appendChild(tile);
          if (ttsVoice) wrap.appendChild(speakButton(syllables[i], `Ištarti skiemenį ${syllables[i]}`));
          tilesWrap.appendChild(wrap);
        });
        slotText.textContent = built.map((i) => syllables[i]).join("");
        nextBtn.disabled = built.length === 0;
      }

      slot.addEventListener("click", () => {
        if (built.length === 0) return;
        built.pop();
        attempts += 1;
        render();
      });
      slot.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          slot.click();
        }
      });
      render();

      nextBtn.addEventListener("click", () => {
        if (built.length === 0) return;
        submitAttempt(item, retryMsg, () => {
          const word = built.map((i) => syllables[i]).join("");
          return { answer: { word, attempts, errors }, correct: word === target };
        });
      });
    },

    // SPEC.md §13.4 — Lilija: reading-aloud passage with a reading-only
    // stopwatch, then a difficulty rating + optional parent error-marking
    // screen. Non-scored (like `passage`/`open_schema`): correct is always
    // null.
    read_aloud(container, item) {
      const data = item.data || {};
      const words = String(data.text || "")
        .split(/\s+/)
        .filter(Boolean);
      const wordCount = words.length;

      // No start button: the clock starts the moment the text is on screen.
      // "Baigiau" stays disabled for the first MIN_READ_SECONDS (thin
      // progress line underneath, no countdown numbers).
      const MIN_READ_SECONDS = 20;
      const readingStartMs = Date.now();
      renderReading();

      function renderReading() {
        container.innerHTML = `
          <h2 class="passage-title">${escapeHtml(data.title || "")}</h2>
          <div class="reading-head">
            <span class="reading-timer" role="timer" aria-label="Skaitymo laikas">0:00</span>
            <label class="plain-toggle"><input type="checkbox" /> Paprastas tekstas</label>
          </div>
          <div class="reading-text"></div>
          <button type="button" class="btn" data-action="stop" disabled>Baigiau</button>
          <div class="think-lock" aria-hidden="true"><div class="think-lock-fill"></div></div>
        `;
        const timerSpan = container.querySelector(".reading-timer");
        const textEl = container.querySelector(".reading-text");
        const plainToggle = container.querySelector(".plain-toggle input");
        const stopBtn = container.querySelector('[data-action="stop"]');
        textEl.appendChild(buildReadingText(data.syllables || data.text || ""));
        plainToggle.addEventListener("change", () => {
          textEl.classList.toggle("plain", plainToggle.checked);
        });
        const handle = setInterval(() => {
          timerSpan.textContent = fmtTime((Date.now() - readingStartMs) / 1000);
        }, 1000);
        startThinkLock(
          container.querySelector(".think-lock-fill"),
          () => {
            stopBtn.disabled = false;
          },
          MIN_READ_SECONDS * 1000
        );
        stopBtn.addEventListener(
          "click",
          () => {
            clearInterval(handle);
            const seconds = Math.round((Date.now() - readingStartMs) / 1000);
            // Can't happen through the UI while the button is locked; kept as
            // the guard that keeps a too-short read out of the WPM stats.
            renderReview(seconds, textEl.cloneNode(true), seconds < MIN_READ_SECONDS);
          },
          { once: true }
        );
      }

      // Splits "Ma-ma vi-rė ko-šę." into word tiles; within each word,
      // syllables alternate between the two brand colors (reset per word).
      function buildReadingText(syllableText) {
        const wrap = el(`<div></div>`);
        syllableText.split(/\s+/).filter(Boolean).forEach((word, wi) => {
          if (wi > 0) wrap.appendChild(document.createTextNode(" "));
          const plain = word.replace(/-/g, "");
          const tile = el(`<span class="word-tile" data-word="${escapeHtml(plain)}"></span>`);
          word.split("-").forEach((syl, si) => {
            const span = el(`<span class="syl ${si % 2 === 0 ? "syl-a" : "syl-b"}"></span>`);
            span.textContent = syl;
            tile.appendChild(span);
          });
          wrap.appendChild(tile);
        });
        return wrap;
      }

      function renderReview(seconds, textNode, rushed) {
        container.innerHTML = `
          <div class="reading-text review"></div>
          <label class="parent-toggle"><input type="checkbox" /> Tėvai: pažymėti klaidas</label>
          <p class="prompt">Ar buvo sunku?</p>
          <div class="difficulty-row"></div>
        `;
        container.querySelector(".reading-text").appendChild(textNode);
        const parentToggle = container.querySelector(".parent-toggle input");
        const errorWords = new Set();
        const tiles = Array.from(container.querySelectorAll(".word-tile"));

        function refreshTiles() {
          tiles.forEach((tile) => {
            if (parentToggle.checked) {
              tile.setAttribute("role", "button");
              tile.setAttribute("tabindex", "0");
              tile.classList.add("taggable");
            } else {
              tile.removeAttribute("role");
              tile.removeAttribute("tabindex");
              tile.classList.remove("taggable");
            }
          });
        }
        parentToggle.addEventListener("change", refreshTiles);
        refreshTiles();

        tiles.forEach((tile) => {
          tile.addEventListener("click", () => {
            if (!parentToggle.checked) return;
            const word = tile.dataset.word;
            const isError = tile.classList.toggle("error");
            if (isError) errorWords.add(word);
            else errorWords.delete(word);
          });
        });

        const row = container.querySelector(".difficulty-row");
        [
          ["lengva", "Lengva"],
          ["vidutiniskai", "Vidutiniškai"],
          ["sunku", "Sunku"],
        ].forEach(([value, label]) => {
          const btn = el(`<button type="button" class="btn btn-secondary difficulty-btn">${label}</button>`);
          btn.addEventListener(
            "click",
            () => {
              if (session.submitting) return;
              const words_per_minute = seconds > 0 ? Math.round(wordCount / (seconds / 60)) : 0;
              finalizeItem(
                item,
                {
                  seconds,
                  word_count: wordCount,
                  words_per_minute,
                  self_rating: value,
                  error_words: Array.from(errorWords),
                },
                null,
                rushed ? { rushed: true } : undefined
              );
              nextItem();
            },
            { once: true }
          );
          row.appendChild(btn);
        });
      }
    },

    // SPEC.md §13.4 — Lilija: fill-the-gap sentence, same shape/check as `choice`.
    word_gap(container, item) {
      container.innerHTML = `
        <p class="prompt">${escapeHtml(item.data.sentence || item.prompt || "")}</p>
        <div class="choice-list"></div>
        <button type="button" class="btn" data-primary disabled>Toliau</button>
        <p class="retry-msg" hidden></p>
        ${renderHintBlock(item)}
      `;
      attachSpeakToPrompt(container, item.data.sentence || item.prompt || "", "Ištarti sakinį");
      const list = container.querySelector(".choice-list");
      const nextBtn = container.querySelector("[data-primary]");
      const retryMsg = container.querySelector(".retry-msg");
      let selected = null;
      (item.data.options || []).forEach((opt, idx) => {
        const btn = el(`<button type="button" class="option-btn" aria-pressed="false">${escapeHtml(opt)}</button>`);
        btn.addEventListener("click", () => {
          selected = idx;
          Array.from(list.children).forEach((b, i) => {
            b.classList.toggle("selected", i === idx);
            b.setAttribute("aria-pressed", String(i === idx));
          });
          nextBtn.disabled = false;
        });
        list.appendChild(btn);
      });
      wireHint(container, item);

      nextBtn.addEventListener("click", () => {
        if (selected === null) return;
        submitAttempt(item, retryMsg, () => ({
          answer: { index: selected },
          correct: !!(item.answer && selected === item.answer.index),
        }));
      });
    },
  };

  function renderNumericItem(container, item, promptText) {
    container.innerHTML = `
      <p class="prompt">${escapeHtml(promptText)}</p>
      <input type="number" inputmode="numeric" autocomplete="off" aria-label="Atsakymas" />
      <button type="button" class="btn" data-primary disabled>Toliau</button>
      <div class="think-lock" aria-hidden="true"><div class="think-lock-fill"></div></div>
      <p class="retry-msg" hidden></p>
      ${renderHintBlock(item)}
    `;
    wireHint(container, item);
    const input = container.querySelector("input");
    const nextBtn = container.querySelector("[data-primary]");
    const retryMsg = container.querySelector(".retry-msg");
    const lockBar = container.querySelector(".think-lock");
    const lockFill = container.querySelector(".think-lock-fill");
    input.focus();

    let locked = true;
    let revealed = false;

    function reapplyLock() {
      locked = true;
      nextBtn.disabled = true;
      startThinkLock(lockFill, () => {
        locked = false;
        nextBtn.disabled = input.value.trim() === "";
      });
    }

    input.addEventListener("input", () => {
      if (!locked) nextBtn.disabled = input.value.trim() === "";
      if (input.value.trim() !== "") retryMsg.hidden = true;
    });
    reapplyLock();

    // Never record an answer the child did not type: an empty field only
    // nudges, it doesn't consume an attempt (and does nothing while locked).
    function press() {
      if (revealed) {
        nextItem();
        return;
      }
      if (locked) return;
      const raw = input.value.trim();
      if (raw === "") {
        retryMsg.textContent = "Įrašyk atsakymą";
        retryMsg.hidden = false;
        return;
      }
      const val = Number(raw);
      const result = submitScoredAttempt(item, retryMsg, () => ({
        answer: { value: Number.isNaN(val) ? raw : val },
        correct: !Number.isNaN(val) && val === item.answer.value,
      }));
      if (result === "exhausted") {
        revealed = true;
        hideHintOnReveal(container);
        lockBar.hidden = true;
        retryMsg.hidden = true;
        input.disabled = true;
        container.insertAdjacentHTML(
          "beforeend",
          revealBlock(escapeHtml(String(item.answer.value)), item.hint)
        );
        nextBtn.disabled = false;
      } else if (result === "retry") {
        input.value = "";
        reapplyLock();
        input.focus();
      }
    }

    nextBtn.addEventListener("click", press);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.repeat) press();
    });
  }

  // ---- treasure chest (SPEC.md §7.4) ---------------------------------------

  // The three rewards are rolled server-side when the set is completed
  // (record_progress); this screen only picks which of them to open. Nothing
  // here decides or writes a reward — open_chest() does, and is idempotent.
  const CHEST_KEY = `nmpp:chest:${LEARNER}`;
  const DOW_ACCUSATIVE = ["pirmadienį", "antradienį", "trečiadienį", "ketvirtadienį", "penktadienį", "šeštadienį", "sekmadienį"];

  const CHEST_SVG = `
    <svg viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      <ellipse cx="100" cy="144" rx="82" ry="6" fill="#21242b" opacity="0.12"/>
      <rect x="20" y="70" width="160" height="72" rx="8" fill="#9b6a35" stroke="#21242b" stroke-width="4"/>
      <rect x="22" y="94" width="156" height="9" fill="#6d4720"/>
      <path d="M46 72 V140 M154 72 V140" stroke="#d9a21b" stroke-width="12"/>
      <g class="chest-glow">
        <path d="M52 70 L34 20 M100 70 L100 6 M148 70 L166 20" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/>
        <ellipse cx="100" cy="71" rx="70" ry="9" fill="#ffe27a"/>
      </g>
      <rect x="87" y="66" width="26" height="28" rx="4" fill="#ffd23f" stroke="#21242b" stroke-width="3"/>
      <circle cx="100" cy="77" r="3.5" fill="#21242b"/>
      <g class="chest-lid">
        <path d="M20 72 V54 Q20 22 100 22 Q180 22 180 54 V72 Z" fill="#b5803f" stroke="#21242b" stroke-width="4" stroke-linejoin="round"/>
        <path d="M46 29 V70 M154 29 V70" stroke="#d9a21b" stroke-width="12"/>
        <path d="M20 72 H180" stroke="#21242b" stroke-width="4"/>
      </g>
    </svg>`;

  function rememberChest(taskSetId) {
    try {
      localStorage.setItem(CHEST_KEY, taskSetId);
    } catch (e) {}
  }

  function forgetChest() {
    try {
      localStorage.removeItem(CHEST_KEY);
    } catch (e) {}
  }

  function pendingChestId() {
    try {
      return localStorage.getItem(CHEST_KEY);
    } catch (e) {
      return null;
    }
  }

  // "Dviguba diena rytoj" — or the weekday, when the next scheduled day is not
  // tomorrow (a Saturday chest points at Monday: there are no Sunday sets).
  function doubleDayText(doubleOn) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(doubleOn || "");
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      const t = new Date();
      t.setDate(t.getDate() + 1);
      const sameDay = d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
      if (!sameDay) return `Dviguba diena ${DOW_ACCUSATIVE[(d.getDay() + 6) % 7]}`;
    }
    return "Dviguba diena rytoj";
  }

  function chestRewardText(chest) {
    return chest.reward_type === "double" ? doubleDayText(chest.double_on) : `+${chest.reward_stars} ⭐`;
  }

  // Shows the chest and resolves with the open_chest() row once the child has
  // opened it and pressed "Toliau" — or null if opening failed and they skipped.
  function runChest(taskSetId) {
    return new Promise((resolve) => {
      topbarEl.hidden = true;
      screenEl.innerHTML = `
        <div class="chest-screen">
          <p class="end-title chest-title" tabindex="-1">Rinkis skrynią!</p>
          <div class="chest-art">${CHEST_SVG}</div>
          <div class="chest-picks" role="group" aria-label="Skrynios pasirinkimas">
            <button type="button" class="btn chest-pick" data-pick="1" aria-label="Pasirinkti skrynią 1">1</button>
            <button type="button" class="btn chest-pick" data-pick="2" aria-label="Pasirinkti skrynią 2">2</button>
            <button type="button" class="btn chest-pick" data-pick="3" aria-label="Pasirinkti skrynią 3">3</button>
          </div>
          <p class="chest-reward" role="status" hidden></p>
          <p class="chest-error" role="alert" hidden>Nepavyko atidaryti. Bandyk dar kartą.</p>
          <button type="button" class="btn chest-skip btn-secondary" hidden>Praleisti</button>
          <button type="button" class="btn chest-next" data-primary hidden>Toliau</button>
        </div>
      `;
      const root = screenEl.querySelector(".chest-screen");
      const titleEl = root.querySelector(".chest-title");
      const artEl = root.querySelector(".chest-art");
      const picks = [...root.querySelectorAll(".chest-pick")];
      const rewardEl = root.querySelector(".chest-reward");
      const errorEl = root.querySelector(".chest-error");
      const skipBtn = root.querySelector(".chest-skip");
      const nextBtn = root.querySelector(".chest-next");
      // Not a pick button: a held Enter from the last item must not open it.
      titleEl.focus({ preventScroll: true });

      let busy = false;
      async function pick(btn) {
        if (busy) return;
        busy = true;
        errorEl.hidden = true;
        picks.forEach((b) => (b.disabled = true));
        let chest;
        try {
          const { data, error } = await client.rpc("open_chest", {
            p_set_id: taskSetId,
            p_pick: Number(btn.dataset.pick),
          });
          if (error) throw error;
          chest = Array.isArray(data) ? data[0] : data;
          if (!chest) throw new Error("empty");
        } catch (e) {
          busy = false;
          picks.forEach((b) => (b.disabled = false));
          errorEl.hidden = false;
          skipBtn.hidden = false;
          return;
        }
        forgetChest();
        btn.classList.add("chosen");
        artEl.classList.add("opening");
        // The lid lifts via CSS; reduced-motion users get the open state at once.
        requestAnimationFrame(() => artEl.classList.add("open"));
        titleEl.textContent = "Atidaryta!";
        rewardEl.textContent = chestRewardText(chest);
        rewardEl.hidden = false;
        skipBtn.hidden = true;
        playChime();
        if (typeof chest.total_stars === "number") updateStarsBadge(chest.total_stars);
        if (chest.reward_type === "double" || chest.reward_stars >= 3) renderConfetti(root);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        setTimeout(
          () => {
            nextBtn.hidden = false;
            nextBtn.focus({ preventScroll: true });
          },
          reduced ? 0 : 700
        );
        nextBtn.addEventListener("click", () => resolve(chest), { once: true });
      }
      picks.forEach((b) => b.addEventListener("click", () => pick(b)));
      skipBtn.addEventListener("click", () => resolve(null), { once: true });
    });
  }

  // ---- session lifecycle ------------------------------------------------

  function beginSession(taskSet) {
    const saved = loadProgress(taskSet.id);
    if (saved) {
      session = {
        taskSet,
        index: saved.index,
        answers: saved.answers,
        sessionStartMs: saved.sessionStartMs,
        itemStartMs: Date.now(),
        attempt: 0,
      };
    } else {
      session = {
        taskSet,
        index: 0,
        answers: [],
        sessionStartMs: Date.now(),
        itemStartMs: Date.now(),
        attempt: 0,
      };
      persistSession();
    }
    startTimer();
    if (session.index >= taskSet.items.length) {
      submitSession();
    } else {
      renderCurrentItem();
    }
  }

  async function submitSession() {
    // The last press advances straight into this async save; swap the item
    // out at once so a second tap can't record or submit twice.
    session.submitting = true;
    screenEl.innerHTML = `<p class="loading">Kraunama…</p>`;
    stopTimer();
    updateTopbar();
    const duration_seconds = Math.round((Date.now() - session.sessionStartMs) / 1000);
    const correct_count = session.answers.filter((a) => a.correct === true).length;
    const total_autochecked = session.answers.filter((a) => a.correct !== null).length;
    const setStars = session.answers.reduce((sum, a) => sum + (a.stars || 0), 0);

    try {
      await client.from("results").insert({
        task_set_id: session.taskSet.id,
        answers: session.answers,
        correct_count,
        total_autochecked,
        duration_seconds,
        interrupted: false,
        learner: LEARNER,
      });
    } catch (e) {
      /* even if the write fails, still show the finish screen locally */
    }
    clearProgress(session.taskSet.id);

    // Both are bonuses: a failure in either must never block the finish
    // screen. They run in parallel; the results row is already saved.
    const onSaturday = isSaturday(session.taskSet.scheduled_date);
    let [reward, weekly] = await Promise.all([
      (async () => {
        try {
          // The server recomputes everything from the saved results row.
          const { data, error } = await client.rpc("record_progress", {
            p_set_id: session.taskSet.id,
          });
          if (error) throw error;
          return Array.isArray(data) ? data[0] : data;
        } catch (e) {
          return null;
        }
      })(),
      (async () => {
        if (!onSaturday) return null;
        try {
          const { data, error } = await client.rpc("weekly_stats", { p_learner: LEARNER });
          if (error) throw error;
          return data;
        } catch (e) {
          return null;
        }
      })(),
    ]);

    // One chest per completed set, shown before the stats. The server rolled
    // it already (chest_ready); a failed/skipped open just leaves it unopened.
    let chest = null;
    if (reward && reward.chest_ready) {
      rememberChest(session.taskSet.id);
      chest = await runChest(session.taskSet.id);
      if (chest && onSaturday) {
        // the week card was fetched before the chest stars existed
        try {
          const { data, error } = await client.rpc("weekly_stats", { p_learner: LEARNER });
          if (!error && data) weekly = data;
        } catch (e) {}
      }
    }

    // Prefer the server's figure; fall back to the local count offline.
    const shownStars = reward && typeof reward.set_stars === "number" ? reward.set_stars : setStars;
    const totalStars = chest && typeof chest.total_stars === "number" ? chest.total_stars : reward && reward.total_stars;

    screenEl.innerHTML = `
      <div class="end-screen">
        <div class="star" aria-hidden="true">${AVATAR}</div>
        <p class="end-title">Šiandien — atlikta!</p>
        <p class="end-score">Teisingai: ${correct_count} iš ${total_autochecked}</p>
        <p class="end-stars">⭐ +${shownStars}${reward && reward.doubled ? " · Dviguba diena ×2" : ""}</p>
        ${chest ? `<p class="end-chest">🎁 Skrynia: ${escapeHtml(chestRewardText(chest))}</p>` : ""}
        ${reward ? `<p class="end-total">Iš viso: ⭐ ${totalStars}</p>` : ""}
        ${reward && reward.streak >= 1 ? `<p class="end-streak">🔥 ${reward.streak} dienos iš eilės</p>` : ""}
      </div>
    `;
    topbarEl.hidden = true;

    const endScreen = screenEl.querySelector(".end-screen");
    if (shownStars > 0) renderConfetti(endScreen);
    // The chest already chimed when it opened.
    if (!chest) playChime();

    if (reward) {
      updateStarsBadge(totalStars);
      const newBadges = reward.new_badges || [];
      if (newBadges.length > 0) {
        const badgesWrap = el(`<div class="new-badges"></div>`);
        newBadges.forEach((key) => {
          const b = BADGES[key];
          if (!b) return;
          badgesWrap.appendChild(
            el(`<p class="new-badge">${b.emoji} Naujas ženkliukas: ${escapeHtml(b.label)}!</p>`)
          );
        });
        endScreen.appendChild(badgesWrap);
      }
    }

    const weekCard = buildWeekCard(weekly);
    if (weekCard) endScreen.appendChild(weekCard);

    // Plain outbound link to a YouTube Music search — nothing is embedded or bundled.
    endScreen.appendChild(
      el(
        `<a class="btn btn-secondary" href="https://music.youtube.com/search?q=Scoop%20Conor%20Price%20Nic%20D" target="_blank" rel="noopener">🎵 Švęsk su Scoop</a>`
      )
    );
  }

  // Finish screen after a resumed chest: the set's stats were already shown
  // before the reload, so this is just the reward and the way out.
  function renderChestFinish(chest) {
    topbarEl.hidden = true;
    screenEl.innerHTML = `
      <div class="end-screen">
        <div class="star" aria-hidden="true">${AVATAR}</div>
        <p class="end-title">Šiandien — atlikta!</p>
        ${chest ? `<p class="end-chest">🎁 Skrynia: ${escapeHtml(chestRewardText(chest))}</p>` : ""}
        ${chest && typeof chest.total_stars === "number" ? `<p class="end-total">Iš viso: ⭐ ${chest.total_stars}</p>` : ""}
      </div>
    `;
    screenEl.querySelector(".end-screen").appendChild(
      el(
        `<a class="btn btn-secondary" href="https://music.youtube.com/search?q=Scoop%20Conor%20Price%20Nic%20D" target="_blank" rel="noopener">🎵 Švęsk su Scoop</a>`
      )
    );
  }

  // ---- boot ---------------------------------------------------------------

  function renderEmpty() {
    screenEl.innerHTML = `<p class="empty">Šiandien užduočių nėra. Laisva diena! 🎉</p>`;
  }

  function renderSubjectPicker(taskSets) {
    screenEl.innerHTML = `
      <div class="card">
        <p class="prompt">Šiandien du dalykai. Nuo ko pradėsi?</p>
        <div class="subject-list"></div>
      </div>
    `;
    const list = screenEl.querySelector(".subject-list");
    taskSets.forEach((ts) => {
      const label = SUBJECT_LABELS[ts.subject] || ts.subject;
      const btn = el(`<button type="button" class="btn">${escapeHtml(label)}</button>`);
      btn.addEventListener("click", () => beginSession(ts));
      list.appendChild(btn);
    });
  }

  async function loadStarsBadge() {
    try {
      const { data, error } = await client.from("progress").select("total_stars").eq("learner", LEARNER).single();
      if (error) throw error;
      if (data) updateStarsBadge(data.total_stars);
    } catch (e) {
      /* badge just won't show a number yet — non-critical */
    }
  }

  async function init() {
    loadSoundPref();
    loadStarsBadge();
    const today = todayStr();
    const wanted = requestedDate();
    const day = wanted || today;
    // Catch-up = a past date. Today's own in-progress session / pending chest
    // belong to a different set, so the housekeeping below must leave them be.
    const catchUp = day < today;
    if (catchUp) {
      const banner = el(`<p id="catchup-banner" role="note">Praleista diena: ${day}</p>`);
      document.getElementById("app-header").after(banner);
    }
    let taskSets = [];
    try {
      const [{ data, error }] = await Promise.all([
        client.from("task_sets").select("*").eq("scheduled_date", day).eq("learner", LEARNER),
        initTTS().then((v) => (ttsVoice = v)),
      ]);
      if (error) throw error;
      taskSets = data || [];
    } catch (e) {
      screenEl.innerHTML = `<p class="empty">Nepavyko įkelti užduočių. Patikrink interneto ryšį.</p>`;
      return;
    }

    if (!catchUp) await flushAbandonedSessions(new Set(taskSets.map((t) => t.id)));

    // A chest that was rolled but not opened yet (reload on the chest screen):
    // show the same chest again — its contents were fixed at completion.
    const pendingId = pendingChestId();
    if (pendingId) {
      if (!taskSets.some((t) => t.id === pendingId)) {
        if (!catchUp) forgetChest();
      } else {
        let ready = null;
        try {
          const { data, error } = await client.rpc("chest_ready", { p_set_id: pendingId });
          if (error) throw error;
          ready = data === true;
        } catch (e) {
          /* offline: keep the marker and carry on as normal */
        }
        if (ready === false) forgetChest();
        if (ready) {
          const chest = await runChest(pendingId);
          renderChestFinish(chest);
          return;
        }
      }
    }

    if (taskSets.length === 0) {
      renderEmpty();
    } else if (taskSets.length === 1) {
      beginSession(taskSets[0]);
    } else {
      renderSubjectPicker(taskSets);
    }
  }

  init();
})();
