import React from "react";
import { BookOpen } from "lucide-react";
import type { ResearchArticle, ResearchRef } from "./researchRefs";
import { DocumentFolderCard, manilaForKey } from "./DocumentFolderCard";

type Theme = {
  text: string;
  muted: string;
  faint: string;
  teal: string;
  tealDeep: string;
  paper: string;
  paperEdge: string;
  [key: string]: string;
};

function isApa(a: ResearchArticle): boolean {
  return a.kind === "apa_chapter" || a.source === "apa_psychiatryonline";
}

function primaryUrl(a: ResearchArticle): string {
  if (isApa(a)) {
    return a.url || a.urls?.psychiatryonline || "#";
  }
  return (
    a.url ||
    a.urls?.pmc ||
    a.urls?.pubmed ||
    (a.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/` : "#")
  );
}

function badges(a: ResearchArticle): string[] {
  const out: string[] = [];
  if (isApa(a)) {
    out.push("APA Publishing");
    out.push("Wright login");
    return out;
  }
  if (a.is_reviewish) out.push("Review / guideline");
  if (a.is_open_access || a.pmcid) out.push("Free full text");
  if (a.year) out.push(String(a.year));
  return out;
}

function articleLinks(a: ResearchArticle): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (isApa(a)) {
    const href = primaryUrl(a);
    if (href && href !== "#") {
      links.push({ label: "Open on PsychiatryOnline (Wright)", href });
    }
    return links;
  }
  if (a.urls?.pubmed) links.push({ label: "PubMed", href: a.urls.pubmed });
  if (a.urls?.pmc) links.push({ label: "Free full text", href: a.urls.pmc });
  if (a.urls?.doi) links.push({ label: "DOI", href: a.urls.doi });
  if (!links.length) {
    const href = primaryUrl(a);
    if (href && href !== "#") links.push({ label: "Open article", href });
  }
  return links;
}

/** Prefer the audited clinical sentence; never show raw matcher meta on the card. */
function clinicalWhy(a: ResearchArticle): string | undefined {
  const candidates = [a.relevance_sentence, a.why].filter(Boolean) as string[];
  for (const s of candidates) {
    const t = s.trim();
    if (!t) continue;
    if (
      /title matches|covers answer concept|keyword match|core journal|review\/guideline|,\s*MEDLINE|citedBy|focus_title|ans_title/i.test(
        t,
      )
    ) {
      continue;
    }
    if (t.length < 28) continue;
    return t;
  }
  return undefined;
}

/** Soft blue-gray palette for textbook/chapter folders (distinct from manila papers). */
const APA_FOLDER = { accent: "#B8C9D9", accentDeep: "#7A94A8", ink: "#1E2F3C" };

function ArticleCard({ a }: { a: ResearchArticle; theme: Theme }) {
  const href = primaryUrl(a);
  const chip = badges(a);
  const apa = isApa(a);
  const subtitle = apa
    ? [a.journal || "APA Publishing", "PsychiatryOnline"].filter(Boolean).join(" · ")
    : [a.journal || "Journal", a.pmid ? `PMID ${a.pmid}` : null].filter(Boolean).join(" · ");
  const manila = apa ? APA_FOLDER : manilaForKey(a.pmid || a.title);
  const why = clinicalWhy(a);

  return (
    <DocumentFolderCard
      title={a.title}
      subtitle={subtitle}
      badges={chip}
      body={why}
      links={articleLinks(a)}
      href={href}
      folderLabel={apa ? "APA textbook" : "Further reading"}
      accent={manila.accent}
      accentDeep={manila.accentDeep}
      ink={manila.ink}
    />
  );
}

export function ResearchPanel({
  data,
  theme: T,
}: {
  data: ResearchRef;
  theme: Theme;
}) {
  const articles = data.articles || [];
  if (!articles.length) return null;
  const hasPaper = articles.some((a) => !isApa(a));
  const hasApa = articles.some(isApa);
  const label =
    hasPaper && hasApa
      ? "Further reading (papers + APA Publishing)"
      : hasApa
        ? "APA Publishing / PsychiatryOnline"
        : "Peer-reviewed further reading (MEDLINE)";

  return (
    <div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12.5,
          fontWeight: 600,
          color: T.muted,
          marginBottom: 12,
          letterSpacing: 0.2,
        }}
      >
        <BookOpen size={13} strokeWidth={2.2} />
        {label}
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          gap: 18,
          alignItems: "start",
        }}
      >
        {articles.map((a, i) => (
          <ArticleCard key={a.pmid || a.chapter_id || a.title || String(i)} a={a} theme={T} />
        ))}
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
        Hover a folder, click to pull it out, click again to flip. Papers open PubMed /
        PMC / DOI. APA cards open PsychiatryOnline through Wright State Libraries (sign
        in with your university credentials if prompted).
      </p>
    </div>
  );
}
