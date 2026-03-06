/**
 * script.js — Intro Hoa + Image Trail (Canvas-based)
 * Mobile: vẽ trực tiếp lên <canvas> — không DOM element, không GSAP tween
 * Desktop: giữ nguyên GSAP DOM trail
 */

/* ══════════════════════════════════════════════════════
   DETECT
   ══════════════════════════════════════════════════════ */
var IS_TOUCH  = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var IS_MOBILE = IS_TOUCH && window.innerWidth <= 900;

/* ══════════════════════════════════════════════════════
   TRANG 1 — INTRO HOA
   ══════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════
   CONFIG
   ══════════════════════════════════════════════════════ */
var TOTAL_IMAGES   = 150;
var IMG_DIR        = './img/';
var IMG_EXT        = '.webp';
var MIN_DIST_MOUSE = 120;
var MIN_DIST_TOUCH = 70;

/* Desktop GSAP config */
var MAX_VISIBLE  = 12;
var FADE_IN_DUR  = 1.0;
var HOLD_DUR     = 1.2;
var FADE_OUT_DUR = 1.5;

/* ══════════════════════════════════════════════════════
   IMAGE CACHE — dùng chung cho cả Canvas và GSAP
   ══════════════════════════════════════════════════════ */
var imgCache = new Array(TOTAL_IMAGES); // imgCache[i] = HTMLImageElement | null
var imgLoaded = new Array(TOTAL_IMAGES).fill(false);

function preloadAll() {
  for (var i = 0; i < TOTAL_IMAGES; i++) {
    (function (idx) {
      var im = new Image();
      im.onload = function () {
        imgCache[idx] = im;
        imgLoaded[idx] = true;
      };
      im.onerror = function () { imgLoaded[idx] = true; }; // skip broken
      im.src = IMG_DIR + 'img' + (idx + 1) + IMG_EXT;
    })(i);
  }
}

/* ══════════════════════════════════════════════════════
   CANVAS TRAIL — chỉ dùng trên mobile
   Mỗi "particle" là 1 object đơn giản, không DOM
   ══════════════════════════════════════════════════════ */
function CanvasTrail(canvas, pos) {
  this.canvas  = canvas;
  this.ctx     = canvas.getContext('2d');
  this.pos     = pos;
  this.lastPos = { x: -9999, y: -9999 };
  this.nextIdx = 0;
  this.particles = []; // { imgIdx, x, y, w, h, rot, alpha, scale, phase, age, maxAge }

  this._resize();
  window.addEventListener('resize', this._resize.bind(this));
  this._loop();
}

CanvasTrail.prototype._resize = function () {
  // devicePixelRatio để không bị mờ trên Retina
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  this.canvas.width  = window.innerWidth  * dpr;
  this.canvas.height = window.innerHeight * dpr;
  this.canvas.style.width  = window.innerWidth  + 'px';
  this.canvas.style.height = window.innerHeight + 'px';
  this.ctx.scale(dpr, dpr);
  this.dpr = dpr;
};

CanvasTrail.prototype._dist = function (a, b) {
  var dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

CanvasTrail.prototype._spawn = function (x, y) {
  // Tìm ảnh đã load
  var tries = 0, idx;
  do {
    idx = this.nextIdx % TOTAL_IMAGES;
    this.nextIdx++;
    tries++;
  } while (!imgLoaded[idx] && tries < TOTAL_IMAGES);
  if (!imgLoaded[idx] || !imgCache[idx]) return;

  var W = IS_MOBILE ? 130 : 200;
  var H = IS_MOBILE ? 100 : 155;
  var rot = (Math.random() - 0.5) * 24 * Math.PI / 180;
  var totalAge = 60; // frames: 20 in + 10 hold + 30 out (at 30fps ≈ 2s total)

  this.particles.push({
    imgIdx: idx,
    x: x, y: y,
    w: W, h: H,
    rot: rot,
    alpha: 0,
    scale: 0.6,
    age: 0,
    maxAge: totalAge
  });

  // Giới hạn số particle cùng lúc
  if (this.particles.length > 6) this.particles.shift();
};

CanvasTrail.prototype._loop = function () {
  var self = this;
  var lastTime = 0;
  var interval = 1000 / 30; // 30fps cap

  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastTime < interval) return;
    lastTime = ts;

    // Spawn
    if (self._dist(self.pos, self.lastPos) >= (self.pos.minDist || MIN_DIST_TOUCH)) {
      self._spawn(self.pos.x, self.pos.y);
      self.lastPos = { x: self.pos.x, y: self.pos.y };
    }

    // Draw
    var ctx = self.ctx;
    ctx.clearRect(0, 0, self.canvas.width / self.dpr, self.canvas.height / self.dpr);

    self.particles = self.particles.filter(function (p) {
      p.age++;
      var t = p.age / p.maxAge; // 0 → 1

      // Easing: fade in 0→0.33, hold 0.33→0.55, fade out 0.55→1
      if (t < 0.33) {
        p.alpha = t / 0.33 * 0.92;
        p.scale = 0.6 + (t / 0.33) * 0.4;
      } else if (t < 0.55) {
        p.alpha = 0.92;
        p.scale = 1.0;
      } else {
        var fadeT = (t - 0.55) / 0.45;
        p.alpha = 0.92 * (1 - fadeT);
        p.scale = 1.0 - fadeT * 0.2;
      }

      if (p.alpha <= 0) return false;

      var img = imgCache[p.imgIdx];
      if (!img) return false;

      var w = p.w * p.scale;
      var h = p.h * p.scale;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();

      return p.age < p.maxAge;
    });
  }

  requestAnimationFrame(frame);
};

/* ══════════════════════════════════════════════════════
   DOM TRAIL — chỉ dùng trên desktop (GSAP)
   ══════════════════════════════════════════════════════ */
