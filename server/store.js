import { kvGet, kvSet } from './storage.js';

const DEFAULT_KEYWORDS = [
  'scam', 'scammer', 'bs', 'ripoff', 'rip off', 'rip-off', 'waiting', 'still waiting',
  'fraud', 'fake', 'junk', 'garbage', 'trash', 'crap', 'sucks', 'terrible', 'awful',
  'horrible', 'useless', 'worthless', 'stole', 'stolen', 'thief', 'liar', 'lies', 'lying',
  'false advertising', 'misleading', 'never arrived', 'never received', 'no refund',
  'want my money back', 'waste of money', "don't buy", 'dont buy', 'do not buy',
  'stay away', 'beware', 'chargeback', 'lawsuit', 'bbb', 'report you', 'reported',
];

const DEFAULT_PAGES = ['1165126110007822']; // Hearing.com

const EMPTY = () => ({
  reviewed: {},
  banned: {},
  autoHidden: {},
  settings: { autoHide: true, keywords: DEFAULT_KEYWORDS, enabledPages: DEFAULT_PAGES, aiPrompt: '' },
});

export async function loadState() {
  const state = await kvGet('moderation', 'state');
  const empty = EMPTY();
  return {
    ...empty,
    ...(state || {}),
    settings: { ...empty.settings, ...(state?.settings || {}) },
  };
}

export async function saveState(state) {
  await kvSet('moderation', 'state', state);
}

export function normalizeSettings(settings) {
  return {
    autoHide: Boolean(settings.autoHide),
    keywords: (settings.keywords || [])
      .map((k) => String(k).trim().toLowerCase())
      .filter(Boolean),
    enabledPages: [...new Set((settings.enabledPages || []).map(String).filter(Boolean))],
    aiPrompt: String(settings.aiPrompt || '').slice(0, 8000),
  };
}
