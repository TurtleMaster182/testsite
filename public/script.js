// ---------- Always start at the top on refresh ----------
// Stop the browser from restoring the previous scroll position, and jump
// to 0 immediately (also on bfcache "back/forward" restores and on reload).
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);
window.addEventListener('pageshow', (e) => { if (e.persisted) window.scrollTo(0, 0); });
window.addEventListener('load', () => {
  // Some browsers restore late, after layout; force it once more.
  window.scrollTo(0, 0);
  // Drop any #hash so a refresh doesn't jump to that section
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
});

// ---------- Section snapping ----------
// Behaviour: scroll freely; when you pause, the page glides to a section so
// nothing is left half-aligned.
//  - Scroll a little in a direction  -> it commits to the NEXT section that way.
//  - Barely scroll / change your mind -> it settles back to where you were.
//  - Sections that fit on screen are CENTERED in the viewport.
//  - Sections taller than the screen snap to their TOP (and BOTTOM) edge, and
//    you can scroll freely in between so long content stays readable.
(function initSectionSnap() {
  const targets = Array.from(document.querySelectorAll('[data-snap]'));
  if (!targets.length) return;

  // Respect reduced-motion, and skip touch devices where native momentum
  // scrolling + scripted snapping tends to feel fighty.
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  if (reduceMotion || coarsePointer) return;

  const IDLE_MS = 110;      // scrolling must pause this long before we snap
  const COMMIT_PX = 40;     // moved at least this far => commit to next section
  const DURATION = 700;     // ms for the glide
  const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  let idleTimer = null;
  let animId = null;
  let isAnimating = false;
  let scrollbarDrag = false;
  // The last position where the page was at rest. Direction is measured
  // against this (not against wheel/scroll event timing, which is unreliable:
  // browsers can apply the scroll before our listeners ever run).
  let restY = window.scrollY;

  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  const clampY = y => Math.min(Math.max(y, 0), maxScroll());

  // Every valid resting position for the current layout, sorted ascending.
  // Returns [{ y, secTop, secBottom, tall }]
  function getSnapPoints() {
    const vh = window.innerHeight;
    const pts = [];
    targets.forEach(el => {
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const h = rect.height;
      if (h <= vh) {
        pts.push(clampY(top - (vh - h) / 2));           // fits: center it
      } else {
        pts.push(clampY(top));                          // tall: rest at its top...
        pts.push(clampY(top + h - vh));                 // ...and at its bottom
      }
    });
    return pts
      .sort((a, b) => a - b)
      .filter((p, i, arr) => i === 0 || Math.abs(p - arr[i - 1]) > 4);
  }

  // Are we in the "middle" of a tall section, between its top and bottom rest
  // points? If so let the user scroll/read freely (no snapping).
  function insideTallSection(y) {
    const vh = window.innerHeight;
    return targets.some(el => {
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const h = rect.height;
      return h > vh && y > top + 4 && y < top + h - vh - 4;
    });
  }

  function glideTo(targetY) {
    cancelAnimationFrame(animId);
    const startY = window.scrollY;
    const dist = targetY - startY;
    if (Math.abs(dist) < 2) { isAnimating = false; return; }
    const start = performance.now();
    isAnimating = true;
    const step = (now) => {
      const t = Math.min((now - start) / DURATION, 1);
      window.scrollTo(0, startY + dist * easeInOutCubic(t));
      if (t < 1) {
        animId = requestAnimationFrame(step);
      } else {
        isAnimating = false;
        restY = window.scrollY;
      }
    };
    animId = requestAnimationFrame(step);
  }

  function snapNow() {
    // Modal open (body scroll locked), scrollbar being dragged, or already gliding
    if (document.body.style.overflow === 'hidden' || scrollbarDrag || isAnimating) return;

    const y = window.scrollY;
    const startY = restY;

    if (insideTallSection(y)) { restY = y; return; }

    const points = getSnapPoints();
    if (!points.length) return;

    const moved = y - startY;
    let target;

    if (Math.abs(moved) >= COMMIT_PX) {
      // Deliberate scroll: go to the first snap point beyond where we started,
      // in the direction we travelled (but not past where we are now, if we
      // already sit right on one).
      if (moved > 0) {
        // nearest resting point at/after the current position, but strictly
        // beyond the start point so a small nudge advances a whole section
        target = points.find(p => p >= y - 2 && p > startY + 2);
        if (target === undefined) target = points[points.length - 1];
      } else {
        target = [...points].reverse().find(p => p <= y + 2 && p < startY - 2);
        if (target === undefined) target = points[0];
      }
    } else {
      // Tiny movement: just settle to the closest resting point
      target = points.reduce((best, p) => Math.abs(p - y) < Math.abs(best - y) ? p : best, points[0]);
    }

    if (Math.abs(target - y) < 2) restY = y;
    glideTo(target);
  }

  function onScroll() {
    if (isAnimating) return;                    // our own glide, ignore
    clearTimeout(idleTimer);
    idleTimer = setTimeout(snapNow, IDLE_MS);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // If the user grabs the wheel / keys mid-glide, hand control back instantly
  const interrupt = () => {
    if (isAnimating) { cancelAnimationFrame(animId); isAnimating = false; restY = window.scrollY; }
  };
  window.addEventListener('wheel', interrupt, { passive: true });
  window.addEventListener('keydown', interrupt);

  // Scrollbar dragging: don't yank the page out of the user's hand
  window.addEventListener('mousedown', (e) => {
    if (e.clientX >= document.documentElement.clientWidth) scrollbarDrag = true;
  });
  window.addEventListener('mouseup', () => {
    if (scrollbarDrag) { scrollbarDrag = false; onScroll(); }
  });

  // Nav / anchor links: glide with the same easing, centering when it fits
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      const vh = window.innerHeight;
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const dest = rect.height <= vh ? top - (vh - rect.height) / 2 : top;
      glideTo(clampY(dest));
    });
  });
})();

