/* ============================================================
   NOVA EV-1 · model.js
   全车几何建模：所有形体由代码生成，无任何外部模型文件
   坐标系：X = 车长（+X 车头）  Y = 车高  Z = 车宽
   ============================================================ */
(function () {
  'use strict';

  var EV = window.EV;
  var T = window.THREE;
  var G = EV.G;
  var M = EV.Mat;

  /* 车辆主要尺寸 */
  var CAR = {
    frontX: 2.40, rearX: -2.40,
    halfW: 0.895,
    wheelR: 0.375,
    axleF: 1.50, axleR: -1.45,
    wheelZ: 0.70,
    bodyBottom: 0.42,
    beltline: 1.05,
    archR: 0.445
  };
  EV.CAR = CAR;

  /* 生成车身侧视轮廓；withArches 时底部带两个真实轮拱开口 */
  function bodyOutline(withArches) {
    var B = CAR.bodyBottom;
    var p = [
      [-2.28, B], [-2.40, 0.58], [-2.38, 0.84], [-2.32, 0.98],
      [-2.06, 1.025], [-1.60, 1.045], [-0.95, 1.05], [-0.10, 1.05],
      [0.70, 1.045], [1.32, 1.035], [1.82, 1.015], [2.16, 0.985],
      [2.34, 0.905], [2.40, 0.78], [2.36, 0.60], [2.27, 0.475], [2.10, B]
    ];
    if (!withArches) return p;

    var R = CAR.archR, cy = CAR.wheelR;
    var a0 = Math.asin((B - cy) / R);
    var dx = Math.cos(a0) * R;

    function archPoints(cx) {
      var out = [];
      for (var i = 1; i <= 16; i++) {
        var a = a0 + (Math.PI - 2 * a0) * (i / 16);
        out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
      }
      return out;
    }

    p.push([CAR.axleF + dx, B]);
    p = p.concat(archPoints(CAR.axleF));
    p.push([CAR.axleR + dx, B]);
    p = p.concat(archPoints(CAR.axleR));
    p.push([-2.10, B]);
    return p;
  }

  EV.buildCar = function () {
    var root = new T.Group();
    root.name = 'EV';
    EV.scene.add(root);
    EV.carRoot = root;

    var parts = [];
    var byId = {};

    /* ---------- 部件注册 ---------- */
    function reg(cfg) {
      var g = new T.Group();
      g.name = cfg.id;
      root.add(g);
      cfg.build(g);

      var mats = [];
      var seen = new Set();
      g.traverse(function (o) {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
        o.userData.partId = cfg.id;
        var list = Array.isArray(o.material) ? o.material : [o.material];
        list.forEach(function (m) {
          if (!m || seen.has(m)) return;
          seen.add(m);
          m.userData.baseEmissive = m.emissive ? m.emissive.getHex() : 0x000000;
          m.userData.baseEmissiveIntensity = m.emissiveIntensity === undefined ? 1 : m.emissiveIntensity;
          mats.push(m);
        });
      });

      var box = new T.Box3().setFromObject(g);
      var center = box.getCenter(new T.Vector3());
      var size = box.getSize(new T.Vector3());

      var part = {
        id: cfg.id,
        code: cfg.code,
        name: cfg.name,
        en: cfg.en,
        cat: cfg.cat,
        group: g,
        dir: new T.Vector3().fromArray(cfg.dir || [0, 1, 0]),
        dist: cfg.dist === undefined ? 1 : cfg.dist,
        rot: cfg.rot ? new T.Vector3().fromArray(cfg.rot) : null,
        custom: cfg.custom || null,
        mats: mats,
        specs: cfg.specs || [],
        desc: cfg.desc || '',
        t: 0, target: 0, queueAt: 0,
        glow: 0, glowTarget: 0,
        anchor: center,
        size: size,
        radius: Math.max(size.x, size.y, size.z) * 0.5
      };
      parts.push(part);
      byId[cfg.id] = part;
      return part;
    }

    function kid(parent, obj, dir, dist) {
      obj.userData.basePos = obj.position.clone();
      obj.userData.explodeDir = new T.Vector3().fromArray(dir || [0, 0, 0]);
      obj.userData.explodeDist = dist === undefined ? 1 : dist;
      parent.add(obj);
      return obj;
    }

    /* ========================================================
       01 车身总成
       ======================================================== */
    var BODY_PROFILE = bodyOutline(true);

    reg({
      id: 'body', code: 'P-01', name: '车身总成', en: 'Body-in-White',
      cat: '车身', dir: [0, 1, 0], dist: 1.25,
      build: function (g) {
        var paint = M.paint(0x4f7086);

        // 主体：侧视轮廓（含轮拱开口）沿 Z 挤出 + 倒角
        var body = G.profile(BODY_PROFILE, 1.62, 0.085, paint);
        g.add(body);

        // 轮拱内衬：填充轮拱通道，形成阴影感
        [CAR.axleF, CAR.axleR].forEach(function (ax) {
          g.add(G.box(0.92, 0.40, 1.70, M.plastic(0x080b0f), ax, 0.645, 0));
        });

        // 车门分缝
        [1, -1].forEach(function (s) {
          [0.52, -0.38, -1.22].forEach(function (x) {
            g.add(G.box(0.010, 0.46, 0.012, M.plastic(0x131b23), x, 0.72, s * 0.897));
          });
          // 门把手
          g.add(G.box(0.16, 0.035, 0.02, M.metal(0x8fa2b1), 0.02, 0.955, s * 0.902));
          g.add(G.box(0.16, 0.035, 0.02, M.metal(0x8fa2b1), -0.82, 0.955, s * 0.902));
        });

        // 肩线高光棱线
        [1, -1].forEach(function (s) {
          g.add(G.box(3.20, 0.012, 0.03, M.paint(0x63879c), -0.10, 0.99, s * 0.899));
        });

        // 侧裙发光饰条
        [1, -1].forEach(function (s) {
          g.add(G.box(2.86, 0.016, 0.012, M.emit(0x38e8ff, 1.15), -0.18, 0.60, s * 0.902));
        });

        // 前下进气 & 后扩散器
        g.add(G.box(0.09, 0.15, 1.42, M.plastic(0x0c1218), 2.325, 0.585, 0));
        g.add(G.box(0.10, 0.13, 1.30, M.plastic(0x0c1218), -2.365, 0.575, 0));
        // 前脸灯刃 + 下格栅
        g.add(G.box(0.022, 0.022, 1.30, M.emit(0xdff6ff, 2.6), 2.352, 0.888, 0));
        g.add(G.box(0.05, 0.15, 1.12, M.plastic(0x080c10), 2.332, 0.64, 0));
        // 尾部黑色饰板
        g.add(G.box(0.035, 0.20, 1.34, M.plastic(0x080c10), -2.378, 0.74, 0));
        // 前唇
        g.add(G.box(0.16, 0.03, 1.62, M.dark(0x151d24), 2.29, 0.505, 0));
        // 后视镜
        [1, -1].forEach(function (s) {
          g.add(G.box(0.10, 0.03, 0.20, M.plastic(0x121a22), 0.74, 1.045, s * 0.95, 0, 0, 0.08));
          g.add(G.box(0.085, 0.085, 0.20, M.paint(0x4f7086), 0.70, 1.06, s * 1.04));
          g.add(G.box(0.02, 0.06, 0.16, M.metal(0x5d7183), 0.735, 1.06, s * 1.145));
        });
        // 车顶激光雷达安装座
        g.add(G.box(0.26, 0.05, 0.24, M.plastic(0x121a22), 0.55, 1.585, 0));
        // 尾部小鸭尾
        g.add(G.box(0.30, 0.025, 1.46, M.paint(0x4f7086), -2.12, 1.05, 0, 0, 0, -0.06));
      },
      specs: [
        ['结构形式', '钢铝混合 + 前舱一体化压铸'],
        ['扭转刚度', '42,000 N·m/deg'],
        ['高强度钢占比', '32%'],
        ['整备质量', '2,180 kg'],
        ['风阻系数', 'Cd 0.208'],
        ['涂装工艺', '9 层纳米陶瓷漆']
      ],
      desc: '前舱采用 9,000 吨一体化压铸件，将原本 79 个零件整合为 1 个，减重 12% 的同时把前舱刚度提升 18%。下车体以 6 系铝合金挤压梁构成环形传力路径，侧碰时可将冲击力分散至电池包框架。'
    });

    /* ========================================================
       02 全景座舱玻璃
       ======================================================== */
    var GLASS_PROFILE = [
      [-1.98, 1.02], [-1.66, 1.22], [-1.18, 1.44], [-0.52, 1.555],
      [0.12, 1.578], [0.64, 1.545], [1.00, 1.44], [1.22, 1.22], [1.36, 1.03]
    ];

    reg({
      id: 'glass', code: 'P-02', name: '全景座舱', en: 'Panoramic Canopy',
      cat: '车身', dir: [0, 1, 0], dist: 1.85,
      build: function (g) {
        g.add(G.profile(GLASS_PROFILE, 1.62, 0.045, M.glass()));

        // 车顶盖板（让玻璃只呈现为风挡与侧窗）
        var roofPts = [
          [-1.12, 1.462], [-0.52, 1.567], [0.12, 1.590], [0.56, 1.562],
          [0.56, 1.536], [0.12, 1.564], [-0.52, 1.541], [-1.12, 1.436]
        ];
        g.add(G.profile(roofPts, 1.60, 0.02, new T.MeshPhysicalMaterial({ color: 0x101a22, metalness: 0.4, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2.0 })));

        // 玻璃边缘金属饰条
        var trim = M.metal(0x7f95a6);
        [1, -1].forEach(function (s) {
          g.add(G.box(2.52, 0.018, 0.016, trim, -0.32, 1.30, s * 0.848, 0, 0, 0.09));
        });
        // B 柱
        [1, -1].forEach(function (s) {
          g.add(G.box(0.055, 0.44, 0.028, M.plastic(0x0d141b), -0.46, 1.30, s * 0.852));
        });
        // 顶部导流鳍
        g.add(G.box(0.55, 0.03, 0.10, M.dark(0x151d24), 0.30, 1.585, 0));
      },
      specs: [
        ['玻璃面积', '2.94 m²'],
        ['结构', '双层夹胶 Low-E 隔音玻璃'],
        ['紫外线隔绝', '99.9%'],
        ['隔音性能', '降低 28 dB'],
        ['调光', '10 级电致变色天幕'],
        ['厚度', '5.2 mm']
      ],
      desc: '一体式玻璃座舱取消传统 A/B 柱分缝，风挡与天幕连成一片。中间层镀 12 层纳米隔热膜，夏季可阻隔 87% 的红外热辐射，因此整车可省去遮阳帘并减重 4.6 kg。'
    });

    /* ========================================================
       03 前机盖
       ======================================================== */
    reg({
      id: 'hood', code: 'P-03', name: '前机盖 · 前备箱', en: 'Frunk Lid',
      cat: '车身', dir: [1, 0.15, 0], dist: 1.20,
      build: function (g) {
        var paint = M.paint(0x4f7086);
        // 机盖面板（沿车身顶面倾斜）
        g.add(G.box(1.10, 0.05, 1.56, paint, 1.68, 1.024, 0, 0, 0, -0.068));
        // 内衬
        g.add(G.box(1.02, 0.02, 1.46, M.dark(0x141c24), 1.68, 0.982, 0, 0, 0, -0.068));
        // 前备箱内胆
        g.add(G.box(0.86, 0.14, 1.16, M.plastic(0x111922), 1.66, 0.905, 0, 0, 0, -0.068));
        // 密封条
        g.add(G.torus(0.42, 0.012, M.rubber(), 1.66, 0.935, 0, Math.PI * 2, Math.PI / 2, 0, 0));
        // 锁扣
        g.add(G.box(0.10, 0.06, 0.16, M.metal(0x8fa0ae), 2.16, 0.90, 0));
      },
      specs: [
        ['材质', '铝硅镁合金 6 系'],
        ['单件质量', '8.6 kg'],
        ['前备箱容积', '62 L'],
        ['开启方式', '电动双撑杆 + 防夹'],
        ['行人保护', '碰撞主动弹起 80 mm']
      ],
      desc: '电驱平台没有发动机，机盖下方被改造成 62 L 前备箱，可竖直放下 20 寸登机箱。机盖使用 1.2 mm 铝板液压成型，配合主动弹起机构满足行人头部保护法规。'
    });

    /* ========================================================
       04 动力电池包
       ======================================================== */
    reg({
      id: 'battery', code: 'P-04', name: '动力电池包', en: 'Battery Pack',
      cat: '三电', dir: [0, -1, 0], dist: 0.78,
      custom: function (g, t) {
        g.children.forEach(function (c) {
          if (!c.userData.explodeDir) return;
          c.position.copy(c.userData.basePos).addScaledVector(c.userData.explodeDir, c.userData.explodeDist * t);
        });
      },
      build: function (g) {
        var tray = new T.Group();
        g.add(tray);

        // 下托盘
        var shell = new T.Group();
        shell.add(G.box(2.42, 0.05, 1.58, M.alu(0x8b9aa7), 0, 0.285, 0));
        shell.add(G.box(2.42, 0.17, 0.035, M.alu(0x8b9aa7), 0, 0.365, 0.775));
        shell.add(G.box(2.42, 0.17, 0.035, M.alu(0x8b9aa7), 0, 0.365, -0.775));
        shell.add(G.box(0.035, 0.17, 1.55, M.alu(0x8b9aa7), 1.20, 0.365, 0));
        shell.add(G.box(0.035, 0.17, 1.55, M.alu(0x8b9aa7), -1.20, 0.365, 0));
        // 液冷板
        shell.add(G.box(2.30, 0.03, 1.44, M.metal(0x6f8394), 0, 0.315, 0));
        // 加强筋
        for (var i = 0; i < 5; i++) {
          shell.add(G.box(0.03, 0.02, 1.50, M.metal(0x5c7183), -1.0 + i * 0.5, 0.305, 0));
        }
        // 高压接插件
        shell.add(G.cyl(0.065, 0.065, 0.12, 20, M.hv(), -1.16, 0.365, 0.55, 0, 0, Math.PI / 2));
        shell.add(G.cyl(0.048, 0.048, 0.10, 18, M.hv(), -1.16, 0.365, -0.55, 0, 0, Math.PI / 2));
        // 冷却液接口
        shell.add(G.cyl(0.035, 0.035, 0.10, 16, M.plastic(0x2b6c8a), 1.22, 0.34, 0.42, 0, 0, Math.PI / 2));
        shell.add(G.cyl(0.035, 0.035, 0.10, 16, M.plastic(0x2b6c8a), 1.22, 0.34, 0.12, 0, 0, Math.PI / 2));
        shell.userData.explodeDir = new T.Vector3(0, -0.94, 0);
        shell.userData.explodeDist = 1;
        shell.userData.basePos = shell.position.clone();
        tray.add(shell);

        // 电芯模组
        var mods = new T.Group();
        var cellMat = M.dark(0x2a3a46);
        var capMat = M.metal(0xb8c6d2);
        for (var ix = 0; ix < 4; ix++) {
          for (var iz = 0; iz < 2; iz++) {
            var mx = -0.88 + ix * 0.585;
            var mz = (iz ? 1 : -1) * 0.375;
            var m = G.box(0.545, 0.135, 0.345, cellMat, mx, 0.365, mz);
            mods.add(m);
            // 极柱/汇流排
            mods.add(G.box(0.50, 0.012, 0.06, capMat, mx, 0.437, mz + 0.09));
            mods.add(G.box(0.50, 0.012, 0.06, capMat, mx, 0.437, mz - 0.09));
            // 采样线束
            mods.add(G.box(0.015, 0.008, 0.30, M.hv(), mx + 0.26, 0.442, mz));
          }
        }
        mods.userData.explodeDir = new T.Vector3(0, -0.46, 0);
        mods.userData.explodeDist = 1;
        mods.userData.basePos = mods.position.clone();
        tray.add(mods);

        // 上盖
        var lid = new T.Group();
        lid.add(G.box(2.40, 0.035, 1.56, M.plastic(0x1d2832), 0, 0.462, 0));
        lid.add(G.box(0.34, 0.006, 0.14, M.emit(0x38e8ff, 1.2), 0.70, 0.482, 0.55));
        lid.add(G.box(0.34, 0.006, 0.14, M.emit(0x38e8ff, 1.2), -0.70, 0.482, -0.55));
        // 防爆阀
        lid.add(G.cyl(0.045, 0.045, 0.02, 16, M.metal(0x9fb0bd), 0.0, 0.482, 0.62));
        lid.userData.explodeDir = new T.Vector3(0, 0.30, 0);
        lid.userData.explodeDist = 1;
        lid.userData.basePos = lid.position.clone();
        tray.add(lid);
      },
      specs: [
        ['总能量', '100 kWh'],
        ['化学体系', 'NCM 811 高镍三元'],
        ['额定电压', '800 V (650–920 V)'],
        ['能量密度', '205 Wh/kg · 412 Wh/L'],
        ['快充能力', '10–80% / 12 min (480 kW)'],
        ['循环寿命', '3,000 次 ≥ 80%'],
        ['防护等级', 'IP68 + IP6K9K']
      ],
      desc: 'CTB（Cell to Body）结构让电芯直接粘接在车身地板下，电池上盖即乘员舱地板，垂向空间节省 10 mm。模组间布置 6 条液冷回路与云母隔热片，单颗电芯热失控可在 30 分钟内不扩散至相邻模组。'
    });

    /* ========================================================
       05 前电驱总成
       ======================================================== */
    function motorUnit(g, x, y, len, r, power, isRear) {
      var mat = M.alu(0x93a2b0);
      var housing = G.cyl(r, r, len, 36, mat, x, y, 0, 0, 0, Math.PI / 2);
      g.add(housing);
      // 散热筋
      for (var i = 0; i < 7; i++) {
        g.add(G.torus(r * 1.005, 0.012, M.dark(0x3a4a58), x - len / 2 + 0.06 + i * (len - 0.12) / 6, y, 0, Math.PI * 2, 0, Math.PI / 2, 0));
      }
      // 端盖
      g.add(G.cyl(r * 0.96, r * 0.9, 0.05, 36, M.metal(0xa9bac7), x + len / 2 - 0.01, y, 0, 0, 0, Math.PI / 2));
      g.add(G.cyl(r * 0.9, r * 0.96, 0.06, 36, M.metal(0x8e9dab), x - len / 2 + 0.02, y, 0, 0, 0, Math.PI / 2));
      // 三相接线盒
      g.add(G.box(0.16, 0.13, 0.19, M.plastic(0x1a2833), x + 0.05, y + r + 0.03, 0.02));
      g.add(G.cyl(0.032, 0.032, 0.10, 14, M.hv(), x + 0.05, y + r + 0.11, 0.02));
      // 铭牌
      g.add(G.box(0.18, 0.005, 0.05, M.emit(0x38e8ff, 0.8), x + 0.02, y + r - 0.01, 0.09));
      // 油冷管路
      g.add(G.tube([[x - 0.2, y + r - 0.02, -0.05], [x - 0.05, y + r + 0.06, -0.12], [x + 0.12, y + r + 0.02, -0.14]], 0.014, M.hv()));
      return g;
    }

    reg({
      id: 'motorF', code: 'P-05', name: '前电驱总成', en: 'Front Drive Unit',
      cat: '三电', dir: [1, 0.08, 0], dist: 1.30,
      build: function (g) {
        motorUnit(g, 1.44, 0.48, 0.44, 0.215, 180, false);
        // 半轴
        [1, -1].forEach(function (s) {
          g.add(G.cyl(0.045, 0.045, 0.34, 16, M.metal(0x8b9aa7), 1.47, 0.40, s * 0.42, 0.06 * s, 0, Math.PI / 2));
        });
        // 悬置
        g.add(G.box(0.16, 0.20, 0.12, M.dark(0x1c2731), 1.28, 0.42, 0.12));
      },
      specs: [
        ['类型', '永磁同步电机 PMSMs'],
        ['峰值功率', '180 kW'],
        ['峰值扭矩', '350 N·m'],
        ['最高转速', '18,000 rpm'],
        ['效率', '97.2% (CLTC 区间)'],
        ['冷却', '油冷 + 水冷复合'],
        ['质量', '74 kg']
      ],
      desc: '前电驱采用 8 层扁线绕组与 0.25 mm 超薄硅钢片，把铁损降低 15%。电机、减速器、控制器三合一集成后轴向长度仅 380 mm，为前备箱腾出空间。'
    });

    /* ========================================================
       06 后电驱总成
       ======================================================== */
    reg({
      id: 'motorR', code: 'P-06', name: '后电驱总成', en: 'Rear Drive Unit',
      cat: '三电', dir: [-1, 0.08, 0], dist: 1.30,
      build: function (g) {
        motorUnit(g, -1.42, 0.50, 0.48, 0.235, 230, true);
        [1, -1].forEach(function (s) {
          g.add(G.cyl(0.05, 0.05, 0.36, 16, M.metal(0x8b9aa7), -1.45, 0.40, s * 0.44, -0.06 * s, 0, Math.PI / 2));
        });
        // 后副车架连接点
        g.add(G.box(0.14, 0.22, 0.14, M.dark(0x1c2731), -1.24, 0.44, -0.14));
      },
      specs: [
        ['类型', '永磁同步 + 碳化硅控制'],
        ['峰值功率', '230 kW'],
        ['峰值扭矩', '450 N·m'],
        ['最高转速', '20,000 rpm'],
        ['功率密度', '4.1 kW/kg'],
        ['冷却', '油冷 (主动喷淋)'],
        ['质量', '86 kg']
      ],
      desc: '后桥为主驱单元，采用 6 极对磁钢与碳纤维转子护套，使转速上限提升至 20,000 rpm。配合 9.8:1 单级减速器，整车 0–100 km/h 加速 3.9 s。'
    });

    /* ========================================================
       07 电机控制器
       ======================================================== */
    reg({
      id: 'inverter', code: 'P-07', name: '电机控制器', en: 'SiC Inverter',
      cat: '三电', dir: [0.45, 0.72, 0], dist: 1.20,
      build: function (g) {
        var base = M.alu(0x93a2b0);
        g.add(G.box(0.46, 0.10, 0.40, base, 1.44, 0.76, 0));
        // 双面水冷板
        g.add(G.box(0.44, 0.02, 0.38, M.metal(0x6f8394), 1.44, 0.815, 0));
        // 功率模块（3 相）
        for (var i = 0; i < 3; i++) {
          g.add(G.box(0.11, 0.055, 0.30, M.dark(0x2a3540), 1.28 + i * 0.16, 0.86, 0));
          g.add(G.box(0.09, 0.004, 0.26, M.copper(), 1.28 + i * 0.16, 0.889, 0));
        }
        // 高压母线
        g.add(G.cyl(0.028, 0.028, 0.34, 12, M.hv(), 1.44, 0.70, 0.16, 0, 0, Math.PI / 2));
        g.add(G.cyl(0.028, 0.028, 0.34, 12, M.hv(), 1.44, 0.70, -0.16, 0, 0, Math.PI / 2));
        // 控制板
        g.add(G.box(0.36, 0.012, 0.30, M.plastic(0x14313a), 1.44, 0.905, 0));
        g.add(G.box(0.06, 0.006, 0.16, M.emit(0x38e8ff, 1.4), 1.44, 0.913, 0));
      },
      specs: [
        ['功率器件', '碳化硅 SiC MOSFET'],
        ['最大电流', '620 A (相电流)'],
        ['开关频率', '20 kHz'],
        ['最高效率', '99.3%'],
        ['冷却', '双面水冷 Pin-Fin'],
        ['控制', 'FOC + 模型预测 (MPC)']
      ],
      desc: '碳化硅模块把开关损耗降低约 70%，使 800 V 母线在高转速区间仍保持 99% 以上效率。控制器与电机共用冷却回路，通过双面水冷把结温控制在 150 ℃ 以内。'
    });

    /* ========================================================
       08 减速器
       ======================================================== */
    reg({
      id: 'gearbox', code: 'P-08', name: '减速器 · 差速器', en: 'Reduction Gearbox',
      cat: '三电', dir: [-1, 0.02, 0], dist: 1.55,
      build: function (g) {
        g.add(G.cyl(0.155, 0.145, 0.26, 30, M.alu(0x8d9caa), -1.78, 0.46, 0, 0, 0, Math.PI / 2));
        // 差速器壳
        g.add(G.sphere(0.13, M.alu(0x8d9caa), -1.92, 0.46, 0, 20));
        // 输入轴
        g.add(G.cyl(0.032, 0.032, 0.22, 14, M.metal(0xa9bac7), -1.62, 0.46, 0, 0, 0, Math.PI / 2));
        // 输出半轴
        [1, -1].forEach(function (s) {
          g.add(G.cyl(0.042, 0.042, 0.30, 14, M.metal(0x8b9aa7), -1.98, 0.46, s * 0.28, 0, 0, Math.PI / 2));
        });
        // 油泵
        g.add(G.cyl(0.045, 0.045, 0.07, 16, M.plastic(0x1b2a35), -1.72, 0.60, 0.10));
      },
      specs: [
        ['速比', '9.8 : 1（单级）'],
        ['传动效率', '97.6%'],
        ['最大输入扭矩', '480 N·m'],
        ['齿轮工艺', '激光焊接 + 磨齿 6 级'],
        ['润滑', '电子油泵主动润滑'],
        ['噪声', '≤ 62 dB(A)']
      ],
      desc: '单级斜齿轮减速器把 20,000 rpm 降至 2,040 rpm。差速器集成于壳体内部，采用电子油泵按需供油，在低负荷巡航时可将搅油损失降低 40%。'
    });

    /* ========================================================
       09 高压配电盒
       ======================================================== */
    reg({
      id: 'hvb', code: 'P-09', name: '高压配电盒', en: 'HV Junction Box',
      cat: '三电', dir: [0.30, 0.95, 0], dist: 1.00,
      build: function (g) {
        g.add(G.box(0.34, 0.22, 0.44, M.alu(0x93a2b0), 0.86, 0.66, 0.02));
        // 上盖与散热片
        g.add(G.box(0.30, 0.02, 0.40, M.metal(0x6f8394), 0.86, 0.78, 0.02));
        for (var i = 0; i < 5; i++) {
          g.add(G.box(0.28, 0.035, 0.012, M.metal(0x8496a4), 0.86, 0.80, -0.14 + i * 0.07));
        }
        // 熔断器 & 继电器
        g.add(G.cyl(0.032, 0.032, 0.12, 14, M.copper(), 0.74, 0.70, 0.14));
        g.add(G.box(0.07, 0.08, 0.07, M.plastic(0x1b2a35), 0.98, 0.70, -0.10));
        // 高压线束出口
        g.add(G.cyl(0.03, 0.03, 0.16, 12, M.hv(), 0.70, 0.62, -0.16, 0, 0, Math.PI / 2));
        g.add(G.cyl(0.03, 0.03, 0.16, 12, M.hv(), 1.02, 0.62, 0.16, 0, 0, Math.PI / 2));
        // 状态指示灯
        g.add(G.box(0.04, 0.006, 0.04, M.emit(0x38e8ff, 2.2), 0.70, 0.79, 0.20));
      },
      specs: [
        ['母线电压', '800 V DC'],
        ['额定电流', '400 A / 峰值 800 A'],
        ['熔断器', '800 A 高压直流'],
        ['功能', '预充 / 绝缘监测 / 主动放电'],
        ['防护等级', 'IP67'],
        ['通信', 'CAN-FD + 以太网']
      ],
      desc: '高压配电盒是整个 800 V 系统的"总闸"，内部集成主正负继电器、预充电阻、800 A 熔断器与绝缘监测模块。碰撞信号触发后 5 ms 内切断高压，并将母线电压在 3 s 内泄放至 60 V 以下。'
    });

    /* ========================================================
       10 快充接口
       ======================================================== */
    reg({
      id: 'charging', code: 'P-10', name: '快充接口', en: 'Charging Port',
      cat: '三电', dir: [0, 0.22, 1], dist: 1.00,
      build: function (g) {
        g.add(G.box(0.22, 0.26, 0.06, M.plastic(0x101820), -1.78, 0.86, 0.895));
        g.add(G.cyl(0.075, 0.075, 0.05, 26, M.dark(0x1e2a34), -1.78, 0.86, 0.925, Math.PI / 2, 0, 0));
        g.add(G.torus(0.075, 0.008, M.emit(0x38e8ff, 1.6), -1.78, 0.86, 0.935, Math.PI * 2, 0, 0, 0));
        // 端子
        for (var i = 0; i < 4; i++) {
          var a = (i / 4) * Math.PI * 2 + 0.4;
          g.add(G.cyl(0.011, 0.011, 0.04, 8, M.copper(), -1.78 + Math.cos(a) * 0.038, 0.86 + Math.sin(a) * 0.038, 0.928, Math.PI / 2, 0, 0));
        }
        // 充电口盖
        g.add(G.cyl(0.085, 0.085, 0.02, 26, M.paint(0x4f7086), -1.78, 0.86, 0.912, Math.PI / 2, 0, 0));
      },
      specs: [
        ['接口标准', '国标 GB/T 直流 + 交流'],
        ['最大直流功率', '480 kW (800 V / 600 A)'],
        ['最大交流功率', '22 kW (三相)'],
        ['V2L 外放电', '6 kW'],
        ['充电 10–80%', '12 min'],
        ['位置', '左后翼子板']
      ],
      desc: '800 V 高压平台让同样的电流可以传输双倍功率，因此 480 kW 超充只需 600 A。接口内置温度传感器，插枪后可自动识别桩端能力并协商充电曲线，同时支持 6 kW 对外放电供露营设备使用。'
    });

    /* ========================================================
       11 热管理系统
       ======================================================== */
    reg({
      id: 'thermal', code: 'P-11', name: '热管理系统', en: 'Thermal System',
      cat: '三电', dir: [1, 0.12, 0], dist: 1.55,
      build: function (g) {
        // 前端散热器
        g.add(G.box(0.05, 0.46, 1.16, M.metal(0x71879a), 2.16, 0.70, 0));
        for (var i = 0; i < 16; i++) {
          g.add(G.box(0.035, 0.44, 0.010, M.alu(0x9aabb8), 2.16, 0.70, -0.54 + i * 0.072));
        }
        // 冷却风扇
        [1, -1].forEach(function (s) {
          var cy = 0.70, cz = s * 0.32;
          g.add(G.torus(0.17, 0.016, M.dark(0x1a242e), 2.10, cy, cz, Math.PI * 2, 0, Math.PI / 2, 0));
          for (var b = 0; b < 7; b++) {
            var blade = G.box(0.012, 0.16, 0.05, M.plastic(0x22303b), 2.10, cy, cz);
            blade.geometry.translate(0, 0.085, 0);
            blade.rotation.x = (b / 7) * Math.PI * 2;
            g.add(blade);
          }
        });
        // 电子水泵
        g.add(G.cyl(0.068, 0.068, 0.13, 20, M.plastic(0x1c3b47), 1.80, 0.36, 0.52, 0, 0, Math.PI / 2));
        g.add(G.cyl(0.068, 0.068, 0.13, 20, M.plastic(0x1c3b47), 1.62, 0.36, -0.46, 0, 0, Math.PI / 2));
        // 膨胀水壶
        g.add(G.box(0.16, 0.14, 0.20, M.plastic(0x2a3a44), 1.44, 0.86, -0.30));
        // 冷却管路（前 → 电池 → 电机）
        var pipe = M.plastic(0x2e6d86);
        g.add(G.tube([[2.10, 0.78, 0.44], [1.92, 0.58, 0.55], [1.55, 0.42, 0.52], [1.24, 0.40, 0.46]], 0.022, pipe));
        g.add(G.tube([[2.10, 0.62, -0.46], [1.85, 0.44, -0.56], [1.45, 0.38, -0.52], [1.24, 0.38, -0.44]], 0.022, pipe));
        g.add(G.tube([[-1.22, 0.40, 0.44], [-1.30, 0.44, 0.28], [-1.30, 0.52, 0.06]], 0.018, pipe));
        // 热泵单元
        g.add(G.cyl(0.13, 0.13, 0.12, 24, M.metal(0x8e9dab), 1.98, 0.94, -0.24, 0, 0, Math.PI / 2));
      },
      specs: [
        ['架构', '宽温域热泵 + 电机余热回收'],
        ['工作温度', '−30 ℃ ~ 55 ℃'],
        ['冷却回路', '6 路独立控制'],
        ['电子水泵', '3 台 (可变流量)'],
        ['制热 COP', '2.8 @ −10 ℃'],
        ['冬季续航保持', '较 PTC 方案 +18%']
      ],
      desc: '整车共 6 条冷却回路：电池、前电驱、后电驱、控制器、座舱、热泵。低温时电机余热会被回收用于加热电池，使 −10 ℃ 环境下快充功率仍能维持 120 kW 以上。'
    });

    /* ========================================================
       12 车轮组
       ======================================================== */
    function buildWheel(x, z, side) {
      var w = new T.Group();
      w.position.set(x, CAR.wheelR, z);

      // 轮胎（旋转体）
      var prof = [[0.20, -0.115], [0.29, -0.128], [0.345, -0.108], [0.368, -0.058],
      [0.375, 0], [0.368, 0.058], [0.345, 0.108], [0.29, 0.128], [0.20, 0.115]];
      var pts = prof.map(function (p) { return new T.Vector2(p[0], p[1]); });
      var tireGeo = new T.LatheGeometry(pts, 44);
      var tire = new T.Mesh(tireGeo, M.rubber());
      tire.rotation.x = Math.PI / 2;
      w.add(tire);

      // 轮辋盘面（深色底）
      var rimMat = M.metal(0xb9c8d4);
      w.add(G.cyl(0.225, 0.225, 0.02, 34, M.dark(0x202b36), 0, 0, -side * 0.03, Math.PI / 2, 0, 0));
      // 辐条
      for (var i = 0; i < 5; i++) {
        var spoke = G.box(0.05, 0.195, 0.03, rimMat, 0, 0, side * 0.024);
        spoke.geometry.translate(0, 0.105, 0);
        spoke.rotation.z = (i / 5) * Math.PI * 2;
        w.add(spoke);
      }
      // 轮唇
      w.add(G.torus(0.228, 0.012, rimMat, 0, 0, side * 0.022, Math.PI * 2, 0, 0, 0));
      // 中心盖 + 发光环
      w.add(G.cyl(0.052, 0.052, 0.03, 20, M.dark(0x1c2731), 0, 0, side * 0.045, Math.PI / 2, 0, 0));
      w.add(G.torus(0.086, 0.007, M.emit(0x38e8ff, 1.6), 0, 0, side * 0.044, Math.PI * 2, 0, 0, 0));
      return w;
    }

    reg({
      id: 'wheels', code: 'P-12', name: '车轮组 ×4', en: 'Wheels & Tyres',
      cat: '底盘', dir: [0, 0, 0], dist: 0,
      custom: function (g, t) {
        g.children.forEach(function (c) {
          if (!c.userData.explodeDir) return;
          c.position.copy(c.userData.basePos).addScaledVector(c.userData.explodeDir, c.userData.explodeDist * t);
        });
      },
      build: function (g) {
        [[CAR.axleF, 1], [CAR.axleF, -1], [CAR.axleR, 1], [CAR.axleR, -1]].forEach(function (c) {
          var w = buildWheel(c[0], CAR.wheelZ * c[1], c[1]);
          kid(g, w, [0, 0.10, c[1] * 1.45], 1);
        });
      },
      specs: [
        ['规格', '265/40 R21'],
        ['轮辋', '21" 锻造铝合金'],
        ['单只质量', '12.8 kg (含胎)'],
        ['轮胎', '低滚阻静音棉'],
        ['滚阻系数', '5.9 ‰'],
        ['轮毂比', '0.98 (低风阻)']
      ],
      desc: '四只 21 英寸锻造轮辋单只仅 12.8 kg，比铸造件轻 22%。轮胎内侧贴有吸音棉，可将 200–400 Hz 的空腔噪声降低 5 dB，并采用低滚阻配方把 CLTC 续航提升约 3%。'
    });

    /* ========================================================
       13 制动系统
       ======================================================== */
    reg({
      id: 'brakes', code: 'P-13', name: '制动系统', en: 'Braking System',
      cat: '底盘', dir: [0, 0, 0], dist: 0,
      custom: function (g, t) {
        g.children.forEach(function (c) {
          if (!c.userData.explodeDir) return;
          c.position.copy(c.userData.basePos).addScaledVector(c.userData.explodeDir, c.userData.explodeDist * t);
        });
      },
      build: function (g) {
        [[CAR.axleF, 1, 0.395], [CAR.axleF, -1, 0.395], [CAR.axleR, 1, 0.355], [CAR.axleR, -1, 0.355]].forEach(function (c) {
          var grp = new T.Group();
          grp.position.set(c[0], CAR.wheelR, CAR.wheelZ * c[1] * 0.72);
          // 通风打孔盘
          grp.add(G.cyl(c[2], c[2], 0.028, 36, M.metal(0x9aa8b5), 0, 0, 0, Math.PI / 2, 0, 0));
          grp.add(G.torus(c[2] * 0.99, 0.012, M.metal(0x7d8d9b), 0, 0, 0, Math.PI * 2, 0, 0, 0));
          grp.add(G.cyl(0.085, 0.085, 0.045, 22, M.dark(0x2b3944), 0, 0, 0.02, Math.PI / 2, 0, 0));
          // 卡钳
          grp.add(G.box(0.10, 0.22, 0.075, M.emit(0xff5a1f, 0.35), c[2] * 0.72, 0.06, 0.045, 0, 0, 0.5));
          kid(g, grp, [0, 0.02, c[1] * 1.02], 1);
        });
      },
      specs: [
        ['前制动', '380 mm 通风打孔盘 + 四活塞'],
        ['后制动', '350 mm 通风盘 + 单活塞'],
        ['100–0 km/h', '33.8 m'],
        ['动能回收', '最大 0.3 g 减速度'],
        ['线控制动', 'One-Box 集成式'],
        ['热衰退', '连续 10 次 ≤ 2% 衰减']
      ],
      desc: '采用 One-Box 线控制动，取消传统真空助力器，踏板与卡钳解耦——日常驾驶中 90% 的减速由后轴电机回收完成，机械制动仅在 0.3 g 以上或紧急工况介入。'
    });

    /* ========================================================
       14 悬架总成
       ======================================================== */
    reg({
      id: 'suspension', code: 'P-14', name: '悬架总成', en: 'Air Suspension',
      cat: '底盘', dir: [0, 0, 0], dist: 0,
      custom: function (g, t) {
        g.children.forEach(function (c) {
          if (!c.userData.explodeDir) return;
          c.position.copy(c.userData.basePos).addScaledVector(c.userData.explodeDir, c.userData.explodeDist * t);
        });
      },
      build: function (g) {
        [[CAR.axleF, 1, 1], [CAR.axleF, -1, 1], [CAR.axleR, 1, -1], [CAR.axleR, -1, -1]].forEach(function (c) {
          var grp = new T.Group();
          grp.position.set(c[0], 0.42, CAR.wheelZ * c[1] * 0.62);
          var armMat = M.dark(0x263440);

          // 下摆臂
          grp.add(G.box(0.52, 0.055, 0.10, armMat, 0, 0, 0, 0, 0.16 * c[1], 0));
          grp.add(G.box(0.10, 0.055, 0.26, armMat, 0.20, 0, -0.12 * c[1], 0, 0.5 * c[1], 0));
          // 上摆臂（双叉臂）
          grp.add(G.box(0.36, 0.045, 0.09, armMat, -0.02, 0.18, -0.02 * c[1], 0, 0.2 * c[1], 0));
          // 转向节
          grp.add(G.box(0.10, 0.30, 0.13, M.alu(0x8d9caa), 0.24, 0.08, 0));
          // 空气弹簧 + CDC 减振器
          var strut = new T.Group();
          strut.position.set(0.05, 0.16, 0.05 * c[1]);
          strut.add(G.cyl(0.048, 0.048, 0.30, 18, M.metal(0xa9bac7), 0, 0.10, 0, 0, 0, -0.10 * c[1]));
          strut.add(G.cyl(0.085, 0.085, 0.10, 22, M.dark(0x1c2833), 0, 0.22, 0, 0, 0, -0.10 * c[1]));
          strut.add(G.cyl(0.075, 0.09, 0.13, 22, M.plastic(0x1b2a35), 0, 0.03, 0, 0, 0, -0.10 * c[1]));
          var spring = G.helix(0.078, 0.24, 5.5, 0.011, M.accentMetal());
          spring.position.set(0, 0.06, 0);
          spring.rotation.z = -0.10 * c[1];
          strut.add(spring);
          grp.add(strut);

          kid(g, grp, [0, -0.12, c[1] * 0.78], 1);
        });
      },
      specs: [
        ['前悬架', '双叉臂 + 虚拟主销'],
        ['后悬架', '五连杆独立'],
        ['弹簧', '三腔空气弹簧'],
        ['减振器', 'CDC 电磁阀连续可调'],
        ['调节范围', '±45 mm'],
        ['调节频率', '100 次/秒']
      ],
      desc: '前双叉臂把主销偏距压到 12 mm，转向手感更直接；后五连杆将纵向与侧向力解耦，使后排垂向加速度降低 18%。CDC 减振器每秒扫描 100 次路面，可在 10 ms 内完成阻尼切换。'
    });

    /* ========================================================
       15 底盘骨架
       ======================================================== */
    reg({
      id: 'chassis', code: 'P-15', name: '底盘骨架', en: 'Chassis Frame',
      cat: '底盘', dir: [0, -1, 0], dist: 0.44,
      build: function (g) {
        var mat = M.alu(0x8496a4);
        // 纵梁
        g.add(G.box(4.10, 0.085, 0.10, mat, -0.05, 0.475, 0.50));
        g.add(G.box(4.10, 0.085, 0.10, mat, -0.05, 0.475, -0.50));
        // 横梁
        [-1.95, -0.70, 0.70, 1.95].forEach(function (x) {
          g.add(G.box(0.09, 0.075, 1.10, mat, x, 0.475, 0));
        });
        // 前后副车架
        g.add(G.box(0.86, 0.10, 1.24, M.dark(0x1e2a34), 1.42, 0.44, 0));
        g.add(G.box(0.86, 0.10, 1.24, M.dark(0x1e2a34), -1.42, 0.44, 0));
        // 电池包安装点
        for (var i = 0; i < 4; i++) {
          g.add(G.cyl(0.055, 0.055, 0.10, 12, M.metal(0xb4c3cf), -1.05 + i * 0.70, 0.505, 0.48));
          g.add(G.cyl(0.055, 0.055, 0.10, 12, M.metal(0xb4c3cf), -1.05 + i * 0.70, 0.505, -0.48));
        }
        // 门槛梁
        g.add(G.box(3.30, 0.12, 0.09, mat, -0.20, 0.545, 0.80));
        g.add(G.box(3.30, 0.12, 0.09, mat, -0.20, 0.545, -0.80));
      },
      specs: [
        ['形式', '滑板式承载底盘'],
        ['材料', '6 系铝合金挤压型材'],
        ['连接工艺', 'SPR 自冲铆 + 结构胶'],
        ['电池安装点', '8 点法兰螺栓'],
        ['弯曲刚度', '18,500 N/mm'],
        ['质量', '196 kg']
      ],
      desc: '滑板式底盘把电池包作为结构件参与传力：8 个 M14 法兰螺栓把电池上盖与门槛梁刚性连接，使整车扭转刚度提升 22%，同时电池包本身成为碰撞时的能量吸收层。'
    });

    /* ========================================================
       16 转向系统
       ======================================================== */
    reg({
      id: 'steering', code: 'P-16', name: '转向系统', en: 'Steering System',
      cat: '底盘', dir: [0.10, 1, 0], dist: 0.62,
      build: function (g) {
        // 线控转向齿条
        g.add(G.box(0.11, 0.09, 1.24, M.dark(0x25323d), 1.34, 0.40, 0));
        [1, -1].forEach(function (s) {
          g.add(G.cyl(0.028, 0.028, 0.24, 12, M.metal(0x9aa8b5), 1.34, 0.40, s * 0.66, 0, 0, 0));
          g.add(G.box(0.06, 0.06, 0.16, M.metal(0x8b9aa7), 1.34, 0.40, s * 0.80));
        });
        // 转向电机
        g.add(G.cyl(0.075, 0.075, 0.16, 20, M.plastic(0x1b3a46), 1.22, 0.40, 0.48, 0, 0, Math.PI / 2));
        // 转向柱
        g.add(G.cyl(0.04, 0.045, 0.56, 14, M.dark(0x25323d), 0.98, 0.72, 0.38, 0, 0, 0.62));
        // 方向盘
        var wheel = new T.Group();
        wheel.position.set(0.72, 0.99, 0.38);
        wheel.rotation.y = Math.PI / 2 - 0.18;
        wheel.add(G.torus(0.155, 0.022, M.plastic(0x141d25), 0, 0, 0));
        wheel.add(G.torus(0.155, 0.006, M.emit(0x38e8ff, 0.9), 0, 0, 0.005));
        wheel.add(G.box(0.30, 0.045, 0.035, M.plastic(0x141d25), 0, 0, 0));
        wheel.add(G.box(0.035, 0.15, 0.035, M.plastic(0x141d25), 0, -0.07, 0));
        wheel.add(G.cyl(0.045, 0.045, 0.03, 16, M.metal(0x8b9aa7), 0, 0, 0, Math.PI / 2, 0, 0));
        g.add(wheel);
      },
      specs: [
        ['类型', '线控转向 (Steer-by-Wire)'],
        ['传动比', '9.5:1 ~ 15:1 可变'],
        ['方向盘圈数', '1.9 圈 (可变)'],
        ['后轮转向', '±5°'],
        ['最小转弯半径', '5.1 m'],
        ['冗余', '双绕组电机 + 双 ECU']
      ],
      desc: '线控转向彻底取消机械连接，转向手感由电机模拟，可根据车速在 9.5:1 与 15:1 之间无级变化。配合后轮 ±5° 反向转动，这台 4.8 米长的车最小转弯半径只有 5.1 m。'
    });

    /* ========================================================
       17 前灯组
       ======================================================== */
    reg({
      id: 'lightsF', code: 'P-17', name: '前灯组', en: 'Matrix LED',
      cat: '灯光', dir: [1, 0.08, 0], dist: 1.15,
      build: function (g) {
        [1, -1].forEach(function (s) {
          var grp = new T.Group();
          grp.position.set(2.315, 0.845, s * 0.52);
          // 灯腔
          grp.add(G.box(0.10, 0.10, 0.42, M.plastic(0x0a1016), 0, 0, 0));
          // 日行灯带
          grp.add(G.box(0.035, 0.022, 0.44, M.emit(0xd8f6ff, 3.2), 0.035, 0.03, 0));
          // 主透镜
          grp.add(G.cyl(0.038, 0.038, 0.04, 20, M.emit(0xcfefff, 2.6), 0.045, -0.01, -0.08, 0, 0, Math.PI / 2));
          grp.add(G.cyl(0.038, 0.038, 0.04, 20, M.emit(0xcfefff, 2.6), 0.045, -0.01, 0.08, 0, 0, Math.PI / 2));
          // 像素模块
          grp.add(G.box(0.02, 0.05, 0.36, M.metal(0x5c7183), 0.045, -0.02, 0));
          // 灯光光晕
          var glow = new T.Sprite(new T.SpriteMaterial({
            map: EV.glowTex, color: 0xd8f4ff, transparent: true,
            blending: T.AdditiveBlending, depthWrite: false, opacity: 0.5
          }));
          glow.scale.set(0.95, 0.26, 1);
          glow.position.set(2.372, 0.862, 0);
          grp.add(glow);
          g.add(grp);
        });
      },
      specs: [
        ['类型', '矩阵式 LED (84 像素)'],
        ['最远照射', '320 m'],
        ['自适应远光', 'ADB 分区遮蔽'],
        ['转向辅助', '随动 ±15°'],
        ['功耗', '单侧 42 W'],
        ['迎宾功能', '灯语投影']
      ],
      desc: '每侧 84 颗独立可控 LED 组成矩阵模组，通过前视摄像头识别对向来车并逐像素遮蔽，既保持远光又不炫目。灯带同时承担迎宾灯语与充电进度指示。'
    });

    /* ========================================================
       18 贯穿尾灯
       ======================================================== */
    reg({
      id: 'lightsR', code: 'P-18', name: '贯穿尾灯', en: 'Rear Light Bar',
      cat: '灯光', dir: [-1, 0.08, 0], dist: 1.15,
      build: function (g) {
        g.add(G.box(0.05, 0.05, 1.44, M.emit(0xff2d3f, 2.2), -2.335, 0.94, 0));
        g.add(G.box(0.04, 0.02, 1.50, M.emit(0xff5a5a, 1.2), -2.325, 0.905, 0));
        // 两端加宽灯组
        [1, -1].forEach(function (s) {
          g.add(G.box(0.05, 0.085, 0.24, M.emit(0xff2d3f, 2.6), -2.335, 0.93, s * 0.66));
        });
        // 灯壳
        g.add(G.box(0.03, 0.13, 1.52, M.plastic(0x0a1016), -2.30, 0.93, 0));
        // 尾灯光晕
        var rglow = new T.Sprite(new T.SpriteMaterial({
          map: EV.glowTex, color: 0xff3a4a, transparent: true,
          blending: T.AdditiveBlending, depthWrite: false, opacity: 0.55
        }));
        rglow.scale.set(1.85, 0.42, 1);
        rglow.position.set(-2.372, 0.935, 0);
        g.add(rglow);
        // 后摄像头
        g.add(G.cyl(0.022, 0.022, 0.03, 14, M.dark(0x0a1016), -2.345, 0.80, 0, 0, 0, Math.PI / 2));
      },
      specs: [
        ['形式', '1.44 m 无缝贯穿灯带'],
        ['LED 数量', '232 颗'],
        ['点亮响应', '8 ms'],
        ['功能', '制动 / 转向 / 迎宾 / 充电指示'],
        ['亮度', '1,200 cd/m²'],
        ['防水等级', 'IP67']
      ],
      desc: '1.44 m 一体式导光条由 232 颗 LED 侧向注入，通过激光雕刻的微结构均匀出光，肉眼看不到颗粒感。充电时灯带会从左到右渐进点亮显示 SOC。'
    });

    /* ========================================================
       19 智驾传感器
       ======================================================== */
    reg({
      id: 'lidar', code: 'P-19', name: '智驾传感器组', en: 'ADAS Sensors',
      cat: '智能', dir: [0.50, 0.40, 1], dist: 1.50,
      build: function (g) {
        // 顶部激光雷达
        var lidar = new T.Group();
        lidar.position.set(0.55, 1.615, 0);
        lidar.add(G.cyl(0.085, 0.09, 0.055, 28, M.dark(0x1a242e), 0, 0, 0));
        lidar.add(G.cyl(0.075, 0.075, 0.045, 28, M.plastic(0x0d151c), 0, 0.048, 0));
        lidar.add(G.sphere(0.072, M.glass(), 0, 0.062, 0, 24));
        lidar.add(G.torus(0.082, 0.006, M.emit(0x38e8ff, 1.8), 0, 0.045, 0, Math.PI * 2, Math.PI / 2, 0, 0));
        g.add(lidar);

        // 前视双目
        g.add(G.box(0.03, 0.05, 0.12, M.dark(0x0a1016), 1.18, 1.20, 0));
        // 前毫米波雷达
        g.add(G.box(0.04, 0.07, 0.14, M.plastic(0x111a22), 2.30, 0.66, 0));
        // 角雷达 ×4
        [[2.10, 0.62, 0.80], [2.10, 0.62, -0.80], [-2.18, 0.68, 0.80], [-2.18, 0.68, -0.80]].forEach(function (p) {
          g.add(G.box(0.05, 0.06, 0.05, M.plastic(0x111a22), p[0], p[1], p[2]));
        });
        // 侧后视摄像头
        [1, -1].forEach(function (s) {
          g.add(G.box(0.02, 0.03, 0.03, M.dark(0x0a1016), 0.68, 1.06, s * 1.14));
        });
        // 计算单元
        g.add(G.box(0.26, 0.08, 0.30, M.alu(0x93a2b0), -0.60, 0.62, 0.30));
        g.add(G.box(0.20, 0.005, 0.22, M.emit(0x38e8ff, 1.1), -0.60, 0.66, 0.30));
      },
      specs: [
        ['激光雷达', '128 线 · 200 m · 1550 nm'],
        ['毫米波雷达', '5 颗 (1 前 + 4 角)'],
        ['摄像头', '11 颗 8MP'],
        ['计算平台', '2× Orin-X · 508 TOPS'],
        ['感知时延', '< 80 ms'],
        ['功能等级', 'L2++ / 高速 + 城市领航']
      ],
      desc: '车顶 1550 nm 激光雷达在雨雾天仍可保持 200 m 探测，与 5 颗毫米波、11 颗摄像头形成三重冗余。双 Orin-X 互为备份，任一芯片失效仍可完成安全靠边。'
    });

    /* ========================================================
       20 座舱内饰
       ======================================================== */
    reg({
      id: 'seats', code: 'P-20', name: '座舱内饰', en: 'Interior & Seats',
      cat: '智能', dir: [0, 1, 0], dist: 0.42,
      build: function (g) {
        var leather = M.plastic(0x3c464f);
        var trim = M.alu(0x6d7f8d);

        function seat(x, z, rear) {
          var s = new T.Group();
          s.position.set(x, 0, z);
          // 坐垫
          s.add(G.box(0.50, 0.11, 0.44, leather, 0, 0.72, 0));
          s.add(G.box(0.46, 0.03, 0.40, M.plastic(0x4b555e), 0, 0.785, 0));
          // 靠背
          var back = G.box(0.13, 0.56, 0.44, leather, -0.22, 1.01, 0, 0, 0, 0.16);
          s.add(back);
          // 头枕
          s.add(G.box(0.13, 0.17, 0.24, leather, -0.25, 1.32, 0, 0, 0, 0.16));
          // 侧翼
          [1, -1].forEach(function (k) {
            s.add(G.box(0.42, 0.10, 0.05, M.plastic(0x4b555e), 0.02, 0.78, k * 0.21));
          });
          // 滑轨
          s.add(G.box(0.52, 0.05, 0.06, trim, 0, 0.66, 0.16));
          s.add(G.box(0.52, 0.05, 0.06, trim, 0, 0.66, -0.16));
          return s;
        }

        g.add(seat(0.12, 0.40));
        g.add(seat(0.12, -0.40));
        // 后排
        var rear = new T.Group();
        rear.position.set(-1.05, 0, 0);
        rear.add(G.box(0.46, 0.11, 1.16, leather, 0, 0.72, 0));
        rear.add(G.box(0.14, 0.52, 1.16, leather, -0.24, 1.0, 0, 0, 0, 0.14));
        rear.add(G.box(0.12, 0.16, 0.95, leather, -0.28, 1.30, 0, 0, 0, 0.14));
        g.add(rear);

        // 仪表台
        g.add(G.box(0.30, 0.20, 1.56, M.plastic(0x39434c), 0.98, 0.90, 0, 0, 0, -0.08));
        g.add(G.box(0.02, 0.16, 1.30, M.plastic(0x2d3740), 0.83, 0.90, 0, 0, 0, 0));
        // 中控屏
        g.add(G.box(0.02, 0.22, 0.40, M.screen(), 0.80, 0.95, 0, 0, 0, 0));
        // 副驾屏
        g.add(G.box(0.015, 0.12, 0.26, M.screen(), 0.82, 0.92, 0.62));
        // 中央通道
        g.add(G.box(0.62, 0.13, 0.22, M.plastic(0x1e262e), 0.42, 0.63, 0));
        g.add(G.box(0.10, 0.05, 0.14, M.emit(0x38e8ff, 0.6), 0.42, 0.70, 0));
        // 车门内饰板
        [1, -1].forEach(function (s) {
          g.add(G.box(2.30, 0.30, 0.05, M.plastic(0x222a32), -0.10, 0.86, s * 0.845));
          g.add(G.box(2.10, 0.02, 0.01, M.emit(0x38e8ff, 1.0), -0.10, 0.75, s * 0.872));
        });
        // 顶棚氛围灯
        g.add(G.box(1.60, 0.012, 0.03, M.emit(0x8a7bff, 1.4), -0.40, 1.545, 0.55));
        g.add(G.box(1.60, 0.012, 0.03, M.emit(0x8a7bff, 1.4), -0.40, 1.545, -0.55));
      },
      specs: [
        ['座椅', '零重力前排 · 22 向电动'],
        ['功能', '通风 / 加热 / 10 点按摩'],
        ['材质', 'Nappa 真皮 + 超纤'],
        ['音响', '23 扬声器 · 1,800 W'],
        ['中控屏', '15.6" 2.5K 分辨率'],
        ['氛围灯', '256 色 · 42 处']
      ],
      desc: '前排零重力座椅支持 128° 躺平，座垫发泡采用双层密度设计，长途压力分布更均匀。23 扬声器音响含 4 只天空声道，配合整车 32 处声学包，怠速车内噪声仅 32 dB。'
    });

    EV.parts = parts;
    EV.partsById = byId;
    return parts;
  };
})();
