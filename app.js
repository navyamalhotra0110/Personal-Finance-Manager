/* ============================================================
   FINTRACK — Student Personal Finance Manager
   app.js — Main Application Logic
   ============================================================ */

'use strict';

/* ── Constants ── */
const CATEGORIES = {
  food:          { label: 'Food',          icon: '🍔', color: '#ff6b00' },
  travel:        { label: 'Travel',        icon: '🚌', color: '#00d4ff' },
  books:         { label: 'Books',         icon: '📚', color: '#a78bfa' },
  entertainment: { label: 'Entertainment', icon: '🎮', color: '#ff006e' },
  stationery:    { label: 'Stationery',    icon: '✏️', color: '#00ff88' },
  other:         { label: 'Other',         icon: '📦', color: '#ffd60a' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURR_MONTH = new Date().getMonth();
const CURR_YEAR  = new Date().getFullYear();

/* ── One-time cleanup of old global ft_ keys (pre-multi-user era) ── */
(function cleanLegacyKeys() {
  const legacyKeys = ['ft_expenses','ft_income','ft_goals','ft_budget','ft_profile','ft_seeded'];
  legacyKeys.forEach(k => localStorage.removeItem(k));
})();

/* ══════════════════════════════════════════
   STORAGE — Raw LocalStorage helpers
   (No user prefix here — prefix is handled
    by Auth.key() before every call)
   ══════════════════════════════════════════ */
const Store = {
  get:    (key, def = null) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set:    (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  remove: (key)      => { localStorage.removeItem(key); },
};

/* ══════════════════════════════════════════
   AUTH — Per-user session management
   Keys used:
     ft_current_user      → currently logged-in username (global)
     ft_users             → array of all known usernames  (global)
     ft_theme             → light | dark                  (global)
     {user}_expenses      → user's expense array
     {user}_income        → user's income array
     {user}_goals         → user's goals array
     {user}_budget        → user's budget object
     {user}_profile       → user's profile object
     {user}_seeded        → boolean, demo data seeded flag
   ══════════════════════════════════════════ */
const Auth = {
  /* Returns the sanitized current username or null */
  getUser() {
    return Store.get('ft_current_user', null);
  },

  /* Build a namespaced key for the current user */
  key(suffix) {
    const u = this.getUser();
    if (!u) return suffix;           // fallback (login page context)
    return `${u}_${suffix}`;
  },

  /* Log in: set current user + register in users list */
  login(username) {
    Store.set('ft_current_user', username);
    const users = this.getAllUsers();
    if (!users.includes(username)) {
      users.push(username);
      Store.set('ft_users', users);
    }
  },

  /* Log out: clear current user, redirect to login */
  logout() {
    Store.remove('ft_current_user');
    window.location.href = 'login.html';
  },

  /* Return all known usernames */
  getAllUsers() {
    return Store.get('ft_users', []);
  },

  /* Return profile object for any username (for login page preview) */
  getUserProfile(username) {
    return Store.get(`${username}_profile`, null);
  },

  /* Permanently delete all data for a username */
  deleteUser(username) {
    ['expenses','income','goals','budget','profile','seeded'].forEach(k => {
      Store.remove(`${username}_${k}`);
    });
    const users = this.getAllUsers().filter(u => u !== username);
    Store.set('ft_users', users);
    if (this.getUser() === username) Store.remove('ft_current_user');
  },

  /* Guard: redirect to login if no user is logged in.
     Call this at the top of DOMContentLoaded on every app page. */
  guard() {
    const pathname = window.location.pathname;
    const isLoginPage   = pathname.endsWith('login.html');
    const isLandingPage = pathname.endsWith('index.html') || pathname === '/' || pathname === '';
    const user = this.getUser();
    if (!user && !isLoginPage && !isLandingPage) {
      window.location.href = 'login.html';
      return false;
    }
    if (user && isLoginPage) {
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  },
};

/* ══════════════════════════════════════════
   STATE — All reads/writes use Auth.key()
   so every user gets their own isolated data
   ══════════════════════════════════════════ */
const DEFAULT_BUDGET = {
  total: 5000,
  cats: { food:1200, travel:600, books:400, entertainment:500, stationery:300, other:400 },
};

const state = {
  get expenses()  { return Store.get(Auth.key('expenses'), []); },
  set expenses(v) { Store.set(Auth.key('expenses'), v); },

  get budget()    { return Store.get(Auth.key('budget'), DEFAULT_BUDGET); },
  set budget(v)   { Store.set(Auth.key('budget'), v); },

  get goals()     { return Store.get(Auth.key('goals'), []); },
  set goals(v)    { Store.set(Auth.key('goals'), v); },

  get income()    { return Store.get(Auth.key('income'), []); },
  set income(v)   { Store.set(Auth.key('income'), v); },

  get profile()   { return Store.get(Auth.key('profile'), null); },
  set profile(v)  { Store.set(Auth.key('profile'), v); },
};


/* ══════════════════════════════════════════
   PROFILE & PERSONALIZATION SYSTEM
   ══════════════════════════════════════════ */

const AVATARS = ['🧑‍💻','👩‍🎓','👨‍🎓','🧑‍🎓','👩‍💼','👨‍💼','🧑‍🔬','👩‍🔬','🦸','🧑‍🎨','🧑‍🚀','🐼','🦊','🐯','🦋','🌟'];
const INCOME_TYPES = ['Pocket Money','Scholarship','Part-time Job','Freelancing','Other'];

function injectProfileModal() {
  const html = `
  <!-- Onboarding Modal -->
  <div class="modal-overlay" id="onboarding-modal" style="z-index:3000">
    <div class="modal" style="max-width:540px">
      <div style="text-align:center;margin-bottom:1.75rem">
        <div style="font-size:2.5rem;margin-bottom:0.75rem" id="onboard-avatar-preview">🧑‍💻</div>
        <h2 class="modal-title" style="font-size:1.6rem">Welcome to FinTrack! 🎉</h2>
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-top:0.4rem">Let's personalise your experience in 30 seconds</p>
      </div>
      <div class="form-group">
        <label class="form-label">Your Name *</label>
        <input id="onboard-name" class="form-control" placeholder="e.g. Navya" maxlength="30" required style="font-size:1.1rem" />
      </div>
      <div class="form-group">
        <label class="form-label">Pick Your Avatar</label>
        <div id="avatar-grid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px">
          ${AVATARS.map((a,i) => `<button type="button" class="avatar-btn" data-emoji="${a}" onclick="selectAvatar(this)" style="font-size:1.5rem;padding:8px;background:var(--glass);border:2px solid ${i===0?'var(--cyan)':'var(--glass-border)'};border-radius:10px;cursor:pointer;transition:all 0.2s">${a}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Primary Income Source</label>
        <select id="onboard-income-type" class="form-control">
          ${INCOME_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Monthly Budget (₹)</label>
        <input id="onboard-budget" type="number" class="form-control" placeholder="e.g. 5000" min="100" value="5000" />
      </div>
      <div class="form-group">
        <label class="form-label">College / University (optional)</label>
        <input id="onboard-college" class="form-control" placeholder="e.g. Chitkara University" maxlength="60" />
      </div>
      <button class="btn btn-primary w-full btn-lg" style="margin-top:0.5rem" onclick="saveProfile()">
        🚀 Let's Go!
      </button>
    </div>
  </div>

  <!-- Profile / Settings Modal -->
  <div class="modal-overlay" id="profile-modal">
    <div class="modal" style="max-width:480px">
      <div class="modal-header">
        <h2 class="modal-title">⚙️ Profile & Settings</h2>
        <button class="modal-close" onclick="closeModal('profile-modal')">✕</button>
      </div>

      <!-- Profile Card -->
      <div style="display:flex;align-items:center;gap:1rem;padding:1.25rem;background:var(--glass);border:1px solid var(--glass-border);border-radius:var(--radius);margin-bottom:1.5rem">
        <div id="profile-avatar-display" style="font-size:2.5rem;line-height:1">🧑‍💻</div>
        <div>
          <div id="profile-name-display" style="font-family:var(--font-display);font-size:1.2rem;font-weight:700">—</div>
          <div id="profile-college-display" style="font-size:0.82rem;color:var(--text-muted);margin-top:2px">—</div>
          <div id="profile-income-display" style="font-size:0.82rem;color:var(--cyan);margin-top:2px">—</div>
        </div>
      </div>

      <!-- Edit Profile -->
      <div class="section-title mb-2"><div class="title-accent"></div>Edit Profile</div>
      <div class="form-group">
        <label class="form-label">Name</label>
        <input id="edit-name" class="form-control" maxlength="30" />
      </div>
      <div class="form-group">
        <label class="form-label">Avatar</label>
        <div id="edit-avatar-grid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:5px">
          ${AVATARS.map(a => `<button type="button" class="edit-avatar-btn" data-emoji="${a}" onclick="selectEditAvatar(this)" style="font-size:1.3rem;padding:6px;background:var(--glass);border:2px solid var(--glass-border);border-radius:8px;cursor:pointer;transition:all 0.2s">${a}</button>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Income Source</label>
          <select id="edit-income-type" class="form-control">
            ${INCOME_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">College</label>
          <input id="edit-college" class="form-control" maxlength="60" />
        </div>
      </div>
      <button class="btn btn-primary w-full mb-2" onclick="updateProfile()">💾 Save Changes</button>

      <div class="divider"></div>

      <!-- Danger Zone -->
      <div class="section-title mb-2" style="color:var(--pink)"><div class="title-accent" style="background:var(--pink)"></div>⚠️ Danger Zone</div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <button class="btn btn-danger" style="flex:1" onclick="confirmReset('data')">🗑️ Reset All Data</button>
        <button class="btn btn-danger" style="flex:1" onclick="confirmReset('full')">💥 Full Reset</button>
      </div>
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">
        <strong>Reset Data</strong> clears expenses, income & goals but keeps your profile.<br>
        <strong>Full Reset</strong> deletes everything including your profile.
      </p>
    </div>
  </div>

  <!-- Reset Confirmation Modal -->
  <div class="modal-overlay" id="reset-confirm-modal" style="z-index:4000">
    <div class="modal" style="max-width:400px;text-align:center">
      <div style="font-size:3rem;margin-bottom:1rem" id="reset-icon">⚠️</div>
      <h2 class="modal-title" style="margin-bottom:0.5rem" id="reset-title">Reset All Data?</h2>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem" id="reset-desc">This will permanently delete all your expenses, income records, and savings goals. This cannot be undone.</p>
      <div style="display:flex;gap:0.75rem">
        <button class="btn btn-secondary w-full" onclick="closeModal('reset-confirm-modal')">Cancel</button>
        <button class="btn btn-danger w-full" id="reset-confirm-btn" onclick="executeReset()">Yes, Reset</button>
      </div>
    </div>
  </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

let pendingResetType = 'data';

function confirmReset(type) {
  pendingResetType = type;
  const titleEl = $('reset-title');
  const descEl  = $('reset-desc');
  const iconEl  = $('reset-icon');
  if (type === 'full') {
    titleEl.textContent = 'Full Reset?';
    descEl.textContent  = 'This deletes EVERYTHING — your profile, all expenses, income, goals, and settings. You will go back to the welcome screen.';
    iconEl.textContent  = '💥';
  } else {
    titleEl.textContent = 'Reset All Data?';
    descEl.textContent  = 'This permanently deletes all expenses, income records, savings goals, and budget settings. Your profile is kept.';
    iconEl.textContent  = '🗑️';
  }
  closeModal('profile-modal');
  openModal('reset-confirm-modal');
}

function executeReset() {
  const user = Auth.getUser();
  if (pendingResetType === 'full') {
    // Wipe all this user's data and log them out
    Auth.deleteUser(user);
    closeModal('reset-confirm-modal');
    toast('All data deleted. Goodbye! 👋', 'info');
    setTimeout(() => Auth.logout(), 900);
  } else {
    // Clear only financial data — keep profile & session
    ['expenses','income','goals','budget','seeded'].forEach(k => Store.remove(`${user}_${k}`));
    closeModal('reset-confirm-modal');
    toast('Your data has been reset!', 'info');
    setTimeout(() => location.reload(), 800);
  }
}

function selectAvatar(btn) {
  $$('.avatar-btn').forEach(b => b.style.borderColor = 'var(--glass-border)');
  btn.style.borderColor = 'var(--cyan)';
  const preview = $('onboard-avatar-preview');
  if (preview) preview.textContent = btn.dataset.emoji;
}

function selectEditAvatar(btn) {
  $$('.edit-avatar-btn').forEach(b => b.style.borderColor = 'var(--glass-border)');
  btn.style.borderColor = 'var(--cyan)';
}

function getSelectedAvatar(gridClass) {
  const active = document.querySelector(`.${gridClass}[style*="var(--cyan)"]`);
  return active ? active.dataset.emoji : AVATARS[0];
}

function saveProfile() {
  const name = ($('onboard-name')?.value || '').trim();
  if (!name) { toast('Please enter your name!', 'error'); return; }
  const avatar   = getSelectedAvatar('avatar-btn');
  const incType  = $('onboard-income-type')?.value || 'Pocket Money';
  const college  = ($('onboard-college')?.value || '').trim();
  const budgetV  = +($('onboard-budget')?.value) || 5000;
  state.profile = { name, avatar, incomeType: incType, college };
  const b = state.budget;
  b.total = budgetV;
  state.budget = b;
  closeModal('onboarding-modal');
  document.body.style.overflow = '';
  applyProfile();
  toast(`Welcome, ${name}! 🎉 Your budget is set. Start adding expenses 💸`, 'success');
  setTimeout(() => { renderDashboard(); }, 200);
}

function updateProfile() {
  const name    = ($('edit-name')?.value || '').trim();
  const avatar  = getSelectedAvatar('edit-avatar-btn');
  const incType = $('edit-income-type')?.value || 'Pocket Money';
  const college = ($('edit-college')?.value || '').trim();
  if (!name) { toast('Name cannot be empty!', 'error'); return; }
  state.profile = { name, avatar, incomeType: incType, college };
  applyProfile();
  closeModal('profile-modal');
  toast('Profile updated!', 'success');
}

function applyProfile() {
  const p = state.profile;
  if (!p) return;

  // Nav avatar + name button
  const navProfile = $('nav-profile-btn');
  if (navProfile) {
    navProfile.innerHTML = `<span style="font-size:1.2rem">${p.avatar}</span><span class="nav-btn-label" style="font-size:0.82rem;font-weight:600;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>`;
  }

  // Dashboard greeting
  const greetName = $('greeting-name');
  if (greetName) greetName.textContent = ', ' + p.name;

  // Profile modal display
  const ad = $('profile-avatar-display');
  const nd = $('profile-name-display');
  const cd = $('profile-college-display');
  const id = $('profile-income-display');
  if (ad) ad.textContent = p.avatar;
  if (nd) nd.textContent = p.name;
  if (cd) cd.textContent = p.college || 'College not set';
  if (id) id.textContent = '💼 ' + (p.incomeType || 'Income not set');

  // Pre-fill edit form
  const en = $('edit-name');
  const ec = $('edit-college');
  const ei = $('edit-income-type');
  if (en) en.value = p.name;
  if (ec) ec.value = p.college || '';
  if (ei) ei.value = p.incomeType || 'Pocket Money';

  // Highlight current avatar in edit grid
  $$('.edit-avatar-btn').forEach(b => {
    b.style.borderColor = b.dataset.emoji === p.avatar ? 'var(--cyan)' : 'var(--glass-border)';
  });
}

/* ══════════════════════════════════════════
   THEME SYSTEM — light / dark toggle
   Saved globally in ft_theme (not per-user)
   ══════════════════════════════════════════ */
const Theme = {
  STORAGE_KEY: 'ft_theme',

  get() {
    return Store.get(this.STORAGE_KEY, 'dark');
  },

  set(mode) {
    Store.set(this.STORAGE_KEY, mode);
    this.apply(mode);
    this.updateToggleBtn(mode);
  },

  apply(mode) {
    if (mode === 'light') {
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
    }
  },

  toggle() {
    const current = this.get();
    this.set(current === 'dark' ? 'light' : 'dark');
  },

  init() {
    this.apply(this.get());
  },

  updateToggleBtn(mode) {
    const btn = $('theme-toggle-btn');
    if (!btn) return;
    const isDark = mode === 'dark';
    btn.innerHTML  = isDark ? '☀️' : '🌙';
    btn.title      = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    btn.style.background = isDark ? 'rgba(255,214,10,0.08)' : 'rgba(124,58,237,0.12)';
    btn.style.borderColor = isDark ? 'rgba(255,214,10,0.25)' : 'rgba(124,58,237,0.3)';
  },
};

function injectNavProfileBtn() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight || $('nav-profile-btn')) return;

  // ── Theme Toggle Button ──
  const themeBtn = document.createElement('button');
  themeBtn.id = 'theme-toggle-btn';
  themeBtn.className = 'btn btn-secondary btn-sm btn-icon';
  themeBtn.title = 'Toggle Theme';
  themeBtn.style.cssText = 'width:36px;height:36px;padding:0;font-size:1.1rem;border:1px solid var(--glass-border);transition:all 0.3s ease;flex-shrink:0';
  themeBtn.onclick = () => Theme.toggle();
  Theme.updateToggleBtn(Theme.get());

  // ── Profile Button ──
  const profileBtn = document.createElement('button');
  profileBtn.id = 'nav-profile-btn';
  profileBtn.className = 'btn btn-secondary btn-sm';
  profileBtn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;flex-shrink:0';
  profileBtn.innerHTML = `<span style="font-size:1.2rem">👤</span><span class="nav-btn-label" style="font-size:0.82rem;font-weight:600">Profile</span>`;
  profileBtn.onclick = () => { applyProfile(); openModal('profile-modal'); };

  // ── Logout Button ──
  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'nav-logout-btn';
  logoutBtn.className = 'btn btn-danger btn-sm';
  logoutBtn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;font-weight:600;flex-shrink:0';
  logoutBtn.innerHTML = `<span>🚪</span><span class="nav-btn-label" style="font-size:0.82rem">Logout</span>`;
  logoutBtn.onclick = () => {
    if (confirm(`Log out of "${Auth.getUser()}"?`)) Auth.logout();
  };

  // Insert before mobile toggle
  const toggle = $('mobile-nav-toggle');
  if (toggle) {
    navRight.insertBefore(themeBtn, toggle);
    navRight.insertBefore(profileBtn, toggle);
    navRight.insertBefore(logoutBtn, toggle);
  } else {
    navRight.append(themeBtn, profileBtn, logoutBtn);
  }

  // ── Also inject Profile + Logout into mobile hamburger menu ──
  const mobileMenu = $('mobile-nav-menu');
  if (mobileMenu) {
    const divider = document.createElement('div');
    divider.className = 'mobile-nav-divider';

    const mobileProfileBtn = document.createElement('button');
    mobileProfileBtn.className = 'mobile-profile-btn';
    mobileProfileBtn.innerHTML = `⚙️ Profile & Settings`;
    mobileProfileBtn.onclick = () => {
      mobileMenu.classList.remove('open');
      applyProfile();
      openModal('profile-modal');
    };

    const mobileLogoutBtn = document.createElement('button');
    mobileLogoutBtn.className = 'mobile-logout-btn';
    mobileLogoutBtn.innerHTML = `🚪 Logout`;
    mobileLogoutBtn.onclick = () => {
      if (confirm(`Log out of "${Auth.getUser()}"?`)) Auth.logout();
    };

    mobileMenu.appendChild(divider);
    mobileMenu.appendChild(mobileProfileBtn);
    mobileMenu.appendChild(mobileLogoutBtn);
  }
}

/* ── Utilities ── */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const fmt = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const today = () => new Date().toISOString().split('T')[0];
const uid = () => '_' + Math.random().toString(36).slice(2, 9);

function getCurrentMonth() { return `${CURR_YEAR}-${String(CURR_MONTH+1).padStart(2,'0')}`; }

function getMonthExpenses(month = getCurrentMonth()) {
  return state.expenses.filter(e => e.date && e.date.startsWith(month));
}

function totalByCategory(expenses) {
  const totals = {};
  Object.keys(CATEGORIES).forEach(k => totals[k] = 0);
  expenses.forEach(e => { if (totals[e.category] !== undefined) totals[e.category] += +e.amount; else totals.other += +e.amount; });
  return totals;
}

function totalExpenses(expenses) {
  return expenses.reduce((s, e) => s + +e.amount, 0);
}

function totalIncome(month = getCurrentMonth()) {
  return state.income.filter(i => i.date && i.date.startsWith(month)).reduce((s, i) => s + +i.amount, 0);
}

/* ── Toast ── */
function toast(msg, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3000);
}

/* ── Modal ── */
function openModal(id) {
  const overlay = $(id);
  if (overlay) { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const overlay = $(id);
  if (overlay) { overlay.classList.remove('open'); document.body.style.overflow = ''; }
}
function closeAllModals() {
  $$('.modal-overlay').forEach(m => { m.classList.remove('open'); });
  document.body.style.overflow = '';
}

/* ── Particle Canvas ── */
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  const COLORS = ['#00d4ff', '#7c3aed', '#ff006e', '#00ff88'];
  const PARTICLE_COUNT = Math.min(60, Math.floor(W * H / 20000));

  class Particle {
    constructor() { this.reset(true); }
    reset(rand = false) {
      this.x = Math.random() * W;
      this.y = rand ? Math.random() * H : H + 10;
      this.r = Math.random() * 1.5 + 0.5;
      this.speed = Math.random() * 0.4 + 0.1;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.alpha = Math.random() * 0.5 + 0.1;
      this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    }
    update() {
      this.y -= this.speed; this.x += this.vx;
      if (this.y < -10) this.reset();
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 8; ctx.shadowColor = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill(); ctx.restore();
    }
  }

  const particles = Array.from({ length: PARTICLE_COUNT }, () => new Particle());

  function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animate);
  }
  animate();

  window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  });
}

