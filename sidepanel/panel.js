// sidepanel/panel.js

// ── DOM refs ──
const list           = document.getElementById('list');
const inspectBtn     = document.getElementById('inspect-btn');
const extractBtn     = document.getElementById('extract-dom-btn');
const autoCrawlBtn   = document.getElementById('auto-crawl-btn');
const clearBtn       = document.getElementById('clear-btn');
const countBadge     = document.getElementById('count-badge');

// ── TABS ──
document.querySelectorAll('.tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.add('hidden'); });
    tab.classList.add('active');
    const panel = document.getElementById('tab-' + tab.dataset.tab);
    if (panel) panel.classList.remove('hidden');

    // Parse and render CSV only when user opens Tests tab
    if (tab.dataset.tab === 'csv') {
      if (sessionCsv.length > 0) renderInlineCsv(sessionCsv);
    }
  });
});

const projectSelect    = document.getElementById('project-select');
const newProjectBtn    = document.getElementById('new-project-btn');
const deleteProjectBtn = document.getElementById('delete-project-btn');
const projectStats     = document.getElementById('project-stats');
const statTests        = document.getElementById('stat-tests');
const statKeywords     = document.getElementById('stat-keywords');
const statVariables    = document.getElementById('stat-variables');
const statStorage      = document.getElementById('stat-storage');

const settingsBtn      = document.getElementById('settings-btn');
const settingsPopup    = document.getElementById('settings-popup');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const keysList         = document.getElementById('keys-list');
const activeKeyInfo    = document.getElementById('active-key-info');
const newKeyLabel      = document.getElementById('new-key-label');
const newKeyValue      = document.getElementById('new-key-value');
const addKeyBtn        = document.getElementById('add-key-btn');
const toggleAddKeyBtn  = document.getElementById('toggle-add-key-btn');
const addKeyForm       = document.getElementById('add-key-form');

const csvInput         = document.getElementById('csv-input');
const csvLabel         = document.getElementById('csv-label');
const clearCsvBtn      = document.getElementById('clear-csv-btn');
const csvStatus        = document.getElementById('csv-status');
const csvParsed        = document.getElementById('csv-parsed');

const generateBtn      = document.getElementById('generate-btn');
const downloadBtn      = document.getElementById('download-btn');
const copyJsonBtn      = document.getElementById('copy-json-btn');
const resetFilesBtn    = document.getElementById('reset-files-btn');
const generateStatus   = document.getElementById('generate-status');
const csvCountBadge    = document.getElementById('csv-count-badge');

// ── Manual form refs ──
const toggleManualBtn  = document.getElementById('toggle-manual-btn');
const manualAddForm    = document.getElementById('manual-add-form');
const manualIdInput    = document.getElementById('manual-id');
const manualTitleInput = document.getElementById('manual-title');
const manualPriority   = document.getElementById('manual-priority');
const manualStepsList  = document.getElementById('manual-steps-list');
const addStepBtn       = document.getElementById('add-step-btn');
const saveManualBtn    = document.getElementById('save-manual-btn');

// ── Session state ──
let sessionElements   = [];
let sessionCsv        = [];   // CSV lives in RAM only — cleared on panel close
const locatorSeen     = new Set();
const fingerprintSeen = new Set();
let activeProject     = '';
let pendingFiles      = null;  // Claude's raw response, waiting for approval
let pendingMeta       = null;  // token/cost info for the review header



// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════

async function init() {
  await refreshProjectSelect();

  const last = await Storage.getActiveProject();
  if (last && projectSelect.querySelector('option[value="' + last + '"]')) {
    projectSelect.value = last;
    activeProject = last;
    await refreshProjectStats();
    await renderFileViewer();
  }
}

// ══════════════════════════════════════════════════════════
// PROJECT MANAGEMENT
// ══════════════════════════════════════════════════════════

async function refreshProjectSelect() {
  const projects = await Storage.getAllProjects();
  const names    = Object.keys(projects).sort();
  const current  = projectSelect.value;

  projectSelect.innerHTML = '<option value="">— select project —</option>';
  for (const name of names) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    projectSelect.appendChild(opt);
  }

  if (current && projects[current]) projectSelect.value = current;
}

async function refreshProjectStats() {
  if (!activeProject) {
    projectStats.classList.add('hidden');
    return;
  }

  const files     = await Storage.getRobotFiles(activeProject);
  const tests     = RobotMerger.parseTestNames(files['tests.robot'] || '').size;
  const keywords  = RobotMerger.parseKeywordNames(files['keywords.robot'] || '').size;
  const variables = RobotMerger.parseVariableNames(files['variables.robot'] || '').size;
  const kb        = await Storage.getUsageKb();

  statTests.textContent     = `${tests} tests`;
  statKeywords.textContent  = `${keywords} keywords`;
  statVariables.textContent = `${variables} variables`;
  statStorage.textContent   = `${kb} KB used`;

  projectStats.classList.remove('hidden');
}

