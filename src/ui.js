/* ============================================================
   NOVA EV-1 · ui.js
   拆解动画 / 高亮辉光 / 标注投影 / 面板交互 / 主循环
   ============================================================ */
(function () {
  'use strict';

  var EV = window.EV;
  var T = window.THREE;

  var canvas = document.getElementById('scene');
  var parts = EV.buildCar();
  var partsById = EV.partsById;

  /* ---------------- 状态 ---------------- */
  var state = {
    selected: null,
    hovered: null,
    labelsOn: true,
    rotateOn: true,
    lift: 0,
    explodedAll: false
  };

  var ACCENT = new T.Color(EV.ACCENT);
  var tmpColor = new T.Color();
  var tmpV = new T.Vector3();
  var raycaster = new T.Raycaster();
  var ndc = new T.Vector2();

  /* ---------------- 控制器 ---------------- */
  var camera = EV.camera;
  camera.position.set(15.4, 8.8, 17.4);
  var controls = new EV.Orbit(camera, canvas);
  controls.flyTo(EV.HOME.pos, EV.HOME.target, 1500);
  EV.controls = controls;

  controls.onClick = function (e) {
    var p = pick(e);
    if (p) selectPart(p);
    else clearSelection();
  };
  controls.onHover = function (e) {
    if (controls.dragging) return;
    var p = pick(e);
    if (p !== state.hovered) {
      state.hovered = p;
      canvas.style.cursor = p ? 'pointer' : 'grab';
      if (p) showHoverTip(e, p);
    }
  };

  /* ---------------- 拾取 ---------------- */
  var pickables = parts.map(function (p) { return p.group; });
  function pick(e) {
    var rect = canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(pickables, true);
    for (var i = 0; i < hits.length; i++) {
      var id = hits[i].object.userData.partId;
      if (id && partsById[id]) return partsById[id];
    }
    return null;
  }

  /* ---------------- 拆解动画 ---------------- */
  function applyExplode(p) {
    var t = p.t;
    if (p.custom) {
      p.custom(p.group, t);
      return;
    }
    p.group.position.set(p.dir.x * p.dist * t, p.dir.y * p.dist * t, p.dir.z * p.dist * t);
    if (p.rot) p.group.rotation.set(p.rot.x * t, p.rot.y * t, p.rot.z * t);
  }

  function setTarget(p, v, delay) {
    if (delay) {
      p.queueAt = performance.now() + delay;
      return;
    }
    p.target = v;
    p.queueAt = 0;
  }

  function explodeAll() {
    state.explodedAll = true;
    parts.forEach(function (p, i) { setTarget(p, 1, i * 55); });
    updateModeChip();
    setTimeout(function () { frameAll(1100); }, 1150);
  }

  function resetAll() {
    state.explodedAll = false;
    parts.forEach(function (p) { p.queueAt = 0; p.target = 0; });
    state.selected = null;
    state.hovered = null;
    controls.flyTo(EV.HOME.pos, EV.HOME.target, 900);
    renderDetail(null);
    refreshList();
    updateModeChip();
  }

  function selectPart(p, focus) {
    var changed = state.selected !== p;
    state.selected = p;
    p.target = 1;
    p.queueAt = 0;
    state.explodedAll = parts.every(function (q) { return q.target > 0.5; });
    renderDetail(p);
    refreshList();
    updateModeChip();
    if (focus !== false) {
      setTimeout(function () {
        if (state.selected === p) focusPart(p);
      }, changed ? 340 : 0);
    }
  }

  function clearSelection() {
    state.selected = null;
    renderDetail(null);
    refreshList();
    updateModeChip();
  }

  function focusPart(p) {
    EV.scene.updateMatrixWorld(true);
    var box = new T.Box3().setFromObject(p.group);
    var c = box.getCenter(new T.Vector3());
    var maxD = Math.max(box.getSize(new T.Vector3()).x, box.getSize(new T.Vector3()).y, box.getSize(new T.Vector3()).z, 1.1);
    var vFov = camera.fov * Math.PI / 180;
    var dist = Math.max(maxD * 0.5 / Math.tan(vFov / 2) * 1.15 + maxD * 0.12, 2.8);
    var dir = camera.position.clone().sub(c);
    if (dir.lengthSq() < 0.001) dir.set(1, 0.6, 1);
    dir.normalize();
    if (dir.y < 0.32) { dir.y = 0.42; dir.normalize(); }
    var pos = c.clone().addScaledVector(dir, dist);
    pos.y = Math.max(pos.y, 0.9);
    controls.flyTo(pos, c, 900);
  }

  // 自动取景：让整组拆解件落在画面内
  function frameAll(dur) {
    var n = parts.filter(function (q) { return q.target > 0.5; }).length;
    if (n < 3) return;
    EV.scene.updateMatrixWorld(true);
    var box = new T.Box3();
    parts.forEach(function (q) { box.expandByObject(q.group); });
    var c = box.getCenter(new T.Vector3());
    var size = box.getSize(new T.Vector3());
    var vFov = camera.fov * Math.PI / 180;
    var hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    var distV = (size.y * 0.5) / Math.tan(vFov / 2);
    var distH = (Math.max(size.x, size.z) * 0.5 * 0.86) / Math.tan(hFov / 2);
    var dist = Math.max(distV, distH) * 1.12 + Math.min(size.z, 2.4) * 0.55;
    var dir = camera.position.clone().sub(c);
    dir.y = Math.max(dir.y * 0.75, 1.2);
    dir.normalize();
    var pos = c.clone().addScaledVector(dir, Math.max(dist, 7.5));
    controls.flyTo(pos, c, dur || 1000);
  }

  /* ---------------- 地面举升柱（已移除，仅保留占位） ---------------- */
  var liftPosts = [];

  /* ---------------- 选中辉光 ---------------- */
  var haloTex = (function () {
    var s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(90,240,255,0.85)');
    grad.addColorStop(0.35, 'rgba(56,232,255,0.28)');
    grad.addColorStop(1, 'rgba(56,232,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    var tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  })();

  var halo = new T.Sprite(new T.SpriteMaterial({
    map: haloTex, color: 0x38e8ff, transparent: true,
    blending: T.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0
  }));
  halo.scale.set(3, 3, 1);
  EV.scene.add(halo);

  // 跟随相机的补光，避免暗部零件丢失细节
  var camFill = new T.DirectionalLight(0xa8c8e0, 0.8);
  camFill.target.position.set(0, 1, 0);
  EV.scene.add(camFill);
  EV.scene.add(camFill.target);

  /* ---------------- 拆解引线 ---------------- */
  var lines = parts.map(function (p) {
    if (p.custom) return null;
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    var mat = new T.LineDashedMaterial({
      color: EV.ACCENT, transparent: true, opacity: 0.0,
      dashSize: 0.075, gapSize: 0.075, depthWrite: false
    });
    var line = new T.Line(geo, mat);
    line.frustumCulled = false;
    EV.carRoot.add(line);
    return line;
  });

  /* ---------------- 3D 标注 ---------------- */
  var labelLayer = document.getElementById('labels');
  var labelEls = parts.map(function (p) {
    var el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = '<span class="dot"></span><span class="n">' + p.code.slice(2) + '</span><span class="txt">' + p.name + '</span>';
    labelLayer.appendChild(el);
    return el;
  });

  /* ---------------- 面板：部件清单 ---------------- */
  var CAT_ORDER = ['车身', '三电', '底盘', '灯光', '智能'];
  var CAT_EN = { '车身': 'BODY', '三电': 'E-POWERTRAIN', '底盘': 'CHASSIS', '灯光': 'LIGHTING', '智能': 'INTELLIGENCE' };
  var listEl = document.getElementById('list');

  (function buildList() {
    var html = '';
    CAT_ORDER.forEach(function (cat) {
      var group = parts.filter(function (p) { return p.cat === cat; });
      if (!group.length) return;
      html += '<div class="cat-title">' + cat + ' · ' + CAT_EN[cat] + '</div>';
      group.forEach(function (p) {
        html += '<div class="item" data-id="' + p.id + '">' +
          '<span class="idx">' + p.code.slice(2) + '</span>' +
          '<span class="nm">' + p.name + '<span class="en">' + p.en + '</span></span>' +
          '<i class="st"></i></div>';
      });
    });
    listEl.innerHTML = html;
    listEl.addEventListener('click', function (e) {
      var item = e.target.closest('.item');
      if (!item) return;
      var p = partsById[item.getAttribute('data-id')];
      if (!p) return;
      if (state.selected === p) { p.target = 0; clearSelection(); }
      else {
        selectPart(p);
        if (window.innerWidth <= 820) { closeDrawers(); panelRight.classList.add('open'); mInfoBtn.classList.add('on'); }
      }
    });
    document.getElementById('listMeta').textContent = parts.length + ' UNITS';
  })();

  function refreshList() {
    var items = listEl.querySelectorAll('.item');
    for (var i = 0; i < items.length; i++) {
      var p = partsById[items[i].getAttribute('data-id')];
      if (!p) continue;
      items[i].classList.toggle('active', state.selected === p);
      items[i].classList.toggle('out', p.target > 0.5);
    }
    var n = parts.filter(function (q) { return q.target > 0.5; }).length;
    document.getElementById('detailMeta').textContent = n ? n + ' / ' + parts.length + ' OUT' : 'SPEC';
  }

  /* ---------------- 面板：详情 ---------------- */
  var detailEl = document.getElementById('detail');

  function renderDetail(p) {
    if (!p) {
      detailEl.innerHTML =
        '<div class="dp-head"><span class="dp-tag">整车概览</span><span class="dp-code">EV-1 / PLATFORM</span></div>' +
        '<h2 class="dp-title">纯电旗舰平台</h2>' +
        '<div class="dp-en">800V · Dual Motor · CTB</div>' +
        '<p class="dp-desc">点击左侧清单中的任意部件，或直接点击车身上的零件，即可触发该部件的拆解动画并查看工程参数。再次点击同一部件可让它复位归位。</p>' +
        '<div class="ov-grid">' +
        '<div class="ov-cell"><div class="k">峰值功率</div><div class="v">410<small>kW</small></div></div>' +
        '<div class="ov-cell"><div class="k">0–100 km/h</div><div class="v">3.9<small>s</small></div></div>' +
        '<div class="ov-cell"><div class="k">CLTC 续航</div><div class="v">700<small>km</small></div></div>' +
        '<div class="ov-cell"><div class="k">电池容量</div><div class="v">100<small>kWh</small></div></div>' +
        '<div class="ov-cell"><div class="k">整备质量</div><div class="v">2180<small>kg</small></div></div>' +
        '<div class="ov-cell"><div class="k">风阻系数</div><div class="v">0.208<small>Cd</small></div></div>' +
        '</div>';
      document.getElementById('detailMeta').textContent = 'SPEC';
      return;
    }

    var specs = p.specs.map(function (s) {
      return '<div class="specrow"><span>' + s[0] + '</span><b>' + s[1] + '</b></div>';
    }).join('');

    detailEl.innerHTML =
      '<div class="dp-head"><span class="dp-tag">' + p.cat + '</span><span class="dp-code">' + p.code + '</span></div>' +
      '<h2 class="dp-title">' + p.name + '</h2>' +
      '<div class="dp-en">' + p.en + '</div>' +
      '<div class="dp-specs">' + specs + '</div>' +
      '<p class="dp-desc">' + p.desc + '</p>' +
      '<div class="dp-acts">' +
      '<button class="btn" data-act="reset">部件归位</button>' +
      '<button class="btn" data-act="focus">聚焦视角</button>' +
      '</div>';

    detailEl.querySelector('[data-act="reset"]').addEventListener('click', function () {
      p.target = 0;
      state.selected = null;
      renderDetail(null);
      refreshList();
      updateModeChip();
      controls.flyTo(EV.HOME.pos, EV.HOME.target, 800);
    });
    detailEl.querySelector('[data-act="focus"]').addEventListener('click', function () {
      focusPart(p);
    });
  }

  /* ---------------- 模式 / 状态 ---------------- */
  function updateModeChip() {
    var n = parts.filter(function (p) { return p.target > 0.5; }).length;
    var chip = document.getElementById('modeChip');
    var txt = document.getElementById('modeText');
    if (!txt) return;
    if (n === 0) {
      txt.textContent = '装配状态';
      chip.classList.remove('warn');
    } else {
      txt.textContent = '拆解中 ' + n + ' / ' + parts.length;
      chip.classList.add('warn');
    }
    refreshList();
  }

  /* ---------------- 顶部提示（悬停） ---------------- */
  var tipEl = document.createElement('div');
  tipEl.style.cssText = 'position:fixed;pointer-events:none;z-index:20;padding:5px 10px;border-radius:6px;' +
    'background:rgba(4,14,20,.9);border:1px solid rgba(56,232,255,.35);color:#d9f4ff;' +
    'font:11px/1.4 "Microsoft YaHei",sans-serif;letter-spacing:.06em;transform:translate(-50%,-160%);' +
    'opacity:0;transition:opacity .2s;white-space:nowrap;box-shadow:0 0 20px rgba(56,232,255,.18)';
  document.body.appendChild(tipEl);
  var tipTimer = 0;
  function showHoverTip(e, p) {
    tipEl.textContent = p.code + ' · ' + p.name;
    tipEl.style.left = e.clientX + 'px';
    tipEl.style.top = e.clientY + 'px';
    tipEl.style.opacity = '1';
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { tipEl.style.opacity = '0'; }, 900);
  }
  canvas.addEventListener('pointerleave', function () { tipEl.style.opacity = '0'; });

  /* ---------------- 按钮 ---------------- */
  document.getElementById('btnExplode').addEventListener('click', function () {
    var allOut = parts.every(function (p) { return p.target > 0.5; });
    if (allOut) resetAll();
    else explodeAll();
  });
  document.getElementById('btnReset').addEventListener('click', resetAll);
  document.getElementById('btnRotate').addEventListener('click', function () {
    state.rotateOn = !state.rotateOn;
    controls.setAutoRotate(state.rotateOn);
    this.classList.toggle('on', state.rotateOn);
  });
  document.getElementById('btnLabels').addEventListener('click', function () {
    state.labelsOn = !state.labelsOn;
    this.classList.toggle('on', state.labelsOn);
  });
  document.getElementById('btnView').addEventListener('click', function () {
    controls.flyTo(EV.HOME.pos, EV.HOME.target, 800);
  });

  /* ---------------- 移动端抽屉 ---------------- */
  var panelLeft = document.querySelector('.panel.left');
  var panelRight = document.querySelector('.panel.right');
  var mListBtn = document.getElementById('mList');
  var mInfoBtn = document.getElementById('mInfo');
  function closeDrawers() {
    panelLeft.classList.remove('open');
    panelRight.classList.remove('open');
    mListBtn.classList.remove('on');
    mInfoBtn.classList.remove('on');
  }
  function openDrawer(which) {
    var el = which === 'list' ? panelLeft : panelRight;
    var btn = which === 'list' ? mListBtn : mInfoBtn;
    var wasOpen = el.classList.contains('open');
    closeDrawers();
    if (!wasOpen) { el.classList.add('open'); btn.classList.add('on'); }
  }
  mListBtn.addEventListener('click', function () { openDrawer('list'); });
  mInfoBtn.addEventListener('click', function () { openDrawer('info'); });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') clearSelection();
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      var allOut = parts.every(function (p) { return p.target > 0.5; });
      if (allOut) resetAll(); else explodeAll();
    }
    if (e.key === 'r' || e.key === 'R') resetAll();
    if (e.key === 'l' || e.key === 'L') document.getElementById('btnLabels').click();
    if (e.key === 'a' || e.key === 'A') document.getElementById('btnRotate').click();
  });

  /* ---------------- 窗口尺寸 ---------------- */
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    EV.renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------------- 主循环 ---------------- */
  var clock = new T.Clock();
  var elapsed = 0;
  var groundMesh = null;

  function groundPulse(t) {
    if (!groundMesh) {
      EV.scene.traverse(function (o) {
        if (o.isMesh && o.material && o.material.blending === T.AdditiveBlending && o.geometry.type === 'PlaneGeometry') groundMesh = o;
      });
    }
    if (groundMesh) groundMesh.material.opacity = 0.72 + Math.sin(t * 1.4) * 0.08;
  }

  function updateLabels() {
    var w = window.innerWidth, h = window.innerHeight;
    var vis = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], el = labelEls[i];
      var visible = state.labelsOn && (p.t > 0.02 || p === state.selected || p === state.hovered);
      if (!visible) {
        if (el._on) { el.classList.remove('on'); el._on = false; }
        continue;
      }
      tmpV.copy(p.anchor);
      p.group.localToWorld(tmpV);
      tmpV.project(camera);
      if (tmpV.z > 1) {
        if (el._on) { el.classList.remove('on'); el._on = false; }
        continue;
      }
      vis.push({
        el: el, p: p,
        x: (tmpV.x * 0.5 + 0.5) * w,
        y: (-tmpV.y * 0.5 + 0.5) * h
      });
    }

    // 简单的标注避让：同一列内按纵向间距推开
    vis.sort(function (a, b) { return a.y - b.y; });
    for (var a = 0; a < vis.length; a++) {
      for (var b = a + 1; b < vis.length; b++) {
        if (Math.abs(vis[b].x - vis[a].x) < 168 && vis[b].y - vis[a].y < 18) {
          vis[b].y = vis[a].y + 18;
        }
      }
    }

    for (var k = 0; k < vis.length; k++) {
      var it = vis[k];
      it.el.style.transform = 'translate3d(' + it.x.toFixed(1) + 'px,' + it.y.toFixed(1) + 'px,0) translate(-50%,-50%)';
      if (!it.el._on) { it.el.classList.add('on'); it.el._on = true; }
      it.el.classList.toggle('sel', it.p === state.selected);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    var now = performance.now();
    var maxT = 0;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.queueAt && now >= p.queueAt) { p.target = 1; p.queueAt = 0; }
      if (Math.abs(p.t - p.target) > 0.0005) {
        p.t += (p.target - p.t) * (1 - Math.exp(-6.5 * dt));
        if (Math.abs(p.t - p.target) < 0.0015) p.t = p.target;
        applyExplode(p);
      }
      if (p.t > maxT) maxT = p.t;
    }

    var liftTarget = maxT > 0.015 ? 1 : 0;
    state.lift += (liftTarget - state.lift) * (1 - Math.exp(-4.2 * dt));
    EV.carRoot.position.y = state.lift * 0.55;
    for (var li = 0; li < liftPosts.length; li++) {
      liftPosts[li].visible = state.lift > 0.01;
      liftPosts[li].scale.y = Math.max(state.lift * 0.86, 0.001);
    }

    var hk = 1 - Math.exp(-10 * dt);
    for (var j = 0; j < parts.length; j++) {
      var q = parts[j];
      var want = q === state.selected ? 1 : (q === state.hovered ? 0.45 : 0);
      q.glow += (want - q.glow) * hk;
      if (Math.abs(q.glow - (q._lastGlow || 0)) > 0.004) {
        for (var m = 0; m < q.mats.length; m++) {
          var mat = q.mats[m];
          if (q.glow < 0.004) {
            mat.emissive.setHex(mat.userData.baseEmissive);
            mat.emissiveIntensity = mat.userData.baseEmissiveIntensity;
          } else {
            tmpColor.setHex(mat.userData.baseEmissive).lerp(ACCENT, Math.min(1, q.glow * 1.1));
            mat.emissive.copy(tmpColor);
            var boost = q.radius > 1.3 ? 0.14 : 0.32;
            // 自发光材质（灯组等）保留原本强度，普通材质按高亮强度添加
            var lit = mat.userData.baseEmissive !== 0;
            mat.emissiveIntensity = lit
              ? mat.userData.baseEmissiveIntensity
              : q.glow * (boost + 0.04 * Math.sin(elapsed * 5.5));
          }
        }
        q._lastGlow = q.glow;
      }
    }

    var sel = state.selected;
    if (sel && sel.glow > 0.01) {
      var c = sel.group.localToWorld(sel.anchor.clone());
      halo.position.copy(c);
      var sc = T.MathUtils.clamp(sel.radius * 2.2, 1.2, 3.0);
      halo.scale.set(sc, sc, 1);
      halo.material.opacity = sel.glow * (0.10 + 0.03 * Math.sin(elapsed * 4));
    } else {
      halo.material.opacity = 0;
    }

    for (var k2 = 0; k2 < parts.length; k2++) {
      var lp = parts[k2], line = lines[k2];
      if (!line) continue;
      if (lp.t < 0.02) { line.material.opacity = 0; continue; }
      var a = lp.anchor, pos = lp.group.position;
      var arr = line.geometry.attributes.position.array;
      arr[0] = a.x; arr[1] = a.y; arr[2] = a.z;
      arr[3] = a.x + pos.x; arr[4] = a.y + pos.y; arr[5] = a.z + pos.z;
      line.geometry.attributes.position.needsUpdate = true;
      line.computeLineDistances();
      line.material.opacity = Math.min(0.55, lp.t * 0.8);
    }

    controls.update(dt);
    camFill.position.copy(camera.position);
    updateLabels();

    if (EV.particles) {
      EV.particles.rotation.y += dt * 0.012;
      EV.particles.position.y = Math.sin(elapsed * 0.25) * 0.15;
    }
    groundPulse(elapsed);

    EV.renderer.render(EV.scene, EV.camera);
  }

  /* ---------------- 启动 ---------------- */
  renderDetail(null);
  refreshList();
  updateModeChip();
  animate();

  var boot = document.getElementById('boot');
  var bootMsg = document.getElementById('bootMsg');
  if (bootMsg) bootMsg.textContent = 'GEOMETRY READY · 100%';
  setTimeout(function () {
    if (boot) boot.classList.add('hide');
  }, 240);

  // 调试接口
  EV.state = state;
  EV.select = selectPart;
  EV.explodeAll = explodeAll;
  EV.resetAll = resetAll;
  EV.frameAll = frameAll;

  /* ---------------- 深链接：#exploded / #pick:部件ID ---------------- */
  function applyDeepLink() {
    var hash = decodeURIComponent(location.hash || '');
    if (/exploded/.test(hash)) {
      parts.forEach(function (p) {
        p.t = 1; p.target = 1;
        applyExplode(p);
      });
      state.lift = 1;
      EV.carRoot.position.y = 0.55;
      liftPosts.forEach(function (post) { post.visible = true; post.scale.y = 0.86; });
      updateModeChip();
      setTimeout(function () { frameAll(900); }, 120);
    }
    var m = hash.match(/pick:([a-zA-Z]+)/);
    if (m && partsById[m[1]]) {
      var p = partsById[m[1]];
      p.t = 1; p.target = 1;
      applyExplode(p);
      state.selected = p;
      renderDetail(p);
      refreshList();
      updateModeChip();
      state.lift = 1;
      EV.carRoot.position.y = 0.55;
      setTimeout(function () { focusPart(p); }, 60);
    }
  }
  applyDeepLink();
  window.addEventListener('hashchange', applyDeepLink);
})();
