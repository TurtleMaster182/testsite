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

function initRoboCube(canvas, opts = {}) {
  const parent = canvas.parentElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

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

  // The cube itself — standing in for an imported STL mesh.
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

  let targetYaw = 0, targetPitch = 0;
  let currentYaw = 0, currentPitch = 0;

  function resize() {
    const w = parent.clientWidth, h = parent.clientHeight;
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

  function animate() {
    requestAnimationFrame(animate);
    // ease toward target so movement feels alive, not snapped
    currentYaw += (targetYaw - currentYaw) * 0.12;
    currentPitch += (targetPitch - currentPitch) * 0.12;
    cube.rotation.y = currentYaw;
    cube.rotation.x = currentPitch;
    renderer.render(scene, camera);
  }
  animate();

  return { setFromNormalized, resize };
}

// Wire the hero card's cube to cursor position across its own frame
const heroCubeCanvas = document.querySelector('#roboCard [data-robo-cube]');
if (heroCubeCanvas && window.THREE) {
  const heroCube = initRoboCube(heroCubeCanvas, { size: 1.7 });
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
    const cubeCtl = initRoboCube(canvas, { size: 1.3 });

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

  roboModalCard.innerHTML = '';
  roboModalCard.appendChild(card);

  // Re-initialize any 3D cube canvas that got cloned into the modal
  const clonedCanvas = mediaWrap.querySelector('[data-robo-cube]');
  if (clonedCanvas && window.THREE) {
    const cubeCtl = initRoboCube(clonedCanvas, { size: 1.6 });
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
  themeToggle.textContent = '☀️';
} else {
  htmlElement.classList.remove('light-mode');
  themeToggle.textContent = '🌶️';
}

// Toggle theme on click
themeToggle.addEventListener('click', (e) => {
  e.preventDefault();
  htmlElement.classList.toggle('light-mode');
  const isLightMode = htmlElement.classList.contains('light-mode');
  localStorage.setItem('theme', isLightMode ? 'light-mode' : 'dark-mode');
  themeToggle.textContent = isLightMode ? '☀️' : '🌶️';
});
