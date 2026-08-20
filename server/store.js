import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const file = path.join(dir, 'moderation.json');

const DEFAULT_KEYWORDS = [
  'scam', 'scammer', 'bs', 'ripoff', 'rip off', 'rip-off', 'waiting', 'still waiting',
  'fraud', 'fake', 'junk', 'garbage', 'trash', 'crap', 'sucks', 'terrible', 'awful',
  'horrible', 'useless', 'worthless', 'stole', 'stolen', 'thief', 'liar', 'lies', 'lying',
  'false advertising', 'misleading', 'never arrived', 'never received', 'no refund',
  'want my money back', 'waste of money', "don't buy", 'dont buy', 'do not buy',
  'stay away', 'beware', 'chargeback', 'lawsuit', 'bbb', 'report you', 'reported',
];

let state = {
  reviewed: {},
  banned: {},
  autoHidden: {},
  settings: { autoHide: true, keywords: DEFAULT_KEYWORDS },
};
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
} catch {}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  }, 150);
}

export const store = {
  isReviewed: (id) => Boolean(state.reviewed[id]),
  setReviewed(id, reviewed) {
    if (reviewed) state.reviewed[id] = { at: new Date().toISOString() };
    else delete state.reviewed[id];
    save();
  },
  setReviewedBulk(ids, reviewed) {
    for (const id of ids) this.setReviewed(id, reviewed);
  },
  isBanned: (pageId, userId) => Boolean(state.banned[`${pageId}:${userId}`]),
  setBanned(pageId, userId, banned) {
    if (banned) state.banned[`${pageId}:${userId}`] = { at: new Date().toISOString() };
    else delete state.banned[`${pageId}:${userId}`];
    save();
  },
  getAutoHidden: (id) => state.autoHidden[id] || null,
  setAutoHidden(id, keyword) {
    state.autoHidden[id] = { at: new Date().toISOString(), keyword };
    save();
  },
  getSettings: () => state.settings,
  setSettings(settings) {
    state.settings = {
      autoHide: Boolean(settings.autoHide),
      keywords: (settings.keywords || [])
        .map((k) => String(k).trim().toLowerCase())
        .filter(Boolean),
    };
    save();
    return state.settings;
  },
};
