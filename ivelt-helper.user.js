// ==UserScript==
// @name         Ivelt Helper v2 for Safari / Tampermonkey
// @namespace    https://github.com/YankyAppel/ivelt-helper
// @version      2.2.0
// @updateURL    https://raw.githubusercontent.com/YankyAppel/ivelt-helper/main/ivelt-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/YankyAppel/ivelt-helper/main/ivelt-helper.user.js
// @description  Port of chucem/ivelt-helper v2 for Tampermonkey: keyboard shortcuts, quote/ping/copy/commentary buttons, quote-selection, who-liked, profile cards, drafts, spoiler polish, editor undo, image resizer/paste, split notifications, multi-page print, media embed. Auto-updates from GitHub.
// @author       Ivelt community
// @match        *://*.ivelt.com/*
// @match        *://*.yiddishworld.com/*
// @match        *://198.153.76.147/*
// @match        *://www.xn--4dbhss5b.com/*
// @icon         https://www.ivelt.com/fav/apple-icon-60x60.png
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_listValues
// @grant        GM_deleteValue
// @connect      docs.google.com
// @connect      raw.githubusercontent.com
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // -- Settings ----------------------------------------------------------------
  const defaults = {
    hideUserName: false,
    warnOnLosingPost: true,
    sefariaLinker: false,
    backgroundSync: true,
    backgroundSyncPosts: 20000,
    backgroundSyncNotif: 1,
    getBrowserNotifications: false,
    alwaysCopyTopic: false,
    copyAttachments: true,
    stickyPostButtons: false,
    ShowMultiNotifs: false,
    cachedTopicMappingExpire: 3600,
    forceUpdateTopicMapCache: false,
    upDownArrowKeys: true,
    copyPostLink: true,
    editorUndo: true,
    titleOpensUnread: true,
    whoLiked: true,
    quoteSelection: true,
    quoteJumpToReply: true,
    profileCards: true,
    keepDrafts: true,
    doubleClickLike: false,
    spoilerPolish: false,
    imageResizer: true,
    pasteImages: true,
    openAttachmentsTab: true,
  };

  const storage = {
    get(key) {
      try {
        if (typeof GM_getValue === 'function') {
          const v = GM_getValue(key, defaults[key]);
          if (v === 'true') return true;
          if (v === 'false') return false;
          if (!isNaN(v) && v !== '') return Number(v);
          if (v === '') return '';
          return v;
        }
      } catch (e) {}
      try {
        const raw = localStorage.getItem('iveltHelper_' + key);
        return raw === null ? defaults[key] : JSON.parse(raw);
      } catch (e) {
        return defaults[key];
      }
    },
    set(key, value) {
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, String(value));
          return;
        }
      } catch (e) {}
      try {
        localStorage.setItem('iveltHelper_' + key, JSON.stringify(value));
      } catch (e) {}
    },
    getAll() {
      const out = {};
      Object.keys(defaults).forEach((k) => (out[k] = storage.get(k)));
      return out;
    },
  };


  // -- chrome.storage shim: lets the ported v2 modules run unchanged ------------
  function gmRead(key) {
    try {
      if (typeof GM_getValue === 'function') {
        const v = GM_getValue(key, undefined);
        if (v === 'true') return true;
        if (v === 'false') return false;
        return v;
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem('iveltHelper_' + key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch (e) { return undefined; }
  }
  function gmWrite(key, value) {
    try { if (typeof GM_setValue === 'function') { GM_setValue(key, value); return; } } catch (e) {}
    try { localStorage.setItem('iveltHelper_' + key, JSON.stringify(value)); } catch (e) {}
  }
  function gmDelete(key) {
    try { if (typeof GM_deleteValue === 'function') { GM_deleteValue(key); return; } } catch (e) {}
    try { localStorage.removeItem('iveltHelper_' + key); } catch (e) {}
  }
  const chrome = {
    storage: {
      local: {
        get(keys, cb) {
          const items = {};
          if (keys === null) {
            let names = [];
            try { if (typeof GM_listValues === 'function') names = GM_listValues(); } catch (e) {}
            if (!names.length) {
              names = Object.keys(localStorage)
                .filter(k => k.startsWith('iveltHelper_'))
                .map(k => k.slice('iveltHelper_'.length));
            }
            names.forEach(k => { items[k] = gmRead(k); });
          } else {
            (Array.isArray(keys) ? keys : [keys]).forEach(k => {
              const v = gmRead(k);
              if (v !== undefined) items[k] = v;
            });
          }
          cb(items);
        },
        set(obj) { Object.keys(obj).forEach(k => gmWrite(k, obj[k])); },
        remove(keys) { (Array.isArray(keys) ? keys : [keys]).forEach(k => gmDelete(k)); },
      },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };

  // -- Globals from the page ---------------------------------------------------
  function getGlobal(name) {
    try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow[name] !== undefined) return unsafeWindow[name]; } catch (e) {}
    try { if (typeof window !== 'undefined' && window[name] !== undefined) return window[name]; } catch (e) {}
    return undefined;
  }

  function runGlobal(name, args) {
    const fn = getGlobal(name);
    if (typeof fn === 'function') {
      try { return fn.apply(null, args); } catch (e) {}
    }
    return undefined;
  }

  // -- Utilities ---------------------------------------------------------------
  function htmlToText(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerHTML = str;
    return (div.textContent || div.innerText || '').replace(/\s{2,}/g, ' ').trim();
  }

  function simpleHtmlToBBCode(html) {
    if (!html) return '';
    let txt = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
      .replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '')
      .replace(/<div[^>]*>/gi, '').replace(/<\/div>/gi, '\n')
      .replace(/<cite[^>]*>([\s\S]*?)<\/cite>/gi, '')
      .replace(/<blockquote[^>]*>/gi, '\n[quote]\n').replace(/<\/blockquote>/gi, '\n[/quote]\n')
      .replace(/<img[^>]+class="postimage"[^>]+src="([^"]+)"[^>]*>/gi, '\n[img]$1[/img]\n')
      .replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, '\n[img]$1[/img]\n')
      .replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[url=$1]$2[/url]')
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '[b]$1[/b]')
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '[b]$1[/b]')
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '[i]$1[/i]')
      .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '[i]$1[/i]')
      .replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '[u]$1[/u]')
      .replace(/<s[^>]*>([\s\S]*?)<\/s>/gi, '[s]$1[/s]')
      .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return txt;
  }

  function insertText(text) {
    const textarea = document.querySelector('textarea[name="message"]') || document.querySelector('#message') || document.querySelector('#message-box textarea');
    if (!textarea) return;
    const insert_text = getGlobal('insert_text');
    if (typeof insert_text === 'function') {
      try { insert_text(text); return; } catch (e) {}
    }
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const value = textarea.value;
    textarea.value = value.substring(0, start) + text + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + text.length;
    textarea.focus();
  }

  function addText(text) {
    const textarea = document.querySelector('#message-box textarea') || document.querySelector('textarea[name="message"]') || document.querySelector('#message');
    if (!textarea) return;
    const insert_text = getGlobal('insert_text');
    if (typeof insert_text === 'function') {
      try { insert_text(text); return; } catch (e) {}
    }
    if (!isNaN(textarea.selectionStart)) {
      const selStart = textarea.selectionStart;
      const selEnd = textarea.selectionEnd;
      const s1 = textarea.value.substring(0, selStart);
      const s2 = textarea.value.substring(selStart, selEnd);
      const s3 = textarea.value.substring(selEnd);
      textarea.value = s1 + text + s2 + s3;
      textarea.selectionStart = selStart + text.length;
      textarea.selectionEnd = selEnd + text.length;
    } else {
      textarea.value += text;
    }
    textarea.focus();
  }

  function hasNestedQuotes(text) {
    const firstQ = text.indexOf('[quote');
    if (firstQ === -1) return false;
    const secondQ = text.indexOf('[quote', firstQ + 1);
    return secondQ !== -1;
  }

  function removeNestedQuotes(text) {
    if (!hasNestedQuotes(text)) return text;
    const start = text.lastIndexOf('[quote');
    const end = text.indexOf('[/quote]', start) + 9;
    if (end <= start) return text;
    let modified = text.substring(0, start) + text.substring(end);
    return removeNestedQuotes(modified);
  }

  function iveltNotify(message) {
    let fadeTarget = document.getElementById('ivelt-notify');
    if (!fadeTarget) {
      fadeTarget = document.createElement('div');
      fadeTarget.id = 'ivelt-notify';
      Object.assign(fadeTarget.style, {
        position: 'fixed', top: '30%', left: '50%', zIndex: '99999',
        background: '#eee', textAlign: 'center', padding: '5px 25px 7px',
        transform: 'translateX(-50%)', borderLeft: '2px solid #999',
        borderRight: '2px solid #999', borderBottom: '2px solid #999',
        borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px',
        transition: 'opacity 0.75s linear', fontSize: '1rem'
      });
      const container = document.querySelector('#page-body') || document.body;
      container.insertBefore(fadeTarget, container.firstChild);
    }
    fadeTarget.style.opacity = '1';
    fadeTarget.innerHTML = message;
    setTimeout(() => { fadeTarget.style.opacity = '0'; }, 1500);
  }

  // -- Settings div injected into page for sub-scripts -------------------------
  let settings = storage.getAll();
  function refreshSettingsDiv() {
    if (!document.body) return;
    let e = document.getElementById('iveltHelperSettings');
    if (!e) {
      e = document.createElement('div');
      e.style.display = 'none';
      e.id = 'iveltHelperSettings';
      document.body.appendChild(e);
    }
    e.setAttribute('data-background-sync', settings.backgroundSync);
    e.setAttribute('data-background-sync-posts', settings.backgroundSyncPosts);
    e.setAttribute('data-always-copy-topic', settings.alwaysCopyTopic);
    e.setAttribute('data-copy-attachments', settings.copyAttachments);
    e.setAttribute('data-cached-topic-mapping-expire', settings.cachedTopicMappingExpire);
    e.setAttribute('data-force-update-topic-map-cache', settings.forceUpdateTopicMapCache);
    e.setAttribute('data-sticky-post-buttons', settings.stickyPostButtons);
    e.setAttribute('data-show-multi-notifs', settings.ShowMultiNotifs);
    e.setAttribute('data-sefaria-linker', settings.sefariaLinker);
    e.setAttribute('data-up-down-arrow-keys', settings.upDownArrowKeys);
    e.setAttribute('data-copy-post-link', settings.copyPostLink);
    e.setAttribute('data-editor-undo', settings.editorUndo);
    e.setAttribute('data-print-show-likes', 'false');
  }

  if (settings.forceUpdateTopicMapCache) {
    storage.set('forceUpdateTopicMapCache', false);
  }

  // -- Keyboard shortcuts ------------------------------------------------------
  function previousPage() { const el = document.querySelector('.previous a'); if (el) el.click(); }
  function nextPage() { const el = document.querySelector('.next a'); if (el) el.click(); }
  function scrollTopPage() { window.scrollTo({ top: 0, behavior: 'instant' }); }
  function scrollBottomPage() { window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }); }
  function sendPost(post) { if (post) post.click(); }
  function previewPost() { const el = document.querySelector('input[name="preview"]'); if (el) el.click(); }
  function toggleNotification() {
    const el = document.getElementById('notification_list_button');
    if (el) { el.scrollIntoView({ behavior: 'instant', block: 'start' }); el.click(); }
  }
  function nextNotification() {
    const nodes = document.querySelectorAll('li.bg2 .notification-block, li.bg3 .notification-block');
    for (const node of nodes) {
      const url = node.dataset.realUrl || node.href;
      if (url) { window.location.href = url; break; }
    }
  }

  let postInput = document.querySelector('input[name="post"]') || document.querySelector('input[name="submit"]') || null;
  if (postInput) postInput.setAttribute('title', 'שיק (שארטקאט קאנטראל+ענטער)');

  function isTyping(e) {
    const tag = e.target && e.target.nodeName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    if (e.target && e.target.isContentEditable) return true;
    return false;
  }

  document.addEventListener('keydown', function (e) {
    const isAltKey = e.altKey || e.getModifierState('AltGraph');
    if (e.code === 'KeyA' && isAltKey) { e.preventDefault(); window.location.href = 'https://www.ivelt.com/forum/search.php?search_id=active_topics'; return; }
    if (e.code === 'KeyV' && isAltKey && postInput) { e.preventDefault(); previewPost(); return; }
    if (e.code === 'KeyN' && isAltKey) { e.preventDefault(); toggleNotification(); return; }
    if (e.code === 'KeyM' && isAltKey) { e.preventDefault(); nextNotification(); return; }
    if (isTyping(e)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nextPage(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); previousPage(); }
    else if (e.key === 'ArrowUp' && settings.upDownArrowKeys !== false) { e.preventDefault(); scrollTopPage(); }
    else if (e.key === 'ArrowDown' && settings.upDownArrowKeys !== false) { e.preventDefault(); scrollBottomPage(); }
  });

  // Ctrl+Enter sends the post, once. phpBB's editor.js also binds Ctrl+Enter in textareas and
  // clicks every submit button, which double-submitted and broke edits (upstream fix).
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    const post = document.getElementsByName('post')[0] || document.getElementsByName('submit')[0];
    if (!post) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) sendPost(post);
  }, true);

  // -- Remove nested quotes when last=true -------------------------------------
  if (window.location.href.includes('last=true')) {
    const messageArea = document.querySelector('#message') || document.querySelector('textarea[name="message"]');
    if (messageArea && messageArea.value && hasNestedQuotes(messageArea.value)) {
      messageArea.value = removeNestedQuotes(messageArea.value);
    }
  }

  // -- Topic buttons (chucem fork) --------------------------------------------
  const CACHE_KEY = 'iveltHelper_topicMappingCache';
  const CACHE_TIME_KEY = 'iveltHelper_topicMappingLastFetchTime';
  const TOPIC_MAPPING_EXPIRE = (settings.cachedTopicMappingExpire || 3600) * 1000;
  const COPY_ATTACHMENTS = settings.copyAttachments === true;
  let topicMappingPromise = null;

  function createButton(reference, customClass, title, text, onclick, itext = '') {
    const li = document.createElement('li');
    const a = document.createElement('a');
    const span = document.createElement('span');
    const i = document.createElement('i');
    a.setAttribute('href', reference || 'javascript:void(0);');
    if (onclick) a.setAttribute('onclick', onclick);
    a.setAttribute('class', 'button button-icon-only custom-btn');
    a.setAttribute('title', title);
    a.style.background = '#ebeadd';
    i.setAttribute('class', `icon ${customClass} fa-fw`);
    i.setAttribute('aria-hidden', 'true');
    i.style.width = 'auto';
    i.style.minWidth = '18px';
    i.innerText = itext;
    span.innerText = text;
    a.appendChild(i);
    a.appendChild(span);
    li.appendChild(a);
    return { li, a, span, i };
  }

  function getPMHref(id) {
    const pm_button = document.querySelector(`#profile${id} .pm-icon`);
    if (pm_button) return pm_button.parentElement;
    return null;
  }

  function getUsername(post_id, prefix = 'p') {
    const usernameElm = document.querySelector(`#${prefix}${post_id} .username`) || document.querySelector(`#${prefix}${post_id} .username-coloured`);
    return usernameElm ? usernameElm.innerText : '';
  }

  function getQuoteElm(btn) {
    const quoteButton = btn.querySelector('i.icon.fa-quote-left.fa-fw, i.icon.fa-quote-right.fa-fw, i.fa-quote-left, i.fa-quote-right');
    if (quoteButton && quoteButton.parentElement) return quoteButton.parentElement;
    return null;
  }

  function addSimpleButton(btn, href, customClass, title, text, onclick, itext = '') {
    const button = createButton(href, customClass, title, text, onclick, itext);
    const quoteLi = getQuoteElm(btn)?.parentElement;
    if (quoteLi) quoteLi.parentNode.insertBefore(button.li, quoteLi.nextSibling);
  }

  function addUnderlineForQuoteBtn(btn) {
    const sourceURL = getQuoteElm(btn);
    if (sourceURL) sourceURL.style.background = '#ebeadd';
  }

  function extractImageUrlsAndNames(contentElement) {
    const images = contentElement.querySelectorAll('img.postimage');
    return Array.from(images).map(img => ({ url: img.src, name: img.alt || '' }));
  }

  function replaceAttachmentsWithImgBBCode(text, imageData) {
    if (!COPY_ATTACHMENTS) return text;
    try {
      const data = JSON.parse(imageData);
      data.forEach(image => {
        if (image.name) {
          const regex = new RegExp(image.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          text = text.replace(regex, `[img]${image.url}[/img]`);
        }
      });
      text = text.replace(/\[attachment=\d+\]|\[\/attachment\]/g, '');
    } catch (e) {}
    return text;
  }

  function getPostLink(postID) {
    return `https://www.ivelt.com/forum/viewtopic.php?p=${postID}#p${postID}`;
  }

  function getPostDetails(post_id, prefix = 'p') {
    const usernameElm = document.querySelector(`#${prefix}${post_id} .username`) || document.querySelector(`#${prefix}${post_id} .username-coloured`);
    const username = usernameElm ? usernameElm.innerText : '';
    const usernameLink = usernameElm ? usernameElm.href : '';
    const userId = usernameLink ? (usernameLink.split('u=')[1] || '') : '';
    let postTime;
    const postTimestampElm = document.querySelector(`#${prefix}${post_id} time`);
    if (postTimestampElm) {
      postTime = Date.parse(postTimestampElm.dateTime) / 1000;
    } else {
      try {
        const tsExtractor = document.querySelector(`#${prefix}${post_id} [href='#postingbox']`).getAttribute('onclick');
        const match = tsExtractor.match(/time:(\d+)/);
        if (match) postTime = parseInt(match[1], 10);
      } catch (e) {}
    }
    return { username, id: userId, time: postTime };
  }

  function ping_user(post_id) {
    const PostDetails = getPostDetails(post_id, window.location.href.includes('posting.php') ? 'pr' : 'p');
    const text = `[quote="${PostDetails.username}" user_id=${PostDetails.id} time=${PostDetails.time} post_id=${post_id}]\n[/quote]`;
    if (window.location.href.includes('posting.php')) {
      insertText(text);
    } else {
      if (settings.alwaysCopyTopic) {
        navigator.clipboard.writeText(text).then(() => iveltNotify('קאפירט צום קליפבאורד'));
      } else {
        addText(text);
      }
    }
  }

  function lastaddquote(post_id, username) {
    const divArea = document.getElementById('message_' + post_id) || document.getElementById('post_content' + post_id) || document.getElementById('pr' + post_id);
    if (!divArea) return;
    let theSelection = '';
    if (divArea.innerHTML) {
      theSelection = divArea.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
    } else if (divArea.textContent) {
      theSelection = divArea.textContent;
    } else if (divArea.firstChild && divArea.firstChild.nodeValue) {
      theSelection = divArea.firstChild.nodeValue;
    }
    if (theSelection) insertText('[quote="' + username + '"]'+ removeNestedQuotes(theSelection) + '[/quote]');
  }

  function fetchMsgText(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(r => r.text())
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const box = doc.querySelector('#message-box #message');
        return box ? box.innerText : '';
      });
  }

  function copyQuote(url, post_id, imageData) {
    const post_url = getPostLink(post_id);
    fetchMsgText(url).then(res => {
      res = replaceAttachmentsWithImgBBCode(res, imageData);
      if (url.toString().includes('posting.php')) {
        res = `${res} [url=${post_url}]מקור[/url]`;
      }
      navigator.clipboard.writeText(res).then(() => iveltNotify('קאפירט צום קליפבאורד'));
    });
  }

  function copyQuoteParse(post_id) {
    const content = document.querySelector(`#post_content${post_id} .content`);
    if (!content) return;
    const post_url = getPostLink(post_id);
    const username = getUsername(post_id);
    let html = content.innerHTML.replace(/\.\/download/g, 'https://www.ivelt.com/forum/download');
    const bbcode = simpleHtmlToBBCode(html);
    navigator.clipboard.writeText(`[quote="${username}"]${bbcode}[/quote] [url=${post_url}]מקור[/url]`)
      .then(() => iveltNotify('קאפירט צום קליפבאורד'));
  }

  function addCopyQuoteButton(btn, postID, imageData) {
    const sourceURL = getPMHref(postID) || getQuoteElm(btn);
    addSimpleButton(btn, null, 'fa-copy', 'ציטיר אין אנדערע אשכול', 'ציטיר אין אנדערע אשכול',
      sourceURL ? `copyQuote("${sourceURL.getAttribute('href')}", "${postID}", '${JSON.stringify(imageData)}')` : `copyQuoteParse("${postID}")`);
  }

  function addQuoteLastButton(btn, isPosting) {
    const quoteElm = getQuoteElm(btn);
    if (!quoteElm) return;
    const href = quoteElm.getAttribute('href');
    addSimpleButton(btn, `${href}&last=true`, 'fa-quote-left last', 'ציטיר בלויז די לעצטע תגובה', 'ציטיר לעצטע',
      isPosting ? `last${quoteElm.getAttribute('onclick')}` : null, '1');
  }

  function addDefaultPage() {
    if (document.getElementById('kf-app-default-page')) return false;
    const li = document.createElement('li');
    const a = document.createElement('a');
    li.appendChild(a);
    li.className = 'rightside';
    li.id = 'kf-app-default-page';
    a.setAttribute('onclick', 'saveDefaultPage()');
    a.innerText = 'מאך די בלאט די דיפאולט בלאט';
    const pagination = document.querySelector('#nav-footer');
    if (pagination) {
      pagination.insertBefore(li, pagination.firstChild);
      return true;
    }
    return false;
  }

  async function fetchTopicMapping() {
    if (!settings.cachedTopicMappingExpire) return null;
    const now = Date.now();
    const cachedData = localStorage.getItem(CACHE_KEY);
    const lastFetchTime = localStorage.getItem(CACHE_TIME_KEY);
    if (!settings.forceUpdateTopicMapCache && cachedData && lastFetchTime && (now - parseInt(lastFetchTime, 10) < TOPIC_MAPPING_EXPIRE)) {
      try { return JSON.parse(cachedData); } catch (e) {}
    }
    if (topicMappingPromise) return topicMappingPromise;
    const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS8-2oWC0g995y_fNyR4scrXBEimeYpI5Hm0TPqt1IyvVqEdVUDKYw2n7Z6A2d1DDj3Ef6ofpwe2s3T/pub?gid=986512672&single=true&output=csv';
    topicMappingPromise = (async () => {
      try {
        let csvText = '';
        if (typeof GM_xmlhttpRequest === 'function') {
          csvText = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
              method: 'GET', url: url, onload: (res) => resolve(res.responseText),
              onerror: () => reject(new Error('GM_xmlhttpRequest failed'))
            });
          });
        } else if (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function') {
          csvText = await new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
              method: 'GET', url: url, onload: (res) => resolve(res.responseText),
              onerror: () => reject(new Error('GM.xmlHttpRequest failed'))
            });
          });
        } else {
          const response = await fetch(url);
          if (!response.ok) throw new Error(response.statusText);
          csvText = await response.text();
        }
        const mappings = {};
        csvText.split('\n').forEach(row => {
          const [sourceTopic, targetTopic] = row.split(',').map(cell => cell.trim());
          if (sourceTopic && targetTopic) mappings[sourceTopic] = targetTopic;
        });
        localStorage.setItem(CACHE_KEY, JSON.stringify(mappings));
        localStorage.setItem(CACHE_TIME_KEY, now.toString());
        return mappings;
      } catch (error) {
        console.error('Error fetching topic mappings:', error);
        return cachedData ? JSON.parse(cachedData) : null;
      } finally {
        topicMappingPromise = null;
      }
    })();
    return topicMappingPromise;
  }

  function getCurrentTopicIdFromDOM() {
    const match = document.querySelector('.topic-title a')?.href?.match(/[?&]t=(\d+)/);
    return match?.[1] ?? null;
  }

  async function quoteInOtherTopic(url, postID, targetTopicId, imageData) {
    if (!targetTopicId) { alert('No target topic found for this topic in the mapping.'); return; }
    try {
      let res = await fetchMsgText(url);
      if (!res) return;
      res = replaceAttachmentsWithImgBBCode(res, imageData);
      const replyURL = `https://www.ivelt.com/forum/posting.php?mode=reply&t=${targetTopicId}`;
      const replyWindow = window.open(replyURL, '_blank');
      if (!replyWindow) { alert('Popup blocked. Please allow popups for this site.'); return; }
      replyWindow.onload = () => {
        const interval = setInterval(() => {
          try {
            const textarea = replyWindow.document.querySelector('#message-box textarea');
            if (textarea) { textarea.value = res; clearInterval(interval); }
          } catch (e) { clearInterval(interval); }
        }, 100);
      };
    } catch (e) { console.error('quoteInOtherTopic error', e); }
  }

  function addQuoteInOtherTopicButton(btn, postID, topicMapping, imageData) {
    if (btn.querySelector('.custom-btn .fa-comment')) return;
    const currentTopicId = getCurrentTopicIdFromDOM();
    if (!currentTopicId) return;
    const targetTopicId = topicMapping[currentTopicId];
    if (!targetTopicId) return;
    const sourceURL = getQuoteElm(btn);
    if (!sourceURL) return;
    addSimpleButton(btn, null, 'fa-comment', 'ציטיר אין קאמענטארן אשכול', 'ציטיר אין קאמענטארן אשכול',
      `quoteInOtherTopic("${sourceURL.getAttribute('href')}", "${postID}", "${targetTopicId}", '${JSON.stringify(imageData)}')`);
  }

  // Expose handlers to page window so inline onclick attributes work in Tampermonkey
  function exposeHandlers() {
    const fns = { ping_user, copyQuote, copyQuoteParse, quoteInOtherTopic, lastaddquote };
    Object.keys(fns).forEach(name => {
      try { if (typeof unsafeWindow !== 'undefined') unsafeWindow[name] = fns[name]; } catch (e) {}
      try { window[name] = fns[name]; } catch (e) {}
    });
  }
  exposeHandlers();

  function addTopicButtons() {
    const onlyLastQuote = window.location.href.includes('last=true');
    if (onlyLastQuote) {
      const messageArea = document.querySelector('#message');
      if (messageArea && hasNestedQuotes(messageArea.innerHTML)) {
        messageArea.innerHTML = removeNestedQuotes(messageArea.innerHTML);
      }
    }

    const btns = document.querySelectorAll('.post-buttons');
    const isPosting = window.location.href.includes('posting.php');
    const isPM = window.location.href.includes('ucp.php');
    let needUpdating = false;

    btns.forEach(btn => {
      if (btn.querySelector('.custom-btn')) return;
      needUpdating = true;
      btn.querySelectorAll('li.hidden:not(.responsive-menu)').forEach(b => { if (b.getAttribute('class') === 'hidden') b.removeAttribute('class'); });
      addUnderlineForQuoteBtn(btn);
      const contentElement = btn.parentElement && btn.parentElement.querySelector('.content');
      if (!contentElement) return;
      const imageData = extractImageUrlsAndNames(contentElement);
      let id = btn.parentElement.getAttribute('id') || '';
      let strippedId = id.replace('post_content', '').replace('pr', '');
      if (!isPosting) addCopyQuoteButton(btn, id.replace('post_content', ''), imageData);
      addSimpleButton(btn, null, 'fa-at', 'דערמאן תגובה', 'דערמאן תגובה', `ping_user("${strippedId}")`);
      if (contentElement.innerHTML.includes('blockquote')) addQuoteLastButton(btn, isPosting);
      try { const resp = btn.querySelector('.responsive-menu'); if (resp) btn.removeChild(resp); } catch (e) {}
    });

    // Add cross-topic quote buttons asynchronously so page isn't blocked on fetch
    if (settings.cachedTopicMappingExpire && !isPosting && !isPM) {
      fetchTopicMapping().then(topicMapping => {
        if (!topicMapping) return;
        document.querySelectorAll('.post-buttons').forEach(btn => {
          if (btn.querySelector('.custom-btn .fa-comment')) return;
          const contentElement = btn.parentElement && btn.parentElement.querySelector('.content');
          if (!contentElement) return;
          const imageData = extractImageUrlsAndNames(contentElement);
          let id = btn.parentElement.getAttribute('id') || '';
          let strippedId = id.replace('post_content', '').replace('pr', '');
          addQuoteInOtherTopicButton(btn, strippedId, topicMapping, imageData);
        });
      });
    }

    const navUpdate = addDefaultPage();
    if (needUpdating || navUpdate) {
      const navBar = document.querySelector('#nav-footer');
      if (navBar) {
        navBar.querySelectorAll('li.hidden:not(.responsive-menu)').forEach(si => {
          si.setAttribute('class', (si.getAttribute('class') || '').replace('hidden', '').trim());
        });
        try {
          const resp = navBar.querySelector('.responsive-menu');
          if (resp) navBar.removeChild(resp);
        } catch (e) {}
      }
    }
  }

  // -- Google search boxes ----------------------------------------------------
  function addGoogleSearch() {
    if (document.getElementById('g_search_keywords') || document.getElementById('g_site_search_keywords')) return;
    if (window.location.href.includes('viewtopic.php')) {
      const titleEl = document.querySelector('.topic-title > a') || document.querySelector('h2.topic-title a');
      const topicTitle = titleEl ? titleEl.textContent.trim() : '';
      const searchBox = document.getElementById('search_keywords');
      if (searchBox && topicTitle) {
        const url = `https://www.google.com/search?q=intitle%3A"${encodeURIComponent(topicTitle)}"+site%3Awww.ivelt.com+`;
        const input = document.createElement('input');
        input.className = 'inputbox search tiny';
        input.style = 'border-width:1px;border-radius:4px';
        input.type = 'search'; input.id = 'g_search_keywords'; input.size = 20;
        input.placeholder = 'גוגל זוך אין דעם אשכול…';
        searchBox.parentNode.insertBefore(input, searchBox);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { window.open(url + encodeURIComponent(input.value), '_blank'); e.preventDefault(); }
        });
      }
    }
    const siteSearch = document.getElementById('search');
    if (siteSearch) {
      const url = `https://www.google.com/search?q=site%3Awww.ivelt.com+`;
      const input = document.createElement('input');
      input.id = 'g_site_search_keywords'; input.type = 'search'; input.className = 'inputbox search';
      input.style = 'border-radius:4px;margin-bottom:5px;';
      input.placeholder = 'גוגל זוך אין אייוועלט';
      siteSearch.parentNode.insertBefore(input, siteSearch);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { window.open(url + encodeURIComponent(input.value), '_blank'); e.preventDefault(); }
      });
    }
  }

  // -- Media embed (ivelt-media) ---------------------------------------------
  function embedMedia() {
    const posts = document.querySelectorAll('.postprofile + .postbody .content, #preview .postbody .content');
    if (!posts.length) return;

    let style = document.getElementById('ivelt-media-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ivelt-media-style';
      style.textContent = `
        .ivelt-media__root { margin-top:1.5rem; padding:0.75rem; border-left:solid #60a5fa 3px; background:#dbeafe; display:flex; flex-direction:column; gap:0.5rem; }
        .ivelt-media__root .links { margin-top:0.75rem; display:flex; gap:1rem; }
        .ivelt-media__root .container { display:flex; position:relative; isolation:isolate; width:100%; aspect-ratio:16/9; }
        .ivelt-media__root iframe, .ivelt-media__root video { display:block; position:absolute; inset:0; width:100%; height:100%; background:black; }
        .ivelt-media__root video[filename$=".mp3"] { background:transparent; }
      `;
      document.head.appendChild(style);
    }

    posts.forEach(post => {
      if (post.dataset.iveltMediaProcessed) return;
      post.dataset.iveltMediaProcessed = 'true';
      const links = Array.from(post.querySelectorAll('a')).filter(a => {
        const href = a.getAttribute('href') || '';
        return href.startsWith('https://drive.google.com/file/d/') || /^https:\/\/www\.dropbox\.com\/scl\/fi\/[^?]+&dl=0/.test(href);
      });
      if (!links.length) return;
      const media = links.map(l => {
        const href = l.getAttribute('href');
        if (href.startsWith('https://drive.google.com')) {
          const m = /^https:\/\/drive\.google\.com\/file\/d\/([^\/]+)/.exec(href);
          if (!m) return null;
          return { href, type: 'google-drive', id: m[1] };
        }
        const m = /^https:\/\/www\.dropbox\.com\/scl\/fi\/([^\/]+)\/(.+?)\?(.+)&dl=0/.exec(href);
        if (!m) return null;
        return { href, type: 'dropbox', id: `${m[1]}/${m[2]}?${m[3]}`, filename: m[2] };
      }).filter(Boolean);
      if (!media.length) return;
      const html = media.map(m => {
        const download = m.type === 'google-drive' ? `https://drive.google.com/uc?export=download&id=${m.id}` : `https://www.dropbox.com/scl/fi/${m.id}&dl=1`;
        const player = m.type === 'google-drive'
          ? `<iframe src='https://drive.google.com/file/d/${m.id}/preview' frameborder='0' loading='lazy' scrolling='no' allowfullscreen></iframe>`
          : `<video controls filename="${m.filename}"><source src='https://www.dropbox.com/scl/fi/${m.id}&dl=1'/></video>`;
        return `<div class='links'><a class='button' href='${download}'><i class='icon fa-download'></i> דאונלאויד</a></div><div class='container'>${player}</div>`;
      }).join('');
      const root = document.createElement('div');
      root.className = 'ivelt-media__root';
      root.innerHTML = html;
      post.insertAdjacentElement('afterend', root);
    });
  }

  // -- Page enhancements ------------------------------------------------------
  function pageEnhancements() {
    if (settings.stickyPostButtons) {
      let stickyStyle = document.getElementById('ivelt-sticky-style');
      if (!stickyStyle) {
        stickyStyle = document.createElement('style');
        stickyStyle.id = 'ivelt-sticky-style';
        stickyStyle.textContent = `.sticky-post { position: fixed; top: 0; z-index: 9999; background: #f9f9f9; border: 1px solid #ccc; padding: 4px; }`;
        document.head.appendChild(stickyStyle);
      }
      if (!document.body.dataset.iveltStickyListening) {
        document.body.dataset.iveltStickyListening = 'true';
        const checkStickyPosition = () => {
          let firstStickyFound = false;
          document.querySelectorAll('.has-profile .post-buttons').forEach(btn => {
            const parent = btn.parentElement;
            if (!parent) return;
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.top < 0 && parentRect.bottom > 30 && !firstStickyFound) {
              firstStickyFound = true;
              if (!btn.classList.contains('sticky-post')) {
                const btnRect = btn.getBoundingClientRect();
                btn.style.left = `${btnRect.left}px`;
                btn.classList.add('sticky-post');
              }
            } else {
              if (btn.classList.contains('sticky-post')) {
                btn.classList.remove('sticky-post');
                btn.style.left = '';
              }
            }
          });
        };
        window.addEventListener('scroll', checkStickyPosition);
        checkStickyPosition();
      }
    }

    // Copy the post link (small icon next to the author name) on a plain left click;
    // right-click, long-press, middle-click and modifier clicks keep default behavior.
    if (settings.copyPostLink !== false && !document.body.dataset.iveltCopyPostLink) {
      document.body.dataset.iveltCopyPostLink = 'true';
      document.addEventListener('click', (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('[id^="post_content"] > p.author > a[href*="#p"]');
        if (!link) return;
        const postId = new URL(link.href).hash.replace('#p', '');
        if (!/^\d+$/.test(postId)) return;
        event.preventDefault();
        const postUrl = `${window.location.origin}/forum/viewtopic.php?p=${postId}#p${postId}`;
        navigator.clipboard.writeText(postUrl)
          .then(() => showCopiedTip(link))
          .catch(() => { window.location.href = link.href; });
      });
    }

    const url = new URL(window.location.href);
    if (url.pathname === '/forum/viewtopic.php' && !document.body.dataset.iveltPaginationDuped) {
      const paginations = document.getElementsByClassName('pagination');
      if (paginations.length >= 2) {
        paginations[1].outerHTML = paginations[0].outerHTML;
        document.body.dataset.iveltPaginationDuped = 'true';
      }
    }

    if (url.pathname === '/forum/ucp.php' && url.searchParams.get('i') === 'ucp_notifications') {
      const pagination = document.querySelector('.action-bar.bar-top .pagination');
      if (pagination && !document.getElementById('ext-hide-read')) {
        const link = document.createElement('a');
        link.href = 'javascript:void(0);';
        link.id = 'ext-hide-read';
        link.innerText = 'באהאלט די געליינטע';
        link.addEventListener('click', function (event) {
          document.querySelectorAll('li.row.bg1, li.row.bg2').forEach(e => e.style.display = (e.style.display === 'none') ? '' : 'none');
          if (event.currentTarget.id === 'ext-hide-read') {
            event.currentTarget.innerText = 'ווייז די געליינטע';
            event.currentTarget.id = 'ext-show-read';
          } else {
            event.currentTarget.innerText = 'באהאלט די געליינטע';
            event.currentTarget.id = 'ext-hide-read';
          }
        });
        const linkWrap = document.createElement('span');
        linkWrap.innerText = ' • ';
        linkWrap.insertBefore(link, linkWrap.firstChild);
        pagination.insertBefore(linkWrap, pagination.firstChild);
      }
    }
  }

  function showCopiedTip(anchor) {
    const tip = document.createElement('span');
    tip.className = 'ext-copied-tip';
    tip.innerText = 'לינק קאפירט ✓';
    const rect = anchor.getBoundingClientRect();
    tip.style.top = `${rect.top + window.scrollY - 28}px`;
    tip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
    document.body.appendChild(tip);
    const margin = 6;
    const tipRect = tip.getBoundingClientRect();
    const viewWidth = document.documentElement.clientWidth;
    const shift = Math.min(0, viewWidth - margin - tipRect.right) || Math.max(0, margin - tipRect.left);
    tip.style.left = `${parseFloat(tip.style.left) + shift}px`;
    setTimeout(() => tip.classList.add('ext-copied-tip-hide'), 1200);
    setTimeout(() => tip.remove(), 1600);
  }

  // -- Split notifications ----------------------------------------------------
  function splitNotifications() {
    if (!settings.ShowMultiNotifs) return;
    const originalLI = document.querySelector('#notification_list')?.closest('li');
    if (!originalLI || originalLI.dataset.iveltSplit) return;
    originalLI.dataset.iveltSplit = 'true';
    const allItems = Array.from(document.querySelectorAll('#notification_list ul li'));
    if (!allItems.length) return;

    const matchType = (li, type) => {
      const title = li.querySelector('.notification-title')?.textContent.trim() || '';
      return title.startsWith(type);
    };
    const citirtItemsAll = allItems.filter(li => matchType(li, 'ציטירט'));
    const badanktItemsAll = allItems.filter(li => matchType(li, 'באדאנקט'));
    const dermantItemsAll = allItems.filter(li => matchType(li, 'דערמאנט'));
    const isUnread = li => li.classList.contains('bg1') || li.classList.contains('bg2');
    const citirtCount = citirtItemsAll.filter(isUnread).length;
    const badanktCount = badanktItemsAll.filter(isUnread).length;
    const dermantCount = dermantItemsAll.filter(isUnread).length;

    [...citirtItemsAll, ...badanktItemsAll, ...dermantItemsAll].forEach(li => li.remove());

    function createNotificationBell(type, label, count, items, iconClass) {
      const li = originalLI.cloneNode(true);
      li.id = `${type}_notification_item`;
      li.classList.add('notif-bell');
      const link = li.querySelector('a.dropdown-trigger');
      if (link) {
        link.id = `${type}_notification_list_button`;
        link.href = '#';
        const icon = link.querySelector('i.icon');
        if (icon) icon.className = `icon ${iconClass} fa-fw`;
        const labelSpan = link.querySelector('span');
        if (labelSpan) labelSpan.textContent = label;
        const badge = link.querySelector('strong.badge');
        if (badge) { if (count <= 0) badge.remove(); else badge.textContent = count; }
      }
      const dropdown = li.querySelector('.dropdown-extended');
      if (dropdown) {
        dropdown.id = `${type}_notification_list`;
        const header = dropdown.querySelector('.header');
        if (header) header.textContent = label;
        const ul = dropdown.querySelector('ul');
        if (ul) { ul.innerHTML = ''; items.forEach(item => ul.appendChild(item)); }
        const footerLink = dropdown.querySelector('.footer a');
        if (footerLink) { footerLink.href = './ucp.php?i=ucp_notifications'; footerLink.textContent = 'צייג אלע'; }
      }
      if (link) {
        link.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          document.querySelectorAll('.dropdown-extended').forEach(el => { if (el !== dropdown) el.style.display = 'none'; });
          dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
        });
      }
      document.addEventListener('click', e => { if (!li.contains(e.target)) dropdown.style.display = 'none'; });
      return li;
    }

    const parent = originalLI.parentElement;
    if (parent) {
      [badanktItemsAll, dermantItemsAll, citirtItemsAll].forEach((items, idx) => {
        const config = [['badankt', 'באדאנקט', badanktCount, 'fa-thumbs-up'], ['dermant', 'דערמאנט', dermantCount, 'fa-at'], ['citirt', 'ציטירט', citirtCount, 'fa-quote-left']][idx];
        const bell = createNotificationBell(config[0], config[1], config[2], items, config[3]);
        parent.insertBefore(bell, originalLI);
      });
    }

    const originalBadge = originalLI.querySelector('strong.badge');
    if (originalBadge) {
      const currentCount = parseInt(originalBadge.textContent.trim(), 10) || 0;
      const adjusted = currentCount - citirtCount - badanktCount - dermantCount;
      const newCount = adjusted > 0 ? adjusted : 0;
      if (newCount > 0) originalBadge.textContent = newCount;
      else originalBadge.remove();
    }
  }

  // -- Multi-page print (chucem) -----------------------------------------------
  function cleanPosts() {
    const pageBody = document.querySelector('#page-body');
    if (!pageBody) return;
    while (pageBody.nextSibling) pageBody.parentNode.removeChild(pageBody.nextSibling);
    while (pageBody.previousSibling) pageBody.parentNode.removeChild(pageBody.previousSibling);
    document.querySelectorAll('#page-body > :not(.post):not(.topic-title), .post-buttons, ul.profile-icons, dl.postprofile, div.back2top, div.bg3, .signature, .post:not([id^="p"])').forEach(el => el.remove());
    document.querySelectorAll('.postbody').forEach(el => el.style.width = '100%');
    document.querySelectorAll('.responsive-hide').forEach(el => el.classList.remove('responsive-hide'));
    document.querySelectorAll('.postbody h3').forEach(el => { if (el.textContent.includes('Re:')) el.remove(); });
  }

  async function loadPage(page, lastPage) {
    if (page < lastPage) {
      const el = document.getElementById('loading-page');
      if (el) el.textContent = page;
      await loadNextPage(page, lastPage);
    } else {
      cleanPosts();
      window.print();
    }
  }

  function loadNextPage(page, lastPage) {
    const baseUrl = document.URL.replace(/&start=\d*/, '');
    const url = baseUrl + '&start=' + (page++ * 25);
    return fetch(url, { credentials: 'same-origin' })
      .then(response => response.text())
      .then(data => {
        const element = document.createElement('h3');
        element.className = 'page-number-new';
        element.textContent = 'זייט ' + page;
        element.style.cssText = 'text-align: center; font-size: 14px';
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, 'text/html');
        const postsHTML = Array.from(doc.querySelectorAll('.post')).map(e => e.outerHTML).join('');
        const posts = document.querySelectorAll('.post');
        const lastPost = posts[posts.length - 1];
        if (lastPost && postsHTML) lastPost.insertAdjacentHTML('afterend', element.outerHTML + postsHTML);
        return loadPage(page, lastPage);
      });
  }

  function printThread() {
    const lastPageEl = Array.from(document.querySelectorAll('.pagination li:not(.next)')).pop();
    let lastPage = parseInt(lastPageEl?.textContent || document.querySelector('.pagination strong')?.textContent || 0, 10) || 0;
    const on_pageEl = document.querySelector('.pagination li.active') || document.querySelector('.pagination strong');
    const on_page = parseInt(on_pageEl?.textContent || 0, 10) || 0;
    if (on_page === 0) return;
    if (on_page !== lastPage) {
      const userInput = prompt(`You are on page ${on_page} of ${lastPage} pages.\r\nTill which page do you want to print?`, lastPage);
      lastPage = Math.max(on_page, Math.min(lastPage, parseInt(userInput, 10) || lastPage));
    }
    const newElement = document.createElement('h3');
    newElement.style.textAlign = 'center'; newElement.style.fontSize = '14px';
    newElement.textContent = 'loading page ';
    const newSpan = document.createElement('span'); newSpan.id = 'loading-page';
    newElement.appendChild(newSpan);
    const pageBody = document.querySelector('#page-body');
    if (pageBody && pageBody.parentNode) pageBody.parentNode.insertBefore(newElement, pageBody);
    loadPage(on_page, lastPage);
  }

  function addPrintBtn() {
    if (document.body.dataset.iveltPrintAdded) return;
    document.body.dataset.iveltPrintAdded = 'true';
    const uls = document.querySelectorAll('ul:has(.icon.fa-print.fa-fw)');
    if (!uls.length) {
      const nav = document.querySelector('#nav-footer') || document.querySelector('.action-bar.bar-top ul') || document.querySelector('.topic-actions');
      if (nav && !nav.querySelector('.ivelt-print-btn')) {
        const li = document.createElement('li');
        li.className = 'ivelt-print-btn';
        li.innerHTML = `<a href="javascript:void(0);" title="פרינט עטליכע בלעטער/גאנצע אשכול"><i class="icon fa-print fa-fw" aria-hidden="true"></i><span>פרינט עטליכע בלעטער/גאנצע אשכול</span></a>`;
        li.querySelector('a').addEventListener('click', e => { e.preventDefault(); printThread(); });
        nav.appendChild(li);
      }
      return;
    }
    uls.forEach(ul => {
      if (ul.querySelector('.ivelt-print-btn')) return;
      const li = document.createElement('li');
      li.className = 'ivelt-print-btn';
      li.innerHTML = `<a href="javascript:void(0);" title="פרינט עטליכע בלעטער/גאנצע אשכול"><i class="icon fa-print fa-fw" aria-hidden="true"></i><span>פרינט עטליכע בלעטער/גאנצע אשכול</span></a>`;
      li.querySelector('a').addEventListener('click', e => { e.preventDefault(); printThread(); });
      ul.appendChild(li);
    });
  }

  // -- New response notification ---------------------------------------------
  function newResponseNotification() {
    if (!settings.backgroundSync || !settings.backgroundSyncPosts || settings.backgroundSyncPosts == 0 || window.location.pathname !== '/forum/viewtopic.php') return;
    const pagination = document.querySelector('div.pagination');
    const posts = document.querySelectorAll('.post.has-profile');
    const isLastPage = document.getElementsByClassName('next').length === 0;
    if (!pagination || !posts.length || !isLastPage) return;
    const match = pagination.innerHTML.match(/(\d+) תגובות/);
    if (!match) return;
    let currentCount = parseInt(match[1], 10);
    const topicLink = document.querySelector('h2.topic-title > a') || document.querySelector('.topic-title a');
    const forumLink = document.querySelector('.left-box.arrow-right');
    if (!topicLink || !forumLink) return;
    const topicURL = topicLink.href;
    const topicId = new URLSearchParams(topicURL.substr(topicURL.indexOf('?'))).get('t');
    if (!topicId) return;
    const forumURL = forumLink.href;
    const lastPost = posts[posts.length - 1];
    const title = document.title;
    let interval = parseInt(settings.backgroundSyncPosts, 10) || 20000;
    if (interval < 5000) interval = 5000;
    let notificationElement = null;
    let titleFlashInterval = null;

    function checkNewResponse() {
      fetch(forumURL, { credentials: 'same-origin' })
        .then(r => r.text())
        .then(html => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');
          const forumbg = Array.from(doc.querySelectorAll('.forumbg')).pop();
          if (!forumbg) return setTimeout(checkNewResponse, interval);
          const topics = Array.from(forumbg.querySelectorAll('.topics li.row'));
          const topic = topics.find(t => {
            const a = t.querySelector('a');
            if (!a) return false;
            const href = a.getAttribute('href') || '';
            if (!href.includes('?')) return false;
            const id = new URLSearchParams(href.substr(href.indexOf('?'))).get('t');
            return id === topicId;
          });
          if (!topic) {
            if (notificationElement) { notificationElement.remove(); notificationElement = null; }
            if (titleFlashInterval) { clearInterval(titleFlashInterval); titleFlashInterval = null; document.title = title; }
            return setTimeout(checkNewResponse, interval);
          }
          const newCountText = topic.textContent.match(/(\d+) תגובות?/);
          const newCount = newCountText ? parseInt(newCountText[1], 10) : currentCount;
          if (currentCount < newCount) {
            if (!notificationElement || !document.getElementById('ivelt-new-response-notification')) {
              const existing = document.getElementById('ivelt-new-response-notification');
              if (existing) existing.remove();
              if (lastPost) {
                const banner = document.createElement('h3');
                banner.id = 'ivelt-new-response-notification';
                banner.style = 'margin:4px auto;text-align:center;background:#cadceb;padding:7px 5px 5px;border:none;border-radius:7px;user-select:none;';
                banner.innerHTML = `נייע תגובות זענען צוגעקומען <a class="button" style="width:150px;margin:5px auto;display:block;" href="/forum/viewtopic.php?t=${topicId}&view=unread#unread">רילאוד</a>`;
                lastPost.insertAdjacentElement('afterend', banner);
                notificationElement = banner;
                if (!titleFlashInterval) {
                  titleFlashInterval = setInterval(() => { document.title = document.title === title ? '\u26B9 ' + title : title; }, 500);
                }
              }
              currentCount = newCount;
            }
          }
          setTimeout(checkNewResponse, interval);
        })
        .catch(() => { interval = Math.min(interval * 3, 300000); setTimeout(checkNewResponse, interval); });
    }
    setTimeout(checkNewResponse, interval);
  }

  // -- Inbox/PM notification check while on Ivelt pages ----------------------
  function notifyUser(titleText, body, link) {
    if (!settings.getBrowserNotifications) return;
    try {
      if (typeof GM_notification === 'function') {
        GM_notification({ title: titleText, text: body, onclick: function () { if (link) window.open(link, '_self'); } });
        return;
      }
    } catch (e) {}
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        const n = new Notification(titleText, { body: body, icon: 'https://www.ivelt.com/fav/apple-icon-60x60.png' });
        if (link) n.onclick = function () { window.open(link, '_self'); };
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => { if (p === 'granted') notifyUser(titleText, body, link); });
      }
    }
  }

  function inboxNotificationCheck() {
    if (!settings.backgroundSync || !settings.backgroundSyncNotif || settings.backgroundSyncNotif == 0) return;
    const notifMinutes = parseInt(settings.backgroundSyncNotif, 10) || 1;
    const notifInterval = Math.max(notifMinutes, 1) * 60000;
    let lastNotifCount = 0;
    const notifUrl = 'https://www.ivelt.com/forum/ucp.php?i=ucp_notifications';
    function checkNotifications() {
      fetch(notifUrl, { credentials: 'same-origin' })
        .then(r => r.text())
        .then(html => {
          const m = html.match(/id="notification_list_button"[^>]*>(\d+)/);
          const count = m ? parseInt(m[1], 10) : 0;
          if (count > 0 && count !== lastNotifCount) {
            lastNotifCount = count;
            notifyUser('אייוועלט', `${count} נייע מעלדונגען`, notifUrl);
          }
        })
        .catch(() => {});
    }
    setInterval(checkNotifications, notifInterval);
    checkNotifications();
  }

  // -- Sefaria linker ---------------------------------------------------------
  function sefariaLinker() {
    if (!settings.sefariaLinker) return;
    const script = document.createElement('script');
    script.src = 'https://www.sefaria.org/linker.js';
    script.charset = 'utf-8';
    script.onload = function () {
      try {
        if (typeof sefaria !== 'undefined' && sefaria.link) {
          sefaria.link({ contentLang: 'hebrew', interfaceLang: 'english' });
        } else if (getGlobal('sefaria')) {
          getGlobal('sefaria').link({ contentLang: 'hebrew', interfaceLang: 'english' });
        }
      } catch (e) {}
    };
    document.body.appendChild(script);
  }

  // -- Hide username ----------------------------------------------------------
  function hideUserName() {
    if (!settings.hideUserName) return;
    const userName = document.querySelector('.header-avatar .username');
    if (userName) userName.textContent = 'הא?';
    const avatar = document.querySelector('.header-avatar .avatar');
    if (avatar) avatar.style.display = 'none';
  }

  // -- Warn on losing post ----------------------------------------------------
  function warnOnLosingPost() {
    if (!settings.warnOnLosingPost) return;
    const form = document.getElementById('qr_postform') || document.getElementById('postform');
    if (!form) return;
    function avoidLosingPost(e) {
      const textarea = document.querySelector('textarea[name=message]') || document.querySelector('#message');
      if (textarea && textarea.value.trim()) {
        e.preventDefault();
        return (e.returnValue = 'Changes you made may not be saved. Are you sure you want to lose your post?');
      }
    }
    form.addEventListener('submit', () => window.removeEventListener('beforeunload', avoidLosingPost));
    window.addEventListener('beforeunload', avoidLosingPost);

    document.querySelectorAll('#mark_all_notifications a, .pagination a[href*="mark="].mark').forEach(link => {
      link.addEventListener('click', function (event) {
        const confirmation = confirm('איר זענט זיכער אז איר ווילט פארצייכענען אלעס ווי געליינט?');
        if (!confirmation) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
    });
  }

  // -- Run all page features ---------------------------------------------------
  async function runFeatures() {
    refreshSettingsDiv();
    await addTopicButtons();
    addGoogleSearch();
    embedMedia();
    pageEnhancements();
    addPrintBtn();
    splitNotifications();
    sefariaLinker();
    hideUserName();
    warnOnLosingPost();
    newResponseNotification();
    inboxNotificationCheck();
  }

  let mutating = false;
  const observer = new MutationObserver(() => {
    if (mutating) return;
    mutating = true;
    refreshSettingsDiv();
    addTopicButtons();
    addGoogleSearch();
    embedMedia();
    pageEnhancements();
    addPrintBtn();
    splitNotifications();
    mutating = false;
  });


  // -- v2 feature styles -------------------------------------------------------
  (function injectV2Styles() {
    const style = document.createElement('style');
    style.id = 'ivelt-helper-v2-styles';
    style.textContent = `/* Google search above the forum's search box (js/addGoogleSearch.js): the input stretches
   so the row is as wide as the forum's box, which has two buttons to our one. With the id,
   as the forum's own styles load after this file */
#search-box .ih-google-search {
    margin-bottom: 5px;
}
#search-box .ih-google-search fieldset {
    display: flex;
}
#search-box .ih-google-search .inputbox {
    flex: 1;
}

/* "private message with a quote" post button (js/addTopicButtons.js): only where the forum's phone
   layout hides the profile's contact menu, which has the same link */
@media (min-width: 701px) {
    .post-buttons li.ih-pm-quote {
        display: none;
    }
}

/* The extra post buttons (and the marked quote button) have an inline beige background in
   js/addTopicButtons.js, which marks them on the bar. In the ⋯ menu (on a phone, or zoomed in)
   they're plain rows like the forum's own, on the menu's color (phpBB's copies there have no
   .button class, so the theme's rule for them in css/themes.css doesn't reach them either) */
.post-buttons .dropdown-contents a[style*="background"] {
    background: transparent !important;
}

.clone-first .app-hidden {
    display: none;
}
.clone-first.app-hidden {
    display: none;
}

.post-buttons .app-hidden {
    display: none;
}


.sticky-post{
    position: fixed !important;
    z-index: 1 !important;
    top: 5px !important;
    background-color: rgb(202 220 235 / 45%);
    border: 1px solid #C7C3BF;
    padding: 4px 4px 4px 7px;
    border-radius: 4px;
    backdrop-filter: blur(2px);
}
.ext-copied-tip {
    position: absolute;
    z-index: 9999;
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    font-size: 11px;
    line-height: 1;
    padding: 5px 8px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 1;
    transition: opacity 0.4s ease;
}

.ext-copied-tip.ext-copied-tip-hide {
    opacity: 0;
}

/* mentions that link to the profile (js/mentionLinks.js): they keep the mention's own color,
   and on hover the mention is underlined in that color */
.ih-mention-link,
.ih-mention-link:hover {
    text-decoration: none;
}
.ih-mention-link:hover .mention {
    text-decoration: underline;
}

/* "new replies" bar under the last post (js/newResponseNotification.js) */
#ivelt-new-response-notification {
    margin: 4px auto;
    text-align: center;
    background: #cadceb;
    padding: 7px 5px 5px 5px;
    border: none;
    border-radius: 7px;
    user-select: none;
}
#ivelt-new-response-notification .button {
    width: 150px;
    margin: 5px auto;
    display: block;
}

/* small notices like "copied" (iveltNotify in js/addTopicButtons.js) */
#ivelt-notify {
    position: fixed;
    top: 30%;
    left: 50%;
    z-index: 9999;
    background: #eee;
    text-align: center;
    padding: 5px 25px 7px 25px;
    transform: translateX(-50%);
    border: 2px solid #999;
    border-top: none;
    border-radius: 0 0 4px 4px;
    transition: opacity 0.75s linear;
    font-size: 1rem;
}

/* The post's own ציטיר button while words in the post are selected (js/quoteSelection.js):
   another icon, "ציטיר אנגעצייכנט", and the theme's link color, so it's clear it quotes only the
   selection. !important because the forum's and the themes' button styles are specific */

.post-buttons .ih-quote-marked {
    border-color: var(--t-link, #105289) !important;
    background: color-mix(in srgb, var(--t-link, #105289) 14%, var(--t-surface, #fff)) !important;
    color: var(--t-link, #105289) !important;
    box-shadow: 0 0 0 1px var(--t-link, #105289);
}
.post-buttons .ih-quote-marked .icon {
    color: var(--t-link, #105289) !important;
}

@media screen {
    /* On a phone phpBB moves the post buttons into the ⋯ menu (.hidden on the bar), but the forum
       hides the like button there, so a phone had no like button at all: it stays on the bar */
    .post-buttons > .postlove-li.hidden {
        display: inline-block;
    }
    /* one class more than the forum's own .post-buttons rules, which load after this file */
    .post-buttons .postlove-li.ih-likes-joined {
        position: relative;
        display: flex;
    }
    /* and its copy in the ⋯ menu stays hidden, as the forum has it (there it lost its button look) */
    .post-buttons .dropdown-contents .postlove-li.ih-likes-joined {
        display: none;
    }
    .ih-likes-joined .postlove-button {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
    }
    .post-buttons .button.ih-likes-arrow {
        margin-right: -1px;
        padding-left: 4px;
        padding-right: 4px;
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
    }
}
@media print {
    .ih-likes-arrow,
    .ih-likes {
        display: none !important;
    }
}
.ih-likes {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 10;
    width: 260px;
    margin-top: 4px;
    padding: 8px 10px;
    border: 1px solid var(--t-border, #B9C2C9);
    border-radius: 6px;
    background: var(--t-surface, #fff);
    color: var(--t-text, #333);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
    direction: rtl;
    text-align: right;
    font-size: 12px;
    line-height: 1.4;
    white-space: normal;
}
.ih-likes-heading {
    margin-bottom: 6px;
    font-weight: bold;
}
.ih-likes-names {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
}
.ih-likes-names a {
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--t-row2, #ECF3F7);
    color: var(--t-link, #105289);
}

.ih-double-click-like {
    position: fixed;
    z-index: 10000;
    font-size: 48px;
    line-height: 1;
    pointer-events: none;
    animation: ih-double-click-like 0.8s ease-out forwards;
}

/* taking a like back: the thumb shows grey and shrinks away */
.ih-double-click-unlike {
    filter: grayscale(1);
    animation-name: ih-double-click-unlike;
}

@keyframes ih-double-click-unlike {
    0% {
        opacity: 0.9;
        transform: translate(-50%, -50%) scale(1);
    }
    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.4);
    }
}

@keyframes ih-double-click-like {
    0% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.4);
    }
    25% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1.15);
    }
    60% {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
    }
    100% {
        opacity: 0;
        transform: translate(-50%, -110%) scale(1);
    }
}

/* Undo / redo buttons in the post editor toolbar (editorUndo.js) */
.ivu-buttons {
    display: inline-flex;
    vertical-align: middle;
    margin-inline-end: 6px;
}
.ivu-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.ivu-button svg { display: block; }
/* Right-to-left, so undo points back to the right like in Hebrew/Yiddish apps */
.ivu-button:dir(rtl) svg { transform: scaleX(-1); }
/* Same grey as the forum's own ABBC3 icons */
.ivu-in-abbc3 .ivu-button { color: #626262; }
.ivu-button:disabled { opacity: 0.35; cursor: default; }

/* Image Resizer - everything is scoped under the ivr- prefix so it can't leak into the forum's own styles */

/* Status line under the post editor */
.ivr-status {
    display: none;
    box-sizing: border-box;
    margin: 6px 0;
    padding: 6px 10px;
    border-radius: 4px;
    background: #ECEFF1;
    color: #37474F;
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
}

.ivr-status.ivr-show { display: block; }
.ivr-status.ivr-ok { background: #E8F5E9; color: #1B5E20; }
.ivr-status.ivr-error { background: #FFEBEE; color: #B71C1C; }
.ivr-status.ivr-warn { background: #FFF8E1; color: #7A4F01; }

/* "Folder -> ZIP" next to the forum's own "add file" button */
input.ivr-zip { margin-inline-start: 6px; }

/* Next to it: tells the user that big images are fine to add */
.ivr-hint {
    margin-inline-start: 4px;
    color: #2E7D32;
    font-weight: bold;
}

.ivr-hint[hidden] { display: none; }

.ih-profile-card {
    position: absolute;
    z-index: 1000;
    width: 320px;
    padding: 12px;
    border: 1px solid var(--t-border, #B9C2C9);
    border-radius: 10px;
    background: var(--t-surface, #fff);
    color: var(--t-text, #333);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    direction: rtl;
    text-align: right;
    font-size: 12px;
    line-height: 1.45;
    animation: ih-profile-in 0.15s ease-out;
}
.ih-profile-card::before {
    content: '';
    position: absolute;
    top: -6px;
    left: var(--ih-pointer-x, 50%);
    width: 10px;
    height: 10px;
    margin-left: -5px;
    border-top: 1px solid var(--t-border, #B9C2C9);
    border-left: 1px solid var(--t-border, #B9C2C9);
    background: inherit;
    transform: rotate(45deg);
}
.ih-profile-card.ih-profile-above::before {
    top: auto;
    bottom: -6px;
    border: 0;
    border-right: 1px solid var(--t-border, #B9C2C9);
    border-bottom: 1px solid var(--t-border, #B9C2C9);
}
@keyframes ih-profile-in {
    from { opacity: 0; }
}
.ih-profile-card a {
    color: var(--t-link, #105289);
}
.ih-profile-header {
    display: flex;
    align-items: center;
    gap: 10px;
}
.ih-profile-avatar {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    border-radius: 8px;
    object-fit: cover;
}
.ih-profile-title {
    min-width: 0;
}
.ih-profile-name {
    font-size: 15px;
    font-weight: bold;
    color: var(--t-link, #105289);
}
.ih-profile-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}
.ih-profile-tag {
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--t-row2, #ECF3F7);
    color: var(--t-muted, #666);
    font-size: 11px;
}
.ih-profile-online {
    background: var(--t-success, #2E7D32);
    color: #fff;
}
.ih-profile-section {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--t-border, #DCE3E8);
}
/* placeholders in the card's shape while the profile loads, with a light passing shine */
.ih-profile-skeleton {
    --ih-skeleton: color-mix(in srgb, var(--t-text, #333) 14%, var(--t-surface, #fff));
    --ih-skeleton-shine: color-mix(in srgb, var(--t-text, #333) 6%, var(--t-surface, #fff));
    border-radius: 4px;
    background: linear-gradient(90deg, var(--ih-skeleton) 30%, var(--ih-skeleton-shine) 50%, var(--ih-skeleton) 70%) 0 0 / 300% 100%;
    animation: ih-profile-shine 1.4s ease-in-out infinite;
}
@keyframes ih-profile-shine {
    from { background-position: 100% 0; }
    to { background-position: 0 0; }
}
@media (prefers-reduced-motion: reduce) {
    .ih-profile-skeleton {
        animation: none;
    }
}
.ih-profile-skeleton.ih-profile-avatar {
    border-radius: 8px;
}
.ih-profile-skeleton-tag {
    display: inline-block;
    width: 56px;
    height: 17px;
    border-radius: 10px;
}
.ih-profile-skeleton-heading {
    width: 70px;
    height: 9px;
    margin: 2px 0 8px;
}
.ih-profile-rows dt.ih-profile-skeleton {
    width: 64px;
}
.ih-profile-rows .ih-profile-skeleton {
    height: 10px;
    margin: 3px 0 4px;
}
.ih-profile-rows dd.ih-profile-skeleton:nth-of-type(1) { width: 55%; }
.ih-profile-rows dd.ih-profile-skeleton:nth-of-type(2) { width: 80%; }
.ih-profile-rows dd.ih-profile-skeleton:nth-of-type(3) { width: 40%; }
.ih-profile-heading {
    margin-bottom: 4px;
    color: var(--t-link, #105289);
    font-size: 11px;
    font-weight: bold;
}
.ih-profile-rows {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 10px;
    margin: 0;
}
.ih-profile-rows dt {
    color: var(--t-muted, #666);
    font-weight: normal;
}
.ih-profile-rows dd {
    margin: 0;
    overflow-wrap: anywhere;
}
/* a long signature scrolls inside the card: the scrollbar shows, and the bottom fades while there's more below */
.ih-profile-signature {
    max-height: 80px;
    overflow-y: auto;
    overflow-wrap: anywhere;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--t-text, #333) 35%, transparent) transparent;
}
.ih-profile-signature-more {
    -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent);
    mask-image: linear-gradient(to bottom, #000 55%, transparent);
}
.ih-profile-signature img {
    max-width: 100%;
    max-height: 60px;
}

/* the "unsent reply" bar over the reply box (js/drafts.js) */

.ih-draft-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
    padding: 8px 10px;
    border: 1px solid var(--t-border, #B9C2C9);
    border-right: 3px solid var(--t-link, #105289);
    background: var(--t-surface, #fff);
    color: var(--t-text, #333);
    animation: ih-draft-in 0.2s ease-out;
}
@keyframes ih-draft-in {
    from { opacity: 0; transform: translateY(-4px); }
}
.ih-draft-icon {
    color: var(--t-link, #105289);
    font-size: 16px;
}
.ih-draft-text {
    flex: 1;
    min-width: 0;
}
.ih-draft-words {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    color: var(--t-muted, #666);
    font-size: 0.9em;
    white-space: pre-line;
}

@property --ih-dust {
    syntax: '<number>';
    inherits: true;
    initial-value: 0;
}

.ih-spoiler {
    --ih-dust: 0;
    margin: 0.5em 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: none !important;
    transition: --ih-dust 0.5s ease, max-height 0.4s ease;
}
.ih-spoiler-hidden {
    --ih-dust: 1;
    cursor: pointer;
}
.ih-spoiler-hidden:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}
.ih-spoiler .spoiltitle {
    display: none !important;
}
.ih-spoiler .spoilcontent {
    display: block !important;
    padding: 0 !important;
    border: 0 !important;
}
.ih-spoiler-hidden .spoilcontent {
    user-select: none;
    pointer-events: none;
}

.ih-spoiler-inline,
.ih-spoiler-inline .spoilcontent {
    display: inline !important;
    margin: 0 !important;
}
.ih-spoiler-long {
    display: block !important;
    margin: 0.5em 0 !important;
}
.ih-spoiler-long.ih-spoiler-hidden {
    max-height: 3lh;
    overflow: hidden;
}

.ih-spoiler-words {
    border-radius: 4px;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    -webkit-text-fill-color: color-mix(in srgb, currentColor calc((1 - var(--ih-dust)) * 100%), transparent);
    --ih-dot: color-mix(in srgb, currentColor calc(var(--ih-dust) * 100%), transparent);
    background-image:
        radial-gradient(circle, var(--ih-dot) 0.7px, transparent 1.3px),
        radial-gradient(circle, var(--ih-dot) 0.5px, transparent 1px),
        radial-gradient(circle, var(--ih-dot) 1px, transparent 1.5px);
    background-size: 6px 7px, 9px 5px, 13px 11px;
    animation: ih-spoiler-drift 3s linear infinite paused;
}
.ih-spoiler-hidden .ih-spoiler-words {
    animation-play-state: running;
}
.ih-spoiler-hidden .spoilcontent a {
    border-bottom-color: transparent !important;
    text-decoration-color: transparent;
}

.ih-spoiler-picture {
    position: relative;
    display: inline-block;
    overflow: hidden;
    vertical-align: middle;
    border-radius: 6px;
}
.ih-spoiler-picture img {
    filter: blur(calc(var(--ih-dust) * 18px)) brightness(calc(1 - var(--ih-dust) * 0.15));
    transform: scale(calc(1 + var(--ih-dust) * 0.1));
}
.ih-spoiler-picture::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: var(--ih-dust);
    background-image:
        radial-gradient(circle, #fff 0.8px, transparent 1.4px),
        radial-gradient(circle, rgba(255, 255, 255, 0.8) 0.6px, transparent 1.1px),
        radial-gradient(circle, rgba(255, 255, 255, 0.9) 1.1px, transparent 1.7px);
    background-size: 7px 8px, 11px 6px, 5px 9px;
    animation: ih-spoiler-drift 2.4s linear infinite paused;
}
.ih-spoiler-hidden .ih-spoiler-picture::after {
    animation-play-state: running;
}
@media screen {
    .ih-spoiler-hidden .spoilcontent dl:has(.ih-spoiler-picture) dd {
        display: none;
    }
}

.ih-spoiler .spoilcontent :is(iframe, video, audio) {
    filter: blur(calc(var(--ih-dust) * 16px));
}

@keyframes ih-spoiler-drift {
    to { background-position: 6px -7px, -9px 5px, 13px 11px; }
}

@media (prefers-reduced-motion: reduce) {
    .ih-spoiler-words,
    .ih-spoiler-picture::after {
        animation: none;
    }
}

@media print {
    .ih-spoiler-hidden {
        --ih-dust: 0;
    }
    .ih-spoiler-long.ih-spoiler-hidden {
        max-height: none;
    }
}

`;
    document.head.appendChild(style);
  })();

  // ====== v2 module: mentionLinks.js ======
// Mentions link to the profile
//
// A mention in a post (@name, from the forum's mention add-on) is only blue text. Here it
// becomes a link to that user's profile. The forum's profile page can find a user by name
// (memberlist.php?mode=viewprofile&un=<name>), so the user's number isn't needed.
//
// Runs as a content script (isolated world).

(function () {
    'use strict';

    const PROFILE_BY_NAME = '/forum/memberlist.php?mode=viewprofile&un=';

    function init() {
        document.querySelectorAll('em.mention').forEach(linkMention);
    }

    function linkMention(mention) {
        if (mention.closest('a')) return;

        const name = mention.textContent.trim().replace(/^@/, '');
        if (!name) return;

        const link = document.createElement('a');
        link.className = 'ih-mention-link';
        link.href = PROFILE_BY_NAME + encodeURIComponent(name);
        mention.replaceWith(link);
        link.appendChild(mention);
    }

    init();
})();


  // ====== v2 module: titleOpensUnread.js ======
// Topic titles open the first unread post
//
// In a list of topics (a forum, active topics, search results...), clicking the title
// of a topic that has unread posts opens it at the first unread post - the same place
// the forum's own small "new post" icon in front of the title leads to - instead of at
// the first page. Topics with nothing unread open as usual.
//
// Runs as a content script (isolated world) and is controlled by the
// "titleOpensUnread" setting (on by default); turning it on or off applies from the
// next page load.

(function () {
    'use strict';

    const SETTING_KEY = 'titleOpensUnread';

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] === false) return;

            document.querySelectorAll('.topiclist.topics a.topictitle').forEach((title) => {
                const unreadLink = title.closest('.row').querySelector('a.unread');
                if (unreadLink) title.href = unreadLink.href;
            });
        });
    }

    init();
})();


  // ====== v2 module: doubleClickLike.js ======
