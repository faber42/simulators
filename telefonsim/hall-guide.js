import * as THREE from '../pinsim/three.module.min.js';
import { areaOrigin } from './topology.mjs';
import { blockLayout, guideSelection } from './hall-guide.mjs';

// An expanded plan, using the same two-column / five-row layout as the racks.
// The tiny fields explicitly represent fourth-digit groups, not single phones.
export class HallGuide {
  constructor(section) {
    this.section = section;
    this.panel = document.getElementById('block-detail');
    this.grid = document.getElementById('block-grid');
    this.link = document.getElementById('block-link');
    this.line = this.link.querySelector('path'); this.anchor = this.link.querySelector('circle');
    this.key = ''; this.prefix = ''; this.selection = null;
  }
  update(engine) {
    this.selection = guideSelection(engine);
    const key = JSON.stringify(this.selection); if (key === this.key) return;
    this.key = key;
    const selected = this.selection;
    this.panel.hidden = !selected; this.link.toggleAttribute('hidden', !selected);
    this.section.classList.toggle('has-detail', !!selected);
    if (!selected) return;
    if (selected.prefix !== this.prefix) {
      this.prefix = selected.prefix; this.grid.replaceChildren();
      for (const branch of blockLayout(this.prefix)) {
        const tile = document.createElement('div'); tile.className = 'block-branch'; tile.dataset.digit = branch.digit;
        tile.style.gridColumn = branch.column + 1; tile.style.gridRow = branch.row + 1;
        tile.innerHTML = `<div class="branch-heading"><b>${branch.digit}</b><span>${branch.prefix}xxx</span></div><div class="branch-banks"></div>`;
        tile.setAttribute('aria-label', `Ziffer 3: ${branch.digit}, Gasse ${branch.prefix}xxx`);
        for (const bank of branch.banks) {
          const field = document.createElement('span'); field.textContent = bank.digit; field.dataset.digit = bank.digit;
          field.title = `Ziffer 4: ${bank.digit} → ${bank.prefix}xx · 100 Anschlüsse`;
          tile.lastElementChild.append(field);
        }
        this.grid.append(tile);
      }
    }
    document.getElementById('block-title').textContent = `${selected.prefix}xxxx`;
    document.getElementById('block-coordinates').textContent = `Spalte ${selected.column} × Reihe ${selected.row} → 10.000 Rufnummern`;
    for (const tile of this.grid.children) {
      const active = tile.dataset.digit === selected.third;
      tile.classList.toggle('selected', active);
      tile.classList.toggle('preview', tile.dataset.digit === selected.previewThird);
      for (const field of tile.lastElementChild.children) {
        field.classList.toggle('selected', active && field.dataset.digit === selected.fourth);
        field.classList.toggle('preview', active && field.dataset.digit === selected.previewFourth);
      }
    }
    document.getElementById('block-chosen').textContent = selected.fourth
      ? `${selected.prefix}${selected.third}${selected.fourth}xx · 100 Anschlüsse`
      : selected.third ? `${selected.prefix}${selected.third}xxx · 1.000 Rufnummern` : 'Ziffer 3 wählt eine der zehn Gassen';
    const explanation = selected.releasing ? 'Alle belegten Wähler stellen gemeinsam zurück.'
      : selected.sixth ? `${selected.prefix}${selected.third}${selected.fourth}${selected.fifth}${selected.sixth}: Höhe ${selected.level}, Drehkontakt ${selected.contact}.`
      : selected.fifth ? `Ziffer 5: Höhe ${selected.level}. Ziffer 6 wählt den Drehkontakt.`
      : selected.fourth ? 'Im Leitungswähler: Ziffer 5 hebt, Ziffer 6 dreht.'
      : selected.third ? 'Ziffer 4 wählt eines der zehn kleinen Felder in dieser Gasse.'
      : 'Große Ziffer = Gasse. Kleine Ziffern = Hundertergruppen (Ziffer 4).';
    document.getElementById('block-explanation').textContent = explanation;
  }
  project(camera, worldRect) {
    if (!this.selection) return;
    const [x, , z] = areaOrigin(this.selection.prefix);
    const point = new THREE.Vector3(x - 62, 18, z - 35).project(camera);
    const rect = this.section.getBoundingClientRect(), panel = this.panel.getBoundingClientRect();
    const px = worldRect.left - rect.left + (point.x + 1) * worldRect.width / 2;
    const py = worldRect.top - rect.top + (1 - point.y) * worldRect.height / 2;
    const stacked = panel.bottom < worldRect.top + 5;
    const sx = stacked ? panel.left - rect.left + panel.width / 2 : panel.right - rect.left;
    const sy = stacked ? panel.bottom - rect.top : panel.top - rect.top + 28;
    this.link.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    this.line.setAttribute('d', stacked ? `M ${sx} ${sy} V ${sy + 12} L ${px} ${py}` : `M ${sx} ${sy} H ${sx + 12} L ${px} ${py}`);
    this.anchor.setAttribute('cx', px); this.anchor.setAttribute('cy', py);
    this.link.style.opacity = point.z > -1 && point.z < 1 ? '1' : '0';
  }
}
