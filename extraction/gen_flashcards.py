#!/usr/bin/env python3
"""
From the generated clozes (all_clozes.json) + the questions, produce:
  1. supabase/migrations/0006_flashcards.sql  — load every card into `flashcards`
  2. ~/Downloads/prite-all.apkg               — the full AnKing-format deck
     (Text = cloze, Lecture Notes = original question, subdecks per year)

Usage:
  python gen_flashcards.py
"""
import json, os, html, genanki

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLOZES = json.load(open("/tmp/prite_cards/all_clozes.json"))
QS = {f"{q['year']}-{q['q_index']}": q for q in json.load(open(os.path.join(ROOT, "extraction/output/questions_all.json")))}

# ---- 1. migration ----
def sql_str(s): return "'" + s.replace("'", "''") + "'"
rows = [(qid, cz) for qid, cz in CLOZES.items() if qid in QS]
rows.sort()
parts = ["""-- Load all AI-generated cloze cards into the flashcards table (Text field).
-- The question itself (Lecture Notes) is built from the static question data at
-- export time, so only the cloze is stored here. Re-runnable.
"""]
B = 400
for i in range(0, len(rows), B):
    vals = ",\n".join(f"({sql_str(qid)},{sql_str(cz)},'')" for qid, cz in rows[i:i+B])
    parts.append(
        "insert into flashcards (question_id, cloze_text, extra) values\n" + vals +
        "\non conflict (question_id) do update set cloze_text = excluded.cloze_text, updated_at = now();"
    )
mig = os.path.join(ROOT, "supabase/migrations/0006_flashcards.sql")
open(mig, "w").write("\n".join(parts) + "\n")
print(f"migration: {mig}  ({len(rows)} cards, {os.path.getsize(mig)//1024} KB)")

# ---- 2. full apkg ----
css = open("/tmp/ankiapkg/anking_css.txt").read()
front = open("/tmp/ankiapkg/anking_tmpl_0.txt").read()
back = open("/tmp/ankiapkg/anking_tmpl_1.txt").read()
FIELDS = ['Text','Extra','Lecture Notes','Missed Questions','Pathoma','Boards and Beyond','First Aid',
'Sketchy','Sketchy 2','Sketchy Extra','Picmonic','Pixorize','Physeo','Bootcamp','OME',
'Additional Resources','One by one','ankihub_id']
model = genanki.Model(1659130414530, 'AnKingOverhaul (AnKing Step Deck / AnKingMed)',
    fields=[{'name': f} for f in FIELDS],
    templates=[{'name': 'Cloze', 'qfmt': front, 'afmt': back}], css=css,
    model_type=genanki.Model.CLOZE)

def esc(s): return html.escape(s or "")
def lecture(q):
    opts = "<br>".join(f"{esc(o['letter'])}. {esc(o['text'])}" for o in q['options'])
    return (f"<b>PRITE {q['year']} &middot; Q{q['q_index']}</b><br><br>{esc(q['stem'])}<br><br>"
            f"{opts}<br><br><b>Answer: {esc(q['answer_letter'] or '')} &mdash; {esc(q['answer_text'])}</b>")

decks = {}
def deck_for(year):
    if year not in decks:
        decks[year] = genanki.Deck(2059400000 + int(year), f"PRITE Daily::{year}")
    return decks[year]

n = 0
for qid, cz in sorted(CLOZES.items()):
    q = QS.get(qid)
    if not q: continue
    flds = [cz, '', lecture(q)] + [''] * (len(FIELDS) - 3)
    deck_for(q['year']).add_note(genanki.Note(model=model, fields=flds, guid=f"prite::{qid}"))
    n += 1

out = os.path.expanduser("~/Downloads/prite-all.apkg")
genanki.Package(list(decks.values())).write_to_file(out)
print(f"apkg: {out}  ({n} cards across {len(decks)} year-subdecks, {os.path.getsize(out)//1024} KB)")
