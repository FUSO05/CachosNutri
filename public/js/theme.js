// ── CachosNutri theme.js ────────────────────────────────────────────────────
// Cópia mínima da lógica de tema claro/escuro de shared.js, para páginas que
// não carregam esse ficheiro (index.html, termos.html, privacidade.html,
// reembolso.html) — evita puxar ~400 linhas de código do Supabase/fotos
// irrelevantes numa página pública/legal só para ter o botão de tema.
// A deteção inicial (system preference + localStorage) já corre inline no
// <head> de cada página, antes deste ficheiro carregar, para evitar um flash
// do tema errado (FOUC) — este bloco só liga o clique do botão.
const THEME_KEY = 'cachos_theme';

function isDarkTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
}

function toggleTheme() {
  const next = isDarkTheme() ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  applyTheme(next);
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  btn.setAttribute('aria-pressed', isDarkTheme() ? 'true' : 'false');
  btn.addEventListener('click', toggleTheme);
}

document.addEventListener('DOMContentLoaded', initThemeToggle);
