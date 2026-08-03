import React, { useEffect, useMemo, useState } from "react";
import { X, Download, RefreshCw, Users, Activity, BookOpen, Mic2, AlertTriangle } from "lucide-react";
import {
  fetchAdminUsageDashboard,
  quietUsersCsv,
  type UsageDashboard,
  type UsageDay,
  type UsageLevel,
} from "./lib/adminUsage";

/* Admin-only residency usage dashboard. Engagement volume only — no accuracy /
   correctness scores (those stay personal). Pure SVG charts, no chart lib. */

const C = {
  ink: "#1b1e2b",
  inkSoft: "#252a3a",
  inkLine: "#33384b",
  text: "#e7eaf0",
  muted: "#9aa0ab",
  faint: "#6b7280",
  teal: "#2dd4bf",
  gold: "#e8c069",
  wrong: "#e07a5f",
  panel: "#1b1e2b",
  scrim: "rgba(8,10,16,.72)",
};

const RANGES: [number, string][] = [
  [14, "14d"],
  [30, "30d"],
  [90, "90d"],
  [180, "6 mo"],
];

function fmt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

function shortDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const d = Math.floor(ms / 86400000);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 14) return `${d}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

// ---------- charts ----------

function DualLineChart({ days }: { days: UsageDay[] }) {
  const W = 640, H = 200, padL = 36, padR = 12, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxA = Math.max(1, ...days.map((d) => d.total_answers));
  const maxU = Math.max(1, ...days.map((d) => d.active_users));
  const n = Math.max(1, days.length - 1);
  const x = (i: number) => padL + (i / n) * innerW;
  const yA = (v: number) => padT + innerH - (v / maxA) * innerH;
  const yU = (v: number) => padT + innerH - (v / maxU) * innerH;

  const path = (key: "total_answers" | "active_users", yFn: (v: number) => number) =>
    days.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yFn(d[key]).toFixed(1)}`).join(" ");

  const tickEvery = Math.max(1, Math.ceil(days.length / 7));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxHeight: 220 }}>
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padT + innerH * (1 - t);
        return (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke={C.inkLine} strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fill={C.faint} fontSize={10}>
              {Math.round(maxA * t)}
            </text>
          </g>
        );
      })}
      <path d={path("total_answers", yA)} fill="none" stroke={C.teal} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      <path d={path("active_users", yU)} fill="none" stroke={C.gold} strokeWidth={2} strokeDasharray="4 3" strokeLinejoin="round" strokeLinecap="round" />
      {days.map((d, i) =>
        i % tickEvery === 0 || i === days.length - 1 ? (
          <text key={d.day} x={x(i)} y={H - 8} textAnchor="middle" fill={C.faint} fontSize={9.5}>
            {shortDay(d.day)}
          </text>
        ) : null
      )}
      <g transform={`translate(${padL + 8}, ${padT + 4})`}>
        <line x1={0} x2={14} y1={0} y2={0} stroke={C.teal} strokeWidth={2.2} />
        <text x={18} y={3} fill={C.muted} fontSize={10}>Questions answered / day</text>
        <line x1={148} x2={162} y1={0} y2={0} stroke={C.gold} strokeWidth={2} strokeDasharray="4 3" />
        <text x={166} y={3} fill={C.muted} fontSize={10}>People who practiced</text>
      </g>
    </svg>
  );
}