/* ── Active Nav Link ── */
function setActiveNav() {
  const page = location.pathname.split('/').pop() || 'index.html';
  $$('.nav-links a, .mobile-nav-menu a').forEach(a => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === page || (page === '' && href === 'index.html'));
  });
}

/* ── Nav Balance ── */
function updateNavBalance() {
  const el = document.querySelector('#nav-balance-val');
  if (!el) return;
  const bud = state.budget;
  const spent = totalExpenses(getMonthExpenses());
  const inc = totalIncome();
  el.textContent = fmt(bud.total + inc - spent);
}

/* ── Mobile Nav ── */
function initMobileNav() {
  const toggle = $('mobile-nav-toggle');
  const menu = $('mobile-nav-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => menu.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!toggle.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('open');
    });
  }
}

/* ══════════════════════════════════════════
   DASHBOARD PAGE
   ══════════════════════════════════════════ */
function initDashboard() {
  if (!$('dash-budget-val')) return;
  renderDashboard();
  // Quick add expense form
  const form = $('quick-expense-form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = new FormData(form);
      addExpense({
        id: uid(),
        description: data.get('description'),
        amount: data.get('amount'),
        category: data.get('category'),
        date: data.get('date') || today(),
      });
      form.reset();
      renderDashboard();
      toast('Expense added!', 'success');
    });
  }
}

