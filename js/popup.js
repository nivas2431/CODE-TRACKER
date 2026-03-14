// popup.js - Main popup logic for Code Tracker

// ─── State ────────────────────────────────────────
let currentPlatformFilter = 'all';
let currentDifficultyFilter = 'all';
let expandedCardId = null;

// ─── Init ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupFilters();
  setupScan();
  setupSave();
  setupClearAll();
  await refreshBadge();
  await renderHistory();
  await renderStats();
});

// ─── TABS ─────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

      if (btn.dataset.tab === 'stats') await renderStats();
      if (btn.dataset.tab === 'history') await renderHistory();
    });
  });
}

// ─── FILTERS ──────────────────────────────────────
function setupFilters() {
  document.querySelectorAll('#platformFilters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#platformFilters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPlatformFilter = btn.dataset.filter;
      renderHistory();
    });
  });

  document.querySelectorAll('#diffFilters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#diffFilters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentDifficultyFilter = btn.dataset.filter;
      renderHistory();
    });
  });
}

// ─── INSTANT SCAN ─────────────────────────────────
function setupScan() {
  document.getElementById('scanBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('scanStatus');
    statusEl.className = 'scan-status show';
    statusEl.textContent = 'Scanning...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url) {
        showScanError(statusEl, 'No active tab');
        return;
      }

      const url = tab.url;
      const supportedPlatforms = ['leetcode.com', 'codechef.com', 'hackerearth.com', 'hackerrank.com'];
      const isSupported = supportedPlatforms.some(p => url.includes(p));

      if (!isSupported) {
        showScanError(statusEl, 'Not a coding platform');
        return;
      }

      let response;
      try {
        response = await chrome.tabs.sendMessage(tab.id, { action: 'scanProblem' });
      } catch (e) {
        // Try injecting content script first
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['js/content.js']
        });
        await new Promise(r => setTimeout(r, 300));
        response = await chrome.tabs.sendMessage(tab.id, { action: 'scanProblem' });
      }

      if (response) {
        if (response.title) document.getElementById('probTitle').value = response.title;
        if (response.platform) document.getElementById('probPlatform').value = response.platform;
        if (response.difficulty) document.getElementById('probDifficulty').value = response.difficulty;
        if (response.url) document.getElementById('probUrl').value = response.url;

        const filled = response.title || response.platform || response.difficulty;
        if (filled) {
          statusEl.className = 'scan-status show success';
          statusEl.textContent = '✓ Scanned!';
        } else {
          showScanError(statusEl, 'Nothing found');
        }
      } else {
        showScanError(statusEl, 'No data returned');
      }

      setTimeout(() => { statusEl.className = 'scan-status'; }, 3000);
    } catch (err) {
      console.error('Scan error:', err);
      showScanError(statusEl, 'Scan failed');
    }
  });
}

function showScanError(el, msg) {
  el.className = 'scan-status show error';
  el.textContent = msg;
  setTimeout(() => { el.className = 'scan-status'; }, 3000);
}

// ─── SAVE PROBLEM ─────────────────────────────────
function setupSave() {
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const title = document.getElementById('probTitle').value.trim();
    const platform = document.getElementById('probPlatform').value;
    const difficulty = document.getElementById('probDifficulty').value;
    const topic = document.getElementById('probTopic').value.trim();
    const url = document.getElementById('probUrl').value.trim();
    const notes = document.getElementById('probNotes').value.trim();

    if (!title) { showToast('Please enter a problem title', 'error'); return; }
    if (!platform) { showToast('Please select a platform', 'error'); return; }
    if (!difficulty) { showToast('Please select difficulty', 'error'); return; }

    const problem = { title, platform, difficulty, topic, url, notes };

    await Storage.addProblem(problem);

    // Clear form
    document.getElementById('probTitle').value = '';
    document.getElementById('probPlatform').value = '';
    document.getElementById('probDifficulty').value = '';
    document.getElementById('probTopic').value = '';
    document.getElementById('probUrl').value = '';
    document.getElementById('probNotes').value = '';

    await refreshBadge();
    showToast('✅ Problem saved!', 'success');
  });
}