/** Questions answered + participation by training level (volume only). */
function LevelBreakdown({ levels, daysBack }: { levels: UsageLevel[]; daysBack: number }) {
  const rows = levels.filter((l) => l.roster > 0);
  if (!rows.length) return <p style={st.empty}>No roster levels yet.</p>;
  const maxQ = Math.max(1, ...rows.map((r) => r.practice_answers));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={st.secSub}>
        <b style={{ color: C.muted }}>Participation</b> = share of people on that level’s roster who
        answered at least one practice or poll question in the last {daysBack} days.
        Bars show total practice questions answered by that level (not accuracy).
      </p>
      {rows.map((r) => {
        const partPct = r.roster ? Math.round((r.active_in_window / r.roster) * 100) : 0;
        const qPct = Math.round((r.practice_answers / maxQ) * 100);
        return (
          <div key={r.level} style={st.levelBlock}>
            <div style={st.levelTop}>
              <span style={st.levelName}>{r.level}</span>
              <span style={st.levelMeta}>
                <b style={{ color: C.teal }}>{fmt(r.practice_answers)}</b>
                <span style={{ color: C.faint }}> questions</span>
                <span style={{ color: C.inkLine, margin: "0 6px" }}>·</span>
                <span style={{ color: C.gold }}>{r.active_in_window}/{r.roster}</span>
                <span style={{ color: C.faint }}> people ({partPct}%)</span>
              </span>
            </div>
            <div style={st.levelBarTrack} title={`${fmt(r.practice_answers)} practice questions`}>
              <div style={{ ...st.levelBarActive, width: `${qPct}%` }} />
            </div>
            <div style={st.levelSub}>
              <span style={{ color: C.faint }}>
                Participation: {r.active_in_window} of {r.roster} on the roster practiced in this window
                {r.active_7d > 0 ? ` · ${r.active_7d} in the last 7 days` : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label, value, sub, color, icon,
}: {
  label: string; value: React.ReactNode; sub?: string; color?: string; icon?: React.ReactNode;
}) {
  return (
    <div style={st.card}>
      <div style={st.cardTop}>
        {icon && <span style={{ color: color ?? C.teal, display: "flex" }}>{icon}</span>}
        <span style={st.cardLbl}>{label}</span>
      </div>
      <div style={{ ...st.cardNum, color: color ?? C.text }}>{value}</div>
      {sub && <div style={st.cardSub}>{sub}</div>}
    </div>
  );
}

// ---------- main panel ----------

export function AdminUsageDashboard({ onClose }: { onClose: () => void }) {
  const [daysBack, setDaysBack] = useState(90);
  const [data, setData] = useState<UsageDashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (d = daysBack) => {
    setLoading(true);
    setErr(null);
    fetchAdminUsageDashboard(d)
      .then((r) => setData(r))
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(daysBack); }, [daysBack]); // eslint-disable-line react-hooks/exhaustive-deps

  const participation = useMemo(() => {
    if (!data) return null;
    const roster = data.roster.approved || 1;
    const win = Math.round((data.totals.active_users_in_window / roster) * 100);
    const week = Math.round((data.totals.users_7d / roster) * 100);
    return { win, week, roster: data.roster.approved };
  }, [data]);

  const downloadQuiet = () => {
    if (!data?.quiet_users?.length) return;
    const csv = quietUsersCsv(data.quiet_users);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `prite-quiet-users-${daysBack}d.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={st.scrim} onClick={onClose}>
      <div style={st.panel} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={st.head}>
          <div>
            <div style={st.eyebrow}>Admin · residency program</div>
            <div style={st.title}>Usage dashboard</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={st.rangeRow}>
              {RANGES.map(([n, label]) => (
                <button
                  key={n}
                  style={{ ...st.rangeBtn, ...(daysBack === n ? st.rangeBtnOn : {}) }}
                  onClick={() => setDaysBack(n)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button style={st.iconBtn} onClick={() => load()} title="Refresh" disabled={loading}>
              <RefreshCw size={14} strokeWidth={2.3} />
            </button>
            <button style={st.iconBtn} onClick={onClose} title="Close">
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div style={st.body}>
          {loading && !data && <p style={st.empty}>Loading residency usage…</p>}
          {err && (
            <div style={st.errBox}>
              <AlertTriangle size={15} strokeWidth={2.3} />
              <div>
                <b>Couldn’t load the dashboard.</b>
                <div style={{ marginTop: 4, color: C.muted, fontSize: 12.5 }}>{err}</div>
              </div>
            </div>
          )}

          {data && (
            <>
              <p style={{ ...st.secSub, marginTop: 0, marginBottom: 14 }}>
                Counts who is using the app and how much — not how well anyone is scoring.
                <b style={{ color: C.muted }}> “Active” / participation</b> means a person answered at least one
                practice or live-poll question in the period (unique people, not logins).
              </p>

              <div style={st.grid4}>
                <StatCard
                  icon={<Activity size={14} strokeWidth={2.3} />}
                  label="Active today"
                  value={fmt(data.totals.users_today)}
                  sub={`${fmt(data.totals.practice_today)} practice questions today`}
                  color={C.teal}
                />
                <StatCard
                  icon={<Users size={14} strokeWidth={2.3} />}
                  label={`Participating · ${daysBack}d`}
                  value={fmt(data.totals.active_users_in_window)}
                  sub={
                    participation
                      ? `${participation.win}% of ${participation.roster} approved · ${participation.week}% in last 7 days`
                      : undefined
                  }
                  color={C.gold}
                />
                <StatCard
                  icon={<BookOpen size={14} strokeWidth={2.3} />}
                  label="Questions answered"
                  value={fmt(data.totals.practice_in_window + data.totals.poll_in_window)}
                  sub={`${fmt(data.totals.practice_in_window)} practice · ${fmt(data.totals.poll_in_window)} poll votes`}
                  color={C.teal}
                />
                <StatCard
                  icon={<Mic2 size={14} strokeWidth={2.3} />}
                  label="Live poll sessions"
                  value={fmt(data.polls.sessions)}
                  sub={`${fmt(data.polls.votes)} votes · ${fmt(data.polls.voters)} unique voters`}
                />
              </div>

              <div style={st.sec}>
                <div style={st.secHead}>Activity over time</div>
                <p style={st.secSub}>
                  Teal = total questions answered each day (solo practice + poll votes).
                  Gold dashed = how many different people answered something that day.
                  Calendar days use America/New_York.
                </p>
                <DualLineChart days={data.daily} />
              </div>

              <div style={st.sec}>
                <div style={st.secHead}>By training level · last {daysBack}d</div>
                <LevelBreakdown levels={data.by_level} daysBack={daysBack} />
              </div>

              <div style={st.twoCol}>
                <div style={st.sec}>
                  <div style={st.secHead}>Most active · last {daysBack}d</div>
                  <p style={st.secSub}>Ranked by practice questions answered (volume only).</p>
                  {!data.top_users.length ? (
                    <p style={st.empty}>No practice answers in this window.</p>
                  ) : (
                    <div>
                      <div style={{ ...st.tableHead, gridTemplateColumns: "1fr 72px" }}>
                        <span>Person</span>
                        <span style={{ textAlign: "right" }}>Questions</span>
                      </div>
                      {data.top_users.map((u, i) => (
                        <div key={u.name + i} style={{ ...st.tableRow, gridTemplateColumns: "1fr 72px" }}>
                          <span>
                            <b style={{ color: C.text }}>{u.name}</b>
                            <span style={st.pill}>{u.level}</span>
                          </span>
                          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{u.answers}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={st.sec}>
                  <div style={{ ...st.secHead, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span>Quiet or inactive · 14d+</span>
                    {data.quiet_users.length > 0 && (
                      <button style={st.csvBtn} onClick={downloadQuiet} title="Download CSV">
                        <Download size={12} strokeWidth={2.4} /> CSV
                      </button>
                    )}
                  </div>
                  <p style={st.secSub}>
                    Approved members who haven’t answered any practice or poll question in the last 14 days
                    (or ever). For gentle outreach — not a performance score.
                  </p>
                  {!data.quiet_users.length ? (
                    <p style={st.empty}>Everyone’s been active recently 🎉</p>
                  ) : (
                    <div style={{ maxHeight: 280, overflowY: "auto" }}>
                      <div style={{ ...st.tableHead, gridTemplateColumns: "1fr 88px" }}>
                        <span>Person</span>
                        <span style={{ textAlign: "right" }}>Last active</span>
                      </div>
                      {data.quiet_users.map((u, i) => (
                        <div key={u.name + i} style={{ ...st.tableRow, gridTemplateColumns: "1fr 88px" }}>
                          <span>
                            <b style={{ color: C.text }}>{u.name}</b>
                            <span style={st.pill}>{u.level}</span>
                          </span>
                          <span style={{ textAlign: "right", color: C.muted, fontSize: 12.5 }}>
                            {ago(u.last_active)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={st.sec}>
                <div style={st.secHead}>Roster snapshot</div>
                <div style={st.rosterGrid}>
                  {[
                    ["Approved", data.roster.approved],
                    ["R1", data.roster.r1],
                    ["R2", data.roster.r2],
                    ["R3", data.roster.r3],
                    ["R4", data.roster.r4],
                    ["Fellows", data.roster.fellows],
                    ["Faculty", data.roster.faculty],
                    ["Alumni", data.roster.alumni],
                    ["Pending", data.roster.pending],
                    ["All-time practice Qs", data.totals.practice_all_time],
                    ["7d questions", data.totals.practice_7d],
                    ["30d questions", data.totals.practice_30d],
                  ].map(([k, v]) => (
                    <div key={String(k)} style={st.rosterCell}>
                      <div style={st.rosterVal}>{fmt(v as number)}</div>
                      <div style={st.rosterKey}>{k}</div>
                    </div>
                  ))}
                </div>
              </div>

              <p style={{ ...st.foot, marginTop: 8 }}>
                Generated {new Date(data.generated_at).toLocaleString()} · window {data.days_back} days · {data.timezone}.
                Practice and poll activity only — correctness is not shown here.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const st: Record<string, React.CSSProperties> = {
  scrim: {
    position: "fixed", inset: 0, zIndex: 80, background: C.scrim,
    display: "grid", placeItems: "center", padding: 16, overflowY: "auto",
  },
  panel: {
    width: "min(920px, 100%)", maxHeight: "min(92vh, 960px)", overflow: "hidden",
    display: "flex", flexDirection: "column",
    background: C.panel, border: `1px solid ${C.inkLine}`, borderRadius: 18,
    boxShadow: "0 40px 100px -30px rgba(0,0,0,.75)",
  },
  head: {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
    padding: "18px 20px 12px", borderBottom: `1px solid ${C.inkLine}`, flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.teal, fontWeight: 700,
  },
  title: { fontSize: 22, fontWeight: 750, color: C.text, letterSpacing: "-0.02em", marginTop: 2 },
  body: { padding: "16px 20px 22px", overflowY: "auto", flex: 1 },
  rangeRow: { display: "flex", gap: 4, background: C.inkSoft, borderRadius: 10, padding: 3 },
  rangeBtn: {
    border: 0, background: "transparent", color: C.muted, fontSize: 12, fontWeight: 650,
    padding: "6px 10px", borderRadius: 8, cursor: "pointer",
  },
  rangeBtnOn: { background: C.ink, color: C.text },
  iconBtn: {
    border: `1px solid ${C.inkLine}`, background: C.inkSoft, color: C.text,
    width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", cursor: "pointer",
  },
  grid4: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18,
  },
  card: {
    background: C.inkSoft, border: `1px solid ${C.inkLine}`, borderRadius: 14, padding: "12px 14px",
  },
  cardTop: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 },
  cardLbl: { fontSize: 11.5, color: C.muted, fontWeight: 650, letterSpacing: "0.02em" },
  cardNum: { fontSize: 26, fontWeight: 750, letterSpacing: "-0.03em", lineHeight: 1.1 },
  cardSub: { fontSize: 11.5, color: C.faint, marginTop: 4, lineHeight: 1.35 },
  sec: { marginBottom: 18 },
  secHead: {
    fontSize: 13, fontWeight: 750, color: C.text, letterSpacing: "-0.01em", marginBottom: 6,
  },
  secSub: { fontSize: 12, color: C.faint, marginBottom: 10, lineHeight: 1.45 },
  twoCol: {
    display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginBottom: 4,
  },
  empty: { color: C.muted, fontSize: 13, padding: "8px 0" },
  foot: { fontSize: 11.5, color: C.faint, lineHeight: 1.45 },
  levelBlock: { display: "flex", flexDirection: "column", gap: 5 },
  levelTop: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  levelName: { fontSize: 13, fontWeight: 750, color: C.text, minWidth: 48 },
  levelBarTrack: { position: "relative", height: 10, background: C.ink, borderRadius: 6, overflow: "hidden" },
  levelBarActive: { position: "absolute", inset: "0 auto 0 0", background: C.teal, borderRadius: 6, opacity: 0.9, minWidth: 0 },
  levelMeta: { fontSize: 12, color: C.muted, fontVariantNumeric: "tabular-nums" },
  levelSub: { fontSize: 11, lineHeight: 1.35 },
  tableHead: {
    display: "grid", gridTemplateColumns: "1fr 64px", gap: 8,
    fontSize: 10.5, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em",
    padding: "0 0 6px", borderBottom: `1px solid ${C.inkLine}`, marginBottom: 4,
  },
  tableRow: {
    display: "grid", gridTemplateColumns: "1fr 64px", gap: 8, alignItems: "center",
    padding: "7px 0", borderBottom: `1px solid ${C.inkLine}`, fontSize: 13, color: C.muted,
  },
  pill: {
    display: "inline-block", marginLeft: 6, fontSize: 10, fontWeight: 700,
    color: C.faint, background: C.ink, borderRadius: 6, padding: "1px 6px",
    verticalAlign: "middle",
  },
  csvBtn: {
    display: "inline-flex", alignItems: "center", gap: 4, border: `1px solid ${C.inkLine}`,
    background: C.inkSoft, color: C.text, fontSize: 11.5, fontWeight: 650,
    padding: "4px 8px", borderRadius: 8, cursor: "pointer",
  },
  rosterGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8,
  },
  rosterCell: {
    background: C.inkSoft, border: `1px solid ${C.inkLine}`, borderRadius: 12, padding: "10px 10px 8px",
  },
  rosterVal: { fontSize: 18, fontWeight: 750, color: C.text, fontVariantNumeric: "tabular-nums" },
  rosterKey: { fontSize: 10.5, color: C.faint, marginTop: 2 },
  errBox: {
    display: "flex", gap: 10, alignItems: "flex-start",
    background: "rgba(224,122,95,.1)", border: "1px solid rgba(224,122,95,.35)",
    color: C.wrong, borderRadius: 12, padding: "12px 14px", marginBottom: 12, fontSize: 13.5,
  },
};

export default AdminUsageDashboard;