(function () {
    'use strict';

    const SETTING_KEY = 'doubleClickLike';
    const IGNORED = 'a, button, input, textarea, select, .post-buttons, .spoilwrapper';

    let hadSelection = false;
    // set at the double-click's second press, when it's on a post's empty space
    let likeAt = null;

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] !== true) return;

            // in the capture phase, before the browser selects anything
            document.addEventListener('mousedown', onMouseDown, true);
            document.addEventListener('dblclick', onDoubleClick);
        });
    }

    // Decided at the presses, before the double-click changes the selection:
    // - at the first, whether words were already selected (then the double-click is about them)
    // - at the second, whether it's on the post's empty space, where the mouse is the arrow and not
    //   the text cursor. Then the browser is kept from selecting a word (it does that even after
    //   the end of a line), so nothing gets selected, and the post is liked on the double-click
    function onMouseDown(event) {
        if (event.detail === 1) {
            hadSelection = !!window.getSelection().toString().trim();
            likeAt = null;
            return;
        }
        if (event.detail !== 2 || event.button !== 0 || hadSelection) return;

        const post = event.target.closest('.post');
        if (!post || event.target.closest(IGNORED)) return;
        if (isOverText(event.target, event.clientX, event.clientY)) return;

        event.preventDefault();
        likeAt = post;
    }

    function onDoubleClick(event) {
        const post = likeAt;
        likeAt = null;
        if (!post || event.target.closest('.post') !== post) return;

        // a post that can't be liked (your own, or when logged out) has a plain <span> with no
        // data-ajax, so there's nothing to click and no thumb to show
        const likeButton = post.querySelector('.postlove-button[data-ajax]');
        if (!likeButton) return;

        // the forum's like button toggles, so a double-click on a liked post takes the like back
        const unliking = !!likeButton.querySelector('.liked');
        likeButton.click();
        showThumb(event.clientX, event.clientY, unliking);
    }

    // Whether the point is on the text in the element under the mouse: inside the boxes its words
    // take up on each line (the spaces between words included, the empty space after a line not),
    // which is where the browser shows the text cursor
    function isOverText(element, x, y) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const range = document.createRange();
        while (walker.nextNode()) {
            const text = walker.currentNode;
            if (!text.data.trim()) continue;
            range.selectNodeContents(text);
            for (const rect of range.getClientRects()) {
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
            }
        }
        return false;
    }

    function showThumb(x, y, unliking) {
        const thumb = document.createElement('span');
        thumb.className = 'ih-double-click-like' + (unliking ? ' ih-double-click-unlike' : '');
        thumb.textContent = '👍';
        thumb.style.left = x + 'px';
        thumb.style.top = y + 'px';
        thumb.addEventListener('animationend', () => thumb.remove());
        document.body.appendChild(thumb);
    }

    init();
})();


  // ====== v2 module: whoLiked.js ======
