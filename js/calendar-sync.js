// calendar-sync.js — Outlook / Google Calendar Sync
// Uses Microsoft Graph API with OAuth 2.0 PKCE flow

const CAL_SYNC_CONFIG = {
  // User must register an app at https://portal.azure.com > App registrations
  // Set redirect URI to the app's URL (e.g. http://localhost:8080)
  // Required permissions: Calendars.ReadWrite
  msClientId: "", // Paste your Azure AD client ID here
  msRedirectUri: window.location.origin + window.location.pathname,
  msScopes: ["Calendars.ReadWrite", "Calendars.Read"],
};

// ── State ────────────────────────────────────────────────────────────────────

function _getCalSyncState() {
  try { return JSON.parse(localStorage.getItem("calendarSync")) || {}; } catch { return {}; }
}

function _setCalSyncState(state) {
  localStorage.setItem("calendarSync", JSON.stringify(state));
}

function isCalendarConnected() {
  const state = _getCalSyncState();
  return !!(state.accessToken && state.expiresAt && Date.now() < state.expiresAt);
}

// ── OAuth PKCE Flow ──────────────────────────────────────────────────────────

function _generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function _generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function connectOutlookCalendar() {
  const clientId = CAL_SYNC_CONFIG.msClientId;
  if (!clientId) {
    alert("Outlook Calendar sync requires a Microsoft Azure AD client ID. Configure it in calendar-sync.js.");
    return;
  }

  const verifier = _generateCodeVerifier();
  const challenge = await _generateCodeChallenge(verifier);
  localStorage.setItem("_calPkceVerifier", verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: CAL_SYNC_CONFIG.msRedirectUri,
    scope: CAL_SYNC_CONFIG.msScopes.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    response_mode: "query",
  });

  window.location.href = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;

  const verifier = localStorage.getItem("_calPkceVerifier");
  if (!verifier) return;
  localStorage.removeItem("_calPkceVerifier");

  // Clean URL
  window.history.replaceState({}, document.title, window.location.pathname);

  try {
    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CAL_SYNC_CONFIG.msClientId,
        code,
        redirect_uri: CAL_SYNC_CONFIG.msRedirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);

    _setCalSyncState({
      provider: "outlook",
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    });

    renderCalSyncStatus();
  } catch (err) {
    console.error("Calendar sync OAuth error:", err);
  }
}

function disconnectCalendar() {
  localStorage.removeItem("calendarSync");
  renderCalSyncStatus();
}

// ── Sync Operations ──────────────────────────────────────────────────────────

async function syncWorkoutsToCalendar() {
  if (!isCalendarConnected()) return;
  const state = _getCalSyncState();
  const syncStatus = document.getElementById("cal-sync-status-msg");
  if (syncStatus) syncStatus.textContent = "Syncing...";

  try {
    // Get upcoming workouts from workoutSchedule and trainingPlan
    const schedule = [];
    try { schedule.push(...(JSON.parse(localStorage.getItem("workoutSchedule")) || [])); } catch {}
    const plan = [];
    try { plan.push(...(JSON.parse(localStorage.getItem("trainingPlan")) || [])); } catch {}

    const today = getTodayString();
    const upcoming = [
      ...schedule.filter(w => w.date >= today).map(w => ({
        subject: w.sessionName || "IronZ Workout",
        date: w.date,
        duration: w.duration || 60,
        type: w.type || w.discipline || "workout",
      })),
      ...plan.filter(p => p.date >= today).map(p => ({
        subject: p.sessionName || "IronZ Training",
        date: p.date,
        duration: p.duration || 60,
        type: p.discipline || "training",
      })),
    ];

    // Create calendar events
    let synced = 0;
    for (const workout of upcoming.slice(0, 30)) { // Limit to 30 events
      const startTime = `${workout.date}T08:00:00`;
      const endMinutes = workout.duration || 60;
      const endHour = Math.floor(endMinutes / 60) + 8;
      const endMin = endMinutes % 60;
      const endTime = `${workout.date}T${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`;

      const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${state.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: workout.subject,
          body: { contentType: "Text", content: `IronZ ${workout.type} session` },
          start: { dateTime: startTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          end: { dateTime: endTime, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          categories: ["IronZ"],
        }),
      });

      if (response.ok) synced++;
    }

    if (syncStatus) syncStatus.textContent = `Synced ${synced} workouts to Outlook`;
    setTimeout(() => { if (syncStatus) syncStatus.textContent = ""; }, 3000);
  } catch (err) {
    if (syncStatus) syncStatus.textContent = `Error: ${err.message}`;
  }
}