function renderDashboard() {
  const bud = state.budget;
  const expenses = getMonthExpenses();
  const spent = totalExpenses(expenses);
  const inc = totalIncome();
  const saved = Math.max(0, (bud.total + inc) - spent);
  const catTotals = totalByCategory(expenses);

  animateCount('dash-budget-val', bud.total);
  animateCount('dash-spent-val', spent);
  animateCount('dash-balance-val', bud.total - spent);
  animateCount('dash-income-val', inc);
  animateCount('dash-savings-val', saved);

  const pct = bud.total > 0 ? Math.min(100, (spent / bud.total) * 100) : 0;
  const prog = $('dash-budget-progress');
  if (prog) {
    prog.style.width = pct + '%';
    prog.className = 'progress-fill ' + (pct > 85 ? 'pink' : pct > 60 ? 'yellow' : 'cyan');
  }
  if ($('dash-budget-pct')) $('dash-budget-pct').textContent = pct.toFixed(0) + '%';

  // Category breakdown
  const catList = $('dash-cat-list');
  if (catList) {
    catList.innerHTML = Object.entries(CATEGORIES).map(([k, c]) => {
      const v = catTotals[k] || 0;
      const limit = bud.cats[k] || 0;
      const p = limit > 0 ? Math.min(100, (v / limit) * 100) : 0;
      const color = p > 90 ? 'pink' : p > 70 ? 'yellow' : k === 'food' ? 'orange' : k === 'travel' ? 'cyan' : k === 'books' ? 'purple' : k === 'entertainment' ? 'pink' : k === 'stationery' ? 'green' : 'yellow';
      return `<div class="budget-category-item animate-in">
        <span class="budget-cat-icon">${c.icon}</span>
        <div class="budget-cat-info">
          <div class="budget-cat-name"><span>${c.label}</span><span style="color:var(--text-primary)">${fmt(v)} <span style="color:var(--text-muted);font-weight:400">/ ${fmt(limit)}</span></span></div>
          <div class="progress-track" style="height:5px"><div class="progress-fill ${color}" style="width:${p}%"></div></div>
        </div>
      </div>`;
    }).join('');
  }

  // Recent transactions
  renderRecentTransactions();
  // Donut chart
  renderDonutChart('dash-donut', catTotals);
  updateNavBalance();
}