projectSelect.onchange = async () => {
  activeProject = projectSelect.value;
  await Storage.setActiveProject(activeProject);
  await refreshProjectStats();
  await renderFileViewer();
  // Clear session CSV when switching projects — it belonged to the previous project
  sessionCsv = [];
  csvParsed.classList.add('hidden');
  csvParsed.innerHTML = '';
  csvStatus.textContent = 'No CSV uploaded yet';
  csvStatus.style.color = 'var(--muted)';
  updateCsvBadge();
};

newProjectBtn.onclick = async () => {
  const name = prompt('Project name (e.g. HomeWAV Inmate):');
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  await Storage.createProject(trimmed);
  await refreshProjectSelect();
  projectSelect.value = trimmed;
  activeProject = trimmed;
  await Storage.setActiveProject(trimmed);
  await refreshProjectStats();
  await renderFileViewer();
  // Fresh project — clear any leftover CSV from previous session
  sessionCsv = [];
  csvParsed.classList.add('hidden');
  csvParsed.innerHTML = '';
  csvStatus.textContent = 'No CSV uploaded yet';
  csvStatus.style.color = 'var(--muted)';
};

deleteProjectBtn.onclick = async () => {
  if (!activeProject) return;
  if (!confirm(`Delete project "${activeProject}" and all its files? This cannot be undone.`)) return;
  await Storage.deleteProject(activeProject);
  activeProject = '';
  sessionCsv = [];
  await refreshProjectSelect();
  projectStats.classList.add('hidden');
  csvStatus.textContent = '';
  csvParsed.classList.add('hidden');
  csvParsed.innerHTML = '';
};

// ══════════════════════════════════════════════════════════
// SETTINGS POPUP — API KEYS
// ══════════════════════════════════════════════════════════

settingsBtn.onclick = () => {
  const isNowHidden = settingsPopup.classList.toggle('hidden');
  settingsBtn.classList.toggle('active', !isNowHidden);
  if (!isNowHidden) renderKeysList();
};

closeSettingsBtn.onclick = () => {
  settingsPopup.classList.add('hidden');
  settingsBtn.classList.remove('active');
};

async function renderKeysList() {
  const keys     = await Storage.getApiKeys();
  const activeId = await Storage.getActiveKeyId();

  if (keys.length === 0) {
    keysList.innerHTML = '<div class="no-keys-msg">No API keys saved yet</div>';
    activeKeyInfo.textContent = '';
    return;
  }

  const activeKey = keys.find(function(k) { return k.id === activeId; }) || keys[0];
  activeKeyInfo.textContent = 'Active: ' + activeKey.label + ' (' + activeKey.key.slice(0, 12) + '...)';

  keysList.innerHTML = '';
  keys.forEach(function(k) {
    const row = document.createElement('div');
    row.className = 'key-row' + (k.id === activeId ? ' active-key' : '');

    const dot = document.createElement('div');
    dot.style.width       = '7px';
    dot.style.height      = '7px';
    dot.style.borderRadius = '50%';
    dot.style.flexShrink  = '0';
    if (k.id === activeId) dot.style.background = 'var(--success)';

    const labelEl = document.createElement('span');
    labelEl.className   = 'key-row-label';
    labelEl.textContent = k.label;

    const valueEl = document.createElement('span');
    valueEl.className   = 'key-row-value';
    valueEl.textContent = k.key.slice(0, 14) + '...';

    const delBtn = document.createElement('button');
    delBtn.className   = 'key-row-delete';
    delBtn.title       = 'Delete';
    delBtn.textContent = '🗑';

    row.appendChild(dot);
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    row.appendChild(delBtn);

    row.addEventListener('click', async function(e) {
      if (e.target === delBtn) return;
      await Storage.setActiveKeyId(k.id);
      renderKeysList();
    });

    delBtn.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (!confirm('Delete key "' + k.label + '"?')) return;
      await Storage.deleteApiKey(k.id);
      renderKeysList();
    });

    keysList.appendChild(row);
  });
}

toggleAddKeyBtn.onclick = function() {
  const isHidden = addKeyForm.classList.toggle('hidden');
  toggleAddKeyBtn.textContent = isHidden ? '＋' : '✕';
  toggleAddKeyBtn.title = isHidden ? 'Add new key' : 'Cancel';
  if (!isHidden) newKeyLabel.focus();
};

addKeyBtn.onclick = async function() {
  const label = newKeyLabel.value.trim();
  const key   = newKeyValue.value.trim();
  if (!key) { alert('Enter an API key value'); return; }
  if (!key.startsWith('sk-ant-')) { alert('Invalid key — should start with sk-ant-'); return; }
  await Storage.addApiKey(label || 'Key', key);
  newKeyLabel.value = '';
  newKeyValue.value = '';
  addKeyForm.classList.add('hidden');
  toggleAddKeyBtn.textContent = '＋';
  toggleAddKeyBtn.title = 'Add new key';
  renderKeysList();
};

// ══════════════════════════════════════════════════════════
// CSV UPLOAD — RAM only, no storage
// ══════════════════════════════════════════════════════════

