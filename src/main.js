import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const loadingText = document.querySelector('#loadingText');
const errorBox = document.querySelector('#errorBox');

const state = {
  tour: true,
  paused: false,
  freeExplore: false,
  quality: 'high',
  sound: false,
  elapsed: 0,
  tourTime: 0,
};

const world = {
  animated: [],
  walkers: [],
  boats: [],
  animals: [],
  banners: [],
  smoke: [],
  lanterns: [],
};

let renderer;
let scene;
let camera;
let controls;
let clock;
let audioContext;
let ambientGain;
let resizeObserver;

const palette = {
  sky: 0xc7c0aa,
  fog: 0xbab39f,
  earth: 0x82715b,
  road: 0xa18d70,
  wood: 0x5d3f29,
  darkWood: 0x3f2b1d,
  roof: 0x4d5048,
  plaster: 0xb8a889,
  river: 0x516f6c,
  reed: 0x6f7750,
  lacquer: 0x73372c,
  gold: 0xc4a261,
};

const tourStops = [
  {
    kicker: '第一景',
    title: '汴河晨霧',
    description: '貨船沿河而行，城市在柔和晨光中甦醒。',
    position: new THREE.Vector3(22, 24, 132),
    target: new THREE.Vector3(0, 5, 72),
    duration: 12,
  },
  {
    kicker: '第二景',
    title: '河岸碼頭',
    description: '船夫靠岸，挑夫把糧袋、木箱與布匹搬上市集。',
    position: new THREE.Vector3(55, 15, 72),
    target: new THREE.Vector3(25, 4, 42),
    duration: 12,
  },
  {
    kicker: '第三景',
    title: '虹橋百業',
    description: '虹橋橫跨汴河，橋上行旅、商販與牲口絡繹不絕。',
    position: new THREE.Vector3(54, 27, 28),
    target: new THREE.Vector3(0, 6, 0),
    duration: 15,
  },
  {
    kicker: '第四景',
    title: '橋下行舟',
    description: '木船緩緩通過橋孔，水面留下細密波紋。',
    position: new THREE.Vector3(-20, 10, 28),
    target: new THREE.Vector3(0, 2, -10),
    duration: 11,
  },
  {
    kicker: '第五景',
    title: '河畔市集',
    description: '茶館、酒樓、布店與攤販構成北宋城市的熱鬧日常。',
    position: new THREE.Vector3(52, 13, -48),
    target: new THREE.Vector3(31, 4, -76),
    duration: 14,
  },
  {
    kicker: '第六景',
    title: '汴京城門',
    description: '穿過繁華街道，城牆與門樓在薄霧中展現城市規模。',
    position: new THREE.Vector3(28, 26, -118),
    target: new THREE.Vector3(0, 9, -166),
    duration: 15,
  },
];

function makeMat(color, roughness = 0.78, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geometry, material, { cast = true, receive = true } = {}) {
  const object = new THREE.Mesh(geometry, material);
  object.castShadow = cast;
  object.receiveShadow = receive;
  return object;
}

function box(size, color, position, rotation = null, material = null) {
  const object = mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    material ?? makeMat(color),
  );
  object.position.copy(position);
  if (rotation) object.rotation.set(rotation.x, rotation.y, rotation.z);
  return object;
}

function cylinder(radiusTop, radiusBottom, height, color, position, radial = 12) {
  const object = mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial),
    makeMat(color),
  );
  object.position.copy(position);
  return object;
}

function canvasTexture(text, foreground = '#2b1d13', background = '#d5bc8a') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#5f3f26';
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
  ctx.fillStyle = foreground;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 70px serif';
  const chars = [...text].slice(0, 5);
  const start = c.height / 2 - ((chars.length - 1) * 78) / 2;
  chars.forEach((char, i) => ctx.fillText(char, c.width / 2, start + i * 78));
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer?.capabilities.getMaxAnisotropy?.() ?? 4, 8);
  return texture;
}

function createSkyAndLights() {
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.FogExp2(palette.fog, 0.0045);

  const hemi = new THREE.HemisphereLight(0xf3e6c8, 0x4e463c, 2.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe2ad, 3.4);
  sun.position.set(75, 105, 85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 340;
  sun.shadow.bias = -0.00035;
  scene.add(sun);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.7 }),
  );
  glow.position.set(120, 95, -180);
  scene.add(glow);
}

