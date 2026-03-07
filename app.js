/* ============================================================
   FINTRACK — Student Personal Finance Manager
   app.js — Main Application Logic (v2.0)
   New in v2: Currency localization, Custom categories, CSV
   Export/Import, Floating-point precision, Debounce, Recurring
   transactions, Negative-balance warnings, Zero-data charts,
   Improved form validation, Dark/Light mode.
   ============================================================ */

'use strict';

/* ── Base Category Definitions ── */
const BASE_CATEGORIES = {
  food:          { label: 'Food',          icon: '🍔', color: '#ff6b00' },
  travel:        { label: 'Travel',        icon: '🚌', color: '#00d4ff' },
  books:         { label: 'Books',         icon: '📚', color: '#a78bfa' },
  entertainment: { label: 'Entertainment', icon: '🎮', color: '#ff006e' },
  stationery:    { label: 'Stationery',    icon: '✏️', color: '#00ff88' },
  other:         { label: 'Other',         icon: '📦', color: '#ffd60a' },
};

/* ── Currency Definitions ── */
const CURRENCIES = {
  INR: { symbol: '₹',   name: 'Indian Rupee (₹)',      locale: 'en-IN' },
  USD: { symbol: '$',   name: 'US Dollar ($)',           locale: 'en-US' },
  EUR: { symbol: '€',   name: 'Euro (€)',                locale: 'de-DE' },
  GBP: { symbol: '£',   name: 'British Pound (£)',       locale: 'en-GB' },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar (S$)',   locale: 'en-SG' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham (د.إ)',        locale: 'ar-AE' },
  JPY: { symbol: '¥',   name: 'Japanese Yen (¥)',        locale: 'ja-JP' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar (CA$)',   locale: 'en-CA' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURR_MONTH = new Date().getMonth();
const CURR_YEAR  = new Date().getFullYear();

/* ── Legacy key cleanup ── */
(function cleanLegacyKeys() {
  ['ft_expenses','ft_income','ft_goals','ft_budget','ft_profile','ft_seeded']
    .forEach(k => localStorage.removeItem(k));
})();

/* ══════════════════════════════════════════
   STORE
   ══════════════════════════════════════════ */
const Store = {
  get:    (key, def = null) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  },
  set:    (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  remove: (key)      => { localStorage.removeItem(key); },
};

/* ══════════════════════════════════════════
   AUTH
   ══════════════════════════════════════════ */
const Auth = {
  getUser() { return Store.get('ft_current_user', null); },
  key(suffix) { const u = this.getUser(); return u ? `${u}_${suffix}` : suffix; },
  login(username) {
    Store.set('ft_current_user', username);
    const users = this.getAllUsers();
    if (!users.includes(username)) { users.push(username); Store.set('ft_users', users); }
  },
  logout() { Store.remove('ft_current_user'); window.location.href = 'login.html'; },
  getAllUsers() { return Store.get('ft_users', []); },
  getUserProfile(username) { return Store.get(`${username}_profile`, null); },
  deleteUser(username) {
    ['expenses','income','goals','budget','profile','seeded','custom_cats'].forEach(k => {
      Store.remove(`${username}_${k}`);
    });
    const users = this.getAllUsers().filter(u => u !== username);
    Store.set('ft_users', users);
    if (this.getUser() === username) Store.remove('ft_current_user');
  },
  guard() {
    const pathname = window.location.pathname;
    const isLogin   = pathname.endsWith('login.html');
    const isLanding = pathname.endsWith('index.html') || pathname === '/' || pathname === '';
    const user = this.getUser();
    if (!user && !isLogin && !isLanding) { window.location.href = 'login.html'; return false; }
    if (user && isLogin) { window.location.href = 'dashboard.html'; return false; }
    return true;
  },
};

/* ══════════════════════════════════════════
   CURRENCY HELPERS
   ══════════════════════════════════════════ */
function getActiveCurrency() {
  const p = state.profile;
  const code = (p && p.currency) || 'INR';
  return CURRENCIES[code] || CURRENCIES.INR;
}

/* ── Floating-point safe money rounding ── */
function money(n) { return Math.round(Number(n) * 100) / 100; }

/* ── Format amount with active currency symbol ── */
const fmt = n => {
  const cur = getActiveCurrency();
  return cur.symbol + Math.round(Math.abs(Number(n))).toLocaleString(cur.locale);
};

/* ══════════════════════════════════════════
   CUSTOM CATEGORIES
   ══════════════════════════════════════════ */
function getCustomCats() { return Store.get(Auth.key('custom_cats'), []); }
function saveCustomCats(cats) { Store.set(Auth.key('custom_cats'), cats); }

function getAllCategories() {
  const merged = { ...BASE_CATEGORIES };
  getCustomCats().forEach(c => { merged[c.key] = { label: c.label, icon: c.icon, color: c.color }; });
  return merged;
}

const AVATARS      = ['🧑‍💻','👩‍🎓','👨‍🎓','🧑‍🎓','👩‍💼','👨‍💼','🧑‍🔬','👩‍🔬','🦸','🧑‍🎨','🧑‍🚀','🐼','🦊','🐯','🦋','🌟'];
const INCOME_TYPES = ['Pocket Money','Scholarship','Part-time Job','Freelancing','Other'];

/* ══════════════════════════════════════════
   STATE
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
   PROFILE MODAL (injected into DOM)
   ══════════════════════════════════════════ */
function injectProfileModal() {
  const curOpts = Object.entries(CURRENCIES).map(([k,v]) =>
    `<option value="${k}">${v.name}</option>`).join('');

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
          ${AVATARS.map((a,i)=>`<button type="button" class="avatar-btn" data-emoji="${a}" onclick="selectAvatar(this)" style="font-size:1.5rem;padding:8px;background:var(--glass);border:2px solid ${i===0?'var(--cyan)':'var(--glass-border)'};border-radius:10px;cursor:pointer;transition:all 0.2s">${a}</button>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Primary Income Source</label>
          <select id="onboard-income-type" class="form-control">
            ${INCOME_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Currency</label>
          <select id="onboard-currency" class="form-control">${curOpts}</select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Monthly Budget</label>
        <input id="onboard-budget" type="number" class="form-control" placeholder="e.g. 5000" min="100" value="5000" />
      </div>
      <div class="form-group">
        <label class="form-label">College / University (optional)</label>
        <input id="onboard-college" class="form-control" placeholder="e.g. Chitkara University" maxlength="60" />
      </div>
      <button class="btn btn-primary w-full btn-lg" style="margin-top:0.5rem" onclick="saveProfile()">🚀 Let's Go!</button>
    </div>
  </div>

  <!-- Profile / Settings Modal -->
  <div class="modal-overlay" id="profile-modal">
    <div class="modal" style="max-width:500px">
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
          ${AVATARS.map(a=>`<button type="button" class="edit-avatar-btn" data-emoji="${a}" onclick="selectEditAvatar(this)" style="font-size:1.3rem;padding:6px;background:var(--glass);border:2px solid var(--glass-border);border-radius:8px;cursor:pointer;transition:all 0.2s">${a}</button>`).join('')}
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Income Source</label>
          <select id="edit-income-type" class="form-control">
            ${INCOME_TYPES.map(t=>`<option value="${t}">${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">College</label>
          <input id="edit-college" class="form-control" maxlength="60" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <select id="edit-currency" class="form-control">${curOpts}</select>
      </div>
      <button class="btn btn-primary w-full mb-2" onclick="updateProfile()">💾 Save Changes</button>

      <div class="divider"></div>

      <!-- Custom Categories -->
      <div class="section-title mb-2"><div class="title-accent"></div>🏷️ Custom Categories</div>
      <div id="custom-cat-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;max-height:160px;overflow-y:auto"></div>
      <div style="display:flex;gap:6px;align-items:center">
        <input id="new-cat-emoji" class="form-control" style="width:54px;padding:8px;text-align:center;font-size:1.2rem" placeholder="🎸" maxlength="4" />
        <input id="new-cat-name" class="form-control" placeholder="Category name" maxlength="20" />
        <button class="btn btn-primary btn-sm" style="white-space:nowrap" onclick="addCustomCat()">+ Add</button>
      </div>

      <div class="divider"></div>

      <!-- Data Management -->
      <div class="section-title mb-2"><div class="title-accent"></div>📁 Data Management</div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <button class="btn btn-secondary" style="flex:1" onclick="exportCSV()">📊 Export CSV</button>
        <button class="btn btn-secondary" style="flex:1" onclick="triggerImportCSV()">📥 Import CSV</button>
      </div>
      <p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">Export all transactions to a spreadsheet, or import from a backup CSV.</p>

      <div class="divider"></div>

      <!-- Danger Zone -->
      <div class="section-title mb-2" style="color:var(--pink)"><div class="title-accent" style="background:var(--pink)"></div>⚠️ Danger Zone</div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
        <button class="btn btn-danger" style="flex:1" onclick="confirmReset('data')">🗑️ Reset Data</button>
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
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem" id="reset-desc">This will permanently delete all your expenses, income records, and savings goals.</p>
      <div style="display:flex;gap:0.75rem">
        <button class="btn btn-secondary w-full" onclick="closeModal('reset-confirm-modal')">Cancel</button>
        <button class="btn btn-danger w-full" onclick="executeReset()">Yes, Reset</button>
      </div>
    </div>
  </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

let pendingResetType = 'data';

function confirmReset(type) {
  pendingResetType = type;
  const titleEl = $('reset-title'), descEl = $('reset-desc'), iconEl = $('reset-icon');
  if (type === 'full') {
    titleEl.textContent = 'Full Reset?';
    descEl.textContent  = 'This deletes EVERYTHING — profile, expenses, income, goals, and settings. You will go back to the welcome screen.';
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
    Auth.deleteUser(user);
    closeModal('reset-confirm-modal');
    toast('All data deleted. Goodbye! 👋', 'info');
    setTimeout(() => Auth.logout(), 900);
  } else {
    ['expenses','income','goals','budget','seeded','custom_cats'].forEach(k => Store.remove(`${user}_${k}`));
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
  const currency = $('onboard-currency')?.value || 'INR';
  const budgetV  = money(+($('onboard-budget')?.value) || 5000);
  state.profile = { name, avatar, incomeType: incType, college, currency };
  const b = state.budget; b.total = budgetV; state.budget = b;
  closeModal('onboarding-modal');
  document.body.style.overflow = '';
  applyProfile();
  populateCategorySelects();
  toast(`Welcome, ${name}! 🎉 Your budget is set. Start adding expenses 💸`, 'success');
  setTimeout(() => renderDashboard(), 200);
}

function updateProfile() {
  const name    = ($('edit-name')?.value || '').trim();
  const avatar  = getSelectedAvatar('edit-avatar-btn');
  const incType = $('edit-income-type')?.value || 'Pocket Money';
  const college = ($('edit-college')?.value || '').trim();
  const currency= $('edit-currency')?.value || 'INR';
  if (!name) { toast('Name cannot be empty!', 'error'); return; }
  state.profile = { name, avatar, incomeType: incType, college, currency };
  applyProfile();
  populateCategorySelects();
  closeModal('profile-modal');
  toast('Profile updated!', 'success');
  renderDashboard();
}

function applyProfile() {
  const p = state.profile;
  if (!p) return;
  const navProfile = $('nav-profile-btn');
  if (navProfile) {
    navProfile.innerHTML = `<span style="font-size:1.2rem">${p.avatar}</span><span class="nav-btn-label" style="font-size:0.82rem;font-weight:600;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>`;
  }
  const greetName = $('greeting-name');
  if (greetName) greetName.textContent = ', ' + p.name;
  const ad = $('profile-avatar-display'), nd = $('profile-name-display');
  const cd = $('profile-college-display'), id = $('profile-income-display');
  if (ad) ad.textContent = p.avatar;
  if (nd) nd.textContent = p.name;
  if (cd) cd.textContent = p.college || 'College not set';
  if (id) id.textContent = '💼 ' + (p.incomeType || 'Income not set');
  const en = $('edit-name'), ec = $('edit-college');
  const ei = $('edit-income-type'), ecur = $('edit-currency');
  if (en) en.value = p.name;
  if (ec) ec.value = p.college || '';
  if (ei) ei.value = p.incomeType || 'Pocket Money';
  if (ecur) ecur.value = p.currency || 'INR';
  $$('.edit-avatar-btn').forEach(b => {
    b.style.borderColor = b.dataset.emoji === p.avatar ? 'var(--cyan)' : 'var(--glass-border)';
  });
  renderCustomCatManager();
}

/* ══════════════════════════════════════════
   CUSTOM CATEGORY MANAGER
   ══════════════════════════════════════════ */
const CAT_COLORS = ['#ff6b00','#00d4ff','#a78bfa','#ff006e','#00ff88','#ffd60a','#7c3aed','#00bfa5'];

function renderCustomCatManager() {
  const list = $('custom-cat-list');
  if (!list) return;
  const cats = getCustomCats();
  if (!cats.length) {
    list.innerHTML = `<p style="font-size:0.8rem;color:var(--text-muted);padding:6px 0">No custom categories yet. Add one below!</p>`;
    return;
  }
  list.innerHTML = cats.map(c => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--glass);border:1px solid var(--glass-border);border-radius:8px">
      <span style="font-size:1.2rem">${c.icon}</span>
      <span style="flex:1;font-size:0.88rem;font-weight:600">${c.label}</span>
      <span style="width:12px;height:12px;border-radius:50%;background:${c.color};display:inline-block"></span>
      <button class="btn btn-danger btn-sm btn-icon" style="padding:4px 6px;font-size:0.75rem" onclick="deleteCustomCat('${c.key}')">✕</button>
    </div>`).join('');
}

function addCustomCat() {
  const emoji = ($('new-cat-emoji')?.value || '').trim() || '🏷️';
  const name  = ($('new-cat-name')?.value || '').trim();
  if (!name) { toast('Enter a category name', 'error'); return; }
  const key   = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]/g,'_').slice(0,16);
  const cats  = getCustomCats();
  if (cats.find(c => c.key === key)) { toast('Category already exists!', 'error'); return; }
  const color = CAT_COLORS[cats.length % CAT_COLORS.length];
  cats.push({ key, label: name, icon: emoji, color });
  saveCustomCats(cats);
  // Also add budget entry for new category
  const b = state.budget; if (!b.cats[key]) { b.cats[key] = 0; state.budget = b; }
  if ($('new-cat-emoji')) $('new-cat-emoji').value = '';
  if ($('new-cat-name'))  $('new-cat-name').value  = '';
  renderCustomCatManager();
  populateCategorySelects();
  toast(`Category "${name}" added! 🏷️`, 'success');
}

function deleteCustomCat(key) {
  if (!confirm('Delete this custom category? Expenses in it will move to "Other".')) return;
  const cats = getCustomCats().filter(c => c.key !== key);
  saveCustomCats(cats);
  // Move expenses to "other"
  state.expenses = state.expenses.map(e => e.category === key ? { ...e, category: 'other' } : e);
  renderCustomCatManager();
  populateCategorySelects();
  toast('Category deleted', 'info');
}

/* ══════════════════════════════════════════
   THEME SYSTEM
   ══════════════════════════════════════════ */
const Theme = {
  STORAGE_KEY: 'ft_theme',
  get() { return Store.get(this.STORAGE_KEY, 'dark'); },
  set(mode) { Store.set(this.STORAGE_KEY, mode); this.apply(mode); this.updateToggleBtn(mode); },
  apply(mode) { document.body.classList.toggle('light-mode', mode === 'light'); },
  toggle() { this.set(this.get() === 'dark' ? 'light' : 'dark'); },
  init() { this.apply(this.get()); },
  updateToggleBtn(mode) {
    const btn = $('theme-toggle-btn');
    if (!btn) return;
    const isDark = mode === 'dark';
    btn.innerHTML    = isDark ? '☀️' : '🌙';
    btn.title        = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    btn.style.background   = isDark ? 'rgba(255,214,10,0.08)' : 'rgba(124,58,237,0.12)';
    btn.style.borderColor  = isDark ? 'rgba(255,214,10,0.25)' : 'rgba(124,58,237,0.3)';
  },
};

/* ══════════════════════════════════════════
   NAV INJECTION
   ══════════════════════════════════════════ */
function injectNavProfileBtn() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight || $('nav-profile-btn')) return;

  const themeBtn = document.createElement('button');
  themeBtn.id = 'theme-toggle-btn';
  themeBtn.className = 'btn btn-secondary btn-sm btn-icon';
  themeBtn.style.cssText = 'width:36px;height:36px;padding:0;font-size:1.1rem;border:1px solid var(--glass-border);transition:all 0.3s ease;flex-shrink:0';
  themeBtn.onclick = () => Theme.toggle();
  Theme.updateToggleBtn(Theme.get());

  const profileBtn = document.createElement('button');
  profileBtn.id = 'nav-profile-btn';
  profileBtn.className = 'btn btn-secondary btn-sm';
  profileBtn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;flex-shrink:0';
  profileBtn.innerHTML = `<span style="font-size:1.2rem">👤</span><span class="nav-btn-label" style="font-size:0.82rem;font-weight:600">Profile</span>`;
  profileBtn.onclick = () => { applyProfile(); openModal('profile-modal'); };

  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'nav-logout-btn';
  logoutBtn.className = 'btn btn-danger btn-sm';
  logoutBtn.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 12px;font-weight:600;flex-shrink:0';
  logoutBtn.innerHTML = `<span>🚪</span><span class="nav-btn-label" style="font-size:0.82rem">Logout</span>`;
  logoutBtn.onclick = () => { if (confirm(`Log out of "${Auth.getUser()}"?`)) Auth.logout(); };

  const toggle = $('mobile-nav-toggle');
  if (toggle) {
    navRight.insertBefore(themeBtn, toggle);
    navRight.insertBefore(profileBtn, toggle);
    navRight.insertBefore(logoutBtn, toggle);
  } else {
    navRight.append(themeBtn, profileBtn, logoutBtn);
  }

  // Also inject into mobile menu
  const mobileMenu = $('mobile-nav-menu');
  if (mobileMenu) {
    const divider = document.createElement('div');
    divider.className = 'mobile-nav-divider';
    const mPro = document.createElement('button');
    mPro.className = 'mobile-profile-btn';
    mPro.innerHTML = '⚙️ Profile & Settings';
    mPro.onclick = () => { mobileMenu.classList.remove('open'); applyProfile(); openModal('profile-modal'); };
    const mLog = document.createElement('button');
    mLog.className = 'mobile-logout-btn';
    mLog.innerHTML = '🚪 Logout';
    mLog.onclick = () => { if (confirm(`Log out of "${Auth.getUser()}"?`)) Auth.logout(); };
    mobileMenu.appendChild(divider);
    mobileMenu.appendChild(mPro);
    mobileMenu.appendChild(mLog);
  }
}

/* ══════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const today = () => new Date().toISOString().split('T')[0];
const uid = () => '_' + Math.random().toString(36).slice(2, 9);

function getCurrentMonth() { return `${CURR_YEAR}-${String(CURR_MONTH+1).padStart(2,'0')}`; }
function getMonthExpenses(month = getCurrentMonth()) {
  return state.expenses.filter(e => e.date && e.date.startsWith(month));
}

function totalByCategory(expenses) {
  const totals = {};
  const allCats = getAllCategories();
  Object.keys(allCats).forEach(k => totals[k] = 0);
  expenses.forEach(e => {
    if (totals[e.category] !== undefined) totals[e.category] = money(totals[e.category] + money(+e.amount));
    else totals.other = money(totals.other + money(+e.amount));
  });
  return totals;
}

function totalExpenses(expenses) {
  return money(expenses.reduce((s, e) => money(s + money(+e.amount)), 0));
}

function totalIncome(month = getCurrentMonth()) {
  return money(state.income.filter(i => i.date && i.date.startsWith(month)).reduce((s, i) => money(s + money(+i.amount)), 0));
}

/* ── Populate all category <select> elements dynamically ── */
function populateCategorySelects() {
  const allCats = getAllCategories();
  const opts = Object.entries(allCats).map(([k,c]) => `<option value="${k}">${c.icon} ${c.label}</option>`).join('');
  $$('select[name="category"]').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = opts;
    if (allCats[cur]) sel.value = cur;
  });
  // Also update filter buttons if on expenses page
  renderExpenseFilterButtons();
}

function renderExpenseFilterButtons() {
  const filterRow = document.querySelector('.filter-row');
  if (!filterRow) return;
  const allCats = getAllCategories();
  // Remove existing category filter buttons (keep "All")
  $$('.filter-btn[data-filter]:not([data-filter="all"])').forEach(b => b.remove());
  const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
  if (!allBtn) return;
  Object.entries(allCats).forEach(([k, c]) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.filter = k;
    btn.textContent = `${c.icon} ${c.label}`;
    btn.addEventListener('click', () => {
      $$('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = k;
      renderExpenseTable();
    });
    filterRow.appendChild(btn);
  });
}

/* ── Toast ── */
function toast(msg, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => t.remove(), 300); }, 3500);
}

/* ── Modal ── */
function openModal(id)  { const o=$(id); if(o){ o.classList.add('open'); document.body.style.overflow='hidden'; } }
function closeModal(id) { const o=$(id); if(o){ o.classList.remove('open'); document.body.style.overflow=''; } }
function closeAllModals() { $$('.modal-overlay').forEach(m=>m.classList.remove('open')); document.body.style.overflow=''; }

/* ── Particles ── */
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W = canvas.width = window.innerWidth, H = canvas.height = window.innerHeight;
  const COLORS = ['#00d4ff','#7c3aed','#ff006e','#00ff88'];
  const COUNT = Math.min(60, Math.floor(W * H / 20000));
  class Particle {
    constructor() { this.reset(true); }
    reset(rand=false) {
      this.x=Math.random()*W; this.y=rand?Math.random()*H:H+10;
      this.r=Math.random()*1.5+0.5; this.speed=Math.random()*0.4+0.1;
      this.vx=(Math.random()-0.5)*0.3; this.alpha=Math.random()*0.5+0.1;
      this.color=COLORS[Math.floor(Math.random()*COLORS.length)];
    }
    update(){ this.y-=this.speed; this.x+=this.vx; if(this.y<-10) this.reset(); }
    draw(){ ctx.save(); ctx.globalAlpha=this.alpha; ctx.fillStyle=this.color; ctx.shadowBlur=8; ctx.shadowColor=this.color; ctx.beginPath(); ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill(); ctx.restore(); }
  }
  const particles = Array.from({length:COUNT},()=>new Particle());
  function animate(){ ctx.clearRect(0,0,W,H); particles.forEach(p=>{p.update();p.draw();}); requestAnimationFrame(animate); }
  animate();
  window.addEventListener('resize',()=>{ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; });
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
  el.textContent = fmt(money(bud.total + inc - spent));
}

/* ── Mobile Nav ── */
function initMobileNav() {
  const toggle = $('mobile-nav-toggle'), menu = $('mobile-nav-menu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => menu.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!toggle.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('open');
    });
  }
}

/* ── Scroll Animations ── */
function initScrollAnimations() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.style.opacity='1'; e.target.style.transform='translateY(0)'; obs.unobserve(e.target); } });
  }, { threshold: 0.1 });
  $$('.observe-anim').forEach(el => {
    el.style.opacity='0'; el.style.transform='translateY(30px)';
    el.style.transition='opacity 0.6s ease, transform 0.6s ease';
    obs.observe(el);
  });
}

/* ── Animated Count Up ── */
function animateCount(id, target) {
  const el = $(id); if (!el) return;
  const duration=700, startTime=performance.now();
  const isNeg=target<0, abs=Math.abs(target);
  function step(now) {
    const p=Math.min((now-startTime)/duration,1), ease=1-Math.pow(1-p,3);
    const cur = Math.round(ease*abs);
    el.textContent = (isNeg?'-':'') + fmt(cur);
    if(p<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ── Date Formatter ── */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr+'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

/* ── Category color class helper ── */
function catColorClass(k) {
  const map = { food:'orange', travel:'cyan', books:'purple', entertainment:'pink', stationery:'green', other:'yellow' };
  return map[k] || 'cyan';
}

/* ══════════════════════════════════════════
   EXPORT / IMPORT CSV
   ══════════════════════════════════════════ */
function exportCSV() {
  const cur = getActiveCurrency();
  const allCats = getAllCategories();
  let csv = 'Type,Date,Description,Category,Amount,Currency\n';
  state.expenses.forEach(e => {
    const cat = allCats[e.category] || allCats.other;
    const desc = (e.description||'').replace(/"/g,'""');
    csv += `Expense,${e.date},"${desc}",${cat.label},${money(+e.amount)},${cur.symbol}\n`;
  });
  state.income.forEach(i => {
    const src = (i.source||'').replace(/"/g,'""');
    csv += `Income,${i.date},"${src}",Income,${money(+i.amount)},${cur.symbol}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `fintrack-${Auth.getUser()}-${today()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Data exported as CSV! 📊', 'success');
}

function triggerImportCSV() {
  let inp = document.getElementById('_csv_import');
  if (!inp) {
    inp = document.createElement('input');
    inp.type = 'file'; inp.id = '_csv_import'; inp.accept = '.csv';
    inp.style.display = 'none';
    inp.onchange = importCSV;
    document.body.appendChild(inp);
  }
  inp.value = '';
  inp.click();
}

function importCSV(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const allCats = getAllCategories();
    const lines = ev.target.result.split('\n').slice(1);
    let added = 0, skipped = 0;
    const expenses = state.expenses;
    lines.forEach(line => {
      if (!line.trim()) return;
      // Simple CSV parse (handles quoted fields)
      const cols = [];
      let cur2 = '', inQ = false;
      for (let ch of line + ',') {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur2.trim()); cur2 = ''; }
        else cur2 += ch;
      }
      const [type, date, desc, catLabel, amtStr] = cols;
      if (type === 'Expense' && date && amtStr) {
        const amt = money(parseFloat(amtStr));
        if (!isNaN(amt) && amt > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
          const catKey = Object.entries(allCats).find(([,v]) => v.label === catLabel)?.[0] || 'other';
          expenses.push({ id: uid(), description: desc||'', category: catKey, amount: amt, date: date.trim() });
          added++;
        } else skipped++;
      } else skipped++;
    });
    state.expenses = expenses;
    closeAllModals();
    toast(`✅ Imported ${added} expense${added!==1?'s':''}${skipped?` (${skipped} skipped)`:''}`, added>0?'success':'info');
    renderExpenseTable?.();
    renderDashboard?.();
  };
  reader.readAsText(file);
}

/* ══════════════════════════════════════════
   RECURRING TRANSACTIONS
   Auto-adds recurring expenses each new month
   ══════════════════════════════════════════ */
function processRecurring() {
  const currentMonth = getCurrentMonth();
  const allExp = state.expenses;
  const recurringBase = allExp.filter(e => e.recurring && !e.autoAdded);
  if (!recurringBase.length) return;

  // Build set of (originalId-YYYY-MM) already copied this month
  const existing = new Set(
    allExp.filter(e => e.autoAdded).map(e => `${e.originalId}-${e.date?.substring(0,7)}`)
  );

  let added = 0;
  recurringBase.forEach(e => {
    const originMonth = e.date?.substring(0,7);
    if (originMonth === currentMonth) return; // same month as original, skip
    const key = `${e.id}-${currentMonth}`;
    if (!existing.has(key)) {
      const day = e.date?.substring(8,10) || '01';
      allExp.push({
        id: uid(), description: e.description, amount: e.amount,
        category: e.category, date: `${currentMonth}-${day}`,
        recurring: true, autoAdded: true, originalId: e.id,
      });
      added++;
    }
  });

  if (added > 0) {
    state.expenses = allExp;
    toast(`🔄 ${added} recurring expense${added>1?'s':''} auto-added for this month`, 'info');
  }
}

/* ══════════════════════════════════════════
   DASHBOARD PAGE
   ══════════════════════════════════════════ */
function initDashboard() {
  if (!$('dash-budget-val')) return;
  renderDashboard();
  // Expenses are added exclusively from expenses.html
}

function renderDashboard() {
  const bud = state.budget;
  const expenses = getMonthExpenses();
  const spent = totalExpenses(expenses);
  const inc = totalIncome();
  const saved = Math.max(0, money(bud.total + inc - spent));
  const catTotals = totalByCategory(expenses);
  const allCats = getAllCategories();

  animateCount('dash-budget-val', bud.total);
  animateCount('dash-spent-val', spent);
  animateCount('dash-balance-val', money(bud.total - spent));
  animateCount('dash-income-val', inc);
  animateCount('dash-savings-val', saved);

  const pct = bud.total > 0 ? Math.min(100, (spent / bud.total) * 100) : 0;
  const prog = $('dash-budget-progress');
  if (prog) { prog.style.width = pct+'%'; prog.className = 'progress-fill '+(pct>85?'pink':pct>60?'yellow':'cyan'); }
  if ($('dash-budget-pct')) $('dash-budget-pct').textContent = pct.toFixed(0)+'%';

  const catList = $('dash-cat-list');
  if (catList) {
    catList.innerHTML = Object.entries(allCats).map(([k,c]) => {
      const v = catTotals[k] || 0;
      const limit = bud.cats[k] || 0;
      const p = limit > 0 ? Math.min(100, (v / limit) * 100) : 0;
      const color = p>90?'pink':p>70?'yellow':catColorClass(k);
      return `<div class="budget-category-item animate-in">
        <span class="budget-cat-icon">${c.icon}</span>
        <div class="budget-cat-info">
          <div class="budget-cat-name">
            <span>${c.label}</span>
            <span style="color:var(--text-primary)">${fmt(v)} <span style="color:var(--text-muted);font-weight:400">/ ${fmt(limit)}</span></span>
          </div>
          <div class="progress-track" style="height:5px"><div class="progress-fill ${color}" style="width:${p}%"></div></div>
        </div>
      </div>`;
    }).join('');
  }

  renderRecentTransactions();
  renderDonutChart('dash-donut', catTotals);
  updateNavBalance();

  // Update prog labels
  const ps = $('prog-spent'), pb = $('prog-budget');
  if (ps) ps.textContent = fmt(spent);
  if (pb) pb.textContent = fmt(bud.total);
}

function renderRecentTransactions() {
  const list = $('recent-list'); if (!list) return;
  const expenses = state.expenses.slice(-10).reverse();
  const allCats = getAllCategories();
  if (!expenses.length) {
    list.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">💸</div><h3>No transactions yet</h3><p>Add your first expense below</p></div></td></tr>`;
    return;
  }
  list.innerHTML = expenses.map(e => {
    const cat = allCats[e.category] || allCats.other;
    const recBadge = e.recurring ? `<span style="font-size:0.7rem;color:var(--cyan);margin-left:4px">🔄</span>` : '';
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:1.1rem">${cat.icon}</span>
        <span style="font-weight:500">${e.description || cat.label}</span>${recBadge}
      </div></td>
      <td><span class="badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.label}</span></td>
      <td class="text-muted text-sm">${formatDate(e.date)}</td>
      <td class="text-right font-bold text-pink">-${fmt(e.amount)}</td>
      <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteExpense('${e.id}')">🗑️</button></td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════
   EXPENSES PAGE
   ══════════════════════════════════════════ */
let activeFilter = 'all', activeSort = 'newest', _expSubmitting = false;

function initExpenses() {
  if (!$('expense-form')) return;

  // Inject recurring checkbox into expense form
  const expForm = $('expense-form');
  if (expForm && !$('exp-recurring')) {
    const recRow = document.createElement('div');
    recRow.style.cssText = 'margin-top:0.75rem;display:flex;align-items:center;gap:8px';
    recRow.innerHTML = `<input type="checkbox" id="exp-recurring" style="width:16px;height:16px;accent-color:var(--cyan)"><label for="exp-recurring" style="font-size:0.85rem;color:var(--text-secondary);cursor:pointer">🔄 Mark as recurring (auto-added each month)</label>`;
    expForm.querySelector('div[style*="justify-content:flex-end"]')?.parentNode?.insertBefore(recRow, expForm.querySelector('div[style*="justify-content:flex-end"]'));
  }

  expForm.addEventListener('submit', e => {
    e.preventDefault();
    if (_expSubmitting) return;
    const data = new FormData(expForm);
    const amt = money(+data.get('amount'));
    if (!amt || amt <= 0) { toast('Please enter a valid amount (> 0)', 'error'); return; }

    _expSubmitting = true;
    const btn = expForm.querySelector('[type="submit"]');
    const origTxt = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

    addExpense({
      id: uid(),
      description: data.get('description') || '',
      amount: amt,
      category: data.get('category'),
      date: data.get('date') || today(),
      recurring: !!$('exp-recurring')?.checked,
    });
    expForm.reset();
    if ($('exp-date')) $('exp-date').value = today();
    if ($('exp-recurring')) $('exp-recurring').checked = false;
    renderExpenseTable();
    renderExpenseSummaryCards();
    toast('Expense added successfully!', 'success');

    setTimeout(() => {
      _expSubmitting = false;
      if (btn) { btn.disabled = false; btn.textContent = origTxt || '+ Add Expense'; }
    }, 600);
  });

  if ($('exp-date')) $('exp-date').value = today();

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

  renderExpenseFilterButtons();
  // Bind "All" filter button
  const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      $$('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
      allBtn.classList.add('active');
      activeFilter = 'all';
      renderExpenseTable();
    });
  }

  renderExpenseTable();
  renderExpenseSummaryCards();
}

function addExpense(expense) {
  expense.amount = money(+expense.amount); // ensure precision
  const arr = state.expenses;
  arr.push(expense);
  state.expenses = arr;

  // Over-budget warning
  const bud = state.budget;
  if (bud.total > 0) {
    const spent = totalExpenses(getMonthExpenses());
    if (spent > bud.total) {
      const over = money(spent - bud.total);
      setTimeout(() => toast(`⚠️ Over budget by ${fmt(over)}! Review your spending.`, 'error'), 400);
    }
  }
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter(e => e.id !== id);
  renderExpenseTable?.();
  renderDashboard?.();
  if ($('expense-form')) renderExpenseSummaryCards();
  toast('Expense deleted', 'info');
}

function renderExpenseTable() {
  const tbody = $('expense-tbody'); if (!tbody) return;
  let expenses = [...state.expenses];
  const allCats = getAllCategories();

  if (activeFilter !== 'all') expenses = expenses.filter(e => e.category === activeFilter);
  const q = ($('exp-search')?.value || '').toLowerCase();
  if (q) expenses = expenses.filter(e => (e.description||'').toLowerCase().includes(q) || e.category.includes(q));
  expenses.sort((a,b) => {
    if (activeSort==='newest') return new Date(b.date)-new Date(a.date);
    if (activeSort==='oldest') return new Date(a.date)-new Date(b.date);
    if (activeSort==='highest') return +b.amount - +a.amount;
    if (activeSort==='lowest')  return +a.amount - +b.amount;
    return 0;
  });

  if (!expenses.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">💸</div><h3>No expenses found</h3><p>Try changing your filters or add a new expense above</p></div></td></tr>`;
    if ($('exp-total-count')) $('exp-total-count').textContent = 0;
    if ($('exp-total-amt'))   $('exp-total-amt').textContent = fmt(0);
    return;
  }

  tbody.innerHTML = expenses.map((e,i) => {
    const cat = allCats[e.category] || allCats.other;
    const recBadge = e.recurring ? `<span title="Recurring" style="font-size:0.7rem;color:var(--cyan)"> 🔄</span>` : '';
    return `<tr class="animate-in" style="animation-delay:${i*0.03}s">
      <td><div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:1.1rem">${cat.icon}</span>
        <span style="font-weight:500">${e.description||'—'}</span>${recBadge}
      </div></td>
      <td><span class="badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.label}</span></td>
      <td class="text-muted text-sm">${formatDate(e.date)}</td>
      <td class="font-bold" style="color:var(--pink)">-${fmt(e.amount)}</td>
      <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteExpense('${e.id}')" title="Delete">🗑️</button></td>
    </tr>`;
  }).join('');

  if ($('exp-total-count')) $('exp-total-count').textContent = expenses.length;
  if ($('exp-total-amt'))   $('exp-total-amt').textContent = fmt(money(expenses.reduce((s,e)=>money(s+money(+e.amount)),0)));
}

function renderExpenseSummaryCards() {
  const expenses = getMonthExpenses();
  const catTotals = totalByCategory(expenses);
  const allCats = getAllCategories();
  const list = $('expense-cat-summary'); if (!list) return;
  list.innerHTML = Object.entries(allCats).map(([k,c]) => {
    const v = catTotals[k] || 0;
    return `<div class="glass-card card-p stat-card ${catColorClass(k)} animate-in">
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
  $('budget-total-input').value = state.budget.total;
  renderBudgetPage();
  $('budget-total-input').addEventListener('input', function() {
    const b = state.budget; b.total = Math.max(0, money(+this.value||0)); state.budget = b;
    renderBudgetPage(); updateNavBalance();
  });
}

function renderBudgetPage() {
  const bud = state.budget;
  const expenses = getMonthExpenses();
  const catTotals = totalByCategory(expenses);
  const totalSpent = totalExpenses(expenses);
  const remaining = money(bud.total - totalSpent);
  const allCats = getAllCategories();

  animateCount('bud-total-val', bud.total);
  animateCount('bud-spent-val', totalSpent);
  animateCount('bud-remaining-val', remaining);

  const pct = bud.total > 0 ? Math.min(100,(totalSpent/bud.total)*100) : 0;
  const mainProg = $('main-budget-bar');
  if (mainProg) { mainProg.style.width=pct+'%'; mainProg.className='progress-fill '+(pct>85?'pink':pct>60?'yellow':'cyan'); }
  if ($('main-budget-pct')) $('main-budget-pct').textContent = pct.toFixed(1)+'%';

  const catList = $('budget-cat-list'); if (!catList) return;
  catList.innerHTML = Object.entries(allCats).map(([k,c]) => {
    const spent = catTotals[k] || 0;
    const limit = bud.cats[k] || 0;
    const p = limit > 0 ? Math.min(100,(spent/limit)*100) : 0;
    const color = p>90?'pink':p>70?'yellow':catColorClass(k);
    const over = spent > limit && limit > 0;
    return `<div class="budget-category-item animate-in">
      <span class="budget-cat-icon">${c.icon}</span>
      <div class="budget-cat-info">
        <div class="budget-cat-name">
          <span style="font-weight:600">${c.label}</span>
          <span style="display:flex;align-items:center;gap:8px">
            ${over?'<span style="color:var(--pink);font-size:0.75rem;font-weight:700">⚠️ Over</span>':''}
            <span style="color:var(--text-secondary)">${fmt(spent)} / </span>
            <span style="color:var(--text-primary)">${fmt(limit)}</span>
          </span>
        </div>
        <div class="progress-track"><div class="progress-fill ${color}" style="width:${p}%"></div></div>
        <div class="budget-cat-amounts">${p.toFixed(0)}% used · ${fmt(Math.max(0,money(limit-spent)))} remaining</div>
      </div>
      <input type="number" class="budget-edit-input" value="${limit}" min="0"
             onchange="updateCatBudget('${k}', this.value)" title="Edit limit">
    </div>`;
  }).join('');
}

function updateCatBudget(cat, val) {
  const b = state.budget; b.cats[cat] = Math.max(0, money(+val||0)); state.budget = b;
  renderBudgetPage();
  const allCats = getAllCategories();
  toast(`${allCats[cat]?.label||cat} budget updated`, 'success');
}

/* ══════════════════════════════════════════
   SAVINGS PAGE
   ══════════════════════════════════════════ */
let _goalSubmitting = false;

function initSavings() {
  if (!$('goals-grid')) return;
  renderGoalsGrid();
  const form = $('goal-form');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (_goalSubmitting) return;
      _goalSubmitting = true;
      const data = new FormData(form);
      const target = money(+data.get('target'));
      if (!target || target <= 0) { toast('Enter a valid target amount', 'error'); _goalSubmitting = false; return; }
      const goals = state.goals;
      goals.push({ id:uid(), name:data.get('name'), emoji:data.get('emoji')||'🎯', target, saved:0, deadline:data.get('deadline'), color:data.get('color')||'cyan', createdAt:today() });
      state.goals = goals;
      form.reset(); closeModal('goal-modal'); renderGoalsGrid();
      toast('New savings goal created! 🎯', 'success');
      setTimeout(() => _goalSubmitting = false, 600);
    });
  }
}

function renderGoalsGrid() {
  const grid = $('goals-grid'); if (!grid) return;
  const goals = state.goals;
  if (!goals.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🎯</div><h3>No savings goals yet</h3><p>Create your first goal to start saving</p></div>`;
    renderGoalsSummary([]); return;
  }
  grid.innerHTML = goals.map((g,i) => {
    const pct = g.target > 0 ? Math.min(100,(g.saved/g.target)*100) : 0;
    const remaining = Math.max(0, money(g.target - g.saved));
    const daysLeft = g.deadline ? Math.max(0,Math.ceil((new Date(g.deadline)-new Date())/86400000)) : null;
    return `<div class="glass-card goal-card animate-in" style="animation-delay:${i*0.1}s">
      <div class="goal-thumb">${g.emoji}</div>
      <div class="goal-name">${g.name}</div>
      <div class="goal-dates">${daysLeft!==null?`${daysLeft} days left · `:''}Added ${formatDate(g.createdAt)}</div>
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
      ${pct>=100?'<div style="text-align:center;margin-top:10px;font-size:1.5rem" title="Goal completed!">🎉</div>':''}
    </div>`;
  }).join('');
  renderGoalsSummary(goals);
}

function renderGoalsSummary(goals) {
  const totalTarget = money(goals.reduce((s,g)=>money(s+g.target),0));
  const totalSaved  = money(goals.reduce((s,g)=>money(s+g.saved),0));
  if ($('goals-total-target')) $('goals-total-target').textContent = fmt(totalTarget);
  if ($('goals-total-saved'))  $('goals-total-saved').textContent  = fmt(totalSaved);
  if ($('goals-count'))        $('goals-count').textContent = goals.length;
}

function addToGoal(id) {
  const input = $(`add-amt-${id}`);
  const amt = money(+input?.value);
  if (!amt || amt <= 0) { toast('Enter a valid amount', 'error'); return; }
  const goals = state.goals;
  const g = goals.find(g => g.id === id);
  if (g) {
    g.saved = Math.min(g.target, money(g.saved + amt));
    state.goals = goals;
    renderGoalsGrid();
    toast(`${fmt(amt)} added to "${g.name}"! 💰`, 'success');
    if (g.saved >= g.target) setTimeout(() => toast(`🎉 Goal "${g.name}" completed! Congratulations!`, 'success'), 500);
  }
}

function deleteGoal(id) {
  state.goals = state.goals.filter(g => g.id !== id);
  renderGoalsGrid(); toast('Goal deleted', 'info');
}

/* ══════════════════════════════════════════
   REPORTS PAGE
   ══════════════════════════════════════════ */
function initReports() {
  if (!$('reports-month-select')) return;
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
  const allCats = getAllCategories();

  animateCount('rep-total-spent', total);
  animateCount('rep-total-income', inc);
  animateCount('rep-net', money(inc - total));

  renderPieChart('rep-pie', catTotals);
  renderBarChart('rep-bar');

  const catTable = $('rep-cat-table');
  if (catTable) {
    const entries = Object.entries(catTotals).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);
    if (!entries.length) {
      catTable.innerHTML = `<tr><td colspan="3" class="text-center text-muted" style="padding:2rem">No expenses this month</td></tr>`;
    } else {
      catTable.innerHTML = entries.map(([k,v]) => {
        const cat = allCats[k] || allCats.other;
        const pct = total > 0 ? ((v/total)*100).toFixed(1) : '0';
        return `<tr>
          <td><div style="display:flex;align-items:center;gap:8px">${cat.icon} ${cat.label}</div></td>
          <td class="font-bold" style="color:var(--pink)">${fmt(v)}</td>
          <td><div style="display:flex;align-items:center;gap:8px">
            <div class="progress-track" style="flex:1"><div class="progress-fill cyan" style="width:${pct}%"></div></div>
            <span class="text-sm text-muted">${pct}%</span>
          </div></td>
        </tr>`;
      }).join('');
    }
  }

  const txList = $('rep-transactions');
  if (txList) {
    if (!expenses.length) {
      txList.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>No data this month</h3><p>Add some expenses to see your report</p></div>`;
    } else {
      const sorted = [...expenses].sort((a,b) => new Date(b.date)-new Date(a.date));
      txList.innerHTML = `<table class="data-table w-full">
        <thead><tr><th>Description</th><th>Category</th><th>Date</th><th class="text-right">Amount</th></tr></thead>
        <tbody>${sorted.map(e => {
          const cat = allCats[e.category] || allCats.other;
          return `<tr>
            <td>${cat.icon} ${e.description||'—'}${e.recurring?'<span style="font-size:0.7rem;color:var(--cyan);margin-left:4px">🔄</span>':''}</td>
            <td><span class="badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.label}</span></td>
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

function showChartEmpty(canvas, msg='No data yet — add expenses to see your chart') {
  canvas.style.display = 'none';
  let el = canvas.parentNode.querySelector('.chart-empty-state');
  if (!el) {
    el = document.createElement('div');
    el.className = 'chart-empty-state';
    el.style.cssText = 'text-align:center;padding:3rem 1rem;color:var(--text-muted)';
    canvas.parentNode.appendChild(el);
  }
  el.style.display = 'block';
  el.innerHTML = `<div style="font-size:2.5rem;margin-bottom:0.75rem;opacity:0.35">📊</div><p style="font-size:0.88rem">${msg}</p>`;
}

function hideChartEmpty(canvas) {
  canvas.style.display = 'block';
  const el = canvas.parentNode.querySelector('.chart-empty-state');
  if (el) el.style.display = 'none';
}

const TICK_COLOR = 'rgba(240,240,255,0.5)';
const GRID_COLOR = 'rgba(255,255,255,0.05)';

function renderDonutChart(canvasId, catTotals) {
  const canvas = $(canvasId); if (!canvas || typeof Chart==='undefined') return;
  destroyChart(canvasId);
  const allCats = getAllCategories();
  const labels=[], data=[], colors=[];
  Object.entries(catTotals).forEach(([k,v]) => {
    if (v > 0) { labels.push(allCats[k]?.label||k); data.push(v); colors.push(allCats[k]?.color||'#ffd60a'); }
  });
  if (!data.length) { showChartEmpty(canvas); return; }
  hideChartEmpty(canvas);
  chartInstances[canvasId] = new Chart(canvas, {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:colors.map(c=>c+'cc'), borderColor:colors, borderWidth:2, hoverOffset:8 }] },
    options:{
      responsive:true, maintainAspectRatio:true, cutout:'65%',
      plugins:{
        legend:{ position:'bottom', labels:{ color:'rgba(240,240,255,0.6)', font:{ family:'Plus Jakarta Sans', size:11 }, padding:16, usePointStyle:true, pointStyleWidth:10 } },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}` } },
      },
      animation:{ animateRotate:true, duration:800 },
    },
  });
}

function renderPieChart(canvasId, catTotals) { renderDonutChart(canvasId, catTotals); }

function renderBarChart(canvasId) {
  const canvas = $(canvasId); if (!canvas || typeof Chart==='undefined') return;
  destroyChart(canvasId);
  const labels=[], incData=[], expData=[];
  for (let i=5;i>=0;i--) {
    const d = new Date(CURR_YEAR, CURR_MONTH-i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    labels.push(MONTHS[d.getMonth()]);
    incData.push(totalIncome(m));
    expData.push(totalExpenses(state.expenses.filter(e=>e.date&&e.date.startsWith(m))));
  }
  const hasData = incData.some(v=>v>0) || expData.some(v=>v>0);
  if (!hasData) { showChartEmpty(canvas,'No income or expense data to display yet'); return; }
  hideChartEmpty(canvas);
  chartInstances[canvasId] = new Chart(canvas, {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Income',   data:incData, backgroundColor:'rgba(0,255,136,0.4)', borderColor:'#00ff88', borderWidth:2, borderRadius:6 },
      { label:'Expenses', data:expData, backgroundColor:'rgba(255,0,110,0.4)', borderColor:'#ff006e', borderWidth:2, borderRadius:6 },
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:'rgba(240,240,255,0.6)', font:{ family:'Plus Jakarta Sans' }, usePointStyle:true } },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales:{
        x:{ grid:{ color:GRID_COLOR }, ticks:{ color:TICK_COLOR } },
        y:{ grid:{ color:GRID_COLOR }, ticks:{ color:TICK_COLOR, callback: v => fmt(v) } },
      },
      animation:{ duration:800, easing:'easeInOutQuart' },
    },
  });
}

function renderLineChart(canvasId) {
  const canvas = $(canvasId); if (!canvas || typeof Chart==='undefined') return;
  destroyChart(canvasId);
  const labels=[], data=[];
  for (let i=5;i>=0;i--) {
    const d = new Date(CURR_YEAR, CURR_MONTH-i, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    labels.push(MONTHS[d.getMonth()]);
    const bud=state.budget, inc=totalIncome(m);
    const exp=totalExpenses(state.expenses.filter(e=>e.date&&e.date.startsWith(m)));
    data.push(Math.max(0, money(bud.total + inc - exp)));
  }
  const hasData = data.some(v=>v>0);
  if (!hasData) { showChartEmpty(canvas,'No savings data yet — set a budget and track expenses'); return; }
  hideChartEmpty(canvas);
  chartInstances[canvasId] = new Chart(canvas, {
    type:'line',
    data:{ labels, datasets:[{ label:'Savings', data, borderColor:'#00d4ff', backgroundColor:'rgba(0,212,255,0.1)', borderWidth:2, fill:true, tension:0.4, pointBackgroundColor:'#00d4ff', pointRadius:5 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ labels:{ color:'rgba(240,240,255,0.6)', font:{ family:'Plus Jakarta Sans' }, usePointStyle:true } },
        tooltip:{ callbacks:{ label: ctx => ` Savings: ${fmt(ctx.parsed.y)}` } },
      },
      scales:{
        x:{ grid:{ color:GRID_COLOR }, ticks:{ color:TICK_COLOR } },
        y:{ grid:{ color:GRID_COLOR }, ticks:{ color:TICK_COLOR, callback: v => fmt(v) } },
      },
    },
  });
}

/* ══════════════════════════════════════════
   INCOME MANAGEMENT
   ══════════════════════════════════════════ */
let _incSubmitting = false;

function initIncomeForm() {
  const form = $('income-form'); if (!form) return;
  const dateField = $('inc-date');
  if (dateField) dateField.value = today();
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (_incSubmitting) return;
    const data = new FormData(form);
    const amt = money(+data.get('amount'));
    if (!amt || amt <= 0) { toast('Enter a valid amount', 'error'); return; }
    _incSubmitting = true;
    const inc = state.income;
    inc.push({ id:uid(), source:data.get('source'), amount:amt, date:data.get('date')||today() });
    state.income = inc;
    form.reset();
    if (dateField) dateField.value = today();
    renderIncomeList(); updateNavBalance();
    toast('Income added! 💰', 'success');
    setTimeout(() => _incSubmitting = false, 600);
  });
  renderIncomeList();
}

function renderIncomeList() {
  const list = $('income-list'); if (!list) return;
  const income = state.income.slice(-10).reverse();
  if (!income.length) {
    list.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--text-muted)">No income recorded yet</td></tr>`;
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
  renderIncomeList(); updateNavBalance();
  toast('Income entry deleted', 'info');
}

/* ══════════════════════════════════════════
   GLOBAL EXPOSE
   ══════════════════════════════════════════ */
window.deleteExpense    = deleteExpense;
window.deleteGoal       = deleteGoal;
window.addToGoal        = addToGoal;
window.deleteIncome     = deleteIncome;
window.updateCatBudget  = updateCatBudget;
window.openModal        = openModal;
window.closeModal       = closeModal;
window.closeAllModals   = closeAllModals;
window.renderLineChart  = renderLineChart;
window.saveProfile      = saveProfile;
window.updateProfile    = updateProfile;
window.selectAvatar     = selectAvatar;
window.selectEditAvatar = selectEditAvatar;
window.confirmReset     = confirmReset;
window.executeReset     = executeReset;
window.addCustomCat     = addCustomCat;
window.deleteCustomCat  = deleteCustomCat;
window.exportCSV        = exportCSV;
window.triggerImportCSV = triggerImportCSV;
window.Auth             = Auth;
window.Theme            = Theme;
window.state            = state;

/* ══════════════════════════════════════════
   INIT
   ══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
  if (!Auth.guard()) return;

  injectProfileModal();
  injectNavProfileBtn();
  Theme.updateToggleBtn(Theme.get());

  initParticles();
  setActiveNav();
  initMobileNav();
  initScrollAnimations();

  document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeAllModals();
  });

  const currentUser = Auth.getUser();
  const profile = currentUser ? state.profile : null;
  if (currentUser && !profile) {
    openModal('onboarding-modal');
  } else if (profile) {
    applyProfile();
    updateNavBalance();
    populateCategorySelects();
    processRecurring(); // auto-add recurring expenses for this month
  }

  initDashboard();
  initExpenses();
  initBudget();
  initSavings();
  initReports();
  initIncomeForm();
});
