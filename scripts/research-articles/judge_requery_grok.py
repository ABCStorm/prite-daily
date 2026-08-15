#!/usr/bin/env python3
"""
LLM-judge residual re-query batches via xAI Grok (subscription or API key).

Credential resolution (first hit wins):
  1. XAI_API_KEY / GROK_API_KEY env
  2. Same keys in project .env.local
  3. Grok CLI subscription token from ~/.grok/auth.json (your logged-in Grok plan)

Usage:
  python3 scripts/research-articles/judge_requery_grok.py \
    --gap-dir reference/research-articles/requery_s2_gap_v4

  # resume: skips batches that already have results
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
XAI_BASE = "https://api.x.ai/v1"
DEFAULT_MODEL = "grok-4.5"


def _load_xai_token() -> tuple[str, str]:
    """Return (token, source_label)."""
    for name in ("XAI_API_KEY", "GROK_API_KEY"):
        v = (os.environ.get(name) or "").strip()
        if v:
            return v, name

    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, val = line.split("=", 1)
            k = k.strip()
            if k in ("XAI_API_KEY", "GROK_API_KEY"):
                val = val.strip().strip("'\"")
                if val:
                    return val, f".env.local:{k}"

    # Grok Build / CLI subscription session (OIDC access token)
    auth_path = Path.home() / ".grok" / "auth.json"
    if auth_path.exists():
        try:
            auth = json.loads(auth_path.read_text())
        except Exception as e:
            raise SystemExit(f"can't read {auth_path}: {e}") from e
        best = None
        for entry in auth.values():
            if not isinstance(entry, dict):
                continue
            key = (entry.get("key") or "").strip()
            if not key:
                continue
            exp = entry.get("expires_at") or ""
            best = (key, exp)
            # prefer non-expired if we can parse later; for now take first with key
            break
        if best:
            return best[0], f"~/.grok/auth.json (subscription token, expires {best[1] or '?'})"

    raise SystemExit(
        "No Grok/xAI credential found. Log in with `grok` CLI, or set XAI_API_KEY "
        "in the environment / .env.local."
    )


SYSTEM = """You grade candidate research papers for a psychiatry board-exam app (PRITE Daily).

Each question has stem, correct answer, a short teaching explanation, and up to ~18 real MEDLINE candidates (pmid/title/abstract/journal). The keyword scorer that ranked them is often wrong — look past shared vocabulary.

GOAL: Attach one useful further-reading paper per question whenever that is remotely honest.
- Prefer "relevant" when title+abstract specifically support the tested fact.
- Use "weak" when the paper is in the right clinical area and a resident would legitimately benefit from reading it for this item, even if it doesn't nail every detail.
- Use no_match only when every candidate is off-topic, wrong disease/drug fact, or would mislead a board examinee.

Never invent a pmid. Only pick from the given candidates. One pick max per question.
Deprioritize demote-tier journals (Frontiers/MDPI/Cureus/Hindawi) unless nothing better exists and they are truly on point.