// ---------- Preloader ----------
window.addEventListener('load', () => {
  const num = document.getElementById('preNum');
  const bar = document.getElementById('preBarFill');
  let val = 0;
  bar.style.width = '100%';
  const interval = setInterval(() => {
    val += Math.ceil(Math.random() * 18);
    if (val >= 100) { val = 100; clearInterval(interval); }
    num.textContent = String(val).padStart(2, '0');
  }, 90);
  setTimeout(() => {
    document.getElementById('preloader').classList.add('done');
  }, 1300);
});

// ---------- Custom cursor ----------
const cursorDot = document.getElementById('cursorDot');
window.addEventListener('mousemove', (e) => {
  cursorDot.style.left = e.clientX + 'px';
  cursorDot.style.top = e.clientY + 'px';
});
document.querySelectorAll('a, .season-card, .team-item, .gallery-item, .robo-card').forEach(el => {
  el.addEventListener('mouseenter', () => cursorDot.classList.add('big'));
  el.addEventListener('mouseleave', () => cursorDot.classList.remove('big'));
});

// ---------- Intro video: fixed background, fades then pauses as you scroll ----------
const introVideoFrame = document.getElementById('introVideoFrame');
const introVideoEl = document.getElementById('introVideoEl');
if (introVideoFrame && introVideoEl) {
  let rafId;
  let wasZero = false;
  const updateIntroFade = () => {
    const fadeDistance = Math.max(window.innerHeight, 1);
    const opacity = Math.max(0, 1 - (window.scrollY / fadeDistance));
    introVideoFrame.style.opacity = opacity;
    if (opacity <= 0) {
      if (!wasZero) { introVideoEl.pause(); wasZero = true; }
    } else if (wasZero) {
      introVideoEl.play(); wasZero = false;
    }
  };
  const onScroll = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(updateIntroFade);
  };
  updateIntroFade();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', updateIntroFade);
}

// ---------- Header scroll state ----------
const header = document.getElementById('siteHeader');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
});

