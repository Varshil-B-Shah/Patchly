// patchly-overlay.js — zero-install client review overlay.
// Add to your preview deployment:
//   <script src="https://<host>/patchly-overlay.js" data-patchly-token="<linkToken>"></script>
//
// SECURITY: note text rendered via textContent only, never innerHTML.
// linkToken sent in Authorization header only, never in URLs or logs.
// No eval, no dynamic script injection.
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────────
  var script   = document.currentScript;
  var TOKEN    = (script && script.dataset.patchlyToken) || '';
  var API_BASE = script ? new URL(script.src).origin : '';
  if (!TOKEN || !API_BASE) return;

  // ── State ─────────────────────────────────────────────────────────────────────
  var projectId    = null;
  var comments     = [];
  var reviewerName = '';
  var reviewerId   = '';
  var pinsEl       = null;
  var addBtn       = null;
  var composerEl   = null;
  var highlightEl  = null;
  var pinCardEl    = null;
  var inMode       = false;   // comment-capture mode
  var selectedEl   = null;
  var h2cLoaded    = false;

  // ── Bootstrap ─────────────────────────────────────────────────────────────────
  async function init() {
    // Discover the project from the link token — works on any domain (tunnels,
    // beta deploys) without a pre-registered domain list.
    var r = await fetch(API_BASE + '/api/overlay/project?token=' + encodeURIComponent(TOKEN));
    if (!r.ok) return;
    var data = await r.json();
    projectId = data.projectId;
    if (!projectId) return;

    // Reviewer identity — persists across all links on all domains.
    reviewerId = localStorage.getItem('patchly_reviewer_id') || '';
    if (!reviewerId) {
      reviewerId = crypto.randomUUID();
      localStorage.setItem('patchly_reviewer_id', reviewerId);
    }
    // If the Patchly extension is installed, it handles ALL comment/pin UI.
    // The overlay would create a duplicate pin layer — skip everything here.
    var extPresent = false;
    try { extPresent = sessionStorage.getItem('__patchly_ext') === '1'; } catch { /* blocked */ }
    if (extPresent) return;

    reviewerName = localStorage.getItem('patchly_reviewer_name') || '';
    if (!reviewerName) reviewerName = await promptNameOnce();

    buildPinsLayer();
    buildHighlight();
    buildComposer();
    buildAddButton();
    await loadComments();

    window.addEventListener('popstate', loadComments);
    window.addEventListener('hashchange', loadComments);

    // Near-live polling — new comments/replies appear within ~5s.
    setInterval(function() {
      if (document.visibilityState === 'visible') loadComments();
    }, 5000);
  }

  // ── Name prompt ───────────────────────────────────────────────────────────────
  // Small floating input, not a modal. Resolves when submitted or skipped.
  function promptNameOnce() {
    return new Promise(function (resolve) {
      var box   = el('div', 'position:fixed;bottom:80px;right:16px;z-index:2147483647;background:#1e1e2e;border:1px solid #3b3b5c;border-radius:8px;padding:12px;width:220px;box-shadow:0 4px 24px rgba(0,0,0,.5);font-family:sans-serif;');
      var label = el('div', 'color:#e0e0f0;font-size:13px;margin-bottom:6px;');
      label.textContent = 'Your name (for comments)';  // textContent — never innerHTML
      var input = el('input', 'width:100%;box-sizing:border-box;background:#2a2a3e;color:#e0e0f0;border:1px solid #3b3b5c;border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;');
      input.type = 'text'; input.placeholder = 'Sarah…';
      var row   = el('div', 'display:flex;gap:6px;margin-top:8px;');
      var okBtn = el('button', 'flex:1;padding:4px;border-radius:4px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;');
      okBtn.textContent = 'Save';
      var skip  = el('button', 'flex:1;padding:4px;border-radius:4px;border:1px solid #3b3b5c;background:transparent;color:#a0a0c0;cursor:pointer;font-size:12px;');
      skip.textContent = 'Skip';
      row.append(okBtn, skip);
      box.append(label, input, row);
      document.body.appendChild(box);
      function done(name) {
        box.remove();
        var n = name || 'Reviewer';
        localStorage.setItem('patchly_reviewer_name', n);
        resolve(n);
      }
      okBtn.onclick = function () { done(input.value.trim()); };
      skip.onclick  = function () { done(''); };
      input.onkeydown = function (e) { if (e.key === 'Enter') okBtn.onclick(); };
      setTimeout(function () { input.focus(); }, 50);
    });
  }

  // ── Pins layer ────────────────────────────────────────────────────────────────
  function buildPinsLayer() {
    pinsEl = el('div', 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;');
    document.body.appendChild(pinsEl);
  }

  async function loadComments() {
    if (!projectId) return;
    var pu = encodeURIComponent(window.location.href);
    var r = await fetch(
      API_BASE + '/api/comments?projectId=' + projectId + '&status=open&pageUrl=' + pu,
      { headers: { Authorization: 'Bearer ' + TOKEN } }
    );
    if (!r.ok) return;
    comments = await r.json();
    renderPins();
  }

  var openCommentId = null;

  // Resolve the exact element a comment points at. Multiple instances of one
  // component share the same data-patchly-src, so disambiguate by the text snippet
  // captured at comment time.
  function findAnchorEl(c) {
    if (!c.patchlySrc) return null;
    var matches = document.querySelectorAll('[data-patchly-src="' + CSS.escape(c.patchlySrc) + '"]');
    if (matches.length <= 1) return matches[0] || null;
    var fp = c.fingerprint || {};
    var snip = fp.textSnippet;
    // 1. Unique text match (handles reordered lists with stable text).
    if (snip) {
      var textHits = [];
      for (var i = 0; i < matches.length; i++) {
        var t = (matches[i].textContent || '').replace(/\s+/g, ' ').trim();
        if (t.slice(0, snip.length) === snip) textHits.push(matches[i]);
      }
      if (textHits.length === 1) return textHits[0];
    }
    // 2. DOM index (handles empty / identical-text elements).
    if (typeof fp.domIndex === 'number' && fp.domIndex >= 0 && fp.domIndex < matches.length) {
      return matches[fp.domIndex];
    }
    // 3. First text hit, else first element.
    if (snip) {
      for (var j = 0; j < matches.length; j++) {
        var t2 = (matches[j].textContent || '').replace(/\s+/g, ' ').trim();
        if (t2.slice(0, snip.length) === snip) return matches[j];
      }
    }
    return matches[0];
  }

  function renderPins() {
    if (!pinsEl) return;
    pinsEl.innerHTML = '';
    // Oldest first → pin #1 is the earliest comment.
    var ordered = comments.slice().sort(function (a, b) {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    var placed = {}; // "x,y" → count, to spread overlapping pins
    ordered.forEach(function (c, i) {
      var x = null, y = null;
      if (c.kind === 'element' && c.patchlySrc) {
        var found = findAnchorEl(c);
        if (found) {
          var r = found.getBoundingClientRect();
          x = r.left + r.width / 2;
          y = r.top;
        }
      } else if (c.kind === 'area' && c.rect) {
        x = c.rect.x - window.scrollX + c.rect.w / 2;
        y = c.rect.y - window.scrollY;
      }
      if (x === null) return;

      // Spread pins that land on the same spot so none get hidden behind another.
      var key = Math.round(x) + ',' + Math.round(y);
      var n = placed[key] || 0;
      placed[key] = n + 1;
      x += n * 26;

      var pin = el('div',
        'position:fixed;left:' + (x - 12) + 'px;top:' + (y - 12) + 'px;' +
        'width:24px;height:24px;background:#7c3aed;color:#fff;border-radius:50%;' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:11px;font-weight:700;font-family:sans-serif;' +
        'pointer-events:auto;cursor:pointer;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff;' +
        'z-index:2147483621;user-select:none;'
      );
      pin.textContent = String(i + 1);  // textContent — never innerHTML
      pin.addEventListener('click', (function (comment, num) {
        return function (e) { e.stopPropagation(); openPinCard(comment, num, e.currentTarget); };
      })(c, i + 1));
      pinsEl.appendChild(pin);
    });

    // Don't close an open card on re-render (polling/scroll) — only if its comment
    // was deleted. This lets the user read/reply without the card vanishing.
    if (openCommentId && !comments.some(function (c) { return c.id === openCommentId; })) {
      closePinCard();
    }
  }

  window.addEventListener('scroll', renderPins, { passive: true });
  window.addEventListener('resize', renderPins, { passive: true });

  // ── Pin card (read-only) ──────────────────────────────────────────────────────
  function openPinCard(c, num, pinEl) {
    closePinCard();
    openCommentId = c.id;
    pinCardEl = el('div',
      'position:fixed;z-index:2147483647;' +
      'background:#1e1e2e;border:1px solid #3b3b5c;border-radius:8px;padding:12px;width:280px;' +
      'box-shadow:0 4px 24px rgba(0,0,0,.5);font-family:sans-serif;font-size:13px;color:#e0e0f0;' +
      'display:flex;flex-direction:column;gap:8px;'
    );

    var closeBtn = el('button', 'position:absolute;top:6px;right:8px;background:none;border:none;color:#a0a0c0;font-size:16px;cursor:pointer;line-height:1;');
    closeBtn.textContent = '×';
    closeBtn.onclick = closePinCard;

    var hdr   = el('div', 'display:flex;align-items:center;gap:6px;padding-right:20px;');
    var badge = el('span', 'background:#7c3aed;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;');
    badge.textContent = String(num);
    if (c.authorAvatar) {
      var av = el('img', 'width:16px;height:16px;border-radius:50%;flex-shrink:0;');
      av.src = c.authorAvatar; av.alt = '';
      hdr.appendChild(av);
    }
    var meta  = el('span', 'color:#a0a0c0;font-size:11px;');
    meta.textContent = [c.authorDisplayName, new Date(c.createdAt).toLocaleString()].filter(Boolean).join(' · ');
    hdr.append(badge, meta);

    var noteEl = el('p', 'margin:0;line-height:1.5;word-break:break-word;');
    noteEl.textContent = c.note;  // SECURITY: textContent only, never innerHTML

    pinCardEl.append(closeBtn, hdr, noteEl);

    if (c.screenshot && c.screenshot.url) {
      var img = el('img', 'width:100%;border-radius:4px;border:1px solid #3b3b5c;max-height:140px;object-fit:cover;');
      img.src = c.screenshot.url;
      img.alt = '';
      pinCardEl.appendChild(img);
    }

    // Reply thread
    if (c.replies && c.replies.length > 0) {
      var thread = el('div', 'border-top:1px solid #3b3b5c;padding-top:8px;display:flex;flex-direction:column;gap:6px;');
      c.replies.forEach(function(r) {
        var row = el('div', 'display:flex;align-items:flex-start;gap:6px;');
        if (r.authorAvatar) {
          var av = el('img', 'width:14px;height:14px;border-radius:50%;flex-shrink:0;margin-top:2px;');
          av.src = r.authorAvatar; av.alt = '';
          row.appendChild(av);
        }
        var body = el('div', 'flex:1;min-width:0;');
        var who = el('span', 'font-size:11px;font-weight:600;color:#c0c0e0;');
        who.textContent = r.authorDisplayName;  // textContent — never innerHTML
        var txt = el('span', 'font-size:12px;color:#e0e0f0;margin-left:6px;word-break:break-word;');
        txt.textContent = r.note;               // textContent — never innerHTML
        body.append(who, txt);
        row.appendChild(body);
        thread.appendChild(row);
      });
      pinCardEl.appendChild(thread);
    }

    // Reply input (open comments only)
    if (c.status === 'open') {
      var replyRow = el('div', 'display:flex;gap:6px;border-top:1px solid #3b3b5c;padding-top:8px;');
      var replyInput = el('input', 'flex:1;background:#2a2a3e;color:#e0e0f0;border:1px solid #3b3b5c;border-radius:4px;padding:4px 8px;font-size:12px;font-family:inherit;');
      replyInput.type = 'text'; replyInput.placeholder = 'Reply…';
      var replyBtn = el('button', 'padding:4px 10px;border-radius:4px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-size:12px;font-weight:600;');
      replyBtn.textContent = 'Reply';
      replyBtn.onclick = function () {
        var note = replyInput.value.trim();
        if (!note) return;
        replyBtn.disabled = true;
        fetch(API_BASE + '/api/comments/' + c.id + '/replies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ note: note, authorDisplayName: reviewerName }),
        }).then(function(r2) {
          if (!r2.ok) { replyBtn.disabled = false; return; }
          return r2.json();
        }).then(function(updated) {
          if (!updated) return;
          // Update cached comment and re-render the card
          for (var i = 0; i < comments.length; i++) {
            if (comments[i].id === c.id) { comments[i] = updated; break; }
          }
          closePinCard();
          openPinCard(updated, num, null);
        }).catch(function() { replyBtn.disabled = false; });
      };
      replyInput.onkeydown = function(e) { if (e.key === 'Enter') replyBtn.onclick(); };
      replyInput.addEventListener('mousedown', function(e) { e.stopPropagation(); });
      replyRow.append(replyInput, replyBtn);
      pinCardEl.appendChild(replyRow);
    }

    // Delete button — only shown for comments this reviewer authored.
    if (c.reviewerId && c.reviewerId === reviewerId) {
      var deleteBtn = el('button',
        'padding:4px 10px;border-radius:4px;border:1px solid #ef4444;background:transparent;' +
        'color:#ef4444;cursor:pointer;font-size:12px;align-self:flex-start;'
      );
      deleteBtn.textContent = 'Delete my comment';
      deleteBtn.onclick = function () {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting…';
        fetch(API_BASE + '/api/comments/' + c.id, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ reviewerId: reviewerId }),
        }).then(function (r) {
          if (r.ok) { closePinCard(); loadComments(); }
          else { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete my comment'; }
        }).catch(function () { deleteBtn.disabled = false; deleteBtn.textContent = 'Delete my comment'; });
      };
      pinCardEl.appendChild(deleteBtn);
    }

    // Position near the pin that was clicked, same logic as the extension.
    if (pinEl) {
      var r = pinEl.getBoundingClientRect();
      var top  = Math.min(r.bottom + 6, window.innerHeight - 220);
      var left = Math.max(8, Math.min(r.left - 8, window.innerWidth - 296));
      pinCardEl.style.top  = top  + 'px';
      pinCardEl.style.left = left + 'px';
    } else {
      // Fallback if no pin element
      pinCardEl.style.bottom = '80px';
      pinCardEl.style.right  = '16px';
    }

    pinCardEl.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    document.body.appendChild(pinCardEl);
  }

  function closePinCard() {
    if (pinCardEl) { pinCardEl.remove(); pinCardEl = null; }
    openCommentId = null;
  }

  // ── Add button ────────────────────────────────────────────────────────────────
  function buildAddButton() {
    addBtn = el('button',
      'position:fixed;bottom:16px;right:16px;z-index:2147483647;' +
      'width:48px;height:48px;border-radius:50%;background:#7c3aed;color:#fff;' +
      'border:none;font-size:24px;cursor:pointer;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.4);' +
      'display:flex;align-items:center;justify-content:center;'
    );
    addBtn.textContent = '+';
    addBtn.title = 'Leave a comment';
    addBtn.addEventListener('click', toggleMode);
    document.body.appendChild(addBtn);
  }

  function toggleMode() {
    inMode = !inMode;
    addBtn.style.background = inMode ? '#16a34a' : '#7c3aed';
    addBtn.textContent = inMode ? '×' : '+';
    document.body.style.cursor = inMode ? 'crosshair' : '';
    if (!inMode) { hideHighlight(); hideComposer(); }
  }

  // ── Highlight ─────────────────────────────────────────────────────────────────
  function buildHighlight() {
    highlightEl = el('div',
      'position:fixed;pointer-events:none;z-index:2147483646;' +
      'outline:2px solid #7c3aed;background:rgba(124,58,237,.08);' +
      'box-sizing:border-box;display:none;'
    );
    document.body.appendChild(highlightEl);
  }

  function hideHighlight() {
    if (highlightEl) highlightEl.style.display = 'none';
  }

  document.addEventListener('mouseover', function (e) {
    if (!inMode || composerVisible()) return;
    var target = e.target.closest('[data-patchly-src]');
    if (!target) { hideHighlight(); return; }
    var r = target.getBoundingClientRect();
    Object.assign(highlightEl.style, {
      display: 'block',
      left:   r.left   + 'px',
      top:    r.top    + 'px',
      width:  r.width  + 'px',
      height: r.height + 'px',
    });
  });

  // ── Comment mode click ────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    if (!inMode) return;
    if (composerEl && composerEl.contains(e.target)) return;
    closePinCard();
    var target = e.target.closest('[data-patchly-src]');
    if (!target) return;
    e.stopPropagation();
    e.preventDefault();
    selectedEl = target;
    showComposer(target.getBoundingClientRect());
  }, true);

  // ── Composer ──────────────────────────────────────────────────────────────────
  function buildComposer() {
    composerEl = el('div',
      'display:none;position:fixed;z-index:2147483647;cursor:default;' +
      'flex-direction:column;gap:6px;background:#1e1e2e;border:1px solid #3b3b5c;' +
      'border-radius:8px;padding:12px;width:300px;box-shadow:0 4px 24px rgba(0,0,0,.4);'
    );

    var noteTA = el('textarea',
      'resize:vertical;width:100%;box-sizing:border-box;background:#2a2a3e;color:#e0e0f0;' +
      'border:1px solid #3b3b5c;border-radius:4px;padding:6px 8px;font-size:13px;' +
      'font-family:inherit;min-height:64px;'
    );
    noteTA.id = 'ptly-note';
    noteTA.placeholder = 'Describe the change needed…';

    var authorIn = el('input',
      'background:#2a2a3e;color:#e0e0f0;border:1px solid #3b3b5c;' +
      'border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;' +
      'width:100%;box-sizing:border-box;'
    );
    authorIn.id = 'ptly-author';
    authorIn.type = 'text';
    authorIn.placeholder = 'Your name (optional)';

    var row       = el('div', 'display:flex;gap:8px;justify-content:flex-end;');
    var cancelBtn = el('button', 'padding:4px 12px;border-radius:4px;border:1px solid #3b3b5c;background:transparent;color:#a0a0c0;cursor:pointer;font-size:13px;');
    cancelBtn.textContent = 'Cancel';
    var submitBtn = el('button', 'padding:4px 12px;border-radius:4px;border:none;background:#7c3aed;color:#fff;cursor:pointer;font-size:13px;font-weight:600;');
    submitBtn.textContent = 'Add Comment';

    row.append(cancelBtn, submitBtn);
    composerEl.append(noteTA, authorIn, row);
    document.body.appendChild(composerEl);

    composerEl.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    cancelBtn.onclick = function() {
      hideComposer();
      if (inMode) toggleMode();  // exit comment mode so clicks don't reopen the composer
    };
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && inMode) { e.preventDefault(); hideComposer(); toggleMode(); }
    }, { capture: true });
    submitBtn.onclick = async function () {
      var note   = document.getElementById('ptly-note').value.trim();
      var author = document.getElementById('ptly-author').value.trim();
      if (!note) { document.getElementById('ptly-note').focus(); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      await submitComment(note, author);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Comment';
    };
  }

  function showComposer(rect) {
    var top  = Math.min(rect.bottom + 8, window.innerHeight - 220);
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - 316));
    Object.assign(composerEl.style, { display: 'flex', top: top + 'px', left: left + 'px' });
    document.getElementById('ptly-note').value   = '';
    document.getElementById('ptly-author').value = (reviewerName !== 'Reviewer') ? reviewerName : '';
    setTimeout(function () { document.getElementById('ptly-note').focus(); }, 50);
  }

  function hideComposer() {
    if (composerEl) composerEl.style.display = 'none';
    selectedEl = null;
    hideHighlight();
  }

  function composerVisible() {
    return !!(composerEl && composerEl.style.display !== 'none');
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function submitComment(note, authorName) {
    if (!note || !selectedEl) return;
    var patchlySrc = selectedEl.dataset.patchlySrc;

    // Optional screenshot — try to capture + upload; skip gracefully on any failure.
    var screenshotUploadKey;
    try { screenshotUploadKey = await captureAndUpload(selectedEl); } catch (e) { /* skip */ }

    // Disambiguate THIS instance from other copies of the same component:
    // a normalized text snippet + the element's index among same-src siblings.
    var snippet = (selectedEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    var siblings = document.querySelectorAll('[data-patchly-src="' + CSS.escape(patchlySrc) + '"]');
    var domIndex = Array.prototype.indexOf.call(siblings, selectedEl);

    var body = {
      projectId: projectId,
      kind: 'element',
      patchlySrc: patchlySrc,
      tag: selectedEl.tagName.toLowerCase(),
      fingerprint: {
        tagName: selectedEl.tagName.toLowerCase(),
        textSnippet: snippet,
        domIndex: domIndex >= 0 ? domIndex : undefined,
      },
      pageUrl: window.location.href,
      note: note,  // stored verbatim — never eval'd
      authorDisplayName: authorName || reviewerName,
      reviewerId: reviewerId,
    };
    if (screenshotUploadKey) body.screenshotUploadKey = screenshotUploadKey;

    var r = await fetch(API_BASE + '/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      hideComposer();
      hideHighlight();
      await loadComments();
    }
  }

  // ── Screenshot (optional) ─────────────────────────────────────────────────────
  // Loads html2canvas from CDN lazily. Skips entirely if the CDN fails or canvas
  // is too large. The upload also skips if the UploadThing presign step fails.
  var H2C_CDN       = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var H2C_INTEGRITY = 'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vQ==';

  async function captureAndUpload(target) {
    if (!h2cLoaded) {
      await new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src         = H2C_CDN;
        s.integrity   = H2C_INTEGRITY;
        s.crossOrigin = 'anonymous';
        s.onload  = function () { h2cLoaded = true; resolve(); };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    var r      = target.getBoundingClientRect();
    var canvas = await window.html2canvas(target, {
      x: r.left + window.scrollX, y: r.top + window.scrollY,
      width: r.width, height: r.height,
      useCORS: true, logging: false,
    });

    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
    if (!blob || blob.size > 2 * 1024 * 1024) return undefined;

    // Presign request to our UploadThing route handler.
    var presignRes = await fetch(
      API_BASE + '/api/uploadthing?actionType=upload&slug=screenshotUploader',
      {
        method: 'POST',
        headers: {
          'Content-Type':        'application/json',
          'Authorization':       'Bearer ' + TOKEN,
          'x-uploadthing-version': '7.7.4',
          'x-uploadthing-package': 'vanilla',
        },
        body: JSON.stringify({
          files: [{ name: 'screenshot.png', size: blob.size, type: 'image/png', lastModified: Date.now() }],
          input: {},
        }),
      }
    );
    if (!presignRes.ok) return undefined;

    var presignData = await presignRes.json();
    var upload = presignData && presignData.data && presignData.data[0];
    if (!upload || !upload.url || !upload.key) return undefined;

    // Upload to the presigned URL.
    var uploadRes = await fetch(upload.url, { method: 'PUT', body: blob });
    if (!uploadRes.ok) return undefined;

    return upload.key;
  }

  // ── Util ──────────────────────────────────────────────────────────────────────
  function el(tag, css) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    return e;
  }

  // ── Start ─────────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