csvInput.onchange = async (e) => {
  if (!activeProject) { alert('Select or create a project first'); csvInput.value = ''; return; }
  const file = e.target.files[0];
  if (!file) return;
  const text  = await file.text();
  const cases = CsvParser.parse(text);
  if (cases.length === 0) {
    csvStatus.textContent = '✗ No test cases found — check CSV format';
    csvStatus.style.color = 'var(--red)';
    return;
  }
  sessionCsv = cases;
  csvStatus.textContent = `✓ ${cases.length} test cases loaded from ${file.name}`;
  csvStatus.style.color = 'var(--green)';
  updateCsvBadge();
  renderInlineCsv(cases);
};

clearCsvBtn.onclick = () => {
  if (!confirm('Clear loaded CSV?')) return;
  sessionCsv = [];
  csvStatus.textContent = 'No CSV uploaded yet';
  csvStatus.style.color = 'var(--muted)';
  csvParsed.classList.add('hidden');
  csvParsed.innerHTML = '';
  csvInput.value = '';
  updateCsvBadge();
};

// ── CSV count badge on Tests tab ──
function updateCsvBadge() {
  if (sessionCsv.length > 0) {
    csvCountBadge.textContent = sessionCsv.length;
    csvCountBadge.classList.remove('hidden');
  } else {
    csvCountBadge.classList.add('hidden');
  }
}

// ── INLINE CSV RENDER ──
function renderInlineCsv(cases) {
  if (!csvParsed) return;
  csvParsed.classList.remove('hidden');
  csvParsed.innerHTML = '';

  // Summary row
  const summary = document.createElement('div');
  summary.className = 'csv-summary';
  summary.textContent = `✓ ${cases.length} test case${cases.length !== 1 ? 's' : ''}`;
  csvParsed.appendChild(summary);

  cases.forEach(function(tc) {
    const priorityClass = tc.priority === 'Critical' ? 'critical' : tc.priority === 'High' ? 'high' : '';
    const safeTitle     = tc.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const manualTag     = tc.manual ? '<span class="tc-pill manual">MANUAL</span>' : '';
    const maxLen        = Math.max(tc.steps.length, tc.expected.length);

    let stepsRows = '';
    for (let i = 0; i < maxLen; i++) {
      const step     = (tc.steps[i]    || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const expected = (tc.expected[i] || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      stepsRows += `<tr><td>${step}</td><td>${expected}</td></tr>`;
    }

    const card = document.createElement('div');
    card.className = 'tc-inline';
    card.id = `tc-${tc.id}`;
    card.innerHTML = `
      <div class="tc-inline-head">
        <span class="tc-inline-id">TC-${tc.id}</span>
        <span class="tc-inline-title">${safeTitle}</span>
        <div class="tc-inline-meta">
          <span class="tc-pill ${priorityClass}">${tc.priority}</span>
          ${manualTag}
          <span class="tc-pill">${tc.steps.length} steps</span>
        </div>
        <button class="tc-remove-btn icon-btn danger" title="Remove test case">✕</button>
        <span class="tc-inline-chevron">›</span>
      </div>
      <div class="tc-inline-body">
        ${tc.preconditions ? `<div class="tc-precondition">Pre: ${tc.preconditions}</div>` : ''}
        ${maxLen > 0 ? `<table class="tc-steps-table"><thead><tr><th>Step</th><th>Expected</th></tr></thead><tbody>${stepsRows}</tbody></table>` : ''}
      </div>
    `;

    // Expand/collapse on head click (but not remove btn)
    card.querySelector('.tc-inline-head').addEventListener('click', function(e) {
      if (e.target.closest('.tc-remove-btn')) return;
      card.classList.toggle('open');
    });

    // Remove this test case
    card.querySelector('.tc-remove-btn').addEventListener('click', function(e) {
      e.stopPropagation();
      sessionCsv = sessionCsv.filter(t => t.id !== tc.id);
      card.remove();
      // Update summary count
      const s = csvParsed.querySelector('.csv-summary');
      if (s) s.textContent = `✓ ${sessionCsv.length} test case${sessionCsv.length !== 1 ? 's' : ''}`;
      // Update status and badge
      if (sessionCsv.length === 0) {
        csvStatus.textContent = 'No CSV uploaded yet';
        csvStatus.style.color = 'var(--muted)';
        csvParsed.classList.add('hidden');
      } else {
        csvStatus.textContent = `✓ ${sessionCsv.length} test case${sessionCsv.length !== 1 ? 's' : ''} loaded`;
        csvStatus.style.color = 'var(--green)';
      }
      updateCsvBadge();
    });

    csvParsed.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════
// DOM CAPTURE
// ══════════════════════════════════════════════════════════

function makeFingerprint(item) {
  const text    = (item.metadata.text || item.metadata.placeholder || item.metadata.ariaLabel || '')
                    .toLowerCase().trim().substring(0, 40);
  const role    = item.metadata.role || item.metadata.tagName;
  const context = item.metadata.location_context || '';
  const type    = item.metadata.type || '';
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

async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
}

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

extractBtn.onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'CRAWL_PAGE' });
  }
};

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

clearBtn.onclick = () => {
  if (!confirm('Clear all captured elements this session?')) return;
  sessionElements = [];
  locatorSeen.clear();
  fingerprintSeen.clear();
  list.innerHTML = '';
  updateCount();
};

// ── Incoming messages ──
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'DISPLAY_LOCATOR') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url || null;
      processNewElements([{ locator: msg.locator, metadata: msg.metadata }], url, 'click');
    });
  }
  if (msg.type === 'CRAWL_RESULTS') {
    processNewElements(msg.results, msg.url, msg.source);
  }
});