// ---------- 3D cube (STL-style mesh) driven by cursor position ----------
// Coordinate frame: each square is treated as 2x2 units, centered at origin.
// Raw cursor offset (in pixels) from the frame's center is divided by
// half the frame's own pixel size, so the result is always -1..1
// regardless of whether the square renders at laptop or phone resolution.
// Spec: x = -1 -> -180deg, x = -0.5 -> -90deg, x = 0 -> 0deg,
//       x = 0.5 -> +90deg, x = 1 -> +180deg.
// Linear map: angle(radians) = PI * x
function xToYawRadians(x) { return Math.PI * x; }
function yToPitchRadians(y) { return Math.PI * y; }

// Converts a raw pixel offset from center into the -1..1 frame value by
// dividing by half the square's measured pixel size (its "radius").
// This is the step that makes rotation identical across screen sizes:
// a bigger square has a bigger divisor, so the same fractional cursor
// position always yields the same angle, on a laptop or a phone.
function pixelOffsetToUnit(offsetPx, squarePx) {
  const halfSquare = squarePx;
  return offsetPx / halfSquare / 2 * 3;
}

// ---------- Model loading (GLB / GLTF / OBJ+MTL / STL) ----------
// Format guide:
//   .glb   BEST. One binary file with geometry + materials + textures inside.
//          Small, loads in a single request, no companion files to get lost.
//   .gltf  Same thing but as JSON + separate files (keep them in the same folder).
//   .obj   Works, but textures live in a separate .mtl + image files, and big
//          robots become huge text files. Put a same-named .mtl next to it.
//   .stl   Geometry only (no colour/texture). Rendered in a neutral aluminium.
// A canvas opts in with:  data-model="models/robot.glb"
// Canvases with no data-model keep showing the placeholder cube.
const modelCache = new Map();   // url -> Promise<THREE.Object3D>, so one file is fetched once

function loadModel(url) {
  if (modelCache.has(url)) return modelCache.get(url);
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  const promise = new Promise((resolve, reject) => {
    const need = (name) => {
      if (THREE[name]) return true;
      reject(new Error(`${name} script is missing - see the <script> tags in index.html`));
      return false;
    };
    if (ext === 'glb' || ext === 'gltf') {
      if (!need('GLTFLoader')) return;
      new THREE.GLTFLoader().load(url, (g) => resolve(g.scene), undefined, reject);
    } else if (ext === 'obj') {
      if (!need('OBJLoader')) return;
      const mtlUrl = url.replace(/\.obj(\?.*)?$/i, '.mtl');
      const parseObj = (materials) => {
        const loader = new THREE.OBJLoader();
        if (materials) loader.setMaterials(materials);
        loader.load(url, resolve, undefined, reject);
      };
      if (THREE.MTLLoader) {
        // Try to use the .mtl for textures; fall back to plain OBJ if it's absent
        const base = mtlUrl.substring(0, mtlUrl.lastIndexOf('/') + 1);
        const mtl = new THREE.MTLLoader();
        mtl.setResourcePath(base);
        mtl.load(mtlUrl, (m) => { m.preload(); parseObj(m); }, undefined, () => parseObj(null));
      } else {
        parseObj(null);
      }
    } else if (ext === 'stl') {
      if (!need('STLLoader')) return;
      new THREE.STLLoader().load(url, (geo) => {
        geo.computeVertexNormals();
        const mat = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.6, roughness: 0.35 });
        resolve(new THREE.Mesh(geo, mat));
      }, undefined, reject);
    } else {
      reject(new Error('Unsupported model format: .' + ext));
    }
  });
  modelCache.set(url, promise);
  promise.catch(() => modelCache.delete(url));   // allow retry after a failure
  return promise;
}

// Free GPU memory held by a model instance (geometry, materials, textures)
function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    mats.forEach((m) => {
      Object.keys(m).forEach((k) => { if (m[k] && m[k].isTexture) m[k].dispose(); });
      m.dispose();
    });
  });
}

// Centre a model on the origin and scale it so its largest side == targetSize
function fitToFrame(obj, targetSize) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const s = targetSize / maxDim;
  obj.scale.setScalar(s);
  obj.position.copy(center.multiplyScalar(-s));   // centred after scaling
}

