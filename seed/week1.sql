-- Seed: week 1, Monday, matematika (see SPEC.md §10)
-- scheduled_date is the Monday this was first deployed for (2026-09-07).
-- To reseed for a different Monday, change scheduled_date below.

insert into task_sets (scheduled_date, subject, title, phase, items)
values (
  '2026-09-07',
  'matematika',
  'Skaičiaus sandara',
  1,
  '[
    {"id":"w1-mon-1","type":"quick_math","prompt":"2 × 5","data":{"expr":"2 × 5"},"answer":{"value":10}},
    {"id":"w1-mon-2","type":"quick_math","prompt":"10 × 3","data":{"expr":"10 × 3"},"answer":{"value":30}},
    {"id":"w1-mon-3","type":"quick_math","prompt":"5 × 4","data":{"expr":"5 × 4"},"answer":{"value":20}},
    {"id":"w1-mon-4","type":"quick_math","prompt":"2 × 9","data":{"expr":"2 × 9"},"answer":{"value":18}},
    {"id":"w1-mon-5","type":"quick_math","prompt":"10 × 7","data":{"expr":"10 × 7"},"answer":{"value":70}},
    {"id":"w1-mon-6","type":"quick_math","prompt":"5 × 6","data":{"expr":"5 × 6"},"answer":{"value":30}},
    {"id":"w1-mon-7","type":"number_input","prompt":"Kiek ŠIMTŲ skaičiuje 3 507?","data":{"text":"Kiek ŠIMTŲ skaičiuje 3 507?"},"answer":{"value":5}},
    {"id":"w1-mon-8","type":"number_input","prompt":"Kiek DEŠIMČIŲ skaičiuje 4 070?","data":{"text":"Kiek DEŠIMČIŲ skaičiuje 4 070?"},"answer":{"value":7}},
    {"id":"w1-mon-9","type":"number_input","prompt":"Kiek TŪKSTANČIŲ skaičiuje 6 005?","data":{"text":"Kiek TŪKSTANČIŲ skaičiuje 6 005?"},"answer":{"value":6}},
    {"id":"w1-mon-10","type":"number_input","prompt":"Kiek VIENETŲ skaičiuje 999?","data":{"text":"Kiek VIENETŲ skaičiuje 999?"},"answer":{"value":9}},
    {"id":"w1-mon-11","type":"compare","prompt":"Palygink skaičius","data":{"left":2340,"right":2430},"answer":{"sign":"<"}},
    {"id":"w1-mon-12","type":"compare","prompt":"Palygink skaičius","data":{"left":5067,"right":5607},"answer":{"sign":"<"}},
    {"id":"w1-mon-13","type":"compare","prompt":"Palygink skaičius","data":{"left":8990,"right":9089},"answer":{"sign":"<"}},
    {"id":"w1-mon-14","type":"compare","prompt":"Palygink skaičius","data":{"left":4004,"right":4040},"answer":{"sign":"<"}},
    {"id":"w1-mon-15","type":"match","prompt":"Sujunk sąvoką su veiksmu","data":{"left":["SUMA","SKIRTUMAS","SANDAUGA","DALMUO"],"right":["12 + 4","12 − 4","3 × 6","18 : 3"]},"answer":{"pairs":[[0,0],[1,1],[2,2],[3,3]]}},
    {"id":"w1-mon-16","type":"open_schema","prompt":"Laive plaukė 24 keleiviai. Audrų saloje išlipo 8, o įlipo 5 nauji. Kiek keleivių plaukia toliau?","data":{"text":"Laive plaukė 24 keleiviai. Audrų saloje išlipo 8, o įlipo 5 nauji. Kiek keleivių plaukia toliau?","instruction":"Nupiešk schemą sąsiuvinyje, tada įrašyk atsakymą."},"answer":{"value":21}}
  ]'::jsonb
)
on conflict (scheduled_date, subject) do update
  set title = excluded.title, phase = excluded.phase, items = excluded.items;

-- Same Monday, lietuvių kalba: one seeded example of a reading passage
-- (SPEC.md §5.1) with two questions referencing it via passage_ref.
insert into task_sets (scheduled_date, subject, title, phase, items)
values (
  '2026-09-07',
  'lietuviu',
  'Skaitome kartu',
  1,
  '[
    {"id":"p1","type":"passage","data":{"title":"Švyturys","text":"Ant uolėto kranto stovėjo senas švyturys. Kiekvieną vakarą jo šviesa apsukdavo aplink jūrą, kad laivai nepaklystų tamsoje. Šviesa buvo tokia stipri, kad ją matydavo net iš tolimiausių valčių.\n\nŠvyturio prižiūrėtojas gyveno visai vienas. Kiekvieną rytą jis lipdavo bokšto laiptais aukštyn, valydavo stiklą ir tikrindavo lemputę. Vakare, kai saulė nusileisdavo, švyturys vėl pradėdavo šviesti."}},
    {"id":"w1-mon-l1","type":"choice","passage_ref":"p1","prompt":"Kur stovėjo švyturys?","data":{"options":["Miške","Ant uolėto kranto","Lauke prie kelio"]},"answer":{"index":1}},
    {"id":"w1-mon-l2","type":"choice","passage_ref":"p1","prompt":"Ką kiekvieną rytą darydavo prižiūrėtojas?","data":{"options":["Miegodavo visą dieną","Valydavo stiklą ir tikrindavo lemputę","Plaukdavo į jūrą"]},"answer":{"index":1}}
  ]'::jsonb
)
on conflict (scheduled_date, subject) do update
  set title = excluded.title, phase = excluded.phase, items = excluded.items;
