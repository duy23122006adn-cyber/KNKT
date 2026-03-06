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
btnNext.addEventListener('touchend', function (e) {
  e.preventDefault();
  goPage2();
});

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
  imgExt      : '.webp',
  minDist     : IS_MOBILE ? 55  : 90,
  poolSize    : IS_MOBILE ? 6   : 10,
  imgW        : IS_MOBILE ? 110 : 210,
  imgH        : IS_MOBILE ? 83  : 158,
  totalFrames : IS_MOBILE ? 36  : 65,
  fpsCap      : IS_MOBILE ? 30  : 60,
  prewarmN    : IS_MOBILE ? 8   : 15,
  lookAheadN  : 5
};

/* ═══════════════════════════════════════════
   IMAGE CACHE — lazy + sequential
   _cache[i]: undefined = chưa load
              null      = đang load
              false     = lỗi
              Image     = đã load xong
═══════════════════════════════════════════ */
var _cache = new Array(CFG.totalImages);

function loadImg(idx) {
  if (_cache[idx] !== undefined) return;
  _cache[idx] = null;
  var im = new Image();
  im.onload  = function () { _cache[idx] = im; };
  im.onerror = function () { _cache[idx] = false; };
  im.src = CFG.imgDir + 'img' + (idx + 1) + CFG.imgExt;
}

function prewarm() {
  for (var i = 0; i < CFG.prewarmN; i++) loadImg(i);
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
  return { img: null, x: 0, y: 0, rot: 0, age: 0, maxAge: 0, alive: false };
}

function Pool(size) {
  this.slots  = [];
  this.head   = 0;   // con trỏ ghi (vòng tròn)
  this.count  = 0;   // số slot đang alive
  for (var i = 0; i < size; i++) this.slots.push(makeSlot());
}

/* Trả về true nếu spawn thành công, false nếu pool đầy */
Pool.prototype.spawn = function (img, x, y, rot, maxAge) {
  if (this.count >= this.slots.length) return false; // HARD CAP
  var p    = this.slots[this.head];
  this.head = (this.head + 1) % this.slots.length;
  p.img    = img;
  p.x      = x;   p.y   = y;
  p.rot    = rot;  p.age = 0;
  p.maxAge = maxAge;
  p.alive  = true;
  this.count++;
  return true;
};

Pool.prototype.anyAlive = function () {
  return this.count > 0;
};

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
  // Không start loop ngay — chờ tương tác đầu tiên
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

/* Gọi mỗi khi có tương tác */
CanvasTrail.prototype.wakeUp = function () {
  this.isIdle = false;
  clearTimeout(this.idleTimer);

  // Khởi động RAF nếu đang dừng
  if (!this.rafId) {
    var self = this;
    this.rafId = requestAnimationFrame(function loop(ts) {
      // Điều kiện dừng: idle + pool rỗng
      if (self.isIdle && !self.pool.anyAlive()) {
        cancelAnimationFrame(self.rafId);
        self.rafId = null;
        // Xoá canvas lần cuối
        self.ctx.clearRect(0, 0,
          self.canvas.width / self.dpr,
          self.canvas.height / self.dpr);
        return;
      }
      self.rafId = requestAnimationFrame(loop);

      // FPS throttle
      if (ts - self.lastTime < self.interval) return;
      self.lastTime = ts;

      self._tick();
    });
  }

  // Đặt timer idle: 1.5s sau lần tương tác cuối
  var self = this;
  this.idleTimer = setTimeout(function () {
    self.isIdle = true;
  }, 1500);
};