function renderRecentTransactions() {
  const list = $('recent-list');
  if (!list) return;
  const expenses = state.expenses.slice(-10).reverse();
  if (!expenses.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">💸</div><h3>No transactions yet</h3><p>Add your first expense below</p></div>`;
    return;
  }
  list.innerHTML = expenses.map(e => {
    const cat = CATEGORIES[e.category] || CATEGORIES.other;
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:1.1rem">${cat.icon}</span>
        <span style="font-weight:500">${e.description || cat.label}</span>
      </div></td>
      <td><span class="badge badge-${e.category}">${cat.label}</span></td>
      <td class="text-muted text-sm">${formatDate(e.date)}</td>
      <td class="text-right font-bold text-pink">-${fmt(e.amount)}</td>
      <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteExpense('${e.id}')">🗑️</button></td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════
   EXPENSES PAGE
   ══════════════════════════════════════════ */
let activeFilter = 'all';
let activeSort = 'newest';

function initExpenses() {
  if (!$('expense-form')) return;

  $('expense-form').addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData($('expense-form'));
    if (!data.get('amount') || +data.get('amount') <= 0) { toast('Please enter a valid amount', 'error'); return; }
    addExpense({
      id: uid(),
      description: data.get('description') || '',
      amount: data.get('amount'),
      category: data.get('category'),
      date: data.get('date') || today(),
    });
    $('expense-form').reset();
    $('exp-date').value = today();
    renderExpenseTable();
    toast('Expense added successfully!', 'success');
  });

  if ($('exp-date')) $('exp-date').value = today();

  $$('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderExpenseTable();
    });
  });

  $$('.filter-btn[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.filter-btn[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSort = btn.dataset.sort;
      renderExpenseTable();
    });
  });

  const searchInput = $('exp-search');
  if (searchInput) searchInput.addEventListener('input', renderExpenseTable);

  renderExpenseTable();
  renderExpenseSummaryCards();
}

