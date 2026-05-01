// db.js — Data service layer
// Supabase-first, localStorage-fallback.
// Write: save to Supabase, then update localStorage cache.
// Read: try Supabase first, fall back to localStorage if offline.
// ─────────────────────────────────────────────────────────────────────────────

const DB = (() => {

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _client() { return window.supabaseClient; }

  async function _userId() {
    try {
      const c = _client();
      if (!c) return null;
      // Race against a 4s timeout so a stuck gotrue-js auth-token lock
      // doesn't strand pending syncs forever. When the lock hangs,
      // _doSyncKey awaits _userId() forever → workouts never upsert
      // → live-tracker finishes don't propagate cross-device. Same
      // pattern config.js _getSessionWithTimeout uses for callAI.
      const result = await Promise.race([
        c.auth.getSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("auth_lock_timeout")), 4000)),
      ]);
      return result?.data?.session?.user?.id || null;
    } catch (e) {
      if (e && e.message === "auth_lock_timeout") {
        console.warn("[DB] _userId getSession hung — sync deferred to next replay");
      }
      return null;
    }
  }

  // Cross-tab write guard.
  //
  // When two tabs in the same browser/profile are signed into different
  // accounts, Supabase's auth token in localStorage is the *last* one
  // written. That means a debounced sync scheduled under user A can fire
  // AFTER tab 2 signs in as B — and _userId() (which reads the Supabase
  // token) will return B. Without a guard, we'd upsert A's cached data
  // under B's user_id and corrupt B's account.
  //
  // `ironz_last_user_id` is stamped synchronously by auth.js
  // handleUserContext() on every sign-in. We treat it as the source of
  // truth for "who this tab thinks it is." Any write where the live
  // Supabase session uid disagrees with this value is unsafe and aborted.
  //
  // Callers that schedule deferred work (syncKey) capture the expected
  // uid at schedule time and pass it to the fire-time check so we also
  // catch the narrower race where the tab's own listener has already
  // updated ironz_last_user_id by the time the timer fires.
  function _expectedUid() {
    try { return localStorage.getItem('ironz_last_user_id'); } catch { return null; }
  }

  function _userContextOk(currentUid, expectedAtSchedule) {
    if (!currentUid) return true; // signed out / offline — no write will hit Supabase anyway
    if (expectedAtSchedule && expectedAtSchedule !== currentUid) return false;
    const expectedNow = _expectedUid();
    if (expectedNow && expectedNow !== currentUid) return false;
    return true;
  }

  async function _isOnline() {
    if (!navigator.onLine) return false;
    try {
      const { error } = await _client().from('profiles').select('id').limit(1).maybeSingle();
      return !error;
    } catch { return false; }
  }

  function _lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function _lsSet(key, data) {
    // Mirror the inverse of _doSyncKey: primitive strings are stored raw in
    // localStorage (that's how setMeasurementSystem/setTheme/etc. write
    // them), so on the way back from Supabase we must NOT re-JSON.stringify
    // — that would turn "imperial" into '"imperial"' and break selects that
    // compare option.value against the raw string.
    try {
      const toStore = (typeof data === 'string') ? data : JSON.stringify(data);
      localStorage.setItem(key, toStore);
    } catch (e) {
      console.warn('DB: localStorage write failed for', key, e);
    }
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  const profile = {
    async get() {
      const uid = await _userId();
      if (uid) {
        try {
          const { data, error } = await _client()
            .from('profiles')
            .select('*')
            .eq('id', uid)
            .maybeSingle();
          if (!error && data) {
            // Map DB column names to app field names (only non-empty values)
            const fromDb = {};
            if (data.full_name) fromDb.name = data.full_name;
            if (data.age) fromDb.age = String(data.age);
            if (data.weight_lbs) fromDb.weight = String(data.weight_lbs);
            if (data.height_inches) fromDb.height = String(data.height_inches);
            if (data.gender) fromDb.gender = data.gender;
            if (data.primary_goal) fromDb.goal = data.primary_goal;
            if (data.birthday) fromDb.birthday = data.birthday;
            if (data.body_comp_goal) fromDb.bodyCompGoal = data.body_comp_goal;
            // Merge: DB values win over localStorage, but don't blank out existing data
            const existing = _lsGet('profile') || {};
            const merged = { ...existing, ...fromDb };
            _lsSet('profile', merged);
            return merged;
          }
        } catch {}
      }
      return _lsGet('profile') || {};
    },

    async save(profileData) {
      const uid = await _userId();
      // Always update localStorage cache
      const merged = { ..._lsGet('profile'), ...profileData };
      _lsSet('profile', merged);

      if (uid) {
        if (!_userContextOk(uid)) {
          console.warn("DB: aborting profile.save — session uid doesn't match expected");
          return;
        }
        try {
          // Map app field names to DB column names. Use the MERGED value
          // for every column, not just profileData — a partial save (e.g.
          // setPoolSize firing with {pool_size}) was previously writing
          // NULL into weight_lbs / age / height_inches / gender because
          // profileData didn't carry them. That meant a later fresh-
          // device login pulled NULLs from the DB and the user saw an
          // empty Athlete Profile form. Always prefer the merged value
          // so a partial save never blows away an existing column.
          const row = {
            id: uid,
            full_name:     merged.name   || null,
            age:           merged.age    ? parseInt(merged.age)            : null,
            weight_lbs:    merged.weight ? parseFloat(merged.weight)       : null,
            height_inches: merged.height ? parseInt(merged.height)         : null,
            gender:        merged.gender || null,
            primary_goal:  merged.goal   || null,
            // birthday stored as ISO YYYY-MM-DD text (see migration
            // 20260430e). Empty string normalized to null so Postgres
            // doesn't trip on a non-date input.
            birthday:        merged.birthday      || null,
            body_comp_goal:  merged.bodyCompGoal  || null,
            updated_at: new Date().toISOString(),
          };
          const { error } = await _client()
            .from('profiles')
            .upsert(row, { onConflict: 'id' });
          if (error) console.warn('DB: profile save error', error.message);
        } catch (e) { console.warn('DB: profile save offline', e); }
      }
    }
  };

  // ── Generic user-data CRUD ────────────────────────────────────────────────
  // For tables with user_id column and a localStorage mirror.

  function _userTable(table, lsKey) {
    return {
      async list(opts = {}) {
        const uid = await _userId();
        if (uid) {
          try {
            let q = _client().from(table).select('*').eq('user_id', uid);
            if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.asc ?? true });
            const { data, error } = await q;
            if (!error && data) {
              // Merge the 'data' JSONB column back into the top-level object
              var restored = data.map(function(row) {
                if (row.data && typeof row.data === 'object') {
                  var merged = Object.assign({}, row.data, row);
                  delete merged.data;
                  return merged;
                }
                return row;
              });
              // Only overwrite localStorage if Supabase has data
              // If Supabase is empty but localStorage has data, keep localStorage (offline-first)
              var local = _lsGet(lsKey) || [];
              if (restored.length > 0) {
                // Merge: keep local items not in Supabase, add Supabase items
                var remoteIds = {};
                restored.forEach(function(r) { if (r.id) remoteIds[r.id] = true; });
                var localOnly = local.filter(function(l) { return l.id && !remoteIds[l.id]; });
                var merged = restored.concat(localOnly);
                _lsSet(lsKey, merged);
                return merged;
              } else if (local.length > 0) {
                // Supabase empty, localStorage has data — keep local, re-sync up
                console.log('DB: ' + lsKey + ' — Supabase empty but localStorage has ' + local.length + ' items, keeping local');
                return local;
              }
              _lsSet(lsKey, restored);
              return restored;
            }
          } catch {}
        }
        return _lsGet(lsKey) || [];
      },

      async get(id) {
        const uid = await _userId();
        if (uid) {
          try {
            const { data, error } = await _client()
              .from(table).select('*').eq('id', id).eq('user_id', uid).maybeSingle();
            if (!error && data) return data;
          } catch {}
        }
        // Fallback: search localStorage array
        const all = _lsGet(lsKey) || [];
        return all.find(r => r.id === id) || null;
      },

      async save(record) {
        const uid = await _userId();
        const row = { ...record, user_id: uid };
        if (!row.id) row.id = crypto.randomUUID();

        // Update localStorage cache
        const all = _lsGet(lsKey) || [];
        const idx = all.findIndex(r => r.id === row.id);
        if (idx >= 0) all[idx] = row; else all.push(row);
        _lsSet(lsKey, all);

        if (uid) {
          if (!_userContextOk(uid)) {
            console.warn(`DB: aborting ${table}.save — session uid doesn't match expected`);
            return row;
          }
          try {
            const { error } = await _client()
              .from(table).upsert(row, { onConflict: 'id' });
            if (error) console.warn(`DB: ${table} save error`, error.message);
          } catch (e) { console.warn(`DB: ${table} save offline`, e); }
        }
        return row;
      },

      async saveBatch(records) {
        const uid = await _userId();
        const rows = records.map(r => {
          const row = { ...r, user_id: uid };
          if (!row.id) row.id = crypto.randomUUID();
          return row;
        });

        // Update localStorage cache
        const all = _lsGet(lsKey) || [];
        for (const row of rows) {
          const idx = all.findIndex(r => r.id === row.id);
          if (idx >= 0) all[idx] = row; else all.push(row);
        }
        _lsSet(lsKey, all);

        if (uid) {
          if (!_userContextOk(uid)) {
            console.warn(`DB: aborting ${table}.saveBatch — session uid doesn't match expected`);
            return rows;
          }
          try {
            const { error } = await _client()
              .from(table).upsert(rows, { onConflict: 'id' });
            if (error) console.warn(`DB: ${table} saveBatch error`, error.message);
          } catch (e) { console.warn(`DB: ${table} saveBatch offline`, e); }
        }
        return rows;
      },

      async remove(id) {
        // Update localStorage cache
        const all = _lsGet(lsKey) || [];
        _lsSet(lsKey, all.filter(r => r.id !== id));

        const uid = await _userId();
        if (uid) {
          if (!_userContextOk(uid)) {
            console.warn(`DB: aborting ${table}.remove — session uid doesn't match expected`);
            return;
          }
          try {
            const { error } = await _client()
              .from(table).delete().eq('id', id).eq('user_id', uid);
            if (error) console.warn(`DB: ${table} remove error`, error.message);
          } catch (e) { console.warn(`DB: ${table} remove offline`, e); }
        }
      },

      async removeAll() {
        _lsSet(lsKey, []);
        const uid = await _userId();
        if (uid) {
          if (!_userContextOk(uid)) {
            console.warn(`DB: aborting ${table}.removeAll — session uid doesn't match expected`);
            return;
          }
          try {
            const { error } = await _client()
              .from(table).delete().eq('user_id', uid);
            if (error) console.warn(`DB: ${table} removeAll error`, error.message);
          } catch (e) { console.warn(`DB: ${table} removeAll offline`, e); }
        }
      }
    };
  }

  // ── Reference tables (read-only for users) ────────────────────────────────
  // Both philosophy_modules and exercise_library use 'id' (text) as primary key.

  function _refTable(table, lsKey) {
    return {
      async get(id) {
        try {
          const { data, error } = await _client()
            .from(table).select('*').eq('id', id).maybeSingle();
          if (!error && data) {
            const cache = _lsGet(lsKey) || {};
            cache[id] = data;
            _lsSet(lsKey, cache);
            return data;
          }
        } catch {}
        const cache = _lsGet(lsKey) || {};
        return cache[id] || null;
      },

      async getByCategory(category) {
        try {
          const { data, error } = await _client()
            .from(table).select('*').eq('category', category);
          if (!error && data) {
            const cache = _lsGet(lsKey) || {};
            data.forEach(row => { cache[row.id] = row; });
            _lsSet(lsKey, cache);
            return data;
          }
        } catch {}
        const cache = _lsGet(lsKey) || {};
        return Object.values(cache).filter(r => r.category === category);
      },

      async getAll() {
        try {
          const { data, error } = await _client().from(table).select('*');
          if (!error && data) {
            const cache = {};
            data.forEach(row => { cache[row.id] = row; });
            _lsSet(lsKey, cache);
            return data;
          }
        } catch {}
        const cache = _lsGet(lsKey) || {};
        return Object.values(cache);
      }
    };
  }

  // ── Philosophy gaps (write from client, admin reads) ──────────────────────

  const philosophyGaps = {
    async log(dimension, value, userProfile) {
      try {
        // Try to increment existing gap
        const { data: existing } = await _client()
          .from('philosophy_gaps').select('id, user_count, sample_user_profiles')
          .eq('dimension', dimension).eq('value', value).maybeSingle();

        if (existing) {
          const samples = existing.sample_user_profiles || [];
          if (samples.length < 10 && userProfile) samples.push(userProfile);
          await _client().from('philosophy_gaps').update({
            user_count: existing.user_count + 1,
            sample_user_profiles: samples,
            last_seen: new Date().toISOString()
          }).eq('id', existing.id);
        } else {
          await _client().from('philosophy_gaps').insert({
            dimension,
            value,
            user_count: 1,
            sample_user_profiles: userProfile ? [userProfile] : [],
          });
        }
      } catch (e) { console.warn('DB: philosophy gap log error', e); }
    }
  };

  // ── Generated plans ───────────────────────────────────────────────────────

  const generatedPlans = _userTable('generated_plans', 'generatedPlans');

  // ── User outcomes ─────────────────────────────────────────────────────────

  const userOutcomes = _userTable('user_outcomes', 'userOutcomes');

  // ── Generic key-value sync (user_data table) ──────────────────────────────
  // For all remaining localStorage keys that need cross-device sync.

  // Keys that should sync to Supabase via user_data table
  const SYNCED_KEYS = [
    // Core data — MUST sync for cross-device
    'workouts', 'workoutSchedule', 'trainingPlan', 'events',
    'profile', 'meals', 'goals',
    // Training state
    'dayRestrictions', 'completedSessions', 'workoutRatings',
    'importedPlans', 'personalRecords', 'nutritionAdjustments',
    'foodPreferences', 'equipmentRestrictions', 'trainingZones',
    'trainingZonesHistory', 'trainingPreferences', 'trainingNotes',
    'gear_checklists_v1',
    // Nutrition & hydration
    'hydrationLog', 'hydrationSettings', 'hydrationDailyTargetOz',
    'savedMealPlans', 'currentWeekMealPlan', 'fuelingPrefs',
    // App state & preferences
    'checkinHistory', 'fitnessGoals', 'yogaTypes',
    'completedChallenges', 'activeChallenges', 'userSharedWorkouts',
    'measurementSystem', 'gymStrengthEnabled',
    'nutritionEnabled', 'hydrationEnabled', 'fuelingEnabled',
    'workoutEffortFeedback', 'calibrationSignals',
    'hasOnboarded', 'surveyComplete', 'onboardingData',
    // Plan management
    'activePlan', 'activePlanAt', 'activePlanSource', 'activePlanId',
    'currentRecoveryState', 'latestCheckIn',
    // Preferences
    'notifSettings', 'theme', 'userLevel', 'coachingDismissed',
    'coachingInsightsEnabled', 'fuelingEnabled', 'addSessionWarningsDisabled',
    // Onboarding v2 / Build Plan inputs (spec §5.1)
    // These capture the user's answers from the onboarding survey and
    // the standalone Build Plan flow. They feed generateTrainingPlan()
    // and are preserved across sessions so the Build Plan screens can
    // pre-fill on subsequent use.
    'selectedSports', 'trainingGoals', 'raceEvents', 'thresholds',
    'strengthSetup', 'injuries', 'connectedApps',
    // Exercise Database equipment profile (EXERCISE_DB_SPEC.md). Drives
    // which exercises ExerciseDB.query({ equipment }) returns for the
    // planner + workout builders.
    'equipmentProfile',
    // Stacked-Day gamification (stack.js). History is the source of
    // truth for the streak; celebratedFor gates the per-day animation
    // so it doesn't double-fire when a second device finishes the
    // pillars at roughly the same time.
    'stackedDayHistory', 'stackCelebratedFor',
  ];

  const _keyTimers = {};

  // Critical keys sync immediately (no debounce) so cross-device sync is fast.
  // completedSessions is in this set because a user who completes a session
  // and refreshes within the 2s debounce window gets their completion wiped
  // by refreshAllKeys() pulling the stale (uncompleted) row from Supabase.
  // workoutRatings hits the same race whenever the user rates and reloads.
  const _IMMEDIATE_SYNC_KEYS = new Set([
    'workoutSchedule', 'workouts', 'trainingPlan', 'events', 'meals',
    'completedSessions', 'workoutRatings', 'coachingDismissed',
    'ironz_saved_workouts_v1', 'ironz_saved_workouts_pending_delete_v1',
    // Stacked-Day: history must propagate fast so the second device
    // sees the streak increment without waiting for the 2s debounce.
    // celebratedFor is in here too so device A firing the celebration
    // suppresses device B's redundant fire on the next focus refresh.
    'stackedDayHistory', 'stackCelebratedFor',
    // Thresholds / 1RMs / CSS / FTP / VDOT — these drive pacing across
    // the generators, so losing the most recent edit to a refresh race
    // produces workouts that disagree with the values the user just
    // typed in. profile goes in the immediate set for the same reason:
    // saveTrainingZonesData mirrors per-sport "*Updated" timestamps
    // onto the profile and the reminder banner reads those.
    'trainingZones', 'trainingZonesHistory', 'profile',
  ]);

  // ── Pending-sync queue ────────────────────────────────────────────────────
  //
  // Debounced syncs have a fatal failure mode: the user edits, schedules a
  // 200ms setTimeout, and refreshes within the window → the timer is killed
  // before the upsert runs, and refreshAllKeys on the next load pulls the
  // stale remote row over the user's actual change. The user sees their
  // delete/add silently revert.
  //
  // We fix it by persisting "this key has unsynced changes" to localStorage
  // so the intent survives a reload. On next load, replayPendingSyncs()
  // upserts everything in the queue BEFORE refreshAllKeys runs, so the
  // remote pull sees the user's most recent writes.
  //
  // Value stored: `{ [lsKey]: { scheduledAt: iso, expectedUid: string }`.
  // We don't store the value itself — _doSyncKey reads the current
  // localStorage value at send time, which is always the freshest one.

  const _PENDING_QUEUE_KEY = 'ironz_pending_sync_queue';

  function _loadPendingQueue() {
    try {
      const raw = localStorage.getItem(_PENDING_QUEUE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch { return {}; }
  }
  function _savePendingQueue(q) {
    try { localStorage.setItem(_PENDING_QUEUE_KEY, JSON.stringify(q)); } catch {}
  }
  function _markPending(lsKey, expectedUid) {
    const q = _loadPendingQueue();
    q[lsKey] = { scheduledAt: new Date().toISOString(), expectedUid: expectedUid || null };
    _savePendingQueue(q);
  }
  function _clearPending(lsKey) {
    const q = _loadPendingQueue();
    if (q[lsKey]) {
      delete q[lsKey];
      _savePendingQueue(q);
    }
  }

  async function _doSyncKey(lsKey, expectedAtSchedule) {
    const uid = await _userId();
    if (!uid) return;
    if (!_userContextOk(uid, expectedAtSchedule)) {
      console.warn(`DB: aborting syncKey(${lsKey}) — user context changed (expected=${expectedAtSchedule}, current=${uid})`);
      return;
    }
    const raw = localStorage.getItem(lsKey);
    if (raw === null) { _clearPending(lsKey); return; }
    let val;
    try { val = JSON.parse(raw); } catch { val = raw; }
    try {
      const { error } = await _client()
        .from('user_data')
        .upsert({
          user_id: uid,
          data_key: lsKey,
          data_value: val,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,data_key' });
      if (error) {
        console.warn(`DB: syncKey ${lsKey} error`, error.message);
        return; // leave pending entry — retry on next load
      }
      _clearPending(lsKey);
    } catch (e) {
      console.warn(`DB: syncKey ${lsKey} offline`, e);
      // leave pending entry — replay will retry
    }
  }

  function syncKey(lsKey) {
    clearTimeout(_keyTimers[lsKey]);
    // Capture the user id at schedule time so a user switch during the
    // debounce window can't silently upsert our data under the new user.
    const expectedAtSchedule = _expectedUid();
    // Mark the key as dirty NOW — survives page reload even if the timer
    // below never fires.
    _markPending(lsKey, expectedAtSchedule);
    // Critical keys fire immediately; others debounce 2s to batch rapid writes
    const delay = _IMMEDIATE_SYNC_KEYS.has(lsKey) ? 200 : 2000;
    _keyTimers[lsKey] = setTimeout(() => _doSyncKey(lsKey, expectedAtSchedule), delay);
  }

  // Force-flush a pending debounced sync and await the Supabase upsert.
  // Callers that need a strong write guarantee — e.g. the Training Zones
  // save buttons, where losing a CSS/FTP edit to a refresh race breaks
  // plan generation — can `await DB.flushKey('trainingZones')` after
  // they write to localStorage.
  async function flushKey(lsKey) {
    if (_keyTimers[lsKey]) {
      clearTimeout(_keyTimers[lsKey]);
      delete _keyTimers[lsKey];
    }
    try { await _doSyncKey(lsKey, _expectedUid()); } catch {}
  }

  // Replay any pending syncs from the queue. Called by auth.js on every
  // session init BEFORE refreshAllKeys — so the user's unsynced writes
  // are upserted to Supabase first, and the subsequent remote pull sees
  // the up-to-date state (instead of overwriting local with stale).
  async function replayPendingSyncs() {
    const q = _loadPendingQueue();
    const keys = Object.keys(q);
    if (!keys.length) return;
    const currentUid = await _userId();
    if (!currentUid) return;
    for (const lsKey of keys) {
      const entry = q[lsKey];
      // Cross-user safety: if the queued write was scheduled under a
      // different uid than the current session, drop it. Writing another
      // user's cached value under this user's id would corrupt data.
      if (entry && entry.expectedUid && entry.expectedUid !== currentUid) {
        _clearPending(lsKey);
        continue;
      }
      try { await _doSyncKey(lsKey, currentUid); } catch {}
    }
  }


  // ── User isolation — wipe local cache on sign-out / user switch ──────────
  //
  // localStorage is a DEVICE cache. When a different user signs in on the
  // same device — or the current user signs out — every per-user key must
  // be cleared, otherwise the next signed-in user sees stale data and
  // (much worse) the app's sync paths will upsert that stale data under
  // the NEW user's id, permanently corrupting their account.
  //
  // Instead of enumerating every per-user key (guaranteed to drift as
  // features are added), we wipe everything EXCEPT an explicit allowlist
  // of global keys + Supabase's own auth-token keys (prefixed "sb-").

  const PRESERVE_ON_USER_SWITCH = new Set([
    // Reference-data caches — same for every user, safe to keep
    'philosophy_modules_cache',
    'philosophy_modules_cache_at',
    'exerciseLibrary_cache',
    // Global analytics / diagnostics — not user-scoped
    'philosophy_gaps',
    'ironz_debug',
  ]);

  function clearLocalUserData() {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (PRESERVE_ON_USER_SWITCH.has(k)) continue;
      // Leave Supabase's own auth storage alone — wiping it kills the session
      if (k.startsWith('sb-') || k.startsWith('supabase.')) continue;
      toRemove.push(k);
    }
    for (const k of toRemove) {
      try { localStorage.removeItem(k); } catch {}
    }
    console.log(`DB: cleared ${toRemove.length} local keys on user switch`);
  }

  // Detect a user switch (or first-ever sign-in) by comparing the current
  // session's user id against the one stamped into localStorage by the
  // previous signed-in session. If they differ, wipe first — otherwise the
  // new user inherits the previous user's cached data.
  //
  // Called from auth.js before migrateLocalStorage / refreshAllKeys.
  function handleUserContext(currentUid) {
    if (!currentUid) return;
    const prev = localStorage.getItem('ironz_last_user_id');
    if (prev && prev !== currentUid) {
      console.warn(`DB: user switch detected (${prev} → ${currentUid}) — clearing local cache`);
      clearLocalUserData();
    }
    try { localStorage.setItem('ironz_last_user_id', currentUid); } catch {}
  }

  // Pull all user_data rows from Supabase and populate localStorage cache
  async function refreshAllKeys() {
    const uid = await _userId();
    if (!uid) return;
    try {
      const { data, error } = await _client()
        .from('user_data')
        .select('data_key, data_value')
        .eq('user_id', uid);
      if (error || !data) return;
      for (const row of data) {
        _lsSet(row.data_key, row.data_value);
      }
    } catch {}
  }

  // Single-key refresh — pulls one user_data row and writes it to
  // localStorage. Used by surfaces that want to show fresh values
  // when the tab regains focus (hydration, etc.) without re-pulling
  // every key the way refreshAllKeys does.
  async function refreshKey(lsKey) {
    const uid = await _userId();
    if (!uid) return false;
    try {
      const { data, error } = await _client()
        .from('user_data')
        .select('data_value')
        .eq('user_id', uid)
        .eq('data_key', lsKey)
        .maybeSingle();
      if (error || !data) return false;
      _lsSet(lsKey, data.data_value);
      return true;
    } catch { return false; }
  }

  // ── Instantiate table accessors ───────────────────────────────────────────
  //
  // Active training plans live in `generated_plans`, NOT `training_plans`.
  // The `training_plans` table exists in supabase-schema.sql but was never
  // wired to the app — the real plan store is `generated_plans` (defined
  // in supabase-migration-002-fix.sql) which is read/written by
  // philosophy-planner.js storeGeneratedPlan / getActivePlan.
  // See docs/TRAINING_PLAN_STORAGE.md for the full story.

  const workouts         = _userTable('workouts', 'workouts');
  const workoutExercises = _userTable('workout_exercises', 'workoutExercises');
  const workoutSegments  = _userTable('workout_segments', 'workoutSegments');
  const trainingSessions = _userTable('training_sessions', 'workoutSchedule');
  const planAdherence    = _userTable('plan_adherence', 'planAdherence');
  const weeklyCheckins   = _userTable('weekly_checkins', 'weeklyCheckins');
  const goals            = _userTable('goals', 'goals');
  const raceEvents       = _userTable('race_events', 'events');
  // meals synced via user_data table (DB.syncKey('meals'))

  const philosophyModules = _refTable('philosophy_modules', '_cache_philosophy');
  const exerciseLibrary   = _refTable('exercise_library', '_cache_exercises');

  // ── One-time migration ────────────────────────────────────────────────────
  // Pushes existing localStorage data up to Supabase on first login.
  // Sets 'supabase_migrated' flag so it only runs once.
  // Does NOT delete localStorage data — it remains as offline cache.

  async function migrateLocalStorage() {
    // v2: re-migrate to push all data to user_data table (source of truth)
    if (localStorage.getItem('supabase_migrated_v2') === 'true') return;

    const uid = await _userId();
    if (!uid) return;

    console.log('DB: Starting one-time localStorage → Supabase migration');

    const migrations = [
      { lsKey: 'profile', handler: _migrateProfile },
      { lsKey: 'workouts', table: 'workouts', shape: _shapeWorkout },
      { lsKey: 'workoutSchedule', table: 'training_sessions', shape: _shapeTrainingSession },
      // trainingPlan (the daily-sessions array) is synced through the
      // generic user_data key-value table, not training_plans. The
      // philosophy-generated plan metadata lives in generated_plans
      // and is written by philosophy-planner.js storeGeneratedPlan.
      { lsKey: 'events', table: 'race_events', shape: _shapeRaceEvent },
      { lsKey: 'goals', table: 'goals', shape: _shapeGoal },
      { lsKey: 'weeklyCheckins', table: 'weekly_checkins', shape: _shapeWeeklyCheckin },
    ];

    let errorCount = 0;

    for (const m of migrations) {
      try {
        if (m.handler) {
          await m.handler(uid);
          continue;
        }
        const raw = _lsGet(m.lsKey);
        if (!raw) continue;

        const arr = Array.isArray(raw) ? raw : [raw];
        if (arr.length === 0) continue;

        const rows = arr.map(item => m.shape(item, uid)).filter(Boolean);
        if (rows.length === 0) continue;

        // Batch upsert in chunks of 100
        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100);
          const { error } = await _client()
            .from(m.table).upsert(chunk, { onConflict: 'id', ignoreDuplicates: true });
          if (error) {
            console.warn(`DB: migrate ${m.lsKey} error`, error.message);
            errorCount++;
          }
        }
        console.log(`DB: migrated ${m.lsKey} (${rows.length} rows)`);
      } catch (e) {
        console.warn(`DB: migrate ${m.lsKey} exception`, e);
        errorCount++;
      }
    }

    // Migrate all generic SYNCED_KEYS to user_data table
    for (const key of SYNCED_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      let val;
      try { val = JSON.parse(raw); } catch { val = raw; }
      try {
        const { error } = await _client()
          .from('user_data')
          .upsert({
            user_id: uid,
            data_key: key,
            data_value: val,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,data_key' });
        if (error) {
          console.warn(`DB: migrate key ${key} error`, error.message);
          errorCount++;
        } else {
          console.log(`DB: migrated key ${key}`);
        }
      } catch (e) {
        console.warn(`DB: migrate key ${key} exception`, e);
        errorCount++;
      }
    }

    if (errorCount === 0) {
      localStorage.setItem('supabase_migrated', 'true');
      localStorage.setItem('supabase_migrated_v2', 'true');
      console.log('DB: Migration complete');
    } else {
      console.warn(`DB: Migration had ${errorCount} errors — will retry next login`);
    }
  }

  // ── Shape functions: localStorage format → Supabase row ───────────────────

  async function _migrateProfile(uid) {
    const raw = _lsGet('profile');
    if (!raw) return;
    const row = {
      id: uid,
      age: raw.age || null,
      weight_lbs: raw.weight || raw.weight_lbs || null,
      height_inches: raw.height || raw.height_inches || null,
      gender: raw.gender || null,
      primary_goal: raw.goal || raw.primary_goal || null,
      fitness_level: raw.fitnessLevel || raw.fitness_level || null,
      measurement_system: raw.measurementSystem || raw.measurement_system || 'imperial',
      updated_at: new Date().toISOString()
    };
    const { error } = await _client()
      .from('profiles').upsert(row, { onConflict: 'id' });
    if (error) console.warn('DB: migrate profile error', error.message);
    else console.log('DB: migrated profile');
  }

  function _isUUID(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  }

  function _shapeWorkout(w, uid) {
    // Store the full workout object in a JSONB 'data' column
    // This preserves aiSession, exercises, segments, generatedSession, hiitMeta, supersetIds, etc.
    var fullData = {};
    var skipKeys = { user_id: 1, id: 1, date: 1, name: 1, type: 1, notes: 1, duration_minutes: 1, avg_watts: 1, source: 1, completed: 1, created_at: 1, plan_session_id: 1, data: 1 };
    for (var k in w) {
      if (w.hasOwnProperty(k) && !skipKeys[k]) fullData[k] = w[k];
    }
    // Coerce numeric columns to integer — Postgres `duration_minutes`
    // and `avg_watts` are typed `integer` and reject floats like
    // "41.5" with "invalid input syntax for type integer". Local
    // workout records store these as raw form-input strings ("41.5")
    // and parsed numbers, so we round at write time.
    var _toInt = function (v) {
      if (v === null || v === undefined || v === '') return null;
      var n = parseFloat(v);
      return Number.isFinite(n) ? Math.round(n) : null;
    };
    var row = {
      id: (_isUUID(w.id) ? w.id : null) || crypto.randomUUID(),
      user_id: uid,
      date: w.date || null,
      name: w.name || w.type || null,
      type: w.type || 'general',
      notes: w.notes || null,
      duration_minutes: _toInt(w.duration || w.duration_minutes),
      avg_watts: _toInt(w.avgWatts || w.avg_watts),
      source: w.source || 'manual',
      completed: w.completed !== false,
      created_at: w.createdAt || w.created_at || new Date().toISOString()
    };
    // Only include data column if there's extra data to store
    if (Object.keys(fullData).length > 0) row.data = fullData;
    return row;
  }

  function _shapeTrainingSession(s, uid) {
    var extraData = {};
    var skipKeys = { id:1, plan_id:1, planId:1, user_id:1, date:1, scheduled_date:1, week:1, week_number:1, dayOfWeek:1, day_of_week:1, type:1, session_type:1, name:1, session_name:1, description:1, desc:1, exercises:1, status:1, created_at:1, createdAt:1, data:1 };
    for (var k in s) {
      if (s.hasOwnProperty(k) && !skipKeys[k]) extraData[k] = s[k];
    }
    // Build Plan v2 / Custom Plan use string planIds like "ob-v2-<ts>" or
    // "custom-<ts>" which aren't UUIDs, so Supabase rejects them against
    // the uuid-typed plan_id column. Stash the raw string in data.planId
    // and null out the typed column so the insert succeeds either way.
    var rawPlanId = s.planId || s.plan_id || null;
    var planIdTyped = _isUUID(rawPlanId) ? rawPlanId : null;
    if (rawPlanId && !planIdTyped) extraData.planId = rawPlanId;
    var row = {
      id: (_isUUID(s.id) ? s.id : null) || crypto.randomUUID(),
      plan_id: planIdTyped,
      user_id: uid,
      scheduled_date: s.date || s.scheduled_date || null,
      week_number: s.week || s.week_number || null,
      day_of_week: s.dayOfWeek || s.day_of_week || null,
      session_type: s.type || s.session_type || null,
      session_name: s.name || s.session_name || null,
      description: s.description || s.desc || null,
      exercises: s.exercises || null,
      status: s.status || 'scheduled',
      created_at: s.createdAt || s.created_at || new Date().toISOString()
    };
    if (Object.keys(extraData).length > 0) row.data = extraData;
    return row;
  }

  // _shapeTrainingPlan was removed (commit: training plan storage
  // cleanup, 2026-04-15). It used to shape a local plan object into
  // the `training_plans` table's column layout, but nothing ever
  // called it — the real active-plan store is `generated_plans` with
  // a completely different schema (plan_data jsonb + philosophy
  // module ids + generation_source). See docs/TRAINING_PLAN_STORAGE.md.

  // Meals are synced via user_data table (syncKey('meals')), not a dedicated table.

  function _shapeRaceEvent(e, uid) {
    return {
      id: (_isUUID(e.id) ? e.id : null) || crypto.randomUUID(),
      user_id: uid,
      name: e.name || e.raceName || '',
      type: e.type || e.raceType || null,
      race_date: e.date || e.raceDate || e.race_date || null,
      distance: e.distance || null,
      distance_unit: e.distanceUnit || e.distance_unit || null,
      goal_time: e.goalTime || e.goal_time || null,
      notes: e.notes || null,
      created_at: e.createdAt || e.created_at || new Date().toISOString()
    };
  }

  function _shapeGoal(g, uid) {
    return {
      id: (_isUUID(g.id) ? g.id : null) || crypto.randomUUID(),
      user_id: uid,
      name: g.name || '',
      type: g.type || null,
      target_value: g.targetValue || g.target_value || null,
      current_value: g.currentValue || g.current_value || null,
      unit: g.unit || null,
      deadline: g.deadline || null,
      is_active: g.isActive !== false,
      created_at: g.createdAt || g.created_at || new Date().toISOString()
    };
  }

  function _shapeWeeklyCheckin(c, uid) {
    return {
      id: (_isUUID(c.id) ? c.id : null) || crypto.randomUUID(),
      user_id: uid,
      week_start_date: c.weekStartDate || c.week_start_date || null,
      energy_level: c.energyLevel || c.energy_level || null,
      soreness_level: c.sorenessLevel || c.soreness_level || null,
      stress_level: c.stressLevel || c.stress_level || null,
      sleep_quality: c.sleepQuality || c.sleep_quality || null,
      sessions_completed: c.sessionsCompleted || c.sessions_completed || null,
      sessions_planned: c.sessionsPlanned || c.sessions_planned || null,
      notes: c.notes || null,
      created_at: c.createdAt || c.created_at || new Date().toISOString()
    };
  }

  // ── Debounced array sync helpers ────────────────────────────────────────
  // For high-frequency localStorage writes (workouts, workoutSchedule, etc.),
  // we debounce the Supabase sync to avoid hammering the API.

  const _syncTimers = {};

  function _debouncedSync(table, lsKey, shapeFn, delay = 2000) {
    clearTimeout(_syncTimers[lsKey]);
    // Capture the user id at schedule time so the fire-time handler can
    // detect a mid-debounce user switch and abort (see _userContextOk).
    const expectedAtSchedule = _expectedUid();
    _syncTimers[lsKey] = setTimeout(async () => {
      const uid = await _userId();
      if (!uid) return;
      if (!_userContextOk(uid, expectedAtSchedule)) {
        console.warn(`DB: aborting debouncedSync(${lsKey}) — user context changed (expected=${expectedAtSchedule}, current=${uid})`);
        return;
      }
      const raw = _lsGet(lsKey);
      // Key never existed — nothing to sync. Distinct from "empty array"
      // which is a meaningful state (user deleted everything).
      if (raw == null) return;
      const arr = Array.isArray(raw) ? raw : [raw];
      const rows = arr.map(item => shapeFn(item, uid)).filter(Boolean);

      try {
        // Empty-array case: user cleared all items locally. Delete every
        // row the user owns in this table so the structured table matches
        // localStorage. Without this, deleted races/workouts resurrect on
        // the next refreshAllTables() pull.
        if (rows.length === 0) {
          const { error } = await _client()
            .from(table).delete().eq('user_id', uid);
          if (error) console.warn(`DB: sync ${lsKey} delete-all error`, error.message);
          return;
        }

        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100);
          const { error } = await _client()
            .from(table).upsert(chunk, { onConflict: 'id' });
          if (error) console.warn(`DB: sync ${lsKey} error`, error.message);
        }

        // Purge stale rows: anything that exists in Supabase for this
        // user but NOT in the current local survivor set. Without this,
        // a single-item delete only upserts the remaining items and the
        // removed row lingers in the table — then refreshAllTables()
        // pulls it back on next reload and the deleted item reappears.
        try {
          const { data: remote, error: fetchErr } = await _client()
            .from(table).select('id').eq('user_id', uid);
          if (fetchErr) {
            console.warn(`DB: sync ${lsKey} purge-fetch error`, fetchErr.message);
          } else if (remote && remote.length) {
            const localIds = new Set(rows.map(r => r.id).filter(Boolean));
            const stale = remote.map(r => r.id).filter(id => id && !localIds.has(id));
            if (stale.length) {
              const { error: delErr } = await _client()
                .from(table).delete().eq('user_id', uid).in('id', stale);
              if (delErr) console.warn(`DB: sync ${lsKey} purge-delete error`, delErr.message);
            }
          }
        } catch (e) {
          console.warn(`DB: sync ${lsKey} purge exception`, e);
        }
      } catch (e) { console.warn(`DB: sync ${lsKey} offline`, e); }
    }, delay);
  }

  function syncWorkouts() {
    // Primary: sync full data via user_data (preserves all fields)
    syncKey('workouts');
    // Secondary: also push to structured table for analytics (may lose some fields, but that's OK)
    _debouncedSync('workouts', 'workouts', _shapeWorkout);
  }

  function syncSchedule() {
    syncKey('workoutSchedule');
    _debouncedSync('training_sessions', 'workoutSchedule', _shapeTrainingSession);
  }

  function syncTrainingPlan() {
    // `trainingPlan` is the daily-sessions array consumed by the calendar.
    // It is intentionally synced through the generic user_data key-value
    // table, not through the (unused) training_plans table and not
    // through generated_plans — those store plan METADATA, this is just
    // the per-day session list.
    syncKey('trainingPlan');
  }

  function syncEvents() {
    syncKey('events');
    _debouncedSync('race_events', 'events', _shapeRaceEvent);
  }

  function syncGoals() {
    syncKey('goals');
    _debouncedSync('goals', 'goals', _shapeGoal);
  }

  // ── Pull all structured tables from Supabase → localStorage ──────────────
  // Called on login to ensure a new device has all the user's data.

  async function refreshAllTables() {
    const uid = await _userId();
    if (!uid) return;
    console.log('DB: Pulling all data from Supabase (user_data is source of truth)');

    // PRIMARY: Pull all user_data keys — this is the source of truth for all app state
    await refreshAllKeys();

    // SECONDARY: Pull structured tables only for keys NOT already populated by user_data
    // These are fallbacks for data that predates the user_data sync
    const fallbackTables = [
      { accessor: raceEvents, name: 'race_events', lsKey: 'events' },
      { accessor: goals, name: 'goals', lsKey: 'goals' },
      { accessor: weeklyCheckins, name: 'weekly_checkins', lsKey: 'weeklyCheckins' },
    ];
    const results = await Promise.allSettled(
      fallbackTables.map(t => {
        // Only pull from structured table if user_data doesn't already own
        // this key. A value of `[]` is a meaningful "user deleted everything"
        // state — we must respect it, not treat it as "empty, go refetch".
        // Previously we checked `length > 0` here, which resurrected deleted
        // races/goals on every reload.
        var existing = _lsGet(t.lsKey);
        if (Array.isArray(existing)) {
          console.log('DB: ' + t.name + ' — user_data owns this key (' + existing.length + ' items), skipping table pull');
          return Promise.resolve();
        }
        return t.accessor.list().then(function(data) {
          console.log('DB: pulled ' + t.name + ' (fallback, ' + (data?.length || 0) + ' rows)');
        });
      })
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.warn('DB: pull ' + fallbackTables[i].name + ' failed', r.reason);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    profile,
    workouts,
    workoutExercises,
    workoutSegments,
    trainingSessions,
    planAdherence,
    weeklyCheckins,
    goals,
    raceEvents,
    philosophyModules,
    exerciseLibrary,
    philosophyGaps,
    // The real active-plan store. See docs/TRAINING_PLAN_STORAGE.md.
    generatedPlans,
    userOutcomes,
    syncWorkouts,
    syncSchedule,
    syncTrainingPlan,
    syncEvents,
    syncGoals,
    syncKey,
    flushKey,
    replayPendingSyncs,
    refreshAllKeys,
    refreshKey,
    refreshAllTables,
    SYNCED_KEYS,
    migrateLocalStorage,
    clearLocalUserData,
    handleUserContext,
    _isOnline,
    _userId,
  };

})();