async function importBusyTimes() {
  if (!isCalendarConnected()) return;
  const state = _getCalSyncState();
  const syncStatus = document.getElementById("cal-sync-status-msg");
  if (syncStatus) syncStatus.textContent = "Importing busy times...";

  try {
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 14);

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${today.toISOString()}&endDateTime=${nextWeek.toISOString()}&$select=subject,start,end,showAs&$top=50`,
      { headers: { "Authorization": `Bearer ${state.accessToken}` } }
    );

    if (!response.ok) throw new Error("Failed to fetch calendar");

    const data = await response.json();
    const events = data.value || [];

    // Create restrictions for busy times (9-5 blocks during work hours)
    let restrictions = {};
    try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}

    let imported = 0;
    events.forEach(ev => {
      if (ev.showAs === "busy" || ev.showAs === "tentative") {
        const date = ev.start?.dateTime?.slice(0, 10);
        if (date && !restrictions[date]) {
          restrictions[date] = {
            type: "time",
            note: `Calendar: ${ev.subject || "Busy"}`,
            action: "reduce",
            createdAt: new Date().toISOString(),
          };
          imported++;
        }
      }
    });

    localStorage.setItem("dayRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('dayRestrictions');
    if (typeof renderCalendar === "function") renderCalendar();

    if (syncStatus) syncStatus.textContent = `Imported ${imported} busy day restrictions`;
    setTimeout(() => { if (syncStatus) syncStatus.textContent = ""; }, 3000);
  } catch (err) {
    if (syncStatus) syncStatus.textContent = `Error: ${err.message}`;
  }
}

// ── UI ───────────────────────────────────────────────────────────────────────

function renderCalSyncStatus() {
  const container = document.getElementById("cal-sync-section");
  if (!container) return;

  const connected = isCalendarConnected();
  const state = _getCalSyncState();

  if (connected) {
    container.innerHTML = `
      <div class="cal-sync-connected">
        <div class="cal-sync-badge">${typeof ICONS !== "undefined" ? ICONS.check : ""} Connected to ${state.provider === "outlook" ? "Outlook" : "Calendar"}</div>
        <div class="cal-sync-actions">
          <button class="btn-secondary btn-sm" onclick="syncWorkoutsToCalendar()">Sync Workouts to Calendar</button>
          <button class="btn-secondary btn-sm" onclick="importBusyTimes()">Import Busy Times</button>
          <button class="btn-secondary btn-sm" style="color:var(--color-danger)" onclick="disconnectCalendar()">Disconnect</button>
        </div>
        <div id="cal-sync-status-msg" class="cal-sync-status-msg"></div>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="cal-sync-disconnected">
        <p class="hint" style="margin:0 0 8px">Connect your calendar to sync workouts and import busy times as training restrictions.</p>
        <button class="btn-primary btn-sm" onclick="connectOutlookCalendar()">Connect Outlook Calendar</button>
        <p class="hint" style="margin:8px 0 0;font-size:0.7rem">Requires a Microsoft Azure AD client ID in calendar-sync.js. Google Calendar support coming soon.</p>
        <div id="cal-sync-status-msg" class="cal-sync-status-msg"></div>
      </div>`;
  }
}

// Check for OAuth callback on page load
document.addEventListener("DOMContentLoaded", () => {
  handleOAuthCallback();
  renderCalSyncStatus();
});
