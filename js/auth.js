// auth.js — Authentication gate
// Loaded last in index.html; overrides window.onload so the app only
// initialises after a valid Supabase session is confirmed.

// ── Dev bypass ─────────────────────────────────────────────────────────────────
// Set to true to skip login and go straight to the app.
// Flip back to false before going live with real auth.
const DEV_BYPASS_AUTH = false;

// ── Show / hide helpers ────────────────────────────────────────────────────────

function hideSplashScreen() {
  console.log('[Auth] hideSplashScreen: called');
  const splash = document.getElementById('splash-screen');
  if (!splash) {
    console.warn('[Auth] hideSplashScreen: #splash-screen not in DOM');
    return;
  }
  if (splash.dataset.hidden === '1') return;
  splash.dataset.hidden = '1';
  splash.classList.add('is-hiding');
  // Hard-hide as a safety net — even if the CSS transition misbehaves, the
  // splash MUST go away. 240ms gives the 200ms opacity fade room to finish.
  setTimeout(() => {
    if (splash && splash.parentNode) splash.style.display = 'none';
  }, 240);
  // Extra safety — also hide after 1s even if the above setTimeout gets
  // delayed by a heavy init() on the main thread.
  setTimeout(() => {
    const s = document.getElementById('splash-screen');
    if (s) s.style.display = 'none';
  }, 1000);
}

function showAuthScreen() {
  hideSplashScreen();
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-header').style.display  = 'none';
  document.getElementById('app-main').style.display    = 'none';
  const bn = document.getElementById('bottom-nav');
  if (bn) bn.style.display = 'none';
  document.body.classList.add('auth-visible');
}

