#!/usr/bin/env python3
"""
Match AnKing / AnkiHub Extra images and Sketchy images to PRITE Daily questions.

Sources (user-provided .apkg exports + local Anki collection.media):
  - step 1 psych / neuro with sketchy images.apkg
  - step 2 neuro / notes with sketchy images.apkg

Writes:
  enrichment/anking-images/notes_catalog.json   — de-duplicated AnKing notes
  enrichment/anking-images/matches.json         — question_id -> match metadata
  enrichment/anking-images/media/               — hardlinked/copied image files used by matches
  and patches extraction/output/questions_all.json with:
    anking_images:  [filename, ...]   # Extra / AnKing / AnkiHub diagrams
    sketchy_images: [filename, ...]   # Sketchy / Sketchy 2 / Sketchy Extra
    anking_match:   { note_id, score, text_preview, source_deck }  (optional debug)

Usage:
  python3 scripts/anking-images/extract_and_match.py
  python3 scripts/anking-images/extract_and_match.py --sample 20
  python3 scripts/anking-images/extract_and_match.py --min-score 8 --max-per-q 3
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from rank_bm25 import BM25Okapi

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "enrichment" / "anking-images"
MEDIA_OUT = OUT / "media"
QUESTIONS = ROOT / "extraction" / "output" / "questions_all.json"

ANKI_MEDIA = Path.home() / "Library/Application Support/Anki2/Andrew's Macbook Pro profile/collection.media"

APKGS = [
    Path.home() / "Downloads/step 1 psych with sketchy images.apkg",
    Path.home() / "Downloads/step 1 neuro with sketchy images.apkg",
    Path.home() / "Downloads/step 2 neuro with sketchy images.apkg",
    Path.home() / "Downloads/step 2 notes with sketchy images.apkg",
]

# AnKing Overhaul field order
FIELD_NAMES = [
    "Text", "Extra", "Lecture Notes", "Missed Questions", "Pathoma",
    "Boards and Beyond", "First Aid", "Sketchy", "Sketchy 2", "Sketchy Extra",
    "Picmonic", "Pixorize", "Physeo", "Bootcamp", "OME", "Additional Resources",
    "One by one", "ankihub_id",
]
EXTRA_IDX = FIELD_NAMES.index("Extra")
SKETCHY_IDXS = [FIELD_NAMES.index(n) for n in ("Sketchy", "Sketchy 2", "Sketchy Extra")]
# First Aid images are AnKing-adjacent diagrams many cards carry — fold into anking_images
FA_IDX = FIELD_NAMES.index("First Aid")

IMG_RE = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.I)
CLOZE_RE = re.compile(r"\{\{c\d+::(.*?)(?:::[^}]*)?\}\}", re.S)
HTML_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
NONWORD = re.compile(r"[^a-z0-9+\-]+")

# Skip decorative / brand / UI icons from media packs
SKIP_IMG_PREFIXES = (
    "_anking", "_AnKing", "_sketchy", "_pathoma", "_b&b", "_first-aid",
    "_picmonic", "_pixorize", "_physeo", "_bootcamp", "_omelogo", "_OME",
    "_AnKingIcon",
)
SKIP_IMG_NAMES = {
    "paste-0.png", "icon.png",
}

STOP = {
    "the", "a", "an", "of", "to", "in", "for", "and", "or", "is", "are", "was",
    "were", "be", "been", "being", "with", "by", "on", "at", "from", "as", "that",
    "this", "these", "those", "it", "its", "their", "his", "her", "which", "who",
    "what", "when", "where", "how", "why", "than", "then", "also", "not", "no",
    "yes", "can", "may", "might", "should", "would", "could", "will", "do", "does",
    "did", "has", "have", "had", "most", "more", "less", "very", "into", "about",
    "over", "under", "between", "after", "before", "during", "patient", "patients",
    "following", "best", "least", "likely", "common", "cause", "due", "associated",
    "treatment", "disorder", "disorders", "syndrome", "symptoms", "symptom",
    "year", "old", "man", "woman", "male", "female", "history", "presents",
    "including", "include", "such", "via", "per", "versus", "vs", "eg", "ie",
    "div", "span", "br", "img", "src", "style", "font", "size", "rem", "width",
    "height", "class", "true", "false", "none", "null",
}


def strip_html(s: str) -> str:
    s = CLOZE_RE.sub(r"\1", s or "")
    s = HTML_RE.sub(" ", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return WS_RE.sub(" ", s).strip()


def tokenize(s: str) -> list[str]:
    s = strip_html(s).lower()
    toks = [t for t in NONWORD.split(s) if len(t) > 2 and t not in STOP]
    return toks


def extract_imgs(html: str) -> list[str]:
    out = []
    for src in IMG_RE.findall(html or ""):
        name = src.split("?")[0].split("/")[-1].strip()
        if not name or name.startswith("data:"):
            continue
        low = name.lower()
        if any(name.startswith(p) or low.startswith(p.lower()) for p in SKIP_IMG_PREFIXES):
            continue
        if name in SKIP_IMG_NAMES:
            continue
        # skip tiny brand icons by extension+name heuristics
        if low.endswith((".svg",)) and name.startswith("_"):
            continue
        out.append(name)
    # preserve order, unique
    seen = set()
    uniq = []
    for n in out:
        if n not in seen:
            seen.add(n)
            uniq.append(n)
    return uniq


def extract_col(apkg: Path, out_db: Path) -> None:
    with zipfile.ZipFile(apkg) as z:
        names = set(z.namelist())
        if "collection.anki21b" in names:
            zst = out_db.with_suffix(".anki21b.zst")
            zst.write_bytes(z.read("collection.anki21b"))
            subprocess.check_call(
                ["zstd", "-d", "-f", str(zst), "-o", str(out_db)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            zst.unlink(missing_ok=True)
        elif "collection.anki2" in names:
            out_db.write_bytes(z.read("collection.anki2"))
        else:
            raise RuntimeError(f"No collection in {apkg}")


def load_notes_from_apkg(apkg: Path, work: Path) -> list[dict]:
    db = work / (apkg.stem.replace(" ", "_") + ".db")
    extract_col(apkg, db)
    conn = sqlite3.connect(str(db))
    cur = conn.cursor()
    notes = []
    for nid, guid, mid, tags, flds in cur.execute(
        "SELECT id, guid, mid, tags, flds FROM notes"
    ):
        if mid != 1659130414530:
            # only AnKing Overhaul
            continue
        parts = flds.split("\x1f")
        while len(parts) < len(FIELD_NAMES):
            parts.append("")
        text = parts[0]
        extra_imgs = extract_imgs(parts[EXTRA_IDX])
        # FA diagrams are part of AnKing resource layer — include with Extra
        fa_imgs = extract_imgs(parts[FA_IDX])
        anking_imgs = []
        seen = set()
        for n in extra_imgs + fa_imgs:
            if n not in seen:
                seen.add(n)
                anking_imgs.append(n)
        sketchy_imgs = []
        seen_s = set()
        for idx in SKETCHY_IDXS:
            for n in extract_imgs(parts[idx]):
                if n not in seen_s:
                    seen_s.add(n)
                    sketchy_imgs.append(n)
        if not anking_imgs and not sketchy_imgs:
            continue
        plain = strip_html(text)
        if len(plain) < 12:
            continue
        ankihub = (parts[17] if len(parts) > 17 else "").strip()
        notes.append({
            "note_id": nid,
            "guid": guid,
            "ankihub_id": ankihub,
            "source_deck": apkg.name,
            "tags": tags.strip(),
            "text": plain,
            "text_html": text[:500],
            "anking_images": anking_imgs,
            "sketchy_images": sketchy_imgs,
            "tokens": tokenize(plain),
        })
    conn.close()
    return notes


def dedupe_notes(notes: list[dict]) -> list[dict]:
    """Prefer notes that have both image types; key by ankihub_id else guid else text hash."""
    by_key: dict[str, dict] = {}
    for n in notes:
        key = n["ankihub_id"] or n["guid"] or hashlib.md5(n["text"].encode()).hexdigest()
        prev = by_key.get(key)
        if not prev:
            by_key[key] = n
            continue
        # merge images
        for field in ("anking_images", "sketchy_images"):
            seen = set(prev[field])
            for img in n[field]:
                if img not in seen:
                    prev[field].append(img)
                    seen.add(img)
        # keep longer text / richer tags
        if len(n["text"]) > len(prev["text"]):
            prev["text"] = n["text"]
            prev["tokens"] = n["tokens"]
        if len(n["tags"]) > len(prev["tags"]):
            prev["tags"] = n["tags"]
        prev["source_deck"] = prev["source_deck"] + " | " + n["source_deck"]
    return list(by_key.values())


def domain_boost(note_tags: str, q_cat: str | None) -> float:
    t = (note_tags or "").lower()
    c = (q_cat or "").lower()
    psych_tags = any(x in t for x in ("psychiatry", "psych::", "behavioral", "personality", "mood", "anxiety", "psychosis", "substance"))
    neuro_tags = any(x in t for x in ("neuro", "neurolog", "anatomy", "cns", "stroke", "seizure", "neuropath"))
    psych_q = c in ("psychopathology", "somatic_tx", "psychotherapy", "behavioral_sci", "development", "diagnostics", "practice_issues")
    neuro_q = c in ("neuro_sci", "neurology", "neurosciences")
    if psych_tags and psych_q:
        return 1.15
    if neuro_tags and neuro_q:
        return 1.15
    if psych_tags and neuro_q:
        return 0.85
    if neuro_tags and psych_q:
        return 0.9
    return 1.0


def entity_overlap(q: dict, note_text: str) -> list[str]:
    """Shared clinical entities between question tags/answer and AnKing text."""
    hay = note_text.lower()
    hits = []
    entities = []
    tags = q.get("tags") or {}
    if isinstance(tags, dict):
        for k in ("medication", "diagnosis", "neuro", "psychotherapy", "topic"):
            for v in tags.get(k) or []:
                entities.append(str(v).replace("-", " ").lower())
    for v in (q.get("answer_text") or "").split("/"):
        v = v.strip().lower()
        if len(v) >= 4:
            entities.append(v)
    # significant stem bigrams of answer
    for ent in entities:
        if len(ent) < 4:
            continue
        if ent in hay:
            hits.append(ent)
            continue
        # token-wise: require all content tokens of multiword entity
        parts = [p for p in ent.split() if p not in STOP and len(p) > 2]
        if len(parts) >= 2 and all(p in hay for p in parts):
            hits.append(ent)
        elif len(parts) == 1 and parts[0] in hay and len(parts[0]) >= 5:
            hits.append(ent)
    # unique
    seen = set()
    out = []
    for h in hits:
        if h not in seen:
            seen.add(h)
            out.append(h)
    return out


def question_blob(q: dict) -> str:
    """Compact query: stem + answer + tags only.

    Including full explanations made BM25 latch onto common medical words
    (treatment, patient, risk) and pair unrelated cards. Keep the query tight.
    """
    parts = [
        q.get("stem") or "",
        q.get("answer_text") or "",
        q.get("video_query") or "",
    ]
    tags = q.get("tags") or {}
    if isinstance(tags, dict):
        for k in ("medication", "diagnosis", "neuro", "psychotherapy", "topic"):
            for v in tags.get(k) or []:
                parts.append(str(v).replace("-", " "))
    return " ".join(parts)


def jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def answer_tokens(q: dict) -> list[str]:
    return tokenize(q.get("answer_text") or "")


def ensure_media(name: str) -> bool:
    """Hardlink or copy a media file into MEDIA_OUT. Return True if available."""
    dest = MEDIA_OUT / name
    if dest.exists() and dest.stat().st_size > 0:
        return True
    src = ANKI_MEDIA / name
    if not src.exists():
        # try case-insensitive / common variants — skip
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.link(src, dest)
    except OSError:
        try:
            shutil.copy2(src, dest)
        except OSError:
            return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0, help="print N sample matches (still writes matches.json)")
    ap.add_argument("--min-score", type=float, default=12.0, help="minimum BM25*boost score to keep a match")
    ap.add_argument("--min-jaccard", type=float, default=0.08, help="min token Jaccard(stem+answer, note)")
    ap.add_argument("--max-per-q", type=int, default=2, help="max AnKing notes per question")
    ap.add_argument("--require-entity", action="store_true", default=True)
    ap.add_argument("--no-require-entity", action="store_false", dest="require_entity")
    ap.add_argument("--write-questions", action="store_true", default=True)
    ap.add_argument("--no-write-questions", action="store_false", dest="write_questions")
    ap.add_argument("--skip-extract", action="store_true", help="reuse notes_catalog.json")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    MEDIA_OUT.mkdir(parents=True, exist_ok=True)
    work = OUT / "_work"
    work.mkdir(exist_ok=True)

    # --- extract ---
    catalog_path = OUT / "notes_catalog.json"
    if args.skip_extract and catalog_path.exists():
        print(f"Loading catalog from {catalog_path}")
        catalog = json.loads(catalog_path.read_text())
        notes = []
        for n in catalog:
            n = dict(n)
            n["tokens"] = tokenize(n["text"])
            notes.append(n)
    else:
        all_notes: list[dict] = []
        for apkg in APKGS:
            if not apkg.exists():
                print(f"WARN missing apkg: {apkg}", file=sys.stderr)
                continue
            print(f"Extracting {apkg.name}…")
            batch = load_notes_from_apkg(apkg, work)
            print(f"  {len(batch)} notes with images")
            all_notes.extend(batch)

        notes = dedupe_notes(all_notes)
        print(f"Deduped to {len(notes)} unique notes")
        catalog = [{k: v for k, v in n.items() if k != "tokens"} for n in notes]
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=1))

    if not notes:
        print("No notes found", file=sys.stderr)
        return 1

    # --- BM25 index ---
    corpus = [n["tokens"] for n in notes]
    bm25 = BM25Okapi(corpus)

    qs = json.loads(QUESTIONS.read_text())
    print(f"Matching against {len(qs)} questions…")

    matches: dict[str, dict] = {}
    stats = Counter()
    sample_rows = []

    for q in qs:
        qid = f"{q['year']}-{q['q_index']}"
        q_tokens = tokenize(question_blob(q))
        ans_toks = answer_tokens(q)
        if len(q_tokens) < 4:
            stats["skip_short"] += 1
            continue
        scores = bm25.get_scores(q_tokens)
        # top candidates
        top_idx = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:40]
        candidates = []
        for i in top_idx:
            raw = float(scores[i])
            if raw < 2.0:
                continue
            n = notes[i]
            boost = domain_boost(n["tags"], q.get("prite_category"))
            jac = jaccard(q_tokens, n["tokens"])
            # answer-token hit rate: share of answer tokens present in note
            ans_hit = 0.0
            if ans_toks:
                ans_hit = sum(1 for t in ans_toks if t in set(n["tokens"])) / len(ans_toks)
            ents = entity_overlap(q, n["text"])
            score = raw * boost * (1.0 + 1.5 * jac) * (1.0 + ans_hit)

            # Hard gates for precision (false positives are worse than empty slots)
            note_tok_set = set(n["tokens"])
            shared = set(q_tokens) & note_tok_set
            # Drop ultra-generic shared-only pairs
            if len(shared) < 2 and not ents:
                continue

            distinctive_ans = [t for t in ans_toks if len(t) >= 5]
            ans_in_note = any(t in note_tok_set for t in distinctive_ans) if distinctive_ans else False

            # Quality tiers (any one is enough):
            #  A) strong lexical overlap on the question itself
            #  B) answer key terms appear in the card AND decent overall overlap
            #  C) entity hit AND answer token present AND minimal jaccard
            tier_a = jac >= max(args.min_jaccard, 0.14) and len(shared) >= 3
            tier_b = ans_hit >= 0.5 and jac >= 0.10 and ans_in_note
            tier_c = bool(ents) and ans_in_note and jac >= 0.08 and len(shared) >= 3
            tier_d = bool(ents) and jac >= 0.16 and len(shared) >= 4  # tag entity + strong text
            if not (tier_a or tier_b or tier_c or tier_d):
                continue
            if score < args.min_score:
                continue

            candidates.append({
                "note_id": n["note_id"],
                "ankihub_id": n["ankihub_id"],
                "guid": n["guid"],
                "score": round(score, 3),
                "bm25": round(raw, 3),
                "jaccard": round(jac, 3),
                "ans_hit": round(ans_hit, 3),
                "entities": ents,
                "text_preview": n["text"][:180],
                "source_deck": n["source_deck"].split(" | ")[0],
                "anking_images": n["anking_images"],
                "sketchy_images": n["sketchy_images"],
            })

        candidates.sort(key=lambda c: c["score"], reverse=True)
        # Keep only notes within 65% of the top score (avoid stuffing a 2nd weak card)
        chosen = []
        if candidates:
            top_s = candidates[0]["score"]
            for c in candidates:
                if c["score"] >= top_s * 0.65:
                    chosen.append(c)
                if len(chosen) >= args.max_per_q:
                    break

        if not chosen:
            stats["no_match"] += 1
            continue

        # merge images across chosen notes (cap per type so UI isn't flooded)
        anking, sketchy = [], []
        seen_a, seen_s = set(), set()
        for c in chosen:
            for img in c["anking_images"]:
                if img not in seen_a:
                    seen_a.add(img)
                    anking.append(img)
            for img in c["sketchy_images"]:
                if img not in seen_s:
                    seen_s.add(img)
                    sketchy.append(img)
        anking = anking[:6]
        sketchy = sketchy[:6]

        # verify media exists (filter missing)
        anking_ok = [i for i in anking if ensure_media(i)]
        sketchy_ok = [i for i in sketchy if ensure_media(i)]
        missing = (len(anking) - len(anking_ok)) + (len(sketchy) - len(sketchy_ok))
        if missing:
            stats["missing_media"] += missing
        if not anking_ok and not sketchy_ok:
            stats["no_media"] += 1
            continue

        matches[qid] = {
            "notes": chosen,
            "anking_images": anking_ok,
            "sketchy_images": sketchy_ok,
            "top_score": chosen[0]["score"],
            "entities": chosen[0]["entities"],
            "jaccard": chosen[0]["jaccard"],
            "ans_hit": chosen[0]["ans_hit"],
        }
        stats["matched"] += 1
        if anking_ok:
            stats["with_anking"] += 1
        if sketchy_ok:
            stats["with_sketchy"] += 1
        if args.sample and len(sample_rows) < args.sample:
            sample_rows.append((qid, q.get("stem", "")[:100], chosen[0], anking_ok[:3], sketchy_ok[:3]))

    print("Stats:", dict(stats))
    print(f"Questions with matches: {len(matches)}")
    print(f"Media files staged: {sum(1 for _ in MEDIA_OUT.iterdir())}")

    (OUT / "matches.json").write_text(json.dumps(matches, ensure_ascii=False, indent=1))
    (OUT / "match_stats.json").write_text(json.dumps(dict(stats), indent=2))

    if sample_rows:
        print("\n=== SAMPLE MATCHES ===")
        for qid, stem, c, a, s in sample_rows:
            print(f"\n{qid} score={c['score']} ents={c['entities']}")
            print(f"  Q: {stem}")
            print(f"  AnKing: {c['text_preview'][:120]}")
            print(f"  anking imgs: {a}")
            print(f"  sketchy imgs: {s}")
        if args.sample and not args.write_questions:
            return 0

    if args.write_questions:
        print("Patching questions_all.json…")
        n_a = n_s = 0
        for q in qs:
            qid = f"{q['year']}-{q['q_index']}"
            m = matches.get(qid)
            if not m:
                # clear prior if re-running
                q.pop("anking_images", None)
                q.pop("sketchy_images", None)
                q.pop("anking_match", None)
                continue
            if m["anking_images"]:
                q["anking_images"] = m["anking_images"]
                n_a += 1
            else:
                q.pop("anking_images", None)
            if m["sketchy_images"]:
                q["sketchy_images"] = m["sketchy_images"]
                n_s += 1
            else:
                q.pop("sketchy_images", None)
            # compact match meta for debugging / UI caption
            top = m["notes"][0]
            q["anking_match"] = {
                "score": top["score"],
                "text_preview": top["text_preview"],
                "entities": top["entities"],
                "source_deck": top["source_deck"],
                "ankihub_id": top.get("ankihub_id") or None,
            }
        QUESTIONS.write_text(json.dumps(qs, ensure_ascii=False, separators=(",", ":")))
        print(f"Wrote fields: {n_a} with anking_images, {n_s} with sketchy_images")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
