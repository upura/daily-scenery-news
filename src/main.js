import {
  CameraController,
  cropBoxThumbnail,
  getContainedImageRect,
  resizeImageFile,
} from './camera.js';
import {
  detectObjectAtPoint,
  detectObjectsInImage,
  recommendNewsForObject,
} from './gemini.js';
import { getSampleScene } from './samples.js';
import {
  computeSerendipityStats,
  getApiKey,
  getArticleEval,
  getEvals,
  getScrapbook,
  getSettings,
  isSavedInScrapbook,
  saveSettings,
  setApiKey,
  toggleScrapbookItem,
  updateArticleEval,
} from './storage.js';

const $ = (id) => document.getElementById(id);

const els = {
  app: $('app'),
  viewfinderPanel: $('viewfinder-panel'),
  video: $('camera-video'),
  focusReticle: $('focus-reticle'),
  cameraFallback: $('camera-fallback'),
  cameraFallbackMsg: $('camera-fallback-msg'),
  btnFallbackUpload: $('btn-fallback-upload'),
  btnRetryCamera: $('btn-retry-camera'),
  btnUpload: $('btn-upload'),
  btnShutter: $('btn-shutter'),
  btnFlip: $('btn-flip'),
  fileInput: $('file-input'),

  resultStage: $('result-stage'),
  photoFrame: $('photo-frame'),
  capturedImg: $('captured-img'),
  overlayLayer: $('overlay-layer'),
  scanLine: $('scan-line'),
  btnRetake: $('btn-retake'),
  stageHint: $('stage-hint'),

  newsSheet: $('news-sheet'),
  sheetToggle: $('sheet-toggle'),
  objectsStatus: $('objects-status'),
  objectPills: $('object-pills'),
  newsContent: $('news-content'),

  btnSettings: $('btn-settings'),
  modalSettings: $('modal-settings'),
  btnCloseSettings: $('btn-close-settings'),
  inputApiKey: $('input-api-key'),
  btnToggleKey: $('btn-toggle-key'),
  selectThinking: $('select-thinking'),
  toggleCalm: $('toggle-calm'),
  selectLang: $('select-lang'),
  btnClearKey: $('btn-clear-key'),
  btnSaveSettings: $('btn-save-settings'),

  btnScrapbook: $('btn-scrapbook'),
  scrapCount: $('scrap-count'),
  modalScrapbook: $('modal-scrapbook'),
  btnCloseScrapbook: $('btn-close-scrapbook'),
  btnCloseScrapbook2: $('btn-close-scrapbook-2'),
  serendipityDashboard: $('serendipity-dashboard'),
  scrapbookList: $('scrapbook-list'),
  btnExportEval: $('btn-export-eval'),

  toast: $('toast'),
};

const camera = new CameraController(els.video);

const state = {
  mode: 'camera', // 'camera' | 'result'
  photo: null, // { dataUrl, base64, width, height }
  sceneSummary: '',
  objects: [],
  selectedId: null,
  newsCache: new Map(), // obj.id -> { status: 'loading'|'done'|'error', data, error }
  detectAbort: null,
  newsAbort: null,
  sheetExpanded: false,
};

let toastTimer = null;
function showToast(msg, duration = 2600) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, duration);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateScrapBadge() {
  els.scrapCount.textContent = String(getScrapbook().length);
}

/* -------------------- Camera Lifecycle -------------------- */

async function startCamera(facing) {
  els.cameraFallback.hidden = true;
  try {
    await camera.start(facing);
    els.cameraFallback.hidden = true;
  } catch (err) {
    els.cameraFallbackMsg.textContent =
      err?.message || 'カメラの起動が許可されませんでした。写真を選ぶかサンプル風景でお試しください。';
    els.cameraFallback.hidden = false;
  }
}

function switchToCameraMode() {
  state.detectAbort?.abort();
  state.newsAbort?.abort();
  state.mode = 'camera';
  state.photo = null;
  state.objects = [];
  state.selectedId = null;
  state.newsCache.clear();
  state.sheetExpanded = false;

  els.app.classList.remove('has-sheet', 'sheet-expanded');
  els.resultStage.hidden = true;
  els.newsSheet.hidden = true;
  els.viewfinderPanel.hidden = false;
  els.overlayLayer.innerHTML = '';
  els.objectPills.innerHTML = '';
  els.newsContent.innerHTML = '';

  startCamera();
}

