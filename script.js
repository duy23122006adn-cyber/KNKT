/**
 * script.js  —  Intro Hoa + Image Trail
 * Tối ưu mobile: giảm số ảnh, threshold cao hơn, ít tween hơn
 */

/* ══════════════════════════════════════════════════════
   DETECT DEVICE
   ══════════════════════════════════════════════════════ */
var IS_TOUCH  = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var IS_MOBILE = IS_TOUCH && window.innerWidth <= 768;

/* ══════════════════════════════════════════════════════
   TRANG 1 — HOA INTRO
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
btnNext.addEventListener('touchend', function (e) {
  e.preventDefault();
  goPage2();
});


/* ══════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════ */
var Utils = (function () {
  function lerp(a, b, t) { return a + (b - a) * t; }
  function getRandomNumber(min, max) { return Math.random() * (max - min) + min; }

  function preloadImages(srcs, batch) {
    batch = batch || 20;
    return new Promise(function (resolve) {
      var total = srcs.length;
      if (!total) { resolve(); return; }
      var resolved = false;
      function loadBatch(start) {
        var end = Math.min(start + batch, total);
        var count = 0, size = end - start;
        for (var i = start; i < end; i++) {
          (function (src) {
            var img = new Image();
            img.onload = img.onerror = function () {
              count++;
              if (!resolved && count >= Math.min(batch, total)) { resolved = true; resolve(); }
              if (count === size && end < total) loadBatch(end);
            };
            img.src = src;
          })(srcs[i]);
        }
      }
      loadBatch(0);
      if (total <= batch) resolve();
    });
  }

  return { lerp: lerp, getRandomNumber: getRandomNumber, preloadImages: preloadImages };
})();


/* ══════════════════════════════════════════════════════
   CONFIG — tự động điều chỉnh theo thiết bị
   ══════════════════════════════════════════════════════ */
var TOTAL_IMAGES = 150;
var IMG_DIR      = './img/';
var IMG_EXT      = '.png';

// Mobile nhẹ hơn: ít ảnh đồng thời + threshold lớn hơn + animation nhanh hơn
var MAX_VISIBLE      = IS_MOBILE ? 5  : 12;
var MIN_DIST_MOUSE   = 120;
var MIN_DIST_TOUCH   = IS_MOBILE ? 80 : 60;
var FADE_IN_DUR      = IS_MOBILE ? 0.4 : 1.0;
var HOLD_DUR         = IS_MOBILE ? 0.5 : 1.2;
var FADE_OUT_DUR     = IS_MOBILE ? 0.4 : 1.5;


/* ══════════════════════════════════════════════════════
   TRAIL IMAGE
   ══════════════════════════════════════════════════════ */
function TrailImage(el, src) {
  this.DOM     = { el: el, img: el.querySelector('.trail__img') };
  this._src    = src;
  this._active = false;
  this._tween  = null;
}

TrailImage.prototype.show = function (x, y, rotate) {
  var self = this;
  if (this._tween) { this._tween.kill(); this._tween = null; }
  this._active = true;
  this.DOM.img.style.backgroundImage = 'url(' + this._src + ')';

  // Dùng transform thuần thay vì left/top để bật GPU composite layer
  gsap.set(this.DOM.el, {
    x:        x,
    y:        y,
    xPercent: -50,
    yPercent: -50,
    scale:    IS_MOBILE ? 0.7 : 0.6,
    opacity:  0,
    rotation: rotate,
    zIndex:   10,
    force3D:  true   // bắt buộc dùng translateZ(0) → GPU layer
  });

  this._tween = gsap.timeline({ onComplete: function () { self._active = false; } })
    .to(this.DOM.el, {
      duration: FADE_IN_DUR,
      ease:     'power2.out',
      scale:    1,
      opacity:  IS_MOBILE ? 0.88 : 0.92,
      force3D:  true
    })
    .to(this.DOM.el, {
      duration: FADE_OUT_DUR,
      ease:     'power1.in',
      scale:    IS_MOBILE ? 0.85 : 0.8,
      opacity:  0,
      delay:    HOLD_DUR,
      force3D:  true
    });
};

TrailImage.prototype.hide = function () {
  if (this._tween) { this._tween.kill(); this._tween = null; }
  gsap.set(this.DOM.el, { opacity: 0, scale: 0.6 });
  this._active = false;
};


/* ══════════════════════════════════════════════════════
   IMAGE TRAIL
   ══════════════════════════════════════════════════════ */
function ImageTrail(container, pos) {
  this.DOM      = { el: container };
  this._pos     = pos;
  this._lastPos = { x: -9999, y: -9999 };
  this._nextIdx = 0;
  this._pool    = [];
  this._active  = [];
  this._rafId   = null;

  this._buildPool();
  this._startLoop();
}

