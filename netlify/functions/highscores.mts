import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// En topplista per spel: /api/highscores?game=<spel>
// Varje resultat sparas som en egen nyckel: s/<inverterad poäng>.<tid>.<slump>.<namn base64url>
// Nycklarna sorteras alfabetiskt => högst poäng först. Inga läs-ändra-skriv på samma nyckel.
const MAX_SCORE = 999999;
const KEEP = 200;
const TOP = 20;

// Rimlighetskontroll per spel: högsta poäng = base + perSec * speltid i sekunder
const GAMES: Record<string, { store: string; base: number; perSec: number }> = {
  hurtgen: { store: "hurtgen-highscores", base: 500, perSec: 60 },
  "eben-emael": { store: "eben-emael-highscores", base: 2000, perSec: 60 },
  foy: { store: "foy-highscores", base: 2000, perSec: 60 },
  verdun: { store: "verdun-highscores", base: 2000, perSec: 60 },
};

type Entry = { name: string; score: number; ts: number; key: string };

function parseKey(key: string): Entry | null {
  const parts = key.slice(2).split(".");
  if (parts.length < 4) return null;
  const score = MAX_SCORE - Number(parts[0]);
  const ts = Number(parts[1]);
  let name = "";
  try { name = Buffer.from(parts.slice(3).join("."), "base64url").toString("utf8"); } catch { return null; }
  if (!Number.isFinite(score) || !Number.isFinite(ts)) return null;
  return { name, score, ts, key };
}

function cleanName(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
}

async function sortedEntries(s: ReturnType<typeof getStore>): Promise<Entry[]> {
  const { blobs } = await s.list({ prefix: "s/" });
  return blobs.map(b => b.key).sort().map(parseKey).filter((e): e is Entry => e !== null);
}

const publicList = (list: Entry[]) => list.slice(0, TOP).map(({ name, score, ts }) => ({ name, score, ts }));
const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status, headers: { "cache-control": "no-store" } });

export default async (req: Request, _context: Context) => {
  const game = new URL(req.url).searchParams.get("game") || "hurtgen";
  const cfg = GAMES[game];
  if (!cfg) return bad("Okänt spel");
  const s = getStore({ name: cfg.store, consistency: "strong" });

  if (req.method === "GET") {
    const list = await sortedEntries(s);
    return Response.json({ scores: publicList(list) }, { headers: { "cache-control": "no-store" } });
  }

  let body: any;
  try { body = await req.json(); } catch { return bad("Ogiltig data"); }

  const name = cleanName(body?.name);
  const score = Math.floor(Number(body?.score));
  const duration = Number(body?.duration);
  if (!name) return bad("Namn saknas");
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return bad("Ogiltig poäng");
  if (!Number.isFinite(duration) || duration < 1 || score > cfg.base + duration * cfg.perSec) return bad("Orimlig poäng");

  const ts = Date.now();
  const key = `s/${String(MAX_SCORE - score).padStart(6, "0")}.${ts}.${Math.random().toString(36).slice(2, 7)}.${Buffer.from(name, "utf8").toString("base64url")}`;
  await s.set(key, "");

  const list = await sortedEntries(s);
  const idx = list.findIndex(e => e.key === key);

  // Rensa bort de sämsta när listan växer
  if (list.length > KEEP + 50) {
    await Promise.all(list.slice(KEEP).map(e => s.delete(e.key)));
  }

  return Response.json(
    { ok: true, rank: idx >= 0 ? idx + 1 : null, ts, scores: publicList(list) },
    { headers: { "cache-control": "no-store" } }
  );
};

export const config: Config = {
  path: "/api/highscores",
  method: ["GET", "POST"],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