(function () {
    'use strict';

    const SETTING_KEY = 'whoLiked';
    const PROFILE_BY_NAME = '/forum/memberlist.php?mode=viewprofile&un=';
    const SCREEN_MARGIN = 6;

    let openList = null;

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] === false) return;

            document.querySelectorAll('.post-buttons .postlove-li').forEach(addArrow);

            // Capturing, since phpBB's dropdown buttons (like the ⋯ menu on a phone) stop their
            // clicks from reaching the page, and the list would stay open over the dropdown
            document.addEventListener('click', (event) => {
                const arrow = event.target.closest('.ih-likes-arrow');
                if (arrow) toggleList(arrow.closest('.postlove-li'));
                else if (openList && !openList.contains(event.target)) closeList();
            }, true);
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') closeList();
            });
        });
    }

    function addArrow(likeItem) {
        const count = likeItem.querySelector('.postlove-count');
        const likeButton = likeItem.querySelector('.postlove-button');
        if (!count || !likeButton || !readLikes(count).names.length) return;

        const arrow = document.createElement('button');
        arrow.type = 'button';
        arrow.className = 'button button-icon-only ih-likes-arrow';
        arrow.title = 'ווער האט באדאנקט';
        arrow.setAttribute('aria-expanded', 'false');
        arrow.innerHTML = '<i class="icon fa-caret-down" aria-hidden="true"></i>';
        likeButton.after(arrow);
        likeItem.classList.add('ih-likes-joined');
    }

    function readLikes(count) {
        const title = count.getAttribute('title') || '';
        const colon = title.indexOf(':');
        if (colon < 0) return { heading: '', names: [] };
        return {
            heading: title.slice(0, colon).trim(),
            names: title.slice(colon + 1).split(', ').map((name) => name.trim()).filter(Boolean)
        };
    }

    function toggleList(likeItem) {
        const wasOpen = openList && openList.parentElement === likeItem;
        closeList();
        if (wasOpen) return;

        const likes = readLikes(likeItem.querySelector('.postlove-count'));
        const names = withMyLike(likes.names, likeItem);

        const list = document.createElement('div');
        list.className = 'ih-likes';
        const heading = document.createElement('div');
        heading.className = 'ih-likes-heading';
        heading.textContent = `${likes.heading} (${names.length})`;
        const links = document.createElement('div');
        links.className = 'ih-likes-names';
        names.forEach((name) => {
            const link = document.createElement('a');
            link.href = PROFILE_BY_NAME + encodeURIComponent(name);
            link.textContent = name;
            links.appendChild(link);
        });
        list.append(heading, links);

        likeItem.appendChild(list);
        keepOnScreen(list);
        likeItem.querySelector('.ih-likes-arrow').setAttribute('aria-expanded', 'true');
        openList = list;
    }

    // On a phone the list, which starts at the like button, can stick out of the screen: it's moved
    // back in, and is never wider than the screen
    function keepOnScreen(list) {
        const viewWidth = document.documentElement.clientWidth;
        list.style.maxWidth = `${viewWidth - 2 * SCREEN_MARGIN}px`;
        const rect = list.getBoundingClientRect();
        const shift = Math.min(0, viewWidth - SCREEN_MARGIN - rect.right) || Math.max(0, SCREEN_MARGIN - rect.left);
        if (shift) list.style.left = `${shift}px`;
    }

    function withMyLike(names, likeItem) {
        const me = document.querySelector('.header-avatar .username, .header-avatar .username-coloured');
        const icon = likeItem.querySelector('.like, .liked');
        if (!me || !icon) return names;

        const myName = (me.dataset.name || me.textContent).trim();
        const liked = icon.classList.contains('liked');
        if (liked && !names.includes(myName)) return [...names, myName];
        if (!liked) return names.filter((name) => name !== myName);
        return names;
    }

    function closeList() {
        if (!openList) return;
        openList.parentElement.querySelector('.ih-likes-arrow').setAttribute('aria-expanded', 'false');
        openList.remove();
        openList = null;
    }

    init();
})();


  // ====== v2 module: quoteSelection.js ======