function TrailImage(el, idx) {
  this.DOM    = { el: el, img: el.querySelector('.trail__img') };
  this._idx   = idx;
  this._tween = null;
}

TrailImage.prototype.show = function (x, y, rotate) {
  var self = this;
  if (this._tween) { this._tween.kill(); this._tween = null; }

  if (imgCache[this._idx]) {
    this.DOM.img.style.backgroundImage = 'url(' + imgCache[this._idx].src + ')';
  }

  gsap.set(this.DOM.el, {
    x: x, y: y, xPercent: -50, yPercent: -50,
    scale: 0.6, opacity: 0, rotation: rotate, zIndex: 10, force3D: true
  });

  this._tween = gsap.timeline({ onComplete: function () {} })
    .to(this.DOM.el, { duration: FADE_IN_DUR,  ease: 'power2.out', scale: 1,   opacity: 0.92, force3D: true })
    .to(this.DOM.el, { duration: FADE_OUT_DUR, ease: 'power1.in',  scale: 0.8, opacity: 0,    delay: HOLD_DUR, force3D: true });
};

TrailImage.prototype.hide = function () {
  if (this._tween) { this._tween.kill(); this._tween = null; }
  gsap.set(this.DOM.el, { opacity: 0 });
};

function DomTrail(container, pos) {
  this._pos     = pos;
  this._lastPos = { x: -9999, y: -9999 };
  this._nextIdx = 0;
  this._pool    = [];
  this._active  = [];

  // Tạo DOM pool
  var frag = document.createDocumentFragment();
  for (var i = 0; i < TOTAL_IMAGES; i++) {
    var outer = document.createElement('div');
    outer.className = 'trail__item';
    var inner = document.createElement('div');
    inner.className = 'trail__img';
    outer.appendChild(inner);
    frag.appendChild(outer);
    this._pool.push(new TrailImage(outer, i));
  }
  container.appendChild(frag);

  this._startLoop();
}

DomTrail.prototype._dist = function (a, b) {
  var dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

DomTrail.prototype._spawn = function (x, y) {
  if (this._active.length >= MAX_VISIBLE) this._active.shift().hide();

  var tries = 0, item;
  do {
    item = this._pool[this._nextIdx % TOTAL_IMAGES];
    this._nextIdx++;
    tries++;
  } while (!imgLoaded[item._idx] && tries < 20);

  if (!imgLoaded[item._idx]) return;
  item.show(x, y, (Math.random() - 0.5) * 24);
  this._active.push(item);
};

DomTrail.prototype._startLoop = function () {
  var self = this;
  (function loop() {
    requestAnimationFrame(loop);
    var minD = self._pos.minDist || MIN_DIST_MOUSE;
    if (self._dist(self._pos, self._lastPos) >= minD) {
      self._spawn(self._pos.x, self._pos.y);
      self._lastPos = { x: self._pos.x, y: self._pos.y };
    }
  })();
};

/* ══════════════════════════════════════════════════════
   CURSOR (desktop)
   ══════════════════════════════════════════════════════ */
function Cursor(el, pos) {
  this.DOM = { el: el };
  this._pos = pos;
  this._tx = { prev: 0, cur: 0 };
  this._ty = { prev: 0, cur: 0 };
  this.DOM.el.style.opacity = 0;
  var self = this;
  window.addEventListener('mousemove', function onFirst() {
    self._tx.prev = self._tx.cur = self._pos.x - 40;
    self._ty.prev = self._ty.cur = self._pos.y - 40;
    gsap.to(self.DOM.el, { duration: 0.9, ease: 'power3.out', opacity: 1 });
    (function loop() {
      self._tx.cur  = self._pos.x - 40;
      self._ty.cur  = self._pos.y - 40;
      self._tx.prev += (self._tx.cur - self._tx.prev) * 0.2;
      self._ty.prev += (self._ty.cur - self._ty.prev) * 0.2;
      self.DOM.el.style.transform = 'translateX('+self._tx.prev+'px) translateY('+self._ty.prev+'px)';
      requestAnimationFrame(loop);
    })();
    window.removeEventListener('mousemove', onFirst);
  });
}

/* ══════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════ */
var trailInited = false;

function initTrail() {
  if (trailInited) return;
  trailInited = true;

  // Bắt đầu preload ngay
  preloadAll();

  var pos = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    minDist: IS_MOBILE ? MIN_DIST_TOUCH : MIN_DIST_MOUSE
  };

  var page2 = document.getElementById('page2');

  /* Mouse */
  window.addEventListener('mousemove', function (ev) {
    pos.x = ev.clientX; pos.y = ev.clientY;
    pos.minDist = MIN_DIST_MOUSE;
  });

  /* Touch */
  page2.addEventListener('touchmove', function (ev) {
    ev.preventDefault();
    var t = ev.touches[0];
    pos.x = t.clientX; pos.y = t.clientY;
    pos.minDist = MIN_DIST_TOUCH;
  }, { passive: false });

  page2.addEventListener('touchstart', function (ev) {
    var t = ev.touches[0];
    pos.x = t.clientX; pos.y = t.clientY;
    pos.minDist = MIN_DIST_TOUCH;
  }, { passive: true });

  document.body.classList.remove('loading');

  if (IS_MOBILE) {
    /* ── MOBILE: Canvas trail ── */
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20;';
    page2.appendChild(canvas);
    new CanvasTrail(canvas, pos);

  } else {
    /* ── DESKTOP: DOM + GSAP trail ── */
    var container = document.getElementById('trailContainer');
    if (container) new DomTrail(container, pos);
    var cursorEl = document.querySelector('.cursor');
    if (cursorEl) new Cursor(cursorEl, pos);
  }
}
