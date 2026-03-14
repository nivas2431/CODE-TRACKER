// Content script - runs on coding platform pages

// ─── SCAN PROBLEM INFO ────────────────────────────
function scanProblemInfo() {
  const url = window.location.href;
  let info = { title: '', difficulty: '', platform: '', url: url };

  if (url.includes('leetcode.com')) {
    info.platform = 'LeetCode';
    const titleEl = document.querySelector('[data-cy="question-title"]') ||
                    document.querySelector('.text-title-large a') ||
                    document.querySelector('h4.question-title') ||
                    document.querySelector('[class*="title__"] a') ||
                    document.querySelector('.mr-2.text-label-1');
    if (titleEl) info.title = titleEl.textContent.trim();
    if (!info.title) {
      const h1 = document.querySelector('h1');
      if (h1) info.title = h1.textContent.trim();
    }
    const diffEl = document.querySelector('[diff]') ||
                   document.querySelector('.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard') ||
                   document.querySelector('[class*="difficulty"]');
    if (diffEl) {
      const t = diffEl.textContent.trim().toLowerCase();
      if (t.includes('easy')) info.difficulty = 'Easy';
      else if (t.includes('medium')) info.difficulty = 'Medium';
      else if (t.includes('hard')) info.difficulty = 'Hard';
    }
  }
  else if (url.includes('codechef.com')) {
    info.platform = 'CodeChef';
    const titleEl = document.querySelector('.problem-statement h2') ||
                    document.querySelector('h1.h2') ||
                    document.querySelector('.problem-name') ||
                    document.querySelector('h1');
    if (titleEl) info.title = titleEl.textContent.trim();
    const diffEl = document.querySelector('.difficulty-text') ||
                   document.querySelector('[class*="difficulty"]') ||
                   document.querySelector('.problemDifficulty');
    if (diffEl) {
      const t = diffEl.textContent.trim().toLowerCase();
      if (t.includes('easy') || t.includes('beginner')) info.difficulty = 'Easy';
      else if (t.includes('medium') || t.includes('intermediate')) info.difficulty = 'Medium';
      else if (t.includes('hard') || t.includes('challenge')) info.difficulty = 'Hard';
    }
  }
  else if (url.includes('hackerearth.com')) {
    info.platform = 'HackerEarth';
    const titleEl = document.querySelector('.problem-title h3') ||
                    document.querySelector('.problem-heading') ||
                    document.querySelector('h1.title') ||
                    document.querySelector('h3.problem-title');
    if (titleEl) info.title = titleEl.textContent.trim();
    const diffEl = document.querySelector('.difficulty') ||
                   document.querySelector('[class*="difficulty"]') ||
                   document.querySelector('.problem-difficulty');
    if (diffEl) {
      const t = diffEl.textContent.trim().toLowerCase();
      if (t.includes('easy')) info.difficulty = 'Easy';
      else if (t.includes('medium')) info.difficulty = 'Medium';
      else if (t.includes('hard')) info.difficulty = 'Hard';
    }
  }
  else if (url.includes('hackerrank.com')) {
    info.platform = 'HackerRank';
    const titleEl = document.querySelector('.challenge-page-label h1') ||
                    document.querySelector('h1.ui-problems-heading') ||
                    document.querySelector('.hr-heading') ||
                    document.querySelector('h1');
    if (titleEl) info.title = titleEl.textContent.trim();
    const diffEl = document.querySelector('.difficulty-block span') ||
                   document.querySelector('[class*="difficulty"]') ||
                   document.querySelector('.challenges-difficulty');
    if (diffEl) {
      const t = diffEl.textContent.trim().toLowerCase();
      if (t.includes('easy')) info.difficulty = 'Easy';
      else if (t.includes('medium')) info.difficulty = 'Medium';
      else if (t.includes('hard')) info.difficulty = 'Hard';
    }
  }

  return info;
}

