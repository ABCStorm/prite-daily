# In-practice scenario videos (target: **100**)

## Status
See `progress-100.json` for live counts.

| Piece | Location |
|-------|----------|
| Queue (100 ids) | `queue-100.json` |
| Briefs (hook, scene, motion, script) | `briefs-100.json` |
| Progress / pending | `progress-100.json` |
| Live video registry | `../images/raw-grok2-photo/video-manifest.json` + `src/lib/scenarioVideos.ts` |

## Per-question brief (written before each video)
- **teaching_hook** — memorable concept
- **visual_scene / still_prompt** — ages locked; young resident late 20s
- **motion_prompt** — image→video guide
- **script** — optional ~6s VO when unmuted (`null` if pure visual is better)
- **age_warnings** — e.g. abortion 21yo must never look elderly

## Production loop (with frequent QA)
1. Take next pending id from `progress-100.json`
2. Read its brief in `briefs-100.json`
3. Ensure still ages match stem → generate/fix still if needed
4. **Validate still** (age, scene fit, no text)
5. Generate 6s video from still + motion_prompt
6. Upload still (`/i/…webp`) + video (`/v/…mp4`)
7. Add id to `scenarioVideos.ts`, redeploy when convenient
8. Every ~5–10 items, spot-check live on pritedaily.com

## Quality gates
- Patient age matches stem  
- Resident looks late-20s  
- Scene matches teaching hook  
- No readable text  
- Abortion / peds / geri double-checked  

## Known fix
**2022 Q43** (and 2012 Q242, 2017 Q20): was elderly C-L still; replaced with 21-year-old woman + unique videos.
