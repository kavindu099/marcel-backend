/**
 * AURA AI Shopping Chat Widget
 * Drop this script into any Shopify theme to add an AI shopping assistant.
 *
 * Setup:
 *   1. Add to your theme's <head> (or via Shopify Admin > Themes > Edit code > theme.liquid):
 *
 *      <script>
 *        window.AuraChatConfig = {
 *          apiUrl: 'https://YOUR_API_DOMAIN/api',   // your hosted NestJS backend
 *          primaryColor: '#111827',                  // optional, default dark
 *          assistantName: 'AURA'                     // optional
 *        };
 *      </script>
 *      <script src="https://YOUR_CDN/chat-widget.js" defer></script>
 *
 *   2. shopDomain is auto-detected from window.Shopify.shop (present in all themes).
 *      Your backend must have completed the OAuth install for that shop domain.
 */

;(function () {
  'use strict'

  if (window.__AURA_WIDGET_LOADED__) return
  window.__AURA_WIDGET_LOADED__ = true

  var cfg = {
    apiUrl:        (window.AuraChatConfig && window.AuraChatConfig.apiUrl)        || '',
    shopDomain:    (window.AuraChatConfig && window.AuraChatConfig.shopDomain)    || (window.Shopify && window.Shopify.shop) || '',
    primaryColor:  (window.AuraChatConfig && window.AuraChatConfig.primaryColor)  || '#111827',
    assistantName: (window.AuraChatConfig && window.AuraChatConfig.assistantName) || 'AURA',
  }

  if (!cfg.apiUrl) {
    console.warn('[AURA Chat] apiUrl is not set in window.AuraChatConfig. Widget disabled.')
    return
  }

  // ─── State ───────────────────────────────────────────────────────────────────

  var state = {
    open: false,
    loading: false,
    history: [],    // { role: 'user'|'assistant', content: string }[]
    messages: [],   // rendered messages: { role, content, products? }
    pendingImage: null,        // { base64, mediaType, previewUrl }
  }

  // ─── Styles ──────────────────────────────────────────────────────────────────

  var css = '\
  #aura-widget-btn {\
    position: fixed;\
    bottom: 24px;\
    right: 24px;\
    width: 56px;\
    height: 56px;\
    border-radius: 50%;\
    background: ' + cfg.primaryColor + ';\
    color: #fff;\
    border: none;\
    cursor: pointer;\
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);\
    display: flex;\
    align-items: center;\
    justify-content: center;\
    z-index: 99998;\
    transition: transform 0.2s, box-shadow 0.2s;\
  }\
  #aura-widget-btn:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.24); }\
  #aura-widget-btn svg { width: 26px; height: 26px; }\
  #aura-widget-panel {\
    position: fixed;\
    bottom: 92px;\
    right: 24px;\
    width: 360px;\
    max-width: calc(100vw - 32px);\
    height: 560px;\
    max-height: calc(100vh - 116px);\
    background: #fff;\
    border-radius: 16px;\
    box-shadow: 0 8px 40px rgba(0,0,0,0.18);\
    display: flex;\
    flex-direction: column;\
    overflow: hidden;\
    z-index: 99999;\
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;\
    font-size: 14px;\
    transition: opacity 0.2s, transform 0.2s;\
  }\
  #aura-widget-panel.aura-hidden { opacity: 0; transform: translateY(12px) scale(0.97); pointer-events: none; }\
  .aura-header {\
    background: ' + cfg.primaryColor + ';\
    color: #fff;\
    padding: 14px 16px;\
    font-weight: 600;\
    font-size: 15px;\
    display: flex;\
    align-items: center;\
    justify-content: space-between;\
    flex-shrink: 0;\
  }\
  .aura-header-title { display: flex; align-items: center; gap: 8px; }\
  .aura-header-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; }\
  .aura-close-btn {\
    background: none;\
    border: none;\
    color: rgba(255,255,255,0.8);\
    cursor: pointer;\
    padding: 2px;\
    display: flex;\
    align-items: center;\
    border-radius: 4px;\
  }\
  .aura-close-btn:hover { color: #fff; background: rgba(255,255,255,0.15); }\
  .aura-messages {\
    flex: 1;\
    overflow-y: auto;\
    padding: 16px;\
    display: flex;\
    flex-direction: column;\
    gap: 12px;\
    scroll-behavior: smooth;\
  }\
  .aura-msg-row { display: flex; flex-direction: column; gap: 4px; }\
  .aura-msg-row.aura-user { align-items: flex-end; }\
  .aura-msg-row.aura-assistant { align-items: flex-start; }\
  .aura-bubble {\
    max-width: 80%;\
    padding: 10px 14px;\
    border-radius: 14px;\
    line-height: 1.45;\
    white-space: pre-wrap;\
    word-break: break-word;\
  }\
  .aura-msg-row.aura-user .aura-bubble {\
    background: ' + cfg.primaryColor + ';\
    color: #fff;\
    border-bottom-right-radius: 4px;\
  }\
  .aura-msg-row.aura-assistant .aura-bubble {\
    background: #f3f4f6;\
    color: #111;\
    border-bottom-left-radius: 4px;\
  }\
  .aura-img-preview {\
    max-width: 80%;\
    border-radius: 10px;\
    overflow: hidden;\
    align-self: flex-end;\
  }\
  .aura-img-preview img { display: block; max-width: 100%; max-height: 160px; object-fit: cover; }\
  .aura-products {\
    display: flex;\
    gap: 10px;\
    overflow-x: auto;\
    padding: 4px 0 8px;\
    scrollbar-width: thin;\
    max-width: 100%;\
  }\
  .aura-products::-webkit-scrollbar { height: 4px; }\
  .aura-products::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }\
  .aura-card {\
    flex-shrink: 0;\
    width: 140px;\
    border: 1px solid #e5e7eb;\
    border-radius: 10px;\
    overflow: hidden;\
    cursor: pointer;\
    transition: box-shadow 0.15s;\
    text-decoration: none;\
    color: inherit;\
    display: flex;\
    flex-direction: column;\
    background: #fff;\
  }\
  .aura-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }\
  .aura-card-img {\
    width: 100%;\
    height: 110px;\
    object-fit: cover;\
    background: #f3f4f6;\
    display: block;\
  }\
  .aura-card-img-placeholder {\
    width: 100%;\
    height: 110px;\
    background: #f3f4f6;\
    display: flex;\
    align-items: center;\
    justify-content: center;\
    color: #9ca3af;\
    font-size: 24px;\
  }\
  .aura-card-body { padding: 8px; flex: 1; display: flex; flex-direction: column; gap: 4px; }\
  .aura-card-name { font-size: 12px; font-weight: 500; line-height: 1.3; color: #111; }\
  .aura-card-price { font-size: 12px; color: #6b7280; }\
  .aura-card-price-sale { color: #ef4444; font-weight: 600; }\
  .aura-card-price-original { text-decoration: line-through; color: #9ca3af; }\
  .aura-card-atc {\
    margin-top: auto;\
    background: ' + cfg.primaryColor + ';\
    color: #fff;\
    border: none;\
    border-radius: 6px;\
    padding: 5px 8px;\
    font-size: 11px;\
    font-weight: 500;\
    cursor: pointer;\
    text-align: center;\
    transition: opacity 0.15s;\
  }\
  .aura-card-atc:hover { opacity: 0.85; }\
  .aura-card-atc:disabled { opacity: 0.5; cursor: not-allowed; }\
  .aura-card-oos { opacity: 0.85; }\
  .aura-card-soldout {\
    margin-top: auto;\
    background: #f3f4f6;\
    color: #6b7280;\
    border-radius: 6px;\
    padding: 5px 8px;\
    font-size: 11px;\
    font-weight: 500;\
    text-align: center;\
  }\
  .aura-typing {\
    display: flex;\
    gap: 4px;\
    align-items: center;\
    padding: 10px 14px;\
    background: #f3f4f6;\
    border-radius: 14px;\
    border-bottom-left-radius: 4px;\
    width: fit-content;\
  }\
  .aura-dot {\
    width: 6px;\
    height: 6px;\
    border-radius: 50%;\
    background: #9ca3af;\
    animation: aura-bounce 1.2s infinite;\
  }\
  .aura-dot:nth-child(2) { animation-delay: 0.2s; }\
  .aura-dot:nth-child(3) { animation-delay: 0.4s; }\
  @keyframes aura-bounce {\
    0%, 60%, 100% { transform: translateY(0); }\
    30% { transform: translateY(-5px); }\
  }\
  .aura-img-bar {\
    padding: 8px 12px;\
    background: #fafafa;\
    border-top: 1px solid #f0f0f0;\
    display: flex;\
    align-items: center;\
    gap: 8px;\
    flex-shrink: 0;\
  }\
  .aura-img-bar img { height: 40px; width: 40px; object-fit: cover; border-radius: 6px; }\
  .aura-img-bar span { font-size: 12px; color: #6b7280; flex: 1; }\
  .aura-img-bar button { background: none; border: none; cursor: pointer; color: #9ca3af; font-size: 16px; }\
  .aura-img-bar button:hover { color: #ef4444; }\
  .aura-footer {\
    padding: 10px 12px;\
    border-top: 1px solid #f0f0f0;\
    display: flex;\
    gap: 8px;\
    align-items: flex-end;\
    flex-shrink: 0;\
    background: #fff;\
  }\
  .aura-input {\
    flex: 1;\
    border: 1px solid #e5e7eb;\
    border-radius: 10px;\
    padding: 9px 12px;\
    font-size: 14px;\
    resize: none;\
    outline: none;\
    max-height: 100px;\
    overflow-y: auto;\
    font-family: inherit;\
    line-height: 1.4;\
    color: #111;\
    background: #fff;\
  }\
  .aura-input:focus { border-color: ' + cfg.primaryColor + '; }\
  .aura-attach-btn {\
    background: none;\
    border: 1px solid #e5e7eb;\
    border-radius: 8px;\
    padding: 8px;\
    cursor: pointer;\
    color: #6b7280;\
    display: flex;\
    align-items: center;\
    transition: background 0.15s;\
  }\
  .aura-attach-btn:hover { background: #f3f4f6; }\
  .aura-send-btn {\
    background: ' + cfg.primaryColor + ';\
    border: none;\
    border-radius: 8px;\
    padding: 9px 14px;\
    cursor: pointer;\
    color: #fff;\
    display: flex;\
    align-items: center;\
    transition: opacity 0.15s;\
  }\
  .aura-send-btn:hover { opacity: 0.85; }\
  .aura-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }\
  .aura-empty {\
    flex: 1;\
    display: flex;\
    flex-direction: column;\
    align-items: center;\
    justify-content: center;\
    gap: 8px;\
    color: #9ca3af;\
    text-align: center;\
    padding: 24px;\
  }\
  .aura-empty-icon { font-size: 32px; }\
  .aura-empty-title { font-weight: 600; color: #374151; font-size: 15px; }\
  .aura-empty-sub { font-size: 13px; line-height: 1.5; }\
  @media (max-width: 420px) {\
    #aura-widget-panel { right: 8px; bottom: 80px; width: calc(100vw - 16px); }\
    #aura-widget-btn { right: 16px; bottom: 16px; }\
  }\
  '

  var styleEl = document.createElement('style')
  styleEl.textContent = css
  document.head.appendChild(styleEl)

  // ─── HTML ────────────────────────────────────────────────────────────────────

  var widgetHtml = '\
  <button id="aura-widget-btn" aria-label="Open AI Shopping Assistant">\
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">\
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>\
    </svg>\
  </button>\
  <div id="aura-widget-panel" class="aura-hidden" role="dialog" aria-label="AI Shopping Assistant">\
    <div class="aura-header">\
      <div class="aura-header-title">\
        <div class="aura-header-dot"></div>\
        <span>' + cfg.assistantName + ' Stylist</span>\
      </div>\
      <button class="aura-close-btn" id="aura-close-btn" aria-label="Close">\
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">\
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>\
        </svg>\
      </button>\
    </div>\
    <div class="aura-messages" id="aura-messages"></div>\
    <div id="aura-img-bar" class="aura-img-bar" style="display:none"></div>\
    <div class="aura-footer">\
      <input type="file" id="aura-file-input" accept="image/*" style="display:none">\
      <button class="aura-attach-btn" id="aura-attach-btn" title="Attach image">\
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>\
        </svg>\
      </button>\
      <textarea class="aura-input" id="aura-input" placeholder="Ask me anything about style..." rows="1" aria-label="Chat input"></textarea>\
      <button class="aura-send-btn" id="aura-send-btn" aria-label="Send">\
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>\
        </svg>\
      </button>\
    </div>\
  </div>\
  '

  var container = document.createElement('div')
  container.innerHTML = widgetHtml
  document.body.appendChild(container)

  // ─── DOM refs ─────────────────────────────────────────────────────────────────

  var panel      = document.getElementById('aura-widget-panel')
  var toggleBtn  = document.getElementById('aura-widget-btn')
  var closeBtn   = document.getElementById('aura-close-btn')
  var messagesEl = document.getElementById('aura-messages')
  var inputEl    = document.getElementById('aura-input')
  var sendBtn    = document.getElementById('aura-send-btn')
  var attachBtn  = document.getElementById('aura-attach-btn')
  var fileInput  = document.getElementById('aura-file-input')
  var imgBar     = document.getElementById('aura-img-bar')

  // ─── Panel toggle ─────────────────────────────────────────────────────────────

  function openPanel() {
    state.open = true
    panel.classList.remove('aura-hidden')
    toggleBtn.setAttribute('aria-expanded', 'true')
    if (state.messages.length === 0) renderEmpty()
    inputEl.focus()
  }

  function closePanel() {
    state.open = false
    panel.classList.add('aura-hidden')
    toggleBtn.setAttribute('aria-expanded', 'false')
  }

  toggleBtn.addEventListener('click', function () { state.open ? closePanel() : openPanel() })
  closeBtn.addEventListener('click', closePanel)

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.open) closePanel()
  })

  // ─── Image attachment ─────────────────────────────────────────────────────────

  attachBtn.addEventListener('click', function () { fileInput.click() })

  fileInput.addEventListener('change', function () {
    var file = fileInput.files && fileInput.files[0]
    if (!file) return
    var reader = new FileReader()
    reader.onload = function (e) {
      var dataUrl = e.target.result
      var base64 = dataUrl.split(',')[1]
      state.pendingImage = { base64: base64, mediaType: file.type, previewUrl: dataUrl }
      renderImgBar()
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
    imgBar.innerHTML = '\
      <img src="' + state.pendingImage.previewUrl + '" alt="preview">\
      <span>Image attached</span>\
      <button id="aura-remove-img" title="Remove image">&#x2715;</button>\
    '
    document.getElementById('aura-remove-img').addEventListener('click', function () {
      state.pendingImage = null
      renderImgBar()
    })
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────

  function renderEmpty() {
    messagesEl.innerHTML = '\
      <div class="aura-empty">\
        <div class="aura-empty-icon">&#128256;</div>\
        <div class="aura-empty-title">Your personal stylist</div>\
        <div class="aura-empty-sub">Tell me what you\'re looking for and I\'ll find the perfect match — or share a photo for personalised advice.</div>\
      </div>\
    '
  }

  function clearEmpty() {
    var empty = messagesEl.querySelector('.aura-empty')
    if (empty) empty.remove()
  }

  function appendMessage(role, content, products, imagePreviewUrl) {
    clearEmpty()
    var row = document.createElement('div')
    row.className = 'aura-msg-row ' + role

    if (imagePreviewUrl && role === 'user') {
      var imgDiv = document.createElement('div')
      imgDiv.className = 'aura-img-preview'
      imgDiv.innerHTML = '<img src="' + imagePreviewUrl + '" alt="uploaded">'
      row.appendChild(imgDiv)
    }

    if (content) {
      var bubble = document.createElement('div')
      bubble.className = 'aura-bubble'
      bubble.textContent = content
      row.appendChild(bubble)
    }

    if (products && products.length > 0) {
      var productScroll = document.createElement('div')
      productScroll.className = 'aura-products'
      products.forEach(function (p) {
        productScroll.appendChild(buildProductCard(p))
      })
      row.appendChild(productScroll)
    }

    messagesEl.appendChild(row)
    scrollToBottom()
  }

  function appendTypingIndicator() {
    var row = document.createElement('div')
    row.className = 'aura-msg-row aura-assistant'
    row.id = 'aura-typing-row'
    row.innerHTML = '<div class="aura-typing"><div class="aura-dot"></div><div class="aura-dot"></div><div class="aura-dot"></div></div>'
    clearEmpty()
    messagesEl.appendChild(row)
    scrollToBottom()
  }

  function removeTypingIndicator() {
    var row = document.getElementById('aura-typing-row')
    if (row) row.remove()
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  // ─── Product card builder ─────────────────────────────────────────────────────

  function buildProductCard(product) {
    var handle = product.handle || product.slug || ''
    var href   = handle ? '/products/' + handle : '#'
    var outOfStock = product.inStock === false

    var priceHtml
    if (product.salePrice != null) {
      priceHtml = '<span class="aura-card-price-sale">$' + product.salePrice.toFixed(2) + '</span> '
               + '<span class="aura-card-price-original">$' + product.price.toFixed(2) + '</span>'
    } else {
      priceHtml = '$' + (product.price || 0).toFixed(2)
    }

    var imgHtml = product.images && product.images[0]
      ? '<img class="aura-card-img" src="' + product.images[0] + '" alt="' + escHtml(product.name) + '" loading="lazy"' + (outOfStock ? ' style="opacity:0.6"' : '') + '>'
      : '<div class="aura-card-img-placeholder">&#128248;</div>'

    var actionHtml = outOfStock
      ? '<div class="aura-card-soldout">Sold Out</div>'
      : (product.variantId
          ? '<button class="aura-card-atc" data-variant-id="' + escHtml(product.variantId) + '">Add to cart</button>'
          : '')

    var card = document.createElement('a')
    card.className = 'aura-card' + (outOfStock ? ' aura-card-oos' : '')
    card.href = href
    card.innerHTML = '\
      ' + imgHtml + '\
      <div class="aura-card-body">\
        <div class="aura-card-name">' + escHtml(product.name) + '</div>\
        <div class="aura-card-price">' + priceHtml + '</div>\
        ' + actionHtml + '\
      </div>\
    '

    var atcBtn = card.querySelector('.aura-card-atc')
    if (atcBtn) {
      atcBtn.addEventListener('click', function (e) {
        e.preventDefault()
        e.stopPropagation()
        addToCart(product.variantId, atcBtn)
      })
    }

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
        // Trigger Shopify cart drawer refresh if the theme supports the event
        document.dispatchEvent(new CustomEvent('cart:refresh'))
        window.dispatchEvent(new CustomEvent('aura:cart:updated'))
        setTimeout(function () { btn.textContent = 'Add to cart'; btn.disabled = false }, 2000)
      })
      .catch(function () {
        btn.textContent = 'Add to cart'
        btn.disabled = false
      })
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ─── Send message ─────────────────────────────────────────────────────────────

  function sendMessage() {
    var text = inputEl.value.trim()
    if ((!text && !state.pendingImage) || state.loading) return

    var image     = state.pendingImage ? state.pendingImage.base64    : undefined
    var mediaType = state.pendingImage ? state.pendingImage.mediaType : undefined
    var preview   = state.pendingImage ? state.pendingImage.previewUrl : undefined

    inputEl.value = ''
    inputEl.style.height = 'auto'
    state.pendingImage = null
    renderImgBar()

    state.history.push({ role: 'user', content: text || '(image)' })
    appendMessage('user', text || null, null, preview)

    state.loading = true
    sendBtn.disabled = true
    appendTypingIndicator()

    var body = {
      message:    text || 'Please analyse this image and recommend products.',
      history:    state.history.slice(-6),
      shopDomain: cfg.shopDomain,
    }
    if (image) {
      body.image     = image
      body.mediaType = mediaType
    }

    fetch(cfg.apiUrl + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Request failed: ' + r.status)
        return r.json()
      })
      .then(function (data) {
        removeTypingIndicator()
        state.history.push({ role: 'assistant', content: data.message })
        appendMessage('assistant', data.message, data.products)
      })
      .catch(function (err) {
        removeTypingIndicator()
        console.error('[AURA Chat]', err)
        appendMessage('assistant', "Sorry, I couldn't reach the server. Please try again shortly.")
      })
      .finally(function () {
        state.loading = false
        sendBtn.disabled = false
        inputEl.focus()
      })
  }

  sendBtn.addEventListener('click', sendMessage)

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  })

  // Auto-grow textarea
  inputEl.addEventListener('input', function () {
    this.style.height = 'auto'
    this.style.height = Math.min(this.scrollHeight, 100) + 'px'
  })

})()