function processNewElements(newItems, url, source) {
  let addedCount = 0;
  newItems.forEach(item => {
    if (isDuplicate(item)) return;
    const data = {
      id: crypto.randomUUID(),
      ai_purpose: `A ${item.metadata.role} with text "${item.metadata.text || item.metadata.placeholder || 'N/A'}" (${item.metadata.location_context})`,
      locator:          item.locator,
      technical_details: item.metadata,
      source: source || 'manual',
      url:    url || null
    };
    registerElement(item, item.locator);
    sessionElements.push(data);
    renderItem(data);
    addedCount++;
  });
  if (addedCount > 0 && url && source === 'crawl') renderPageDivider(url, addedCount);
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

  div.addEventListener('mouseenter', () => {
    sendToActiveTab({ type: 'HIGHLIGHT_LOCATOR', locator: data.locator });
  });
  div.addEventListener('mouseleave', () => {
    sendToActiveTab({ type: 'CLEAR_HIGHLIGHT' });
  });

  div.querySelector('.remove-btn').onclick = () => {
    locatorSeen.delete(data.locator);
    fingerprintSeen.delete(makeFingerprint({ metadata: data.technical_details }));
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

// ══════════════════════════════════════════════════════════
// BUILD EXPORT DATA (DOM elements for AI)
// ══════════════════════════════════════════════════════════

function buildExportData() {
  const unanchored = sessionElements.filter(el => !el.url);
  const crawled    = sessionElements.filter(el =>  el.url);
  const pageMap    = new Map();

  crawled.forEach(el => {
    if (!pageMap.has(el.url)) pageMap.set(el.url, []);
    pageMap.get(el.url).push(buildElement(el));
  });

  const result = {};
  if (unanchored.length > 0) result.elements = unanchored.map(buildElement);
  if (pageMap.size > 0) {
    result.pages = [...pageMap.entries()].map(([url, elements]) => ({ url, elements }));
  }
  return result;
}

function buildElement(el) {
  const ctx = {};
  if (el.technical_details.tagName)   ctx.tag       = el.technical_details.tagName;
  if (el.technical_details.type)      ctx.type      = el.technical_details.type;
  if (el.technical_details.nameAttr)  ctx.name      = el.technical_details.nameAttr;
  if (el.technical_details.ariaLabel) ctx.ariaLabel = el.technical_details.ariaLabel;

  const entry = { purpose: el.ai_purpose, locator: el.locator };
  if (Object.keys(ctx).length > 0) entry.context = ctx;
  return entry;
}

// ══════════════════════════════════════════════════════════
// COPY DOM JSON
// ══════════════════════════════════════════════════════════

copyJsonBtn.onclick = () => {
  if (sessionElements.length === 0) { alert('No elements captured yet'); return; }
  navigator.clipboard.writeText(JSON.stringify(buildExportData(), null, 2)).then(() => {
    const old = copyJsonBtn.textContent;
    copyJsonBtn.textContent = 'COPIED!';
    setTimeout(() => copyJsonBtn.textContent = old, 1500);
  });
};

// ══════════════════════════════════════════════════════════
// GENERATE TESTS
// ══════════════════════════════════════════════════════════

generateBtn.onclick = async () => {
  if (!activeProject) {
    setStatus('✗ Select or create a project first', 'error'); return;
  }
  if (sessionElements.length === 0) {
    setStatus('✗ No DOM elements captured — use Extract DOM first', 'error'); return;
  }
  if (sessionCsv.length === 0) {
    setStatus('✗ No CSV uploaded — go to Tests tab and upload a CSV', 'error'); return;
  }

  const apiKey = await Storage.getActiveKey();
  if (!apiKey) {
    setStatus('✗ No API key saved — enter it in Settings', 'error'); return;
  }

  const testCases     = sessionCsv;
  const existingFiles = await Storage.getRobotFiles(activeProject);
  const domData       = buildExportData();
  const allElements   = [
    ...(domData.elements || []),
    ...(domData.pages || []).flatMap(p => p.elements)
  ];
  const userPrompt    = PromptBuilder.buildUserPrompt(allElements, testCases, existingFiles);

  setStatus(`Sending ${testCases.length} test cases + ${sessionElements.length} DOM elements to Claude...`, 'info');
  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ GENERATING...';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type':      'application/json'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 16000,
        system:     PromptBuilder.SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(`API error: ${data.error.message}`);
    if (data.stop_reason === 'max_tokens') throw new Error('Response truncated — payload too large');

    // Parse response
    let text = data.content[0].text.trim();
    if (text.startsWith('```')) {
      text = text.split('\n').slice(1).join('\n');
      text = text.split('```')[0].trim();
    }

    let newFiles;
    try {
      newFiles = JSON.parse(text);
    } catch (parseErr) {
      throw new Error(
        'Claude returned malformed JSON. Try again or reduce test cases.\n' +
        'Response starts: ' + text.substring(0, 120)
      );
    }
    const usage    = data.usage || {};
    const cost     = ((usage.input_tokens || 0) / 1e6 * 0.25) + ((usage.output_tokens || 0) / 1e6 * 1.25);

    pendingFiles = newFiles;
    pendingMeta  = {
      tokens: `${usage.input_tokens || '?'} in / ${usage.output_tokens || '?'} out`,
      cost:   `$${cost.toFixed(4)}`
    };

    setStatus(
      `Review the output below, then Approve or Discard.\n` +
      `Tokens: ${usage.input_tokens || '?'} in / ${usage.output_tokens || '?'} out | Est. $${cost.toFixed(4)}`,
      'info'
    );

    showReviewPanel(newFiles);

  } catch (err) {
    setStatus(`✗ ${err.message}`, 'error');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '⚡ GENERATE TESTS';
  }
};

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

function setStatus(msg, type = 'info') {
  generateStatus.textContent = msg;
  generateStatus.className   = `generate-status ${type}`;
}

// ======================================================
// REVIEW PANEL
// ======================================================

let activeReviewTab = 'variables.robot';

function highlightRobot(raw) {
  if (!raw || !raw.trim()) return '<span class="review-empty">Nothing new for this file.</span>';
  const escaped = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/(^\*{3}.*?\*{3})/gm, '<span class="kw-section">$1</span>')
    .replace(/(\$\{[^}]+\})/g, '<span class="kw-var">$1</span>')
    .replace(/^(Library|Resource|Suite Setup|Suite Teardown|Test Setup|Test Teardown)(\s)/gm, '<span class="kw-setting">$1</span>$2')
    .replace(/(#.*$)/gm, '<span class="kw-comment">$1</span>')
    .replace(/^([A-Z][^\n$\[]{3,60})$/gm, '<span class="kw-name">$1</span>');
}

function showReviewPanel(files) {
  const panel = document.getElementById('review-panel');
  panel.classList.remove('hidden');

  // Reset to first tab
  activeReviewTab = 'variables.robot';
  document.querySelectorAll('.review-tab').forEach(b => b.classList.remove('active'));
  document.querySelector('.review-tab[data-file="variables.robot"]').classList.add('active');
  renderReviewContent();

  // Scroll review panel into view
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideReviewPanel() {
  document.getElementById('review-panel').classList.add('hidden');
  pendingFiles = null;
  pendingMeta  = null;
}

function renderReviewContent() {
  if (!pendingFiles) return;
  const viewer  = document.getElementById('review-viewer');
  const raw     = (pendingFiles[activeReviewTab] || '').trim();
  viewer.innerHTML = '<div class="file-content">' + highlightRobot(raw) + '</div>';
}

// Tab switching
document.querySelectorAll('.review-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.review-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeReviewTab = btn.dataset.file;
    renderReviewContent();
  });
});

