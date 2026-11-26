const MODEL_ID = 'gemini-4-hydrogen';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Low-level Gemini 4 Hydrogen generateContent caller.
 * Follows Gemini 4 API guidelines:
 * - No temperature / topP / topK
 * - thinkingLevel must be "low" | "medium" | "high" | "xhigh" (never "minimal")
 * - Omit maxOutputTokens to allow full 65,536 synchronous output budget
 */
async function callHydrogen(apiKey, body, signal) {
  if (!apiKey) {
    throw new Error('Gemini API キーが設定されていません。右上の設定ボタンから入力してください。');
  }
  const url = `${API_BASE}/${MODEL_ID}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `APIエラー (${res.status})`;
    if (res.status === 400 && /API key/i.test(msg)) {
      throw new Error('API キーが無効です。Google AI Studio の有効なキーを設定してください。');
    }
    throw new Error(msg);
  }
  return data;
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('');
}

function safeParseJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Strip markdown code fences if present
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      try {
        return JSON.parse(fence[1].trim());
      } catch {
        // fall through
      }
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    const arrStart = trimmed.indexOf('[');
    const arrEnd = trimmed.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return JSON.parse(trimmed.slice(arrStart, arrEnd + 1));
      } catch {
        // fall through
      }
    }
    return null;
  }
}

/**
 * Step 1: Detect up to 6 everyday objects with bounding boxes (box_2d in 0..1000)
 * + proper nouns (brands/products) + disambiguation context (solves paper §5.5 homonym issue).
 */
export async function detectObjectsInImage(apiKey, base64Jpeg, lang = 'ja', signal) {
  const isJa = lang === 'ja';
  const prompt = isJa
    ? `この日常の風景写真に写っているモノを最大6個検出してください。
ニュース記事の推薦に使うため、以下を守ってください：
- 明確なブランド名・製品名・固有名詞が読み取れる場合は、それも抽出する（例: 「マグカップ」より「スターバックスのマグカップ」など、ただし推測で捏造しない）。
- 同音異義語や多義語（例: 照明の「ランプ」と道路の「ランプ」）を避けるため、写真内の文脈を表す短い補足（context、例: 「照明器具」「キッチン家電」）を必ず付ける。
- box_2d は [ymin, xmin, ymax, xmax] を 0〜1000 の整数で返す。
- 画面全体ではなく、ニュースの切り口になりやすい多様なモノをバランスよく選ぶ。`
    : `Detect up to 6 distinct everyday objects in this photo for serendipitous news recommendation.
- If a clear brand, product, or proper noun is visible, include it (do not fabricate).
- Provide a short disambiguation context (e.g., "lighting fixture", "kitchen appliance") to avoid ambiguous search terms.
- Return box_2d as [ymin, xmin, ymax, xmax] integers in 0..1000.`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          sceneSummary: { type: 'STRING' },
          objects: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                label: { type: 'STRING' },
                properNoun: { type: 'STRING' },
                context: { type: 'STRING' },
                category: { type: 'STRING' },
                box_2d: {
                  type: 'ARRAY',
                  items: { type: 'INTEGER' },
                },
              },
              required: ['label', 'context', 'box_2d'],
            },
          },
        },
        required: ['objects'],
      },
    },
  };

  const data = await callHydrogen(apiKey, body, signal);
  const parsed = safeParseJson(extractText(data));
  const rawList = Array.isArray(parsed?.objects) ? parsed.objects : [];

  const objects = rawList
    .filter((o) => o && typeof o.label === 'string' && Array.isArray(o.box_2d) && o.box_2d.length === 4)
    .slice(0, 6)
    .map((o, idx) => ({
      id: `obj-${idx}-${Date.now()}`,
      label: o.label.trim().slice(0, 32),
      properNoun: (o.properNoun || '').trim().slice(0, 40),
      context: (o.context || '').trim().slice(0, 36),
      category: (o.category || '').trim().slice(0, 20),
      box_2d: o.box_2d.map((n) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0)))),
    }));

  return {
    sceneSummary: (parsed?.sceneSummary || '').trim(),
    objects,
  };
}

/**
 * Step 1b (Region Focus — modern replacement for EdgeSAM in Paper §4.1):
 * Identify the specific object at a user-tapped point in the photo.
 */
export async function detectObjectAtPoint(apiKey, base64Jpeg, normX, normY, lang = 'ja', signal) {
  const x1000 = Math.round(normX * 1000);
  const y1000 = Math.round(normY * 1000);
  const isJa = lang === 'ja';
  const prompt = isJa
    ? `写真上の座標 (x=${x1000}, y=${y1000})（0〜1000正規化座標）にあるモノを1つ特定してください。
ブランド名・製品名が分かれば properNoun に書き、同音異義語を避ける文脈補足（context）と、そのモノの box_2d [ymin, xmin, ymax, xmax] を返してください。`
    : `Identify the single object located at normalized coordinate (x=${x1000}, y=${y1000}) in 0..1000 space. Return its label, optional properNoun, disambiguation context, and box_2d [ymin, xmin, ymax, xmax].`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          properNoun: { type: 'STRING' },
          context: { type: 'STRING' },
          category: { type: 'STRING' },
          box_2d: { type: 'ARRAY', items: { type: 'INTEGER' } },
        },
        required: ['label', 'context', 'box_2d'],
      },
    },
  };

  const data = await callHydrogen(apiKey, body, signal);
  const o = safeParseJson(extractText(data));
  if (!o || !o.label) return null;
  const fallbackBox = [
    Math.max(0, y1000 - 110),
    Math.max(0, x1000 - 110),
    Math.min(1000, y1000 + 110),
    Math.min(1000, x1000 + 110),
  ];
  return {
    id: `tap-${Date.now()}`,
    label: o.label.trim().slice(0, 32),
    properNoun: (o.properNoun || '').trim().slice(0, 40),
    context: (o.context || '').trim().slice(0, 36),
    category: (o.category || '').trim().slice(0, 20),
    box_2d:
      Array.isArray(o.box_2d) && o.box_2d.length === 4
        ? o.box_2d.map((n) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0))))
        : fallbackBox,
    isCustomTap: true,
  };
}

/**
 * Step 2: Recommend up to 5 serendipitous, subject-oriented news articles
 * using Gemini 4 Hydrogen + Google Search Grounding.
 */
export async function recommendNewsForObject(apiKey, obj, options = {}, signal) {
  const { thinkingLevel = 'medium', calmMode = true, lang = 'ja', sceneSummary = '' } = options;
  const isJa = lang === 'ja';
  const targetName = obj.properNoun && obj.properNoun !== obj.label
    ? `${obj.label}（${obj.properNoun}）`
    : obj.label;

  const calmInstruction = calmMode
    ? isJa
      ? '事件・事故・戦争・犯罪などの暗い話題はなるべく避け、ビジネス・技術・文化・社会トレンド・暮らしの新発見など前向きで知的好奇心をくすぐるニュースを優先してください。'
      : 'Prefer constructive, curiosity-sparking news (technology, culture, business, design, sustainability, science) and avoid distressing topics like crime or war.'
    : '';

  const prompt = isJa
    ? `あなたは論文「Making News Familiar: News Recommendation from Daily Scenery」を実現するニュース推薦キュレーターです。
ユーザーの日常風景から検出されたモノについて、Google検索を使って**実在する最近のニュース記事**を最大5件見つけて推薦してください。

【対象のモノ】
- 名前: ${targetName}
- 写真内での文脈（意味の曖昧性解消用）: ${obj.context || '日常のモノ'}
${sceneSummary ? `- 風景全体: ${sceneSummary}` : ''}

【推薦の方針（セレンディピティ重視）】
1. **関連性（主題一致）**: 単なる単語の一致（例: 照明のランプに対して道路のランプ、ベッドに対して2ベッドルーム不動産など）は厳禁。このモノ自体やその産業・素材・文化・技術が主題になっている記事を選ぶこと。
2. **新規性と意外性**: ユーザーが普段自分では検索しないような、意外な角度（サプライチェーン、新技術、価格・市場動向、環境、デザインの裏話など）のニュースを混ぜること。
3. ${calmInstruction}
4. 検索結果で実際に確認できた記事だけを紹介し、架空の記事やURLを絶対に作らないこと。

【出力形式】
必ず以下のJSONのみを出力してください（前置き・後書き不要）：
{
  "objectIntro": "このモノと世の中のニュースがどう繋がっているかの一言紹介（60文字以内）",
  "articles": [
    {
      "title": "記事タイトル",
      "source": "媒体名",
      "publishedAt": "公開時期（分かれば YYYY-MM-DD や 2026年11月 など、不明なら空文字）",
      "angle": "切り口ラベル（例: 技術革新 / 市場トレンド / 意外な裏話 / サステナビリティ）",
      "summary": "記事の要旨（90〜130文字）",
      "connection": "写真のモノとの身近なつながり・なぜ面白いか（60文字以内）",
      "url": "検索結果に含まれる記事URL（分からなければ空文字）"
    }
  ]
}`
    : `You are a serendipitous news curator implementing "Making News Familiar: News Recommendation from Daily Scenery".
Use Google Search to find up to 5 real, recent news articles related to this everyday object from the user's photo.

Object: ${targetName}
Visual context (for disambiguation): ${obj.context || 'everyday object'}
${sceneSummary ? `Scene: ${sceneSummary}` : ''}

Rules:
1. Subject-oriented relevance: The object itself (or its industry, materials, design, science, or supply chain) must be central—avoid false homonym matches.
2. Serendipity: Mix novel, unexpected angles the user wouldn't normally search for.
3. ${calmInstruction}
4. Only cite real articles found via Google Search. Never fabricate titles or URLs.

Output ONLY valid JSON:
{
  "objectIntro": "One-sentence hook connecting this everyday object to current news",
  "articles": [
    {
      "title": "Article title",
      "source": "Publisher name",
      "publishedAt": "Date if known, else empty string",
      "angle": "Short tag (e.g. Tech / Market / Behind the Scenes / Sustainability)",
      "summary": "Concise 2-sentence summary",
      "connection": "Why this connects unexpectedly to the object in the photo",
      "url": "Article URL from search results if known, else empty string"
    }
  ]
}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      thinkingConfig: { thinkingLevel },
    },
  };

  const data = await callHydrogen(apiKey, body, signal);
  const text = extractText(data);
  const grounding = data?.candidates?.[0]?.groundingMetadata || {};
  const chunks = (grounding.groundingChunks || [])
    .map((c) => c?.web)
    .filter((w) => w && w.uri);
  const queries = grounding.webSearchQueries || [];

  const parsed = safeParseJson(text);
  let articles = Array.isArray(parsed?.articles) ? parsed.articles : [];

  // Grounding URL verification & attachment:
  // Prefer verified groundingChunk URIs so every link actually opens a real search result.
  const usedChunkIdx = new Set();
  articles = articles.slice(0, 5).map((art, idx) => {
    let matchedChunk = null;
    // Try matching by source or title token against groundingChunks
    const titleLower = (art.title || '').toLowerCase();
    const sourceLower = (art.source || '').toLowerCase();
    for (let i = 0; i < chunks.length; i++) {
      if (usedChunkIdx.has(i)) continue;
      const cTitle = (chunks[i].title || '').toLowerCase();
      if (
        (sourceLower && cTitle.includes(sourceLower)) ||
        (cTitle && titleLower.includes(cTitle.replace(/\.[a-z]+$/, '')))
      ) {
        matchedChunk = { chunk: chunks[i], i };
        break;
      }
    }
    if (!matchedChunk && chunks[idx] && !usedChunkIdx.has(idx)) {
      matchedChunk = { chunk: chunks[idx], i: idx };
    }
    if (matchedChunk) {
      usedChunkIdx.add(matchedChunk.i);
    }

    const validDirectUrl =
      typeof art.url === 'string' && /^https?:\/\//i.test(art.url.trim()) ? art.url.trim() : '';
    const finalUrl = matchedChunk?.chunk?.uri || validDirectUrl || buildGoogleNewsSearchUrl(art.title || targetName, lang);

    return {
      id: hashId(`${obj.label}::${art.title || idx}`),
      title: (art.title || '関連ニュース').trim(),
      source: (art.source || matchedChunk?.chunk?.title || 'Web News').trim(),
      publishedAt: (art.publishedAt || '').trim(),
      angle: (art.angle || (isJa ? '発見' : 'Discovery')).trim(),
      summary: (art.summary || '').trim(),
      connection: (art.connection || '').trim(),
      url: finalUrl,
      grounded: Boolean(matchedChunk?.chunk?.uri),
    };
  });

  // Fallback if JSON parsing failed completely but groundingChunks exist
  if (!articles.length && chunks.length) {
    articles = chunks.slice(0, 5).map((w, idx) => ({
      id: hashId(`${obj.label}::${w.uri}`),
      title: w.title || `${targetName} に関するニュース ${idx + 1}`,
      source: w.title || 'Google Search',
      publishedAt: '',
      angle: isJa ? '検索結果' : 'Search Result',
      summary: text.slice(0, 180),
      connection: isJa ? `${obj.label} に関連する最新トピック` : `Related news about ${obj.label}`,
      url: w.uri,
      grounded: true,
    }));
  }

  return {
    objectIntro: (parsed?.objectIntro || '').trim(),
    articles,
    queries,
    sources: chunks.slice(0, 8),
  };
}

function buildGoogleNewsSearchUrl(query, lang) {
  const hl = lang === 'ja' ? 'ja&gl=JP&ceid=JP:ja' : 'en-US&gl=US&ceid=US:en';
  return `https://news.google.com/search?q=${encodeURIComponent(query)}&hl=${hl}`;
}

function hashId(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `art-${(h >>> 0).toString(36)}`;
}