Return ONLY valid JSON:
{
  "batch_index": <int>,
  "verdicts": [
    {"id": "...", "no_match": false, "pmid": "...", "rating": "relevant"|"weak",
     "relevance_sentence": "One clinical sentence for a resident."},
    {"id": "...", "no_match": true}
  ]
}
Exactly one verdict per question, same order as input.
"""


def slim_batch(batch: dict) -> dict:
    qs = []
    for q in batch.get("questions") or []:
        cands = []
        for c in (q.get("candidates") or [])[:18]:
            cands.append(
                {
                    "pmid": c.get("pmid"),
                    "title": c.get("title"),
                    "journal": c.get("journal"),
                    "journal_tier": c.get("journal_tier"),
                    "year": c.get("year"),
                    "abstract": (c.get("abstract") or "")[:450],
                    "score": c.get("score"),
                    "retrieval_source": c.get("retrieval_source"),
                }
            )
        qs.append(
            {
                "id": q.get("id"),
                "stem": (q.get("stem") or "")[:900],
                "answer_letter": q.get("answer_letter"),
                "answer_text": q.get("answer_text"),
                "explanation": (q.get("explanation") or "")[:700],
                "candidates": cands,
            }
        )
    return {"batch_index": batch.get("batch_index"), "questions": qs}


def chat_json(token: str, model: str, user: str, retries: int = 5) -> dict:
    url = f"{XAI_BASE}/chat/completions"
    body = {
        "model": model,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user},
        ],
    }
    data = json.dumps(body).encode("utf-8")
    last: Exception | None = None
    backoff = 2.0
    for _attempt in range(retries):
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            content = payload["choices"][0]["message"]["content"]
            # strip accidental markdown fences
            content = content.strip()
            if content.startswith("```"):
                content = content.strip("`")
                if content.startswith("json"):
                    content = content[4:].strip()
            return json.loads(content)
        except Exception as e:
            last = e
            time.sleep(backoff)
            backoff = min(backoff * 1.6, 45.0)
    raise RuntimeError(f"xAI/Grok failed after retries: {last}")


def validate(batch: dict, verdicts_doc: dict) -> dict:
    ids = [q["id"] for q in batch.get("questions") or []]
    by_id = {v.get("id"): v for v in (verdicts_doc.get("verdicts") or []) if v.get("id")}
    out = []
    for id_ in ids:
        v = by_id.get(id_) or {"id": id_, "no_match": True}
        if not v.get("no_match"):
            pmid = str(v.get("pmid") or "").strip()
            qrec = next(q for q in batch["questions"] if q["id"] == id_)
            cands = {str(c.get("pmid")) for c in (qrec.get("candidates") or [])}
            if not pmid or pmid not in cands:
                v = {"id": id_, "no_match": True}
            else:
                rating = v.get("rating") if v.get("rating") in ("relevant", "weak") else "weak"
                sent = (v.get("relevance_sentence") or "").strip() or "Related further reading for this item."
                v = {
                    "id": id_,
                    "no_match": False,
                    "pmid": pmid,
                    "rating": rating,
                    "relevance_sentence": sent,
                }
        else:
            v = {"id": id_, "no_match": True}
        out.append(v)
    return {"batch_index": batch.get("batch_index"), "verdicts": out, "judge": "grok"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gap-dir", type=Path, required=True)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--limit", type=int, default=0, help="Max batches this run (0=all pending)")
    ap.add_argument("--sleep", type=float, default=0.3, help="Pause between batches")
    args = ap.parse_args()

    gap = args.gap_dir if args.gap_dir.is_absolute() else ROOT / args.gap_dir
    bdir = gap / "batches"
    rdir = gap / "results"
    rdir.mkdir(parents=True, exist_ok=True)
    token, src = _load_xai_token()
    print(f"credential: {src}", file=sys.stderr)
    print(f"model: {args.model} via {XAI_BASE}", file=sys.stderr)

    batches = sorted(bdir.glob("batch_*.json"))
    if not batches:
        print(f"no batches in {bdir} yet — wait for re-query to finish writing them", file=sys.stderr)
        return 1

    pending = [bp for bp in batches if not (rdir / bp.name).exists()]
    if args.limit:
        pending = pending[: args.limit]
    print(f"pending batches: {len(pending)} (of {len(batches)})", file=sys.stderr)

    matched = weak = none = 0
    for i, bp in enumerate(pending, 1):
        batch = json.loads(bp.read_text())
        slim = slim_batch(batch)
        n_q = len(slim["questions"])
        user = (
            f"Judge this residual re-query batch ({n_q} questions). "
            f"Aim for one useful paper per question when remotely honest.\n\n"
            + json.dumps(slim, ensure_ascii=False)
        )
        try:
            raw = chat_json(token, args.model, user)
            doc = validate(batch, raw)
        except Exception as e:
            print(f"  FAIL {bp.name}: {e}", file=sys.stderr)
            continue
        (rdir / bp.name).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
        for v in doc["verdicts"]:
            if v.get("no_match"):
                none += 1
            elif v.get("rating") == "relevant":
                matched += 1
            else:
                weak += 1
        print(
            f"  {i}/{len(pending)} {bp.name}: "
            f"rel={sum(1 for v in doc['verdicts'] if not v.get('no_match') and v.get('rating')=='relevant')} "
            f"weak={sum(1 for v in doc['verdicts'] if not v.get('no_match') and v.get('rating')=='weak')} "
            f"none={sum(1 for v in doc['verdicts'] if v.get('no_match'))}",
            file=sys.stderr,
        )
        time.sleep(args.sleep)

    print(
        f"done this run: relevant={matched} weak={weak} no_match={none} "
        f"keep_rate={(matched+weak)/max(1,matched+weak+none):.1%}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
