const KEYS = {
  API_KEY: 'scenerynews_gemini_api_key',
  SETTINGS: 'scenerynews_settings',
  SCRAPBOOK: 'scenerynews_scrapbook',
  EVALS: 'scenerynews_serendipity_evals',
};

const DEFAULT_SETTINGS = {
  thinkingLevel: 'medium',
  calmMode: true,
  lang: 'ja',
};

export function getApiKey() {
  return localStorage.getItem(KEYS.API_KEY)?.trim() || '';
}

export function setApiKey(key) {
  const cleaned = key.trim();
  if (cleaned) {
    localStorage.setItem(KEYS.API_KEY, cleaned);
  } else {
    localStorage.removeItem(KEYS.API_KEY);
  }
}

export function getSettings() {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      thinkingLevel: ['low', 'medium', 'high'].includes(parsed.thinkingLevel)
        ? parsed.thinkingLevel
        : DEFAULT_SETTINGS.thinkingLevel,
      calmMode: typeof parsed.calmMode === 'boolean' ? parsed.calmMode : DEFAULT_SETTINGS.calmMode,
      lang: parsed.lang === 'en' ? 'en' : 'ja',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
}

export function getScrapbook() {
  try {
    const raw = localStorage.getItem(KEYS.SCRAPBOOK);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleScrapbookItem(item) {
  const list = getScrapbook();
  const idx = list.findIndex((x) => x.id === item.id);
  let saved = false;
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.unshift({ ...item, savedAt: new Date().toISOString() });
    saved = true;
  }
  // Cap to 80 items so localStorage stays well under quota even with small thumbnails
  localStorage.setItem(KEYS.SCRAPBOOK, JSON.stringify(list.slice(0, 80)));
  return { saved, list };
}

export function isSavedInScrapbook(id) {
  return getScrapbook().some((x) => x.id === id);
}

/**
 * Paper §5.2 Serendipity Evaluation Store
 * Tracks per-article { relevance: 0|1, novelty: 0|1, unexpectedness: 0|1 }
 */
export function getEvals() {
  try {
    const raw = localStorage.getItem(KEYS.EVALS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getArticleEval(articleId) {
  const all = getEvals();
  return all[articleId] || { relevance: false, novelty: false, unexpectedness: false };
}

export function updateArticleEval(articleId, meta, field) {
  const all = getEvals();
  const cur = all[articleId] || {
    ...meta,
    relevance: false,
    novelty: false,
    unexpectedness: false,
    updatedAt: new Date().toISOString(),
  };
  cur[field] = !cur[field];
  cur.updatedAt = new Date().toISOString();
  all[articleId] = cur;
  localStorage.setItem(KEYS.EVALS, JSON.stringify(all));
  return cur;
}

export function computeSerendipityStats() {
  const entries = Object.values(getEvals()).filter(
    (e) => e.relevance || e.novelty || e.unexpectedness,
  );
  const total = entries.length;
  if (!total) {
    return { total: 0, relevance: 0, novelty: 0, unexpectedness: 0, serendipity: 0 };
  }
  const rel = entries.filter((e) => e.relevance).length;
  const nov = entries.filter((e) => e.novelty).length;
  const unx = entries.filter((e) => e.unexpectedness).length;
  const ser = entries.filter((e) => e.relevance && e.novelty && e.unexpectedness).length;
  return {
    total,
    relevance: rel / total,
    novelty: nov / total,
    unexpectedness: unx / total,
    serendipity: ser / total,
  };
}
