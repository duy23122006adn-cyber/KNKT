/**
 * script.js — Intro Hoa + Canvas Image Trail
 * Fix: Canvas tự đọc EXIF orientation qua CSS image-orientation trick
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
var TOTAL_IMAGES  = 150;
var IMG_DIR       = './img/';
var IMG_EXT       = '.webp';

var IS_TOUCH      = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var IS_MOBILE     = IS_TOUCH && window.innerWidth <= 900;

var MIN_DIST      = IS_MOBILE ? 60  : 100;
var MAX_PARTICLES = IS_MOBILE ? 6   : 10;
var MAX_SIZE      = IS_MOBILE ? 120 : 220;
var TOTAL_FRAMES  = IS_MOBILE ? 40  : 70;
var FPS_CAP       = IS_MOBILE ? 30  : 60;

var FALLBACK_COLORS = [
  '#ff6b9d','#ff8fab','#ffb3c6','#ffc8dd','#ff85a1',
  '#ff6b6b','#ffa07a','#ff7f50','#ff69b4','#db7093',
  '#c71585','#ff1493','#ff4500','#ff6347','#ff8c00',
  '#e91e63','#f06292','#f48fb1','#f8bbd0','#ad1457'
];

/* ══════════════════════════════════════════════════════
   IMAGE CACHE
   Dùng trick: vẽ <img> qua canvas tạm để áp dụng EXIF orientation
   (CSS image-orientation: from-image được browser tự xử lý khi draw vào canvas)
   ══════════════════════════════════════════════════════ */
var cache = {};

/* Canvas tạm dùng để normalize EXIF orientation */
var _tmpCanvas = document.createElement('canvas');
var _tmpCtx    = _tmpCanvas.getContext('2d');

function normalizeImage(im, callback) {
  /* Vẽ ảnh qua <img> tag với CSS image-orientation: from-image
     Browser sẽ tự xoay đúng chiều, sau đó ta snapshot ra canvas */
  var wrapper = document.createElement('img');
  wrapper.style.cssText = 'position:absolute;visibility:hidden;image-orientation:from-image;';
  document.body.appendChild(wrapper);

  wrapper.onload = function () {
    /* Lấy kích thước sau khi browser áp EXIF (naturalWidth/Height đã đúng chiều) */
    var w = wrapper.naturalWidth;
    var h = wrapper.naturalHeight;
    _tmpCanvas.width  = w;
    _tmpCanvas.height = h;
    _tmpCtx.clearRect(0, 0, w, h);
    _tmpCtx.drawImage(wrapper, 0, 0, w, h);

    /* Tạo ImageBitmap từ canvas để dùng trong trail canvas */
    if (window.createImageBitmap) {
      createImageBitmap(_tmpCanvas).then(function (bmp) {
        document.body.removeChild(wrapper);
        callback(bmp, w, h);
      });
    } else {
      /* Fallback: dùng luôn wrapper img */
      document.body.removeChild(wrapper);
      callback(wrapper, w, h);
    }
  };

  wrapper.onerror = function () {
    document.body.removeChild(wrapper);
    callback(null, 0, 0);
  };

  wrapper.src = im.src;
}

function getImage(idx) {
  if (cache[idx]) return cache[idx];
  var entry = { img: null, loaded: false, w: 0, h: 0 };
  cache[idx] = entry;

  var im = new Image();
  im.crossOrigin = 'anonymous';
  im.onload = function () {
    normalizeImage(im, function (bmp, w, h) {
      entry.img    = bmp;
      entry.w      = w;
      entry.h      = h;
      entry.loaded = true;
    });
  };
  im.onerror = function () { entry.loaded = true; };
  im.src = IMG_DIR + 'img' + (idx + 1) + IMG_EXT;
  return entry;
}

function prewarm(n) {
  for (var i = 0; i < Math.min(n, TOTAL_IMAGES); i++) getImage(i);
}

/* ══════════════════════════════════════════════════════
   CANVAS TRAIL
   ══════════════════════════════════════════════════════ */
function CanvasTrail(canvas, pos) {
  this.canvas    = canvas;
  this.ctx       = canvas.getContext('2d');
  this.pos       = pos;
  this.lastPos   = { x: -9999, y: -9999 };
  this.nextIdx   = 0;
  this.particles = [];
  this.dpr       = Math.min(window.devicePixelRatio || 1, 2);

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
  this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
};

