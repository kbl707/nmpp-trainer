(() => {
  "use strict";

  const CONFIG = window.NMPP_CONFIG;
  const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  const screenEl = document.getElementById("screen");
  const topbarEl = document.getElementById("topbar");
  const progressFillEl = document.getElementById("progress-fill");
  const progressLabelEl = document.getElementById("progress-label");
  const timerEl = document.getElementById("timer");
  const starsBadgeEl = document.getElementById("stars-badge");
  const soundToggleEl = document.getElementById("sound-toggle");
  const praiseToastEl = document.getElementById("praise-toast");

  const PROGRESS_PREFIX = "nmpp:progress:";
  const SUBJECT_LABELS = { matematika: "Matematika", lietuviu: "Lietuvių kalba", pratimai: "Pratimai" };
  const PRAISE_WORDS = ["Puiku!", "Taip!", "Šaunu!", "Tiksliai!"];
  const SOUND_KEY = "nmpp:sound-on";
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

  function finalizeItem(item, answerValue, correct) {
    const seconds = Math.round((Date.now() - session.itemStartMs) / 1000);
    const stars = correct ? (session.attempt <= 1 ? 2 : 1) : 0;
    session.answers.push({
      item_id: item.id,
      answer: answerValue,
      correct: correct,
      seconds,
      stars,
    });
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
  // to precede the questions that reference it.
  function findPassage(refId) {
    for (let i = session.index - 1; i >= 0; i--) {
      const candidate = session.taskSet.items[i];
      if (candidate.type === "passage" && candidate.id === refId) return candidate;
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

    compare(container, item) {
      container.innerHTML = `
        <p class="prompt">${item.data.left} &nbsp;&nbsp;?&nbsp;&nbsp; ${item.data.right}</p>
        <div class="compare-row"></div>
        <button type="button" class="btn" data-primary disabled>Toliau</button>
        <p class="retry-msg" hidden></p>
        ${renderHintBlock(item)}
      `;
      const row = container.querySelector(".compare-row");
      const nextBtn = container.querySelector("[data-primary]");
      const retryMsg = container.querySelector(".retry-msg");
      let selected = null;
      ["<", ">", "="].forEach((sign) => {
        const btn = el(
          `<button type="button" class="option-btn compare-btn" aria-pressed="false" aria-label="${
            sign === "<" ? "mažiau" : sign === ">" ? "daugiau" : "lygu"
          }">${sign}</button>`
        );
        btn.addEventListener("click", () => {
          selected = sign;
          Array.from(row.children).forEach((b) => {
            const on = b === btn;
            b.classList.toggle("selected", on);
            b.setAttribute("aria-pressed", String(on));
          });
          nextBtn.disabled = false;
        });
        row.appendChild(btn);
      });
      wireHint(container, item);

      nextBtn.addEventListener("click", () => {
        if (selected === null) return;
        submitAttempt(item, retryMsg, () => ({
          answer: { sign: selected },
          correct: !!(item.answer && selected === item.answer.sign),
        }));
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
        if (pairs.length !== left.length) return;
        submitAttempt(item, retryMsg, () => {
          const wanted = (item.answer && item.answer.pairs) || [];
          const wantedSet = new Set(wanted.map((p) => p[0] + ":" + p[1]));
          const gotSet = new Set(pairs.map((p) => p[0] + ":" + p[1]));
          return {
            answer: { pairs },
            correct: wantedSet.size === gotSet.size && [...wantedSet].every((p) => gotSet.has(p)),
          };
        });
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
  };

  function renderNumericItem(container, item, promptText) {
    container.innerHTML = `
      <p class="prompt">${escapeHtml(promptText)}</p>
      <input type="number" inputmode="numeric" autocomplete="off" aria-label="Atsakymas" />
      <button type="button" class="btn" data-primary disabled>Toliau</button>
      <p class="retry-msg" hidden></p>
      ${renderHintBlock(item)}
    `;
    wireHint(container, item);
    const input = container.querySelector("input");
    const nextBtn = container.querySelector("[data-primary]");
    const retryMsg = container.querySelector(".retry-msg");
    input.focus();

    input.addEventListener("input", () => {
      nextBtn.disabled = input.value.trim() === "";
      if (input.value.trim() !== "") retryMsg.hidden = true;
    });

    // Never record an answer the child did not type: an empty field only
    // nudges, it doesn't consume an attempt.
    function press() {
      const raw = input.value.trim();
      if (raw === "") {
        retryMsg.textContent = "Įrašyk atsakymą";
        retryMsg.hidden = false;
        return;
      }
      const val = Number(raw);
      const advanced = submitAttempt(item, retryMsg, () => ({
        answer: { value: Number.isNaN(val) ? raw : val },
        correct: !Number.isNaN(val) && val === item.answer.value,
      }));
      if (!advanced) {
        input.focus();
        input.select();
      }
    }

    nextBtn.addEventListener("click", press);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.repeat) press();
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
      });
    } catch (e) {
      /* even if the write fails, still show the finish screen locally */
    }
    clearProgress(session.taskSet.id);

    // Both are bonuses: a failure in either must never block the finish
    // screen. They run in parallel; the results row is already saved.
    const onSaturday = isSaturday(session.taskSet.scheduled_date);
    const [reward, weekly] = await Promise.all([
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
          const { data, error } = await client.rpc("weekly_stats");
          if (error) throw error;
          return data;
        } catch (e) {
          return null;
        }
      })(),
    ]);

    // Prefer the server's figure; fall back to the local count offline.
    const shownStars = reward && typeof reward.set_stars === "number" ? reward.set_stars : setStars;

    screenEl.innerHTML = `
      <div class="end-screen">
        <div class="star">⭐</div>
        <p class="end-title">Šiandien — atlikta!</p>
        <p class="end-score">Teisingai: ${correct_count} iš ${total_autochecked}</p>
        <p class="end-stars">⭐ +${shownStars}</p>
        ${reward ? `<p class="end-total">Iš viso: ⭐ ${reward.total_stars}</p>` : ""}
        ${reward && reward.streak >= 1 ? `<p class="end-streak">🔥 ${reward.streak} dienos iš eilės</p>` : ""}
      </div>
    `;
    topbarEl.hidden = true;

    const endScreen = screenEl.querySelector(".end-screen");
    if (shownStars > 0) renderConfetti(endScreen);
    playChime();

    if (reward) {
      updateStarsBadge(reward.total_stars);
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

    // Plain outbound link to a Spotify search — nothing is embedded or bundled.
    endScreen.appendChild(
      el(
        `<a class="btn btn-secondary" href="https://open.spotify.com/search/Scoop%20Conor%20Price%20Nic%20D" target="_blank" rel="noopener">🎵 Švęsk su Scoop</a>`
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
      const { data, error } = await client.from("progress").select("total_stars").eq("id", 1).single();
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
    let taskSets = [];
    try {
      const { data, error } = await client
        .from("task_sets")
        .select("*")
        .eq("scheduled_date", today);
      if (error) throw error;
      taskSets = data || [];
    } catch (e) {
      screenEl.innerHTML = `<p class="empty">Nepavyko įkelti užduočių. Patikrink interneto ryšį.</p>`;
      return;
    }

    await flushAbandonedSessions(new Set(taskSets.map((t) => t.id)));

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