// Quote a selection, with the post's own ציטיר button
//
// While words in a post are selected, that post's ציטיר button changes (its icon, its text and
// its color) to "ציטיר אנגעצייכנט", and a click on it quotes just those words where the cursor
// is in the reply box, instead of the whole post. With nothing selected it's the forum's own
// button again. Nothing pops up over the text, so it doesn't get in the way of double-clicking
// or copying. Only where there's a reply box on the page, and not for words inside a quote.
//
// Runs as a content script (isolated world), controlled by the "quoteSelection" setting.

(function () {
    'use strict';

    const SETTING_KEY = 'quoteSelection';
    const JUMP_KEY = 'quoteJumpToReply'; // after quoting, go down to the reply box (on by default)
    const DONE_MS = 1200;
    const MARKED_ICON = 'fa-i-cursor';
    const MARKED_TEXT = 'ציטיר אנגעצייכנט';

    // The post's quote button while it's marked: { link, icon, label, iconClass, labelText, title }
    let marked = null;
    // What the marked button would quote: { content, text }
    let pending = null;
    let doneUntil = 0;
    // Where the user left the cursor in the reply box, once they clicked or typed in it: a quote goes
    // there. Kept as they go, since selecting text in the page can reset the box's own cursor
    let caret = null;
    let jumpToReply = false;

    function init() {
        if (!getTextarea() || !chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY, JUMP_KEY], (items) => {
            jumpToReply = items[JUMP_KEY] !== false;
            if (items[SETTING_KEY] !== false) start();
        });
    }

    function start() {
        const textarea = getTextarea();

        ['mouseup', 'keyup', 'input'].forEach((type) => {
            textarea.addEventListener(type, (event) => {
                if (event.isTrusted) caret = textarea.selectionEnd;
            });
        });

        let updateTimeout;
        document.addEventListener('selectionchange', () => {
            clearTimeout(updateTimeout);
            updateTimeout = setTimeout(update, 60);
        });

        // in the capture phase, before the forum's own handlers on the button
        document.addEventListener('mousedown', (event) => {
            // pressing the marked button mustn't clear the selection it's about to quote
            if (marked && marked.link.contains(event.target)) event.preventDefault();
        }, true);
        document.addEventListener('click', (event) => {
            if (!marked || !pending || !marked.link.contains(event.target)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const end = addQuote(pending.content, pending.text);
            showDone();
            window.getSelection().removeAllRanges();
            if (jumpToReply) goToReply(end);
        }, true);
    }

    function getTextarea() {
        return document.querySelector('#message-box textarea');
    }

    // Marks the quote button of the post the selection is in, or puts it back when there's none
    function update() {
        if (Date.now() < doneUntil) return;

        const selection = window.getSelection();
        const text = selection.toString().trim();
        const content = text && selection.rangeCount && getQuotableContent(selection);
        const link = content && findQuoteLink(content);
        if (!link) {
            unmark();
            return;
        }

        if (marked && marked.link !== link) unmark();
        if (!marked) mark(link);
        pending = { content, text };
    }

    // The forum's own ציטיר button of the post (not the extension's "ציטיר לעצטע", which has "last")
    function findQuoteLink(content) {
        const post = content.closest('.post');
        if (!post) return null;
        return [...post.querySelectorAll('.post-buttons a[href*="mode=quote"]')]
            .find((link) => !link.querySelector('.last')) || null;
    }

    function mark(link) {
        const icon = link.querySelector('i.icon');
        const label = link.querySelector('span');
        marked = {
            link, icon, label,
            iconClass: icon ? icon.className : '',
            labelText: label ? label.textContent : '',
            title: link.getAttribute('title')
        };
        if (icon) icon.className = `icon ${MARKED_ICON} fa-fw`;
        if (label) label.textContent = MARKED_TEXT;
        link.setAttribute('title', MARKED_TEXT);
        link.classList.add('ih-quote-marked');
    }

    function unmark() {
        pending = null;
        if (!marked) return;
        const { link, icon, label, iconClass, labelText, title } = marked;
        if (icon) icon.className = iconClass;
        if (label) label.textContent = labelText;
        if (title === null) link.removeAttribute('title');
        else link.setAttribute('title', title);
        link.classList.remove('ih-quote-marked');
        marked = null;
    }

    // "צוגעלייגט ✓" on the button for a moment, then it's the forum's own button again
    function showDone() {
        if (!marked) return;
        doneUntil = Date.now() + DONE_MS;
        if (marked.icon) marked.icon.className = 'icon fa-check fa-fw';
        if (marked.label) marked.label.textContent = 'צוגעלייגט';
        marked.link.setAttribute('title', 'צוגעלייגט');
        setTimeout(() => {
            doneUntil = 0;
            unmark();
            update();
        }, DONE_MS);
    }

    function getQuotableContent(selection) {
        const start = selection.getRangeAt(0).startContainer;
        const element = start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement;
        if (element.closest('blockquote') || element.closest('#preview')) return null;
        return element.closest('.postbody .content');
    }

    function getPostId(content) {
        for (let node = content; node; node = node.parentElement) {
            const match = node.id.match(/\d+$/);
            if (match) return match[0];
        }
        return '';
    }

    function addQuote(content, text) {
        const post = content.closest('.post') || content;
        const postId = getPostId(content);
        const usernameElm = post.querySelector('.username, .username-coloured');
        const username = usernameElm ? usernameElm.textContent.trim() : '';
        const userId = usernameElm && usernameElm.href ? new URL(usernameElm.href).searchParams.get('u') || '' : '';
        const timeElm = post.querySelector('time');
        const time = timeElm ? Date.parse(timeElm.dateTime) / 1000 : '';

        // The topic review under the reply box shows the date as plain text, without a <time>:
        // what isn't known is left out rather than written empty
        const attributes = [`user_id=${userId}`, `time=${time}`, `post_id=${postId}`].filter((a) => !a.endsWith('='));
        const quote = `[quote="${username}" ${attributes.join(' ')}]\n${text}\n[/quote]`;

        const textarea = getTextarea();
        let at, insert;
        if (caret !== null) {
            // On a line of its own, where the cursor was in the text
            at = Math.min(caret, textarea.value.length);
            const before = textarea.value.slice(0, at);
            const after = textarea.value.slice(at);
            insert = (before && !before.endsWith('\n') ? '\n' : '') + quote + (after && !after.startsWith('\n') ? '\n' : '');
        } else {
            at = endOfQuotesOnTop(textarea.value);
            insert = at > 0 ? '\n' + quote : quote + '\n';
        }
        textarea.setRangeText(insert, at, at, 'end');
        if (caret !== null) caret = at + insert.length;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return at + insert.length;
    }

    // Down to the reply box, ready to type right after the quote that was just added
    // (the "quoteJumpToReply" setting)
    function goToReply(end) {
        const textarea = getTextarea();
        const at = textarea.value[end] === '\n' ? end + 1 : end;
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(at, at);
        caret = at;
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function endOfQuotesOnTop(text) {
        const tag = /\[(\/?)quote\b[^\]]*\]/gi;
        let end = 0;
        let depth = 0;
        let match;

        while ((match = tag.exec(text))) {
            const closing = match[1] === '/';
            if (depth === 0 && (closing || text.slice(end, match.index).trim()))
                break;

            depth += closing ? -1 : 1;
            if (depth === 0)
                end = tag.lastIndex;
        }

        return end;
    }

    init();
})();


  // ====== v2 module: drafts.js ======