function hideAuthScreen() {
  hideSplashScreen();
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-header').style.display  = '';
  document.getElementById('app-main').style.display    = '';
  const bn = document.getElementById('bottom-nav');
  if (bn) bn.style.display = '';
  document.body.classList.remove('auth-visible');
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
  const bn = document.getElementById('bottom-nav');
  if (bn) bn.style.display = 'none';
  document.body.classList.add('auth-visible');
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
    // Clear the #access_token=...&type=recovery fragment so a refresh
    // doesn't re-trigger the recovery flow and bounce the user back to
    // this panel.
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } else {
        window.location.hash = "";
      }
    } catch {}
    setTimeout(async () => {
      // Now run the same session-init sequence authBoot would have run
      // if this had been a normal login: sync caches, pull user data,
      // then show the main app. Skipping this leaves the app with a
      // valid session but none of the per-user localStorage populated.
      try {
        const { data } = await window.supabaseClient.auth.getSession();
        const session = data?.session;
        if (session) {
          try { DB.handleUserContext(session.user.id); } catch (e) { console.warn('Auth: handleUserContext error', e); }
          try { await ensureProfile(session.user); } catch (e) { console.warn('Auth: ensureProfile error', e); }
          try { await DB.migrateLocalStorage(); } catch (e) { console.warn('Auth: migration error', e); }
          // Replay any pending local writes BEFORE pulling remote — otherwise
          // refreshAllKeys overwrites unsynced edits with stale Supabase rows.
          try { await DB.replayPendingSyncs(); } catch (e) { console.warn('Auth: replayPendingSyncs error', e); }
          try { await DB.refreshAllKeys(); } catch (e) { console.warn('Auth: refreshAllKeys error', e); }
          try { await DB.refreshAllTables(); } catch (e) { console.warn('Auth: refreshAllTables error', e); }
        }
      } catch (e) { console.warn('Auth: post-reset session-init failed', e); }
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

  if (error) {
    setAuthMsg('auth-msg', error.message, true);
    if (typeof reportCaughtError === 'function') reportCaughtError(error, { context: 'auth', action: 'sign_in' });
  }
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
    if (typeof reportCaughtError === 'function') reportCaughtError(error, { context: 'auth', action: 'sign_up' });
  } else {
    setAuthMsg('auth-signup-msg', 'Account created! Check your email to confirm, then log in.', false);
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────────

async function handleLogout() {
  await window.supabaseClient.auth.signOut();
  // onAuthStateChange fires SIGNED_OUT and calls showAuthScreen()
}

// ── Delete Account ────────────────────────────────────────────────────────────
//
// App Store Guideline 5.1.1(v) requires an in-app path to permanently delete
// the user's account. We invoke the delete-account Edge Function (service
// role), which purges user-owned rows and calls auth.admin.deleteUser. On
// success we sign out — onAuthStateChange handles showing the auth screen.

function openDeleteAccountDialog() {
  let overlay = document.getElementById('delete-account-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'delete-account-modal-overlay';
    overlay.className = 'move-session-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDeleteAccountDialog();
    });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="move-session-modal" role="dialog" aria-modal="true" aria-label="Delete account">
      <div class="move-session-modal-title">Delete account</div>
      <p class="hint" style="margin:0 0 12px">
        This permanently deletes your IronZ account and every workout, meal, race,
        plan, and setting tied to it. This cannot be undone.
      </p>
      <div class="form-row">
        <label for="delete-account-confirm">Type <b>DELETE</b> to confirm</label>
        <input type="text" id="delete-account-confirm" autocomplete="off" placeholder="DELETE" />
      </div>
      <p id="delete-account-msg" class="save-msg" style="margin:8px 0 0;min-height:1.2em"></p>
      <div class="move-session-modal-actions">
        <button type="button" class="btn-secondary" onclick="closeDeleteAccountDialog()">Cancel</button>
        <button type="button" class="btn-danger"   onclick="handleDeleteAccount()">Delete my account</button>
      </div>
    </div>
  `;
  void overlay.offsetWidth;
  overlay.classList.add('visible');
  setTimeout(() => { document.getElementById('delete-account-confirm')?.focus(); }, 0);
}

function closeDeleteAccountDialog() {
  const overlay = document.getElementById('delete-account-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(() => {
    const el = document.getElementById('delete-account-modal-overlay');
    if (el) el.remove();
  }, 220);
}

async function handleDeleteAccount() {
  const confirmEl = document.getElementById('delete-account-confirm');
  const confirmText = (confirmEl?.value || '').trim();
  const msgId = 'delete-account-msg';
  if (confirmText !== 'DELETE') {
    setAuthMsg(msgId, 'Type DELETE (in capitals) to confirm.', true);
    return;
  }

  const btn = document.querySelector('#delete-account-modal-overlay .btn-danger');
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }

  try {
    const { data: sessionData, error: sessionErr } = await window.supabaseClient.auth.getSession();
    if (sessionErr || !sessionData?.session?.access_token) {
      setAuthMsg(msgId, 'Could not read your session. Try signing out and back in.', true);
      return;
    }
    const accessToken = sessionData.session.access_token;

    // Invoke the Edge Function. supabase-js auto-forwards the user's JWT
    // when we pass it via invoke options, so the function can verify the
    // caller and delete only their own account.
    const { error: fnErr } = await window.supabaseClient.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (fnErr) {
      setAuthMsg(msgId, fnErr.message || 'Account deletion failed. Contact support.', true);
      return;
    }

    setAuthMsg(msgId, 'Account deleted.', false);
    // Clear every per-user key so the goodbye screen doesn't briefly
    // flash the previous session's data, then sign out. onAuthStateChange
    // SIGNED_OUT will also call clearLocalUserData defensively.
    try { DB.clearLocalUserData(); } catch (e) { console.warn('Auth: clearLocalUserData error', e); }
    try { await window.supabaseClient.auth.signOut(); } catch (e) { console.warn('Auth: signOut after delete error', e); }
    setTimeout(() => closeDeleteAccountDialog(), 600);
  } catch (e) {
    setAuthMsg(msgId, 'Something went wrong. Try again.', true);
    if (typeof reportCaughtError === 'function') reportCaughtError(e, { context: 'auth', action: 'delete_account' });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Delete my account'; }
  }
}

// ── Change password (signed-in user) ──────────────────────────────────────────
//
// Used by the in-app "Change Password" button in Settings → Account.
// Opens a centered modal (matching the move-session-modal convention)
// with current / new / confirm fields. handleChangePassword
// re-verifies the current password via signInWithPassword before
// calling updateUser, so a stolen-laptop scenario can't change the
// password without knowing the existing one. The re-auth fires a
// SIGNED_IN event for the same user — harmless overhead handled as a
// no-op by the normal onAuthStateChange path.

function openChangePasswordDialog() {
  let overlay = document.getElementById('change-password-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'change-password-modal-overlay';
    overlay.className = 'move-session-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeChangePasswordDialog();
    });
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="move-session-modal" role="dialog" aria-modal="true" aria-label="Change password">
      <div class="move-session-modal-title">Change password</div>
      <p class="hint" style="margin:0 0 12px">Requires your current password. Minimum 6 characters.</p>
      <div class="form-row">
        <label for="change-pw-current">Current password</label>
        <input type="password" id="change-pw-current" autocomplete="current-password" />
      </div>
      <div class="form-row">
        <label for="change-pw-new">New password</label>
        <input type="password" id="change-pw-new" autocomplete="new-password" />
      </div>
      <div class="form-row">
        <label for="change-pw-confirm">Confirm new password</label>
        <input type="password" id="change-pw-confirm" autocomplete="new-password" />
      </div>
      <p id="change-pw-msg" class="save-msg" style="margin:8px 0 0;min-height:1.2em"></p>
      <div class="move-session-modal-actions">
        <button type="button" class="btn-secondary" onclick="closeChangePasswordDialog()">Cancel</button>
        <button type="button" class="btn-primary"   onclick="handleChangePassword()">Save</button>
      </div>
    </div>
  `;
  void overlay.offsetWidth;
  overlay.classList.add('visible');
  setTimeout(() => { document.getElementById('change-pw-current')?.focus(); }, 0);
}

function closeChangePasswordDialog() {
  const overlay = document.getElementById('change-password-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(() => {
    const el = document.getElementById('change-password-modal-overlay');
    if (el) el.remove();
  }, 220);
}