/* -------------------- Photo Analysis Flow -------------------- */

async function analyzePhoto(photo) {
  if (!getApiKey()) {
    openSettingsModal();
    showToast('先に Gemini API キーを設定してください');
    return;
  }

  camera.stop();
  state.detectAbort?.abort();
  state.newsAbort?.abort();

  state.mode = 'result';
  state.photo = photo;
  state.sceneSummary = '';
  state.objects = [];
  state.selectedId = null;
  state.newsCache.clear();
  state.sheetExpanded = false;

  els.viewfinderPanel.hidden = true;
  els.resultStage.hidden = false;
  els.newsSheet.hidden = false;
  els.app.classList.add('has-sheet');
  els.app.classList.remove('sheet-expanded');

  els.capturedImg.src = photo.dataUrl;
  els.overlayLayer.innerHTML = '';
  els.scanLine.hidden = false;
  els.stageHint.hidden = true;
  els.objectsStatus.textContent = 'Gemini 4 Hydrogen でモノを検出しています…';
  els.objectPills.innerHTML = '';
  renderNewsSkeleton('風景の中のモノを探しています…');

  const controller = new AbortController();
  state.detectAbort = controller;

  try {
    const settings = getSettings();
    const { sceneSummary, objects } = await detectObjectsInImage(
      getApiKey(),
      photo.base64,
      settings.lang,
      controller.signal,
    );
    if (controller.signal.aborted) return;

    state.sceneSummary = sceneSummary;
    state.objects = objects;
    els.scanLine.hidden = true;
    els.stageHint.hidden = false;

    if (!objects.length) {
      els.objectsStatus.textContent = 'モノを検出できませんでした';
      els.newsContent.innerHTML = `
        <div class="state-box">
          <p>写真から明確なモノを見つけられませんでした。写真上の気になる場所をタップするか、別の角度から撮り直してみてください。</p>
          <button class="btn-primary" id="btn-empty-retake" type="button">撮り直す</button>
        </div>`;
      $('btn-empty-retake')?.addEventListener('click', switchToCameraMode);
      return;
    }

    els.objectsStatus.textContent = `見つかったモノ (${objects.length}件) — タップしてニュースを探索`;
    renderObjectPills();
    renderOverlays();
    selectObject(objects[0].id);
  } catch (err) {
    if (err.name === 'AbortError') return;
    els.scanLine.hidden = true;
    els.objectsStatus.textContent = '検出エラー';
    els.newsContent.innerHTML = `
      <div class="state-box">
        <p>${escapeHtml(err.message || '物体検出に失敗しました。')}</p>
        <button class="btn-primary" id="btn-err-settings" type="button">設定を確認する</button>
      </div>`;
    $('btn-err-settings')?.addEventListener('click', openSettingsModal);
  }
}

/* -------------------- Overlay & Object Selection -------------------- */

function renderOverlays() {
  els.overlayLayer.innerHTML = '';
  if (!state.objects.length || !els.capturedImg.naturalWidth) return;

  const rect = getContainedImageRect(els.capturedImg);
  for (const obj of state.objects) {
    const [ymin, xmin, ymax, xmax] = obj.box_2d;
    const left = rect.x + (xmin / 1000) * rect.w;
    const top = rect.y + (ymin / 1000) * rect.h;
    const width = Math.max(24, ((xmax - xmin) / 1000) * rect.w);
    const height = Math.max(24, ((ymax - ymin) / 1000) * rect.h);
    const cx = left + width / 2;
    const cy = top + height / 2;
    const isActive = obj.id === state.selectedId;

    const box = document.createElement('div');
    box.className = `obj-box${isActive ? ' active' : ''}`;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    els.overlayLayer.appendChild(box);

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = `obj-pin${isActive ? ' active' : ''}`;
    pin.style.left = `${Math.max(48, Math.min(els.photoFrame.clientWidth - 48, cx))}px`;
    pin.style.top = `${Math.max(32, Math.min(els.photoFrame.clientHeight - 32, cy))}px`;
    pin.textContent = obj.properNoun || obj.label;
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      selectObject(obj.id);
    });
    els.overlayLayer.appendChild(pin);
  }
}

