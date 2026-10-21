import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getActiveUserIds } from './activity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In DATA_DIR like the other live state, so the week's pick survives redeploys
const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../data');
const TARGET_FILE = join(DATA_DIR, 'weeklyTarget.json');
const DAYS_BETWEEN_PICKS = 7;

function getTorontoDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

// Whole calendar days between two YYYY-MM-DD dates, unaffected by DST
function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

function load() {
  try {
    return JSON.parse(readFileSync(TARGET_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TARGET_FILE, JSON.stringify(data, null, 2));
}

async function pickNewTarget(guild) {
  await guild.members.fetch();
  const members = guild.members.cache.filter(m => !m.user.bot);
  // Prefer people who've posted in the last week; fall back to anyone if it's been dead
  const activeIds = getActiveUserIds();
  const active = members.filter(m => activeIds.has(m.id));
  const chosen = (active.size > 0 ? active : members).random();
  save({ userId: chosen.id, date: getTorontoDate() });
  console.log(`[weeklyTarget] New target: ${chosen.user.tag} (${chosen.id}) from ${active.size > 0 ? `${active.size} active` : `all ${members.size}`} members`);
  return chosen.id;
}

// A new target is picked once every 7 days and only gets reacted to on the
// day they were picked (midnight to midnight Toronto time). Returns null on
// the days in between.
export async function getCurrentTarget(guild) {
  const data = load();
  const today = getTorontoDate();
  if (!data.userId || daysBetween(data.date, today) >= DAYS_BETWEEN_PICKS) {
    return pickNewTarget(guild);
  }
  return data.date === today ? data.userId : null;
}
