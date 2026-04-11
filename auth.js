// auth.js — Authentication gate
// Loaded last in index.html; overrides window.onload so the app only
// initialises after a valid Supabase session is confirmed.

// ── Dev bypass ─────────────────────────────────────────────────────────────────
// Set to true to skip login and go straight to the app.
// Flip back to false before going live with real auth.
const DEV_BYPASS_AUTH = false;

// ── Show / hide helpers ────────────────────────────────────────────────────────

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-header').style.display  = 'none';
  document.getElementById('app-main').style.display    = 'none';
}

function hideAuthScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-header').style.display  = '';
  document.getElementById('app-main').style.display    = '';
}

// ── Auth tab switching ─────────────────────────────────────────────────────────

function switchAuthTab(tab) {
  hideAllAuthPanels();
  const isLogin = tab === 'login';
  document.getElementById('auth-panel-login').style.display  = isLogin ? '' : 'none';
  document.getElementById('auth-panel-signup').style.display = isLogin ? 'none' : '';
  document.getElementById('auth-tab-login').classList.toggle('active', isLogin);
  document.getElementById('auth-tab-signup').classList.toggle('active', !isLogin);
  document.getElementById('auth-msg').textContent        = '';
  document.getElementById('auth-signup-msg').textContent = '';
}

function setAuthMsg(id, text, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? 'var(--color-danger, #e74c3c)' : 'var(--color-success, #2ecc71)';
}

// ── Reset password panels ─────────────────────────────────────────────────────

function hideAllAuthPanels() {
  document.getElementById('auth-panel-login').style.display  = 'none';
  document.getElementById('auth-panel-signup').style.display = 'none';
  document.getElementById('auth-panel-reset').style.display  = 'none';
  document.getElementById('auth-panel-newpw').style.display  = 'none';
}

function showResetPanel() {
  hideAllAuthPanels();
  document.getElementById('auth-panel-reset').style.display = '';
  document.getElementById('auth-tab-login').classList.remove('active');
  document.getElementById('auth-tab-signup').classList.remove('active');
  document.getElementById('auth-reset-msg').textContent = '';
}

function showNewPasswordPanel() {
  hideAllAuthPanels();
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-header').style.display  = 'none';
  document.getElementById('app-main').style.display    = 'none';
  document.getElementById('auth-panel-newpw').style.display = '';
  document.getElementById('auth-tab-login').classList.remove('active');
  document.getElementById('auth-tab-signup').classList.remove('active');
  document.getElementById('auth-newpw-msg').textContent = '';
}

// ── Reset password request ────────────────────────────────────────────────────

async function handleResetRequest() {
  const email = document.getElementById('auth-reset-email').value.trim();
  if (!email) {
    setAuthMsg('auth-reset-msg', 'Please enter your email.', true);
    return;
  }

  const btn = document.querySelector('#auth-panel-reset .btn-primary');
  btn.disabled    = true;
  btn.textContent = 'Sending…';

  const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  btn.disabled    = false;
  btn.textContent = 'Send Reset Link';

  if (error) {
    setAuthMsg('auth-reset-msg', error.message, true);
  } else {
    setAuthMsg('auth-reset-msg', 'Check your email for a reset link.', false);
  }
}

// ── Set new password (after email link) ───────────────────────────────────────

async function handleNewPassword() {
  const pw      = document.getElementById('auth-new-password').value;
  const confirm = document.getElementById('auth-confirm-password').value;

  if (!pw || pw.length < 6) {
    setAuthMsg('auth-newpw-msg', 'Password must be at least 6 characters.', true);
    return;
  }
  if (pw !== confirm) {
    setAuthMsg('auth-newpw-msg', 'Passwords do not match.', true);
    return;
  }

  const btn = document.querySelector('#auth-panel-newpw .btn-primary');
  btn.disabled    = true;
  btn.textContent = 'Updating…';

  const { error } = await window.supabaseClient.auth.updateUser({ password: pw });

  btn.disabled    = false;
  btn.textContent = 'Update Password';

  if (error) {
    setAuthMsg('auth-newpw-msg', error.message, true);
  } else {
    setAuthMsg('auth-newpw-msg', 'Password updated! Logging you in…', false);
    setTimeout(() => {
      hideAuthScreen();
      if (!window._appInitialized) {
        window._appInitialized = true;
        init();
      }
    }, 1500);
  }
}

// ── Login ──────────────────────────────────────────────────────────────────────

async function handleLogin() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email || !password) {
    setAuthMsg('auth-msg', 'Please enter your email and password.', true);
    return;
  }

  const btn = document.querySelector('#auth-panel-login .btn-primary');
  btn.disabled    = true;
  btn.textContent = 'Logging in…';

  const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });

  btn.disabled    = false;
  btn.textContent = 'Log In';

  if (error) setAuthMsg('auth-msg', error.message, true);
  // On success, onAuthStateChange handles the transition
}

// ── Signup ─────────────────────────────────────────────────────────────────────

