import { bandFor, LEVEL_NAMES } from './audio.js';
import { telemetryLine } from './text.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.sym = $('beat-sym');
    this.hz = $('beat-hz');
    this.band = $('beat-band');
    this.carrier = $('beat-carrier');
    this.level = $('beat-level');
    this.wave = $('beat-wave').getContext('2d');
    this.status = $('status-lines');
    this.prompt = $('prompt');
    this.promptText = $('prompt-text');
    this.promptBar = $('prompt-bar');
    this.toastEl = $('toast');
    this.storyEl = $('story');
    this.noteEl = $('note');
    this.markerLayer = $('markers');
    this.journalEl = $('journal');
    this.journalBody = $('journal-body');
    this.storyQueue = [];
    this.storyBusy = false;
    this.toastTimer = 0;
    this.noteTimer = 0;
  }

  show() {
    this.root.classList.remove('hidden');
  }

  toggle() {
    this.root.classList.toggle('hidden');
  }

  // ---------- binaural readout ----------

  beat(audio, listening, time) {
    const hz = audio.beatHz;
    const band = bandFor(hz);
    this.sym.textContent = band.sym;
    this.hz.textContent = hz.toFixed(1);
    this.band.textContent = band.name + (listening ? ' · listening' : '');
    const c = audio.carrierHz;
    this.carrier.textContent = `L ${(c - hz / 2).toFixed(1)} · R ${(c + hz / 2).toFixed(1)} Hz`;
    const lvl = audio.beatLevel;
    this.level.textContent = `${'▰'.repeat(lvl)}${'▱'.repeat(3 - lvl)} ${LEVEL_NAMES[lvl]}`;

    // One second of the two tones summed: count the swells and you count the Hz.
    const g = this.wave;
    const { width: w, height: h } = g.canvas;
    g.clearRect(0, 0, w, h);
    const amp = [0, 0.4, 0.7, 1][lvl] * (h / 2 - 2);
    const visCarrier = 46;
    const shift = time * 0.12;
    g.strokeStyle = 'rgba(255, 190, 122, 0.35)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= w; x++) {
      const s = x / w + shift;
      const y = (Math.sin(2 * Math.PI * visCarrier * s) + Math.sin(2 * Math.PI * (visCarrier + hz) * s)) / 2;
      g.lineTo(x, h / 2 - y * amp);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255, 190, 122, 0.9)';
    g.beginPath();
    for (let x = 0; x <= w; x++) {
      const s = x / w + shift;
      g.lineTo(x, h / 2 - Math.abs(Math.cos(Math.PI * hz * s)) * amp);
    }
    g.stroke();
  }

  statusLines(lines) {
    this.status.innerHTML = '';
    for (const l of lines) {
      const d = document.createElement('div');
      d.textContent = l;
      this.status.appendChild(d);
    }
  }

  // ---------- transient text ----------

  toast(text, ms = 2600) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  // Small, low-key line about a hull you just passed.
  note(lines, cls = '') {
    this.noteEl.innerHTML = '';
    this.noteEl.className = `show ${cls}`;
    for (const l of lines) {
      const d = document.createElement('div');
      d.className = l.cls ?? '';
      d.textContent = l.text;
      this.noteEl.appendChild(d);
    }
    clearTimeout(this.noteTimer);
    this.noteTimer = setTimeout(() => (this.noteEl.className = cls), 7000);
  }

  story(lines, cls = '') {
    this.storyQueue.push({ lines, cls });
    this.pumpStory();
  }

  pumpStory() {
    if (this.storyBusy || !this.storyQueue.length) return;
    this.storyBusy = true;
    const { lines, cls } = this.storyQueue.shift();
    const block = document.createElement('div');
    block.className = `line ${cls}`;
    for (const l of lines) {
      const d = document.createElement('div');
      d.className = l.cls ?? '';
      d.textContent = l.text;
      block.appendChild(d);
    }
    this.storyEl.appendChild(block);
    requestAnimationFrame(() => requestAnimationFrame(() => block.classList.add('show')));
    const chars = lines.reduce((n, l) => n + l.text.length, 0);
    setTimeout(() => {
      block.classList.remove('show');
      setTimeout(() => {
        block.remove();
        this.storyBusy = false;
        this.pumpStory();
      }, 2200);
    }, 4000 + chars * 55);
  }

  attunePrompt(text, progress) {
    if (text == null) {
      this.prompt.classList.remove('show');
      return;
    }
    this.prompt.classList.add('show');
    this.promptText.textContent = text;
    this.promptBar.style.width = `${Math.round(progress * 100)}%`;
  }

  // ---------- markers ----------

  marker(cls) {
    const el = document.createElement('div');
    el.className = `marker ${cls}`;
    el.innerHTML = '<div class="pip"></div><div class="label"></div>';
    this.markerLayer.appendChild(el);
    return { el, label: el.querySelector('.label'), shown: false };
  }

  placeMarker(m, x, y, opacity, label, classes) {
    if (x == null) {
      if (m.shown) m.el.style.display = 'none';
      m.shown = false;
      return;
    }
    if (!m.shown) m.el.style.display = 'block';
    m.shown = true;
    m.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    m.el.style.opacity = opacity;
    if (m.label.textContent !== label) m.label.textContent = label;
    for (const [k, v] of Object.entries(classes)) m.el.classList.toggle(k, v);
  }

  // ---------- journal ----------

  get journalOpen() {
    return this.journalEl.classList.contains('show');
  }

  toggleJournal(journal) {
    const open = !this.journalOpen;
    this.journalEl.classList.toggle('show', open);
    document.body.classList.toggle('reading', open);
    if (open) this.renderJournal(journal);
  }

  renderJournal(journal) {
    const body = this.journalBody;
    body.innerHTML = '';
    const section = (title, cls = '') => {
      const s = document.createElement('section');
      s.className = cls;
      const h = document.createElement('h3');
      h.textContent = title;
      s.appendChild(h);
      body.appendChild(s);
      return s;
    };
    const para = (parent, text, cls = '') => {
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      parent.appendChild(p);
    };
    if (!journal.record.length && !journal.ships.size) {
      para(body, 'nothing yet. find an echo near a hull, slow down, and hold space.', 'empty');
      return;
    }
    if (journal.record.length) {
      const s = section('fleet record', 'record');
      journal.record.forEach((r) => para(s, r));
    }
    for (const [spec, entries] of journal.ships) {
      const s = section(`${spec.id.type} · “${spec.id.name}” · ${spec.id.designation}`, spec.living ? 'alive' : '');
      para(s, telemetryLine(spec.telemetry), 'telemetry');
      entries.forEach((e) => para(s, e));
    }
  }
}
