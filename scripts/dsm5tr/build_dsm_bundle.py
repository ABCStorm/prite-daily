#!/usr/bin/env python3
"""Build gated client bundle for DSM page reader (uploaded as dsm-refs.json on R2)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WINDOWS = ROOT / "reference" / "dsm5tr" / "page_windows.json"
OUT = ROOT / "reference" / "dsm5tr" / "dsm_refs_bundle.json"
OUT_PUBLIC = ROOT / "public" / "data" / "dsm_refs.json"  # public slim index (metadata only; images gated)


def main() -> int:
    data = json.loads(WINDOWS.read_text())
    windows = data.get("windows") or {}
    bundle: dict[str, dict] = {}
    for id_, w in windows.items():
        bundle[id_] = {
            "section_title": w["section_title"],
            "section_kind": w.get("section_kind"),
            "chapter_title": w.get("chapter_title"),
            "book": w.get("book"),
            "why": w.get("why"),
            # Page indices into OUR PDF only — UI must not treat as printed page cites
            "page": w["page"],
            "lo": w["lo"],
            "hi": w["hi"],
            "atStart": w.get("atStart", True),
            "atEnd": w.get("atEnd", False),
        }
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + "\n")
    # Also keep a public metadata-only copy (no change in shape for existing loaders
    # that haven't switched to Worker yet — page fields included for pager).
    OUT_PUBLIC.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"bundle questions={len(bundle)} -> {OUT}", file=sys.stderr)
    print(f"also wrote {OUT_PUBLIC}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