ImageTrail.prototype._buildPool = function () {
  var frag = document.createDocumentFragment();
  for (var i = 0; i < TOTAL_IMAGES; i++) {
    var outer = document.createElement('div');
    outer.className = 'trail__item';
    var inner = document.createElement('div');
    inner.className = 'trail__img';
    outer.appendChild(inner);
    frag.appendChild(outer);
    this._pool.push(new TrailImage(outer, IMG_DIR + 'img' + (i + 1) + IMG_EXT));
  }
  this.DOM.el.appendChild(frag);
};

ImageTrail.prototype._dist = function (a, b) {
  var dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

ImageTrail.prototype._spawn = function (x, y) {
  if (this._active.length >= MAX_VISIBLE) this._active.shift().hide();
  var item = this._pool[this._nextIdx % TOTAL_IMAGES];
  this._nextIdx++;
  item.show(x, y, Utils.getRandomNumber(-12, 12));
  this._active.push(item);
};

ImageTrail.prototype._startLoop = function () {
  var self = this;
  var minD = self._pos.minDist || MIN_DIST_MOUSE;

  // Mobile: dùng throttle 30fps thay vì 60fps để giảm CPU
  var lastFrame = 0;
  var targetFPS = IS_MOBILE ? 30 : 60;
  var interval  = 1000 / targetFPS;

  (function loop(ts) {
    self._rafId = requestAnimationFrame(loop);
    if (IS_MOBILE && ts - lastFrame < interval) return; // throttle
    lastFrame = ts;

    minD = self._pos.minDist || MIN_DIST_MOUSE;
    if (self._dist(self._pos, self._lastPos) >= minD) {
      self._spawn(self._pos.x, self._pos.y);
      self._lastPos = { x: self._pos.x, y: self._pos.y };
    }
  })(0);
};


/* ══════════════════════════════════════════════════════
   CURSOR (desktop only)
   ══════════════════════════════════════════════════════ */
function Cursor(el, pos) {
  this.DOM  = { el: el };
  this._pos = pos;
  this._tx  = { prev: 0, cur: 0, amt: 0.2 };
  this._ty  = { prev: 0, cur: 0, amt: 0.2 };
  this.DOM.el.style.opacity = 0;

  var self = this;
  var onFirst = function () {
    self._tx.prev = self._tx.cur = self._pos.x - 40;
    self._ty.prev = self._ty.cur = self._pos.y - 40;
    gsap.to(self.DOM.el, { duration: 0.9, ease: 'power3.out', opacity: 1 });
    (function loop() { self._render(); requestAnimationFrame(loop); })();
    window.removeEventListener('mousemove', onFirst);
  };
  window.addEventListener('mousemove', onFirst);
}

Cursor.prototype._render = function () {
  this._tx.cur  = this._pos.x - 40;
  this._ty.cur  = this._pos.y - 40;
  this._tx.prev = Utils.lerp(this._tx.prev, this._tx.cur, this._tx.amt);
  this._ty.prev = Utils.lerp(this._ty.prev, this._ty.cur, this._ty.amt);
  this.DOM.el.style.transform =
    'translateX(' + this._tx.prev + 'px) translateY(' + this._ty.prev + 'px)';
};


/* ══════════════════════════════════════════════════════
   INIT TRAIL
   ══════════════════════════════════════════════════════ */
var trailInited = false;

function initTrail() {
  if (trailInited) return;
  trailInited = true;

  var pos = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    minDist: MIN_DIST_MOUSE
  };

  /* Mouse */
  window.addEventListener('mousemove', function (ev) {
    pos.x = ev.clientX;
    pos.y = ev.clientY;
    pos.minDist = MIN_DIST_MOUSE;
  });

  /* Touch */
  var page2 = document.getElementById('page2');
  page2.addEventListener('touchmove', function (ev) {
    ev.preventDefault();
    var t = ev.touches[0];
    pos.x = t.clientX;
    pos.y = t.clientY;
    pos.minDist = MIN_DIST_TOUCH;
  }, { passive: false });

  page2.addEventListener('touchstart', function (ev) {
    var t = ev.touches[0];
    pos.x = t.clientX;
    pos.y = t.clientY;
    pos.minDist = MIN_DIST_TOUCH;
  }, { passive: true });

  /* Cursor — desktop only */
  if (!IS_TOUCH) {
    var cursorEl = document.querySelector('.cursor');
    if (cursorEl) new Cursor(cursorEl, pos);
  }

  /* Preload batch nhỏ hơn trên mobile */
  var batchSize = IS_MOBILE ? 10 : 20;
  var srcs = [];
  for (var i = 1; i <= TOTAL_IMAGES; i++) srcs.push(IMG_DIR + 'img' + i + IMG_EXT);

  Utils.preloadImages(srcs, batchSize).then(function () {
    document.body.classList.remove('loading');
    var container = document.getElementById('trailContainer');
    if (container) new ImageTrail(container, pos);
  });
}
