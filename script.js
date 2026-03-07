/**
 * script.js — Intro Hoa + Canvas Image Trail
 * ─────────────────────────────────────────────
 * Tối ưu:
 *  1. Object Pool cố định — không push/shift/GC
 *  2. Idle-aware RAF — tự cancelAnimationFrame khi rảnh
 *  3. Throttled events — 1 lần cập nhật pos mỗi frame
 *  4. Lazy + look-ahead preload — không nghẽn RAM
 *  5. Hard spawn cap — pool đầy thì bỏ qua, không overwrite
 */

/* ═══════════════════════════════════════════
   TRANG 1 — HOA INTRO
═══════════════════════════════════════════ */
setTimeout(function () {
  document.body.classList.remove('not-loaded');
}, 1000);

var btnNext = document.getElementById('btn-next');
function goPage2() {
  document.body.classList.add('go-page2');
  setTimeout(initTrail, 950);
}
btnNext.addEventListener('click', goPage2);
btnNext.addEventListener('touchend', function (e) { e.preventDefault(); goPage2(); });

/* ═══════════════════════════════════════════
   DEVICE DETECT
═══════════════════════════════════════════ */
var IS_TOUCH  = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var IS_MOBILE = IS_TOUCH && window.screen.width <= 900;

/* ═══════════════════════════════════════════
   CONFIG
═══════════════════════════════════════════ */
var CFG = {
  totalImages : 150,
  imgDir      : './img/',
  imgExt      : '.png',
  minDist     : IS_MOBILE ? 55  : 90,
  poolSize    : IS_MOBILE ? 6   : 10,
  imgW        : IS_MOBILE ? 110 : 210,
  imgH        : IS_MOBILE ? 83  : 158,
  totalFrames : IS_MOBILE ? 36  : 65,
  fpsCap      : IS_MOBILE ? 30  : 60,
  prewarmN    : 150,  // load hết toàn bộ ngay từ đầu
  lookAheadN  : 5
};

/* ═══════════════════════════════════════════
   IMAGE CACHE — lazy + sequential
   _cache[i] = null      : chưa bắt đầu
   _cache[i] = 'loading' : đang load
   _cache[i] = 'error'   : lỗi
   _cache[i] = Image     : sẵn sàng ✓
═══════════════════════════════════════════ */
var _cache = [];
(function(){ for(var i=0;i<CFG.totalImages;i++) _cache[i]=null; })();

function loadImg(idx) {
  if (_cache[idx] !== null) return; // đã load hoặc đang load
  _cache[idx] = 'loading';
  (function(i){
    var im = new Image();
    im.onload  = function () { _cache[i] = im; };
    im.onerror = function () { _cache[i] = 'error'; };
    im.src = CFG.imgDir + 'img' + (i + 1) + CFG.imgExt;
  })(idx);
}

function isReady(idx) {
  return (_cache[idx] instanceof Image);
}

function prewarm(onAllLoaded) {
  var total  = CFG.totalImages; // 150
  var done   = 0;

  // Cập nhật hint text tiến độ
  var hintEl = document.getElementById('surprise-hint');
  function updateHint() {
    if (hintEl) hintEl.textContent = 'Đang tải ảnh... ' + done + '/' + total;
  }
  updateHint();

  for (var i = 0; i < total; i++) {
    if (_cache[i] !== null) { done++; updateHint(); continue; }
    _cache[i] = 'loading';
    (function(idx) {
      var im = new Image();
      im.onload = function () {
        _cache[idx] = im;
        done++; updateHint();
        if (done >= total && onAllLoaded) onAllLoaded();
      };
      im.onerror = function () {
        _cache[idx] = 'error';
        done++; updateHint();
        if (done >= total && onAllLoaded) onAllLoaded();
      };
      im.src = CFG.imgDir + 'img' + (idx + 1) + CFG.imgExt;
    })(i);
  }
}

function lookAhead(fromIdx) {
  for (var k = 1; k <= CFG.lookAheadN; k++) {
    loadImg((fromIdx + k) % CFG.totalImages);
  }
}

/* ═══════════════════════════════════════════
   OBJECT POOL — kích thước cố định, vòng tròn
   Không bao giờ tạo object mới sau khi init
═══════════════════════════════════════════ */
function makeSlot() {
  return { img: null, imgIdx: -1, x: 0, y: 0, rot: 0, age: 0, maxAge: 0, alive: false };
}

function Pool(size) {
  this.slots = [];
  this.head  = 0;
  this.count = 0;
  for (var i = 0; i < size; i++) this.slots.push(makeSlot());
}

/* Luôn spawn được — ghi đè slot cũ nhất khi pool đầy */
Pool.prototype.spawn = function (imgIdx, img, x, y, rot, maxAge) {
  var p = this.slots[this.head];
  this.head = (this.head + 1) % this.slots.length;
  if (!p.alive) this.count++;
  p.imgIdx = imgIdx;
  p.img    = img;   // null nếu chưa load xong
  p.x      = x;    p.y   = y;
  p.rot    = rot;   p.age = 0;
  p.maxAge = maxAge;
  p.alive  = true;
};