// Approve
document.getElementById('approve-btn').onclick = async function() {
  if (!pendingFiles || !activeProject) return;

  const existingFiles = await Storage.getRobotFiles(activeProject);
  const mergedFiles   = {};
  const mergeLog      = [];

  for (const filename of ['variables.robot', 'keywords.robot', 'tests.robot']) {
    const existing = existingFiles[filename] || '';
    const merged   = RobotMerger.merge(filename, existing, pendingFiles[filename] || '');
    const stats    = RobotMerger.countNew(filename, existing, merged);
    mergedFiles[filename] = merged;
    mergeLog.push(`${filename}: ${stats}`);
  }

  await Storage.saveRobotFiles(activeProject, mergedFiles);
  await refreshProjectStats();
  await renderFileViewer();

  const meta = pendingMeta || {};
  setStatus(
    `Approved & saved! ${mergeLog.join(' | ')}\n` +
    `Tokens: ${meta.tokens || '?'} | Est. ${meta.cost || '?'}`,
    'ok'
  );

  hideReviewPanel();
};

// Discard
document.getElementById('discard-btn').onclick = function() {
  if (!confirm('Discard generated output? Nothing will be saved.')) return;
  setStatus('Discarded. Nothing was saved.', 'info');
  hideReviewPanel();
};

// ══════════════════════════════════════════════════════════
// FILES TAB — Download + Reset moved here
// ══════════════════════════════════════════════════════════

downloadBtn.onclick = async () => {
  if (!activeProject) { alert('Select a project first'); return; }

  const files      = await Storage.getRobotFiles(activeProject);
  const hasContent = Object.values(files).some(c => c && c.trim().length > 0);

  if (!hasContent) {
    alert('No robot files generated yet for this project');
    return;
  }

  for (const [filename, content] of Object.entries(files)) {
    if (!content || !content.trim()) continue;
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    await new Promise(r => setTimeout(r, 200));
  }
};