function initRoboCube(canvas, opts = {}) {
  const parent = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Colours from textures should be interpreted as sRGB so they don't look washed out
  if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 5.2);

  // Lighting — key + fill + rim, so a plain cube still reads as a solid part
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 4, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8c9a8c, 0.5);
  fill.position.set(-4, -2, 2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xe8482c, 0.8);
  rim.position.set(-2, 3, -4);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x404040, 0.6));

  // The cube itself — the placeholder shown until (or instead of) a real model.
  // Rubik's cube face order for BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
  const size = opts.size || 1.6;
  const geometry = new THREE.BoxGeometry(size, size, size);
  const faceColors = [0xC41E3A, 0xFF8C00, 0xFFFFFF, 0xFFD500, 0x009E60, 0x0051BA]; // red, orange, white, yellow, green, blue
  const materials = faceColors.map(color => new THREE.MeshStandardMaterial({
    color,
    metalness: 0.15,
    roughness: 0.5,
    flatShading: true
  }));
  const cube = new THREE.Mesh(geometry, materials);
  scene.add(cube);

  // Faint edge lines so the geometry reads clearly at small sizes
  const edges = new THREE.EdgesGeometry(geometry);
  const edgeLines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x0a0b0d, linewidth: 1 }));
  cube.add(edgeLines);

  // The thing that gets rotated: starts as the cube, swapped for the model on load
  let spinner = cube;
  let loadedModel = null;

  let targetYaw = 0, targetPitch = 0;
  let currentYaw = 0, currentPitch = 0;

  function resize() {
    const w = parent.clientWidth, h = parent.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  function setFromNormalized(nx, ny) {
    // nx, ny expected in [-1, 1], (0,0) = center of frame
    targetYaw = xToYawRadians(nx);
    targetPitch = yToPitchRadians(ny);
  }

  // --- Only render while on screen: saves GPU and battery on a page with many canvases
  let visible = true;
  let rafId = null;
  let destroyed = false;

  function animate() {
    rafId = null;
    if (destroyed || !visible) return;
    rafId = requestAnimationFrame(animate);
    // ease toward target so movement feels alive, not snapped
    currentYaw += (targetYaw - currentYaw) * 0.12;
    currentPitch += (targetPitch - currentPitch) * 0.12;
    spinner.rotation.y = currentYaw;
    spinner.rotation.x = currentPitch;
    renderer.render(scene, camera);
  }
  function startLoop() { if (!rafId && !destroyed) rafId = requestAnimationFrame(animate); }

  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) startLoop();
    }, { rootMargin: '150px' });
    io.observe(canvas);
  }
  startLoop();

  // --- Swap in a real model. Loaded lazily: only once the card is near the viewport.
  function attachModel(url) {
    const begin = () => {
      loadModel(url).then((source) => {
        if (destroyed) return;
        // Clone so the same cached file can appear in several cards (hero + modal)
        const model = source.clone(true);
        // Clone shares materials/geometry; that's fine and keeps memory low. We only
        // dispose the per-instance wrapper, never the shared cache entry.
        fitToFrame(model, size * 1.9);
        const holder = new THREE.Group();
        holder.add(model);
        scene.remove(cube);
        scene.add(holder);
        spinner = holder;
        loadedModel = holder;
        parent.classList.add('model-loaded');
        startLoop();
      }).catch((err) => {
        // Never break the page over a bad file: keep the cube and say why in the console
        console.warn('[robot model] could not load "' + url + '" - showing placeholder cube.', err);
        parent.classList.add('model-failed');
      });
    };
    // Defer heavy download until the card is actually about to be seen
    if (io) {
      const lazy = new IntersectionObserver((entries, obs) => {
        if (entries.some(e => e.isIntersecting)) { obs.disconnect(); begin(); }
      }, { rootMargin: '300px' });
      lazy.observe(canvas);
    } else {
      begin();
    }
  }
  if (opts.model) attachModel(opts.model);

  // Release the WebGL context and GPU memory (used when the modal closes)
  function destroy() {
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (io) io.disconnect();
    window.removeEventListener('resize', resize);
    geometry.dispose();
    materials.forEach(m => m.dispose());
    edges.dispose();
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
  }

  return { setFromNormalized, resize, destroy };
}

