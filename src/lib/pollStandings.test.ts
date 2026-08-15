import assert from "node:assert/strict";
import { computeTeamStandings, pickOneProfilePerPerson, shouldAcceptPollVote } from "./poll.ts";

const people = [
  { full_name: "Alex Fowler", email: "alex@gmail.com" },
  { full_name: "Alex Fowler", email: "alex.fowler@wright.edu" },
  { full_name: "Adam Quinn", email: "adam@gmail.com" },
  { full_name: "Adam Quinn", email: "aquinn@wright.edu" },
  { full_name: "Logan Heckart", email: "logan@wright.edu" },
  { full_name: null, email: "mystery@gmail.com" },
];
const unique = pickOneProfilePerPerson(people);
assert.equal(unique.length, 4);
assert.ok(unique.some((p) => p.email === "alex.fowler@wright.edu"));
assert.ok(unique.some((p) => p.email === "aquinn@wright.edu"));
assert.ok(!unique.some((p) => p.email === "alex@gmail.com"));
assert.ok(unique.some((p) => p.email === "mystery@gmail.com"));

assert.equal(shouldAcceptPollVote({ started: false, finished: false, voteQid: "q1", currentQid: "q1", closed: new Set() }), false);
assert.equal(shouldAcceptPollVote({ started: true, finished: true, voteQid: "q1", currentQid: "q1", closed: new Set() }), false);
assert.equal(shouldAcceptPollVote({ started: true, finished: false, voteQid: "q1", currentQid: "q2", closed: new Set() }), false);
assert.equal(shouldAcceptPollVote({ started: true, finished: false, voteQid: "q1", currentQid: "q1", closed: new Set(["q1"]) }), false);
assert.equal(shouldAcceptPollVote({ started: true, finished: false, voteQid: "q1", currentQid: "q1", closed: new Set() }), true);

const sessionMembers = new Map<string, Set<string>>([
  ["Team 1", new Set(["a", "b"])],
  ["Team 2", new Set(["c"])],
]);
const closedTeams = new Map<string, Set<string>>([
  ["q1", new Set(["Team 1", "Team 2"])],
]);
const correctByQ = new Map<string, string[]>([["q1", ["A"]]]);
const votesByQ = new Map<string, Map<string, string[]>>([
  ["q1", new Map([["a", ["A"]], ["b", ["B"]]])],
]);
const voteTeamsByQ = new Map<string, Map<string, string>>([
  ["q1", new Map([["a", "Team 1"], ["b", "Team 1"]])],
]);
const standings = computeTeamStandings({
  sessionMembers, closedTeams, correctByQ, votesByQ, voteTeamsByQ, rankByTotal: false,
});
const t1 = standings.find((t) => t.team === "Team 1")!;
const t2 = standings.find((t) => t.team === "Team 2")!;
assert.equal(t1.answered, 1);
assert.equal(t1.correct, 0.5);
assert.equal(t2.answered, 1);
assert.equal(t2.correct, 0);
assert.ok(t2.correct / t2.answered < t1.correct / t1.answered);

console.log("poll standings tests passed");