function addExpense(expense) {
  const arr = state.expenses;
  arr.push(expense);
  state.expenses = arr;
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter(e => e.id !== id);
  renderExpenseTable();
  renderDashboard();
  if ($('expense-form')) renderExpenseSummaryCards();
  toast('Expense deleted', 'info');
}

function renderExpenseTable() {
  const tbody = $('expense-tbody');
  if (!tbody) return;
  let expenses = [...state.expenses];

  // Filter
  if (activeFilter !== 'all') expenses = expenses.filter(e => e.category === activeFilter);

  // Search
  const q = ($('exp-search')?.value || '').toLowerCase();
  if (q) expenses = expenses.filter(e => (e.description || '').toLowerCase().includes(q) || e.category.includes(q));

  // Sort
  expenses.sort((a, b) => {
    if (activeSort === 'newest') return new Date(b.date) - new Date(a.date);
    if (activeSort === 'oldest') return new Date(a.date) - new Date(b.date);
    if (activeSort === 'highest') return +b.amount - +a.amount;
    if (activeSort === 'lowest') return +a.amount - +b.amount;
    return 0;
  });

  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">💸</div><h3>No expenses found</h3><p>Try changing your filters</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map((e, i) => {
    const cat = CATEGORIES[e.category] || CATEGORIES.other;
    return `<tr class="animate-in" style="animation-delay:${i*0.03}s">
      <td><div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:1.1rem">${cat.icon}</span>
        <span style="font-weight:500">${e.description || '—'}</span>
      </div></td>
      <td><span class="badge badge-${e.category}">${cat.label}</span></td>
      <td class="text-muted text-sm">${formatDate(e.date)}</td>
      <td class="font-bold" style="color:var(--pink)">-${fmt(e.amount)}</td>
      <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteExpense('${e.id}')" title="Delete">🗑️</button></td>
    </tr>`;
  }).join('');

  if ($('exp-total-count')) $('exp-total-count').textContent = expenses.length;
  if ($('exp-total-amt')) $('exp-total-amt').textContent = fmt(expenses.reduce((s, e) => s + +e.amount, 0));
}

