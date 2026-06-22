/* In-browser .apkg builder. Produces a real Anki package (double-click import)
   in the AnKing Overhaul note type — same model id/fields/templates as the
   Python-built full deck, so cards merge into the user's AnKing note type.

   We drive genanki-js's pieces directly (schema + write + db.export) and zip
   with our own imported JSZip/file-saver, rather than its writeToFile() which
   relies on global `JSZip`/`saveAs` that don't resolve under Vite's bundling. */

import initSqlJs from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { ClozeModel, Deck, Note, Package, APKG_SCHEMA } from "genanki-js";
import T from "./anking-template.json";

const FIELDS = ["Text","Extra","Lecture Notes","Missed Questions","Pathoma","Boards and Beyond",
"First Aid","Sketchy","Sketchy 2","Sketchy Extra","Picmonic","Pixorize","Physeo","Bootcamp","OME",
"Additional Resources","One by one","ankihub_id"];

let SQLP: Promise<any> | null = null;
function getSQL() {
  if (!SQLP) SQLP = initSqlJs({ locateFile: () => wasmUrl });
  return SQLP;
}

function ankingModel() {
  return new ClozeModel({
    id: T.id,
    name: T.name,
    flds: FIELDS.map((name) => ({ name })),
    tmpls: [{ name: "Cloze", qfmt: T.front, afmt: T.back }],
    css: T.css,
  });
}

export type ApkgCard = { questionId: string; cloze: string; lecture: string };

/** Build an .apkg Blob for the given cards (Text=cloze, Lecture Notes=question). */
export async function makeApkgBlob(cards: ApkgCard[], deckName = "PRITE Daily"): Promise<Blob> {
  const SQL = await getSQL();
  const db = new SQL.Database();
  const model = ankingModel();
  const deck = new Deck(2059400110, deckName);
  for (const c of cards) {
    const flds = [c.cloze, "", c.lecture, ...Array(FIELDS.length - 3).fill("")];
    // stable guid so re-imports & the full deck dedupe instead of duplicating
    deck.addNote(new Note(model, flds, null, `prite::${c.questionId}`));
  }
  const pkg = new Package();
  pkg.addDeck(deck);
  pkg.setSqlJs(db);

  db.run(APKG_SCHEMA);
  pkg.write(db);
  const data = db.export();
  db.close();

  const zip = new JSZip();
  zip.file("collection.anki2", data);
  zip.file("media", "{}");
  return zip.generateAsync({ type: "blob", mimeType: "application/apkg" });
}

/** Build & download an .apkg. */
export async function buildApkg(cards: ApkgCard[], filename = "prite-deck.apkg", deckName = "PRITE Daily") {
  const blob = await makeApkgBlob(cards, deckName);
  saveAs(blob, filename);
}