// ─── RENDER HISTORY ───────────────────────────────
async function renderHistory() {
  const problems = await Storage.getProblems();
  const container = document.getElementById('problemList');

  let filtered = problems;
  if (currentPlatformFilter !== 'all') filtered = filtered.filter(p => p.platform === currentPlatformFilter);
  if (currentDifficultyFilter !== 'all') filtered = filtered.filter(p => p.difficulty === currentDifficultyFilter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>${problems.length === 0 ? 'No problems saved yet.<br/>Use the ADD tab to track problems.' : 'No problems match the current filters.'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(p => buildProblemCard(p)).join('');

  // Card header click → expand/collapse
  container.querySelectorAll('.card-clickable').forEach(area => {
    area.addEventListener('click', async (e) => {
      const card = area.closest('.problem-card');
      const id = card.dataset.id;
      if (expandedCardId === id) {
        expandedCardId = null;
        renderHistory();
      } else {
        expandedCardId = id;
        renderHistory();
        // Try to fetch live code from an open tab matching the problem URL
        await tryFetchLiveCode(id);
      }
    });
  });

  // Delete
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await Storage.deleteProblem(btn.dataset.id);
      if (expandedCardId === btn.dataset.id) expandedCardId = null;
      await refreshBadge();
      renderHistory();
      showToast('Problem removed', '');
    });
  });

  // Open URL
  container.querySelectorAll('.btn-open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.url) chrome.tabs.create({ url: btn.dataset.url });
    });
  });

  // Refresh code button
  container.querySelectorAll('.btn-refresh-code').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      btn.textContent = '⟳ Fetching...';
      btn.disabled = true;
      await tryFetchLiveCode(id, true);
    });
  });
}

// ─── FETCH LIVE CODE FROM OPEN TAB ────────────────
async function tryFetchLiveCode(problemId, forceRefresh = false) {
  const problems = await Storage.getProblems();
  const problem = problems.find(p => p.id === problemId);
  if (!problem) return;

  // If we already have saved code and not forcing refresh, skip fetch
  if (problem.code && !forceRefresh) {
    updateCodeDisplay(problemId, problem.code, problem.codeUpdatedAt);
    return;
  }

  // Find a matching open tab for this problem's platform
  const platformDomains = {
    LeetCode: 'leetcode.com',
    CodeChef: 'codechef.com',
    HackerEarth: 'hackerearth.com',
    HackerRank: 'hackerrank.com'
  };

  const domain = platformDomains[problem.platform];
  if (!domain) return;

  try {
    // Find tabs matching this platform
    const tabs = await chrome.tabs.query({ url: `*://*.${domain}/*` });

    // Prefer tab whose URL matches the saved problem URL
    let targetTab = null;
    if (problem.url) {
      targetTab = tabs.find(t => t.url && t.url.startsWith(problem.url.split('?')[0]));
    }
    if (!targetTab && tabs.length > 0) targetTab = tabs[0];

    if (!targetTab) {
      updateCodeDisplay(problemId, null, null, `No open ${problem.platform} tab found. Open the problem page and try again.`);
      return;
    }

    // Inject content script if needed
    try {
      await chrome.scripting.executeScript({ target: { tabId: targetTab.id }, files: ['js/content.js'] });
    } catch(e) { /* already injected */ }

    await new Promise(r => setTimeout(r, 200));

    const response = await chrome.tabs.sendMessage(targetTab.id, { action: 'fetchCode' });

    if (response && response.code && response.code.trim()) {
      await Storage.updateProblemCode(problemId, response.code);
      updateCodeDisplay(problemId, response.code, new Date().toISOString());
      showToast('✅ Code fetched!', 'success');
    } else {
      // No code found in editor yet — show what's saved or a helpful message
      const existing = problem.code || null;
      updateCodeDisplay(problemId, existing, problem.codeUpdatedAt,
        existing ? null : 'Editor appears empty. Write your solution on the platform, then click ⟳ Refresh.');
    }
  } catch (err) {
    console.error('fetchCode error:', err);
    const existing = problem.code || null;
    updateCodeDisplay(problemId, existing, problem.codeUpdatedAt,
      existing ? null : 'Could not read editor. Make sure the problem page is open.');
  }
}

