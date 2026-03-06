/**
 * script.js  —  Intro Hoa + Image Trail
 * ══════════════════════════════════════════════════════
 * Trang 1: bỏ not-loaded sau 1s để animation hoa chạy.
 *          Nút "Tiếp tục" slide sang trang 2 (body.go-page2).
 * Trang 2: Image Trail khởi động sau khi slide xong.
 */

/* ══════════════════════════════════════════════════════
   TRANG 1 — HOA INTRO
   ══════════════════════════════════════════════════════ */
setTimeout(function () {
  document.body.classList.remove('not-loaded');
}, 1000);

document.getElementById('btn-next').addEventListener('click', function () {
  document.body.classList.add('go-page2');
  // Khởi động trail sau khi slide hoàn tất (0.9s)
  setTimeout(initTrail, 950);
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
   CONFIG IMAGE TRAIL
   ══════════════════════════════════════════════════════ */
var TOTAL_IMAGES = 150;
var IMG_DIR      = './img/';
var IMG_EXT      = '.png';
var MAX_VISIBLE  = 12;
var MIN_DISTANCE = 120;
var FADE_IN_DUR  = 1.0;
var HOLD_DUR     = 1.2;
var FADE_OUT_DUR = 1.5;


/* ══════════════════════════════════════════════════════
   TRAIL IMAGE  —  1 phần tử ảnh trail
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
    left:     x,
    top:      y,
    xPercent: -50,
    yPercent: -50,
    scale:    0.6,
    opacity:  0,
    rotation: rotate,
    zIndex:   10
  });

  this._tween = gsap.timeline({
    onComplete: function () { self._active = false; }
  })
  .to(this.DOM.el, {
    duration: FADE_IN_DUR,
    ease:     'power2.out',
    scale:    1,
    opacity:  0.92
  })
  .to(this.DOM.el, {
    duration: FADE_OUT_DUR,
    ease:     'power1.in',
    scale:    0.8,
    opacity:  0,
    delay:    HOLD_DUR
  });
};

TrailImage.prototype.hide = function () {
  if (this._tween) this._tween.kill();
  gsap.set(this.DOM.el, { opacity: 0, scale: 0.6 });
  this._active = false;
};


/* ══════════════════════════════════════════════════════
   IMAGE TRAIL  —  điều phối 150 TrailImage
   ══════════════════════════════════════════════════════ */
function ImageTrail(container, mousepos) {
  this.DOM       = { el: container };
  this._mousepos = mousepos;
  this._lastPos  = { x: -9999, y: -9999 };
  this._nextIdx  = 0;
  this._pool     = [];
  this._active   = [];

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
    var src = IMG_DIR + 'img' + (i + 1) + IMG_EXT;
    this._pool.push(new TrailImage(outer, src));
  }
  this.DOM.el.appendChild(frag);
};

ImageTrail.prototype._dist = function (a, b) {
  var dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

ImageTrail.prototype._nextImage = function () {
  var img = this._pool[this._nextIdx % TOTAL_IMAGES];
  this._nextIdx++;
  return img;
};

ImageTrail.prototype._spawn = function (x, y) {
  if (this._active.length >= MAX_VISIBLE) {
    this._active.shift().hide();
  }
  var trailImg = this._nextImage();
  var rotate   = Utils.getRandomNumber(-12, 12);
  trailImg.show(x, y, rotate);
  this._active.push(trailImg);
};

ImageTrail.prototype._startLoop = function () {
  var self = this;
  var loop = function () {
    if (self._dist(self._mousepos, self._lastPos) >= MIN_DISTANCE) {
      self._spawn(self._mousepos.x, self._mousepos.y);
      self._lastPos = { x: self._mousepos.x, y: self._mousepos.y };
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};


/* ══════════════════════════════════════════════════════
   CURSOR  —  lerp 0.2, fade-in 0.9s
   ══════════════════════════════════════════════════════ */
function Cursor(el, mousepos) {
  this.DOM    = { el: el };
  this._mouse = mousepos;
  this._tx    = { prev: 0, cur: 0, amt: 0.2 };
  this._ty    = { prev: 0, cur: 0, amt: 0.2 };
  this.DOM.el.style.opacity = 0;
  this._bindFirstMove();
}

Cursor.prototype._bindFirstMove = function () {
  var self = this;
  var onFirst = function () {
    self._tx.prev = self._tx.cur = self._mouse.x - 40;
    self._ty.prev = self._ty.cur = self._mouse.y - 40;
    gsap.to(self.DOM.el, { duration: 0.9, ease: 'power3.out', opacity: 1 });
    (function loop() {
      self._render();
      requestAnimationFrame(loop);
    })();
    window.removeEventListener('mousemove', onFirst);
  };
  window.addEventListener('mousemove', onFirst);
};

Cursor.prototype._render = function () {
  this._tx.cur  = this._mouse.x - 40;
  this._ty.cur  = this._mouse.y - 40;
  this._tx.prev = Utils.lerp(this._tx.prev, this._tx.cur, this._tx.amt);
  this._ty.prev = Utils.lerp(this._ty.prev, this._ty.cur, this._ty.amt);
  this.DOM.el.style.transform =
    'translateX(' + this._tx.prev + 'px) translateY(' + this._ty.prev + 'px)';
};


/* ══════════════════════════════════════════════════════
   INIT TRAIL (gọi sau khi slide sang trang 2)
   ══════════════════════════════════════════════════════ */
var trailInited = false;

function initTrail() {
  if (trailInited) return;
  trailInited = true;

  var mousepos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  window.addEventListener('mousemove', function (ev) {
    mousepos.x = ev.clientX;
    mousepos.y = ev.clientY;
  });

  // Cursor
  var cursorEl = document.querySelector('.cursor');
  if (cursorEl) new Cursor(cursorEl, mousepos);

  // Preload batch → khởi động trail
  var srcs = [];
  for (var i = 1; i <= TOTAL_IMAGES; i++) srcs.push(IMG_DIR + 'img' + i + IMG_EXT);

  Utils.preloadImages(srcs, 20).then(function () {
    document.body.classList.remove('loading');
    var container = document.getElementById('trailContainer');
    if (container) new ImageTrail(container, mousepos);
  });
}
