const SETLISTS_URL = 'https://gyberecordinghelper.com/setlists.json';
const TTL = 6 * 60 * 60 * 1000; // 6 hours

let cache = null;
let lastFetch = 0;
let canonicalSongsCache = null;

export async function getSetlists() {
  if (cache && Date.now() - lastFetch < TTL) return cache;
  const res = await fetch(SETLISTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch setlists: ${res.status}`);
  cache = await res.json();
  lastFetch = Date.now();
  canonicalSongsCache = null; // invalidate derived cache
  return cache;
}

export async function getCanonicalSongs() {
  if (canonicalSongsCache) return canonicalSongsCache;
  const shows = await getSetlists();
  const set = new Set();
  for (const show of shows) {
    for (const song of show.songs || []) {
      const normalized = normalizeSong(song);
      if (normalized) set.add(normalized);
    }
  }
  canonicalSongsCache = [...set].sort((a, b) => a.localeCompare(b));
  return canonicalSongsCache;
}

export function normalizeSong(raw) {
  if (!raw) return null;
  // Strip parenthetical/bracketed descriptors like "(outro)", "[reprise]"
  return raw.replace(/\s*[\(\[].*?[\)\]]/g, '').trim().toLowerCase();
}
