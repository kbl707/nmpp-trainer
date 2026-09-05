(() => {
  "use strict";

  const CONFIG = window.NMPP_CONFIG;
  const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

  const screenEl = document.getElementById("screen");
  const topbarEl = document.getElementById("topbar");
  const progressFillEl = document.getElementById("progress-fill");
  const progressLabelEl = document.getElementById("progress-label");
  const timerEl = document.getElementById("timer");

  const PROGRESS_PREFIX = "nmpp:progress:";
  const SUBJECT_LABELS = { matematika: "Matematika", lietuviu: "Lietuvių kalba", pratimai: "Pratimai" };

  let timerHandle = null;

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
    session.answers.push({
      item_id: item.id,
      answer: answerValue,
      correct: correct,
      seconds,
    });
    persistSession();
  }

  function showRetryThenAdvanceControls(container, onAdvance) {
    const advanceBtn = el(`<button type="button" class="btn">Toliau</button>`);
    advanceBtn.addEventListener("click", onAdvance, { once: true });
    container.appendChild(advanceBtn);
  }

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
        <p class="retry-msg" hidden>Pabandyk dar kartą</p>
        ${renderHintBlock(item)}
      `;
      const list = container.querySelector(".choice-list");
      const retryMsg = container.querySelector(".retry-msg");
      (item.data.options || []).forEach((opt, idx) => {
        const btn = el(`<button type="button" class="option-btn">${escapeHtml(opt)}</button>`);
        btn.addEventListener("click", () => handleChoicePick(idx));
        list.appendChild(btn);
      });
      wireHint(container, item);

      function handleChoicePick(idx) {
        const buttons = Array.from(list.querySelectorAll(".option-btn"));
        buttons.forEach((b) => b.classList.remove("selected"));
        buttons[idx].classList.add("selected");
        session.attempt += 1;
        const isCorrect = item.answer && idx === item.answer.index;
        buttons.forEach((b) => (b.disabled = true));
        if (isCorrect || session.attempt >= 2) {
          finalizeItem(item, { index: idx }, !!isCorrect);
          showRetryThenAdvanceControls(container, nextItem);
        } else {
          retryMsg.hidden = false;
          buttons.forEach((b) => {
            b.disabled = false;
            b.classList.remove("selected");
          });
        }
      }
    },

    compare(container, item) {
      container.innerHTML = `
        <p class="prompt">${item.data.left} &nbsp;&nbsp;?&nbsp;&nbsp; ${item.data.right}</p>
        <div class="compare-row"></div>
        <p class="retry-msg" hidden>Pabandyk dar kartą</p>
        ${renderHintBlock(item)}
      `;
      const row = container.querySelector(".compare-row");
      const retryMsg = container.querySelector(".retry-msg");
      ["<", ">", "="].forEach((sign) => {
        const btn = el(`<button type="button" class="option-btn compare-btn">${sign}</button>`);
        btn.addEventListener("click", () => handlePick(sign, btn));
        row.appendChild(btn);
      });
      wireHint(container, item);

      function handlePick(sign, btn) {
        const buttons = Array.from(row.querySelectorAll(".option-btn"));
        buttons.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        session.attempt += 1;
        const isCorrect = item.answer && sign === item.answer.sign;
        buttons.forEach((b) => (b.disabled = true));
        if (isCorrect || session.attempt >= 2) {
          finalizeItem(item, { sign }, !!isCorrect);
          showRetryThenAdvanceControls(container, nextItem);
        } else {
          retryMsg.hidden = false;
          buttons.forEach((b) => {
            b.disabled = false;
            b.classList.remove("selected");
          });
        }
      }
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
        <p class="retry-msg" hidden>Pabandyk dar kartą</p>
        ${renderHintBlock(item)}
      `;
      const leftCol = container.querySelector('[data-side="left"]');
      const rightCol = container.querySelector('[data-side="right"]');
      const retryMsg = container.querySelector(".retry-msg");
      wireHint(container, item);

      let pairs = []; // [[leftIdx, rightIdx], ...]
      let pendingLeft = null;

      left.forEach((text, idx) => {
        const b = el(`<button type="button" class="match-item">${escapeHtml(text)}</button>`);
        b.dataset.idx = idx;
        b.addEventListener("click", () => onLeftClick(idx, b));
        leftCol.appendChild(b);
      });
      right.forEach((text, idx) => {
        const b = el(`<button type="button" class="match-item">${escapeHtml(text)}</button>`);
        b.dataset.idx = idx;
        b.addEventListener("click", () => onRightClick(idx, b));
        rightCol.appendChild(b);
      });

      function leftButtons() { return Array.from(leftCol.children); }
      function rightButtons() { return Array.from(rightCol.children); }

      function refreshUI() {
        leftButtons().forEach((b) => {
          const idx = Number(b.dataset.idx);
          const isPaired = pairs.some((p) => p[0] === idx);
          b.classList.toggle("paired", isPaired);
          b.classList.toggle("selected", pendingLeft === idx);
        });
        rightButtons().forEach((b) => {
          const idx = Number(b.dataset.idx);
          const isPaired = pairs.some((p) => p[1] === idx);
          b.classList.toggle("paired", isPaired);
        });
        if (pairs.length === left.length && !container.querySelector(".btn:not(.btn-secondary)")) {
          const checkBtn = el(`<button type="button" class="btn">Tikrinti</button>`);
          checkBtn.addEventListener("click", checkPairs, { once: true });
          container.appendChild(checkBtn);
        }
      }

      function onLeftClick(idx, btn) {
        if (btn.classList.contains("paired")) {
          pairs = pairs.filter((p) => p[0] !== idx);
          pendingLeft = null;
          const existingCheckBtn = container.querySelector(".btn");
          if (existingCheckBtn) existingCheckBtn.remove();
          refreshUI();
          return;
        }
        pendingLeft = idx;
        refreshUI();
      }

      function onRightClick(idx, btn) {
        if (btn.classList.contains("paired") || pendingLeft === null) return;
        pairs.push([pendingLeft, idx]);
        pendingLeft = null;
        refreshUI();
      }

      function checkPairs() {
        session.attempt += 1;
        const wanted = (item.answer && item.answer.pairs) || [];
        const wantedSet = new Set(wanted.map((p) => p[0] + ":" + p[1]));
        const gotSet = new Set(pairs.map((p) => p[0] + ":" + p[1]));
        const isCorrect =
          wantedSet.size === gotSet.size && [...wantedSet].every((p) => gotSet.has(p));
        leftButtons().concat(rightButtons()).forEach((b) => (b.disabled = true));
        if (isCorrect || session.attempt >= 2) {
          finalizeItem(item, { pairs }, !!isCorrect);
          showRetryThenAdvanceControls(container, nextItem);
        } else {
          retryMsg.hidden = false;
          pairs = [];
          leftButtons().concat(rightButtons()).forEach((b) => {
            b.disabled = false;
            b.classList.remove("paired", "selected");
          });
        }
      }
    },

    open_schema(container, item) {
      const text = item.prompt || (item.data && item.data.text) || "";
      const instruction = item.data && item.data.instruction;
      const hasNumericAnswer = item.answer && typeof item.answer.value === "number";
      container.innerHTML = `
        <p class="prompt">${escapeHtml(text)}</p>
        ${instruction ? `<p class="instruction">${escapeHtml(instruction)}</p>` : ""}
        ${hasNumericAnswer ? `<input type="number" inputmode="numeric" placeholder="Atsakymas" aria-label="Atsakymas" />` : ""}
        <button type="button" class="btn" data-action="done">Padariau ✔</button>
        ${renderHintBlock(item)}
      `;
      wireHint(container, item);
      const input = container.querySelector("input");
      const doneBtn = container.querySelector('[data-action="done"]');
      doneBtn.addEventListener(
        "click",
        () => {
          let correct = null;
          let answerValue = {};
          if (hasNumericAnswer && input && input.value.trim() !== "") {
            const val = Number(input.value);
            answerValue = { value: val };
            correct = val === item.answer.value;
          }
          doneBtn.disabled = true;
          if (input) input.disabled = true;
          finalizeItem(item, answerValue, correct);
          showRetryThenAdvanceControls(container, nextItem);
        },
        { once: true }
      );
    },

    passage(container, item) {
      container.innerHTML = `
        <h2 class="passage-title">${escapeHtml((item.data && item.data.title) || "")}</h2>
        <div class="passage-body standalone">${paragraphsHtml(item.data && item.data.text)}</div>
      `;
      const btn = el(`<button type="button" class="btn">Toliau</button>`);
      btn.addEventListener(
        "click",
        () => {
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
      <button type="button" class="btn" data-action="check">Tikrinti</button>
      <p class="retry-msg" hidden>Pabandyk dar kartą</p>
      ${renderHintBlock(item)}
    `;
    wireHint(container, item);
    const input = container.querySelector("input");
    const checkBtn = container.querySelector('[data-action="check"]');
    const retryMsg = container.querySelector(".retry-msg");
    input.focus();

    function check() {
      session.attempt += 1;
      const raw = input.value.trim();
      const val = Number(raw);
      const isCorrect = raw !== "" && !Number.isNaN(val) && val === item.answer.value;
      if (isCorrect || session.attempt >= 2) {
        input.disabled = true;
        checkBtn.remove();
        finalizeItem(item, { value: Number.isNaN(val) ? raw : val }, !!isCorrect);
        showRetryThenAdvanceControls(container, nextItem);
      } else {
        retryMsg.hidden = false;
        input.value = "";
        input.focus();
      }
    }

    checkBtn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") check();
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
    stopTimer();
    updateTopbar();
    const duration_seconds = Math.round((Date.now() - session.sessionStartMs) / 1000);
    const correct_count = session.answers.filter((a) => a.correct === true).length;
    const total_autochecked = session.answers.filter((a) => a.correct !== null).length;

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

    screenEl.innerHTML = `
      <div class="end-screen">
        <div class="star">⭐</div>
        <p class="end-title">Šiandien — atlikta!</p>
        <p class="end-score">Teisingai: ${correct_count} iš ${total_autochecked}</p>
      </div>
    `;
    topbarEl.hidden = true;
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

  async function init() {
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
