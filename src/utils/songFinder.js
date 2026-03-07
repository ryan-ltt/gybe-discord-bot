import { normalizeSong } from '../data/setlists.js';

/**
 * Find shows matching a query of songs.
 * @param {Array} shows - full setlists array
 * @param {string[]} query - normalized song names to search for
 * @param {'any'|'all'} mode
 * @param {'unordered'|'ordered'|'back-to-back'} order
 * @param {boolean} recordingsOnly - if true, only return shows with recordings
 * @returns {Array} matching shows, each augmented with a `score` property
 */
export function findShows(shows, query, mode = 'any', order = 'unordered', recordingsOnly = false) {
  let candidates = shows;
  if (recordingsOnly) {
    candidates = shows.filter(s => s.recordings && s.recordings.length > 0);
  }

  if (order === 'back-to-back') {
    return candidates.filter(show => matchesBackToBack(show, query));
  }

  if (order === 'ordered') {
    return candidates.filter(show => matchesOrdered(show, query));
  }

  // unordered
  const results = [];
  for (const show of candidates) {
    const canonSongs = (show.songs || []).map(normalizeSong).filter(Boolean);
    let score = 0;
    for (const q of query) {
      if (canonSongs.includes(q)) score++;
    }
    const minScore = mode === 'all' ? query.length : 1;
    if (score >= minScore) {
      results.push({ ...show, score });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

function matchesOrdered(show, query) {
  const canonSongs = (show.songs || []).map(normalizeSong).filter(Boolean);
  let qi = 0;
  for (const song of canonSongs) {
    if (song === query[qi]) qi++;
    if (qi === query.length) return true;
  }
  return false;
}

function matchesBackToBack(show, query) {
  const canonSongs = (show.songs || []).map(normalizeSong).filter(Boolean);
  outer: for (let j = 0; j <= canonSongs.length - query.length; j++) {
    for (let k = 0; k < query.length; k++) {
      if (canonSongs[j + k] !== query[k]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Format a single show into lines for an embed field.
 * Returns { header, setlist, recordings } strings.
 */
export function formatShow(show, highlightSet = null) {
  const setlistParts = (show.songs || []).map(raw => {
    const canon = normalizeSong(raw);
    if (highlightSet && canon && highlightSet.has(canon)) {
      return `**${raw}**`;
    }
    return raw;
  });

  const setlist = setlistParts.join('\n');

  const recLinks = (show.recordings || [])
    .map((r, i) => `[[${i + 1}]](${r.url})`)
    .join(' ');
  const recordings = recLinks ? `recordings: ${recLinks}` : '';

  return { setlist, recordings };
}

const PAGE_SIZE = 5;

export function paginateResults(results, page) {
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const clampedPage = Math.max(0, Math.min(page, totalPages - 1));
  const slice = results.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);
  return { slice, totalPages, page: clampedPage };
}
