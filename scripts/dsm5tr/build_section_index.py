#!/usr/bin/env python3
"""
Build DSM-5-TR section index from PDF TOC + classification listing.

Speed: one parallel pass over PDF pages (ThreadPool), then O(1) title lookup
in a page→text map. Avoids O(names × pages) rescans.

Writes reference/dsm5tr/section_index.json
"""
from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "reference" / "dsm5tr" / "DSM-5-TR.pdf"
OUT = ROOT / "reference" / "dsm5tr" / "section_index.json"

WORKERS = 12
SECTION_II_START = 126  # 1-based inclusive
SECTION_II_END = 1104   # exclusive-ish upper bound for criteria chapters


def clean_class_name(s: str) -> str:
    s = s.replace("\xa0", " ").strip()
    s = re.sub(r"[a-c](?:,[a-c])*$", "", s)
    s = re.sub(r"\s+", " ", s).strip(" ,;")
    return s


def aliases_for(title: str) -> list[str]:
    t = title.lower()
    aliases = {t, re.sub(r"\s+disorders?$", "", t).strip()}
    extra = {
        "attention-deficit/hyperactivity disorder": ["adhd", "attention deficit hyperactivity"],
        "autism spectrum disorder": ["asd", "autism spectrum", "autism"],
        "posttraumatic stress disorder": ["ptsd", "post-traumatic stress", "posttraumatic stress"],
        "obsessive-compulsive disorder": ["ocd"],
        "major depressive disorder": ["mdd", "major depression"],
        "persistent depressive disorder": ["dysthymia", "dysthymic"],
        "generalized anxiety disorder": ["gad"],
        "social anxiety disorder": ["social phobia", "social anxiety"],
        "panic disorder": ["panic attack", "panic"],
        "borderline personality disorder": ["bpd", "borderline"],
        "antisocial personality disorder": ["antisocial", "aspd"],
        "schizophrenia": ["schizophrenic"],
        "schizoaffective disorder": ["schizoaffective"],
        "bipolar i disorder": ["bipolar i", "bipolar 1"],
        "bipolar ii disorder": ["bipolar ii", "bipolar 2"],
        "premenstrual dysphoric disorder": ["pmdd"],
        "body dysmorphic disorder": ["bdd", "body dysmorphic"],
        "gender dysphoria": ["gender dysphoria", "gender incongruence"],
        "alcohol use disorder": ["alcohol use", "alcohol dependence", "alcoholism"],
        "opioid use disorder": ["opioid use", "opiate use"],
        "stimulant use disorder": ["stimulant use", "amphetamine use", "cocaine use"],
        "cannabis use disorder": ["cannabis use", "marijuana"],
        "tobacco use disorder": ["tobacco use", "nicotine"],
        "gambling disorder": ["pathological gambling", "gambling"],
        "anorexia nervosa": ["anorexia"],
        "bulimia nervosa": ["bulimia"],
        "binge-eating disorder": ["binge eating"],
        "neuroleptic malignant syndrome": ["nms"],
        "tardive dyskinesia": ["tardive", "td"],
        "medication-induced acute dystonia": ["acute dystonia", "dystonia"],
        "medication-induced acute akathisia": ["akathisia"],
        "delirium": ["delirious"],
        "major neurocognitive disorder": ["dementia", "major ncd"],
        "mild neurocognitive disorder": ["mild cognitive impairment", "mci", "mild ncd"],
        "intellectual developmental disorder": ["intellectual disability", "mental retardation"],
        "tourette's disorder": ["tourette", "tourette's"],
        "oppositional defiant disorder": ["odd", "oppositional defiant"],
        "conduct disorder": ["conduct"],
        "intermittent explosive disorder": ["ied", "intermittent explosive"],
        "somatic symptom disorder": ["somatization", "somatic symptom"],
        "functional neurological symptom disorder": ["conversion disorder", "conversion"],
        "illness anxiety disorder": ["hypochondriasis", "illness anxiety"],
        "factitious disorder": ["factitious", "munchausen"],
        "dissociative identity disorder": ["did", "multiple personality"],
        "acute stress disorder": ["acute stress"],
        "adjustment disorders": ["adjustment disorder"],
        "insomnia disorder": ["insomnia"],
        "narcolepsy": ["narcolepsy"],
        "restless legs syndrome": ["rls", "restless legs"],
        "hoarding disorder": ["hoarding"],
        "trichotillomania": ["hair pulling", "trichotillomania"],
        "excoriation": ["skin picking", "excoriation"],
        "catatonia": ["catatonic"],
        "brief psychotic disorder": ["brief psychotic"],
        "delusional disorder": ["delusional"],
        "schizophreniform disorder": ["schizophreniform"],
        "specific phobia": ["specific phobia", "phobia"],
        "agoraphobia": ["agoraphobia"],
        "separation anxiety disorder": ["separation anxiety"],
        "selective mutism": ["selective mutism"],
        "reactive attachment disorder": ["reactive attachment"],
        "avoidant/restrictive food intake disorder": ["arfid"],
        "pica": ["pica"],
        "enuresis": ["enuresis", "bedwetting"],
        "encopresis": ["encopresis"],
        "paranoid personality disorder": ["paranoid personality"],
        "schizoid personality disorder": ["schizoid"],
        "schizotypal personality disorder": ["schizotypal"],
        "histrionic personality disorder": ["histrionic"],
        "narcissistic personality disorder": ["narcissistic", "npd"],
        "avoidant personality disorder": ["avoidant personality"],
        "dependent personality disorder": ["dependent personality"],
        "obsessive-compulsive personality disorder": ["ocpd"],
    }
    for key, vals in extra.items():
        if key in t or t in key:
            aliases.update(vals)
    return sorted({a for a in aliases if a and len(a) >= 3})


