;(function () {
  'use strict'

  if (window.__AURA_WIDGET_LOADED__) return
  window.__AURA_WIDGET_LOADED__ = true

  var _scriptSrc = (document.currentScript && document.currentScript.src) || ''
  var _defaultApi = _scriptSrc ? _scriptSrc.replace(/\/widget\/chat-widget\.js.*$/, '/api') : ''

  var cfg = {
    apiUrl:        (window.AuraChatConfig && window.AuraChatConfig.apiUrl)        || _defaultApi,
    shopDomain:    (window.AuraChatConfig && window.AuraChatConfig.shopDomain)    || (window.Shopify && window.Shopify.shop) || '',
    primaryColor:  (window.AuraChatConfig && window.AuraChatConfig.primaryColor)  || '#6c3fc5',
    assistantName: (window.AuraChatConfig && window.AuraChatConfig.assistantName) || 'AI Assistant',
  }

  if (!cfg.apiUrl) {
    console.warn('[Chat Widget] apiUrl not set. Widget disabled.')
    return
  }

  var SUGGESTIONS = [
    "What's new in store?",
    "Do you have any deals?",
    "Help me find the right product",
    "What are your best sellers?",
  ]

  var state = {
    open: false,
    loading: false,
    history: [],
    messages: [],
    pendingImage: null,
    suggestionsShown: false,
  }

  // ─── Styles ──────────────────────────────────────────────────────────────────

  var p = cfg.primaryColor

  var css = [
    '#mcw-btn{position:fixed;bottom:24px;right:24px;width:58px;height:58px;border-radius:50%;background:' + p + ';color:#fff;border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;z-index:99998;transition:transform .2s,box-shadow .2s;}',
    '#mcw-btn:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(0,0,0,0.32);}',
    '#mcw-btn svg{width:26px;height:26px;}',
    '#mcw-badge{position:absolute;top:-2px;right:-2px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;}',
    '#mcw-panel{position:fixed;bottom:96px;right:24px;width:370px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 120px);background:#f0ebe3;border-radius:18px;box-shadow:0 12px 48px rgba(0,0,0,0.22);display:flex;flex-direction:column;overflow:hidden;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;transition:opacity .25s,transform .25s;}',
    '#mcw-panel.mcw-hidden{opacity:0;transform:translateY(16px) scale(0.96);pointer-events:none;}',
    '.mcw-header{background:' + p + ';padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;}',
    '.mcw-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}',
    '.mcw-header-info{flex:1;}',
    '.mcw-header-name{color:#fff;font-weight:700;font-size:15px;line-height:1.2;}',
    '.mcw-header-status{color:rgba(255,255,255,0.8);font-size:12px;display:flex;align-items:center;gap:4px;}',
    '.mcw-status-dot{width:7px;height:7px;border-radius:50%;background:#4ade80;}',
    '.mcw-close{background:none;border:none;color:rgba(255,255,255,0.85);cursor:pointer;padding:4px;border-radius:6px;display:flex;align-items:center;}',
    '.mcw-close:hover{color:#fff;background:rgba(255,255,255,0.15);}',
    '.mcw-messages{flex:1;overflow-y:auto;padding:16px 12px;display:flex;flex-direction:column;gap:6px;scroll-behavior:smooth;}',
    '.mcw-messages::-webkit-scrollbar{width:4px;}',
    '.mcw-messages::-webkit-scrollbar-thumb{background:#ccc;border-radius:2px;}',
    '.mcw-row{display:flex;flex-direction:column;max-width:82%;}',
    '.mcw-row.mcw-user{align-self:flex-end;align-items:flex-end;}',
    '.mcw-row.mcw-bot{align-self:flex-start;align-items:flex-start;flex-direction:row;gap:6px;max-width:90%;}',
    '.mcw-bot-av{width:30px;height:30px;border-radius:50%;background:' + p + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;margin-top:2px;}',
    '.mcw-bot-content{display:flex;flex-direction:column;gap:4px;}',
    '.mcw-bubble{padding:9px 13px;border-radius:16px;line-height:1.5;word-break:break-word;white-space:pre-wrap;font-size:13.5px;}',
    '.mcw-row.mcw-user .mcw-bubble{background:' + p + ';color:#fff;border-bottom-right-radius:4px;}',
    '.mcw-row.mcw-bot .mcw-bubble{background:#fff;color:#1a1a1a;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.08);}',
    '.mcw-time{font-size:10.5px;color:#999;padding:0 4px;margin-top:1px;}',
    '.mcw-img-preview-msg{max-width:200px;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.15);}',
    '.mcw-img-preview-msg img{display:block;width:100%;max-height:160px;object-fit:cover;}',
    '.mcw-suggestions{display:flex;flex-wrap:wrap;gap:6px;padding:4px 0 2px;}',
    '.mcw-chip{background:#fff;border:1.5px solid ' + p + ';color:' + p + ';border-radius:20px;padding:6px 13px;font-size:12px;font-weight:500;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap;}',
    '.mcw-chip:hover{background:' + p + ';color:#fff;}',
    '.mcw-products{display:flex;gap:10px;overflow-x:auto;padding:4px 0 8px;scrollbar-width:thin;max-width:280px;}',
    '.mcw-products::-webkit-scrollbar{height:4px;}',
    '.mcw-products::-webkit-scrollbar-thumb{background:#ddd;border-radius:2px;}',
    '.mcw-card{flex-shrink:0;width:140px;border-radius:12px;overflow:hidden;cursor:pointer;transition:box-shadow .15s,transform .15s;text-decoration:none;color:inherit;display:flex;flex-direction:column;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.1);}',
    '.mcw-card:hover{box-shadow:0 6px 18px rgba(0,0,0,0.15);transform:translateY(-2px);}',
    '.mcw-card-img{width:100%;height:110px;object-fit:cover;display:block;}',
    '.mcw-card-img-ph{width:100%;height:110px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:26px;}',
    '.mcw-card-body{padding:8px;flex:1;display:flex;flex-direction:column;gap:3px;}',
    '.mcw-card-name{font-size:11.5px;font-weight:600;line-height:1.3;color:#111;}',
    '.mcw-card-price{font-size:11.5px;color:#555;}',
    '.mcw-card-sale{color:#e53e3e;font-weight:700;}',
    '.mcw-card-orig{text-decoration:line-through;color:#aaa;}',
    '.mcw-card-atc{margin-top:auto;background:' + p + ';color:#fff;border:none;border-radius:7px;padding:5px 8px;font-size:11px;font-weight:600;cursor:pointer;transition:opacity .15s;text-align:center;}',
    '.mcw-card-atc:hover{opacity:.85;}',
    '.mcw-card-atc:disabled{opacity:.45;cursor:not-allowed;}',
    '.mcw-card-oos{margin-top:auto;background:#f3f4f6;color:#888;border-radius:7px;padding:5px 8px;font-size:11px;font-weight:500;text-align:center;}',
    '.mcw-typing{display:flex;gap:5px;align-items:center;padding:10px 14px;background:#fff;border-radius:16px;border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.08);}',
    '.mcw-dot{width:7px;height:7px;border-radius:50%;background:#bbb;animation:mcwBounce 1.2s infinite;}',
    '.mcw-dot:nth-child(2){animation-delay:.2s;}',
    '.mcw-dot:nth-child(3){animation-delay:.4s;}',
    '@keyframes mcwBounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-6px);}}',
    '.mcw-img-bar{padding:8px 12px;background:#e8e2da;border-top:1px solid #d9d3cb;display:flex;align-items:center;gap:8px;flex-shrink:0;}',
    '.mcw-img-bar img{height:38px;width:38px;object-fit:cover;border-radius:7px;}',
    '.mcw-img-bar span{font-size:12px;color:#666;flex:1;}',
    '.mcw-img-bar button{background:none;border:none;cursor:pointer;color:#aaa;font-size:16px;padding:2px 4px;}',
    '.mcw-img-bar button:hover{color:#e53e3e;}',
    '.mcw-footer{padding:10px 10px;border-top:1px solid #d9d3cb;display:flex;gap:7px;align-items:flex-end;flex-shrink:0;background:#f0ebe3;}',
    '.mcw-input{flex:1;border:1.5px solid #d9d3cb;border-radius:22px;padding:9px 14px;font-size:13.5px;resize:none;outline:none;max-height:100px;overflow-y:auto;font-family:inherit;line-height:1.4;color:#1a1a1a;background:#fff;transition:border-color .15s;}',
    '.mcw-input:focus{border-color:' + p + ';}',
    '.mcw-attach{background:#fff;border:1.5px solid #d9d3cb;border-radius:50%;width:38px;height:38px;cursor:pointer;color:#666;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0;}',
    '.mcw-attach:hover{background:#e8e2da;}',
    '.mcw-send{background:' + p + ';border:none;border-radius:50%;width:38px;height:38px;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;transition:opacity .15s;flex-shrink:0;}',
    '.mcw-send:hover{opacity:.85;}',
    '.mcw-send:disabled{opacity:.4;cursor:not-allowed;}',
    '@media(max-width:420px){#mcw-panel{right:8px;bottom:84px;width:calc(100vw - 16px);}#mcw-btn{right:16px;bottom:16px;}}',
  ].join('')

  var styleEl = document.createElement('style')
  styleEl.textContent = css
  document.head.appendChild(styleEl)

  // ─── HTML ─────────────────────────────────────────────────────────────────────

  var initials = cfg.assistantName.charAt(0).toUpperCase()

  var html = '<button id="mcw-btn" aria-label="Open chat"><span id="mcw-badge" style="display:none">1</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>'
    + '<div id="mcw-panel" class="mcw-hidden" role="dialog">'
    + '<div class="mcw-header"><div class="mcw-avatar">🛍</div><div class="mcw-header-info"><div class="mcw-header-name">' + cfg.assistantName + '</div><div class="mcw-header-status"><span class="mcw-status-dot"></span>Online</div></div><button class="mcw-close" id="mcw-close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>'
    + '<div class="mcw-messages" id="mcw-messages"></div>'
    + '<div id="mcw-img-bar" class="mcw-img-bar" style="display:none"></div>'
    + '<div class="mcw-footer"><input type="file" id="mcw-file" accept="image/*" style="display:none"><button class="mcw-attach" id="mcw-attach" title="Attach image"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button><textarea class="mcw-input" id="mcw-input" placeholder="Type a message..." rows="1"></textarea><button class="mcw-send" id="mcw-send" disabled><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>'
    + '</div>'

  var wrap = document.createElement('div')
  wrap.innerHTML = html
  document.body.appendChild(wrap)

  var panel     = document.getElementById('mcw-panel')
  var toggleBtn = document.getElementById('mcw-btn')
  var closeBtn  = document.getElementById('mcw-close')
  var msgsEl    = document.getElementById('mcw-messages')
  var inputEl   = document.getElementById('mcw-input')
  var sendBtn   = document.getElementById('mcw-send')
  var attachBtn = document.getElementById('mcw-attach')
  var fileInput = document.getElementById('mcw-file')
  var imgBar    = document.getElementById('mcw-img-bar')
  var badge     = document.getElementById('mcw-badge')

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  function timeStr() {
    var d = new Date()
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0')
  }

  function scrollDown() { msgsEl.scrollTop = msgsEl.scrollHeight }

  // ─── Panel ────────────────────────────────────────────────────────────────────

  function openPanel() {
    state.open = true
    panel.classList.remove('mcw-hidden')
    badge.style.display = 'none'
    if (state.messages.length === 0) showWelcome()
    inputEl.focus()
  }

  function closePanel() {
    state.open = false
    panel.classList.add('mcw-hidden')
  }

  toggleBtn.addEventListener('click', function () { state.open ? closePanel() : openPanel() })
  closeBtn.addEventListener('click', closePanel)
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open) closePanel() })

  // ─── Welcome + suggestions ────────────────────────────────────────────────────

  function showWelcome() {
    var welcome = "Hi! I'm " + cfg.assistantName + ", your personal shopping assistant. Tell me what you're looking for — or describe a problem and I'll find the perfect solution for you."
    appendBotMessage(welcome, null, true)
  }

  function renderSuggestions(chips) {
    var row = document.createElement('div')
    row.className = 'mcw-suggestions'
    row.id = 'mcw-chips'
    chips.forEach(function (text) {
      var btn = document.createElement('button')
      btn.className = 'mcw-chip'
      btn.textContent = text
      btn.addEventListener('click', function () {
        row.remove()
        triggerSend(text)
      })
      row.appendChild(btn)
    })
    msgsEl.appendChild(row)
    scrollDown()
  }

  // ─── Message rendering ────────────────────────────────────────────────────────

  function appendUserMessage(text, imagePreviewUrl) {
    var existing = document.getElementById('mcw-chips')
    if (existing) existing.remove()

    var row = document.createElement('div')
    row.className = 'mcw-row mcw-user'

    if (imagePreviewUrl) {
      var imgDiv = document.createElement('div')
      imgDiv.className = 'mcw-img-preview-msg'
      imgDiv.innerHTML = '<img src="' + esc(imagePreviewUrl) + '" alt="photo">'
      row.appendChild(imgDiv)
    }
    if (text) {
      var bubble = document.createElement('div')
      bubble.className = 'mcw-bubble'
      bubble.textContent = text
      row.appendChild(bubble)
    }
    var t = document.createElement('div')
    t.className = 'mcw-time'
    t.textContent = timeStr()
    row.appendChild(t)

    msgsEl.appendChild(row)
    scrollDown()
  }

  function appendBotMessage(text, products, showChips) {
    var row = document.createElement('div')
    row.className = 'mcw-row mcw-bot'

    var av = document.createElement('div')
    av.className = 'mcw-bot-av'
    av.textContent = initials
    row.appendChild(av)

    var content = document.createElement('div')
    content.className = 'mcw-bot-content'

    if (text) {
      var bubble = document.createElement('div')
      bubble.className = 'mcw-bubble'
      bubble.textContent = text
      content.appendChild(bubble)
    }

    if (products && products.length > 0) {
      var scroll = document.createElement('div')
      scroll.className = 'mcw-products'
      products.forEach(function (p) { scroll.appendChild(buildCard(p)) })
      content.appendChild(scroll)
    }

    var t = document.createElement('div')
    t.className = 'mcw-time'
    t.textContent = timeStr()
    content.appendChild(t)

    row.appendChild(content)
    msgsEl.appendChild(row)

    if (showChips && !state.suggestionsShown) {
      state.suggestionsShown = true
      renderSuggestions(SUGGESTIONS)
    }

    scrollDown()
  }

  function appendTyping() {
    var row = document.createElement('div')
    row.className = 'mcw-row mcw-bot'
    row.id = 'mcw-typing'

    var av = document.createElement('div')
    av.className = 'mcw-bot-av'
    av.textContent = initials
    row.appendChild(av)

    row.innerHTML += '<div class="mcw-typing"><div class="mcw-dot"></div><div class="mcw-dot"></div><div class="mcw-dot"></div></div>'
    msgsEl.appendChild(row)
    scrollDown()
  }

  function removeTyping() {
    var el = document.getElementById('mcw-typing')
    if (el) el.remove()
  }

  // ─── Product card ──────────────────────────────────────────────────────────────

  function buildCard(p) {
    var handle = p.handle || p.slug || ''
    var href   = handle ? '/products/' + handle : '#'
    var oos    = p.inStock === false

    var priceHtml = p.salePrice != null
      ? '<span class="mcw-card-sale">$' + p.salePrice.toFixed(2) + '</span> <span class="mcw-card-orig">$' + p.price.toFixed(2) + '</span>'
      : '$' + (p.price || 0).toFixed(2)

    var card = document.createElement('a')
    card.className = 'mcw-card'
    card.href = href

    if (p.images && p.images[0]) {
      var img = document.createElement('img')
      img.className = 'mcw-card-img'
      img.src = p.images[0]
      img.alt = p.name
      img.loading = 'lazy'
      if (oos) img.style.opacity = '0.6'
      card.appendChild(img)
    } else {
      var ph = document.createElement('div')
      ph.className = 'mcw-card-img-ph'
      ph.innerHTML = '&#128248;'
      card.appendChild(ph)
    }

    var body = document.createElement('div')
    body.className = 'mcw-card-body'
    body.innerHTML = '<div class="mcw-card-name">' + esc(p.name) + '</div><div class="mcw-card-price">' + priceHtml + '</div>'

    if (oos) {
      body.innerHTML += '<div class="mcw-card-oos">Sold Out</div>'
    } else if (p.variantId) {
      var atc = document.createElement('button')
      atc.className = 'mcw-card-atc'
      atc.textContent = 'Add to cart'
      atc.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation()
        addToCart(p.variantId, atc)
      })
      body.appendChild(atc)
    }

    card.appendChild(body)
    return card
  }

  function addToCart(variantId, btn) {
    btn.disabled = true
    btn.textContent = 'Adding...'
    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: 1 }),
    })
      .then(function (r) { return r.json() })
      .then(function () {
        btn.textContent = 'Added!'
        document.dispatchEvent(new CustomEvent('cart:refresh'))
        setTimeout(function () { btn.textContent = 'Add to cart'; btn.disabled = false }, 2000)
      })
      .catch(function () { btn.textContent = 'Add to cart'; btn.disabled = false })
  }

  // ─── Image attachment ──────────────────────────────────────────────────────────

  attachBtn.addEventListener('click', function () { fileInput.click() })

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0]
    if (!file) return
    var reader = new FileReader()
    reader.onload = function (e) {
      var dataUrl = e.target.result
      state.pendingImage = { base64: dataUrl.split(',')[1], mediaType: file.type, previewUrl: dataUrl }
      renderImgBar()
      updateSendBtn()
    }
    reader.readAsDataURL(file)
    fileInput.value = ''
  })

  function renderImgBar() {
    if (!state.pendingImage) {
      imgBar.style.display = 'none'
      imgBar.innerHTML = ''
      return
    }
    imgBar.style.display = 'flex'
    imgBar.innerHTML = '<img src="' + state.pendingImage.previewUrl + '" alt="preview"><span>Image attached</span><button id="mcw-rmimg" title="Remove">&#x2715;</button>'
    document.getElementById('mcw-rmimg').addEventListener('click', function () {
      state.pendingImage = null
      renderImgBar()
      updateSendBtn()
    })
  }

  // ─── Input ─────────────────────────────────────────────────────────────────────

  inputEl.addEventListener('input', function () {
    this.style.height = 'auto'
    this.style.height = Math.min(this.scrollHeight, 100) + 'px'
    updateSendBtn()
  })

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() }
  })

  sendBtn.addEventListener('click', doSend)

  function updateSendBtn() {
    sendBtn.disabled = state.loading || (!inputEl.value.trim() && !state.pendingImage)
  }

  // ─── Send ──────────────────────────────────────────────────────────────────────

  function triggerSend(text) {
    inputEl.value = text
    updateSendBtn()
    doSend()
  }

  function doSend() {
    var text  = inputEl.value.trim()
    if ((!text && !state.pendingImage) || state.loading) return

    var image     = state.pendingImage ? state.pendingImage.base64     : undefined
    var mediaType = state.pendingImage ? state.pendingImage.mediaType  : undefined
    var preview   = state.pendingImage ? state.pendingImage.previewUrl : undefined

    inputEl.value = ''
    inputEl.style.height = 'auto'
    state.pendingImage = null
    renderImgBar()

    state.history.push({ role: 'user', content: text || '(image)' })
    appendUserMessage(text || null, preview)

    state.loading = true
    updateSendBtn()
    appendTyping()

    var body = {
      message: text || 'Please analyse this image and recommend products.',
      history: state.history.slice(-6),
      shopDomain: cfg.shopDomain,
    }
    if (image) { body.image = image; body.mediaType = mediaType }

    fetch(cfg.apiUrl + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status)
        return r.json()
      })
      .then(function (data) {
        removeTyping()
        state.history.push({ role: 'assistant', content: data.message })
        appendBotMessage(data.message, data.products, false)
      })
      .catch(function (err) {
        removeTyping()
        console.error('[Chat Widget]', err)
        appendBotMessage("Sorry, I couldn't reach the server. Please try again.", null, false)
      })
      .finally(function () {
        state.loading = false
        updateSendBtn()
        inputEl.focus()
      })
  }

  // ─── Unread badge when closed ──────────────────────────────────────────────────

  var _origAppendBot = appendBotMessage
  // show badge on toggle button when panel is closed and bot replies
  var _patchedSend = doSend
  // (badge is cleared on openPanel)

})()
