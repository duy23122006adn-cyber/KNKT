/**
 * script.js  —  Intro Hoa + Image Trail
 * Hỗ trợ: mousemove (desktop) + touchmove (iOS/Android)
 */

/* ══════════════════════════════════════════════════════
   TRANG 1 — HOA INTRO
   ══════════════════════════════════════════════════════ */
setTimeout(function () {
  document.body.classList.remove('not-loaded');
}, 1000);

// Nút "Tiếp tục" — hỗ trợ cả click lẫn touch
var btnNext = document.getElementById('btn-next');
function goPage2() {
  document.body.classList.add('go-page2');
  setTimeout(initTrail, 950);
}
btnNext.addEventListener('click', goPage2);
btnNext.addEventListener('touchend', function (e) {
  e.preventDefault(); // tránh ghost click trên iOS
  goPage2();
});


/* ══════════════════════════════════════════════════════
   UTILS
   ══════════════════════════════════════════════════════ */
var Utils = (function () {
  function lerp(a, b, t) { return a + (b - a) * t; }

  function getRandomNumber(min, max) {
    return Math.random() * (max - min) + min;
  }

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
              if (!resolved && count >= Math.min(batch, total)) {
                resolved = true; resolve();
              }
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
   CONFIG
   ══════════════════════════════════════════════════════ */
var TOTAL_IMAGES = 150;
var IMG_DIR      = './img/';
var IMG_EXT      = '.png';
var MAX_VISIBLE  = 12;

// Khoảng cách tối thiểu để spawn ảnh mới
// Desktop dùng px lớn hơn vì chuột di chuyển nhanh hơn ngón tay
var MIN_DISTANCE_MOUSE = 120;
var MIN_DISTANCE_TOUCH = 60;   // ngón tay vuốt → threshold nhỏ hơn

var FADE_IN_DUR  = 1.0;
var HOLD_DUR     = 1.2;
var FADE_OUT_DUR = 1.5;


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
  if (this._tween) this._tween.kill();
  this._active = true;
  this.DOM.img.style.backgroundImage = 'url(' + this._src + ')';

  gsap.set(this.DOM.el, {
    left: x, top: y,
    xPercent: -50, yPercent: -50,
    scale: 0.6, opacity: 0,
    rotation: rotate, zIndex: 10
  });

  this._tween = gsap.timeline({ onComplete: function () { self._active = false; } })
    .to(this.DOM.el, { duration: FADE_IN_DUR, ease: 'power2.out', scale: 1, opacity: 0.92 })
    .to(this.DOM.el, { duration: FADE_OUT_DUR, ease: 'power1.in', scale: 0.8, opacity: 0, delay: HOLD_DUR });
};

TrailImage.prototype.hide = function () {
  if (this._tween) this._tween.kill();
  gsap.set(this.DOM.el, { opacity: 0, scale: 0.6 });
  this._active = false;
};


/* ══════════════════════════════════════════════════════
   IMAGE TRAIL
   ══════════════════════════════════════════════════════ */
function ImageTrail(container, pos) {
  this.DOM      = { el: container };
  this._pos     = pos;           // { x, y, minDist } — shared, updated by event listeners
  this._lastPos = { x: -9999, y: -9999 };
  this._nextIdx = 0;
  this._pool    = [];
  this._active  = [];

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
  (function loop() {
    var minD = self._pos.minDist || MIN_DISTANCE_MOUSE;
    if (self._dist(self._pos, self._lastPos) >= minD) {
      self._spawn(self._pos.x, self._pos.y);
      self._lastPos = { x: self._pos.x, y: self._pos.y };
    }
    requestAnimationFrame(loop);
  })();
};


/* ══════════════════════════════════════════════════════
   CURSOR (chỉ desktop)
   ══════════════════════════════════════════════════════ */
function Cursor(el, pos) {
  this.DOM   = { el: el };
  this._pos  = pos;
  this._tx   = { prev: 0, cur: 0, amt: 0.2 };
  this._ty   = { prev: 0, cur: 0, amt: 0.2 };
  this.DOM.el.style.opacity = 0;

  var self = this;
  var onFirst = function () {
    self._tx.prev = self._tx.cur = self._pos.x - 40;
    self._ty.prev = self._ty.cur = self._pos.y - 40;
    gsap.to(self.DOM.el, { duration: 0.9, ease: 'power3.out', opacity: 1 });
    (function loop() {
      self._render();
      requestAnimationFrame(loop);
    })();
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

  // pos object dùng chung cho cả mouse và touch
  var pos = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    minDist: MIN_DISTANCE_MOUSE
  };

  /* ── MOUSE (desktop) ── */
  window.addEventListener('mousemove', function (ev) {
    pos.x = ev.clientX;
    pos.y = ev.clientY;
    pos.minDist = MIN_DISTANCE_MOUSE;
  });

  /* ── TOUCH (iOS / Android) ── */
  var page2 = document.getElementById('page2');

  // Ngăn trang bị scroll khi vuốt trên trang 2
  page2.addEventListener('touchmove', function (ev) {
    ev.preventDefault();
    var t = ev.touches[0];
    pos.x = t.clientX;
    pos.y = t.clientY;
    pos.minDist = MIN_DISTANCE_TOUCH;
  }, { passive: false });

  // touchstart: spawn ngay tại điểm chạm đầu tiên
  page2.addEventListener('touchstart', function (ev) {
    var t = ev.touches[0];
    pos.x = t.clientX;
    pos.y = t.clientY;
    pos.minDist = MIN_DISTANCE_TOUCH;
  }, { passive: true });

  /* ── Cursor (chỉ hiện trên desktop có con trỏ chuột) ── */
  var cursorEl = document.querySelector('.cursor');
  if (cursorEl && window.matchMedia('(any-pointer: fine)').matches) {
    new Cursor(cursorEl, pos);
  }

  /* ── Preload + khởi động ── */
  var srcs = [];
  for (var i = 1; i <= TOTAL_IMAGES; i++) srcs.push(IMG_DIR + 'img' + i + IMG_EXT);

  Utils.preloadImages(srcs, 20).then(function () {
    document.body.classList.remove('loading');
    var container = document.getElementById('trailContainer');
    if (container) new ImageTrail(container, pos);
  });
}