CanvasTrail.prototype._dist = function (a, b) {
  var dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

CanvasTrail.prototype._spawn = function (x, y) {
  var idx = this.nextIdx % TOTAL_IMAGES;
  this.nextIdx++;
  for (var k = 1; k <= 3; k++) getImage((idx + k) % TOTAL_IMAGES);

  var entry = getImage(idx);
  var rot   = (Math.random() - 0.5) * 24 * Math.PI / 180;
  var ci    = idx % FALLBACK_COLORS.length;

  this.particles.push({
    entry         : entry,
    x             : x,
    y             : y,
    rot           : rot,
    age           : 0,
    maxAge        : TOTAL_FRAMES,
    fallbackColor : FALLBACK_COLORS[ci],
    fallbackColor2: FALLBACK_COLORS[(ci + 10) % FALLBACK_COLORS.length]
  });

  if (this.particles.length > MAX_PARTICLES) this.particles.shift();
};

CanvasTrail.prototype._loop = function () {
  var self     = this;
  var lastTime = 0;
  var interval = 1000 / FPS_CAP;

  function frame(ts) {
    requestAnimationFrame(frame);
    if (ts - lastTime < interval) return;
    lastTime = ts;

    if (self._dist(self.pos, self.lastPos) >= MIN_DIST) {
      self._spawn(self.pos.x, self.pos.y);
      self.lastPos = { x: self.pos.x, y: self.pos.y };
    }

    var ctx = self.ctx;
    ctx.clearRect(0, 0,
      self.canvas.width  / self.dpr,
      self.canvas.height / self.dpr);

    self.particles = self.particles.filter(function (p) {
      p.age++;
      var t = p.age / p.maxAge;

      var alpha;
      if      (t < 0.30) { alpha = t / 0.30; }
      else if (t < 0.60) { alpha = 1.0; }
      else               { alpha = 1.0 - (t - 0.60) / 0.40; }
      alpha *= 0.92;

      var scale;
      if      (t < 0.30) { scale = 0.6 + (t / 0.30) * 0.4; }
      else if (t < 0.60) { scale = 1.0; }
      else               { scale = 1.0 - (t - 0.60) / 0.40 * 0.15; }

      if (!p.entry.loaded) return p.age < p.maxAge;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (!p.entry.img) {
        /* Fallback màu */
        var wf = MAX_SIZE * scale;
        var hf = MAX_SIZE * 0.75 * scale;
        var grad = ctx.createLinearGradient(-wf/2, -hf/2, wf/2, hf/2);
        grad.addColorStop(0, p.fallbackColor);
        grad.addColorStop(1, p.fallbackColor2);
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-wf/2, -hf/2, wf, hf, 8);
        else               ctx.rect(-wf/2, -hf/2, wf, hf);
        ctx.fill();
      } else {
        /* Dùng kích thước đã normalize (đúng chiều sau EXIF) */
        var natW  = p.entry.w || MAX_SIZE;
        var natH  = p.entry.h || MAX_SIZE;
        var ratio = natW / natH;
        var w, h;
        if (ratio >= 1) {
          w = MAX_SIZE * scale;
          h = (MAX_SIZE / ratio) * scale;
        } else {
          h = MAX_SIZE * scale;
          w = (MAX_SIZE * ratio) * scale;
        }
        ctx.drawImage(p.entry.img, -w / 2, -h / 2, w, h);
      }

      ctx.restore();
      return p.age < p.maxAge;
    });
  }

  requestAnimationFrame(frame);
};

/* ══════════════════════════════════════════════════════
   CURSOR (desktop only)
   ══════════════════════════════════════════════════════ */
function Cursor(el, pos) {
  this.el  = el;
  this.pos = pos;
  this.tx  = 0;
  this.ty  = 0;
  el.style.opacity = 0;

  var self = this;
  window.addEventListener('mousemove', function onFirst() {
    self.tx = pos.x - 40;
    self.ty = pos.y - 40;
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

  prewarm(10);

  var page2 = document.getElementById('page2');
  var pos   = {
    x: window.innerWidth  / 2,
    y: window.innerHeight / 2
  };

  window.addEventListener('mousemove', function (ev) {
    pos.x = ev.clientX;
    pos.y = ev.clientY;
  });

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

  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:20;';
  page2.appendChild(canvas);
  new CanvasTrail(canvas, pos);

  if (!IS_TOUCH) {
    var cursorEl = document.querySelector('.cursor');
    if (cursorEl) new Cursor(cursorEl, pos);
  }
}
