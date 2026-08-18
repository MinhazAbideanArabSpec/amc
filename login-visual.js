// login-visual.js — generates the animated starfield + constellation lines
// behind the login screen's brand panel heading. Pure decoration: runs once
// on load and populates #const-svg (defined in index.html, with the glow
// gradients / star glyph already in its <defs>) regardless of whether the
// login screen is currently visible.

document.addEventListener('DOMContentLoaded', () => {
  const svg = document.getElementById('const-svg');
  if (!svg) return;

  const NS = 'http://www.w3.org/2000/svg';
  const W = 460, H = 640;
  const STAR_COUNT = 36;
  const HERO_COUNT = 9;
  const stars = [];

  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, r: 0.6 + Math.random() * 1.3, hero: false });
  }
  for (let i = 0; i < HERO_COUNT; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, scale: 0.55 + Math.random() * 1, hero: true });
  }

  // Constellation lines: connect nearby stars, capped so it stays a sparse
  // scattered pattern rather than a dense mesh.
  const MAX_DIST = 130;
  const candidates = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MAX_DIST) candidates.push({ a: stars[i], b: stars[j] });
    }
  }
  candidates.sort(() => Math.random() - 0.5);
  const lines = candidates.slice(0, 26);

  lines.forEach(l => {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('x1', l.a.x.toFixed(1)); el.setAttribute('y1', l.a.y.toFixed(1));
    el.setAttribute('x2', l.b.x.toFixed(1)); el.setAttribute('y2', l.b.y.toFixed(1));
    el.setAttribute('class', 'const-line');
    el.style.animationDuration = (7 + Math.random() * 8).toFixed(1) + 's';
    el.style.animationDelay = '-' + (Math.random() * 12).toFixed(1) + 's';
    svg.appendChild(el);
  });

  // Negative animation-delay starts each star already mid-cycle, so the
  // field looks alive from the first frame instead of pulsing in unison.
  let heroIdx = 0;
  stars.forEach((s, idx) => {
    if (s.hero) {
      const accent = heroIdx % 3 === 0;
      heroIdx++;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'star-hero');
      g.setAttribute('transform', `translate(${s.x.toFixed(1)},${s.y.toFixed(1)}) scale(${s.scale.toFixed(2)})`);
      g.style.animationDuration = (4 + Math.random() * 4).toFixed(1) + 's';
      g.style.animationDelay = '-' + (Math.random() * 8).toFixed(1) + 's';

      const glow = document.createElementNS(NS, 'circle');
      glow.setAttribute('cx', 0); glow.setAttribute('cy', 0); glow.setAttribute('r', 16);
      glow.setAttribute('fill', accent ? 'url(#star-glow-accent)' : 'url(#star-glow)');
      g.appendChild(glow);

      const glyph = document.createElementNS(NS, 'use');
      glyph.setAttribute('href', '#star-glyph');
      glyph.setAttribute('fill', accent ? '#c9e6d6' : '#ffffff');
      g.appendChild(glyph);

      svg.appendChild(g);
    } else {
      const el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', s.x.toFixed(1)); el.setAttribute('cy', s.y.toFixed(1)); el.setAttribute('r', s.r.toFixed(2));
      el.setAttribute('class', 'star' + (idx % 9 === 0 ? ' star-accent' : ''));
      el.style.animationDuration = (3 + Math.random() * 4).toFixed(1) + 's';
      el.style.animationDelay = '-' + (Math.random() * 8).toFixed(1) + 's';
      svg.appendChild(el);
    }
  });
});