(function () {
    'use strict';

    const SETTING_KEY = 'keepDrafts';
    const PREFIX = 'draft:';
    const KEEP_MS = 14 * 24 * 60 * 60 * 1000;
    const SAVE_DELAY_MS = 800;
    const KEY_PARAMS = ['i', 'mode', 'action', 'f', 't', 'p', 'u'];
    const ATTACHMENT_FIELD = /^attachment_data\[(\d+)\]\[(\w+)\]$/;
    const ATTACHMENT_TAG = /\[attachment=(\d+)\]([\s\S]*?)\[\/attachment\]/g;
    // the files that couldn't come back, shown again after the preview that restores the others
    const MISSING_KEY = 'ih-draft-missing';

    function init() {
        const textarea = document.querySelector('#message-box textarea');
        const form = textarea && textarea.closest('form');
        if (!form || !chrome.storage || !chrome.storage.local) return;

        const key = draftKey(form);
        chrome.storage.local.get([SETTING_KEY, key], (items) => {
            if (items[SETTING_KEY] === false) return;

            dropOldDrafts();
            showMissingAfterPreview(textarea);
            keepDraft(textarea, form, key, items[key]);
        });
    }

    function keepDraft(textarea, form, key, draft) {
        let offered = !!draft && draft.text.trim() !== textarea.value.trim();
        if (offered) offerDraft(textarea, form, key, draft, () => { offered = false; });

        let saveTimeout;
        let typed = false;
        const save = () => {
            clearTimeout(saveTimeout);
            if (offered && !typed) return;
            const text = textarea.value;
            const attachments = formAttachments(form);
            store(key, text.trim() ? { text, attachments, savedAt: Date.now() } : null);
        };
        const saveSoon = () => {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(save, SAVE_DELAY_MS);
        };

        textarea.addEventListener('input', () => {
            typed = true;
            saveSoon();
        });
        // a file added or removed changes the hidden attachment fields, not the text
        const fileList = document.getElementById('file-list');
        if (fileList) new MutationObserver(saveSoon).observe(fileList, { childList: true, subtree: true });
        window.addEventListener('pagehide', save);
        form.addEventListener('submit', (event) => {
            if (event.submitter && event.submitter.name !== 'post') {
                save();
                return;
            }
            clearTimeout(saveTimeout);
            window.removeEventListener('pagehide', save);
            store(key, null);
        });
    }

    function draftKey(form) {
        const address = new URL(form.getAttribute('action') || '', location.href);
        if (address.searchParams.has('t') || address.searchParams.has('p')) address.searchParams.delete('f');
        const parts = KEY_PARAMS
            .filter((name) => address.searchParams.has(name))
            .map((name) => name + '=' + address.searchParams.get(name));
        return PREFIX + address.pathname.split('/').pop() + '?' + parts.join('&');
    }

    function offerDraft(textarea, form, key, draft, answered) {
        const bar = document.createElement('div');
        bar.className = 'ih-draft-bar';
        bar.innerHTML = `
            <i class="icon fa-history fa-fw ih-draft-icon" aria-hidden="true"></i>
            <span class="ih-draft-text"><span class="ih-draft-when"></span><span class="ih-draft-words"></span></span>
            <button type="button" class="button ih-draft-restore">צוריקשטעלן</button>
            <button type="button" class="button button-secondary ih-draft-drop">אויסמעקן</button>`;
        bar.querySelector('.ih-draft-when').textContent = 'א נישט-געשיקטע תגובה פון ' + timeAgo(draft.savedAt);
        bar.querySelector('.ih-draft-words').textContent = firstWords(draft.text);

        const restoreButton = bar.querySelector('.ih-draft-restore');
        restoreButton.addEventListener('click', () => {
            answered();
            restoreButton.disabled = true;
            restoreDraft(textarea, form, draft).then(() => bar.remove());
        });
        bar.querySelector('.ih-draft-drop').addEventListener('click', () => {
            answered();
            store(key, null);
            bar.remove();
        });

        textarea.before(bar);
    }

    // The text comes back with its attachments: the files uploaded for it stay on the forum until
    // the post is sent, so their hidden fields are put back. A preview then lets phpBB list them and
    // keep its uploader in step. A file that's gone would make phpBB refuse the whole form, so each
    // one is checked first, and the ones that are gone are listed for the user to add again
    async function restoreDraft(textarea, form, draft) {
        const current = formAttachments(form);
        const saved = draft.attachments || [];
        const back = [];
        const missing = [];

        for (const file of saved) {
            if (current.some((c) => c.attach_id === file.attach_id)) continue;
            if (await fileExists(file.attach_id)) back.push(file);
            else missing.push(file.real_filename);
        }

        const all = current.concat(back);
        const text = draft.text.replace(ATTACHMENT_TAG, (tag, index, name) => {
            // older drafts kept no attachment list, so their tags are matched by the file name
            const file = saved[index] || current.find((c) => c.real_filename === name);
            const newIndex = file ? all.findIndex((a) => a.attach_id === file.attach_id) : -1;
            if (newIndex === -1) {
                if (!missing.includes(name)) missing.push(name);
                return '';
            }
            return `[attachment=${newIndex}]${name}[/attachment]`;
        });

        textarea.value = text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        if (!back.length) {
            if (missing.length) showMissing(textarea, missing);
            return;
        }

        back.forEach((file, i) => addAttachmentFields(form, current.length + i, file));
        try {
            if (missing.length) sessionStorage.setItem(MISSING_KEY, JSON.stringify(missing));
        } catch (e) {}
        const preview = form.querySelector('input[name="preview"]');
        if (preview) form.requestSubmit(preview);
    }

    function formAttachments(form) {
        const files = [];
        form.querySelectorAll('input[name^="attachment_data["]').forEach((input) => {
            const match = input.name.match(ATTACHMENT_FIELD);
            if (!match) return;
            const file = files[match[1]] || (files[match[1]] = {});
            file[match[2]] = input.value;
        });
        return files.filter((file) => file && file.attach_id);
    }

    function addAttachmentFields(form, index, file) {
        Object.keys(file).forEach((field) => {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = `attachment_data[${index}][${field}]`;
            input.value = file[field];
            form.appendChild(input);
        });
    }

    // the forum serves a file uploaded for an unsent post only to its owner, and refuses one that's gone
    async function fileExists(attachId) {
        const controller = new AbortController();
        try {
            const response = await fetch(new URL('./download/file.php?id=' + encodeURIComponent(attachId), location.href), {
                credentials: 'same-origin',
                signal: controller.signal
            });
            return response.ok;
        } catch (e) {
            return false;
        } finally {
            controller.abort(); // only the answer is needed, not the file
        }
    }

    function showMissingAfterPreview(textarea) {
        let missing;
        try {
            missing = JSON.parse(sessionStorage.getItem(MISSING_KEY) || 'null');
            sessionStorage.removeItem(MISSING_KEY);
        } catch (e) {}
        if (missing && missing.length) showMissing(textarea, missing);
    }

    function showMissing(textarea, names) {
        const bar = document.createElement('div');
        bar.className = 'ih-draft-bar ih-draft-missing';
        bar.innerHTML = `
            <i class="icon fa-paperclip fa-fw ih-draft-icon" aria-hidden="true"></i>
            <span class="ih-draft-text">די עטעטשמענטס זענען שוין נישט דא, לייגט זיי צו נאכאמאל:<span class="ih-draft-words"></span></span>
            <button type="button" class="button button-secondary ih-draft-drop">אקעי</button>`;
        bar.querySelector('.ih-draft-words').textContent = names.join(', ');
        bar.querySelector('.ih-draft-drop').addEventListener('click', () => bar.remove());
        textarea.before(bar);
    }

    function timeAgo(savedAt) {
        const minutes = Math.round((Date.now() - savedAt) / 60000);
        if (minutes < 1) return 'פאר א רגע';
        if (minutes < 60) return `פאר ${minutes} מינוט`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `פאר ${hours} שעה`;
        const days = Math.round(hours / 24);
        return days === 1 ? 'פאר א טאג' : `פאר ${days} טעג`;
    }

    function firstWords(text) {
        return text.replace(/\[[^\]]*\]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 300);
    }

    function dropOldDrafts() {
        const oldest = Date.now() - KEEP_MS;
        chrome.storage.local.get(null, (items) => {
            const old = Object.keys(items).filter((key) => key.startsWith(PREFIX) && !(items[key].savedAt >= oldest));
            if (old.length) chrome.storage.local.remove(old);
        });
    }

    function store(key, draft) {
        try {
            if (draft) chrome.storage.local.set({ [key]: draft });
            else chrome.storage.local.remove(key);
        } catch (e) {}
    }

    init();
})();


  // ====== v2 module: spoilers.js ======
(function () {
    'use strict';

    const SETTING_KEY = 'spoilerPolish';
    const MAX_LINES = 3;
    const EXPAND_MS = 400;
    const BLOCKS = 'div, p, blockquote, dl, ul, ol, table, pre, hr, iframe, video, audio';

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] !== true) return;

            document.querySelectorAll('.spoilwrapper').forEach(hideSpoiler);
        });
    }

    function hideSpoiler(spoiler) {
        const content = spoiler.querySelector('.spoilcontent');
        if (!content) return;

        coverWords(spoiler, content);
        ownElements(spoiler, content, 'img').forEach(coverPicture);

        spoiler.classList.add('ih-spoiler', 'ih-spoiler-hidden');
        if (!content.querySelector(BLOCKS)) {
            spoiler.classList.add('ih-spoiler-inline');
            if (content.getClientRects().length > MAX_LINES) spoiler.classList.add('ih-spoiler-long');
        } else if (wordsPastLines(spoiler, MAX_LINES)) {
            spoiler.classList.add('ih-spoiler-long');
        }

        spoiler.tabIndex = 0;
        spoiler.setAttribute('role', 'button');
        spoiler.title = 'ספוילער';

        const reveal = (event) => {
            if (!spoiler.classList.contains('ih-spoiler-hidden')) return;
            event.preventDefault();
            event.stopPropagation();
            if (spoiler.classList.contains('ih-spoiler-long')) expand(spoiler);
            spoiler.classList.remove('ih-spoiler-hidden');
            spoiler.removeAttribute('tabindex');
            spoiler.removeAttribute('role');
            spoiler.removeAttribute('title');
        };

        spoiler.addEventListener('click', reveal);
        spoiler.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') reveal(event);
        });
    }

    function ownElements(spoiler, content, selector) {
        return [...content.querySelectorAll(selector)].filter((el) => el.closest('.spoilwrapper') === spoiler);
    }

    function coverWords(spoiler, content) {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const texts = [];
        while (walker.nextNode()) {
            const text = walker.currentNode;
            if (text.textContent.trim() && text.parentElement.closest('.spoilwrapper') === spoiler) texts.push(text);
        }

        texts.forEach((text) => {
            const words = document.createElement('span');
            words.className = 'ih-spoiler-words';
            text.replaceWith(words);
            words.appendChild(text);
        });
    }

    function wordsPastLines(spoiler, lines) {
        const style = getComputedStyle(spoiler);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
        const limit = spoiler.getBoundingClientRect().top + lines * lineHeight;
        return [...spoiler.querySelectorAll('.ih-spoiler-words')]
            .some((words) => words.getBoundingClientRect().bottom > limit + 1);
    }

    function coverPicture(img) {
        const picture = document.createElement('span');
        picture.className = 'ih-spoiler-picture';
        img.replaceWith(picture);
        picture.appendChild(img);
    }

    function expand(spoiler) {
        spoiler.style.overflow = 'hidden';
        spoiler.style.maxHeight = spoiler.scrollHeight + 'px';
        setTimeout(() => {
            spoiler.style.maxHeight = '';
            spoiler.style.overflow = '';
        }, EXPAND_MS);
    }

    init();
})();


  // ====== v2 module: profileCards.js ======