function renderExpenseSummaryCards() {
  const expenses = getMonthExpenses();
  const catTotals = totalByCategory(expenses);
  const list = $('expense-cat-summary');
  if (!list) return;
  list.innerHTML = Object.entries(CATEGORIES).map(([k, c]) => {
    const v = catTotals[k] || 0;
    return `<div class="glass-card card-p stat-card ${k === 'food' ? 'orange' : k === 'travel' ? 'cyan' : k === 'books' ? 'purple' : k === 'entertainment' ? 'pink' : k === 'stationery' ? 'green' : 'yellow'} animate-in">
      <div class="glow-orb"></div>
      <div class="stat-label">${c.icon} ${c.label}</div>
      <div class="stat-value">${fmt(v)}</div>
      <div class="stat-sub">This month</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   BUDGET PAGE
   ══════════════════════════════════════════ */
function initBudget() {
  if (!$('budget-total-input')) return;
  const bud = state.budget;
  $('budget-total-input').value = bud.total;

  renderBudgetPage();

  $('budget-total-input').addEventListener('input', function () {
    const b = state.budget;
    b.total = Math.max(0, +this.value || 0);
    state.budget = b;
    renderBudgetPage();
    updateNavBalance();
  });
}

function renderBudgetPage() {
  const bud = state.budget;
  const expenses = getMonthExpenses();
  const catTotals = totalByCategory(expenses);
  const totalSpent = totalExpenses(expenses);
  const remaining = bud.total - totalSpent;

  animateCount('bud-total-val', bud.total);
  animateCount('bud-spent-val', totalSpent);
  animateCount('bud-remaining-val', remaining);

  const pct = bud.total > 0 ? Math.min(100, (totalSpent / bud.total) * 100) : 0;
  const mainProg = $('main-budget-bar');
  if (mainProg) {
    mainProg.style.width = pct + '%';
    mainProg.className = 'progress-fill ' + (pct > 85 ? 'pink' : pct > 60 ? 'yellow' : 'cyan');
  }
  if ($('main-budget-pct')) $('main-budget-pct').textContent = pct.toFixed(1) + '%';

  const catList = $('budget-cat-list');
  if (!catList) return;
  catList.innerHTML = Object.entries(CATEGORIES).map(([k, c]) => {
    const spent = catTotals[k] || 0;
    const limit = bud.cats[k] || 0;
    const p = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
    const color = p > 90 ? 'pink' : p > 70 ? 'yellow' : k === 'food' ? 'orange' : k === 'travel' ? 'cyan' : k === 'books' ? 'purple' : k === 'entertainment' ? 'pink' : k === 'stationery' ? 'green' : 'yellow';
    const over = spent > limit && limit > 0;
    return `<div class="budget-category-item animate-in">
      <span class="budget-cat-icon">${c.icon}</span>
      <div class="budget-cat-info">
        <div class="budget-cat-name">
          <span style="font-weight:600">${c.label}</span>
          <span style="display:flex;align-items:center;gap:8px">
            ${over ? '<span style="color:var(--pink);font-size:0.75rem;font-weight:700">⚠️ Over Budget</span>' : ''}
            <span style="color:var(--text-secondary)">${fmt(spent)} / </span>
            <span style="color:var(--text-primary)">${fmt(limit)}</span>
          </span>
        </div>
        <div class="progress-track"><div class="progress-fill ${color}" style="width:${p}%"></div></div>
        <div class="budget-cat-amounts">${p.toFixed(0)}% used · ${fmt(Math.max(0, limit - spent))} remaining</div>
      </div>
      <input type="number" class="budget-edit-input" value="${limit}" min="0" 
             onchange="updateCatBudget('${k}', this.value)" title="Edit limit">
    </div>`;
  }).join('');
}

function updateCatBudget(cat, val) {
  const b = state.budget;
  b.cats[cat] = Math.max(0, +val || 0);
  state.budget = b;
  renderBudgetPage();
  toast(`${CATEGORIES[cat].label} budget updated`, 'success');
}

/* ══════════════════════════════════════════
   SAVINGS PAGE
   ══════════════════════════════════════════ */
function initSavings() {
  if (!$('goals-grid')) return;
  renderGoalsGrid();

  const form = $('goal-form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const data = new FormData(form);
      const goals = state.goals;
      goals.push({
        id: uid(),
        name: data.get('name'),
        emoji: data.get('emoji') || '🎯',
        target: +data.get('target'),
        saved: 0,
        deadline: data.get('deadline'),
        color: data.get('color') || 'cyan',
        createdAt: today(),
      });
      state.goals = goals;
      form.reset();
      closeModal('goal-modal');
      renderGoalsGrid();
      toast('New savings goal created!', 'success');
    });
  }
}

function renderGoalsGrid() {
  const grid = $('goals-grid');
  if (!grid) return;
  const goals = state.goals;

  if (!goals.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎯</div><h3>No savings goals yet</h3><p>Create your first goal to start saving</p></div>`;
    renderGoalsSummary([]);
    return;
  }

  grid.innerHTML = goals.map((g, i) => {
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    const remaining = Math.max(0, g.target - g.saved);
    const daysLeft = g.deadline ? Math.max(0, Math.ceil((new Date(g.deadline) - new Date()) / 86400000)) : null;
    return `<div class="glass-card goal-card animate-in" style="animation-delay:${i*0.1}s">
      <div class="goal-thumb">${g.emoji}</div>
      <div class="goal-name">${g.name}</div>
      <div class="goal-dates">${daysLeft !== null ? `${daysLeft} days left · ` : ''}Added ${formatDate(g.createdAt)}</div>
      <div class="goal-amounts">
        <span class="goal-saved text-${g.color}">${fmt(g.saved)}</span>
        <span class="goal-target">of ${fmt(g.target)}</span>
      </div>
      <div class="progress-wrap">
        <div class="progress-meta"><span class="text-muted text-sm">${pct.toFixed(0)}% reached</span><span class="text-sm font-bold">${fmt(remaining)} to go</span></div>
        <div class="progress-track"><div class="progress-fill ${g.color}" style="width:${pct}%"></div></div>
      </div>
      <div class="goal-actions">
        <input type="number" class="form-control" placeholder="Add amount" id="add-amt-${g.id}" min="1" style="flex:1;height:36px;padding:6px 10px">
        <button class="btn btn-primary btn-sm" onclick="addToGoal('${g.id}')">+ Add</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="deleteGoal('${g.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');

  renderGoalsSummary(goals);
}

function renderGoalsSummary(goals) {
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalSaved  = goals.reduce((s, g) => s + g.saved, 0);
  if ($('goals-total-target')) $('goals-total-target').textContent = fmt(totalTarget);
  if ($('goals-total-saved'))  $('goals-total-saved').textContent  = fmt(totalSaved);
  if ($('goals-count'))        $('goals-count').textContent = goals.length;
}

function addToGoal(id) {
  const input = $(`add-amt-${id}`);
  const amt = +input?.value;
  if (!amt || amt <= 0) { toast('Enter a valid amount', 'error'); return; }
  const goals = state.goals;
  const g = goals.find(g => g.id === id);
  if (g) {
    g.saved = Math.min(g.target, g.saved + amt);
    state.goals = goals;
    renderGoalsGrid();
    toast(`${fmt(amt)} added to "${g.name}"!`, 'success');
    if (g.saved >= g.target) setTimeout(() => toast(`🎉 Goal "${g.name}" completed!`, 'success'), 500);
  }
}

function deleteGoal(id) {
  state.goals = state.goals.filter(g => g.id !== id);
  renderGoalsGrid();
  toast('Goal deleted', 'info');
}

/* ══════════════════════════════════════════
   REPORTS PAGE
   ══════════════════════════════════════════ */
function initReports() {
  if (!$('reports-month-select')) return;

  // Populate month selector
  const sel = $('reports-month-select');
  for (let i = 0; i < 6; i++) {
    const d = new Date(CURR_YEAR, CURR_MONTH - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    if (i === 0) opt.selected = true;
    sel.appendChild(opt);
  }

  sel.addEventListener('change', () => renderReports(sel.value));
  renderReports(getCurrentMonth());
}

function renderReports(month) {
  const expenses = state.expenses.filter(e => e.date && e.date.startsWith(month));
  const catTotals = totalByCategory(expenses);
  const total = totalExpenses(expenses);
  const inc = totalIncome(month);

  animateCount('rep-total-spent', total);
  animateCount('rep-total-income', inc);
  animateCount('rep-net', inc - total);

  // Pie chart
  renderPieChart('rep-pie', catTotals);

  // Bar chart (last 6 months)
  renderBarChart('rep-bar');

  // Category breakdown table
  const catTable = $('rep-cat-table');
  if (catTable) {
    const entries = Object.entries(catTotals).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
    if (!entries.length) {
      catTable.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:2rem">No expenses this month</td></tr>`;
    } else {
      catTable.innerHTML = entries.map(([k, v]) => {
        const cat = CATEGORIES[k];
        const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
        return `<tr>
          <td><div style="display:flex;align-items:center;gap:8px">${cat.icon} ${cat.label}</div></td>
          <td class="font-bold" style="color:var(--pink)">${fmt(v)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="progress-track" style="flex:1"><div class="progress-fill cyan" style="width:${pct}%"></div></div>
              <span class="text-sm text-muted">${pct}%</span>
            </div>
          </td>
        </tr>`;
      }).join('');
    }
  }

  // Transactions list
  const txList = $('rep-transactions');
  if (txList) {
    if (!expenses.length) {
      txList.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>No data this month</h3></div>`;
    } else {
      const sorted = [...expenses].sort((a,b) => new Date(b.date)-new Date(a.date));
      txList.innerHTML = `<table class="data-table w-full">
        <thead><tr><th>Description</th><th>Category</th><th>Date</th><th class="text-right">Amount</th></tr></thead>
        <tbody>${sorted.map(e => {
          const cat = CATEGORIES[e.category] || CATEGORIES.other;
          return `<tr>
            <td>${cat.icon} ${e.description || '—'}</td>
            <td><span class="badge badge-${e.category}">${cat.label}</span></td>
            <td class="text-muted text-sm">${formatDate(e.date)}</td>
            <td class="text-right font-bold text-pink">${fmt(e.amount)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    }
  }
}

/* ══════════════════════════════════════════
   CHARTS (Chart.js)
   ══════════════════════════════════════════ */
const chartInstances = {};

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function renderDonutChart(canvasId, catTotals) {
  const canvas = $(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  destroyChart(canvasId);

  const labels = [], data = [], colors = [];
  Object.entries(catTotals).forEach(([k, v]) => {
    if (v > 0) { labels.push(CATEGORIES[k].label); data.push(v); colors.push(CATEGORIES[k].color); }
  });

  if (!data.length) { canvas.style.display='none'; return; }
  canvas.style.display = 'block';

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 2, hoverOffset: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: 'rgba(240,240,255,0.6)', font: { family: 'Plus Jakarta Sans', size: 11 }, padding: 16, usePointStyle: true, pointStyleWidth: 10 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ₹${ctx.parsed.toLocaleString('en-IN')}` } },
      },
      animation: { animateRotate: true, duration: 800 },
    },
  });
}