async function handleSignup() {
  const name     = document.getElementById('auth-signup-name').value.trim();
  const email    = document.getElementById('auth-signup-email').value.trim();
  const password = document.getElementById('auth-signup-password').value;

  if (!email || !password) {
    setAuthMsg('auth-signup-msg', 'Please enter your email and password.', true);
    return;
  }
  if (password.length < 6) {
    setAuthMsg('auth-signup-msg', 'Password must be at least 6 characters.', true);
    return;
  }
  if (!document.getElementById('auth-agree-terms')?.checked) {
    setAuthMsg('auth-signup-msg', 'You must agree to the Terms & Conditions and Privacy Policy.', true);
    return;
  }

  const btn = document.querySelector('#auth-panel-signup .btn-primary');
  btn.disabled    = true;
  btn.textContent = 'Creating account…';

  const { error } = await window.supabaseClient.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } },
  });

  btn.disabled    = false;
  btn.textContent = 'Create Account';

  if (error) {
    setAuthMsg('auth-signup-msg', error.message, true);
  } else {
    setAuthMsg('auth-signup-msg', 'Account created! Check your email to confirm, then log in.', false);
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────────

async function handleLogout() {
  await window.supabaseClient.auth.signOut();
  // onAuthStateChange fires SIGNED_OUT and calls showAuthScreen()
}

// ── Profile upsert (create if not exists) ─────────────────────────────────────

async function ensureProfile(user) {
  const client = window.supabaseClient;

  const { data: existing, error: fetchError } = await client
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (fetchError) {
    console.warn('Profile fetch error:', fetchError.message);
    return;
  }

  if (!existing) {
    // Determine role — only the hardcoded owner email gets admin
    const adminEmail = 'chase.zernich@gmail.com';
    const isAdmin = user.email && user.email.toLowerCase() === adminEmail;

    const { error: insertError } = await client.from('profiles').insert({
      id:                  user.id,
      email:               user.email,
      full_name:           user.user_metadata?.full_name || '',
      subscription_status: 'free',
      role:                isAdmin ? 'admin' : 'user',
    });
    if (insertError) console.warn('Profile insert error:', insertError.message);
    else if (isFirstUser) console.log('First user — assigned admin role');
  }

  // Fetch role for admin gating
  const { data: profileRow } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  window._userRole = profileRow?.role || 'user';
  if (typeof initAdminVisibility === 'function') initAdminVisibility();
}

// ── Boot sequence ──────────────────────────────────────────────────────────────

async function authBoot() {
  if (DEV_BYPASS_AUTH) {
    hideAuthScreen();
    window._appInitialized = true;
    window._userRole = "admin";
    localStorage.removeItem("activeTab");
    init();
    if (typeof initAdminVisibility === "function") initAdminVisibility();
    return;
  }

  let session;
  try {
    const { data } = await window.supabaseClient.auth.getSession();
    session = data?.session;
  } catch (e) {
    console.warn('Auth: getSession error', e);
  }

  if (session) {
    try { await ensureProfile(session.user); } catch (e) { console.warn('Auth: ensureProfile error', e); }
    try { await DB.migrateLocalStorage(); } catch (e) { console.warn('Auth: migration error', e); }
    // Pull all data from Supabase before initializing UI
    try { await DB.refreshAllKeys(); } catch (e) { console.warn('Auth: refreshAllKeys error', e); }
    try { await DB.refreshAllTables(); } catch (e) { console.warn('Auth: refreshAllTables error', e); }
    // Migrate legacy savedWorkouts into unified saved library
    if (window.SavedWorkoutsLibrary && window.SavedWorkoutsLibrary.migrateOldSavedWorkouts) {
      try { await window.SavedWorkoutsLibrary.migrateOldSavedWorkouts(); } catch (e) { console.warn('Auth: savedWorkouts migration error', e); }
    }
    hideAuthScreen();
    window._appInitialized = true;
    init();
    if (typeof initPushNotifications === 'function') {
      try { await initPushNotifications(); } catch (e) { console.warn('Auth: push init error', e); }
    }
    if (typeof initUniversalLinks === 'function') {
      try { initUniversalLinks(); } catch (e) { console.warn('Auth: universal links init error', e); }
    }
  } else {
    showAuthScreen();
  }

  window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      try { await ensureProfile(session.user); } catch (e) { console.warn('Auth: ensureProfile error', e); }
      try { await DB.migrateLocalStorage(); } catch (e) { console.warn('Auth: migration error', e); }
      try { await DB.refreshAllKeys(); } catch (e) { console.warn('Auth: refreshAllKeys error', e); }
      try { await DB.refreshAllTables(); } catch (e) { console.warn('Auth: refreshAllTables error', e); }
      // Migrate legacy savedWorkouts into unified saved library
      if (window.SavedWorkoutsLibrary && window.SavedWorkoutsLibrary.migrateOldSavedWorkouts) {
        try { await window.SavedWorkoutsLibrary.migrateOldSavedWorkouts(); } catch (e) { console.warn('Auth: savedWorkouts migration error', e); }
      }
      hideAuthScreen();
      if (!window._appInitialized) {
        window._appInitialized = true;
        localStorage.removeItem("activeTab");
        init();
      }
      if (typeof initPushNotifications === 'function') {
        try { await initPushNotifications(); } catch (e) { console.warn('Auth: push init error', e); }
      }
    } else if (event === 'PASSWORD_RECOVERY') {
      showNewPasswordPanel();
    } else if (event === 'SIGNED_OUT') {
      window._appInitialized = false;
      showAuthScreen();
    }
  });
}

// Override window.onload set by app.js
window.onload = authBoot;