async function handleChangePassword() {
  const currentEl = document.getElementById('change-pw-current');
  const newEl     = document.getElementById('change-pw-new');
  const confirmEl = document.getElementById('change-pw-confirm');
  const msgId = 'change-pw-msg';

  const current = currentEl?.value || '';
  const next    = newEl?.value || '';
  const confirm = confirmEl?.value || '';

  if (!current) { setAuthMsg(msgId, 'Enter your current password.', true); return; }
  if (!next || next.length < 6) { setAuthMsg(msgId, 'New password must be at least 6 characters.', true); return; }
  if (next !== confirm) { setAuthMsg(msgId, 'New passwords do not match.', true); return; }
  if (next === current) { setAuthMsg(msgId, 'New password must be different from the current one.', true); return; }

  const btn = document.querySelector('#change-password-modal-overlay .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const { data: userData, error: userErr } = await window.supabaseClient.auth.getUser();
    if (userErr || !userData?.user?.email) {
      setAuthMsg(msgId, 'Could not read your session. Try signing out and back in.', true);
      return;
    }
    const email = userData.user.email;

    // Re-verify the current password. If wrong, stop without calling
    // updateUser so nothing changes.
    const { error: verifyErr } = await window.supabaseClient.auth.signInWithPassword({ email, password: current });
    if (verifyErr) {
      setAuthMsg(msgId, 'Current password is incorrect.', true);
      return;
    }

    const { error: updateErr } = await window.supabaseClient.auth.updateUser({ password: next });
    if (updateErr) {
      setAuthMsg(msgId, updateErr.message || 'Could not update password.', true);
      return;
    }

    setAuthMsg(msgId, 'Password updated.', false);
    setTimeout(() => closeChangePasswordDialog(), 900);
  } catch (e) {
    setAuthMsg(msgId, 'Something went wrong. Try again.', true);
    if (typeof reportCaughtError === 'function') reportCaughtError(e, { context: 'auth', action: 'change_password' });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }
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
    // Determine role — hardcoded owner emails get admin. Both the personal
    // gmail and the northwestern account are admins so the dashboard works
    // whichever email is logged in.
    const ADMIN_EMAILS = ['chase.zernich@gmail.com', 'chase.zernich@kellogg.northwestern.edu'];
    const isAdmin = user.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

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

  let role = profileRow?.role || 'user';

  // Self-heal: if the logged-in user's email is on the admin list but their
  // profile row predates that check, upgrade it now. Runs once per sign-in
  // — no-op if already admin.
  const ADMIN_EMAILS = ['chase.zernich@gmail.com', 'chase.zernich@kellogg.northwestern.edu'];
  if (role !== 'admin' && user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    try {
      await client.from('profiles').update({ role: 'admin' }).eq('id', user.id);
      role = 'admin';
    } catch (e) {
      if (typeof reportCaughtError === 'function') reportCaughtError(e, { context: 'auth', action: 'admin_self_heal' });
    }
  }

  window._userRole = role;
  if (typeof initAdminVisibility === 'function') initAdminVisibility();
  // Coach visibility — flips both #section-coach-entry (when is_coach
  // is true) and #section-coach-request (hidden when the user already
  // has an active coaching_assignments row as a client).
  if (typeof initCoachVisibility === 'function') initCoachVisibility().catch(e => console.warn('Auth: initCoachVisibility error', e));
  // Phase 5A: refresh client_plan_freeze state. Populates the
  // localStorage cache that the AI plan generator reads synchronously,
  // and toggles the Profile freeze card.
  if (typeof refreshPlanFreezeState === 'function') refreshPlanFreezeState().catch(e => console.warn('Auth: refreshPlanFreezeState error', e));
  // Phase 5B: fetch active coaches so calendar.js can label workouts
  // from removed coaches as "FROM FORMER COACH".
  if (typeof fetchActiveCoachIds === 'function') fetchActiveCoachIds().catch(e => console.warn('Auth: fetchActiveCoachIds error', e));
}