function renderPieChart(canvasId, catTotals) { renderDonutChart(canvasId, catTotals); }

function renderBarChart(canvasId) {
  const canvas = $(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  destroyChart(canvasId);

  const labels = [], incData = [], expData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(CURR_YEAR, CURR_MONTH - i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    labels.push(MONTHS[d.getMonth()]);
    incData.push(totalIncome(m));
    expData.push(totalExpenses(state.expenses.filter(e => e.date && e.date.startsWith(m))));
  }

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Income', data: incData, backgroundColor: 'rgba(0,255,136,0.4)', borderColor: '#00ff88', borderWidth: 2, borderRadius: 6 },
        { label: 'Expenses', data: expData, backgroundColor: 'rgba(255,0,110,0.4)', borderColor: '#ff006e', borderWidth: 2, borderRadius: 6 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(240,240,255,0.6)', font: { family: 'Plus Jakarta Sans' }, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(240,240,255,0.5)' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(240,240,255,0.5)', callback: v => '₹' + v.toLocaleString('en-IN') } },
      },
      animation: { duration: 800, easing: 'easeInOutQuart' },
    },
  });
}

function renderLineChart(canvasId) {
  const canvas = $(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  destroyChart(canvasId);

  const labels = [], data = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(CURR_YEAR, CURR_MONTH - i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    labels.push(MONTHS[d.getMonth()]);
    const bud = state.budget;
    const inc = totalIncome(m);
    const exp = totalExpenses(state.expenses.filter(e => e.date && e.date.startsWith(m)));
    data.push(Math.max(0, (bud.total + inc) - exp));
  }

  chartInstances[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Savings',
        data,
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#00d4ff',
        pointRadius: 5,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: 'rgba(240,240,255,0.6)', font: { family: 'Plus Jakarta Sans' }, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ` Savings: ₹${ctx.parsed.y.toLocaleString('en-IN')}` } },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(240,240,255,0.5)' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(240,240,255,0.5)', callback: v => '₹' + v.toLocaleString('en-IN') } },
      },
    },
  });
}

