import { createHash } from "node:crypto";

// A pseudonym#handle derived one-way from a visitor's cookie id, for logs and
// narration — never the cookie id itself, and never reversible back to it.
// docs/adr/0004-who-may-see-and-change-what.md: identity stays anonymous;
// CLAUDE.md: cookie ids are never logged.

const ADJECTIVES = [
  "quiet", "fern", "amber", "slow", "bright", "still", "dusty", "soft",
  "wild", "pale", "warm", "cool", "early", "late", "sharp", "dull",
  "bold", "shy", "high", "low", "deep", "faint", "loud", "clear",
  "dry", "damp", "rough", "smooth", "swift", "idle", "keen", "grey",
];

const NOUNS = [
  "heron", "petrel", "finch", "wren", "quail", "swift", "magpie", "currawong",
  "gull", "tern", "lark", "plover", "stilt", "kite", "harrier", "robin",
  "shrike", "pardalote", "honeyeater", "fantail", "thornbill", "treecreeper",
  "cuckoo", "nightjar", "frogmouth", "boobook", "kestrel", "osprey",
  "cormorant", "grebe", "coot", "swan",
];

function hashOf(visitorId: string): Buffer {
  return createHash("sha256").update(visitorId).digest();
}

export function pseudonymFor(visitorId: string): string {
  const hash = hashOf(visitorId);
  return `${ADJECTIVES[hash[0] % ADJECTIVES.length]}-${NOUNS[hash[1] % NOUNS.length]}`;
}

// A short public handle, distinct from the pseudonym's bytes of the hash so
// the two don't just restate each other, and far too short to be a usable
// encoding of the 122-bit UUID it came from.
export function handleFor(visitorId: string): string {
  return hashOf(visitorId).subarray(2, 5).toString("hex");
}

export function publicId(visitorId: string): string {
  return `${pseudonymFor(visitorId)}#${handleFor(visitorId)}`;
}
