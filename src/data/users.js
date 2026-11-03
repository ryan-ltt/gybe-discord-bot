// Same public Supabase project and publishable key the website uses (its config.js)
const SUPABASE_URL = 'https://jouivrvbgyqtyvrrcwcs.supabase.co/rest/v1';
const SUPABASE_KEY = 'sb_publishable_6y2HvnhrMSBXFxbn2m2qkw_0cCi1j83';
const TTL = 10 * 60 * 1000; // 10 minutes
const PAGE_SIZE = 1000; // Supabase's max rows per request

let profilesCache = null;
let profilesCacheTime = 0;
let usersCache = null;
let usersCacheTime = 0;

async function query(table, params) {
  const res = await fetch(`${SUPABASE_URL}/${table}?${new URLSearchParams(params)}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.status}`);
  return res.json();
}

/** Map of user id → username for the profiles the site's users tab lists. */
async function getPublicProfiles() {
  if (profilesCache && Date.now() - profilesCacheTime < TTL) return profilesCache;
  const profiles = await query('profiles', {
    select: 'user_id,username',
    is_public: 'eq.true',
    order: 'created_at.asc',
  });
  profilesCache = new Map(profiles.map(p => [p.user_id, p.username]));
  profilesCacheTime = Date.now();
  return profilesCache;
}

/**
 * Public profiles from the site's users tab with their attended and listened
 * show counts, matching what gyberecordinghelper.com/#users shows.
 * Only the counts are kept, not the tracking rows.
 */
export async function getUserStats() {
  if (usersCache && Date.now() - usersCacheTime < TTL) return usersCache;

  const profiles = await getPublicProfiles();
  const stats = new Map([...profiles].map(([id, username]) => [id, { username, attended: 0, listened: 0 }]));

  // Filtering to public users happens here rather than in the URL, which a
  // long list of ids would push past length limits
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await query('show_tracking', {
      select: 'user_id,attended,listened',
      or: '(attended.eq.true,listened.eq.true)',
      order: 'user_id,show_date',
      limit: PAGE_SIZE,
      offset,
    });
    for (const row of page) {
      const s = stats.get(row.user_id);
      if (!s) continue;
      if (row.attended) s.attended++;
      if (row.listened) s.listened++;
    }
    if (page.length < PAGE_SIZE) break;
  }

  usersCache = [...stats.values()];
  usersCacheTime = Date.now();
  return usersCache;
}

/**
 * Public users who listened to or attended each show on a YYYY-MM-DD date.
 * Show dates carry a letter suffix when several shows share a day, so the
 * result maps each matching show date → { listened: [names], attended: [names] }.
 */
export async function getShowUsers(date) {
  const [profiles, rows] = await Promise.all([
    getPublicProfiles(),
    query('show_tracking', {
      select: 'user_id,show_date,attended,listened',
      show_date: `like.${date}*`,
      or: '(attended.eq.true,listened.eq.true)',
    }),
  ]);

  const byShow = new Map();
  for (const row of rows) {
    const username = profiles.get(row.user_id);
    if (!username) continue;
    if (!byShow.has(row.show_date)) byShow.set(row.show_date, { listened: [], attended: [] });
    const show = byShow.get(row.show_date);
    if (row.listened) show.listened.push(username);
    if (row.attended) show.attended.push(username);
  }
  for (const show of byShow.values()) {
    show.listened.sort((a, b) => a.localeCompare(b));
    show.attended.sort((a, b) => a.localeCompare(b));
  }
  return byShow;
}
