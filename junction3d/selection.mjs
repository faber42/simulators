import { locations, simulationUrl } from './locations/index.mjs';
import { buildPath, samplePath } from './engine.mjs';
import { getLightingProfile } from './time-model.mjs';

// Static atlas diagrams share the scene geometry without initializing WebGL.
document.body.classList.toggle('night', getLightingProfile(Date.now(), 'Europe/Berlin').daylight < .55);
const svgNS = 'http://www.w3.org/2000/svg';
function element(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text) result.textContent = text;
  return result;
}
function svgElement(tag, attrs) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
function diagram(config) {
  const svg = svgElement('svg', { viewBox: '-160 -106 320 212', 'aria-hidden': 'true' });
  for (const b of [...(config.environment?.buildings || []), ...(config.environment?.pavilions || []), ...(config.environment?.landmarks || [])]) svg.append(svgElement('rect', { x: b.x - b.width / 2, y: b.z - b.depth / 2, width: b.width, height: b.depth, rx: b.type === 'rounded-corner' ? 5 : 1, fill: b.type === 'skate-court' ? 'var(--map-sidewalk)' : 'var(--map-building)', transform: `rotate(${-((b.rotation || 0) * 180 / Math.PI)} ${b.x} ${b.z})` }));
  for (const road of config.roads) {
    const path = buildPath(road.points);
    const d = path.samples.filter((_, index) => index % 6 === 0).concat(path.samples.at(-1)).map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(' ');
    for (const [width, color] of [[road.width + 4, 'var(--map-sidewalk)'], [road.width, 'var(--map-road)']]) {
      svg.append(svgElement('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    }
  }
  for (const island of config.islands || []) svg.append(svgElement('polygon', { points: island.points.map(p => p.join(',')).join(' '), fill: 'var(--map-ground)', stroke: 'var(--map-sidewalk)', 'stroke-width': .8 }));
  const rails = config.environment?.rails;
  if (rails) for (const z of rails.tracks) svg.append(svgElement('path', { d: `M${rails.from},${z}H${rails.to}`, fill: 'none', stroke: 'var(--map-rail)', 'stroke-width': 1.2 }));
  const painted = new Set();
  for (const route of config.routes) {
    if (painted.has(route.laneId)) continue;
    painted.add(route.laneId);
    const path = buildPath(route.points), p = samplePath(path, path.length * .19);
    svg.append(svgElement('rect', { x: p.x - 1, y: p.z - 2.2, width: 2, height: 4.4, rx: .5, fill: 'var(--map-car)', transform: `rotate(${-p.heading * 180 / Math.PI} ${p.x} ${p.z})` }));
  }
  for (const gantry of config.signalGantries || []) svg.append(svgElement('circle', { cx: gantry.anchor[0], cy: gantry.anchor[1], r: 2.5, fill: '#d8ebaf', stroke: '#38583c', 'stroke-width': 1.2 }));
  return svg;
}

for (const location of locations) {
  const card = element('a', 'location-card');
  card.href = simulationUrl(location.slug);
  card.setAttribute('aria-label', `Kreuzung ${location.name} öffnen`);
  const preview = element('div', 'map-preview');
  preview.append(element('span', 'map-number', location.number), element('span', 'map-north', 'N ↑'), element('span', 'map-caption', 'LAGEPLAN · 3D ERKUNDEN'));
  const content = element('div', 'card-content'), title = element('div', 'card-title');
  title.append(element('h2', '', location.name), element('span', '', location.city));
  content.append(title, element('p', 'road-names', location.roads), element('p', 'card-description', location.description));
  const tags = element('ul', 'tags');
  for (const feature of location.features) tags.append(element('li', '', feature));
  const open = element('div', 'open-location', 'Kreuzung erkunden');
  open.append(element('span', '', '↗'));
  content.append(tags, open); card.append(preview, content);
  document.getElementById('locations').append(card);
  location.load().then(config => preview.prepend(diagram(config))).catch(error => {
    console.error(`Vorschau für ${location.name} nicht verfügbar.`, error);
    preview.querySelector('.map-caption').textContent = '3D ERKUNDEN';
  });
}