// Wire the hero card's cube to cursor position across its own frame
const heroCubeCanvas = document.querySelector('#roboCard [data-robo-cube]');
if (heroCubeCanvas && window.THREE) {
  const heroCube = initRoboCube(heroCubeCanvas, { size: 1.7, model: heroCubeCanvas.dataset.model });
  const card = document.getElementById('roboCard');
  const glare = document.getElementById('roboGlare');
  const stage = card.parentElement.parentElement;

  stage.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    // Raw pixel offset of the cursor from the frame's own center
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const offsetX = e.clientX - centerX;
    const offsetY = e.clientY - centerY;
    // Divide by this square's own size (in the pixels it's actually
    // rendered at) so a bigger frame on a laptop and a smaller frame
    // on a phone produce the same rotation for the same cursor fraction
    const nx = pixelOffsetToUnit(offsetX, rect.width);
    const ny = pixelOffsetToUnit(offsetY, rect.height);
    heroCube.setFromNormalized(nx, ny);

    glare.style.setProperty('--gx', `${((nx + 1) / 2) * 100}%`);
    glare.style.setProperty('--gy', `${((ny + 1) / 2) * 100}%`);
  });
  stage.addEventListener('mouseleave', () => {
    heroCube.setFromNormalized(0, 0);
  });
}

// Wire every season-card cube the same way — each frame is its own
// independent 2x2 coordinate space, centered on that card.
if (window.THREE) {
  document.querySelectorAll('.season-cube-frame [data-robo-cube]').forEach((canvas) => {
    const frame = canvas.parentElement;
    const cubeCtl = initRoboCube(canvas, { size: 1.3, model: canvas.dataset.model });

    frame.addEventListener('mousemove', (e) => {
      const rect = frame.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const offsetX = e.clientX - centerX;
      const offsetY = e.clientY - centerY;
      const nx = pixelOffsetToUnit(offsetX, rect.width);
      const ny = pixelOffsetToUnit(offsetY, rect.height);
      cubeCtl.setFromNormalized(nx, ny);
    });
    frame.addEventListener('mouseleave', () => {
      cubeCtl.setFromNormalized(0, 0);
    });
  });
}

// ---------- ROBOT DETAIL MODAL ----------
// Modular media registry: add entries here to populate each robot's
// popup gallery. Nothing else needs to change — new items are
// automatically tiled into the 3-column grid and, if there are enough
// to overflow the panel, the whole track auto-scrolls upward as a loop.
//
// type: 'image' | 'video'
// src:  path or URL to the file
// poster (optional, video only): thumbnail shown before playback
const SEASON_MEDIA = {
  'kickathon': [
    { type: 'image', src: '2026-2027/KICKOFF1.jpeg' },
    { type: 'image', src: '2026-2027/V1.jpeg' },
    { type: 'image', src: '2026-2027/output.gif' },
    { type: 'image', src: '2026-2027/crash.gif' },
    { type: 'image', src: '2026-2027/dance.gif' },
    { type: 'image', src: '2026-2027/GROUP.jpeg' },
    { type: 'image', src: '2026-2027/score.gif' },
    { type: 'image', src: '2026-2027/measure.jpeg' },
    { type: 'image', src: '2026-2027/work.jpeg' }
    // Add more like:
    // { type: 'image', src: '2026-2027/V2.png' },
    // { type: 'video', src: '2026-2027/build-clip.mp4', poster: '2026-2027/build-clip-poster.png' },
  ],
  '2025-26': [],
  '2024-25': [],
  '2023-24': [],
  '2022-23': [],
  'coming-soon': [
    { type: 'image', src: 'https://picsum.photos/id/1025/700/440' },
  ],
};

const roboModal = document.getElementById('roboModal');
const roboModalCard = document.getElementById('roboModalCard');
const roboModalTrack = document.getElementById('roboModalTrack');
let lastFocusedEl = null;
let modalCubeCtl = null;          // the modal's own 3D viewer, destroyed on close/reopen

function destroyModalCube() {
  if (modalCubeCtl) { modalCubeCtl.destroy(); modalCubeCtl = null; }
}