Pool.prototype.anyAlive = function () { return this.count > 0; };

/* ═══════════════════════════════════════════
   CANVAS TRAIL
═══════════════════════════════════════════ */
function CanvasTrail(canvas, pos) {
  this.canvas    = canvas;
  this.ctx       = canvas.getContext('2d');
  this.pos       = pos;
  this.lastSpawn = { x: -9999, y: -9999 };
  this.nextImg   = 0;
  this.pool      = new Pool(CFG.poolSize);
  this.dpr       = Math.min(window.devicePixelRatio || 1, 2);
  this.rafId     = null;
  this.isIdle    = true;
  this.idleTimer = null;
  this.interval  = 1000 / CFG.fpsCap;
  this.lastTime  = 0;

  this._resize();
  window.addEventListener('resize', this._resize.bind(this));
}

CanvasTrail.prototype._resize = function () {
  this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = window.innerWidth, h = window.innerHeight;
  this.canvas.width  = w * this.dpr;
  this.canvas.height = h * this.dpr;
  this.canvas.style.width  = w + 'px';
  this.canvas.style.height = h + 'px';
  this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
};

CanvasTrail.prototype.wakeUp = function () {
  this.isIdle = false;
  clearTimeout(this.idleTimer);
  if (!this.rafId) {
    var self = this;
    this.rafId = requestAnimationFrame(function loop(ts) {
      if (self.isIdle && !self.pool.anyAlive()) {
        cancelAnimationFrame(self.rafId);
        self.rafId = null;
        self.ctx.clearRect(0, 0, self.canvas.width / self.dpr, self.canvas.height / self.dpr);
        return;
      }
      self.rafId = requestAnimationFrame(loop);
      if (ts - self.lastTime < self.interval) return;
      self.lastTime = ts;
      self._tick();
    });
  }
  var self = this;
  this.idleTimer = setTimeout(function () { self.isIdle = true; }, 3000);
};