function renderObjectPills() {
  els.objectPills.innerHTML = '';
  for (const obj of state.objects) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.role = 'tab';
    btn.className = `obj-pill${obj.id === state.selectedId ? ' active' : ''}`;
    btn.innerHTML = `<span>${escapeHtml(obj.properNoun || obj.label)}</span>${
      obj.context ? `<span class="obj-pill-sub">${escapeHtml(obj.context)}</span>` : ''
    }`;
    btn.addEventListener('click', () => selectObject(obj.id));
    els.objectPills.appendChild(btn);
  }
}

async function selectObject(objId) {
  const obj = state.objects.find((o) => o.id === objId);
  if (!obj) return;

  state.selectedId = objId;
  renderObjectPills();
  renderOverlays();

  const cached = state.newsCache.get(objId);
  if (cached?.status === 'done') {
    renderNewsPanel(obj, cached.data);
    return;
  }

  state.newsAbort?.abort();
  const controller = new AbortController();
  state.newsAbort = controller;

  state.newsCache.set(objId, { status: 'loading' });
  const thumb = cropBoxThumbnail(els.capturedImg, obj.box_2d);
  obj.thumb = thumb;

  renderNewsSkeleton(
    `「${obj.properNoun || obj.label}」に関する意外なニュースを Google 検索で探しています…`,
    obj,
  );

  try {
    const settings = getSettings();
    const data = await recommendNewsForObject(
      getApiKey(),
      obj,
      {
        thinkingLevel: settings.thinkingLevel,
        calmMode: settings.calmMode,
        lang: settings.lang,
        sceneSummary: state.sceneSummary,
      },
      controller.signal,
    );
    if (controller.signal.aborted) return;

    state.newsCache.set(objId, { status: 'done', data });
    if (state.selectedId === objId) {
      renderNewsPanel(obj, data);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    state.newsCache.set(objId, { status: 'error', error: err.message });
    if (state.selectedId === objId) {
      els.newsContent.innerHTML = `
        <div class="state-box">
          <p>${escapeHtml(err.message || 'ニュースの取得に失敗しました。')}</p>
          <button class="btn-primary" id="btn-retry-news" type="button">再試行</button>
        </div>`;
      $('btn-retry-news')?.addEventListener('click', () => {
        state.newsCache.delete(objId);
        selectObject(objId);
      });
    }
  }
}

/* -------------------- Tap-Anywhere Region Focus (§4.1) -------------------- */

async function handlePhotoTap(e) {
  if (state.mode !== 'result' || !state.photo || !els.scanLine.hidden) return;
  if (e.target.closest('.obj-pin') || e.target.closest('.floating-back-btn')) return;

  const rect = getContainedImageRect(els.capturedImg);
  const frameRect = els.photoFrame.getBoundingClientRect();
  const clickX = e.clientX - frameRect.left;
  const clickY = e.clientY - frameRect.top;

  const normX = (clickX - rect.x) / rect.w;
  const normY = (clickY - rect.y) / rect.h;
  if (normX < 0 || normX > 1 || normY < 0 || normY > 1) return;

  showToast('タップした場所のモノを特定しています…');
  els.scanLine.hidden = false;

  try {
    const settings = getSettings();
    const newObj = await detectObjectAtPoint(
      getApiKey(),
      state.photo.base64,
      normX,
      normY,
      settings.lang,
    );
    els.scanLine.hidden = true;
    if (!newObj) {
      showToast('その場所のモノを特定できませんでした');
      return;
    }
    state.objects.unshift(newObj);
    els.objectsStatus.textContent = `見つかったモノ (${state.objects.length}件) — タップしてニュースを探索`;
    selectObject(newObj.id);
  } catch (err) {
    els.scanLine.hidden = true;
    showToast(err.message || '特定に失敗しました');
  }
}

/* -------------------- News Panel Rendering -------------------- */

function renderNewsSkeleton(message, obj = null) {
  const bannerHtml = obj
    ? `<div class="object-banner">
         ${obj.thumb ? `<img class="object-thumb" src="${obj.thumb}" alt="" />` : ''}
         <div class="object-meta">
           <div class="object-title-row">
             <h3 class="object-title">${escapeHtml(obj.properNoun || obj.label)}</h3>
             ${obj.context ? `<span class="context-tag">${escapeHtml(obj.context)}</span>` : ''}
           </div>
           <p class="object-desc">${escapeHtml(message)}</p>
         </div>
       </div>`
    : `<div class="objects-status">${escapeHtml(message)}</div>`;

  els.newsContent.innerHTML = `
    ${bannerHtml}
    <div class="skeleton-card">
      <div class="skel w-40"></div>
      <div class="skel w-85"></div>
      <div class="skel w-100"></div>
      <div class="skel w-70"></div>
    </div>
    <div class="skeleton-card">
      <div class="skel w-40"></div>
      <div class="skel w-85"></div>
      <div class="skel w-100"></div>
    </div>`;
}

function renderNewsPanel(obj, data) {
  const thumb = obj.thumb || cropBoxThumbnail(els.capturedImg, obj.box_2d);
  obj.thumb = thumb;

  const parts = [];
  parts.push(`
    <div class="object-banner">
      ${thumb ? `<img class="object-thumb" src="${thumb}" alt="" />` : ''}
      <div class="object-meta">
        <div class="object-title-row">
          <h3 class="object-title">${escapeHtml(obj.properNoun || obj.label)}</h3>
          ${obj.context ? `<span class="context-tag">${escapeHtml(obj.context)}</span>` : ''}
        </div>
        <p class="object-desc">${escapeHtml(
          data.objectIntro || `「${obj.label}」にまつわる最新ニュースをピックアップしました。`,
        )}</p>
      </div>
    </div>
  `);

  if (!data.articles?.length) {
    parts.push(`
      <div class="state-box">
        <p>このモノに関連するニュース記事が見つかりませんでした。別のモノを選んでみてください。</p>
      </div>`);
  } else {
    for (const art of data.articles) {
      const saved = isSavedInScrapbook(art.id);
      const ev = getArticleEval(art.id);
      const isSerendipitous = ev.relevance && ev.novelty && ev.unexpectedness;

      parts.push(`
        <article class="news-card${isSerendipitous ? ' serendipitous' : ''}" data-art-id="${escapeHtml(art.id)}">
          <div class="news-card-top">
            <div class="news-meta-row">
              <span class="news-source">${escapeHtml(art.source)}</span>
              <span class="news-angle">${escapeHtml(art.angle)}</span>
              ${art.publishedAt ? `<span>${escapeHtml(art.publishedAt)}</span>` : ''}
            </div>
            <button class="bookmark-btn${saved ? ' saved' : ''}" type="button" data-action="bookmark" data-art-id="${escapeHtml(art.id)}" aria-label="スクラップ帳に保存">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>

          <a class="news-title-link" href="${escapeHtml(art.url)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(art.title)} ↗
          </a>

          ${art.summary ? `<p class="news-summary">${escapeHtml(art.summary)}</p>` : ''}
          ${
            art.connection
              ? `<p class="news-connection"><strong>身近なつながり:</strong> ${escapeHtml(art.connection)}</p>`
              : ''
          }

          <div class="serendipity-bar">
            <div class="serendipity-toggles">
              <button type="button" class="s-btn${ev.relevance ? ' on' : ''}" data-action="eval" data-field="relevance" data-art-id="${escapeHtml(art.id)}">関連あり</button>
              <button type="button" class="s-btn${ev.novelty ? ' on' : ''}" data-action="eval" data-field="novelty" data-art-id="${escapeHtml(art.id)}">初耳</button>
              <button type="button" class="s-btn${ev.unexpectedness ? ' on' : ''}" data-action="eval" data-field="unexpectedness" data-art-id="${escapeHtml(art.id)}">意外な発見</button>
            </div>
            ${isSerendipitous ? '<span class="serendipity-badge">✨ Serendipity!</span>' : ''}
          </div>
        </article>
      `);
    }
  }

  if (data.queries?.length) {
    parts.push(`
      <div class="grounding-box">
        <div><strong>Google 検索グラウンディング</strong>（Gemini 4 Hydrogen が自動生成した検索クエリ）</div>
        <div class="grounding-queries">
          ${data.queries
            .map(
              (q) =>
                `<a class="query-chip" href="https://www.google.com/search?q=${encodeURIComponent(
                  q,
                )}" target="_blank" rel="noopener noreferrer">🔍 ${escapeHtml(q)}</a>`,
            )
            .join('')}
        </div>
      </div>`);
  }

  els.newsContent.innerHTML = parts.join('');

  // Bind card actions
  els.newsContent.querySelectorAll('[data-action="bookmark"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const artId = btn.dataset.artId;
      const art = data.articles.find((a) => a.id === artId);
      if (!art) return;
      const { saved } = toggleScrapbookItem({
        ...art,
        objectLabel: obj.properNoun || obj.label,
        objectContext: obj.context,
        thumb: obj.thumb || '',
      });
      updateScrapBadge();
      renderNewsPanel(obj, data);
      showToast(saved ? 'スクラップ帳に保存しました' : 'スクラップ帳から外しました');
    });
  });

  els.newsContent.querySelectorAll('[data-action="eval"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const artId = btn.dataset.artId;
      const field = btn.dataset.field;
      const art = data.articles.find((a) => a.id === artId);
      if (!art) return;
      const updated = updateArticleEval(
        artId,
        {
          articleTitle: art.title,
          articleUrl: art.url,
          objectLabel: obj.properNoun || obj.label,
          objectContext: obj.context,
        },
        field,
      );
      renderNewsPanel(obj, data);
      if (updated.relevance && updated.novelty && updated.unexpectedness) {
        showToast('✨ セレンディピティ達成！（関連性・新規性・意外性）');
      }
    });
  });
}

/* -------------------- Modals (Settings & Scrapbook) -------------------- */

function openSettingsModal() {
  const s = getSettings();
  els.inputApiKey.value = getApiKey();
  els.selectThinking.value = s.thinkingLevel;
  els.toggleCalm.checked = s.calmMode;
  els.selectLang.value = s.lang;
  els.modalSettings.hidden = false;
}

function closeSettingsModal() {
  els.modalSettings.hidden = true;
}

function openScrapbookModal() {
  const stats = computeSerendipityStats();
  const pct = (n) => `${Math.round(n * 100)}%`;

  els.serendipityDashboard.innerHTML = `
    <div class="stat-tile highlight">
      <div class="stat-val">${pct(stats.serendipity)}</div>
      <div class="stat-lbl">Serendipity<br/>(論文平均 12%)</div>
    </div>
    <div class="stat-tile">
      <div class="stat-val">${pct(stats.relevance)}</div>
      <div class="stat-lbl">関連性</div>
    </div>
    <div class="stat-tile">
      <div class="stat-val">${pct(stats.novelty)}</div>
      <div class="stat-lbl">新規性</div>
    </div>
    <div class="stat-tile">
      <div class="stat-val">${stats.total}</div>
      <div class="stat-lbl">評価記事数</div>
    </div>
  `;

  const items = getScrapbook();
  if (!items.length) {
    els.scrapbookList.innerHTML = `
      <div class="state-box">
        <p>まだ保存したニュースはありません。気になる記事のブックマークアイコンを押すと、モノの写真と一緒にここに集まります。</p>
      </div>`;
  } else {
    els.scrapbookList.innerHTML = items
      .map(
        (item) => `
        <div class="scrap-item">
          ${item.thumb ? `<img class="scrap-thumb" src="${item.thumb}" alt="" />` : ''}
          <div class="scrap-body">
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)} ↗</a>
            <div class="scrap-sub">
              <span>📷 ${escapeHtml(item.objectLabel)}</span>
              <span>${escapeHtml(item.source)}</span>
            </div>
          </div>
          <button class="modal-close" type="button" data-remove-scrap="${escapeHtml(item.id)}" aria-label="削除">✕</button>
        </div>`,
      )
      .join('');

    els.scrapbookList.querySelectorAll('[data-remove-scrap]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleScrapbookItem({ id: btn.dataset.removeScrap });
        updateScrapBadge();
        openScrapbookModal();
      });
    });
  }

  els.modalScrapbook.hidden = false;
}

function closeScrapbookModal() {
  els.modalScrapbook.hidden = true;
}

function exportEvalLog() {
  const payload = {
    paper: 'Making News Familiar: News Recommendation from Daily Scenery (KES 2025, DOI: 10.1016/j.procs.2025.09.172)',
    model: 'gemini-4-hydrogen',
    exportedAt: new Date().toISOString(),
    summary: computeSerendipityStats(),
    evaluations: Object.values(getEvals()),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scenerynews-serendipity-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('評価ログを JSON でダウンロードしました');
}

/* -------------------- Event Wiring -------------------- */

function bindEvents() {
  // Camera shutter & controls
  els.btnShutter.addEventListener('click', () => {
    if (!camera.live) {
      els.fileInput.click();
      return;
    }
    const frame = camera.captureFrame();
    if (frame) {
      analyzePhoto(frame);
    } else {
      showToast('カメラ映像の準備中です…');
    }
  });

  els.btnFlip.addEventListener('click', () => {
    startCamera(camera.facingMode === 'environment' ? 'user' : 'environment');
  });

  els.btnUpload.addEventListener('click', () => els.fileInput.click());
  els.btnFallbackUpload.addEventListener('click', () => els.fileInput.click());
  els.btnRetryCamera.addEventListener('click', () => startCamera());

  els.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    els.fileInput.value = '';
    if (!file) return;
    try {
      const photo = await resizeImageFile(file);
      analyzePhoto(photo);
    } catch (err) {
      showToast(err.message || '画像を読み込めませんでした');
    }
  });

  // Tap reticle feedback on viewfinder
  els.video.addEventListener('click', (e) => {
    const rect = els.viewfinderPanel.getBoundingClientRect();
    els.focusReticle.style.left = `${e.clientX - rect.left}px`;
    els.focusReticle.style.top = `${e.clientY - rect.top}px`;
    els.focusReticle.hidden = false;
    els.focusReticle.style.animation = 'none';
    void els.focusReticle.offsetWidth;
    els.focusReticle.style.animation = '';
  });

  // Sample scene buttons
  document.querySelectorAll('.sample-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sample = getSampleScene(btn.dataset.sample);
      analyzePhoto(sample);
    });
  });

  // Drag & drop and clipboard paste (great on desktop!)
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const photo = await resizeImageFile(file);
      analyzePhoto(photo);
    }
  });
  window.addEventListener('paste', async (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) {
      const file = item.getAsFile();
      if (file) {
        const photo = await resizeImageFile(file);
        analyzePhoto(photo);
      }
    }
  });

  // Result stage interactions
  els.btnRetake.addEventListener('click', switchToCameraMode);
  els.photoFrame.addEventListener('click', handlePhotoTap);
  els.capturedImg.addEventListener('load', renderOverlays);
  window.addEventListener('resize', () => {
    if (state.mode === 'result') renderOverlays();
  });

  // Sheet expand/collapse toggle on mobile
  els.sheetToggle.addEventListener('click', () => {
    state.sheetExpanded = !state.sheetExpanded;
    els.app.classList.toggle('sheet-expanded', state.sheetExpanded);
    setTimeout(renderOverlays, 320);
  });

  // Settings modal
  els.btnSettings.addEventListener('click', openSettingsModal);
  els.btnCloseSettings.addEventListener('click', closeSettingsModal);
  els.modalSettings.addEventListener('click', (e) => {
    if (e.target === els.modalSettings) closeSettingsModal();
  });

  els.btnToggleKey.addEventListener('click', () => {
    const isPwd = els.inputApiKey.type === 'password';
    els.inputApiKey.type = isPwd ? 'text' : 'password';
    els.btnToggleKey.textContent = isPwd ? '隠す' : '表示';
  });

  els.btnClearKey.addEventListener('click', () => {
    setApiKey('');
    els.inputApiKey.value = '';
    showToast('API キーを削除しました');
  });

  els.btnSaveSettings.addEventListener('click', () => {
    const key = els.inputApiKey.value.trim();
    if (!key) {
      showToast('Gemini API キーを入力してください');
      els.inputApiKey.focus();
      return;
    }
    setApiKey(key);
    saveSettings({
      thinkingLevel: els.selectThinking.value,
      calmMode: els.toggleCalm.checked,
      lang: els.selectLang.value,
    });
    closeSettingsModal();
    showToast('設定を保存しました');
  });

  // Scrapbook modal
  els.btnScrapbook.addEventListener('click', openScrapbookModal);
  els.btnCloseScrapbook.addEventListener('click', closeScrapbookModal);
  els.btnCloseScrapbook2.addEventListener('click', closeScrapbookModal);
  els.modalScrapbook.addEventListener('click', (e) => {
    if (e.target === els.modalScrapbook) closeScrapbookModal();
  });
  els.btnExportEval.addEventListener('click', exportEvalLog);
}

/* -------------------- Bootstrap -------------------- */

function init() {
  updateScrapBadge();
  bindEvents();
  startCamera();

  if (!getApiKey()) {
    openSettingsModal();
  }
}

init();
