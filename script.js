/**
 * script.js — Intro Hoa + Canvas Image Trail
 * Dùng Canvas cho CẢ desktop lẫn mobile — không DOM trail, không GSAP tween cho ảnh
 * Chỉ dùng GSAP cho intro hoa và chuyển trang
 */

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
var IS_TOUCH       = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var IS_MOBILE      = IS_TOUCH && window.innerWidth <= 900;

var MIN_DIST       = IS_MOBILE ? 60  : 100;
var MAX_PARTICLES  = IS_MOBILE ? 6   : 10;
var IMG_W          = IS_MOBILE ? 120 : 220;
var IMG_H          = IS_MOBILE ? 90  : 165;
var TOTAL_FRAMES   = IS_MOBILE ? 40  : 70;  // tuổi thọ mỗi ảnh (frames)
var FPS_CAP        = IS_MOBILE ? 30  : 60;

/* ══════════════════════════════════════════════════════
   IMAGE CACHE — lazy load theo yêu cầu
   Chỉ load ảnh khi cần dùng, không load hết 150 cái trước
   ══════════════════════════════════════════════════════ */
var cache = {};   // cache[idx] = { img, loaded }

function getImage(idx) {
  if (cache[idx]) return cache[idx];
  var entry = { img: null, loaded: false };
  cache[idx] = entry;
  var im = new Image();
  im.onload  = function () { entry.img = im; entry.loaded = true; };
  im.onerror = function () { entry.loaded = true; }; // skip
  im.src = IMG_DIR + 'img' + (idx + 1) + IMG_EXT;
  return entry;
}

/* Pre-warm: load 10 ảnh đầu ngay để sẵn sàng spawn nhanh */
function prewarm(n) {
  for (var i = 0; i < Math.min(n, TOTAL_IMAGES); i++) getImage(i);
}

/* ══════════════════════════════════════════════════════
   CANVAS TRAIL
   ══════════════════════════════════════════════════════ */
function CanvasTrail(canvas, pos) {
  this.canvas     = canvas;
  this.ctx        = canvas.getContext('2d');
  this.pos        = pos;
  this.lastPos    = { x: -9999, y: -9999 };
  this.nextIdx    = 0;
  this.particles  = [];
  this.dpr        = Math.min(window.devicePixelRatio || 1, 2);

  this._resize();
  window.addEventListener('resize', this._resize.bind(this));
  this._loop();
}

CanvasTrail.prototype._resize = function () {
  this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  var w = window.innerWidth;
  var h = window.innerHeight;
  this.canvas.width  = w * this.dpr;
  this.canvas.height = h * this.dpr;
  this.canvas.style.width  = w + 'px';
  this.canvas.style.height = h + 'px';
  // Reset scale sau resize
  this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
};

CanvasTrail.prototype._dist = function (a, b) {
  var dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

CanvasTrail.prototype._spawn = function (x, y) {
  // Lazy-load ảnh khi spawn
  var idx = this.nextIdx % TOTAL_IMAGES;
  this.nextIdx++;

  // Pre-load ảnh tiếp theo luôn (look-ahead 3)
  for (var k = 1; k <= 3; k++) getImage((idx + k) % TOTAL_IMAGES);

  var entry = getImage(idx);
  var rot   = (Math.random() - 0.5) * 24 * Math.PI / 180;

  this.particles.push({
    entry : entry,
    x     : x,
    y     : y,
    rot   : rot,
    age   : 0,
    maxAge: TOTAL_FRAMES
  });

  if (this.particles.length > MAX_PARTICLES) this.particles.shift();
};

CanvasTrail.prototype._loop = function () {
  var self      = this;
  var lastTime  = 0;
  var interval  = 1000 / FPS_CAP;

  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastTime < interval) return;
    lastTime = ts;

    /* Spawn nếu chuột/ngón tay di chuyển đủ */
    if (self._dist(self.pos, self.lastPos) >= MIN_DIST) {
      self._spawn(self.pos.x, self.pos.y);
      self.lastPos = { x: self.pos.x, y: self.pos.y };
    }

    /* Xoá canvas */
    var ctx = self.ctx;
    ctx.clearRect(0, 0,
      self.canvas.width  / self.dpr,
      self.canvas.height / self.dpr);

    /* Vẽ từng particle */
    self.particles = self.particles.filter(function (p) {
      p.age++;
      var t = p.age / p.maxAge;

      /* Alpha curve: ease-in 30% → hold → ease-out 40% */
      var alpha;
      if (t < 0.30) {
        alpha = (t / 0.30);                         // 0 → 1
      } else if (t < 0.60) {
        alpha = 1.0;                                // hold
      } else {
        alpha = 1.0 - (t - 0.60) / 0.40;           // 1 → 0
      }
      alpha *= 0.92;

      /* Scale curve: 0.6 → 1.0 → 0.85 */
      var scale;
      if (t < 0.30) {
        scale = 0.6 + (t / 0.30) * 0.4;
      } else if (t < 0.60) {
        scale = 1.0;
      } else {
        scale = 1.0 - (t - 0.60) / 0.40 * 0.15;
      }

      if (!p.entry.loaded || !p.entry.img) {
        /* Ảnh chưa load: vẽ placeholder mờ */
        ctx.save();
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle   = '#ffffff';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-IMG_W * scale / 2, -IMG_H * scale / 2,
                      IMG_W * scale,      IMG_H * scale);
        ctx.restore();
        return p.age < p.maxAge;
      }

      var w = IMG_W * scale;
      var h = IMG_H * scale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.drawImage(p.entry.img, -w / 2, -h / 2, w, h);
      ctx.restore();

      return p.age < p.maxAge;
    });
  }

  requestAnimationFrame(frame);
};

/* ══════════════════════════════════════════════════════
   CURSOR (desktop only — SVG circle theo chuột)
   ══════════════════════════════════════════════════════ */
function Cursor(el, pos) {
  this.el  = el;
  this.pos = pos;
  this.tx  = 0; this.ty = 0;
  el.style.opacity = 0;

  var self = this;
  window.addEventListener('mousemove', function onFirst() {
    self.tx = pos.x - 40; self.ty = pos.y - 40;
    gsap.to(el, { duration: 0.7, opacity: 1 });
    (function loop() {
      self.tx += (pos.x - 40 - self.tx) * 0.18;
      self.ty += (pos.y - 40 - self.ty) * 0.18;
      el.style.transform = 'translate(' + self.tx + 'px,' + self.ty + 'px)';
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

  /* Load sẵn 10 ảnh đầu ngay khi vào trang 2 */
  prewarm(10);

  var page2 = document.getElementById('page2');

  var pos = {
    x: window.innerWidth  / 2,
    y: window.innerHeight / 2
  };

  /* Mouse */
  window.addEventListener('mousemove', function (ev) {
    pos.x = ev.clientX; pos.y = ev.clientY;
  });

  /* Touch */
  page2.addEventListener('touchmove', function (ev) {
    ev.preventDefault();
    pos.x = ev.touches[0].clientX;
    pos.y = ev.touches[0].clientY;
  }, { passive: false });

  page2.addEventListener('touchstart', function (ev) {
    pos.x = ev.touches[0].clientX;
    pos.y = ev.touches[0].clientY;
  }, { passive: true });

  document.body.classList.remove('loading');

  /* Tạo canvas và gắn vào page2 */
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:20;';
  page2.appendChild(canvas);
  new CanvasTrail(canvas, pos);

  /* Cursor chỉ trên desktop */
  if (!IS_TOUCH) {
    var cursorEl = document.querySelector('.cursor');
    if (cursorEl) new Cursor(cursorEl, pos);
  }
}
