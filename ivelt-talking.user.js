// ==UserScript==
// @name         iVelt קול – רעדן
// @namespace    https://github.com/YankyAppel/ivelt-helper
// @version      1.0.0
// @description  Talk into iVelt's post box and capture corrections for training.
// @author       Ivelt community
// @match        *://*.ivelt.com/*
// @match        *://*.yiddishworld.com/*
// @match        *://198.153.76.147/*
// @match        *://www.xn--4dbhss5b.com/*
// @connect      kol-status-q7m4x2.sites.tab.bot
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  if (window.__iveltTalkingScript) return;
  window.__iveltTalkingScript = true;

  const ENDPOINT = 'https://kol-status-q7m4x2.sites.tab.bot/api/afb/submit';
  const STORAGE_KEY = 'iveltTalkingSettings';
  const pending = new WeakMap();

  function getSetting(key, fallback) {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, '{}') : localStorage.getItem(STORAGE_KEY);
      return Object.assign({ enabled: true }, JSON.parse(raw || '{}'))[key] ?? fallback;
    } catch (_) { return fallback; }
  }

  function setSetting(key, value) {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, '{}') : localStorage.getItem(STORAGE_KEY);
      const next = Object.assign({}, JSON.parse(raw || '{}'), { [key]: value });
      if (typeof GM_setValue === 'function') GM_setValue(STORAGE_KEY, JSON.stringify(next));
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function postBoxes() {
    return [...document.querySelectorAll('textarea#message, textarea[name="message"], #message-box textarea')];
  }

  function insert(textarea, text) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.setRangeText(`${text.trim()} `, start, end, 'end');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    return { start, end, text: text.trim() };
  }

  function speechApi() {
    return window.SpeechRecognition || window.webkitSpeechRecognition;
  }

  function makeButton(text, className, handler, title) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `ivelt-talking-button ${className || ''}`;
    button.textContent = text; button.title = title || text; button.setAttribute('aria-label', button.title);
    button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); handler(event); });
    return button;
  }

  function showCorrection(textarea, correction) {
    const old = textarea.parentElement.querySelector('.ivelt-talking-correction');
    if (old) old.remove();
    const row = document.createElement('div');
    row.className = 'ivelt-talking-correction';
    row.dir = 'rtl';
    row.innerHTML = `<span class="ivelt-talking-correction-label">פאר טרענירונג:</span>
      <span class="ivelt-talking-original"></span><span> ← </span><span class="ivelt-talking-fixed"></span>`;
    row.querySelector('.ivelt-talking-original').textContent = correction.original;
    row.querySelector('.ivelt-talking-fixed').textContent = correction.corrected;
    const send = makeButton('שיקן', 'ivelt-talking-send', async () => {
      send.disabled = true; send.textContent = 'שיקט…';
      try {
        await sendTraining(correction);
        row.remove();
      } catch (error) {
        send.disabled = false; send.textContent = 'ווידער שיקן';
        row.querySelector('.ivelt-talking-error').textContent = error.message;
      }
    }, 'שיקן די תיקון פאר טרענירונג');
    const dismiss = makeButton('×', '', () => row.remove(), 'נישט שיקן');
    const error = document.createElement('span'); error.className = 'ivelt-talking-error';
    row.append(send, dismiss, error);
    textarea.after(row);
  }

  function sendTraining(correction) {
    const payload = JSON.stringify({
      source: 'ivelt',
      items: [{
        action: 'ivelt_transcript_fix',
        source: 'ivelt_talking',
        original: correction.original,
        corrected: correction.corrected,
        context: correction.context,
        training_use: 'transcription_corrections',
        created_at: new Date().toISOString()
      }]
    });
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'POST', url: ENDPOINT, data: payload,
          headers: { 'Content-Type': 'application/json' },
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              try {
                const body = JSON.parse(response.responseText || '{}');
                if (body.ok === false) return reject(new Error(body.error || 'דער סערווער האט נישט אנגענומען'));
              } catch (_) {}
              resolve(); return;
            }
            reject(new Error(`HTTP ${response.status}`));
          },
          onerror: () => reject(new Error('נישט פארבינדן צום טרענירונג סערווער'))
        });
        return;
      }
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload })
        .then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.ok === false) throw new Error(body.error || `HTTP ${response.status}`);
          resolve();
        }).catch(reject);
    });
  }

  function trackCorrection(textarea, inserted) {
    const snapshot = textarea.value;
    pending.set(textarea, { ...inserted, snapshot, createdAt: Date.now() });
    const check = () => {
      const item = pending.get(textarea);
      if (!item || Date.now() - item.createdAt > 30000 || textarea.value === item.snapshot) return;
      pending.delete(textarea);
      const current = textarea.value;
      const before = item.snapshot.slice(0, item.start);
      const after = item.snapshot.slice(item.start + item.text.length + 1);
      if (!current.startsWith(before) || !current.endsWith(after)) return;
      const corrected = current.slice(before.length, current.length - after.length || undefined).trim();
      if (!corrected || corrected === item.text) return;
      showCorrection(textarea, {
        original: item.text,
        corrected,
        context: current.slice(Math.max(0, item.start - 100), Math.min(current.length, item.start + corrected.length + 100))
      });
    };
    setTimeout(check, 900);
  }

  function addBox(textarea) {
    if (textarea.dataset.iveltTalking) return;
    textarea.dataset.iveltTalking = '1';
    const tools = document.createElement('div');
    tools.className = 'ivelt-talking-tools';
    const Recognition = speechApi();
    if (!Recognition) {
      tools.textContent = 'קול-רעדן איז נישט געשטיצט אין דעם בראוזער';
      textarea.after(tools);
      return;
    }
    let recognition;
    let listening = false;
    const talk = makeButton('🎙 רעדן', 'ivelt-talking-primary', () => {
      if (listening) { recognition.stop(); return; }
      recognition = new Recognition();
      recognition.lang = 'yi-YD';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = () => { listening = true; talk.textContent = '⏹ אפשטעלן'; talk.classList.add('ivelt-talking-on'); status.textContent = 'הערט…'; };
      recognition.onresult = (event) => {
        const transcript = [...event.results].map((result) => result[0].transcript).join(' ').trim();
        if (transcript) trackCorrection(textarea, insert(textarea, transcript));
      };
      recognition.onerror = (event) => { status.textContent = `⚠ ${event.error}`; };
      recognition.onend = () => { listening = false; talk.textContent = '🎙 רעדן'; talk.classList.remove('ivelt-talking-on'); if (!status.textContent.startsWith('⚠')) status.textContent = ''; };
      try { recognition.start(); } catch (error) { status.textContent = error.message; }
    }, 'רעדן און אריינלייגן אין דעם קעסטל');
    const status = document.createElement('span');
    status.className = 'ivelt-talking-status';
    tools.append(talk, status);
    textarea.after(tools);
    textarea.addEventListener('input', () => {
      if (textarea.value.length > 200000) pending.delete(textarea);
    });
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .ivelt-talking-tools,.ivelt-talking-correction{font-family:Arial,"Segoe UI",sans-serif;direction:rtl;display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:6px 0}
      .ivelt-talking-button{min-height:40px;padding:6px 12px;border:1px solid #b9b2a5;border-radius:10px;background:#fff;color:#27231f;font:inherit;cursor:pointer;touch-action:manipulation}
      .ivelt-talking-button:focus-visible{outline:3px solid #e0a72f;outline-offset:2px}
      .ivelt-talking-primary{background:#1f5f8b;color:#fff;border-color:#1f5f8b;font-weight:700}
      .ivelt-talking-on{background:#b3261e;border-color:#b3261e;color:#fff}
      .ivelt-talking-status{color:#555;font-size:14px}.ivelt-talking-correction{padding:9px;border:2px solid #e0c060;border-radius:10px;background:#fffbea;font-size:14px}
      .ivelt-talking-original{text-decoration:line-through;color:#a33}.ivelt-talking-fixed{font-weight:700;color:#176b37}.ivelt-talking-correction-label{font-weight:700}.ivelt-talking-send{background:#176b37;color:#fff;border-color:#176b37}.ivelt-talking-error{color:#b3261e}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    if (!getSetting('enabled', true)) return;
    injectStyle();
    postBoxes().forEach(addBox);
    new MutationObserver(() => postBoxes().forEach(addBox)).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
