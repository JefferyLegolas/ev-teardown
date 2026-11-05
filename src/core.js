/* ============================================================
   NOVA EV-1 · core.js
   渲染器 / 场景 / 灯光 / 程序化环境贴图 / 几何工具 / 轨道控制器
   依赖：全局 THREE（r160，已内联在页面中）
   ============================================================ */
(function () {
  'use strict';

  var EV = (window.EV = window.EV || {});
  var T = window.THREE;

  EV.fatal = function (msg) {
    var box = document.getElementById('fatal');
    var t = document.getElementById('fatalMsg');
    if (t) t.textContent = msg || '';
    if (box) box.classList.add('show');
    var boot = document.getElementById('boot');
    if (boot) boot.classList.add('hide');
  };

  if (!T) { EV.fatal('Three.js 未能加载，请检查页面是否完整。'); return; }

  EV.ACCENT = 0x38e8ff;
  EV.ACCENT_HEX = '#38e8ff';

  /* ---------------- 渲染器 ---------------- */
  var canvas = document.getElementById('scene');
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    EV.fatal('当前浏览器的 WebGL 不可用，请更换 Chrome / Edge 并开启硬件加速。');
    return;
  }
  var SMALL = Math.min(window.innerWidth, window.innerHeight) < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  EV.renderer = renderer;

  /* ---------------- 场景与相机 ---------------- */
  var scene = new T.Scene();
  EV.scene = scene;

  var camera = new T.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 220);
  EV.camera = camera;

  EV.HOME = {
    pos: new T.Vector3(6.9, 3.75, 7.9),
    target: new T.Vector3(0, 0.95, 0)
  };
  // 竖屏 / 窄屏时自动拉远，保证整车完整入画
  (function fitHome() {
    var a = window.innerWidth / Math.max(window.innerHeight, 1);
    if (a < 1.25) {
      var k = Math.pow(1.25 / a, 0.62);
      EV.HOME.pos.multiplyScalar(k);
      EV.HOME.target.y *= 0.92;
    }
  })();

  camera.position.copy(EV.HOME.pos);
  camera.lookAt(EV.HOME.target);

  /* ---------------- 程序化环境贴图（演播室 HDRI） ---------------- */
  function buildEnvTexture() {
    var w = 1024, h = 512;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');

    var sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0.00, '#111a24');
    sky.addColorStop(0.40, '#1b2c3a');
    sky.addColorStop(0.56, '#101a22');
    sky.addColorStop(1.00, '#05080b');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    g.save();
    g.filter = 'blur(34px)';
    // 顶部主柔光箱（中性白，负责金属高光）
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.ellipse(w * 0.28, h * 0.09, 250, 62, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(235,245,255,0.85)';
    g.beginPath(); g.ellipse(w * 0.71, h * 0.15, 180, 46, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200,215,230,0.55)';
    g.beginPath(); g.ellipse(w * 0.5, h * 0.02, 520, 80, 0, 0, Math.PI * 2); g.fill();
    // 两侧冷色边缘光（弱）
    g.fillStyle = 'rgba(90,190,225,0.45)';
    g.beginPath(); g.ellipse(w * 0.015, h * 0.48, 78, 150, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(130,120,235,0.35)';
    g.beginPath(); g.ellipse(w * 0.985, h * 0.46, 78, 140, 0, 0, Math.PI * 2); g.fill();
    // 地面反弹光
    g.fillStyle = 'rgba(70,110,135,0.55)';
    g.beginPath(); g.ellipse(w * 0.5, h * 0.88, 400, 80, 0, 0, Math.PI * 2); g.fill();
    g.restore();

    var tex = new T.CanvasTexture(c);
    tex.mapping = T.EquirectangularReflectionMapping;
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  var pmrem = new T.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  var envTex = buildEnvTexture();
  var envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  /* ---------------- 灯光 ---------------- */
  var hemi = new T.HemisphereLight(0x5b90b8, 0x080d12, 1.15);
  scene.add(hemi);

  var key = new T.DirectionalLight(0xdfefff, 3.1);
  key.position.set(6.5, 11, 7.5);
  key.castShadow = true;
  key.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 34;
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.022;
  key.shadow.radius = 2.2;
  scene.add(key);

  var rimCyan = new T.DirectionalLight(0x9fe4ff, 1.9);
  rimCyan.position.set(-8, 3.4, -6.5);
  scene.add(rimCyan);

  var rimViolet = new T.DirectionalLight(0x8a7bff, 1.05);
  rimViolet.position.set(-4.5, 5.5, 8);
  scene.add(rimViolet);

  var bounce = new T.PointLight(0x2a6f8a, 2.2, 14, 2);
  bounce.position.set(0, -1.4, 0);
  scene.add(bounce);

  /* ---------------- 地面：辉光圆台 + 网格 + 阴影承接 ---------------- */
  function buildGroundTexture() {
    var s = 1024;
    var c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    g.clearRect(0, 0, s, s);

    var rad = g.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s / 2);
    rad.addColorStop(0, 'rgba(56,232,255,0.30)');
    rad.addColorStop(0.34, 'rgba(30,120,160,0.14)');
    rad.addColorStop(0.62, 'rgba(10,45,66,0.06)');
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.fillRect(0, 0, s, s);

    g.strokeStyle = 'rgba(56,232,255,0.30)';
    g.lineWidth = 1.6;
    [0.16, 0.26, 0.36, 0.47].forEach(function (r, i) {
      g.globalAlpha = i === 0 ? 0.9 : 0.42 / (i + 0.35);
      g.beginPath(); g.arc(s / 2, s / 2, s * r, 0, Math.PI * 2); g.stroke();
    });

    g.globalAlpha = 0.5;
    g.strokeStyle = 'rgba(56,232,255,0.22)';
    for (var i = 0; i < 72; i++) {
      var a = (i / 72) * Math.PI * 2;
      var r1 = s * 0.40, r2 = s * (i % 6 === 0 ? 0.44 : 0.415);
      g.beginPath();
      g.moveTo(s / 2 + Math.cos(a) * r1, s / 2 + Math.sin(a) * r1);
      g.lineTo(s / 2 + Math.cos(a) * r2, s / 2 + Math.sin(a) * r2);
      g.stroke();
    }
    g.globalAlpha = 1;

    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  var groundGlow = new T.Mesh(
    new T.PlaneGeometry(30, 30),
    new T.MeshBasicMaterial({
      map: buildGroundTexture(),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      opacity: 0.9
    })
  );
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = -0.012;
  scene.add(groundGlow);

  var grid = new T.GridHelper(44, 44, 0x2a7d93, 0x0e2a37);
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  grid.material.depthWrite = false;
  grid.position.y = -0.02;
  scene.add(grid);

  var shadowPlane = new T.Mesh(
    new T.PlaneGeometry(34, 34),
    new T.ShadowMaterial({ color: 0x000000, opacity: 0.62 })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.0;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  /* ---------------- 漂浮粒子 ---------------- */
  (function particles() {
    var n = 520, pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var r = 4 + Math.random() * 12;
      var a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 9 - 0.4;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    var mat = new T.PointsMaterial({
      color: 0x6fd8f0, size: 0.035, transparent: true, opacity: 0.55,
      depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true
    });
    var pts = new T.Points(geo, mat);
    scene.add(pts);
    EV.particles = pts;
  })();

  /* ---------------- 光晕贴图 ---------------- */
  EV.glowTex = (function () {
    var s = 128, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(200,240,255,0.6)');
    grd.addColorStop(0.55, 'rgba(120,220,255,0.18)');
    grd.addColorStop(1, 'rgba(120,220,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();

  /* ---------------- 材质工厂 ---------------- */
  function std(o) { return new T.MeshStandardMaterial(o); }

  EV.Mat = {
    paint: function (c) {
      return new T.MeshPhysicalMaterial({
        color: c === undefined ? 0x2b4356 : c,
        metalness: 0.62, roughness: 0.3,
        clearcoat: 1, clearcoatRoughness: 0.16,
        envMapIntensity: 1.25
      });
    },
    glass: function () {
      return new T.MeshPhysicalMaterial({
        color: 0x0e2432, metalness: 0.1, roughness: 0.035,
        transparent: true, opacity: 0.26,
        side: T.DoubleSide, envMapIntensity: 2.6,
        depthWrite: false
      });
    },
    metal: function (c) { return std({ color: c === undefined ? 0xa9b8c6 : c, metalness: 1, roughness: 0.26, envMapIntensity: 1.15 }); },
    alu: function (c) { return std({ color: c === undefined ? 0x93a1ae : c, metalness: 0.92, roughness: 0.42, envMapIntensity: 0.95 }); },
    dark: function (c) { return std({ color: c === undefined ? 0x1a232d : c, metalness: 0.78, roughness: 0.46, envMapIntensity: 0.85 }); },
    plastic: function (c) { return std({ color: c === undefined ? 0x141c25 : c, metalness: 0.28, roughness: 0.62, envMapIntensity: 0.6 }); },
    rubber: function () { return std({ color: 0x0c0f13, metalness: 0.05, roughness: 0.94, envMapIntensity: 0.35 }); },
    copper: function () { return std({ color: 0xc07a45, metalness: 1, roughness: 0.32, envMapIntensity: 1.1 }); },
    hv: function () { return std({ color: 0xff5a1f, metalness: 0.35, roughness: 0.5, envMapIntensity: 0.7, emissive: 0x3a0d00, emissiveIntensity: 0.25 }); },
    emit: function (c, i) { return std({ color: 0x02060a, emissive: c, emissiveIntensity: i === undefined ? 2.4 : i, roughness: 0.35, metalness: 0 }); },
    accentMetal: function () {
      return std({ color: 0x123039, metalness: 0.9, roughness: 0.3, emissive: 0x0a4a56, emissiveIntensity: 0.7, envMapIntensity: 1.1 });
    },
    screen: function () { return std({ color: 0x03080d, emissive: 0x1ad2ea, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0 }); }
  };

  /* ---------------- 几何工具 ---------------- */
  EV.G = {
    box: function (w, h, d, mat, x, y, z, rx, ry, rz) {
      var m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    },
    cyl: function (rt, rb, h, seg, mat, x, y, z, rx, ry, rz) {
      var m = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 24), mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    },
    torus: function (R, tube, mat, x, y, z, arc, rx, ry, rz) {
      var m = new T.Mesh(new T.TorusGeometry(R, tube, 14, 44, arc === undefined ? Math.PI * 2 : arc), mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.rotation.set(rx || 0, ry || 0, rz || 0);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    },
    sphere: function (r, mat, x, y, z, seg) {
      var m = new T.Mesh(new T.SphereGeometry(r, seg || 24, (seg || 24) / 2), mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    },
    profile: function (pts, depth, bevel, mat) {
      var shape = new T.Shape();
      shape.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
      shape.closePath();
      var geo = new T.ExtrudeGeometry(shape, {
        depth: depth,
        bevelEnabled: bevel > 0,
        bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3,
        curveSegments: 6, steps: 1
      });
      geo.translate(0, 0, -depth / 2);
      geo.computeVertexNormals();
      var m = new T.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    },
    tube: function (points, radius, mat, seg) {
      var curve = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
      var geo = new T.TubeGeometry(curve, seg || 90, radius, 8, false);
      var m = new T.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      return m;
    },
    helix: function (radius, height, turns, tubeR, mat) {
      var pts = [], N = Math.floor(turns * 22);
      for (var i = 0; i <= N; i++) {
        var a = (i / N) * Math.PI * 2 * turns;
        pts.push(new T.Vector3(Math.cos(a) * radius, (i / N) * height - height / 2, Math.sin(a) * radius));
      }
      var curve = new T.CatmullRomCurve3(pts);
      var geo = new T.TubeGeometry(curve, N, tubeR, 6, false);
      var m = new T.Mesh(geo, mat);
      m.castShadow = true;
      return m;
    }
  };

  /* ---------------- 轨道控制器（自研，无外部依赖） ---------------- */
  function Orbit(camera, dom) {
    var self = this;
    var target = new T.Vector3().copy(EV.HOME.target);
    var goalTarget = target.clone();
    var sph = { r: 12, phi: 1.1, theta: 0.6 };
    var goal = { r: 12, phi: 1.1, theta: 0.6 };
    var tween = null;
    var pointers = new Map();
    var pinchDist = 0;

    (function init() {
      var off = camera.position.clone().sub(target);
      sph.r = goal.r = off.length();
      sph.phi = goal.phi = Math.acos(T.MathUtils.clamp(off.y / sph.r, -1, 1));
      sph.theta = goal.theta = Math.atan2(off.x, off.z);
    })();

    function apply() {
      var sp = Math.sin(sph.phi), cp = Math.cos(sph.phi);
      camera.position.set(
        target.x + sph.r * sp * Math.sin(sph.theta),
        target.y + sph.r * cp,
        target.z + sph.r * sp * Math.cos(sph.theta)
      );
      camera.lookAt(target);
      EV.camTarget = target;
    }

    function clampAll() {
      goal.phi = T.MathUtils.clamp(goal.phi, 0.13, 1.5);
      goal.r = T.MathUtils.clamp(goal.r, 2.6, 26);
    }

    function onDown(e) {
      if (dom.setPointerCapture) { try { dom.setPointerCapture(e.pointerId); } catch (err) { } }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      tween = null;
      self.dragging = true;
      self.moved = 0;
      if (pointers.size === 2) {
        var it = Array.from(pointers.values());
        pinchDist = Math.hypot(it[0].x - it[1].x, it[0].y - it[1].y);
      }
    }

    function pan(dx, dy) {
      var k = goal.r * 0.0016;
      var right = new T.Vector3().setFromMatrixColumn(camera.matrix, 0);
      var up = new T.Vector3().setFromMatrixColumn(camera.matrix, 1);
      goalTarget.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    }

    function onMove(e) {
      var p = pointers.get(e.pointerId);
      if (!p) { if (self.onHover) self.onHover(e); return; }
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      self.moved += Math.abs(dx) + Math.abs(dy);

      if (pointers.size >= 2) {
        var it = Array.from(pointers.values());
        var d = Math.hypot(it[0].x - it[1].x, it[0].y - it[1].y);
        if (pinchDist > 0) { goal.r *= pinchDist / Math.max(d, 1); clampAll(); }
        pinchDist = d;
        pan(dx * 0.5, dy * 0.5);
        return;
      }

      if (p.button === 2 || p.button === 1 || e.shiftKey) {
        pan(dx, dy);
      } else {
        goal.theta -= dx * 0.0046;
        goal.phi -= dy * 0.0046;
        clampAll();
      }
    }

    function onUp(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        self.dragging = false;
        if (self.moved < 6 && self.onClick) self.onClick(e);
      }
      pinchDist = 0;
    }

    function onWheel(e) {
      e.preventDefault();
      tween = null;
      goal.r *= 1 + Math.sign(e.deltaY) * 0.11;
      clampAll();
    }

    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    this.autoRotate = true;
    this.autoSpeed = 0.08;
    this.dragging = false;
    this.moved = 0;

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    this.update = function (dt) {
      if (tween) {
        var t = T.MathUtils.clamp((performance.now() - tween.start) / tween.dur, 0, 1);
        var e = easeInOutCubic(t);
        camera.position.lerpVectors(tween.p0, tween.p1, e);
        target.lerpVectors(tween.v0, tween.v1, e);
        camera.lookAt(target);
        var off = camera.position.clone().sub(target);
        sph.r = goal.r = off.length();
        sph.phi = goal.phi = Math.acos(T.MathUtils.clamp(off.y / sph.r, -1, 1));
        sph.theta = goal.theta = Math.atan2(off.x, off.z);
        goalTarget.copy(target);
        EV.camTarget = target;
        if (t >= 1) tween = null;
        return;
      }
      if (this.autoRotate && !this.dragging) goal.theta -= this.autoSpeed * dt;
      var k = 1 - Math.exp(-9 * dt);
      sph.r += (goal.r - sph.r) * k;
      sph.phi += (goal.phi - sph.phi) * k;
      sph.theta += (goal.theta - sph.theta) * k;
      target.lerp(goalTarget, k);
      apply();
    };

    this.flyTo = function (p, v, dur) {
      tween = {
        p0: camera.position.clone(), p1: p.clone(),
        v0: target.clone(), v1: v.clone(),
        start: performance.now(), dur: dur || 900
      };
      return tween;
    };

    this.setAutoRotate = function (v) { this.autoRotate = !!v; };
    this.reset = function (dur) {
      this.flyTo(EV.HOME.pos, EV.HOME.target, dur || 900);
    };
    this.getTarget = function () { return target.clone(); };
    this.setTarget = function (v) { target.copy(v); goalTarget.copy(v); };
    this.getRadius = function () { return goal.r; };

    apply();
  }

  EV.Orbit = Orbit;
})();