function createTerrain() {
  const ground = mesh(
    new THREE.PlaneGeometry(460, 520, 1, 1),
    makeMat(palette.earth, 1),
    { cast: false, receive: true },
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.38;
  scene.add(ground);

  const leftBank = box(
    new THREE.Vector3(190, 1.2, 500),
    palette.road,
    new THREE.Vector3(-119, 0.2, 0),
  );
  const rightBank = box(
    new THREE.Vector3(190, 1.2, 500),
    palette.road,
    new THREE.Vector3(119, 0.2, 0),
  );
  scene.add(leftBank, rightBank);

  for (const x of [-27.3, 27.3]) {
    const quay = box(
      new THREE.Vector3(2.2, 2.1, 500),
      0x625647,
      new THREE.Vector3(x, 0.8, 0),
    );
    scene.add(quay);
  }

  for (let z = -230; z <= 230; z += 10) {
    for (const x of [-27.4, 27.4]) {
      const post = cylinder(0.25, 0.32, 3.4, palette.darkWood, new THREE.Vector3(x, 1.6, z), 8);
      scene.add(post);
    }
  }

  const riverGeometry = new THREE.PlaneGeometry(54, 500, 120, 220);
  const riverMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(0x355b5d) },
      uColorB: { value: new THREE.Color(0x77918b) },
      uSun: { value: new THREE.Color(0xd6c896) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vWave;
      uniform float uTime;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w1 = sin(p.y * 0.34 + uTime * 1.15) * 0.16;
        float w2 = cos(p.x * 0.82 - p.y * 0.09 + uTime * 0.7) * 0.09;
        float w3 = sin((p.x + p.y) * 0.18 - uTime * 0.45) * 0.06;
        p.z += w1 + w2 + w3;
        vWave = w1 + w2 + w3;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vWave;
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform vec3 uSun;
      void main() {
        float ribbons = sin(vUv.y * 170.0 + uTime * 1.7 + sin(vUv.x * 24.0)) * 0.5 + 0.5;
        float small = sin(vUv.y * 430.0 - uTime * 2.4 + vUv.x * 68.0) * 0.5 + 0.5;
        vec3 color = mix(uColorA, uColorB, smoothstep(0.05, 0.95, vUv.x));
        color += ribbons * 0.055 + small * 0.018 + vWave * 0.14;
        float glint = pow(max(0.0, sin(vUv.y * 85.0 + vUv.x * 13.0 + uTime)), 18.0);
        color = mix(color, uSun, glint * 0.35);
        gl_FragColor = vec4(color, 0.94);
      }
    `,
  });
  const river = mesh(riverGeometry, riverMaterial, { cast: false, receive: true });
  river.rotation.x = -Math.PI / 2;
  river.position.y = 0.35;
  river.userData.update = (t) => { riverMaterial.uniforms.uTime.value = t; };
  world.animated.push(river);
  scene.add(river);

  createReeds();
}

function createReeds() {
  const geom = new THREE.CylinderGeometry(0.025, 0.035, 1.7, 4);
  const mat = makeMat(palette.reed, 0.9);
  for (let i = 0; i < 110; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const reed = mesh(geom, mat, { cast: false, receive: false });
    reed.position.set(side * (28.3 + Math.random() * 2.5), 0.8, -235 + Math.random() * 470);
    reed.rotation.z = (Math.random() - 0.5) * 0.22;
    reed.scale.y = 0.55 + Math.random() * 0.9;
    scene.add(reed);
  }
}

function createBridge() {
  const bridge = new THREE.Group();
  bridge.name = '虹橋';
  const steps = 30;
  const width = 9;
  const plankMat = makeMat(0x765235, 0.86);
  const beamMat = makeMat(0x49311f, 0.91);

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = THREE.MathUtils.lerp(-31, 31, t);
    const y = 1.8 + Math.sin(t * Math.PI) * 11.1;
    const nextT = Math.min(1, (i + 1) / steps);
    const nextX = THREE.MathUtils.lerp(-31, 31, nextT);
    const nextY = 1.8 + Math.sin(nextT * Math.PI) * 11.1;
    const angle = Math.atan2(nextY - y, nextX - x);

    const plank = mesh(new THREE.BoxGeometry(2.35, 0.42, width), plankMat);
    plank.position.set(x, y, 0);
    plank.rotation.z = angle;
    bridge.add(plank);

    if (i % 2 === 0) {
      for (const z of [-4.3, 4.3]) {
        const post = mesh(new THREE.BoxGeometry(0.28, 2.3, 0.28), beamMat);
        post.position.set(x, y + 1.15, z);
        post.rotation.z = angle;
        bridge.add(post);
      }
    }
  }

  for (const z of [-4.3, 4.3]) {
    const railCurve = new THREE.CatmullRomCurve3(
      Array.from({ length: 20 }, (_, i) => {
        const t = i / 19;
        return new THREE.Vector3(
          THREE.MathUtils.lerp(-31, 31, t),
          3.1 + Math.sin(t * Math.PI) * 11.1,
          z,
        );
      }),
    );
    const rail = mesh(new THREE.TubeGeometry(railCurve, 80, 0.18, 7, false), beamMat);
    bridge.add(rail);
  }

  for (const z of [-3.4, 3.4]) {
    for (let i = 0; i < 5; i += 1) {
      const curve = new THREE.CatmullRomCurve3(
        Array.from({ length: 18 }, (_, n) => {
          const t = n / 17;
          const x = THREE.MathUtils.lerp(-29, 29, t);
          const archY = 0.85 + Math.sin(t * Math.PI) * (6.2 + i * 0.18);
          return new THREE.Vector3(x, archY, z + (i - 2) * 0.18);
        }),
      );
      bridge.add(mesh(new THREE.TubeGeometry(curve, 80, 0.24, 7, false), beamMat));
    }
  }

  for (let x = -26; x <= 26; x += 6.5) {
    for (const z of [-3.5, 3.5]) {
      const t = (x + 31) / 62;
      const deckY = 1.8 + Math.sin(t * Math.PI) * 11.1;
      const support = mesh(new THREE.BoxGeometry(0.42, Math.max(2, deckY), 0.42), beamMat);
      support.position.set(x, deckY / 2, z);
      bridge.add(support);
    }
  }

  bridge.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(bridge);

  for (let i = 0; i < 21; i += 1) {
    const t = 0.07 + (i / 20) * 0.86;
    const x = THREE.MathUtils.lerp(-28, 28, t);
    const y = 2.2 + Math.sin(t * Math.PI) * 11.1;
    const z = (i % 3 - 1) * 2.4 + (Math.random() - 0.5) * 0.6;
    const person = createPerson({
      scale: 0.78 + Math.random() * 0.18,
      role: i % 5 === 0 ? 'porter' : i % 7 === 0 ? 'official' : 'walker',
      colorIndex: i,
    });
    person.position.set(x, y, z);
    const dir = i % 2 === 0 ? 1 : -1;
    person.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    person.userData.bridge = { baseT: t, dir, speed: 0.012 + Math.random() * 0.012, lane: z };
    world.walkers.push(person);
    scene.add(person);
  }
}

function createRoof(width, depth, y, color = palette.roof) {
  const group = new THREE.Group();
  const roofMat = makeMat(color, 0.88);
  const left = mesh(new THREE.BoxGeometry(width + 1.8, 0.34, depth * 0.62), roofMat);
  left.position.set(0, y, -depth * 0.25);
  left.rotation.x = -0.45;
  const right = left.clone();
  right.position.z = depth * 0.25;
  right.rotation.x = 0.45;
  const ridge = mesh(new THREE.CylinderGeometry(0.22, 0.22, width + 2.1, 8), makeMat(0x373b36, 0.9));
  ridge.rotation.z = Math.PI / 2;
  ridge.position.y = y + 0.53;
  group.add(left, right, ridge);
  return group;
}

function createBuilding({ x, z, width = 12, depth = 10, floors = 1, sign = '茶肆', rotation = 0, color = 0xb8a889 }) {
  const group = new THREE.Group();
  const floorHeight = 4.8;
  const wallMat = makeMat(color, 0.94);
  const timberMat = makeMat(palette.darkWood, 0.9);

  const base = box(new THREE.Vector3(width, 0.6, depth), 0x67543f, new THREE.Vector3(0, 0.3, 0));
  group.add(base);

  for (let floor = 0; floor < floors; floor += 1) {
    const y = 0.6 + floor * floorHeight;
    const wall = mesh(new THREE.BoxGeometry(width - 0.8, 3.9, depth - 0.7), wallMat);
    wall.position.y = y + 1.95;
    group.add(wall);

    for (const px of [-width / 2 + 0.45, width / 2 - 0.45]) {
      for (const pz of [-depth / 2 + 0.45, depth / 2 - 0.45]) {
        const column = mesh(new THREE.BoxGeometry(0.42, 4.5, 0.42), timberMat);
        column.position.set(px, y + 2.25, pz);
        group.add(column);
      }
    }

    for (let i = -1; i <= 1; i += 1) {
      const windowFrame = new THREE.Group();
      const outer = mesh(new THREE.BoxGeometry(1.9, 1.85, 0.18), timberMat);
      const inner = mesh(new THREE.BoxGeometry(1.48, 1.45, 0.21), makeMat(0x726855, 0.82));
      windowFrame.add(outer, inner);
      for (const offset of [-0.45, 0, 0.45]) {
        const v = mesh(new THREE.BoxGeometry(0.08, 1.45, 0.24), timberMat);
        v.position.x = offset;
        windowFrame.add(v);
      }
      const h = mesh(new THREE.BoxGeometry(1.48, 0.08, 0.24), timberMat);
      windowFrame.add(h);
      windowFrame.position.set(i * (width / 3.35), y + 2.2, depth / 2 - 0.25);
      group.add(windowFrame);
    }

    const roof = createRoof(width + 1.3, depth + 1.6, y + 4.25);
    group.add(roof);
  }

  if (floors > 1) {
    const balcony = box(
      new THREE.Vector3(width + 1.2, 0.22, 1.4),
      palette.wood,
      new THREE.Vector3(0, floorHeight + 0.35, depth / 2 + 0.6),
    );
    group.add(balcony);
  }

  const signMesh = mesh(
    new THREE.BoxGeometry(1.6, 3.2, 0.18),
    new THREE.MeshStandardMaterial({ map: canvasTexture(sign), roughness: 0.86 }),
  );
  signMesh.position.set(width / 2 + 1.1, 3.5, depth / 2 + 0.2);
  group.add(signMesh);

  const banner = mesh(
    new THREE.PlaneGeometry(1.6, 3.2, 8, 14),
    new THREE.MeshStandardMaterial({ map: canvasTexture(sign, '#f0dfbd', '#69392c'), side: THREE.DoubleSide, roughness: 0.9 }),
  );
  banner.position.set(-width / 2 - 1.1, 3.8, depth / 2 + 0.6);
  banner.userData.baseRotation = 0;
  banner.userData.phase = Math.random() * Math.PI * 2;
  world.banners.push(banner);
  group.add(banner);

  for (const sx of [-width / 3, width / 3]) {
    const lantern = createLantern(0.42);
    lantern.position.set(sx, 3.7, depth / 2 + 0.8);
    group.add(lantern);
  }

  group.position.set(x, 0.35, z);
  group.rotation.y = rotation;
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  scene.add(group);
  return group;
}

function createLantern(scale = 1) {
  const group = new THREE.Group();
  const frame = cylinder(0.4 * scale, 0.32 * scale, 0.85 * scale, 0x8b3c2e, new THREE.Vector3(), 12);
  frame.material.emissive = new THREE.Color(0x3c1008);
  frame.material.emissiveIntensity = 0.35;
  const capTop = cylinder(0.28 * scale, 0.36 * scale, 0.12 * scale, 0x3d261a, new THREE.Vector3(0, 0.48 * scale, 0), 10);
  const capBottom = capTop.clone();
  capBottom.position.y = -0.48 * scale;
  group.add(frame, capTop, capBottom);
  group.userData.phase = Math.random() * Math.PI * 2;
  world.lanterns.push(group);
  return group;
}

function createMarketStall(x, z, rotation = 0, label = '雜貨') {
  const group = new THREE.Group();
  const timber = makeMat(palette.darkWood, 0.9);
  for (const px of [-2.2, 2.2]) {
    for (const pz of [-1.5, 1.5]) {
      const post = mesh(new THREE.BoxGeometry(0.2, 3.5, 0.2), timber);
      post.position.set(px, 1.75, pz);
      group.add(post);
    }
  }
  const table = mesh(new THREE.BoxGeometry(4.8, 0.38, 2.8), makeMat(0x765235, 0.92));
  table.position.y = 1.05;
  group.add(table);
  const canopy = mesh(
    new THREE.BoxGeometry(5.2, 0.2, 3.8),
    makeMat([0x8f6048, 0xb79a70, 0x5f6c56][Math.floor(Math.random() * 3)], 0.96),
  );
  canopy.position.y = 3.55;
  canopy.rotation.z = 0.05;
  group.add(canopy);

  const sign = mesh(
    new THREE.BoxGeometry(1.1, 1.45, 0.12),
    new THREE.MeshStandardMaterial({ map: canvasTexture(label), roughness: 0.9 }),
  );
  sign.position.set(0, 2.55, 1.62);
  group.add(sign);

  for (let i = 0; i < 10; i += 1) {
    const item = mesh(
      i % 2 === 0 ? new THREE.SphereGeometry(0.22 + Math.random() * 0.14, 8, 6) : new THREE.BoxGeometry(0.35, 0.25, 0.35),
      makeMat([0x9a693c, 0x766944, 0x925044, 0xb79259][i % 4], 0.92),
    );
    item.position.set(-1.7 + (i % 5) * 0.84, 1.36 + Math.random() * 0.15, -0.7 + Math.floor(i / 5) * 1.2);
    group.add(item);
  }

  group.position.set(x, 0.55, z);
  group.rotation.y = rotation;
  scene.add(group);
  return group;
}

function createCity() {
  const shops = [
    [-47, 82, 13, 11, 1, '米行', Math.PI / 2],
    [49, 76, 14, 11, 1, '布莊', -Math.PI / 2],
    [-49, 52, 15, 11, 2, '客棧', Math.PI / 2],
    [50, 44, 16, 12, 2, '酒樓', -Math.PI / 2],
    [-48, 21, 12, 10, 1, '香藥', Math.PI / 2],
    [49, 12, 13, 10, 1, '茶肆', -Math.PI / 2],
    [-49, -34, 15, 12, 2, '正店', Math.PI / 2],
    [50, -42, 14, 11, 1, '綢緞', -Math.PI / 2],
    [-49, -70, 13, 10, 1, '食店', Math.PI / 2],
    [50, -78, 16, 12, 2, '樊樓', -Math.PI / 2],
    [-49, -108, 13, 11, 1, '腳店', Math.PI / 2],
    [49, -116, 14, 11, 1, '紙馬', -Math.PI / 2],
  ];
  shops.forEach(([x, z, width, depth, floors, sign, rotation], i) => {
    createBuilding({ x, z, width, depth, floors, sign, rotation, color: i % 3 === 0 ? 0xbcae91 : 0xa9977b });
  });

  const stalls = [
    [-38, 94, Math.PI / 2, '果子'], [-38, 66, Math.PI / 2, '陶器'],
    [-38, 31, Math.PI / 2, '布匹'], [-38, -16, Math.PI / 2, '香料'],
    [-38, -58, Math.PI / 2, '木器'], [-38, -98, Math.PI / 2, '糧食'],
    [38, 91, -Math.PI / 2, '魚鮮'], [38, 61, -Math.PI / 2, '茶湯'],
    [38, 24, -Math.PI / 2, '胡餅'], [38, -23, -Math.PI / 2, '酒水'],
    [38, -63, -Math.PI / 2, '藥材'], [38, -103, -Math.PI / 2, '雜貨'],
  ];
  stalls.forEach((args) => createMarketStall(...args));

  createCityGate();
  createDistantHouses();
  createDocks();
}

function createCityGate() {
  const gate = new THREE.Group();
  const wallMat = makeMat(0x8d8372, 0.96);
  const stoneMat = makeMat(0x71695c, 0.98);

  const wallLeft = mesh(new THREE.BoxGeometry(105, 15, 10), wallMat);
  wallLeft.position.set(-68, 7.5, 0);
  const wallRight = wallLeft.clone();
  wallRight.position.x = 68;
  gate.add(wallLeft, wallRight);

  const towerBase = mesh(new THREE.BoxGeometry(34, 22, 15), stoneMat);
  towerBase.position.y = 11;
  gate.add(towerBase);

  const opening = mesh(new THREE.BoxGeometry(12.5, 10, 16.5), new THREE.MeshBasicMaterial({ color: 0x1c1813 }));
  opening.position.y = 4.5;
  gate.add(opening);

  const upper = createBuilding({ x: 0, z: 0, width: 30, depth: 13, floors: 2, sign: '汴京', rotation: 0, color: 0x9b886d });
  scene.remove(upper);
  upper.position.set(0, 20.5, 0);
  gate.add(upper);

  for (let x = -116; x <= 116; x += 8) {
    if (Math.abs(x) < 20) continue;
    const battlement = mesh(new THREE.BoxGeometry(4.2, 2.6, 12), stoneMat);
    battlement.position.set(x, 16.2, 0);
    gate.add(battlement);
  }

  gate.position.set(0, 0, -170);
  scene.add(gate);

  for (const x of [-11, 11]) {
    const guard = createPerson({ role: 'guard', scale: 1.05, colorIndex: x > 0 ? 1 : 2 });
    guard.position.set(x, 1, -158);
    guard.rotation.y = Math.PI;
    scene.add(guard);
  }
}

function createDistantHouses() {
  for (let i = 0; i < 28; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (64 + Math.random() * 90);
    const z = -155 + Math.random() * 270;
    const width = 7 + Math.random() * 7;
    const depth = 7 + Math.random() * 6;
    const h = 3.5 + Math.random() * 3;
    const group = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(width, h, depth), makeMat(0x9d8f76, 1));
    body.position.y = h / 2;
    group.add(body);
    group.add(createRoof(width, depth, h + 0.3, i % 4 === 0 ? 0x53574f : palette.roof));
    group.position.set(x, 0.55, z);
    group.rotation.y = Math.random() * 0.15 * side;
    scene.add(group);
  }

  for (let i = 0; i < 55; i += 1) {
    const trunk = cylinder(0.22, 0.34, 3.8 + Math.random() * 2.4, 0x4a3423, new THREE.Vector3(), 7);
    const crown = mesh(
      new THREE.SphereGeometry(2 + Math.random() * 1.7, 9, 7),
      makeMat([0x536244, 0x607052, 0x6b744e][i % 3], 1),
    );
    crown.scale.y = 1.25;
    crown.position.y = 3.8;
    const tree = new THREE.Group();
    tree.add(trunk, crown);
    const side = i % 2 === 0 ? -1 : 1;
    tree.position.set(side * (58 + Math.random() * 105), 0.55, -180 + Math.random() * 380);
    scene.add(tree);
  }
}

function createDocks() {
  for (const z of [112, 73, 34, -46, -94, -132]) {
    const side = z % 2 === 0 ? -1 : 1;
    const x = side * 29.5;
    const dock = new THREE.Group();
    const deck = mesh(new THREE.BoxGeometry(10, 0.45, 7.5), makeMat(0x66482f, 0.94));
    deck.position.set(side * 4.2, 1.15, 0);
    dock.add(deck);
    for (const px of [0, side * 8]) {
      for (const pz of [-3.1, 3.1]) {
        const post = cylinder(0.24, 0.3, 4, 0x3f2d20, new THREE.Vector3(px, 0.2, pz), 7);
        dock.add(post);
      }
    }
    for (let i = 0; i < 7; i += 1) {
      const crate = mesh(
        new THREE.BoxGeometry(0.8 + Math.random() * 0.7, 0.7 + Math.random() * 0.8, 0.8 + Math.random() * 0.6),
        makeMat(i % 2 === 0 ? 0x765438 : 0x8d7652, 0.94),
      );
      crate.position.set(side * (2 + Math.random() * 5.5), 1.55, -2.6 + Math.random() * 5.2);
      dock.add(crate);
    }
    dock.position.set(x, 0, z);
    scene.add(dock);
  }
}

function createPerson({ scale = 1, role = 'walker', colorIndex = 0 } = {}) {
  const group = new THREE.Group();
  const skinColors = [0xc79b75, 0xb98664, 0xd1a982, 0xa97858];
  const clothColors = [0x6c6652, 0x4f6670, 0x735447, 0x7b745a, 0x5f4d66, 0x8a6b43, 0x495b4c];
  const skin = makeMat(skinColors[colorIndex % skinColors.length], 0.78);
  const cloth = makeMat(role === 'official' ? 0x6d2730 : role === 'guard' ? 0x3f4d38 : clothColors[colorIndex % clothColors.length], 0.92);
  const dark = makeMat(0x2f251d, 0.9);

  const torso = mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.55, 10), cloth);
  torso.position.y = 2.05;
  group.add(torso);

  const skirt = mesh(new THREE.CylinderGeometry(0.6, 0.78, 1.25, 10), cloth);
  skirt.position.y = 1.15;
  group.add(skirt);

  const head = mesh(new THREE.SphereGeometry(0.39, 16, 12), skin);
  head.scale.set(0.9, 1.03, 0.92);
  head.position.y = 3.22;
  group.add(head);

  const nose = mesh(new THREE.ConeGeometry(0.07, 0.18, 8), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 3.22, 0.38);
  group.add(nose);

  for (const x of [-0.13, 0.13]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 8, 6), makeMat(0x1e1712, 0.6));
    eye.position.set(x, 3.31, 0.35);
    eye.scale.z = 0.4;
    group.add(eye);
  }

  const mouth = mesh(new THREE.BoxGeometry(0.16, 0.025, 0.02), makeMat(0x6f3228, 0.8));
  mouth.position.set(0, 3.08, 0.37);
  group.add(mouth);

  let hat;
  if (role === 'official') {
    hat = mesh(new THREE.CylinderGeometry(0.31, 0.36, 0.28, 12), dark);
    hat.position.y = 3.63;
    const wings = mesh(new THREE.BoxGeometry(1.2, 0.09, 0.13), dark);
    wings.position.y = 3.62;
    group.add(wings);
  } else if (role === 'guard') {
    hat = mesh(new THREE.SphereGeometry(0.39, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), makeMat(0x35372f, 0.9));
    hat.position.y = 3.5;
  } else if (role === 'porter') {
    hat = mesh(new THREE.ConeGeometry(0.53, 0.28, 16), makeMat(0x8a774f, 0.95));
    hat.position.y = 3.62;
  } else {
    hat = mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.22, 12), dark);
    hat.position.y = 3.55;
  }
  group.add(hat);

  const leftArmPivot = new THREE.Group();
  const rightArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.5, 2.55, 0);
  rightArmPivot.position.set(0.5, 2.55, 0);
  const armGeom = new THREE.CylinderGeometry(0.12, 0.13, 1.15, 8);
  const leftArm = mesh(armGeom, cloth);
  const rightArm = mesh(armGeom, cloth);
  leftArm.position.y = -0.5;
  rightArm.position.y = -0.5;
  leftArmPivot.add(leftArm);
  rightArmPivot.add(rightArm);
  group.add(leftArmPivot, rightArmPivot);

  const legGeom = new THREE.CylinderGeometry(0.13, 0.15, 1.12, 8);
  const leftLegPivot = new THREE.Group();
  const rightLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.22, 0.9, 0);
  rightLegPivot.position.set(0.22, 0.9, 0);
  const leftLeg = mesh(legGeom, dark);
  const rightLeg = mesh(legGeom, dark);
  leftLeg.position.y = -0.42;
  rightLeg.position.y = -0.42;
  leftLegPivot.add(leftLeg);
  rightLegPivot.add(rightLeg);
  group.add(leftLegPivot, rightLegPivot);

  if (role === 'porter') {
    const pole = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.8, 7), makeMat(0x4a3322, 0.9));
    pole.rotation.z = Math.PI / 2;
    pole.position.set(0, 2.75, 0);
    group.add(pole);
    for (const x of [-1.3, 1.3]) {
      const basket = mesh(new THREE.CylinderGeometry(0.32, 0.25, 0.48, 10), makeMat(0x8b6c42, 0.96));
      basket.position.set(x, 1.9, 0);
      group.add(basket);
    }
  }

  if (role === 'guard') {
    const spear = mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.4, 7), makeMat(0x4a3322, 0.9));
    spear.position.set(0.75, 2.25, 0);
    const tip = mesh(new THREE.ConeGeometry(0.13, 0.5, 8), makeMat(0x69665c, 0.5, 0.35));
    tip.position.set(0.75, 4.7, 0);
    group.add(spear, tip);
  }

  group.scale.setScalar(scale);
  group.userData.animation = {
    phase: Math.random() * Math.PI * 2,
    speed: 1.1 + Math.random() * 0.8,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    head,
    mouth,
    role,
  };
  return group;
}

function createCrowds() {
  const lanes = [
    { x: -36, zMin: -142, zMax: 142, count: 17, rotation: 0 },
    { x: 36, zMin: -142, zMax: 142, count: 19, rotation: Math.PI },
    { x: -42, zMin: -120, zMax: 116, count: 11, rotation: Math.PI / 2 },
    { x: 42, zMin: -120, zMax: 116, count: 11, rotation: -Math.PI / 2 },
  ];

  let index = 0;
  for (const lane of lanes) {
    for (let i = 0; i < lane.count; i += 1) {
      const role = i % 9 === 0 ? 'porter' : i % 13 === 0 ? 'official' : 'walker';
      const p = createPerson({ scale: 0.76 + Math.random() * 0.28, role, colorIndex: index++ });
      p.position.set(lane.x + (Math.random() - 0.5) * 4.5, 1, THREE.MathUtils.lerp(lane.zMin, lane.zMax, i / lane.count) + Math.random() * 5);
      p.rotation.y = lane.rotation;
      p.userData.road = {
        x: p.position.x,
        min: lane.zMin,
        max: lane.zMax,
        dir: Math.random() > 0.5 ? 1 : -1,
        speed: 1.1 + Math.random() * 1.0,
      };
      world.walkers.push(p);
      scene.add(p);
    }
  }

  for (let i = 0; i < 20; i += 1) {
    const p = createPerson({ scale: 0.78 + Math.random() * 0.24, role: i % 6 === 0 ? 'porter' : 'walker', colorIndex: i + 60 });
    const side = i % 2 === 0 ? -1 : 1;
    p.position.set(side * (31 + Math.random() * 17), 1, -105 + Math.random() * 215);
    p.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    p.userData.stationary = true;
    world.walkers.push(p);
    scene.add(p);
  }
}

function createBoat({ z, x = 0, scale = 1, speed = 2.5, direction = -1, cargo = true }) {
  const group = new THREE.Group();
  const hullMat = makeMat(0x4f3423, 0.84);
  const deckMat = makeMat(0x715038, 0.9);

  const hull = mesh(new THREE.CylinderGeometry(2.1, 1.1, 13, 10, 1, false), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.scale.z = 0.55;
  hull.position.y = 1.05;
  group.add(hull);

  const deck = mesh(new THREE.BoxGeometry(4.2, 0.35, 11.5), deckMat);
  deck.position.y = 1.55;
  group.add(deck);

  if (cargo) {
    const canopy = mesh(new THREE.BoxGeometry(3.7, 2.1, 6.2), makeMat(0x8f7a55, 0.98));
    canopy.position.set(0, 2.7, 0.7);
    group.add(canopy);
    const roof = mesh(new THREE.CylinderGeometry(2.0, 2.0, 6.5, 12, 1, false, 0, Math.PI), makeMat(0x64583b, 0.96));
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(0, 3.7, 0.7);
    group.add(roof);
  }

  const boatman = createPerson({ scale: 0.78, role: 'walker', colorIndex: Math.floor(Math.random() * 20) });
  boatman.position.set(0.9, 1.55, -4.2);
  boatman.rotation.y = Math.PI;
  group.add(boatman);

  const pole = mesh(new THREE.CylinderGeometry(0.055, 0.055, 9.2, 8), makeMat(0x49311f, 0.9));
  pole.rotation.x = 0.25;
  pole.position.set(1.8, 1.3, -4.6);
  group.add(pole);

  const wakeMat = new THREE.MeshBasicMaterial({ color: 0xb6c1aa, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false });
  for (const sx of [-1, 1]) {
    const wake = mesh(new THREE.PlaneGeometry(2.8, 12, 1, 1), wakeMat, { cast: false, receive: false });
    wake.rotation.x = -Math.PI / 2;
    wake.rotation.z = sx * 0.18;
    wake.position.set(sx * 1.8, 0.38, 8.7);
    group.add(wake);
  }

  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  group.userData.boat = { speed, direction, startZ: z, boatman, pole, phase: Math.random() * Math.PI * 2 };
  world.boats.push(group);
  scene.add(group);
  return group;
}

function createBoats() {
  createBoat({ z: 126, x: -6, scale: 1.1, speed: 3.0, direction: -1, cargo: true });
  createBoat({ z: 42, x: 7, scale: 0.82, speed: 2.0, direction: 1, cargo: false });
  createBoat({ z: -68, x: -7, scale: 0.92, speed: 2.4, direction: 1, cargo: true });
  createBoat({ z: -142, x: 5, scale: 0.72, speed: 2.7, direction: -1, cargo: false });
}

function createHorse({ x, z, rotation = 0, ox = false, withCart = true }) {
  const group = new THREE.Group();
  const bodyColor = ox ? 0x715a3f : 0x76513b;
  const body = mesh(new THREE.CapsuleGeometry(0.65, 1.5, 6, 12), makeMat(bodyColor, 0.86));
  body.rotation.z = Math.PI / 2;
  body.position.y = 2.05;
  group.add(body);
  const neck = mesh(new THREE.CylinderGeometry(0.34, 0.45, 1.35, 10), makeMat(bodyColor, 0.86));
  neck.rotation.z = -0.48;
  neck.position.set(0, 2.72, 0.85);
  group.add(neck);
  const head = mesh(new THREE.BoxGeometry(0.65, 0.68, 0.95), makeMat(bodyColor, 0.86));
  head.position.set(0, 3.25, 1.45);
  group.add(head);

  if (ox) {
    for (const sx of [-1, 1]) {
      const horn = mesh(new THREE.ConeGeometry(0.1, 0.65, 8), makeMat(0xb6aa8a, 0.72));
      horn.rotation.z = sx * 0.6;
      horn.position.set(sx * 0.38, 3.62, 1.45);
      group.add(horn);
    }
  } else {
    for (const sx of [-0.22, 0.22]) {
      const ear = mesh(new THREE.ConeGeometry(0.1, 0.42, 8), makeMat(bodyColor, 0.86));
      ear.position.set(sx, 3.78, 1.4);
      group.add(ear);
    }
  }

  const legs = [];
  for (const px of [-0.42, 0.42]) {
    for (const pz of [-0.72, 0.72]) {
      const pivot = new THREE.Group();
      pivot.position.set(px, 1.75, pz);
      const leg = mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.75, 8), makeMat(0x4a3527, 0.9));
      leg.position.y = -0.75;
      pivot.add(leg);
      group.add(pivot);
      legs.push(pivot);
    }
  }

  if (withCart) {
    const shaft = mesh(new THREE.BoxGeometry(0.14, 0.14, 5.2), makeMat(0x4d3422, 0.9));
    shaft.position.set(0, 1.5, -3.05);
    group.add(shaft);
    const cart = mesh(new THREE.BoxGeometry(3.1, 1.45, 3.8), makeMat(0x765035, 0.9));
    cart.position.set(0, 1.35, -5.3);
    group.add(cart);
    for (const wx of [-1.65, 1.65]) {
      const wheel = mesh(new THREE.TorusGeometry(0.95, 0.13, 8, 20), makeMat(0x3d2b1f, 0.92));
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(wx, 0.92, -5.25);
      group.add(wheel);
    }
  }

  group.position.set(x, 0.55, z);
  group.rotation.y = rotation;
  group.userData.animal = { legs, phase: Math.random() * Math.PI * 2, moving: true, laneX: x, speed: 0.65 + Math.random() * 0.4, min: -125, max: 120, dir: Math.random() > 0.5 ? 1 : -1 };
  world.animals.push(group);
  scene.add(group);
}

function createDog(x, z) {
  const group = new THREE.Group();
  const mat = makeMat(0x78543a, 0.9);
  const body = mesh(new THREE.CapsuleGeometry(0.28, 0.75, 4, 8), mat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.75;
  group.add(body);
  const head = mesh(new THREE.SphereGeometry(0.28, 10, 8), mat);
  head.position.set(0, 0.95, 0.68);
  group.add(head);
  for (const px of [-0.2, 0.2]) {
    for (const pz of [-0.36, 0.36]) {
      const leg = mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.55, 6), mat);
      leg.position.set(px, 0.38, pz);
      group.add(leg);
    }
  }
  const tail = mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.8, 6), mat);
  tail.rotation.x = -0.9;
  tail.position.set(0, 1.0, -0.72);
  group.add(tail);
  group.position.set(x, 0.55, z);
  group.userData.dog = { phase: Math.random() * Math.PI * 2, tail, baseX: x, baseZ: z };
  world.animals.push(group);
  scene.add(group);
}

function createChicken(x, z, offset = 0) {
  const group = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.25, 9, 7), makeMat(offset % 2 ? 0x8b5a36 : 0xe0d0a4, 0.92));
  body.scale.set(0.8, 1, 1.2);
  body.position.y = 0.5;
  const head = mesh(new THREE.SphereGeometry(0.13, 8, 6), makeMat(0xd9c49a, 0.9));
  head.position.set(0, 0.78, 0.28);
  const comb = mesh(new THREE.SphereGeometry(0.06, 6, 5), makeMat(0x9f3328, 0.9));
  comb.position.set(0, 0.93, 0.27);
  group.add(body, head, comb);
  group.position.set(x, 0.55, z);
  group.userData.chicken = { phase: Math.random() * Math.PI * 2, baseX: x, baseZ: z };
  world.animals.push(group);
  scene.add(group);
}

function createAnimals() {
  createHorse({ x: -38, z: 104, rotation: 0, withCart: true });
  createHorse({ x: 38, z: 37, rotation: Math.PI, ox: true, withCart: true });
  createHorse({ x: -38, z: -54, rotation: 0, withCart: false });
  createHorse({ x: 38, z: -112, rotation: Math.PI, withCart: true });
  createDog(-41, 18);
  createDog(40, -34);
  for (let i = 0; i < 9; i += 1) createChicken(39 + Math.random() * 5, 74 + Math.random() * 8, i);
}

function createAtmosphere() {
  for (let i = 0; i < 14; i += 1) {
    const puff = mesh(
      new THREE.SphereGeometry(0.8 + Math.random() * 0.9, 9, 7),
      new THREE.MeshBasicMaterial({ color: 0xd8d0be, transparent: true, opacity: 0.14, depthWrite: false }),
      { cast: false, receive: false },
    );
    const side = i % 2 === 0 ? -1 : 1;
    puff.position.set(side * (42 + Math.random() * 16), 9 + Math.random() * 6, -120 + Math.random() * 230);
    puff.userData.smoke = { baseY: puff.position.y, phase: Math.random() * Math.PI * 2, speed: 0.14 + Math.random() * 0.18 };
    world.smoke.push(puff);
    scene.add(puff);
  }
}

function updatePersonAnimation(person, t, dt) {
  const a = person.userData.animation;
  if (!a) return;
  const moving = !person.userData.stationary;
  const stride = moving ? Math.sin(t * a.speed * 4.2 + a.phase) : Math.sin(t * 1.2 + a.phase) * 0.18;
  a.leftArmPivot.rotation.x = stride * 0.44;
  a.rightArmPivot.rotation.x = -stride * 0.44;
  a.leftLegPivot.rotation.x = -stride * 0.34;
  a.rightLegPivot.rotation.x = stride * 0.34;
  a.head.rotation.y = Math.sin(t * 0.45 + a.phase) * 0.1;
  a.head.scale.y = 1.03 + Math.max(0, Math.sin(t * 0.37 + a.phase)) * 0.015;
  a.mouth.scale.x = 0.8 + Math.max(0, Math.sin(t * 2.3 + a.phase)) * 0.35;

  if (person.userData.bridge) {
    const b = person.userData.bridge;
    b.baseT += b.dir * b.speed * dt;
    if (b.baseT > 0.92) { b.baseT = 0.92; b.dir = -1; person.rotation.y = -Math.PI / 2; }
    if (b.baseT < 0.08) { b.baseT = 0.08; b.dir = 1; person.rotation.y = Math.PI / 2; }
    person.position.x = THREE.MathUtils.lerp(-28, 28, b.baseT);
    person.position.y = 2.2 + Math.sin(b.baseT * Math.PI) * 11.1;
  } else if (person.userData.road) {
    const r = person.userData.road;
    person.position.z += r.dir * r.speed * dt;
    if (person.position.z > r.max) { person.position.z = r.max; r.dir = -1; person.rotation.y += Math.PI; }
    if (person.position.z < r.min) { person.position.z = r.min; r.dir = 1; person.rotation.y += Math.PI; }
  }
}

function updateWorld(t, dt) {
  world.animated.forEach((o) => o.userData.update?.(t, dt));
  world.walkers.forEach((p) => updatePersonAnimation(p, t, dt));

  world.boats.forEach((boat) => {
    const b = boat.userData.boat;
    boat.position.z += b.direction * b.speed * dt;
    if (boat.position.z < -232) boat.position.z = 232;
    if (boat.position.z > 232) boat.position.z = -232;
    boat.position.y = Math.sin(t * 1.4 + b.phase) * 0.07;
    boat.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.012;
    b.pole.rotation.z = Math.sin(t * 1.1 + b.phase) * 0.09;
    updatePersonAnimation(b.boatman, t, dt);
  });

  world.animals.forEach((animal) => {
    if (animal.userData.animal) {
      const a = animal.userData.animal;
      animal.position.z += a.dir * a.speed * dt;
      if (animal.position.z > a.max) { animal.position.z = a.max; a.dir = -1; animal.rotation.y += Math.PI; }
      if (animal.position.z < a.min) { animal.position.z = a.min; a.dir = 1; animal.rotation.y += Math.PI; }
      a.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(t * 3.2 + a.phase + i * Math.PI) * 0.25; });
    }
    if (animal.userData.dog) {
      const d = animal.userData.dog;
      animal.position.x = d.baseX + Math.sin(t * 0.35 + d.phase) * 3.2;
      animal.position.z = d.baseZ + Math.cos(t * 0.35 + d.phase) * 2.2;
      animal.rotation.y = -t * 0.35 - d.phase;
      d.tail.rotation.z = Math.sin(t * 6 + d.phase) * 0.35;
    }
    if (animal.userData.chicken) {
      const c = animal.userData.chicken;
      animal.position.x = c.baseX + Math.sin(t * 0.7 + c.phase) * 1.2;
      animal.position.z = c.baseZ + Math.cos(t * 0.62 + c.phase) * 1.1;
      animal.rotation.y = -t * 0.6 - c.phase;
      animal.position.y = 0.55 + Math.abs(Math.sin(t * 2.1 + c.phase)) * 0.04;
    }
  });

  world.banners.forEach((banner) => {
    const pos = banner.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i);
      const x = pos.getX(i);
      pos.setZ(i, Math.sin(t * 1.8 + banner.userData.phase + y * 1.8 + x) * 0.08 * (1 + Math.abs(y)));
    }
    pos.needsUpdate = true;
  });

  world.lanterns.forEach((lantern) => {
    lantern.rotation.z = Math.sin(t * 0.75 + lantern.userData.phase) * 0.045;
  });

  world.smoke.forEach((puff) => {
    const s = puff.userData.smoke;
    puff.position.y += s.speed * dt;
    puff.position.x += 0.08 * dt;
    puff.scale.multiplyScalar(1 + 0.014 * dt);
    if (puff.position.y > s.baseY + 12) {
      puff.position.y = s.baseY;
      puff.scale.setScalar(1);
    }
  });
}

function updateTour(dt) {
  if (!state.tour || state.paused || state.freeExplore) return;
  state.tourTime += dt;
  const total = tourStops.reduce((sum, stop) => sum + stop.duration, 0);
  const cycle = state.tourTime % total;
  let acc = 0;
  let index = 0;
  for (let i = 0; i < tourStops.length; i += 1) {
    if (cycle < acc + tourStops[i].duration) { index = i; break; }
    acc += tourStops[i].duration;
  }
  const current = tourStops[index];
  const next = tourStops[(index + 1) % tourStops.length];
  const local = (cycle - acc) / current.duration;
  const eased = local < 0.5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
  camera.position.lerpVectors(current.position, next.position, eased);
  controls.target.lerpVectors(current.target, next.target, eased);
  controls.update();
  updateLocationCard(index);
}

let displayedStop = -1;
function updateLocationCard(index) {
  if (displayedStop === index) return;
  displayedStop = index;
  const stop = tourStops[index];
  document.querySelector('#locationKicker').textContent = stop.kicker;
  document.querySelector('#locationTitle').textContent = stop.title;
  document.querySelector('#locationDescription').textContent = stop.description;
}

function updateKeyboard(dt) {
  if (!state.freeExplore) return;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 26 : 11;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const move = new THREE.Vector3();
  if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
  if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) move.add(right);
  if (keys.has('KeyD') || keys.has('ArrowRight')) move.sub(right);
  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed * dt);
    camera.position.add(move);
    controls.target.add(move);
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -150, 150);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -220, 220);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 3, 75);
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -150, 150);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -220, 220);
  }
}

const keys = new Set();
window.addEventListener('keydown', (event) => keys.add(event.code));
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

function setupUI() {
  const tourButton = document.querySelector('#tourButton');
  const viewButton = document.querySelector('#viewButton');
  const soundButton = document.querySelector('#soundButton');
  const qualityButton = document.querySelector('#qualityButton');
  const menuButton = document.querySelector('#menuButton');
  const infoPanel = document.querySelector('#infoPanel');

  tourButton.addEventListener('click', () => {
    state.paused = !state.paused;
    state.tour = true;
    state.freeExplore = false;
    controls.enablePan = false;
    tourButton.textContent = state.paused ? '繼續導覽' : '暫停導覽';
    viewButton.textContent = '自由遊覽';
  });

  viewButton.addEventListener('click', () => {
    state.freeExplore = !state.freeExplore;
    state.tour = !state.freeExplore;
    state.paused = false;
    controls.enablePan = state.freeExplore;
    controls.maxDistance = state.freeExplore ? 130 : 90;
    viewButton.textContent = state.freeExplore ? '返回導覽' : '自由遊覽';
    tourButton.textContent = '暫停導覽';
    if (!state.freeExplore) state.tourTime = 0;
  });

  qualityButton.addEventListener('click', () => {
    state.quality = state.quality === 'high' ? 'balanced' : 'high';
    const ratio = state.quality === 'high' ? Math.min(window.devicePixelRatio, 2) : 1;
    renderer.setPixelRatio(ratio);
    renderer.shadowMap.enabled = state.quality === 'high';
    qualityButton.textContent = state.quality === 'high' ? '畫質：高' : '畫質：流暢';
    onResize();
  });

  soundButton.addEventListener('click', async () => {
    state.sound = !state.sound;
    if (state.sound) {
      await startAmbientSound();
    } else if (ambientGain) {
      ambientGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.12);
    }
    soundButton.textContent = `環境聲：${state.sound ? '開' : '關'}`;
    soundButton.setAttribute('aria-pressed', String(state.sound));
  });

  menuButton.addEventListener('click', () => {
    const open = infoPanel.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
    infoPanel.setAttribute('aria-hidden', String(!open));
  });
}

async function startAmbientSound() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    ambientGain = audioContext.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(audioContext.destination);

    const water = audioContext.createBufferSource();
    const seconds = 3;
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * seconds, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 1.8;
    }
    water.buffer = buffer;
    water.loop = true;
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 520;
    water.connect(lowpass).connect(ambientGain);
    water.start();

    const marketGain = audioContext.createGain();
    marketGain.gain.value = 0.035;
    marketGain.connect(ambientGain);
    [196, 247, 294].forEach((frequency, i) => {
      const osc = audioContext.createOscillator();
      const g = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency / 4;
      g.gain.value = 0.012 / (i + 1);
      osc.connect(g).connect(marketGain);
      osc.start();
    });
  }
  await audioContext.resume();
  ambientGain.gain.setTargetAtTime(0.18, audioContext.currentTime, 0.25);
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  state.elapsed += dt;
  if (!state.paused || state.freeExplore) updateWorld(state.elapsed, dt);
  updateTour(dt);
  updateKeyboard(dt);
  if (state.freeExplore) controls.update();
  renderer.render(scene, camera);
}

async function init() {
  try {
    loadingText.textContent = '正在建立河流、虹橋與城門……';
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new THREE.Scene();
    clock = new THREE.Clock();
    camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 720);
    camera.position.copy(tourStops[0].position);

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.minDistance = 4;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.target.copy(tourStops[0].target);
    controls.update();

    createSkyAndLights();
    createTerrain();
    createBridge();
    loadingText.textContent = '正在安置商店、市集與碼頭……';
    createCity();
    createCrowds();
    loadingText.textContent = '正在喚醒船夫、行人與動物……';
    createBoats();
    createAnimals();
    createAtmosphere();
    setupUI();

    window.addEventListener('resize', onResize, { passive: true });
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(document.body);

    renderer.setAnimationLoop(animate);
    setTimeout(() => loading.classList.add('hidden'), 450);
  } catch (error) {
    console.error(error);
    loading.classList.add('hidden');
    errorBox.hidden = false;
    errorBox.textContent = `場景未能啟動：${error.message}。請使用支援 WebGL 的最新版瀏覽器，並確認網絡可載入 Three.js。`;
  }
}

init();