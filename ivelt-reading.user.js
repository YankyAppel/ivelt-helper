// ==UserScript==
// @name         iVelt קול – לייענען
// @namespace    https://github.com/YankyAppel/ivelt-helper
// @version      1.0.0
// @description  Read iVelt posts aloud in a mobile-friendly RTL control bar.
// @author       Ivelt community
// @match        *://*.ivelt.com/*
// @match        *://*.yiddishworld.com/*
// @match        *://198.153.76.147/*
// @match        *://www.xn--4dbhss5b.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  if (window.__iveltReadingScript) return;
  window.__iveltReadingScript = true;

  const KEY = 'iveltReadingSettings';
  const defaults = { rate: 0.92, volume: 1, includeQuotes: false, markRead: false };
  const state = { current: null, queue: [], queueIndex: -1, utterance: null };

  function settings() {
    try {
      return Object.assign({}, defaults, JSON.parse(
        (typeof GM_getValue === 'function' ? GM_getValue(KEY, '{}') : localStorage.getItem(KEY)) || '{}'
      ));
    } catch (_) {
      return Object.assign({}, defaults);
    }
  }

  function saveSettings(next) {
    const value = JSON.stringify(next);
    try {
      if (typeof GM_setValue === 'function') GM_setValue(KEY, value);
      else localStorage.setItem(KEY, value);
    } catch (_) {}
  }

  function textFor(post) {
    const content = post.querySelector('.content');
    if (!content) return '';
    const clone = content.cloneNode(true);
    clone.querySelectorAll('script,style,.codebox,.attachbox,.signature,iframe,video,audio,img,.ivelt-reading-ui')
      .forEach((node) => node.remove());
    if (!settings().includeQuotes) clone.querySelectorAll('blockquote').forEach((node) => node.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function posts() {
    return [...document.querySelectorAll('.post')].filter((post) => textFor(post));
  }

  function labelFor(post) {
    const author = post.querySelector('.author a, .username a, .postprofile a.username');
    const title = post.querySelector('.postsubject a, .post-title a');
    return [author && author.textContent.trim(), title && title.textContent.trim()]
      .filter(Boolean).join(' · ');
  }

  function makeButton(label, className, onClick, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ivelt-reading-button ${className || ''}`;
    button.textContent = label;
    button.title = title || label;
    button.setAttribute('aria-label', button.title);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick(event);
    });
    return button;
  }

  function toast(message) {
    const old = document.querySelector('.ivelt-reading-toast');
    if (old) old.remove();
    const node = document.createElement('div');
    node.className = 'ivelt-reading-toast';
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 2600);
  }

  function stop() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    state.current = null;
    state.queue = [];
    state.queueIndex = -1;
    document.querySelectorAll('.ivelt-reading-active').forEach((node) => {
      node.classList.remove('ivelt-reading-active');
    });
    refreshBar();
  }

  function chooseVoice() {
    const voices = 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
    return voices.find((voice) => /^yi|^he/i.test(voice.lang)) ||
      voices.find((voice) => /Hebrew|Yiddish/i.test(voice.name)) || voices[0];
  }

  function speak(post, nextQueue, nextIndex) {
    const text = textFor(post);
    if (!text || !('speechSynthesis' in window)) {
      toast('דער בראוזער שטיצט נישט לייענען');
      return;
    }
    stop();
    state.queue = nextQueue || [];
    state.queueIndex = nextIndex == null ? -1 : nextIndex;
    state.current = post;
    post.classList.add('ivelt-reading-active');
    post.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const s = settings();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = chooseVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'yi';
    } else {
      utterance.lang = 'yi';
    }
    utterance.rate = Number(s.rate) || defaults.rate;
    utterance.volume = Number(s.volume) || defaults.volume;
    utterance.onend = () => {
      post.classList.remove('ivelt-reading-active');
      if (state.queueIndex >= 0 && state.queueIndex + 1 < state.queue.length) {
        const index = state.queueIndex + 1;
        speak(state.queue[index], state.queue, index);
      } else {
        state.current = null;
        refreshBar();
      }
    };
    utterance.onerror = () => {
      post.classList.remove('ivelt-reading-active');
      state.current = null;
      refreshBar();
    };
    state.utterance = utterance;
    window.speechSynthesis.speak(utterance);
    refreshBar();
  }

  function refreshBar() {
    const bar = document.querySelector('.ivelt-reading-bar');
    if (!bar) return;
    const status = bar.querySelector('.ivelt-reading-status');
    status.textContent = state.current
      ? `לייענט${state.queueIndex >= 0 ? ` ${state.queueIndex + 1}/${state.queue.length}` : ''}`
      : 'קול';
    bar.querySelector('.ivelt-reading-pause').textContent =
      'speechSynthesis' in window && window.speechSynthesis.paused ? '▶' : '⏸';
  }

  function playUnread() {
    const queue = posts().filter((post) => post.classList.contains('unread') ||
      post.matches('[data-unread="1"]') ||
      post.querySelector('.unread, a.unread, .post-unread, [data-unread="1"]'));
    if (queue.length) speak(queue[0], queue, 0);
    else toast('קיין אומגעלייענטע תגובות נישט געפונען');
  }

  function openSettings() {
    const old = document.querySelector('.ivelt-reading-sheet');
    if (old) return old.remove();
    const s = settings();
    const sheet = document.createElement('section');
    sheet.className = 'ivelt-reading-sheet';
    sheet.innerHTML = '<h2>קול – סעטינגס</h2>';
    const row = (label, input) => {
      const line = document.createElement('label');
      line.className = 'ivelt-reading-setting';
      line.append(label, input);
      sheet.appendChild(line);
    };
    const rate = document.createElement('input');
    rate.type = 'range'; rate.min = '.6'; rate.max = '1.4'; rate.step = '.05'; rate.value = s.rate;
    const rateText = document.createElement('span');
    rateText.textContent = `${s.rate}×`;
    rate.addEventListener('input', () => { rateText.textContent = `${rate.value}×`; });
    rate.addEventListener('change', () => saveSettings(Object.assign(settings(), { rate: Number(rate.value) })));
    row('גיכקייט', rate); sheet.appendChild(rateText);
    const quotes = document.createElement('input');
    quotes.type = 'checkbox'; quotes.checked = !!s.includeQuotes;
    quotes.addEventListener('change', () => saveSettings(Object.assign(settings(), { includeQuotes: quotes.checked })));
    row('לייענען אויך ציטירונגען', quotes);
    const close = makeButton('פארמאכן', 'ivelt-reading-secondary', () => sheet.remove());
    sheet.appendChild(close);
    document.body.appendChild(sheet);
  }

  function addPostControls(post) {
    if (post.querySelector('.ivelt-reading-ui')) return;
    const bar = document.createElement('div');
    bar.className = 'ivelt-reading-ui ivelt-reading-postbar';
    bar.append(
      makeButton('▶ לייענען', 'ivelt-reading-primary', () => speak(post), 'לייענען די תגובה'),
      makeButton('⏹ אפשטעלן', '', stop, 'אפשטעלן לייענען')
    );
    post.insertBefore(bar, post.firstChild);
  }

  function addGlobalBar() {
    const bar = document.createElement('nav');
    bar.className = 'ivelt-reading-ui ivelt-reading-bar';
    bar.append(
      makeButton('▶', 'ivelt-reading-primary', playUnread, 'לייענען אלע אומגעלייענטע'),
      makeButton('⏸', 'ivelt-reading-pause', () => {
        if (!state.current) return playUnread();
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        else window.speechSynthesis.pause();
        refreshBar();
      }, 'פאוזע / ווייטער'),
      makeButton('⏹', '', stop, 'אפשטעלן'),
      makeButton('⚙', '', openSettings, 'סעטינגס'),
      Object.assign(document.createElement('span'), { className: 'ivelt-reading-status', textContent: 'קול' })
    );
    document.body.appendChild(bar);
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      .ivelt-reading-ui{font-family:Arial,"Segoe UI",sans-serif;direction:rtl;box-sizing:border-box}
      .ivelt-reading-ui *{box-sizing:border-box}
      .ivelt-reading-postbar{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 8px;clear:both}
      .ivelt-reading-button{min-height:40px;min-width:42px;padding:6px 12px;border:1px solid #b9b2a5;border-radius:10px;background:#fff;color:#27231f;font:inherit;cursor:pointer;touch-action:manipulation}
      .ivelt-reading-button:hover{background:#f3efe8}.ivelt-reading-button:focus-visible{outline:3px solid #e0a72f;outline-offset:2px}
      .ivelt-reading-primary{background:#1f5f8b;color:#fff;border-color:#1f5f8b;font-weight:700}
      .ivelt-reading-secondary{background:#eee}
      .ivelt-reading-active{outline:3px solid #1f5f8b;outline-offset:2px;border-radius:6px}
      .ivelt-reading-bar{position:fixed;z-index:2147483000;left:8px;right:8px;bottom:8px;display:flex;align-items:center;justify-content:center;gap:2px;padding:4px;border:2px solid #1f5f8b;border-radius:14px;background:rgba(250,248,243,.97);box-shadow:0 2px 14px #0002}
      .ivelt-reading-status{min-width:58px;text-align:center;font-size:14px;white-space:nowrap}
      .ivelt-reading-sheet{position:fixed;z-index:2147483001;left:8px;right:8px;bottom:68px;max-width:520px;margin:auto;padding:14px;border:2px solid #1f5f8b;border-radius:14px;background:#fff;box-shadow:0 4px 24px #0004;direction:rtl}
      .ivelt-reading-sheet h2{margin:0 0 12px;font-size:20px}.ivelt-reading-setting{display:flex;align-items:center;gap:8px;margin:12px 0;font-size:16px}.ivelt-reading-setting input{margin-inline-start:auto}
      .ivelt-reading-toast{position:fixed;z-index:2147483002;left:50%;bottom:74px;transform:translateX(-50%);padding:10px 16px;border-radius:12px;background:#222;color:#fff;direction:rtl}
      body{padding-bottom:64px}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    injectStyle();
    posts().forEach(addPostControls);
    addGlobalBar();
    new MutationObserver(() => posts().forEach(addPostControls)).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