function buildTile(item) {
  const tile = document.createElement('div');
  tile.className = 'robo-tile';
  if (item.type === 'video') {
    const video = document.createElement('video');
    video.src = item.src;
    if (item.poster) video.poster = item.poster;
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    tile.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = item.src;
    img.alt = item.alt || 'Robot media';
    img.loading = 'lazy';
    tile.appendChild(img);
  }
  return tile;
}

function populateGallery(seasonId) {
  const items = SEASON_MEDIA[seasonId] || [];
  roboModalTrack.innerHTML = '';
  roboModalTrack.classList.remove('robo-modal-track-anim');
  roboModalTrack.style.removeProperty('--scroll-duration');
  roboModalTrack.style.removeProperty('--scroll-distance');

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'robo-modal-empty';
    empty.textContent = 'No photos or videos yet — check back soon.';
    roboModalTrack.appendChild(empty);
    return;
  }

  // Append items
  items.forEach(item => roboModalTrack.appendChild(buildTile(item)));

  // Ensure DOM is fully rendered and image dimensions are registered
  const images = roboModalTrack.querySelectorAll('img');
  const imagePromises = Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve; // Continue if error
    });
  });

  Promise.all(imagePromises).then(() => {
    const viewport = roboModalTrack.parentElement;
    const contentHeight = roboModalTrack.scrollHeight;
    const viewportHeight = viewport.clientHeight;

    if (contentHeight > viewportHeight) {
      // Duplicate tiles so loop seamlessly overlaps
      const clones = Array.from(roboModalTrack.children).map(el => el.cloneNode(true));
      clones.forEach(clone => roboModalTrack.appendChild(clone));

      const distance = contentHeight;
      const pxPerSecond = 30; // Smooth scrolling speed
      const duration = Math.max(distance / pxPerSecond, 8);

      roboModalTrack.style.setProperty('--scroll-distance', `${distance}px`);
      roboModalTrack.style.setProperty('--scroll-duration', `${duration}s`);
      roboModalTrack.classList.add('robo-modal-track-anim');
    }
  });
}
function populateCard(seasonCard) {
  // Clone the season card's existing robo-media/robo-body content into
  // a robo-card-styled panel, so the modal always mirrors what's on
  // the actual card (image, cube canvas, title, tag, description).
  const media = seasonCard.querySelector('.season-media');
  const body = seasonCard.querySelector('.season-body');

  const card = document.createElement('div');
  card.className = 'robo-card';

  const mediaWrap = document.createElement('div');
  mediaWrap.className = 'robo-media';
  if (media) {
    Array.from(media.children).forEach(child => {
      if (child.classList.contains('season-year')) return; // shown as tag instead
      mediaWrap.appendChild(child.cloneNode(true));
    });
  }
  card.appendChild(mediaWrap);

  const tagText = body?.querySelector('.tag')?.textContent || '';
  const yearText = media?.querySelector('.season-year')?.textContent || '';
  if (tagText) {
    const tag = document.createElement('div');
    tag.className = 'robo-tag';
    tag.textContent = tagText;
    card.appendChild(tag);
  }
  if (yearText) {
    const num = document.createElement('div');
    num.className = 'robo-num';
    num.textContent = yearText;
    card.appendChild(num);
  }

  const info = document.createElement('div');
  info.className = 'robo-info';
  const h3 = document.createElement('h3');
  h3.id = 'roboModalTitle';
  h3.textContent = body?.querySelector('h3')?.textContent || 'Robot';
  const p = document.createElement('p');
  p.textContent = body?.querySelector('p')?.textContent || '';
  info.appendChild(h3);
  info.appendChild(p);
  card.appendChild(info);

  destroyModalCube();
  roboModalCard.innerHTML = '';
  roboModalCard.appendChild(card);

  // Re-initialize any 3D cube canvas that got cloned into the modal
  const clonedCanvas = mediaWrap.querySelector('[data-robo-cube]');
  if (clonedCanvas && window.THREE) {
    const cubeCtl = initRoboCube(clonedCanvas, { size: 1.6, model: clonedCanvas.dataset.model });
    modalCubeCtl = cubeCtl;
    mediaWrap.addEventListener('mousemove', (e) => {
      const rect = mediaWrap.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const nx = pixelOffsetToUnit(e.clientX - centerX, rect.width);
      const ny = pixelOffsetToUnit(e.clientY - centerY, rect.height);
      cubeCtl.setFromNormalized(nx, ny);
    });
    mediaWrap.addEventListener('mouseleave', () => cubeCtl.setFromNormalized(0, 0));
  }
}

