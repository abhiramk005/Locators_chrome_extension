// sidepanel/panel.js
const list = document.getElementById('list');
const inspectBtn = document.getElementById('inspect-btn');
const extractBtn = document.getElementById('extract-dom-btn');
const autoCrawlBtn = document.getElementById('auto-crawl-btn');
const copyAllBtn = document.getElementById('copy-all-btn');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');
const countBadge = document.getElementById('count-badge');

let sessionElements = [];

// ── DEDUPLICATION ──
const locatorSeen = new Set();
const fingerprintSeen = new Set();

function makeFingerprint(item) {
  const text = (item.metadata.text || item.metadata.placeholder || item.metadata.ariaLabel || '')
    .toLowerCase().trim().substring(0, 40);
  const role = item.metadata.role || item.metadata.tagName;
  const context = item.metadata.location_context || '';
  const type = item.metadata.type || '';
  return `${role}|${type}|${text}|${context}`;
}

function isDuplicate(item) {
  if (locatorSeen.has(item.locator)) return true;
  if (fingerprintSeen.has(makeFingerprint(item))) return true;
  return false;
}

function registerElement(item, locator) {
  locatorSeen.add(locator);
  fingerprintSeen.add(makeFingerprint(item));
}

function updateCount() {
  if (countBadge) countBadge.textContent = sessionElements.length;
}

// ── Send highlight message to active tab ──
async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
}

// ── Ping-based content script health check ──
async function ensureContentScript(tabId) {
  const alive = await new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
      if (chrome.runtime.lastError || !response) resolve(false);
      else resolve(true);
    });
    setTimeout(() => resolve(false), 300);
  });

  if (!alive) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['utils/dom-utils.js'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
}

// ── CLICK & EXTRACT ──
inspectBtn.onclick = async () => {
  const active = inspectBtn.classList.toggle('active');
  inspectBtn.textContent = active ? 'STOP' : 'CLICK & EXTRACT';
  chrome.runtime.sendMessage({ type: 'STATE_SYNC', value: active });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_INSPECT', value: active });
  }
};

// ── EXTRACT DOM ──
extractBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'CRAWL_PAGE' });
  }
};

// ── AUTO CRAWL ──
autoCrawlBtn.onclick = async () => {
  const active = autoCrawlBtn.classList.toggle('active');
  autoCrawlBtn.textContent = active ? 'AUTO CRAWL: ON' : 'AUTO CRAWL: OFF';
  chrome.runtime.sendMessage({ type: 'AUTO_CRAWL_SYNC', value: active });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: active ? 'START_AUTO_CRAWL' : 'STOP_AUTO_CRAWL' });
  }
};

// ── CLEAR ALL ──
clearBtn.onclick = () => {
  if (confirm('Clear all captured elements?')) {
    sessionElements = [];
    locatorSeen.clear();
    fingerprintSeen.clear();
    list.innerHTML = '';
    updateCount();
  }
};

// ── INCOMING MESSAGES ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DISPLAY_LOCATOR') {
    processNewElements([{ locator: msg.locator, metadata: msg.metadata }], null, 'click');
  }
  if (msg.type === 'CRAWL_RESULTS') {
    processNewElements(msg.results, msg.url, msg.source);
  }
});

// ── PROCESS & DEDUPLICATE ──
function processNewElements(newItems, url, source) {
  let addedCount = 0;

  newItems.forEach(item => {
    if (isDuplicate(item)) return;

    const data = {
      id: crypto.randomUUID(),
      ai_purpose: `A ${item.metadata.role} with text "${item.metadata.text || item.metadata.placeholder || 'N/A'}" (${item.metadata.location_context})`,
      locator: item.locator,
      technical_details: item.metadata,
      source: source || 'manual',
      url: url || null
    };

    registerElement(item, item.locator);
    sessionElements.push(data);
    renderItem(data);
    addedCount++;
  });

  if (addedCount > 0 && url && source === 'crawl') {
    renderPageDivider(url, addedCount);
  }

  updateCount();
}

function renderItem(data) {
  const sourceTag = data.source === 'crawl'
    ? `<span class="source-tag crawl">CRAWL</span>`
    : `<span class="source-tag click">CLICK</span>`;

  const div = document.createElement('div');
  div.className = 'item';
  div.id = `item-${data.id}`;
  div.innerHTML = `
    <button class="remove-btn" title="Remove">&times;</button>
    ${sourceTag}
    <div class="purpose">${data.ai_purpose}</div>
    <code>${data.locator}</code>
  `;

  // ── Highlight on hover ──
  // When mouse enters a panel item, send the locator to content.js
  // which finds the element on the page and draws an amber highlight box on it.
  div.addEventListener('mouseenter', () => {
    sendToActiveTab({ type: 'HIGHLIGHT_LOCATOR', locator: data.locator });
  });
  div.addEventListener('mouseleave', () => {
    sendToActiveTab({ type: 'CLEAR_HIGHLIGHT' });
  });

  div.querySelector('.remove-btn').onclick = () => {
    locatorSeen.delete(data.locator);
    sessionElements = sessionElements.filter(el => el.id !== data.id);
    div.remove();
    updateCount();
  };

  list.prepend(div);
}

function renderPageDivider(url, count) {
  const label = document.createElement('div');
  label.className = 'page-divider';
  try {
    const u = new URL(url);
    label.textContent = `↑ ${u.hostname}${u.pathname} — ${count} element${count !== 1 ? 's' : ''}`;
  } catch {
    label.textContent = `↑ ${url} — ${count} element${count !== 1 ? 's' : ''}`;
  }
  list.prepend(label);
}

// ── DOWNLOAD ──
downloadBtn.onclick = () => {
  if (sessionElements.length === 0) return;
  const blob = new Blob([JSON.stringify(buildExportData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `locators-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── COPY JSON ──
copyAllBtn.onclick = () => {
  if (sessionElements.length === 0) return;
  navigator.clipboard.writeText(JSON.stringify(buildExportData(), null, 2)).then(() => {
    const old = copyAllBtn.textContent;
    copyAllBtn.textContent = 'JSON COPIED!';
    setTimeout(() => copyAllBtn.textContent = old, 1500);
  });
};

function buildExportData() {
  return sessionElements.map(el => {
    // Build context — omit any key whose value is null/undefined/empty
    const ctx = {};
    if (el.technical_details.tagName)  ctx.tag      = el.technical_details.tagName;
    if (el.technical_details.type)     ctx.type     = el.technical_details.type;
    if (el.technical_details.nameAttr) ctx.name     = el.technical_details.nameAttr;
    if (el.technical_details.ariaLabel) ctx.ariaLabel = el.technical_details.ariaLabel;

    // Build top-level entry — omit source, and omit url if null
    const entry = {
      purpose: el.ai_purpose,
      locator: el.locator,
    };
    if (el.url) entry.url = el.url;
    if (Object.keys(ctx).length > 0) entry.context = ctx;

    return entry;
  });
}