resetFilesBtn.onclick = async () => {
  if (!activeProject) return;
  if (!confirm(`Reset ALL robot files for "${activeProject}"? This cannot be undone.`)) return;
  await Storage.clearRobotFiles(activeProject);
  await refreshProjectStats();
  await renderFileViewer();
  setStatus('Files reset. Next generation will start fresh.', 'info');
};

let activeFileTab = 'variables.robot';
let isEditMode    = false;

// ── File tab switching — exit edit mode on tab switch ──
document.querySelectorAll('.file-tab').forEach(function(btn) {
  btn.addEventListener('click', async function() {
    if (isEditMode) exitEditMode(false); // cancel unsaved changes on tab switch
    document.querySelectorAll('.file-tab').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    activeFileTab = btn.dataset.file;
    await renderFileViewer();
  });
});

document.getElementById('copy-file-btn').onclick = async function() {
  if (!activeProject) return;
  const files   = await Storage.getRobotFiles(activeProject);
  const content = files[activeFileTab] || '';
  if (!content.trim()) { alert('No content yet for ' + activeFileTab); return; }
  navigator.clipboard.writeText(content).then(function() {
    const btn = document.getElementById('copy-file-btn');
    const old = btn.textContent;
    btn.textContent = '✓';
    setTimeout(function() { btn.textContent = old; }, 1500);
  });
};

// ── Edit / Save / Cancel ──
const editFileBtn   = document.getElementById('edit-file-btn');
const saveFileBtn   = document.getElementById('save-file-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

editFileBtn.onclick = async function() {
  if (!activeProject) { alert('Select a project first'); return; }
  const files   = await Storage.getRobotFiles(activeProject);
  const content = files[activeFileTab] || '';
  enterEditMode(content);
};

saveFileBtn.onclick = async function() {
  if (!activeProject) return;
  const textarea = document.getElementById('file-editor');
  if (!textarea) return;
  const newContent = textarea.value;
  await Storage.saveRobotFiles(activeProject, { [activeFileTab]: newContent });
  await refreshProjectStats();
  exitEditMode(true);
  await renderFileViewer();
};

cancelEditBtn.onclick = function() {
  exitEditMode(false);
  renderFileViewer();
};

function enterEditMode(content) {
  isEditMode = true;
  const viewer = document.getElementById('file-viewer');

  // Replace viewer contents with textarea
  viewer.innerHTML = '';
  viewer.classList.add('editing');
  const textarea = document.createElement('textarea');
  textarea.id         = 'file-editor';
  textarea.className  = 'file-editor';
  textarea.value      = content;
  textarea.spellcheck = false;
  viewer.appendChild(textarea);
  textarea.focus();

  // Swap action bar buttons
  editFileBtn.classList.add('hidden');
  saveFileBtn.classList.remove('hidden');
  cancelEditBtn.classList.remove('hidden');

  // Disable file tab switching while editing
  document.querySelectorAll('.file-tab').forEach(b => b.disabled = true);
}

function exitEditMode(saved) {
  isEditMode = false;
  const viewer = document.getElementById('file-viewer');
  if (viewer) viewer.classList.remove('editing');

  // Swap action bar buttons back
  editFileBtn.classList.remove('hidden');
  saveFileBtn.classList.add('hidden');
  cancelEditBtn.classList.add('hidden');

  // Re-enable file tab switching
  document.querySelectorAll('.file-tab').forEach(b => b.disabled = false);
}

async function renderFileViewer() {
  const viewer = document.getElementById('file-viewer');
  if (!viewer || !activeProject) return;
  const files = await Storage.getRobotFiles(activeProject);
  const raw   = (files[activeFileTab] || '').trim();
  if (!raw) {
    viewer.innerHTML = `<div class="file-empty">No content yet for ${activeFileTab}.<br>Generate tests first, or click ✎ to write manually.</div>`;
    return;
  }
  const escaped = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const highlighted = escaped
    .replace(/(^\*{3}.*?\*{3})/gm, '<span class="kw-section">$1</span>')
    .replace(/(\$\{[^}]+\})/g, '<span class="kw-var">$1</span>')
    .replace(/^(Library|Resource|Suite Setup|Suite Teardown|Test Setup|Test Teardown)(\s)/gm, '<span class="kw-setting">$1</span>$2')
    .replace(/(#.*$)/gm, '<span class="kw-comment">$1</span>')
    .replace(/^([A-Z][^\n$\[]{3,60})$/gm, '<span class="kw-name">$1</span>');
  viewer.innerHTML = '<div class="file-content">' + highlighted + '</div>';
}

// ══════════════════════════════════════════════════════════
// PREVIEW PAYLOAD
// ══════════════════════════════════════════════════════════

let builtPayload    = null;
let activePayloadTab = 'system';

async function buildPayload() {
  if (!activeProject) {
    setStatus('✗ Select or create a project first', 'error'); return null;
  }
  if (sessionElements.length === 0) {
    setStatus('✗ No DOM elements captured — use Extract DOM first', 'error'); return null;
  }
  if (sessionCsv.length === 0) {
    setStatus('✗ No CSV uploaded — go to Tests tab and upload a CSV', 'error'); return null;
  }

  const existingFiles = await Storage.getRobotFiles(activeProject);
  const domData       = buildExportData();
  const allElements   = [
    ...(domData.elements || []),
    ...(domData.pages || []).flatMap(p => p.elements)
  ];
  const userPrompt    = PromptBuilder.buildUserPrompt(allElements, sessionCsv, existingFiles);

  return {
    system: PromptBuilder.SYSTEM_PROMPT,
    user:   userPrompt,
    full: {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      system:     PromptBuilder.SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userPrompt }]
    },
    stats: {
      domElements: sessionElements.length,
      testCases:   sessionCsv.length,
      systemChars: PromptBuilder.SYSTEM_PROMPT.length,
      userChars:   userPrompt.length,
      totalChars:  PromptBuilder.SYSTEM_PROMPT.length + userPrompt.length,
      estTokens:   Math.round((PromptBuilder.SYSTEM_PROMPT.length + userPrompt.length) / 4)
    }
  };
}

document.querySelectorAll('.payload-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.payload-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activePayloadTab = btn.dataset.section;
    renderPayloadContent();
  });
});

