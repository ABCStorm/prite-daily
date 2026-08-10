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

function primaryUrl(a: ResearchArticle): string {
  return (
    a.url ||
    a.urls?.pmc ||
    a.urls?.pubmed ||
    (a.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/` : "#")
  );
}

function badges(a: ResearchArticle): string[] {
  const out: string[] = [];
  if (a.is_reviewish) out.push("Review / guideline");
  if (a.is_open_access || a.pmcid) out.push("Free full text");
  if (a.year) out.push(String(a.year));
  return out;
}

function articleLinks(a: ResearchArticle): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
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

function ArticleCard({ a }: { a: ResearchArticle; theme: Theme }) {
  const href = primaryUrl(a);
  const chip = badges(a);
  const subtitle = [a.journal || "Journal", a.pmid ? `PMID ${a.pmid}` : null].filter(Boolean).join(" · ");
  const manila = manilaForKey(a.pmid || a.title);
  const why = clinicalWhy(a);

  return (
    <DocumentFolderCard
      title={a.title}
      subtitle={subtitle}
      badges={chip}
      body={why}
      links={articleLinks(a)}
      href={href}
      folderLabel="Further reading"
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
        Peer-reviewed further reading (MEDLINE)
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          gap: 18,
          alignItems: "start",
        }}
      >
        {articles.map((a) => (
          <ArticleCard key={a.pmid || a.title} a={a} theme={T} />
        ))}
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 12, color: T.faint, lineHeight: 1.5 }}>
        Hover a manila folder, click to pull the paper out, click again to flip and read why it matters (scroll if needed). Links open PubMed / PMC / DOI.
      </p>
    </div>
  );
}