def extract_classification_names(doc: fitz.Document) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    pat = re.compile(r"^([A-Z][^\n(]{3,90}?)\s+\((\d{1,4})\)\s*$")
    for pi in range(40, 91):
        for line in doc[pi].get_text().splitlines():
            line = line.strip().replace("\xa0", " ")
            m = pat.match(line)
            if not m:
                continue
            name = clean_class_name(m.group(1))
            if len(name) < 5 or name in seen:
                continue
            seen.add(name)
            names.append(name)
    return names


def load_page_text(args: tuple[str, int]) -> tuple[int, str]:
    """Worker: open PDF once per page index (1-based page number returned)."""
    pdf_path, page_index0 = args
    doc = fitz.open(pdf_path)
    try:
        return page_index0 + 1, doc[page_index0].get_text()
    finally:
        doc.close()


def parallel_page_texts(pdf_path: str, start0: int, end0: int, workers: int = WORKERS) -> dict[int, str]:
    """Return {1-based page: text} for pages start0..end0-1."""
    jobs = [(pdf_path, i) for i in range(start0, end0)]
    out: dict[int, str] = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = [pool.submit(load_page_text, j) for j in jobs]
        done = 0
        for f in as_completed(futs):
            p1, text = f.result()
            out[p1] = text
            done += 1
            if done % 100 == 0 or done == len(jobs):
                print(f"  pages loaded {done}/{len(jobs)}", file=sys.stderr)
    return out


def first_page_for_title(page_texts: dict[int, str], title: str, lo: int, hi: int) -> int | None:
    variants = [title]
    if title.endswith("s"):
        variants.append(title[:-1])
    # longest first for specificity
    for p1 in range(lo, hi + 1):
        text = page_texts.get(p1)
        if not text:
            continue
        for v in variants:
            if v not in text:
                continue
            for line in text.splitlines():
                ln = line.strip().replace("\xa0", " ")
                if ln == v or (ln.startswith(v) and len(ln) < len(v) + 20):
                    return p1
            return p1
    return None