(function () {
    'use strict';

    const SETTING_KEY = 'profileCards';
    const SHOW_DELAY_MS = 800;
    const HIDE_DELAY_MS = 300;
    const PROFILE_LINK = '#page-body a[href*="mode=viewprofile"]';
    const KEEP_TAGS = new Set(['a', 'b', 'br', 'div', 'em', 'i', 'img', 'p', 'span', 'strong', 'u']);
    const DROP_TAGS = new Set(['button', 'embed', 'form', 'iframe', 'input', 'noscript', 'object', 'script', 'select', 'style', 'textarea']);
    const MONTHS = 'יאנואר|פעברואר|מארטש|אפריל|מאי|יוני|יולי|אויגוסט|אוגוסט|סעפטעמבער|אקטאבער|נאוועמבער|דעצעמבער';
    const DATE = new RegExp(`^(?:\\S+ )?(${MONTHS}) (\\d{1,2}), (\\d{4})(?: (\\d{1,2}):(\\d{2}) ?(am|pm))?$`, 'i');
    const TIME = /(\d{1,2}):(\d{2}) ?(am|pm)/gi;

    const profiles = new Map();
    const loaded = new Map();
    let card = null;
    let hoveredLink = null;
    let showTimeout;
    let hideTimeout;

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([SETTING_KEY], (items) => {
            if (items[SETTING_KEY] !== false) listen();
        });
    }

    function listen() {
        document.addEventListener('mouseover', (event) => {
            if (card && card.contains(event.target)) {
                clearTimeout(hideTimeout);
                return;
            }
            const link = event.target.closest(PROFILE_LINK);
            if (!link || link.querySelector('img')) return;

            clearTimeout(hideTimeout);
            if (link === hoveredLink) return;
            hoveredLink = link;
            clearTimeout(showTimeout);
            showTimeout = setTimeout(() => showCard(link), SHOW_DELAY_MS);
        });

        document.addEventListener('mouseout', (event) => {
            const link = event.target.closest(PROFILE_LINK);
            const leavingLink = link && link === hoveredLink && !link.contains(event.relatedTarget)
                && !(card && card.contains(event.relatedTarget));
            const leavingCard = card && card.contains(event.target) && !card.contains(event.relatedTarget)
                && !(hoveredLink && hoveredLink.contains(event.relatedTarget));
            if (!leavingLink && !leavingCard) return;

            clearTimeout(showTimeout);
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(hideCard, HIDE_DELAY_MS);
        });
    }

    function hideCard() {
        hoveredLink = null;
        if (card) card.remove();
    }

    async function showCard(link) {
        const address = link.href;
        const fallbackName = cleanText(link.textContent).replace(/^@/, '');

        if (!loaded.has(address)) {
            placeCard(link, { name: fallbackName, loading: true });
            await getProfile(address);
        }

        const profile = loaded.get(address);
        if (link !== hoveredLink) return;
        if (!profile) {
            hideCard();
            return;
        }
        placeCard(link, { ...profile, name: profile.name || fallbackName });
    }

    function getProfile(address) {
        if (!profiles.has(address)) {
            profiles.set(address, fetch(address, { credentials: 'same-origin' })
                .then((response) => (response.ok ? response.text() : ''))
                .then((html) => readProfile(html, address))
                .catch(() => null)
                .then((profile) => {
                    loaded.set(address, profile);
                    return profile;
                }));
        }
        return profiles.get(address);
    }

    function readProfile(html, address) {
        const page = new DOMParser().parseFromString(html, 'text/html');
        const profile = page.getElementById('viewprofile');
        if (!profile) return null;

        const avatar = profile.querySelector('.profile-avatar img');
        const avatarSrc = avatar && (avatar.getAttribute('data-src') || avatar.getAttribute('src'));
        const username = profile.querySelector('.profile-details dd .username, .profile-details dd .username-coloured');
        const rank = profile.querySelector('dl.left-box:not(.details) dd');
        const signature = profile.querySelector('.signature');
        const signatureHeading = signature && signature.closest('.inner') && signature.closest('.inner').querySelector('h3');

        return {
            address,
            avatar: avatarSrc ? new URL(avatarSrc, address).href : '',
            name: username ? cleanText(username.textContent) : '',
            nameColor: username ? username.style.color : '',
            online: !!profile.querySelector('.panel.online'),
            rank: rank ? cleanText(rank.textContent) : '',
            fields: pairs(profile.querySelector('.profile-details')).slice(1).filter((row) => !row.value.querySelector('select')),
            sections: [...profile.querySelectorAll('.column1, .column2')]
                .map((column) => ({ title: textOf(column.querySelector('h3')), rows: pairs(column.querySelector('dl.details')) }))
                .filter((section) => section.rows.length),
            signature: signature && signature.textContent.trim() ? { title: textOf(signatureHeading), content: signature } : null
        };
    }

    function pairs(list) {
        if (!list) return [];
        return [...list.querySelectorAll('dt')]
            .filter((dt) => dt.nextElementSibling && dt.nextElementSibling.tagName === 'DD')
            .map((dt) => ({ label: textOf(dt).replace(/:$/, ''), value: dt.nextElementSibling }))
            .filter((row) => row.label);
    }

    function textOf(node) {
        return node ? cleanText(node.textContent) : '';
    }

    function cleanText(text) {
        return text.replace(/\s+/g, ' ').trim();
    }

    function readableDate(text) {
        const date = text.match(DATE);
        if (!date) return text.replace(TIME, (all, hour, minute, half) => clock(hour, minute, half));

        const [, month, day, year, hour, minute, half] = date;
        return `${Number(day)} ${month} ${year}` + (hour ? ` אום ${clock(hour, minute, half)}` : '');
    }

    function clock(hour, minute, half) {
        const hours = (Number(hour) % 12) + (half.toLowerCase() === 'pm' ? 12 : 0);
        return `${hours}:${minute}`;
    }

    function safeCopy(source, base) {
        const copy = document.createDocumentFragment();
        source.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                copy.append(node.textContent);
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;

            const tag = node.tagName.toLowerCase();
            if (DROP_TAGS.has(tag)) return;

            const address = tag === 'a' ? safeAddress(node.getAttribute('href'), base)
                : tag === 'img' ? safeAddress(node.getAttribute('data-src') || node.getAttribute('src'), base) : '';
            if (!KEEP_TAGS.has(tag) || ((tag === 'a' || tag === 'img') && !address)) {
                copy.append(safeCopy(node, base));
                return;
            }

            const element = document.createElement(tag);
            if (tag === 'a') element.href = address;
            if (tag === 'img') {
                element.src = address;
                element.alt = node.getAttribute('alt') || '';
            }
            element.append(safeCopy(node, base));
            copy.append(element);
        });
        return copy;
    }

    function safeAddress(value, base) {
        try {
            const url = new URL(value || '', base);
            return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
        } catch (e) {
            return '';
        }
    }

    function placeCard(link, profile) {
        if (!card) {
            card = document.createElement('div');
            card.className = 'ih-profile-card';
        }
        fillCard(profile);
        if (!card.isConnected) document.body.appendChild(card);

        const signature = card.querySelector('.ih-profile-signature');
        if (signature) markSignature(signature);

        const rect = link.getBoundingClientRect();
        const width = card.offsetWidth;
        const height = card.offsetHeight;
        const middle = rect.left + rect.width / 2;
        const left = clamp(middle - width / 2, 8, window.innerWidth - width - 8);
        const below = rect.bottom + 8 + height <= window.innerHeight || rect.top - 8 - height < 0;

        card.classList.toggle('ih-profile-above', !below);
        card.style.top = `${window.scrollY + (below ? rect.bottom + 8 : rect.top - 8 - height)}px`;
        card.style.left = `${window.scrollX + left}px`;
        card.style.setProperty('--ih-pointer-x', `${clamp(middle - left, 14, width - 14)}px`);
    }

    // fades the bottom of a signature while there's more to scroll to
    function markSignature(signature) {
        signature.classList.toggle('ih-profile-signature-more',
            signature.scrollTop + signature.clientHeight < signature.scrollHeight - 2);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function fillCard(profile) {
        card.textContent = '';
        card.classList.toggle('ih-profile-loading', !!profile.loading);

        const header = element('div', 'ih-profile-header');
        if (profile.avatar) {
            const avatar = element('img', 'ih-profile-avatar');
            avatar.src = profile.avatar;
            avatar.alt = '';
            header.appendChild(avatar);
        } else if (profile.loading) {
            header.appendChild(element('div', 'ih-profile-skeleton ih-profile-avatar'));
        }

        const title = element('div', 'ih-profile-title');
        const name = element('div', 'ih-profile-name', profile.name);
        if (profile.nameColor) name.style.color = profile.nameColor;
        title.appendChild(name);

        const tags = element('div', 'ih-profile-tags');
        if (profile.online) tags.appendChild(element('span', 'ih-profile-tag ih-profile-online', 'אנליין'));
        if (profile.rank) tags.appendChild(element('span', 'ih-profile-tag', profile.rank));
        if (profile.loading) tags.appendChild(element('span', 'ih-profile-skeleton ih-profile-skeleton-tag'));
        if (tags.childNodes.length) title.appendChild(tags);

        header.appendChild(title);
        card.appendChild(header);

        if (profile.loading) {
            card.append(skeletonSection(false), skeletonSection(true));
            return;
        }

        if (profile.fields.length) card.appendChild(section('', profile.fields, profile.address));
        profile.sections.forEach((part) => card.appendChild(section(part.title, part.rows, profile.address)));

        if (profile.signature) {
            const box = element('div', 'ih-profile-section');
            if (profile.signature.title) box.appendChild(element('div', 'ih-profile-heading', profile.signature.title));
            const signature = element('div', 'ih-profile-signature');
            signature.appendChild(safeCopy(profile.signature.content, profile.address));
            box.appendChild(signature);
            card.appendChild(box);

            const markMore = () => markSignature(signature);
            signature.addEventListener('scroll', markMore);
            signature.querySelectorAll('img').forEach((img) => img.addEventListener('load', markMore));
        }
    }

    function section(title, rows, base) {
        const box = element('div', 'ih-profile-section');
        if (title) box.appendChild(element('div', 'ih-profile-heading', title));

        const list = element('dl', 'ih-profile-rows');
        rows.forEach((row) => {
            const value = element('dd');
            if (row.value.querySelector('a, img')) value.appendChild(safeCopy(row.value, base));
            else value.textContent = readableDate(textOf(row.value));
            list.append(element('dt', '', row.label), value);
        });
        box.appendChild(list);
        return box;
    }

    // the shape of a section while the profile loads, so the card doesn't jump much when it's filled
    function skeletonSection(withHeading) {
        const box = element('div', 'ih-profile-section');
        if (withHeading) box.appendChild(element('div', 'ih-profile-skeleton ih-profile-skeleton-heading'));

        const list = element('dl', 'ih-profile-rows');
        for (let i = 0; i < 3; i++) list.append(element('dt', 'ih-profile-skeleton'), element('dd', 'ih-profile-skeleton'));
        box.appendChild(list);
        return box;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    init();
})();


  // ====== v2 module: editorUndo.js ======
// Undo / redo for the post editor.
//
// The forum's BBCode buttons, smilies and quote links write straight into
// textarea.value, and the browser throws away its own undo history whenever a
// page does that, so Ctrl+Z stops working after the first button click. This
// keeps our own history instead: typing is grouped by word, every button click
// is its own step, and Ctrl+Z / Ctrl+Y (also Ctrl+Shift+Z, and the right-click
// menu) plus two toolbar buttons walk through it.
//
// Runs in the page (injected by contentScript.js) so it can see the forum's own
// writes to the textarea.

(function () {
    const MAX_STEPS = 300;
    const GROUP_MS = 1000; // typing faster than this stays in one step

    const UNDO_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
        + '<path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62A7.95 7.95 0 0 1 12.5 10.5c3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>'
        + '</svg>';
    const REDO_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
        + '<path fill="currentColor" d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>'
        + '</svg>';

    const valueProp = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

    function isEnabled() {
        const settings = document.getElementById('iveltHelperSettings');
        // On unless the user turned it off in the extension settings
        return !settings || settings.getAttribute('data-editor-undo') !== 'false';
    }

    // The forum uses the ABBC3 toolbar and hides phpBB's own #format-buttons
    function findToolbar(scope) {
        const isVisible = (node) => node && node.getClientRects().length > 0;
        const rows = Array.from(scope.querySelectorAll('#abbc3_buttons .abbc3_buttons_row')).filter(isVisible);
        if (rows.length) return { row: rows[0], abbc3: true };
        const stock = scope.querySelector('#format-buttons');
        return isVisible(stock) ? { row: stock, abbc3: false } : null;
    }

    function attach(textarea) {
        if (textarea.dataset.ivuAttached) return;
        textarea.dataset.ivuAttached = '1';

        const undoStack = [];
        let redoStack = [];
        let applying = false;
        let last = snapshot();
        let lastKind = '';
        let lastTime = 0;
        let undoButton = null;
        let redoButton = null;
        let replacingSelection = false;

        function snapshot() {
            return {
                value: valueProp.get.call(textarea),
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
                scroll: textarea.scrollTop
            };
        }

        function pushUndo(state) {
            undoStack.push(state);
            if (undoStack.length > MAX_STEPS) undoStack.shift();
        }

        // Called after the text changed. 'typing' and 'deleting' merge into the
        // step before them while the user keeps typing (or deleting) the same word.
        function record(kind) {
            if (applying) return;
            const now = snapshot();
            if (now.value === last.value) {
                last = now;
                return;
            }
            const merge = (kind === 'typing' || kind === 'wordEnd' ? lastKind === 'typing' : kind === 'deleting' && lastKind === kind)
                && Date.now() - lastTime < GROUP_MS;
            if (!merge) pushUndo(last);
            redoStack = [];
            last = now;
            // A space or Enter stays with the word before it, and the next letter starts a new step
            lastKind = kind === 'wordEnd' ? '' : kind;
            lastTime = Date.now();
            updateButtons();
        }

        // Changes nobody told us about (e.g. the extension's own isolated
        // scripts) become their own step the next time we look
        function catchUp() {
            if (valueProp.get.call(textarea) !== last.value) record('other');
        }

        // Keep the caret position of the current state fresh, so undo puts it back
        function rememberCaret() {
            if (valueProp.get.call(textarea) === last.value) last = snapshot();
        }

        function apply(state) {
            applying = true;
            valueProp.set.call(textarea, state.value);
            textarea.focus();
            textarea.setSelectionRange(state.start, state.end);
            textarea.scrollTop = state.scroll;
            // Let anything else watching the editor (char counters, drafts) know
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            applying = false;
            last = snapshot();
            lastKind = '';
            updateButtons();
        }

        function undo() {
            catchUp();
            if (!undoStack.length) return;
            rememberCaret();
            redoStack.push(last);
            apply(undoStack.pop());
        }

        function redo() {
            catchUp();
            if (!redoStack.length) return;
            rememberCaret();
            pushUndo(last);
            apply(redoStack.pop());
        }

        // The forum's buttons set .value (or setRangeText) directly; each one is its own step
        Object.defineProperty(textarea, 'value', {
            configurable: true,
            get() { return valueProp.get.call(this); },
            set(v) {
                catchUp();
                rememberCaret();
                valueProp.set.call(this, v);
                record('button');
                // The buttons place the caret right after setting the value
                setTimeout(rememberCaret, 0);
            }
        });
        const nativeSetRangeText = textarea.setRangeText;
        textarea.setRangeText = function () {
            catchUp();
            rememberCaret();
            const result = nativeSetRangeText.apply(this, arguments);
            record('button');
            return result;
        };

        textarea.addEventListener('beforeinput', (e) => {
            if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
                // The right-click menu's undo/redo; the browser's own history is broken
                e.preventDefault();
                if (e.inputType === 'historyUndo') undo(); else redo();
                return;
            }
            catchUp();
            rememberCaret();
            replacingSelection = textarea.selectionStart !== textarea.selectionEnd;
        });

        textarea.addEventListener('input', (e) => {
            if (applying) return;
            const data = e.data || '';
            // One letter at a time is typing, a space or Enter finishes the word,
            // and a paste or a whole word inserted at once (spellcheck, the image
            // resizer) is a step of its own
            let kind = 'other';
            if (replacingSelection) kind = 'other'; // typing over or deleting a selection
            else if (e.inputType === 'insertText' && data.length === 1) kind = /\s/.test(data) ? 'wordEnd' : 'typing';
            else if (e.inputType === 'insertLineBreak') kind = 'wordEnd';
            else if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') kind = 'deleting';
            record(kind);
        });

        textarea.addEventListener('keydown', (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            // e.code, so it also works with the Yiddish keyboard layout
            const isZ = e.code === 'KeyZ';
            const isY = e.code === 'KeyY';
            if (isZ && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if (isY || (isZ && e.shiftKey)) {
                e.preventDefault();
                redo();
            }
        });

        ['keyup', 'mouseup', 'focus', 'select'].forEach(type => textarea.addEventListener(type, rememberCaret));

        // The page restores a saved draft or the "preview" text after we loaded
        textarea.form && textarea.form.addEventListener('reset', () => setTimeout(catchUp, 0));

        addButtons();

        function addButtons() {
            const found = findToolbar(textarea.form || document);
            if (!found) return;

            const wrap = document.createElement('span');
            wrap.className = 'ivu-buttons' + (found.abbc3 ? ' ivu-in-abbc3' : '');
            undoButton = makeButton(found.abbc3, UNDO_ICON, 'צוריק (Ctrl+Z)', undo);
            redoButton = makeButton(found.abbc3, REDO_ICON, 'ווידער (Ctrl+Y)', redo);
            wrap.append(undoButton, redoButton);
            found.row.prepend(wrap);
            updateButtons();
        }

        function makeButton(abbc3, icon, label, action) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = abbc3 ? 'abbc3_button ivu-button' : 'button button-icon-only ivu-button';
            button.title = label;
            button.setAttribute('aria-label', label);
            button.innerHTML = icon;
            // Keep the caret in the textarea while clicking
            button.addEventListener('mousedown', (e) => e.preventDefault());
            button.addEventListener('click', action);
            return button;
        }

        function updateButtons() {
            if (!undoButton) return;
            undoButton.disabled = !undoStack.length;
            redoButton.disabled = !redoStack.length;
        }
    }

    function start() {
        if (!isEnabled()) return;
        document.querySelectorAll('textarea[name="message"]').forEach(attach);
    }

    // The settings element is added by settingsHandler.js once storage answers,
    // which may be a moment after this script runs
    let tries = 0;
    (function waitForSettings() {
        if (document.getElementById('iveltHelperSettings') || ++tries > 20) start();
        else setTimeout(waitForSettings, 100);
    })();
}());


  // ====== v2 module: imageResizer.js ======
// Image Resizer
//
// Hooks into the post editor's own attachment flow, so an image that is too big for
// the forum (or in a format it doesn't take) is shrunk before it is uploaded - no
// matter how it arrives:
//   - picked with the forum's own "add file" button
//   - dropped on the editor or on the attachments tab
//   - pasted straight into the post, like in Gmail: the image is attached and placed
//     inline at the spot it was pasted
// A dropped folder, or one picked with the "Folder → ZIP" button next to the forum's
// "add file" button, is packed into a single ZIP attachment. Everything runs locally
// in the browser - no file ever leaves the page except through the forum's own upload.
//
// Runs as a content script (isolated world) and is controlled by two settings,
// which can be switched on and off without a reload:
//   "imageResizer" - the automatic shrinking, the ZIP offer and Folder -> ZIP
//   "pasteImages"  - pasting images into the post
// A third one, "openAttachmentsTab", opens the attachments tab instead of the
// options tab when the editor loads, so "add file" is right there.