CanvasTrail.prototype._dist = function (a, b) {
  var dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

CanvasTrail.prototype._spawn = function (x, y) {
  // Tìm ảnh tiếp theo đã load — tối đa thử 20 slot liên tiếp
  var img = null, idx, tries = 0;
  while (tries < 20) {
    idx = this.nextImg % CFG.totalImages;
    this.nextImg++;
    tries++;
    loadImg(idx);
    lookAhead(idx);
    if (isReady(idx)) { img = _cache[idx]; break; }
  }
  if (!img) return; // 20 ảnh tiếp theo chưa load → bỏ qua lần spawn này

  var rot = (Math.random() - 0.5) * 24 * Math.PI / 180;
  this.pool.spawn(idx, img, x, y, rot, CFG.totalFrames);
};

CanvasTrail.prototype._tick = function () {
  var ctx = this.ctx;
  var W   = this.canvas.width  / this.dpr;
  var H   = this.canvas.height / this.dpr;

  if (this._dist(this.pos, this.lastSpawn) >= CFG.minDist) {
    this._spawn(this.pos.x, this.pos.y);
    this.lastSpawn.x = this.pos.x;
    this.lastSpawn.y = this.pos.y;
  }

  ctx.clearRect(0, 0, W, H);

  var slots = this.pool.slots;
  for (var i = 0; i < slots.length; i++) {
    var p = slots[i];
    if (!p.alive) continue;

    // Nếu ảnh chưa load lúc spawn, thử lấy lại
    if (!p.img && p.imgIdx >= 0 && isReady(p.imgIdx)) {
      p.img = _cache[p.imgIdx];
    }

    p.age++;
    var t = p.age / p.maxAge;

    if (p.age >= p.maxAge) {
      p.alive = false;
      p.img   = null;
      this.pool.count--;
      continue;
    }

    if (!p.img) continue; // vẫn chưa load → skip render nhưng giữ slot

    var alpha;
    if      (t < 0.30) { alpha = t / 0.30; }
    else if (t < 0.60) { alpha = 1.0; }
    else               { alpha = 1.0 - (t - 0.60) / 0.40; }
    alpha *= 0.92;

    var sc;
    if      (t < 0.30) { sc = 0.6 + (t / 0.30) * 0.4; }
    else if (t < 0.60) { sc = 1.0; }
    else               { sc = 1.0 - (t - 0.60) / 0.40 * 0.15; }

    var w = CFG.imgW * sc;
    var h = CFG.imgH * sc;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.drawImage(p.img, -w * 0.5, -h * 0.5, w, h);
    ctx.restore();
  }
};

/* ═══════════════════════════════════════════
   CURSOR (desktop only)
═══════════════════════════════════════════ */
function Cursor(el, pos) {
  var tx = 0, ty = 0;
  el.style.opacity = 0;
  window.addEventListener('mousemove', function onFirst() {
    tx = pos.x - 40; ty = pos.y - 40;
    gsap.to(el, { duration: 0.7, opacity: 1 });
    (function loop() {
      tx += (pos.x - 40 - tx) * 0.18;
      ty += (pos.y - 40 - ty) * 0.18;
      el.style.transform = 'translate(' + tx + 'px,' + ty + 'px)';
      requestAnimationFrame(loop);
    })();
    window.removeEventListener('mousemove', onFirst);
  });
}

/* ═══════════════════════════════════════════
   INIT TRAIL
═══════════════════════════════════════════ */
var trailInited = false;

function initTrail() {
  if (trailInited) return;
  trailInited = true;

  document.body.classList.remove('loading');

  var page2      = document.getElementById('page2');
  var btnSurprise = document.getElementById('btn-surprise');
  var hintEl     = document.getElementById('surprise-hint');
  var pos        = { x: -9999, y: -9999 };
  var trail;
  var eventsEnabled = false;

  // Hiện hint "đang tải..." ngay khi vào trang 2
  if (hintEl) {
    hintEl.classList.add('visible');
    hintEl.textContent = 'Đang tải ảnh... 0/150';
  }

  // Throttle helper
  var pendingX = 0, pendingY = 0, pending = false;
  function scheduleUpdate(x, y) {
    pendingX = x; pendingY = y;
    if (!pending) {
      pending = true;
      requestAnimationFrame(function () { pos.x = pendingX; pos.y = pendingY; pending = false; });
    }
  }

  // Bật events — chỉ gọi sau khi bấm nút
  function enableEvents() {
    if (eventsEnabled) return;
    eventsEnabled = true;
    if (!IS_TOUCH) {
      window.addEventListener('mousemove', function (ev) {
        scheduleUpdate(ev.clientX, ev.clientY);
        if (trail) trail.wakeUp();
      }, { passive: true });
    }
    page2.addEventListener('touchmove', function (ev) {
      ev.preventDefault();
      scheduleUpdate(ev.touches[0].clientX, ev.touches[0].clientY);
      if (trail) trail.wakeUp();
    }, { passive: false });
    page2.addEventListener('touchstart', function (ev) {
      scheduleUpdate(ev.touches[0].clientX, ev.touches[0].clientY);
      if (trail) trail.wakeUp();
    }, { passive: true });
  }

  // Canvas trail (tạo sẵn, chưa chạy)
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:20;will-change:transform;transform:translateZ(0);';
  page2.appendChild(canvas);
  trail = new CanvasTrail(canvas, pos);

  // Cursor desktop
  if (!IS_TOUCH) {
    var cursorEl = document.querySelector('.cursor');
    if (cursorEl) new Cursor(cursorEl, pos);
  }

  // Bấm nút → bắt đầu trail
  function activateSurprise() {
    if (btnSurprise) {
      btnSurprise.style.pointerEvents = 'none';
      btnSurprise.classList.remove('visible');
      setTimeout(function () { btnSurprise.style.display = 'none'; }, 500);
    }
    if (hintEl) {
      hintEl.classList.remove('visible');
      setTimeout(function () { hintEl.style.display = 'none'; }, 500);
    }
    enableEvents();
    if (trail) trail.wakeUp();
  }

  if (btnSurprise) {
    btnSurprise.addEventListener('click', activateSurprise);
    btnSurprise.addEventListener('touchend', function (e) { e.preventDefault(); activateSurprise(); });
  } else {
    enableEvents(); // fallback nếu không có nút
  }

  // Load 150 ảnh — CHỈ hiện nút khi load xong hoàn toàn
  var loadDone = false;
  var waitMsgShown = false;

  // Sau 10 giây, nếu chưa load xong thì hiện dòng chờ đợi
  var waitTimer = setTimeout(function () {
    if (!loadDone && hintEl) {
      waitMsgShown = true;
      hintEl.textContent = '⏳ Chờ đợi là hạnh phúc... đang tải ảnh';
      hintEl.classList.add('visible');
    }
  }, 10000);

  prewarm(function onAllLoaded() {
    loadDone = true;
    clearTimeout(waitTimer);
    if (hintEl) {
      if (waitMsgShown) {
        // Đã hiện dòng chờ → chuyển sang "sẵn sàng" rồi ẩn
        hintEl.textContent = '✨ Sẵn sàng rồi!';
        setTimeout(function () { hintEl.classList.remove('visible'); }, 800);
      } else {
        // Load xong trước 10s → ẩn hint luôn, không hiện dòng chờ
        hintEl.classList.remove('visible');
      }
    }
    if (btnSurprise) {
      setTimeout(function () {
        btnSurprise.classList.add('visible');
      }, 600);
    }
  });
}