// ── Boot sequence ──────────────────────────────────────────────────────────────

async function authBoot() {
  console.log('[Auth] authBoot: starting');

  // Password-recovery detection — must run BEFORE getSession().
  //
  // Supabase redirects the reset-password email link to our app with a
  // fragment like `#access_token=...&refresh_token=...&type=recovery`.
  // The JS client auto-processes this on createClient() (default
  // detectSessionInUrl: true), creates a live session, and fires a
  // PASSWORD_RECOVERY event — but our onAuthStateChange listener is
  // attached much later in authBoot, so that event is lost to nobody.
  // Result: authBoot's getSession() just sees a valid session and
  // drops the user into the main app via init(), never prompting for
  // a new password. They stay logged in on this device but don't know
  // their password, so the moment the refresh token expires or they
  // sign out they're locked out.
  //
  // We sniff `type=recovery` from the fragment ourselves and force the
  // new-password panel even if getSession() shows a live session. The
  // recovery session remains valid long enough for updateUser() to
  // accept the new password — we just don't let the user into the
  // main app until they've set one.
  const _recoveryHashRe = /[#&]type=recovery\b/;
  const isRecoveryFlow = _recoveryHashRe.test(window.location.hash || "");

  // Safety net: if getSession() stalls, fall back to login screen after 3s
  // so the user is never stuck staring at the splash indefinitely.
  const splashTimeout = setTimeout(() => {
    if (!window._appInitialized) {
      console.warn('[Auth] timeout fired, showing auth screen');
      try { showAuthScreen(); } catch (e) { console.error('[Auth] showAuthScreen failed', e); hideSplashScreen(); }
    }
  }, 3000);

  if (DEV_BYPASS_AUTH) {
    clearTimeout(splashTimeout);
    hideAuthScreen();
    window._appInitialized = true;
    window._userRole = "admin";
    localStorage.removeItem("activeTab");
    init();
    if (typeof initAdminVisibility === "function") initAdminVisibility();
    return;
  }

  // Sanity check: Supabase client must exist
  if (!window.supabaseClient) {
    console.error('[Auth] window.supabaseClient is undefined — check supabase-init.js');
    clearTimeout(splashTimeout);
    hideSplashScreen();
    showAuthScreen();
    return;
  }

  // If the URL says this is a password-recovery landing, force the
  // new-password panel before doing anything else. We still register
  // onAuthStateChange below so handleNewPassword's init() call picks
  // up normally once the new password is saved.
  if (isRecoveryFlow) {
    console.log('[Auth] password-recovery flow detected, forcing new-password panel');
    clearTimeout(splashTimeout);
    hideSplashScreen();
    showNewPasswordPanel();
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        if (typeof window.Sentry !== 'undefined' && window.Sentry.setUser) {
          try { window.Sentry.setUser(null); } catch {}
        }
        try { DB.clearLocalUserData(); } catch (e) { console.warn('Auth: clearLocalUserData error', e); }
        window._appInitialized = false;
        showAuthScreen();
      }
    });
    return;
  }

  console.log('[Auth] calling getSession()');
  let session;
  try {
    const { data } = await window.supabaseClient.auth.getSession();
    session = data?.session;
    console.log('[Auth] getSession resolved, session=', !!session);
  } catch (e) {
    console.error('[Auth] getSession threw error:', e);
    if (typeof reportCaughtError === 'function') reportCaughtError(e, { context: 'auth', action: 'get_session' });
    clearTimeout(splashTimeout);
    hideSplashScreen();
    showAuthScreen();
    return;
  }

  clearTimeout(splashTimeout);

  if (session) {
    // Tag every Sentry event from this session with the user id + email
    // so crash reports are tied to the account that experienced them.
    if (typeof window.Sentry !== 'undefined' && window.Sentry.setUser) {
      try { window.Sentry.setUser({ id: session.user.id, email: session.user.email }); } catch {}
    }
    // Wipe any stale cache from a previous user on this device BEFORE
    // any migration or refresh runs — otherwise stale data gets pushed
    // under the new user id.
    try { DB.handleUserContext(session.user.id); } catch (e) { console.warn('Auth: handleUserContext error', e); }
    try { await ensureProfile(session.user); } catch (e) { console.warn('Auth: ensureProfile error', e); }
    try { await DB.migrateLocalStorage(); } catch (e) { console.warn('Auth: migration error', e); }
    // Replay any pending local writes BEFORE pulling remote — otherwise
    // refreshAllKeys overwrites unsynced edits with stale Supabase rows.
    try { await DB.replayPendingSyncs(); } catch (e) { console.warn('Auth: replayPendingSyncs error', e); }
    // Pull all data from Supabase before initializing UI
    try { await DB.refreshAllKeys(); } catch (e) { console.warn('Auth: refreshAllKeys error', e); }
    try { await DB.refreshAllTables(); } catch (e) { console.warn('Auth: refreshAllTables error', e); }
    // Migrate legacy savedWorkouts into unified saved library
    if (window.SavedWorkoutsLibrary && window.SavedWorkoutsLibrary.migrateOldSavedWorkouts) {
      try { await window.SavedWorkoutsLibrary.migrateOldSavedWorkouts(); } catch (e) { console.warn('Auth: savedWorkouts migration error', e); }
    }
    // One-time backfill + cross-device merge against the saved_workouts table
    if (window.SavedWorkoutsLibrary && window.SavedWorkoutsLibrary.bootSyncSupabase) {
      try { await window.SavedWorkoutsLibrary.bootSyncSupabase(); } catch (e) { console.warn('Auth: savedWorkouts supabase sync error', e); }
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
      if (typeof window.Sentry !== 'undefined' && window.Sentry.setUser) {
        try { window.Sentry.setUser({ id: session.user.id, email: session.user.email }); } catch {}
      }
      // Wipe any stale cache from a previous user on this device before
      // anything reads or writes per-user localStorage.
      try { DB.handleUserContext(session.user.id); } catch (e) { console.warn('Auth: handleUserContext error', e); }
      try { await ensureProfile(session.user); } catch (e) { console.warn('Auth: ensureProfile error', e); }
      try { await DB.migrateLocalStorage(); } catch (e) { console.warn('Auth: migration error', e); }
      // Replay any pending local writes BEFORE pulling remote — otherwise
      // refreshAllKeys overwrites unsynced edits with stale Supabase rows.
      try { await DB.replayPendingSyncs(); } catch (e) { console.warn('Auth: replayPendingSyncs error', e); }
      try { await DB.refreshAllKeys(); } catch (e) { console.warn('Auth: refreshAllKeys error', e); }
      try { await DB.refreshAllTables(); } catch (e) { console.warn('Auth: refreshAllTables error', e); }
      // Migrate legacy savedWorkouts into unified saved library
      if (window.SavedWorkoutsLibrary && window.SavedWorkoutsLibrary.migrateOldSavedWorkouts) {
        try { await window.SavedWorkoutsLibrary.migrateOldSavedWorkouts(); } catch (e) { console.warn('Auth: savedWorkouts migration error', e); }
      }
      // One-time backfill + cross-device merge against the saved_workouts table
      if (window.SavedWorkoutsLibrary && window.SavedWorkoutsLibrary.bootSyncSupabase) {
        try { await window.SavedWorkoutsLibrary.bootSyncSupabase(); } catch (e) { console.warn('Auth: savedWorkouts supabase sync error', e); }
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
      // Drop the user context on Sentry so any errors after sign-out
      // don't get attributed to the previous account.
      if (typeof window.Sentry !== 'undefined' && window.Sentry.setUser) {
        try { window.Sentry.setUser(null); } catch {}
      }
      // Nuke every per-user key from localStorage so the next user to
      // sign in on this device starts clean. Without this the next user
      // sees the previous user's workouts, profile, meals, etc. — and
      // worse, their first interaction upserts that stale data under
      // their own user id.
      try { DB.clearLocalUserData(); } catch (e) { console.warn('Auth: clearLocalUserData error', e); }
      window._appInitialized = false;
      showAuthScreen();
    }
  });
}

// Override window.onload set by app.js.
// Handle the case where the load event has already fired (e.g. async script,
// cached page, Capacitor WebView) — in that case window.onload = ... would
// silently never run.
if (document.readyState === 'complete') {
  console.log('[Auth] document already loaded — running authBoot immediately');
  setTimeout(authBoot, 0);
} else {
  window.onload = authBoot;
}
