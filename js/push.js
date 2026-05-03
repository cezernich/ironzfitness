// push.js — Native push notification registration (Capacitor iOS)
// Loaded before auth.js. Activated after auth confirms a logged-in user.

/* =====================================================================
   INITIALIZATION — called from authBoot after session confirmed
   ===================================================================== */

async function initPushNotifications() {
  // Only run on native Capacitor — skip silently on web
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;

  const PushNotifications = window.Capacitor.Plugins.PushNotifications;
  if (!PushNotifications) return;

  // Request permission
  const permResult = await PushNotifications.requestPermissions();
  if (permResult.receive !== 'granted') return;

  // Listen for registration success
  PushNotifications.addListener('registration', async (token) => {
    await upsertPushToken(token.value);
  });

  // Listen for registration errors
  PushNotifications.addListener('registrationError', (err) => {
    console.warn('Push registration error:', err.error);
  });

  // Foreground notification — show in-app toast
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    showPushToast(notification.title || 'IronZ', notification.body || '');
  });

  // User tapped a notification — navigate based on payload
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const data = action.notification.data || {};
    handlePushNavigation(data);
  });

  // Register with APNs
  await PushNotifications.register();
}

/* =====================================================================
   TOKEN MANAGEMENT
   ===================================================================== */

async function upsertPushToken(token) {
  const client = window.supabaseClient;
  if (!client) return;

  const { data: { session } } = await client.auth.getSession();
  if (!session) return;

  const userId = session.user.id;

  const { error } = await client
    .from('push_tokens')
    .upsert(
      { user_id: userId, token: token, platform: 'ios', last_used_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );

  if (error) console.warn('Push token upsert error:', error.message);
}

/* =====================================================================
   IN-APP TOAST (foreground notifications)
   ===================================================================== */

function showPushToast(title, body) {
  // Remove existing toast if any
  const existing = document.getElementById('push-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'push-toast';
  toast.className = 'push-toast';
  toast.innerHTML = `
    <div class="push-toast-title">${_escapeHtml(title)}</div>
    ${body ? `<div class="push-toast-body">${_escapeHtml(body)}</div>` : ''}
  `;
  toast.addEventListener('click', () => toast.remove());
  document.body.appendChild(toast);

  // Auto-dismiss after 5 seconds
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

function _escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* =====================================================================
   NAVIGATION FROM NOTIFICATION TAP
   ===================================================================== */

function handlePushNavigation(data) {
  if (!data || !data.type) return;

  switch (data.type) {
    case 'share':
      // Open saved workouts / inbox
      if (typeof showTab === 'function') showTab('workouts');
      break;
    case 'workout':
      // Open calendar to see the workout
      if (typeof showTab === 'function') showTab('calendar');
      break;
    case 'hydration':
      if (typeof showTab === 'function') showTab('nutrition');
      break;
    default:
      break;
  }
}

/* =====================================================================
   UNIVERSAL LINKS — handle ironz.fit URLs opened in the native app
   ===================================================================== */

function initUniversalLinks() {
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) return;

  const CapApp = window.Capacitor.Plugins.App;
  if (!CapApp) return;

  CapApp.addListener('appUrlOpen', (event) => {
    try {
      const url = new URL(event.url);
      if (url.pathname.includes('share')) {
        const token = url.searchParams.get('token');
        if (token && typeof _handleImportParam === 'function') {
          // Inject the token into the URL so the existing import handler picks it up
          const current = new URL(window.location.href);
          current.searchParams.set('import', token);
          history.replaceState(null, '', current.toString());
          _handleImportParam();
        }
      }
    } catch (e) {
      console.warn('Universal link handling error:', e);
    }
  });
}

/* =====================================================================
   PUSH NOTIFICATION PREFERENCES (Supabase)
   ===================================================================== */

const PUSH_PREF_DEFAULTS = {
  workout_reminders: true,
  // HH:MM local-time for the daily workout reminder. The previous
  // "minutes before scheduled workout" model never fired because
  // workouts in this app aren't time-scheduled — see migration
  // 20260503b_workout_reminder_time.sql for the why.
  workout_reminder_time: "07:00",
  share_alerts: true,
  hydration_reminders: true,
  hydration_start_hour: 8,
  hydration_end_hour: 22,
  hydration_interval_hours: 2,
};

async function loadPushPrefs() {
  const client = window.supabaseClient;
  if (!client) return PUSH_PREF_DEFAULTS;

  const { data: { session } } = await client.auth.getSession();
  if (!session) return PUSH_PREF_DEFAULTS;

  const { data, error } = await client
    .from('notification_preferences')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data) return PUSH_PREF_DEFAULTS;
  return { ...PUSH_PREF_DEFAULTS, ...data };
}

async function savePushPref(field, value) {
  const client = window.supabaseClient;
  if (!client) return;

  const { data: { session } } = await client.auth.getSession();
  if (!session) return;

  const row = { user_id: session.user.id, [field]: value };
  const { error } = await client
    .from('notification_preferences')
    .upsert(row, { onConflict: 'user_id' });

  if (error) console.warn('Push pref save error:', error.message);
}

/* =====================================================================
   PUSH PREFERENCES UI (rendered into #push-notif-prefs)
   ===================================================================== */

async function renderPushNotifPrefs() {
  const container = document.getElementById('push-notif-prefs');
  if (!container) return;

  // Only show on native
  if (!window.Capacitor || !window.Capacitor.isNativePlatform()) {
    container.innerHTML = '<p class="hint">Push notification settings are available in the native iOS app.</p>';
    return;
  }

  const prefs = await loadPushPrefs();

  container.innerHTML = `
    <div class="pref-row">
      <div>
        <div class="pref-label">Workout Reminders</div>
        <div class="pref-desc">Get notified before scheduled workouts</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="push-pref-workout" ${prefs.workout_reminders ? 'checked' : ''}
          onchange="savePushPref('workout_reminders', this.checked)" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    ${prefs.workout_reminders ? `
    <div class="pref-row" style="padding-left:16px">
      <div>
        <div class="pref-label">Daily reminder</div>
        <div class="pref-desc">Time of day to nudge you about today's workout</div>
      </div>
      <input type="time" id="push-pref-reminder-time"
        value="${(prefs.workout_reminder_time || '07:00').slice(0, 5)}"
        onchange="savePushPref('workout_reminder_time', this.value)"
        style="width:auto;padding:6px 10px" />
    </div>` : ''}

    <div class="pref-row">
      <div>
        <div class="pref-label">Share Alerts</div>
        <div class="pref-desc">Notify when someone shares a workout with you</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="push-pref-share" ${prefs.share_alerts ? 'checked' : ''}
          onchange="savePushPref('share_alerts', this.checked)" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    <div class="pref-row">
      <div>
        <div class="pref-label">Hydration Reminders</div>
        <div class="pref-desc">Periodic reminders to drink water</div>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" id="push-pref-hydration" ${prefs.hydration_reminders ? 'checked' : ''}
          onchange="savePushPref('hydration_reminders', this.checked)" />
        <span class="toggle-slider"></span>
      </label>
    </div>

    ${prefs.hydration_reminders ? `
    <div class="pref-row" style="padding-left:16px">
      <div>
        <div class="pref-label">Hydration Window</div>
        <div class="pref-desc">Hours to send reminders</div>
      </div>
      <span style="font-size:14px;color:var(--text-secondary)">
        ${prefs.hydration_start_hour}:00 &ndash; ${prefs.hydration_end_hour}:00
      </span>
    </div>
    <div class="pref-row" style="padding-left:16px">
      <div>
        <div class="pref-label">Reminder Interval</div>
        <div class="pref-desc">How often to remind</div>
      </div>
      <select id="push-pref-hydration-int" onchange="savePushPref('hydration_interval_hours', parseInt(this.value))"
        style="width:auto;padding:6px 32px 6px 10px">
        <option value="1" ${prefs.hydration_interval_hours === 1 ? 'selected' : ''}>Every hour</option>
        <option value="2" ${prefs.hydration_interval_hours === 2 ? 'selected' : ''}>Every 2 hours</option>
        <option value="3" ${prefs.hydration_interval_hours === 3 ? 'selected' : ''}>Every 3 hours</option>
        <option value="4" ${prefs.hydration_interval_hours === 4 ? 'selected' : ''}>Every 4 hours</option>
      </select>
    </div>` : ''}
  `;
}