// Live-patch the code block in the DOM without full re-render
function updateCodeDisplay(problemId, code, updatedAt, errorMsg) {
  const block = document.getElementById(`code-block-${problemId}`);
  const status = document.getElementById(`code-status-${problemId}`);
  const refreshBtn = document.querySelector(`.btn-refresh-code[data-id="${problemId}"]`);

  if (refreshBtn) { refreshBtn.textContent = '⟳ Refresh'; refreshBtn.disabled = false; }

  if (!block) return;

  if (code && code.trim()) {
    block.textContent = code;
    block.style.display = 'block';
    if (status) {
      const ts = updatedAt ? new Date(updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      status.innerHTML = `<span style="color:var(--easy)">✓ Code saved</span>${ts ? ` <span style="color:var(--text3)">· ${ts}</span>` : ''}`;
    }
  } else {
    block.style.display = 'none';
    if (status) {
      status.innerHTML = `<span style="color:var(--text3)">${errorMsg || 'No code yet'}</span>`;
    }
  }
}

function buildProblemCard(p) {
  const diffClass = (p.difficulty || '').toLowerCase();
  const platClass = getPlatClass(p.platform);
  const date = p.savedAt ? new Date(p.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  const isExpanded = expandedCardId === p.id;

  const codeBlock = p.code
    ? `<pre id="code-block-${p.id}" class="code-display">${escHtml(p.code)}</pre>`
    : `<pre id="code-block-${p.id}" class="code-display" style="display:none"></pre>`;

  const codeStatus = p.code
    ? `<span id="code-status-${p.id}" style="font-size:9px;font-family:'JetBrains Mono',monospace;">
         <span style="color:var(--easy)">✓ Code saved</span>
         ${p.codeUpdatedAt ? `<span style="color:var(--text3)">· ${new Date(p.codeUpdatedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}
       </span>`
    : `<span id="code-status-${p.id}" style="font-size:9px;font-family:'JetBrains Mono',monospace;color:var(--text3)">Open the problem tab &amp; click ⟳ Refresh</span>`;

  return `
    <div class="problem-card ${diffClass}" data-id="${p.id}">

      <!-- Clickable header area -->
      <div class="card-clickable" style="cursor:pointer;">
        <div class="card-header">
          <div class="card-title">${escHtml(p.title)}</div>
          <button class="delete-btn" data-id="${p.id}" title="Delete" onclick="event.stopPropagation()">✕</button>
        </div>
        <div class="card-meta">
          <span class="plat-badge ${platClass}">${escHtml(p.platform)}</span>
          ${p.difficulty ? `<span class="badge badge-${diffClass}">${p.difficulty}</span>` : ''}
          ${p.topic ? `<span class="topic-chip">${escHtml(p.topic)}</span>` : ''}
        </div>
        <div class="card-footer">
          <span class="card-date">${date}</span>
          <span style="font-size:10px;color:var(--text3)">${isExpanded ? '▲ collapse' : '▼ expand'}</span>
        </div>
      </div>

      <!-- Expanded section -->
      <div class="card-expanded ${isExpanded ? 'show' : ''}">

        <!-- Code section -->
        <div class="divider"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">
            &lt;/&gt; Your Code
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${codeStatus}
            <button class="btn btn-refresh-code" data-id="${p.id}"
              style="font-size:9px;padding:3px 8px;background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.2);color:var(--accent);border-radius:4px;cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:600;">
              ⟳ Refresh
            </button>
          </div>
        </div>
        ${codeBlock}

        <!-- Notes section -->
        ${p.notes ? `
          <div class="divider"></div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;font-weight:700;margin-bottom:5px;">📝 Notes</div>
          <div class="notes-display">${escHtml(p.notes)}</div>
        ` : ''}

        <!-- URL / Open button at bottom -->
        ${p.url ? `
          <div class="divider"></div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:10px;color:var(--text3);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'JetBrains Mono',monospace;">${escHtml(p.url)}</span>
            <button class="btn btn-open" data-url="${escHtml(p.url)}"
              style="font-size:10px;padding:5px 10px;background:linear-gradient(135deg,rgba(0,212,255,0.1),rgba(124,58,237,0.1));border:1px solid var(--border2);color:var(--accent);border-radius:5px;cursor:pointer;font-family:'Space Grotesk',sans-serif;font-weight:600;white-space:nowrap;flex-shrink:0;">
              🔗 Open Problem
            </button>
          </div>
        ` : ''}

      </div>
    </div>
  `;
}

function toggleCard(id) {
  expandedCardId = expandedCardId === id ? null : id;
  renderHistory();
}

// ─── RENDER STATS ─────────────────────────────────
async function renderStats() {
  const stats = await Storage.getStats();

  document.getElementById('statTotal').textContent = stats.total;
  document.getElementById('statEasy').textContent = stats.byDifficulty.Easy;
  document.getElementById('statMedium').textContent = stats.byDifficulty.Medium;
  document.getElementById('statHard').textContent = stats.byDifficulty.Hard;

  // Streak calc
  const problems = await Storage.getProblems();
  const streak = calcStreak(problems);
  document.getElementById('statStreak').textContent = streak;

  // Platform stats
  const platColors = {
    LeetCode: 'var(--lc)',
    CodeChef: '#c4a882',
    HackerEarth: 'var(--he)',
    HackerRank: 'var(--hr)'
  };

  const platStatsEl = document.getElementById('platStats');
  const maxPlat = Math.max(...Object.values(stats.byPlatform), 1);

  platStatsEl.innerHTML = Object.entries(stats.byPlatform).map(([name, count]) => `
    <div class="plat-stat-row">
      <div class="plat-stat-name" style="color:${platColors[name]}">${name}</div>
      <div class="plat-stat-bar-wrap">
        <div class="plat-stat-bar" style="width:${Math.round((count/maxPlat)*100)}%;background:${platColors[name]}"></div>
      </div>
      <div class="plat-stat-count">${count}</div>
    </div>
  `).join('');

  // Activity bars
  const activityEl = document.getElementById('activityBars');
  const maxAct = Math.max(...stats.recentActivity.map(a => a.count), 1);

  activityEl.innerHTML = stats.recentActivity.map(day => {
    const pct = Math.max((day.count / maxAct) * 100, day.count > 0 ? 10 : 2);
    const label = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
    return `
      <div class="activity-bar-wrap">
        <div style="flex:1;display:flex;align-items:flex-end;">
          <div class="activity-bar" style="height:${pct}%;width:100%;" title="${day.count} problems on ${day.date}"></div>
        </div>
        <div class="activity-label">${label}</div>
      </div>
    `;
  }).join('');

  // Topics
  const topicEl = document.getElementById('topicChips');
  const topTopics = Object.entries(stats.byTopic)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (topTopics.length > 0) {
    topicEl.innerHTML = topTopics.map(([t, c]) =>
      `<span class="topic-chip">${escHtml(t)} <strong>(${c})</strong></span>`
    ).join('');
  } else {
    topicEl.innerHTML = '<span style="font-size:11px;color:var(--text3)">No topics yet</span>';
  }
}

function calcStreak(problems) {
  if (!problems.length) return 0;
  const dates = [...new Set(problems.map(p => p.savedAt ? p.savedAt.split('T')[0] : null).filter(Boolean))].sort().reverse();
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  let check = today;

  for (const date of dates) {
    if (date === check) {
      streak++;
      const d = new Date(check);
      d.setDate(d.getDate() - 1);
      check = d.toISOString().split('T')[0];
    } else if (date < check) {
      break;
    }
  }
  return streak;
}

// ─── CLEAR ALL ────────────────────────────────────
function setupClearAll() {
  const modal = document.getElementById('confirmModal');
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    modal.classList.add('show');
  });
  document.getElementById('cancelClear').addEventListener('click', () => {
    modal.classList.remove('show');
  });
  document.getElementById('confirmClear').addEventListener('click', async () => {
    await Storage.clearAll();
    modal.classList.remove('show');
    await refreshBadge();
    showToast('All data cleared', '');
  });
}

// ─── HELPERS ──────────────────────────────────────
async function refreshBadge() {
  const problems = await Storage.getProblems();
  document.getElementById('problemCountBadge').textContent = `${problems.length} solved`;
}

function getPlatClass(platform) {
  const map = { LeetCode: 'plat-lc', CodeChef: 'plat-cc', HackerEarth: 'plat-he', HackerRank: 'plat-hr' };
  return map[platform] || 'plat-lc';
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimeout;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.className = 'toast'; }, 2500);
}