// ── Syntax highlighters ──

function highlightPromptText(raw) {
  // Escape HTML first
  let text = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Section dividers (═══) → bold amber rule
  text = text.replace(/(═{10,})/g, '<span class="ph-rule">$1</span>');

  // ALL-CAPS headings on their own line (e.g. LOCATORS, RULES, LOGIN HANDLING)
  text = text.replace(/^([A-Z][A-Z &\-\/]{3,})(\s*:?\s*)$/gm,
    '<span class="ph-heading">$1</span>$2');

  // Bullet keywords like "- Use ONLY" — dim the dash, highlight inline code
  text = text.replace(/^([ \t]*)(-\s)/gm, '$1<span class="ph-bullet">$2</span>');

  // Robot Framework keywords in backtick-style: Wait Until..., Page Should Contain etc.
  text = text.replace(/((?:Wait Until|Page Should|Element Should|Location Should|Textfield Value|Sleep)[^\\n\n]*)/g,
    '<span class="ph-kw">$1</span>');

  // ${VARIABLES}
  text = text.replace(/(\$\{[^}]+\})/g, '<span class="ph-var">$1</span>');

  // "keyword": style — JSON-ish keys in the user prompt
  text = text.replace(/&quot;([^&]{1,40})&quot;\s*:/g,
    '<span class="ph-jsonkey">&quot;$1&quot;</span>:');

  // Inline code hints wrapped in backticks
  text = text.replace(/`([^`]+)`/g, '<code class="ph-inline">$1</code>');

  // Numbers (standalone tokens)
  text = text.replace(/\b(\d+s?)\b/g, '<span class="ph-num">$1</span>');

  return text;
}

function highlightJson(obj) {
  const raw = JSON.stringify(obj, null, 2);
  return raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // Keys
    .replace(/"([^"]+)"(\s*:)/g, '<span class="ph-jsonkey">"$1"</span>$2')
    // String values
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, (m, s) => {
      // Truncate very long strings for readability
      const inner = s.slice(1, -1);
      const display = inner.length > 120
        ? inner.substring(0, 117).replace(/</g,'&lt;').replace(/>/g,'&gt;') + '<span class="ph-ellipsis">…</span>'
        : inner;
      return `: <span class="ph-str">"${display}"</span>`;
    })
    // Numbers
    .replace(/:\s*(\d+)\b/g, ': <span class="ph-num">$1</span>')
    // Booleans / null
    .replace(/\b(true|false|null)\b/g, '<span class="ph-bool">$1</span>')
    // Braces & brackets
    .replace(/([{}\[\]])/g, '<span class="ph-bracket">$1</span>');
}

function renderPayloadContent() {
  if (!builtPayload) return;
  const el      = document.getElementById('payload-content');
  const titleEl = document.getElementById('payload-title');

  if (activePayloadTab === 'system') {
    el.innerHTML        = highlightPromptText(builtPayload.system);
    titleEl.innerHTML   =
      `System Prompt &nbsp;<span class="ph-badge">${builtPayload.stats.systemChars.toLocaleString()} chars</span>`;
  } else if (activePayloadTab === 'user') {
    el.innerHTML        = highlightPromptText(builtPayload.user);
    titleEl.innerHTML   =
      `User Prompt &nbsp;<span class="ph-badge">${builtPayload.stats.userChars.toLocaleString()} chars</span>`;
  } else {
    el.innerHTML        = highlightJson(builtPayload.full);
    titleEl.innerHTML   =
      `Full JSON &nbsp;<span class="ph-badge">~${builtPayload.stats.estTokens.toLocaleString()} tokens</span>` +
      `&nbsp;<span class="ph-badge dim">${builtPayload.stats.domElements} elements · ${builtPayload.stats.testCases} test cases</span>`;
  }
}

document.getElementById('preview-prompt-btn').onclick = async function() {
  builtPayload = await buildPayload();
  if (!builtPayload) return;

  const preview = document.getElementById('payload-preview');
  preview.classList.remove('hidden');

  document.querySelectorAll('.payload-tab').forEach(b => b.classList.remove('active'));
  document.querySelector('.payload-tab[data-section="system"]').classList.add('active');
  activePayloadTab = 'system';
  renderPayloadContent();

  setStatus(
    `Payload ready — ${builtPayload.stats.domElements} elements, ` +
    `${builtPayload.stats.testCases} test cases, ` +
    `~${builtPayload.stats.estTokens.toLocaleString()} est. tokens`,
    'info'
  );
};

document.getElementById('close-payload-btn').onclick = function() {
  document.getElementById('payload-preview').classList.add('hidden');
};

document.getElementById('copy-payload-btn').onclick = function() {
  if (!builtPayload) return;
  const content = activePayloadTab === 'system' ? builtPayload.system
                : activePayloadTab === 'user'   ? builtPayload.user
                : JSON.stringify(builtPayload.full, null, 2);
  navigator.clipboard.writeText(content).then(function() {
    const btn = document.getElementById('copy-payload-btn');
    const old = btn.textContent;
    btn.textContent = '✓';
    setTimeout(() => btn.textContent = old, 1500);
  });
};

// ══════════════════════════════════════════════════════════
// MANUAL TEST CASE FORM
// ══════════════════════════════════════════════════════════

// ── Toggle form open/close ──
toggleManualBtn.onclick = function() {
  const isHidden = manualAddForm.classList.toggle('hidden');
  toggleManualBtn.textContent = isHidden ? '＋' : '✕';
  toggleManualBtn.title = isHidden ? 'Add manually' : 'Cancel';
  if (!isHidden) {
    manualStepsList.innerHTML = '';
    addStepRow();
    document.getElementById('manual-precondition').value = '';
    manualIdInput.focus();
  }
};

// ── Add a step row ──
function addStepRow(stepVal = '', expectedVal = '') {
  const row = document.createElement('div');
  row.className = 'manual-step-row';
  row.innerHTML = `
    <textarea class="manual-step-input"    placeholder="Step action..."   rows="2">${stepVal}</textarea>
    <textarea class="manual-expected-input" placeholder="Expected result..." rows="2">${expectedVal}</textarea>
    <button class="manual-remove-step icon-btn danger" title="Remove row">✕</button>
  `;
  row.querySelector('.manual-remove-step').onclick = () => {
    // Always keep at least one row
    if (manualStepsList.children.length > 1) {
      row.remove();
    } else {
      row.querySelector('.manual-step-input').value    = '';
      row.querySelector('.manual-expected-input').value = '';
    }
  };
  manualStepsList.appendChild(row);
}

addStepBtn.onclick = () => addStepRow();

// ── Save manual test case ──
saveManualBtn.onclick = () => {
  const id    = manualIdInput.value.trim();
  const title = manualTitleInput.value.trim();

  if (!id) {
    manualIdInput.focus();
    manualIdInput.style.borderColor = 'var(--red)';
    setTimeout(() => manualIdInput.style.borderColor = '', 1500);
    return;
  }
  if (!title) {
    manualTitleInput.focus();
    manualTitleInput.style.borderColor = 'var(--red)';
    setTimeout(() => manualTitleInput.style.borderColor = '', 1500);
    return;
  }

  // Check for duplicate ID
  if (sessionCsv.some(tc => tc.id === id)) {
    alert(`A test case with ID "${id}" already exists.`);
    manualIdInput.focus();
    return;
  }

  // Collect steps
  const steps    = [];
  const expected = [];
  manualStepsList.querySelectorAll('.manual-step-row').forEach(row => {
    const s = row.querySelector('.manual-step-input').value.trim();
    const e = row.querySelector('.manual-expected-input').value.trim();
    if (s || e) {
      steps.push(s);
      expected.push(e);
    }
  });

  const tc = {
    id,
    title,
    section:       'Manual',
    steps,
    expected,
    preconditions: (document.getElementById('manual-precondition')?.value || '').trim(),
    priority:      manualPriority.value,
    manual:        true
  };

  sessionCsv.push(tc);
  updateCsvBadge();
  renderInlineCsv(sessionCsv);

  // Update status
  csvStatus.textContent = `✓ ${sessionCsv.length} test case${sessionCsv.length !== 1 ? 's' : ''} loaded`;
  csvStatus.style.color = 'var(--green)';

  // Reset form
  manualIdInput.value       = '';
  manualTitleInput.value    = '';
  manualPriority.value      = 'Medium';
  manualStepsList.innerHTML = '';
  document.getElementById('manual-precondition').value = '';
  addStepRow();

  // Collapse form
  manualAddForm.classList.add('hidden');
  toggleManualBtn.textContent = '＋';
  toggleManualBtn.title = 'Add manually';
};

// ── Start ──
init();