def main() -> int:
    if not PDF.exists():
        print(f"missing {PDF}", file=sys.stderr)
        return 1
    pdf_path = str(PDF.resolve())
    doc = fitz.open(pdf_path)
    toc = doc.get_toc()
    page_count = doc.page_count

    chapters: list[dict] = []
    for i, (level, title, page) in enumerate(toc):
        title = title.replace("\xa0", " ").strip()
        if level != 2:
            continue
        end = page_count
        for j in range(i + 1, len(toc)):
            if toc[j][0] <= 2:
                end = toc[j][2] - 1
                break
        chapters.append(
            {
                "id": re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_"),
                "title": title,
                "kind": "chapter",
                "pdf_page_start": page,
                "pdf_page_end": max(page, end),
                "aliases": aliases_for(title),
            }
        )

    class_names = extract_classification_names(doc)
    print(f"classification names: {len(class_names)}", file=sys.stderr)
    doc.close()

    # Parallel load Section II pages once
    lo0, hi0 = SECTION_II_START - 1, min(SECTION_II_END, page_count)
    print(f"loading pages {SECTION_II_START}–{hi0} with {WORKERS} workers…", file=sys.stderr)
    page_texts = parallel_page_texts(pdf_path, lo0, hi0, WORKERS)

    # Also load medication adverse-effects range
    med_lo, med_hi = 1067, min(1084, page_count)
    if med_lo not in page_texts:
        page_texts.update(parallel_page_texts(pdf_path, med_lo, med_hi, WORKERS))

    disorders: list[dict] = []
    found = 0
    for i, name in enumerate(class_names, 1):
        page = first_page_for_title(page_texts, name, SECTION_II_START, hi0)
        if page is None:
            short = re.sub(r"\s*\([^)]*\)\s*", " ", name).strip()
            if short != name:
                page = first_page_for_title(page_texts, short, SECTION_II_START, hi0)
        if page is None:
            continue
        found += 1
        parent = None
        for ch in chapters:
            if ch["pdf_page_start"] <= page <= ch["pdf_page_end"]:
                parent = ch["id"]
                break
        disorders.append(
            {
                "id": re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:80],
                "title": name,
                "kind": "disorder",
                "chapter_id": parent,
                "pdf_page_start": page,
                "aliases": aliases_for(name),
            }
        )
        if i % 50 == 0:
            print(f"  located {i}/{len(class_names)} (hits={found})", file=sys.stderr)

    # Explicit movement-disorder targets (high PRITE value)
    for title in (
        "Neuroleptic Malignant Syndrome",
        "Medication-Induced Acute Dystonia",
        "Medication-Induced Acute Akathisia",
        "Tardive Dyskinesia",
        "Antidepressant Discontinuation Syndrome",
    ):
        page = first_page_for_title(page_texts, title, 1068, 1083)
        if not page:
            continue
        disorders.append(
            {
                "id": re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_"),
                "title": title,
                "kind": "disorder",
                "chapter_id": "medication_induced_movement_disorders_and_other_adverse_effects_of_medication",
                "pdf_page_start": page,
                "aliases": aliases_for(title),
            }
        )

    disorders.sort(key=lambda d: (d["pdf_page_start"], d["title"]))
    # dedupe
    uniq: list[dict] = []
    seen: set[str] = set()
    for d in disorders:
        k = f"{d['pdf_page_start']}|{d['title'].lower()}"
        if k in seen:
            continue
        seen.add(k)
        uniq.append(d)
    disorders = uniq

    for i, d in enumerate(disorders):
        if i + 1 < len(disorders):
            d["pdf_page_end"] = max(d["pdf_page_start"], disorders[i + 1]["pdf_page_start"] - 1)
        else:
            d["pdf_page_end"] = 1103
        if d.get("chapter_id"):
            ch = next((c for c in chapters if c["id"] == d["chapter_id"]), None)
            if ch:
                d["pdf_page_end"] = min(d["pdf_page_end"], ch["pdf_page_end"])

    payload = {
        "source": "DSM-5-TR (APA, 2022)",
        "pdf": "reference/dsm5tr/DSM-5-TR.pdf",
        "page_count": page_count,
        "chapters": chapters,
        "disorders": disorders,
        "n_chapters": len(chapters),
        "n_disorders": len(disorders),
        "n_classification_names": len(class_names),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"chapters={len(chapters)} disorders={len(disorders)} -> {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
