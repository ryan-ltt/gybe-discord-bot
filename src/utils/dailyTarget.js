import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_FILE = join(__dirname, '../data/dailyTarget.json');

function getTorontoDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
}

function load() {
  try {
    return JSON.parse(readFileSync(TARGET_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  writeFileSync(TARGET_FILE, JSON.stringify(data, null, 2));
}

export async function pickNewTarget(guild) {
  await guild.members.fetch();
  const members = guild.members.cache.filter(m => !m.user.bot);
  const chosen = members.random();
  const data = { userId: chosen.id, date: getTorontoDate() };
  save(data);
  console.log(`[dailyTarget] New target: ${chosen.user.tag} (${chosen.id})`);
  return chosen.id;
}

export async function getTodaysTarget(guild) {
  const data = load();
  const today = getTorontoDate();
  if (data.userId && data.date === today) {
    return data.userId;
  }
  return pickNewTarget(guild);
}