(function () {
    'use strict';

    const RESIZE_KEY = 'imageResizer';
    const PASTE_KEY = 'pasteImages';
    const ATTACH_TAB_KEY = 'openAttachmentsTab';

    const MAX_ATTACHMENTS = 3;
    const MAX_BYTES = 399 * 1024;          // the image attachment limit (400 KB), just under it
    const ZIP_MAX_BYTES = 250 * 1024;      // archives have a lower limit (256 KB)
    const ZIP_SOURCE_LIMIT = 100 * 1024 * 1024; // refuse folders bigger than this - they can never fit anyway
    const ZIP_MIN_IMAGE_BYTES = 20 * 1024;  // never squeeze a single image below this inside a ZIP
    const ZIP_MAX_IMAGE_BYTES = 400 * 1024;
    // Shrinking keeps as much of the image as fits: the largest of these sizes
    // (longest side, px) at the best quality that fits under the limit
    const PNG_SIZES = [2560, 2048, 1800, 1600];
    const JPEG_SIZES = [2560, 2048, 1800, 1600, 1440, 1280, 1024, 800, 640, 480];
    const JPEG_TOP_QUALITY = 0.92;
    const JPEG_GOOD_QUALITY = 0.7;
    const JPEG_LOWEST_QUALITY = 0.4;
    const HOLD_STATUS_MS = 4000;
    const INPUT_WAIT_MS = 3000;            // how long the forum may take to build its uploader
    const ROW_WAIT_MS = 15 * 1000;         // a file that never shows up in the list was refused
    const UPLOAD_WAIT_MS = 3 * 60 * 1000;

    // Formats the forum accepts as they are. Anything else has to be converted;
    // anything on this list is only touched when it is over the size limit.
    const FORUM_SAFE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp|bmp|avif)$/i;
    const SKIP_NAMES = ['.ds_store', 'thumbs.db', 'desktop.ini'];
    const SKIP_FOLDERS = ['__macosx'];

    let hooks = null;
    const enabled = { resize: false, paste: false };

    // ---------------------------------------------------------------------
    // Setting handling: each part is on unless the user explicitly turned it off
    // ---------------------------------------------------------------------

    function init() {
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get([RESIZE_KEY, PASTE_KEY, ATTACH_TAB_KEY], (items) => {
            enabled.resize = items[RESIZE_KEY] !== false;
            enabled.paste = items[PASTE_KEY] !== false;
            if (items[ATTACH_TAB_KEY] !== false) openAttachmentsTab();
            apply();
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || (!changes[RESIZE_KEY] && !changes[PASTE_KEY])) return;
            if (changes[RESIZE_KEY]) enabled.resize = changes[RESIZE_KEY].newValue !== false;
            if (changes[PASTE_KEY]) enabled.paste = changes[PASTE_KEY].newValue !== false;
            apply();
        });
    }

    function apply() {
        if (!enabled.resize && !enabled.paste) {
            unmount();
            return;
        }
        if (!hooks && getTextarea()) hooks = createHooks();
        if (hooks) hooks.refresh();
    }

    function unmount() {
        if (!hooks) return;
        hooks.destroy();
        hooks = null;
    }

    // Only when the page loads - flipping the setting later shouldn't switch tabs under the user
    function openAttachmentsTab() {
        const tab = document.querySelector('a[data-subpanel="attach-panel"]');
        if (tab && !tab.closest('.activetab')) tab.click();
    }

    // ---------------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------------

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getTextarea() {
        return document.getElementById('message') || document.querySelector('textarea[name="message"]');
    }

    // The forum's uploader (plupload) puts its own hidden file input over the "add file"
    // button, but only once the attachments tab has been opened
    function findAttachmentInput() {
        return document.querySelector('#attach-panel-multi .moxie-shim input[type="file"]') ||
            document.querySelector('.moxie-shim input[type="file"]');
    }

    function isAttachmentInput(node) {
        return node instanceof HTMLInputElement && node.type === 'file' && !!node.closest('.moxie-shim');
    }

    function attachmentRows() {
        return Array.from(document.querySelectorAll('#file-list .attach-row'));
    }

    // Rows that don't carry an error are attached or still uploading
    function getAttachedFilesCount() {
        return attachmentRows().filter(row => !row.querySelector('.file-error')).length;
    }

    function slotsLeft() {
        return Math.max(0, MAX_ATTACHMENTS - getAttachedFilesCount());
    }

    function isImageFile(file) {
        return (file.type || '').startsWith('image/') || (!file.type && IMAGE_EXTENSION.test(file.name));
    }

    function hasFiles(event) {
        return !!event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files');
    }

    function plural(n, one, many) {
        return n + ' ' + (n === 1 ? one : many);
    }

    // A pasted screenshot is always called "image.png" - give it a name that can
    // be told apart in the attachment list and inside the post
    function pastedName(file, index) {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        const ext = ((file.type || '').split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
        return `pasted-${stamp}${index ? '-' + (index + 1) : ''}.${ext}`;
    }

    // ---------------------------------------------------------------------
    // Hooks into the post editor
    // ---------------------------------------------------------------------

    function createHooks() {
        const cleanups = [];
        const textarea = getTextarea();

        let busy = false;
        let passThrough = false;   // set while we hand our own files to the forum's uploader
        let statusTimer = null;

        // --- Status line under the editor ---
        const status = el('div', 'ivr-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        textarea.insertAdjacentElement('afterend', status);

        function showStatus(text, kind, holdMs) {
            clearTimeout(statusTimer);
            status.textContent = text || '';
            status.className = 'ivr-status' + (text ? ' ivr-show' : '') + (kind ? ' ivr-' + kind : '');
            if (text && holdMs) {
                statusTimer = setTimeout(() => showStatus(''), holdMs);
            }
        }

        function on(target, type, handler, capture) {
            target.addEventListener(type, handler, capture);
            cleanups.push(() => target.removeEventListener(type, handler, capture));
        }

        const fullMessage = `עס מעג זיין מאקסימום ${MAX_ATTACHMENTS} אטעטשמענטס. מעקט אויס איינס איידער איר לייגט צו נאך.`;

        // Opens the attachments tab when the uploader isn't there yet, and waits for it
        async function ensureAttachmentInput() {
            let input = findAttachmentInput();
            if (input) return input;

            const tab = document.querySelector('a[data-subpanel="attach-panel"]');
            if (tab) tab.click();

            const until = Date.now() + INPUT_WAIT_MS;
            while (!(input = findAttachmentInput()) && Date.now() < until) await delay(100);
            if (!input) throw new Error('קען נישט געפינען וואו מען לייגט צו אטעטשמענטס.');
            return input;
        }

        // Hand files to the forum's uploader as if the user had picked them there
        function attach(files, input) {
            const dt = new DataTransfer();
            files.forEach(f => dt.items.add(f));
            input.files = dt.files;
            passThrough = true;
            try {
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } finally {
                passThrough = false;
            }
        }

        // Shrinks whatever needs it and attaches everything. Files that aren't images are
        // passed on untouched - the forum decides about those. With the resizer turned
        // off (only pasting is on) nothing is shrunk or zipped, just attached.
        // Returns a Map from each original file to what was attached for it
        // (missing = skipped or unreadable).
        async function processAndAttach(fileList) {
            const resize = enabled.resize;
            const result = new Map();
            if (busy) {
                showStatus('⏳ ווארט ביז די פריערדיגע בילדער זענען גרייט…', 'warn', HOLD_STATUS_MS);
                return result;
            }

            let files = Array.from(fileList);
            const slots = slotsLeft();
            if (slots === 0) {
                showStatus(fullMessage, 'error', HOLD_STATUS_MS * 2);
                return result;
            }

            // More files than the forum lets us attach - offer to pack them all into one ZIP.
            // The dialog picks each line's direction from its first letter, so every line
            // has to start with Yiddish - a line starting with "OK" comes out scrambled.
            if (resize && files.length > slots) {
                const zip = confirm(
                    `איר האט אויסגעקליבן ${files.length} פיילס, אבער עס איז נאר דא פלאץ פאר ${plural(slots, 'אטעטשמענט', 'אטעטשמענטס')}.\n\n` +
                    `• דרוקט OK צו לייגן זיי אלע אריין אין איין ZIP פייל (די בילדער ווערן פארקלענערט אז עס זאל אריינפאסן)\n` +
                    `• דרוקט Cancel צו צולייגן נאר די ערשטע ${slots}`
                );
                if (zip) {
                    await zipAndAttach(files.map(f => ({ path: f.name, file: f })), 'files-' + new Date().toLocaleDateString('sv'));
                    return result;
                }
            }

            let note = '';
            if (files.length > slots) {
                note = `עס איז נאר געווען פלאץ פאר ${slots}. `;
                files = files.slice(0, slots);
            }

            // An oversized animated image can only be shrunk by flattening it to a
            // still, so let the user decide before the animation is destroyed
            const animated = [];
            for (const file of resize ? files : []) {
                if (isImageFile(file) && needsWork(file, MAX_BYTES) && await isAnimated(file)) animated.push(file);
            }
            if (animated.length) {
                const ok = confirm(
                    `${plural(animated.length, 'באוועגלעכער בילד איז', 'באוועגלעכע בילדער זענען')} צו גרויס, אדער אין א פארמאט וואס דער פארום נעמט נישט.\n\n` +
                    `פארקלענערן מאכט עס א שטילע בילד, און די באוועגונג גייט פארלוירן.\n\n` +
                    `פארקלענערן סיי ווי? (Cancel לאזט עס אויס)`
                );
                if (!ok) files = files.filter(f => !animated.includes(f));
            }

            const work = resize ? files.filter(f => isImageFile(f) && needsWork(f, MAX_BYTES)) : [];
            const failed = [];
            const stillTooBig = [];
            busy = true;

            try {
                let n = 0;
                for (const file of files) {
                    if (!work.includes(file)) {
                        result.set(file, file);
                        continue;
                    }
                    n++;
                    showStatus(`⏳ פארקלענערט ${work.length > 1 ? `בילד ${n} פון ${work.length}` : 'דאס בילד'}…`);
                    try {
                        const prepared = await prepareForUpload(file);
                        if (prepared.size > MAX_BYTES) stillTooBig.push(prepared.name);
                        result.set(file, prepared);
                    } catch (err) {
                        console.warn('Image Resizer: could not process ' + file.name, err);
                        failed.push(file.name);
                    }
                }

                if (result.size) attach(Array.from(result.values()), await ensureAttachmentInput());
            } catch (err) {
                console.error(err);
                showStatus('❌ ' + err.message, 'error', HOLD_STATUS_MS * 2);
                result.clear();
                return result;
            } finally {
                busy = false;
            }

            const problems = [];
            if (failed.length) problems.push('קען נישט עפענען: ' + failed.join(', '));
            if (stillTooBig.length) problems.push(`נאך אלץ גרעסער פון ${formatSize(MAX_BYTES)}: ` + stillTooBig.join(', '));

            if (problems.length) {
                showStatus('⚠️ ' + note + problems.join('; '), 'warn', HOLD_STATUS_MS * 3);
            } else if (work.length) {
                const shrunk = work.filter(f => result.has(f)).map(f => formatSize(result.get(f).size));
                showStatus(`✅ ${note}${plural(shrunk.length, 'בילד', 'בילדער')} פארקלענערט (${shrunk.join(', ')})`, 'ok', HOLD_STATUS_MS);
            } else if (note) {
                showStatus('⚠️ ' + note, 'warn', HOLD_STATUS_MS);
            }
            return result;
        }

        // --- The forum's own "add file" button ---
        // Catch the pick before the uploader sees it. Picks that need no work go
        // straight through untouched.
        on(document, 'change', (e) => {
            const input = e.target;
            if (passThrough || !enabled.resize || !isAttachmentInput(input)) return;
            const files = Array.from(input.files || []);
            const tooMany = files.length > slotsLeft();
            if (!tooMany && !files.some(f => isImageFile(f) && needsWork(f, MAX_BYTES))) return;

            e.stopImmediatePropagation();
            processAndAttach(files);
        }, true);

        // --- Paste, like in Gmail ---
        // The image is attached, and a placeholder holds its spot in the post until the
        // upload is done; then the forum's own "place inline" puts it right there.
        on(document, 'paste', (e) => {
            if (!enabled.paste || e.target !== textarea || !e.clipboardData) return;
            const images = Array.from(e.clipboardData.files || []).filter(isImageFile);
            if (!images.length) return;

            e.preventDefault();
            e.stopPropagation();
            pasteImages(images);
        }, true);

        async function pasteImages(images) {
            if (busy) {
                showStatus('⏳ ווארט ביז די פריערדיגע בילדער זענען גרייט…', 'warn', HOLD_STATUS_MS);
                return;
            }
            if (slotsLeft() === 0) {
                showStatus(fullMessage, 'error', HOLD_STATUS_MS * 2);
                return;
            }

            const pasted = images.map((file, i) => {
                const named = new File([file], pastedName(file, images.length > 1 ? i : 0), { type: file.type, lastModified: Date.now() });
                return { file: named, marker: `[⏳ ${named.name}]` };
            });
            insertAtCursor(pasted.map(p => p.marker).join('\n'));

            const before = new Set(attachmentRows());
            const attached = await processAndAttach(pasted.map(p => p.file));

            await Promise.all(pasted.map(async (p) => {
                const file = attached.get(p.file);
                if (!file) {
                    removeMarker(p.marker);
                    return;
                }
                try {
                    const row = await waitForUpload(file.name, before);
                    if (!placeInline(row, p.marker)) removeMarker(p.marker);
                } catch (err) {
                    removeMarker(p.marker);
                    showStatus(`❌ ${file.name}: ${err.message}`, 'error', HOLD_STATUS_MS * 2);
                }
            }));
        }

        // Like typing it: replaces the selection and keeps the undo history
        function insertAtCursor(text) {
            textarea.focus();
            if (!document.execCommand('insertText', false, text)) {
                textarea.setRangeText(text, textarea.selectionStart, textarea.selectionEnd, 'end');
            }
        }

        // Swaps a stretch of the post for other text, keeping the user's caret and
        // scroll position where they were
        function replaceRange(start, end, apply) {
            const active = document.activeElement;
            const selStart = textarea.selectionStart;
            const selEnd = textarea.selectionEnd;
            const scrollTop = textarea.scrollTop;
            const lengthBefore = textarea.value.length;

            apply();

            const shift = textarea.value.length - lengthBefore;
            const moved = pos => pos <= start ? pos : pos >= end ? pos + shift : end + shift;
            if (active && active !== textarea && active.focus) active.focus();
            textarea.setSelectionRange(moved(selStart), moved(selEnd));
            textarea.scrollTop = scrollTop;
        }

        function removeMarker(marker) {
            const at = textarea.value.indexOf(marker);
            if (at === -1) return;
            replaceRange(at, at + marker.length, () => {
                textarea.value = textarea.value.slice(0, at) + textarea.value.slice(at + marker.length);
            });
        }

        // The forum numbers inline attachments itself (and renumbers them when one is
        // deleted), so let its own "place inline" button write the BBCode
        function placeInline(row, marker) {
            const button = row.querySelector('.file-inline-bbcode');
            const at = textarea.value.indexOf(marker);
            if (!button || at === -1) return false;

            replaceRange(at, at + marker.length, () => {
                textarea.value = textarea.value.slice(0, at) + textarea.value.slice(at + marker.length);
                textarea.setSelectionRange(at, at);
                button.click();
            });
            return true;
        }

        // Find the new row for this file and wait for its upload to end
        async function waitForUpload(name, before) {
            const started = Date.now();
            while (Date.now() - started < UPLOAD_WAIT_MS) {
                const row = attachmentRows().find(r => !before.has(r) &&
                    (r.querySelector('.file-name') || r).textContent.trim() === name);

                if (!row && Date.now() - started > ROW_WAIT_MS) {
                    throw new Error('דער פארום האט נישט אנגענומען דעם פייל.');
                }
                if (row) {
                    const fileStatus = row.querySelector('.file-status');
                    if (fileStatus && fileStatus.classList.contains('file-error')) {
                        throw new Error(fileStatus.title || 'עס איז נישט ארויפגעגאנגען.');
                    }
                    if (row.getAttribute('data-attach-id') || (fileStatus && fileStatus.classList.contains('file-uploaded'))) {
                        return row;
                    }
                }
                await delay(300);
            }
            throw new Error('עס האט צו לאנג גענומען.');
        }

        // --- Drag and drop ---
        // Files dropped on the editor or the attachments tab are attached; anywhere else
        // the drop is swallowed, since the browser would otherwise navigate away from
        // the post being written.
        on(document, 'dragover', (e) => { if (enabled.resize && hasFiles(e)) e.preventDefault(); });

        on(document, 'drop', (e) => {
            if (!enabled.resize || !hasFiles(e)) return;
            e.preventDefault();

            const target = e.target instanceof Element ? e.target : null;
            if (!target || !target.closest('#message, #attach-panel')) return;
            e.stopImmediatePropagation();
            for (const node of document.querySelectorAll('.drag-n-drop-highlight')) {
                node.classList.remove('drag-n-drop-highlight');
            }

            // The item list is only readable inside this handler, so grab the entries now
            const fsEntries = [];
            for (const item of e.dataTransfer.items || []) {
                if (item.kind !== 'file' || !item.webkitGetAsEntry) continue;
                const entry = item.webkitGetAsEntry();
                if (entry) fsEntries.push(entry);
            }

            if (fsEntries.some(en => en.isDirectory)) handleDroppedEntries(fsEntries);
            else processAndAttach(e.dataTransfer.files);
        }, true);

        // --- Folder -> ZIP ---
        const folderInput = el('input');
        folderInput.type = 'file';
        folderInput.multiple = true;
        folderInput.setAttribute('webkitdirectory', '');
        folderInput.hidden = true;
        document.body.append(folderInput);

        const zipButton = el('input', 'button2 ivr-zip');
        zipButton.type = 'button';
        // The page is right-to-left, so the arrow has to point left to read "folder to ZIP"
        zipButton.value = '🗂️ פאלדער ← ZIP';
        zipButton.title = 'קלייבט אויס א פאלדער, און ער ווערט צוגעלייגט אלס איין ZIP פייל';

        // Without the old floating button nothing shows that big images are fine to add,
        // so say so right after the forum's own "...ביז: 400 KiB." line. The limit itself
        // stays: it still applies to every file that isn't an image.
        const resizeHint = el('span', 'ivr-hint', '📷 גרעסערע בילדער ווערן אויטאמאטיש פארקלענערט');

        // The forum's size-limit paragraph ("...ביז: 400 KiB.") is the last one before
        // the row of attachment buttons. (The basic upload form sits in between until
        // the forum's uploader starts and removes it, so skip anything that isn't a <p>.)
        function findLimitLine() {
            let node = document.getElementById('attach-panel-multi');
            while (node && (node = node.previousElementSibling)) {
                if (node.tagName === 'P') return node;
            }
            return null;
        }

        function placeZipButton() {
            const addFiles = document.getElementById('add_files');
            if (!addFiles || zipButton.isConnected) return !!addFiles;
            addFiles.insertAdjacentElement('afterend', zipButton);
            const limitLine = findLimitLine();
            if (limitLine) limitLine.append(' ', resizeHint);
            else zipButton.insertAdjacentElement('afterend', resizeHint);
            return true;
        }

        if (!placeZipButton()) {
            const observer = new MutationObserver(() => { if (placeZipButton()) observer.disconnect(); });
            observer.observe(document.body, { childList: true, subtree: true });
            cleanups.push(() => observer.disconnect());
        }

        zipButton.addEventListener('click', () => {
            if (busy) return;
            if (slotsLeft() === 0) {
                showStatus(fullMessage, 'error', HOLD_STATUS_MS * 2);
                return;
            }
            folderInput.value = '';
            folderInput.click();
        });

        function isSkipped(path) {
            const parts = path.toLowerCase().split('/');
            return SKIP_NAMES.includes(parts[parts.length - 1]) || parts.some(p => SKIP_FOLDERS.includes(p));
        }

        // Files picked through the folder input already carry webkitRelativePath
        folderInput.addEventListener('change', () => {
            const picked = Array.from(folderInput.files || []);
            if (!picked.length) return;

            const entries = picked
                .map(f => ({ path: f.webkitRelativePath || f.name, file: f }))
                .filter(e => !isSkipped(e.path));

            const first = entries[0];
            const root = first && first.path.includes('/') ? first.path.split('/')[0] : 'files';
            zipAndAttach(stripCommonRoot(entries), root);
        });

        // Dropping a real folder gives us filesystem entries instead of files
        async function handleDroppedEntries(fsEntries) {
            if (busy) return;
            const collected = [];

            busy = true;
            showStatus('⏳ ליינט דעם פאלדער…');
            try {
                for (const entry of fsEntries) {
                    await readEntryRecursive(entry, '', collected);
                }
            } catch (err) {
                console.error(err);
                showStatus('❌ קען נישט ליינען דעם פאלדער: ' + err.message, 'error', HOLD_STATUS_MS * 2);
                return;
            } finally {
                busy = false;
            }
            showStatus('');

            const usable = collected.filter(e => !isSkipped(e.path));
            const dir = fsEntries.find(e => e.isDirectory);
            zipAndAttach(stripCommonRoot(usable), dir ? dir.name : 'files');
        }

        async function zipAndAttach(entries, zipBaseName) {
            if (busy) return;

            if (slotsLeft() === 0) {
                showStatus(fullMessage, 'error', HOLD_STATUS_MS * 2);
                return;
            }
            if (!entries.length) {
                showStatus('דער פאלדער איז ליידיג.', 'warn', HOLD_STATUS_MS);
                return;
            }

            const sourceBytes = entries.reduce((sum, e) => sum + e.file.size, 0);
            if (sourceBytes > ZIP_SOURCE_LIMIT) {
                showStatus(`דער פאלדער איז ${formatSize(sourceBytes)} - פיל צו גרויס פאר איין אטעטשמענט.`, 'error', HOLD_STATUS_MS * 2);
                return;
            }

            busy = true;
            try {
                let list = entries;

                // Only touch the images when the archive would not fit as it is
                if (sourceBytes > ZIP_MAX_BYTES) {
                    list = await shrinkEntriesForZip(list, ZIP_MAX_BYTES, (n, total) => showStatus(`⏳ פארקלענערט בילד ${n} פון ${total}…`));
                }

                const blob = await buildZip(list, (done, total) => showStatus(`🗂️ מאכט ZIP ${done}/${total}…`));

                const zipFile = new File([blob], sanitizeName(zipBaseName) + '.zip', {
                    type: 'application/zip',
                    lastModified: Date.now()
                });

                if (zipFile.size > ZIP_MAX_BYTES) {
                    showStatus('');
                    const ok = confirm(
                        `דער ZIP איז ${formatSize(zipFile.size)} (${plural(list.length, 'פייל', 'פיילס')}).\n\n` +
                        `אייוועלט נעמט געווענליך נישט אן ZIP פיילס גרעסער פון ${formatSize(256 * 1024)}, און עס קען זיין אז עס וועט נישט ארויפגיין.\n\n` +
                        `צולייגן סיי ווי?`
                    );
                    if (!ok) return;
                }

                attach([zipFile], await ensureAttachmentInput());
                showStatus(`✅ ZIP פון ${formatSize(zipFile.size)} צוגעלייגט`, 'ok', HOLD_STATUS_MS);
            } catch (err) {
                console.error(err);
                showStatus('❌ קען נישט מאכן דעם ZIP: ' + err.message, 'error', HOLD_STATUS_MS * 2);
            } finally {
                busy = false;
            }
        }

        return {
            // Folder -> ZIP and the hint belong to the resizer, so they only show while that is on
            refresh() {
                zipButton.hidden = !enabled.resize;
                resizeHint.hidden = !enabled.resize;
            },
            destroy() {
                clearTimeout(statusTimer);
                cleanups.forEach(fn => fn());
                status.remove();
                zipButton.remove();
                resizeHint.remove();
                folderInput.remove();
            }
        };
    }

    // ---------------------------------------------------------------------
    // Image handling
    //
    // A file is only touched when the forum would actually refuse it: an unknown
    // format, or a file over the size limit. A small PNG or GIF is attached exactly
    // as it is - no needless re-encoding, no lost transparency, no lost animation.
    // ---------------------------------------------------------------------

    function isForumSafe(file) {
        return FORUM_SAFE_TYPES.includes((file.type || '').toLowerCase());
    }

    function needsWork(file, maxBytes) {
        return !isForumSafe(file) || file.size > maxBytes;
    }

    // A GIF holds one graphic control block per frame - two of them means animation;
    // an animated WebP carries an ANIM chunk in its header
    async function isAnimated(file) {
        const type = (file.type || '').toLowerCase();
        try {
            if (type === 'image/gif') {
                const bytes = new Uint8Array(await file.arrayBuffer());
                let frames = 0;
                for (let i = 0; i < bytes.length - 3; i++) {
                    if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9 && bytes[i + 2] === 0x04 && ++frames > 1) return true;
                }
            } else if (type === 'image/webp') {
                const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
                const text = String.fromCharCode(...head);
                return text.includes('ANIM');
            }
        } catch (e) {
            console.warn('Image Resizer: could not inspect ' + file.name, e);
        }
        return false;
    }

    // Decode without a detour through a base64 data URL
    async function decodeImage(file) {
        if (typeof createImageBitmap === 'function') {
            try {
                return { source: await createImageBitmap(file), release() { this.source.close(); } };
            } catch (e) {
                // fall through to the <img> route
            }
        }

        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('Could not open ' + file.name + ' as an image'));
                image.src = url;
            });
            return { source: img, release() {} };
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    // Draw onto a canvas whose longest side is at most `max` (never enlarges)
    function drawScaled(source, max, opaque) {
        let w = source.width, h = source.height;
        const longest = Math.max(w, h);
        if (longest > max) {
            const ratio = max / longest;
            w = Math.max(1, Math.round(w * ratio));
            h = Math.max(1, Math.round(h * ratio));
        }

        const cvs = document.createElement('canvas');
        cvs.width = w;
        cvs.height = h;
        const ctx = cvs.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // JPG has no alpha channel, so transparent areas need a white backdrop
        if (opaque) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(source, 0, 0, w, h);
        return cvs;
    }

    function canvasToBlob(cvs, type, quality) {
        return new Promise(resolve => cvs.toBlob(resolve, type, quality));
    }

    function freeCanvas(cvs) {
        cvs.width = 0;
        cvs.height = 0;
    }

    function withExtension(blob, originalName, ext, type) {
        const dot = originalName.lastIndexOf('.');
        const stem = dot > 0 ? originalName.substring(0, dot) : originalName;
        return new File([blob], stem + ext, { type, lastModified: Date.now() });
    }

    // Candidate sizes from `top` downwards, skipping ones that would not change anything
    function sizeLadder(longest, top, steps) {
        const first = Math.min(longest, top);
        return [first, ...steps.filter(s => s < first)];
    }

    // Best JPEG for one canvas size: the highest quality between minQuality and
    // JPEG_TOP_QUALITY that still fits. `fits` is false when even minQuality is too big.
    async function jpegAtSize(source, size, maxBytes, minQuality) {
        const cvs = drawScaled(source, size, true);
        try {
            const top = await canvasToBlob(cvs, 'image/jpeg', JPEG_TOP_QUALITY);
            if (!top) return { blob: null, fits: false };
            if (top.size <= maxBytes) return { blob: top, fits: true };

            const floor = await canvasToBlob(cvs, 'image/jpeg', minQuality);
            if (!floor) return { blob: top, fits: false };
            if (floor.size > maxBytes) return { blob: floor, fits: false };

            // somewhere in between - home in on the best quality that fits
            let best = floor, lo = minQuality, hi = JPEG_TOP_QUALITY;
            for (let i = 0; i < 5; i++) {
                const mid = (lo + hi) / 2;
                const candidate = await canvasToBlob(cvs, 'image/jpeg', mid);
                if (candidate && candidate.size <= maxBytes) { best = candidate; lo = mid; }
                else hi = mid;
            }
            return { blob: best, fits: true };
        } finally {
            freeCanvas(cvs);
        }
    }

    // Bring a file under maxBytes while keeping as much of it as fits: the largest
    // size and the highest quality the limit allows, so text in a screenshot stays
    // readable. A PNG stays PNG when that fits at (close to) full size - transparency
    // survives; otherwise we land on JPG.
    // If nothing fits, the smallest attempt is returned and the caller can tell by its size.
    async function shrinkImage(file, maxBytes) {
        const decoded = await decodeImage(file);
        try {
            const source = decoded.source;
            const longest = Math.max(source.width, source.height);

            if ((file.type || '').toLowerCase() === 'image/png') {
                for (const size of sizeLadder(longest, longest, PNG_SIZES)) {
                    const cvs = drawScaled(source, size, false);
                    const blob = await canvasToBlob(cvs, 'image/png');
                    freeCanvas(cvs);
                    if (!blob) break;
                    if (blob.size <= maxBytes) return withExtension(blob, file.name, '.png', 'image/png');
                    // a photo saved as PNG will never get close - stop wasting time on it
                    if (size === longest && blob.size > maxBytes * 3) break;
                }
            }

            // First look for the largest size that still fits at a good quality; only
            // when nothing does (a tiny budget inside a ZIP) accept a lower quality
            let smallest = null;
            for (const minQuality of [JPEG_GOOD_QUALITY, JPEG_LOWEST_QUALITY]) {
                for (const size of sizeLadder(longest, JPEG_SIZES[0], JPEG_SIZES)) {
                    const result = await jpegAtSize(source, size, maxBytes, minQuality);
                    if (result.blob && (!smallest || result.blob.size < smallest.size)) smallest = result.blob;
                    if (result.fits) return withExtension(result.blob, file.name, '.jpg', 'image/jpeg');
                }
            }

            if (!smallest) throw new Error('Could not re-encode ' + file.name);
            return withExtension(smallest, file.name, '.jpg', 'image/jpeg');
        } finally {
            decoded.release();
        }
    }

    // Convert only what the forum would not take, otherwise hand the file back untouched
    async function prepareForUpload(file) {
        if (!needsWork(file, MAX_BYTES)) return file;
        const smaller = await shrinkImage(file, MAX_BYTES);
        // never hand back something bigger than what we started with
        return (isForumSafe(file) && smaller.size >= file.size) ? file : smaller;
    }

    // Inside a ZIP the image format doesn't matter to the forum. The images share
    // whatever room the rest of the archive leaves, so a folder with two photos gets
    // more per photo than a folder with twenty.
    async function shrinkEntriesForZip(entries, maxBytes, onProgress) {
        const images = [];
        let otherBytes = 0;

        for (const item of entries) {
            if (isImageFile(item.file) && !(await isAnimated(item.file))) images.push(item);
            else otherBytes += item.file.size;
        }
        if (!images.length) return entries;

        const share = (maxBytes * 0.92 - otherBytes) / images.length;
        const budget = Math.min(ZIP_MAX_IMAGE_BYTES, Math.max(ZIP_MIN_IMAGE_BYTES, share));

        const replaced = new Map();
        let n = 0;
        for (const item of images) {
            n++;
            onProgress(n, images.length);
            if (item.file.size <= budget) continue;
            try {
                const smaller = await shrinkImage(item.file, budget);
                if (smaller.size < item.file.size) {
                    const dir = item.path.includes('/') ? item.path.substring(0, item.path.lastIndexOf('/') + 1) : '';
                    replaced.set(item, { path: dir + smaller.name, file: smaller });
                }
            } catch (e) {
                console.warn('Image Resizer: could not shrink ' + item.path + ', keeping original', e);
            }
        }

        return entries.map(item => replaced.get(item) || item);
    }

    // ---------------------------------------------------------------------
    // Folder reading + ZIP writer (no external library - everything runs locally)
    // ---------------------------------------------------------------------

    function sanitizeName(name) {
        const clean = String(name || 'files').replace(/[\\/:*?"<>|]+/g, '_').trim();
        return clean.length ? clean : 'files';
    }

    // Everything picked sits under the folder that was picked, and the ZIP already
    // carries that name - so drop the wrapper and let the archive open straight
    // onto its files. A ZIP of an extension folder is only installable that way.
    // If several items were dropped at once the roots differ and we leave them be.
    function stripCommonRoot(entries) {
        if (!entries.length) return entries;

        const slash = entries[0].path.indexOf('/');
        if (slash === -1) return entries;

        const root = entries[0].path.substring(0, slash + 1);
        if (!entries.every(e => e.path.startsWith(root))) return entries;

        return entries.map(e => ({ path: e.path.substring(root.length), file: e.file }));
    }

    // Walk a dropped FileSystemEntry tree into a flat [{ path, file }] list
    async function readEntryRecursive(entry, basePath, out) {
        if (entry.isFile) {
            const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
            out.push({ path: basePath + entry.name, file });
            return;
        }

        if (!entry.isDirectory) return;

        const reader = entry.createReader();
        const children = [];
        // readEntries hands back at most ~100 entries per call, so keep asking until it's empty
        while (true) {
            const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
            if (!batch.length) break;
            children.push(...batch);
        }

        for (const child of children) {
            await readEntryRecursive(child, basePath + entry.name + '/', out);
        }
    }

    const CRC_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    async function deflateRaw(bytes) {
        if (typeof CompressionStream === 'undefined') return null;
        try {
            const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
            return new Uint8Array(await new Response(stream).arrayBuffer());
        } catch (e) {
            return null; // fall back to storing the file uncompressed
        }
    }

    function dosDateTime(ms) {
        const d = new Date(ms || Date.now());
        if (d.getFullYear() < 1980) return { time: 0, date: 33 }; // 1980-01-01
        return {
            time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
            date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
        };
    }

    // Minimal ZIP writer: deflate when it helps, store otherwise, UTF-8 file names
    async function buildZip(entries, onProgress) {
        if (entries.length > 0xFFFF) {
            throw new Error('Too many files in that folder (max 65535).');
        }

        const encoder = new TextEncoder();
        const parts = [];
        const central = [];
        const seen = new Set();
        let offset = 0;
        let done = 0;

        for (const entry of entries) {
            // Shrinking can turn a.png and a.jpg into the same a.jpg - keep names unique
            let path = entry.path;
            if (seen.has(path)) {
                const dot = path.lastIndexOf('.');
                const hasExt = dot > path.lastIndexOf('/');
                const stem = hasExt ? path.substring(0, dot) : path;
                const ext = hasExt ? path.substring(dot) : '';
                let n = 2;
                while (seen.has(stem + ' (' + n + ')' + ext)) n++;
                path = stem + ' (' + n + ')' + ext;
            }
            seen.add(path);

            const nameBytes = encoder.encode(path);
            const raw = new Uint8Array(await entry.file.arrayBuffer());
            const crc = crc32(raw);

            let method = 0;
            let data = raw;
            const deflated = await deflateRaw(raw);
            if (deflated && deflated.length < raw.length) {
                method = 8;
                data = deflated;
            }

            const { time, date } = dosDateTime(entry.file.lastModified);

            const local = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(local.buffer);
            lv.setUint32(0, 0x04034b50, true);  // local file header signature
            lv.setUint16(4, 20, true);          // version needed
            lv.setUint16(6, 0x0800, true);      // flags: UTF-8 file name
            lv.setUint16(8, method, true);
            lv.setUint16(10, time, true);
            lv.setUint16(12, date, true);
            lv.setUint32(14, crc, true);
            lv.setUint32(18, data.length, true);
            lv.setUint32(22, raw.length, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);          // extra field length
            local.set(nameBytes, 30);

            parts.push(local, data);

            const cd = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(cd.buffer);
            cv.setUint32(0, 0x02014b50, true);  // central directory signature
            cv.setUint16(4, 20, true);          // version made by
            cv.setUint16(6, 20, true);          // version needed
            cv.setUint16(8, 0x0800, true);
            cv.setUint16(10, method, true);
            cv.setUint16(12, time, true);
            cv.setUint16(14, date, true);
            cv.setUint32(16, crc, true);
            cv.setUint32(20, data.length, true);
            cv.setUint32(24, raw.length, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint32(42, offset, true);     // relative offset of local header
            cd.set(nameBytes, 46);
            central.push(cd);

            offset += local.length + data.length;
            if (offset > 0xFFFFFFFF) {
                throw new Error('That folder is too big to zip (over 4 GB).');
            }

            done++;
            if (onProgress) onProgress(done, entries.length);
        }

        const centralSize = central.reduce((sum, c) => sum + c.length, 0);
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);      // end of central directory
        ev.setUint16(8, entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, offset, true);

        return new Blob([...parts, ...central, eocd], { type: 'application/zip' });
    }

    init();
})();


  // -- Settings UI ------------------------------------------------------------
  function createSettingsPanel() {
    if (document.getElementById('ivelt-helper-settings')) return;
    const panel = document.createElement('div');
    panel.id = 'ivelt-helper-settings';
    panel.style = 'position:fixed; bottom:60px; right:20px; z-index:99999; background:#fff; border:1px solid #ccc; border-radius:8px; padding:12px; box-shadow:0 4px 12px rgba(0,0,0,0.15); font-family:sans-serif; font-size:14px; direction:rtl; max-width:300px; display:none; max-height:80vh; overflow:auto;';
    const labels = {
      hideUserName: 'באהאלטן באנוצער נאמען',
      warnOnLosingPost: 'ווארנונג בעפאר וואסטן פאסט',
      sefariaLinker: 'ספריא לינקער',
      backgroundSync: 'נייע תגובות/מעלדונגען שבת',
      getBrowserNotifications: 'שיקט ברויזער מעלדונגען',
      alwaysCopyTopic: 'קאפיר די ציטירטע תגובה אנשטאט גלייך אריינשרייבן',
      copyAttachments: 'קאפיר אויך די בילדער אדער אטעטשמענטס',
      stickyPostButtons: 'ווייז די תגובה קנעפלעך א גאנצע צייט',
      ShowMultiNotifs: 'ווייז נאטיפיקאציעס באזונדער (צוטיילטע)',
      cachedTopicMappingExpire: 'אפדעיט קאמענטארן אשכול דאטאבעיס יעדע (סעקונדעס)',
      backgroundSyncPosts: 'זוך פרישע תגובות יעדע (מיליסעקונדעס)',
      backgroundSyncNotif: 'זוך פרישע מעלדונגען יעדע (מינוט)',
      upDownArrowKeys: 'ארויף/אראפ שלייסלען שפרינגען צו שפיץ/באדן',
      copyPostLink: 'דריקליך אויף פאסט אייקאן קאפירט די לינק',
      editorUndo: 'צוריק/ווידער (Ctrl+Z) אין רעדאקטאר',
      titleOpensUnread: 'אשכול טיטל עפנט די ערשטע אומגעליינטע תגובה',
      whoLiked: 'ווייז ווער האט באדאנקט א פאסט',
      quoteSelection: 'ציטיר בלויז אנגעצייכנטע ווערטער',
      quoteJumpToReply: 'שפירינג צום ענטפער קעסטל נאך ציטירן',
      profileCards: 'פרופיל קארטל ביים שוויבן אויף א נאמען',
      keepDrafts: 'האלט נישט-געשיקטע תגובות (דרפטס)',
      doubleClickLike: 'טאפל-דריק באדאנקט א פאסט',
      spoilerPolish: 'שיינע ספוילערס (בעדעקט ביז דריק)',
      imageResizer: 'פארקלענערט בילדער אויטאמאטיש + פאלדער ZIP',
      pasteImages: 'איינלייגן בילדער גלייך אין פאסט (פעסט)',
      openAttachmentsTab: 'רעדאקטאר עפנט אויף אטעטשמענטס טאב',
    };
    settings = storage.getAll();
    let html = '<strong style="display:block;margin-bottom:8px;">Ivelt Helper v2 סעטטינגס</strong>';
    Object.keys(defaults).forEach((key) => {
      const isBool = typeof defaults[key] === 'boolean';
      if (isBool) {
        html += `<label style="display:block;margin:6px 0;cursor:pointer;"><input type="checkbox" data-key="${key}" ${settings[key] ? 'checked' : ''}> ${labels[key] || key}</label>`;
      } else if (key !== 'forceUpdateTopicMapCache') {
        html += `<label style="display:block;margin:6px 0;">${labels[key] || key}<br><input type="number" data-key="${key}" value="${settings[key]}" style="width:100px;"></label>`;
      }
    });
    html += '<label style="display:block;margin:6px 0;cursor:pointer;"><input type="checkbox" id="ivelt-force-refresh"> ריפרעש קאמענטארן אשכול דאטאבעיס יעצט</label>';
    html += '<button id="ivelt-helper-settings-close" style="margin-top:8px;padding:4px 10px;">סטאר</button>';
    panel.innerHTML = html;
    document.body.appendChild(panel);
    panel.querySelectorAll('input[data-key]').forEach((input) => {
      input.addEventListener('change', function () {
        const key = this.dataset.key;
        const val = this.type === 'checkbox' ? this.checked : this.value;
        settings[key] = val;
        storage.set(key, val);
        refreshSettingsDiv();
      });
    });
    document.getElementById('ivelt-force-refresh').addEventListener('change', function () {
      if (this.checked) { storage.set('forceUpdateTopicMapCache', true); refreshSettingsDiv(); }
    });
    document.getElementById('ivelt-helper-settings-close').addEventListener('click', () => panel.style.display = 'none');
  }

  // -- Initialize --------------------------------------------------------------
  function init() {
    if (!document.body) return;

    const gear = document.createElement('div');
    gear.textContent = '⚙';
    gear.title = 'Ivelt Helper Settings';
    gear.style = 'position:fixed; bottom:10px; right:10px; z-index:99999; cursor:pointer; font-size:22px; background:#fff; border-radius:50%; width:32px; height:32px; text-align:center; line-height:32px; box-shadow:0 2px 6px rgba(0,0,0,0.2);';
    gear.addEventListener('click', () => { createSettingsPanel(); const p = document.getElementById('ivelt-helper-settings'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; });
    document.body.appendChild(gear);

    try {
      if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Ivelt Helper Settings', () => { createSettingsPanel(); document.getElementById('ivelt-helper-settings').style.display = 'block'; });
      }
    } catch (e) {}

    runFeatures().then(() => observer.observe(document.body, { childList: true, subtree: true })).catch(() => {});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
