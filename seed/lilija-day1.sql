-- Lilija reading trainer (SPEC.md §13) — one example set, applied for
-- testing on iPad. Historical bootstrap, like seed/week1.sql — not synced
-- content; scheduled_date here reflects the day it was actually applied.
insert into task_sets (scheduled_date, subject, title, phase, learner, items)
values (
  (now() at time zone 'Europe/Vilnius')::date,
  'lietuviu',
  'Skiemenys ir skaitymas',
  1,
  'lilija',
  '[
    { "id": "sb1", "type": "syllable_build", "prompt": "Sudėk žodį",
      "data": { "syllables": ["pas", "la"], "target": "lapas" },
      "answer": { "word": "lapas" } },
    { "id": "sb2", "type": "syllable_build", "prompt": "Sudėk žodį",
      "data": { "syllables": ["lė", "sau"], "target": "saulė" },
      "answer": { "word": "saulė" } },
    { "id": "sb3", "type": "syllable_build", "prompt": "Sudėk žodį",
      "data": { "syllables": ["nas", "pie"], "target": "pienas" },
      "answer": { "word": "pienas" } },
    { "id": "ra1", "type": "read_aloud",
      "data": {
        "title": "Katė ir pienas",
        "text": "Katė gėrė pieną. Ji buvo laiminga. Saulė šildė kiemą. Vaikai žaidė lauke.",
        "syllables": "Ka-tė gė-rė pie-ną. Ji bu-vo lai-min-ga. Sau-lė šil-dė kie-mą. Vai-kai žai-dė lau-ke.",
        "day": 1
      } },
    { "id": "q1", "type": "choice", "prompt": "Ką gėrė katė?", "passage_ref": "ra1",
      "data": { "options": ["pieną", "arbatą", "vandenį"] },
      "answer": { "index": 0 } },
    { "id": "q2", "type": "choice", "prompt": "Kas žaidė lauke?", "passage_ref": "ra1",
      "data": { "options": ["Katė", "Vaikai", "Saulė"] },
      "answer": { "index": 1 } },
    { "id": "wg1", "type": "word_gap",
      "data": { "sentence": "Katė guli ant ___.", "options": ["stalo", "stalas", "stalą"] },
      "answer": { "index": 0 } }
  ]'::jsonb
)
on conflict (scheduled_date, subject, learner) do update set items = excluded.items, title = excluded.title;
