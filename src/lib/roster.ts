/* Resident roster for the admin approval panel's "on roster" hint. The actual
   auto-approval happens server-side in the signup trigger (migration 0002);
   this mirror is just so the admin sees a match badge when reviewing people. */

export type RosterEntry = { first: string; last: string; year: string };

export const ROSTER: RosterEntry[] = [
  { first: "Sara", last: "Barlow", year: "2026" }, { first: "Monica", last: "Chi", year: "2026" },
  { first: "Aaron", last: "Cotney", year: "2026" }, { first: "Andrew", last: "Dobry", year: "2026" },
  { first: "Aubrey", last: "Lippert", year: "2026" }, { first: "Ben", last: "Onnink", year: "2026" },
  { first: "Hunter", last: "Smothers", year: "2026" }, { first: "Benjamin", last: "Wise", year: "2026" },
  { first: "David", last: "Zealley", year: "2026" },
  { first: "Samantha", last: "Achauer", year: "2027" }, { first: "Ryan", last: "Bernal", year: "2027" },
  { first: "Katie", last: "Clark", year: "2027" }, { first: "Samantha", last: "Peralta", year: "2027" },
  { first: "Sarah", last: "Craft", year: "2027" }, { first: "Smiti", last: "Gupta", year: "2027" },
  { first: "Saagar", last: "Kulkarni", year: "2027" }, { first: "Sondos", last: "Mishal", year: "2027" },
  { first: "Robert", last: "Rodgers", year: "2027" }, { first: "Samantha", last: "Ruffe", year: "2027" },
  { first: "Prasun", last: "Shah", year: "2027" }, { first: "Jacob", last: "Weber", year: "2027" },
  { first: "Tyler", last: "Yorgason", year: "2027" }, { first: "Logan", last: "Yusuf", year: "2027" },
  { first: "Shane", last: "Berger", year: "2028" }, { first: "Samuel", last: "Cain", year: "2028" },
  { first: "Andrew", last: "Correll", year: "2028" }, { first: "Corianne", last: "Victor", year: "2028" },
  { first: "Cheyenne", last: "Dryer", year: "2028" }, { first: "Sierrah", last: "Hawkins", year: "2028" },
  { first: "Noor", last: "Haq", year: "2028" }, { first: "Geoffrey", last: "McLatchey", year: "2028" },
  { first: "Sana", last: "Shameem", year: "2028" }, { first: "Needa", last: "Toofanny", year: "2028" },
  { first: "Rylee", last: "Tucker", year: "2028" }, { first: "Aidan", last: "Vatalaro", year: "2028" },
  { first: "Bridget", last: "Daughton", year: "2029" }, { first: "Alyssa", last: "Fowler", year: "2029" },
  { first: "Alexandria", last: "Fowler", year: "2029" }, { first: "Joseph", last: "Griffin", year: "2029" },
  { first: "Logan", last: "Heckart", year: "2029" }, { first: "Seth", last: "Holmquist", year: "2029" },
  { first: "Caleb", last: "Hudson", year: "2029" }, { first: "Annika", last: "Kisha", year: "2029" },
  { first: "Maleka", last: "Nozile", year: "2029" }, { first: "Adam", last: "Quinn", year: "2029" },
  { first: "Michael", last: "Raischel", year: "2029" }, { first: "Alessa", last: "Rosas", year: "2029" },
  { first: "Holland", last: "Arnold", year: "2030" }, { first: "Jonathan", last: "Clement", year: "2030" },
  { first: "Emma", last: "Coyne", year: "2030" }, { first: "Nicholas", last: "Coyne", year: "2030" },
  { first: "Elisabeth", last: "Day", year: "2030" }, { first: "Parviz", last: "Kanga", year: "2030" },
  { first: "David", last: "Klopfer", year: "2030" }, { first: "John", last: "McCaskey", year: "2030" },
  { first: "Elizabeth", last: "Monger", year: "2030" }, { first: "Emily", last: "Murphy", year: "2030" },
  { first: "James", last: "Pike", year: "2030" }, { first: "Lara", last: "Shoukair", year: "2030" },
];

function strip(name: string) {
  return name.replace(/,?\s*(m\.?d\.?|d\.?o\.?|ph\.?d\.?)\.?\s*$/i, "").trim();
}

/** Mirror of the server-side rule: last name matches and first name (or its
    initial) matches. Returns the matched class year, or null. */
export function matchRoster(displayName?: string | null): string | null {
  if (!displayName) return null;
  const toks = strip(displayName).toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const first = toks[0], last = toks[toks.length - 1];
  const hit = ROSTER.find(
    (e) => e.last.toLowerCase() === last &&
      (e.first.toLowerCase() === first || e.first[0].toLowerCase() === first[0])
  );
  return hit ? hit.year : null;
}

/* Season-team seats promised to residents who hadn't made an account yet
   (announced 2026-07-15 for the Tuesday review sessions). The roster editor
   surfaces the match as the suggested team once they finally sign up.
   Safe to prune entries as people get seated — or wholesale after the PRITE. */
export const PLANNED_TEAMS: { first: string; last: string; team: string }[] = [
  { first: "Joseph", last: "Griffin", team: "Team 9" },
  { first: "Needa", last: "Toofanny", team: "Team 9" },
  { first: "Geoffrey", last: "McLatchey", team: "Team 8" },
  { first: "Logan", last: "Heckart", team: "Team 11" },
  { first: "Adam", last: "Quinn", team: "Team 10" },
  { first: "Ryan", last: "Bernal", team: "Team 3" },
  { first: "Samantha", last: "Ruffe", team: "Team 5" },
  { first: "Holland", last: "Arnold", team: "Team 1" },
  { first: "Emily", last: "Murphy", team: "Team 2" },
  { first: "James", last: "Pike", team: "Team 4" },
];

/** The pre-announced team for a display name (same matching rule as above),
    or null if none was promised. */
export function matchPlannedTeam(displayName?: string | null): string | null {
  if (!displayName) return null;
  const toks = strip(displayName).toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return null;
  const first = toks[0], last = toks[toks.length - 1];
  const hit = PLANNED_TEAMS.find(
    (e) => e.last.toLowerCase() === last &&
      (e.first.toLowerCase() === first || e.first[0].toLowerCase() === first[0])
  );
  return hit ? hit.team : null;
}