CanvasTrail.prototype._dist = function (a, b) {
  var dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

CanvasTrail.prototype._spawn = function (x, y) {
  // Tìm ảnh đã load, bỏ qua ảnh lỗi/chưa load
  var tries = 0, img = null, idx;
  while (tries < CFG.totalImages) {
    idx = this.nextImg % CFG.totalImages;
    this.nextImg++;
    tries++;
    loadImg(idx);
    lookAhead(idx);
    var c = _cache[idx];
    if (c && c !== null && c !== false) { img = c; break; }
  }
  if (!img) return;

  var rot = (Math.random() - 0.5) * 24 * Math.PI / 180;
  this.pool.spawn(img, x, y, rot, CFG.totalFrames);
  // spawn trả về false (pool đầy) thì bỏ qua — không làm gì thêm
};

CanvasTrail.prototype._tick = function () {
  var ctx = this.ctx;
  var W   = this.canvas.width  / this.dpr;
  var H   = this.canvas.height / this.dpr;

  // Spawn nếu di chuyển đủ xa
  if (this._dist(this.pos, this.lastSpawn) >= CFG.minDist) {
    this._spawn(this.pos.x, this.pos.y);
    this.lastSpawn.x = this.pos.x;
    this.lastSpawn.y = this.pos.y;
  }

  ctx.clearRect(0, 0, W, H);

  // Render — loop trực tiếp trên mảng cố định, không tạo array mới
  var slots = this.pool.slots;
  for (var i = 0; i < slots.length; i++) {
    var p = slots[i];
    if (!p.alive) continue;

    p.age++;
    var t = p.age / p.maxAge;

    // Alpha: ease-in 30% → hold → ease-out 40%
    var alpha;
    if      (t < 0.30) { alpha = t / 0.30; }
    else if (t < 0.60) { alpha = 1.0; }
    else               { alpha = 1.0 - (t - 0.60) / 0.40; }
    alpha *= 0.92;

    // Scale: 0.6 → 1.0 → 0.85
    var sc;
    if      (t < 0.30) { sc = 0.6 + (t / 0.30) * 0.4; }
    else if (t < 0.60) { sc = 1.0; }
    else               { sc = 1.0 - (t - 0.60) / 0.40 * 0.15; }

    if (p.age >= p.maxAge) {
      p.alive = false;
      p.img   = null; // release image ref
      this.pool.count--;
      continue;
    }

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

  prewarm();
  document.body.classList.remove('loading');

  var page2 = document.getElementById('page2');
  var pos   = { x: -9999, y: -9999 }; // ngoài màn hình → không spawn ngay

  // Throttle helper: cập nhật pos tối đa 1 lần / RAF frame
  var pendingX = 0, pendingY = 0, pending = false;
  function scheduleUpdate(x, y) {
    pendingX = x; pendingY = y;
    if (!pending) {
      pending = true;
      requestAnimationFrame(function () {
        pos.x = pendingX; pos.y = pendingY;
        pending = false;
      });
    }
  }

  var trail; // khai báo trước để wakeUp có thể gọi

  // Mouse (desktop)
  if (!IS_TOUCH) {
    window.addEventListener('mousemove', function (ev) {
      scheduleUpdate(ev.clientX, ev.clientY);
      if (trail) trail.wakeUp();
    }, { passive: true });
  }

  // Touch (mobile / tablet)
  page2.addEventListener('touchmove', function (ev) {
    ev.preventDefault();
    var t = ev.touches[0];
    scheduleUpdate(t.clientX, t.clientY);
    if (trail) trail.wakeUp();
  }, { passive: false });

  page2.addEventListener('touchstart', function (ev) {
    var t = ev.touches[0];
    scheduleUpdate(t.clientX, t.clientY);
    if (trail) trail.wakeUp();
  }, { passive: true });

  // Canvas
  var canvas = document.createElement('canvas');
  canvas.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'pointer-events:none', 'z-index:20',
    'will-change:transform',
    'transform:translateZ(0)'
  ].join(';');
  page2.appendChild(canvas);

  trail = new CanvasTrail(canvas, pos);

  // Cursor chỉ trên desktop
  if (!IS_TOUCH) {
    var cursorEl = document.querySelector('.cursor');
    if (cursorEl) new Cursor(cursorEl, pos);
  }
}
