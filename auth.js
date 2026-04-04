// auth.js — Authentication gate
// Loaded last in index.html; overrides window.onload so the app only
// initialises after a valid Supabase session is confirmed.

// ── Dev bypass ─────────────────────────────────────────────────────────────────
// Set to true to skip login and go straight to the app.
// Flip back to false before going live with real auth.
const DEV_BYPASS_AUTH = true;

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
    const { error: insertError } = await client.from('profiles').insert({
      id:                  user.id,
      email:               user.email,
      full_name:           user.user_metadata?.full_name || '',
      subscription_status: 'free',
      role:                'user',
    });
    if (insertError) console.warn('Profile insert error:', insertError.message);
  }
}

// ── Boot sequence ──────────────────────────────────────────────────────────────

async function authBoot() {
  if (DEV_BYPASS_AUTH) {
    hideAuthScreen();
    window._appInitialized = true;
    localStorage.removeItem("activeTab");
    init();
    return;
  }

  const { data: { session } } = await window.supabaseClient.auth.getSession();

  if (session) {
    await ensureProfile(session.user);
    hideAuthScreen();
    window._appInitialized = true;
    init();
  } else {
    showAuthScreen();
  }

  window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await ensureProfile(session.user);
      hideAuthScreen();
      if (!window._appInitialized) {
        window._appInitialized = true;
        localStorage.removeItem("activeTab");
        init();
      }
    } else if (event === 'SIGNED_OUT') {
      window._appInitialized = false;
      showAuthScreen();
    }
  });
}

// Override window.onload set by app.js
window.onload = authBoot;
