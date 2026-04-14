// themes.js — Theme switching logic

const THEMES = [
  {
    id: 'blackout',
    name: 'Blackout',
    sub: 'Terminal dark · IronZ red',
    bg:     '#000000',
    surface:'#0d0d0d',
    accent: '#e53e3e',
    muted:  '#333333',
  },
  {
    id: 'iron',
    name: 'Iron',
    sub: 'Navy charcoal · IronZ red',
    bg:     '#151925',
    surface:'#1e2535',
    accent: '#e53e3e',
    muted:  '#2a3347',
  },
  {
    id: 'stone',
    name: 'Stone',
    sub: 'Off-white · ink black · editorial',
    bg:     '#edeae4',
    surface:'#f5f2ee',
    accent: '#111111',
    muted:  '#d4d0cb',
  },
];

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('theme', id);
  renderThemePicker(); // refresh checkmarks
}

function loadTheme() {
  const saved = localStorage.getItem('theme') || 'stone';
  document.documentElement.setAttribute('data-theme', saved);
}

function renderThemePicker() {
  const el = document.getElementById('theme-picker-grid');
  if (!el) return;

  const active = localStorage.getItem('theme') || 'stone';

  el.innerHTML = THEMES.map(t => `
    <div class="theme-card ${t.id === active ? 'is-active' : ''}" onclick="applyTheme('${t.id}')">
      <div class="theme-card__preview" style="background:${t.bg}">
        <div class="theme-card__bar theme-card__bar--full"  style="background:${t.muted}"></div>
        <div class="theme-card__bar theme-card__bar--accent" style="background:${t.accent}"></div>
        <div class="theme-card__bar theme-card__bar--muted"  style="background:${t.accent}"></div>
        <div class="theme-card__bar theme-card__bar--full"  style="background:${t.muted}"></div>
      </div>
      <div class="theme-card__label" style="background:${t.surface}">
        <div class="theme-card__name" style="color:${t.id === 'stone' ? '#111' : '#fff'}">${t.name}</div>
        <div class="theme-card__sub"  style="color:${t.id === 'stone' ? '#888' : '#666'}">${t.sub}</div>
      </div>
      <div class="theme-card__check">✓</div>
    </div>
  `).join('');
}