/* ── Animated Count Up ── */
function animateCount(id, target) {
  const el = $(id);
  if (!el) return;
  const start = 0; const duration = 700;
  const startTime = performance.now();
  const isNeg = target < 0;
  const abs = Math.abs(target);
  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(ease * abs);
    el.textContent = (isNeg ? '-' : '') + '₹' + current.toLocaleString('en-IN');
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Date Formatter ── */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Seed Demo Data ── */
/* seedDemoData intentionally removed.
   Every new user starts with a clean slate —
   only the budget total they set during onboarding is pre-filled. */

/* ══════════════════════════════════════════
   INCOME MANAGEMENT
   ══════════════════════════════════════════ */
function initIncomeForm() {
  const form = $('income-form');
  if (!form) return;
  const dateField = $('inc-date');
  if (dateField) dateField.value = today();

  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData(form);
    const inc = state.income;
    inc.push({ id: uid(), source: data.get('source'), amount: +data.get('amount'), date: data.get('date') || today() });
    state.income = inc;
    form.reset();
    if (dateField) dateField.value = today();
    renderIncomeList();
    updateNavBalance();
    toast('Income added!', 'success');
  });
  renderIncomeList();
}

function renderIncomeList() {
  const list = $('income-list');
  if (!list) return;
  const income = state.income.slice(-10).reverse();
  if (!income.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">💰</div><h3>No income recorded</h3></div>`;
    return;
  }
  list.innerHTML = income.map(i => `<tr>
    <td>💰 ${i.source}</td>
    <td class="font-bold text-green">${fmt(i.amount)}</td>
    <td class="text-muted text-sm">${formatDate(i.date)}</td>
    <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteIncome('${i.id}')">🗑️</button></td>
  </tr>`).join('');
}

function deleteIncome(id) {
  state.income = state.income.filter(i => i.id !== id);
  renderIncomeList();
  updateNavBalance();
  toast('Income entry deleted', 'info');
}

/* ── Intersection Observer for scroll animations ── */
function initScrollAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  $$('.observe-anim').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

/* ── Expose to global scope for inline handlers ── */
window.deleteExpense = deleteExpense;
window.deleteGoal = deleteGoal;
window.addToGoal = addToGoal;
window.deleteIncome = deleteIncome;
window.updateCatBudget = updateCatBudget;
window.openModal = openModal;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.renderLineChart = renderLineChart;

/* ── Init on DOM ready ── */
document.addEventListener('DOMContentLoaded', () => {
  // ① Apply saved theme immediately (before any render)
  Theme.init();

  // ② Auth guard — redirect to login if not logged in
  if (!Auth.guard()) return;   // guard() handles the redirect itself

  // ③ Inject profile/reset modals + nav buttons
  injectProfileModal();
  injectNavProfileBtn();
  Theme.updateToggleBtn(Theme.get()); // sync button icon after injection

  initParticles();
  setActiveNav();
  initMobileNav();
  initScrollAnimations();

  // Close modal on overlay click
  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeAllModals();
  });

  // Returning user — restore their profile and balance
  // Guard: only run profile logic when a real user is logged in
  const currentUser = Auth.getUser();
  const profile = currentUser ? state.profile : null;
  if (currentUser && !profile) {
    openModal('onboarding-modal');
  } else if (profile) {
    applyProfile();
    updateNavBalance();
  }

  // Page-specific inits
  initDashboard();
  initExpenses();
  initBudget();
  initSavings();
  initReports();
  initIncomeForm();
});

/* ── Expose extras to global ── */
window.saveProfile      = saveProfile;
window.updateProfile    = updateProfile;
window.selectAvatar     = selectAvatar;
window.selectEditAvatar = selectEditAvatar;
window.confirmReset     = confirmReset;
window.executeReset     = executeReset;
window.Auth             = Auth;
window.Theme            = Theme;