// ─── FETCH CODE FROM EDITOR ───────────────────────
function fetchEditorCode() {
  const url = window.location.href;
  let code = '';

  // ── LeetCode ──────────────────────────────────────
  // Monaco editor: each line is a .view-line span
  if (url.includes('leetcode.com')) {
    // Monaco view lines (most reliable)
    const monacoLines = document.querySelectorAll('.view-lines .view-line');
    if (monacoLines.length > 0) {
      code = Array.from(monacoLines).map(l => l.textContent).join('\n');
    }
    // Fallback: CodeMirror
    if (!code.trim()) {
      const cm = document.querySelector('.CodeMirror');
      if (cm && cm.CodeMirror) {
        code = cm.CodeMirror.getValue();
      }
    }
    // Fallback: textarea inside editor
    if (!code.trim()) {
      const ta = document.querySelector('.monaco-editor textarea');
      if (ta) code = ta.value;
    }
  }

  // ── CodeChef ──────────────────────────────────────
  else if (url.includes('codechef.com')) {
    // CodeMirror 6 (newer layout)
    const cm6 = document.querySelector('.cm-content');
    if (cm6) {
      code = Array.from(cm6.querySelectorAll('.cm-line')).map(l => l.textContent).join('\n');
    }
    // CodeMirror 5
    if (!code.trim()) {
      const cm5 = document.querySelector('.CodeMirror');
      if (cm5 && cm5.CodeMirror) code = cm5.CodeMirror.getValue();
    }
    // Monaco
    if (!code.trim()) {
      const monacoLines = document.querySelectorAll('.view-lines .view-line');
      if (monacoLines.length > 0) code = Array.from(monacoLines).map(l => l.textContent).join('\n');
    }
    // Ace editor
    if (!code.trim()) {
      const aceEl = document.querySelector('.ace_editor');
      if (aceEl && window.ace) {
        try { code = window.ace.edit(aceEl).getValue(); } catch(e) {}
      }
    }
  }

  // ── HackerEarth ───────────────────────────────────
  else if (url.includes('hackerearth.com')) {
    // CodeMirror 5
    const cm5 = document.querySelector('.CodeMirror');
    if (cm5 && cm5.CodeMirror) {
      code = cm5.CodeMirror.getValue();
    }
    // CodeMirror 6
    if (!code.trim()) {
      const cm6 = document.querySelector('.cm-content');
      if (cm6) code = Array.from(cm6.querySelectorAll('.cm-line')).map(l => l.textContent).join('\n');
    }
    // Ace
    if (!code.trim()) {
      const aceEl = document.querySelector('#editor, .ace_editor');
      if (aceEl && window.ace) {
        try { code = window.ace.edit(aceEl).getValue(); } catch(e) {}
      }
    }
    // Textarea fallback
    if (!code.trim()) {
      const ta = document.querySelector('textarea#code, textarea.code-editor, textarea[name="code"]');
      if (ta) code = ta.value;
    }
  }

  // ── HackerRank ────────────────────────────────────
  else if (url.includes('hackerrank.com')) {
    // CodeMirror 5 (HackerRank typically uses this)
    const allCM = document.querySelectorAll('.CodeMirror');
    for (const cm of allCM) {
      if (cm.CodeMirror) {
        const val = cm.CodeMirror.getValue();
        if (val && val.trim()) { code = val; break; }
      }
    }
    // Monaco fallback
    if (!code.trim()) {
      const monacoLines = document.querySelectorAll('.view-lines .view-line');
      if (monacoLines.length > 0) code = Array.from(monacoLines).map(l => l.textContent).join('\n');
    }
    // Ace fallback
    if (!code.trim()) {
      const aceEl = document.querySelector('.ace_editor');
      if (aceEl && window.ace) {
        try { code = window.ace.edit(aceEl).getValue(); } catch(e) {}
      }
    }
  }

  // Clean up zero-width chars injected by Monaco
  code = code.replace(/\u200b/g, '').replace(/\ufeff/g, '');

  return code.trim();
}

// ─── MESSAGE LISTENER ─────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'scanProblem') {
    sendResponse(scanProblemInfo());
  }
  if (request.action === 'fetchCode') {
    const code = fetchEditorCode();
    sendResponse({ code });
  }
  return true;
});
