#!/usr/bin/env python3
"""Deprecated entrypoint — residual batch judging uses Grok/xAI, not OpenAI.

Redirects to judge_requery_grok.py (same CLI flags).
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

print(
    "note: judge_requery_openai.py now uses Grok (xAI). Prefer:\n"
    "  python3 scripts/research-articles/judge_requery_grok.py ...",
    file=sys.stderr,
)
sys.argv[0] = str(Path(__file__).with_name("judge_requery_grok.py"))
runpy.run_path(str(Path(__file__).with_name("judge_requery_grok.py")), run_name="__main__")