function openRoboModal(seasonCard) {
  const seasonId = seasonCard.dataset.seasonId;
  populateCard(seasonCard);
  populateGallery(seasonId);
  lastFocusedEl = document.activeElement;
  roboModal.classList.add('open');
  roboModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  roboModal.querySelector('.robo-modal-close').focus();
}

function closeRoboModal() {
  destroyModalCube();
  roboModal.classList.remove('open');
  roboModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocusedEl) lastFocusedEl.focus();
}

document.querySelectorAll('.season-card[data-season-id]').forEach(card => {
  card.addEventListener('click', () => openRoboModal(card));
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRoboModal(card);
    }
  });
});

roboModal.querySelectorAll('[data-modal-close]').forEach(el => {
  el.addEventListener('click', closeRoboModal);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && roboModal.classList.contains('open')) closeRoboModal();
});
// ---------- Robo-tile hover overlay (escapes clipped ancestors) ----------
(function () {
  let overlayEl = null;
  let activeTile = null;

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.className = 'robo-tile-overlay';
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function showOverlay(tile) {
    const mediaEl = tile.querySelector('img, video');
    if (!mediaEl) return;

    const overlay = ensureOverlay();
    overlay.innerHTML = '';
    const clone = mediaEl.cloneNode(true);
    if (clone.tagName === 'VIDEO') {
      clone.muted = true;
      clone.autoplay = true;
      clone.loop = true;
    }
    overlay.appendChild(clone);

    const rect = tile.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    overlay.style.left = cx + 'px';
    overlay.style.top = cy + 'px';
    overlay.style.transform = 'translate(-50%, -50%)';

    requestAnimationFrame(() => overlay.classList.add('show'));
    tile.classList.add('is-active');
    activeTile = tile;
  }

  function hideOverlay() {
    if (overlayEl) overlayEl.classList.remove('show');
    if (activeTile) activeTile.classList.remove('is-active');
    activeTile = null;
  }

  // Delegate — works for tiles built dynamically by populateGallery()
  document.addEventListener('mouseover', (e) => {
    const tile = e.target.closest('.robo-tile');
    if (tile) showOverlay(tile);
  });
  document.addEventListener('mouseout', (e) => {
    const tile = e.target.closest('.robo-tile');
    if (tile && !tile.contains(e.relatedTarget)) hideOverlay();
  });
  // Hide if the modal itself closes while hovering
  document.getElementById('roboModal')?.addEventListener('transitionend', () => {
    if (!document.getElementById('roboModal').classList.contains('open')) hideOverlay();
  });
})();
// ---------- Scroll reveal ----------
const revealEls = document.querySelectorAll('.reveal, .reveal-scale');
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
revealEls.forEach(el => io.observe(el));

// ---------- Mobile nav (simple toggle placeholder) ----------
document.querySelector('.burger').addEventListener('click', () => {
  alert('Mobile menu — wire this up to a real drawer when we move past the prototype.');
});

// ---------- Dark/Light mode toggle ----------
const themeToggle = document.getElementById('themeToggle');
const htmlElement = document.documentElement;

// Check saved preference or system preference
const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const currentTheme = savedTheme || (prefersDark ? 'dark-mode' : 'light-mode');

// Apply saved or default theme
if (currentTheme === 'light-mode') {
  htmlElement.classList.add('light-mode');
  themeToggle.textContent = '🌑';
} else {
  htmlElement.classList.remove('light-mode');
  themeToggle.textContent = '☀️';
}

// Toggle theme on click
themeToggle.addEventListener('click', (e) => {
  e.preventDefault();
  htmlElement.classList.toggle('light-mode');
  const isLightMode = htmlElement.classList.contains('light-mode');
  localStorage.setItem('theme', isLightMode ? 'light-mode' : 'dark-mode');
  themeToggle.textContent = isLightMode ? '🌑' : '☀️';
});
