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
      const { data: { session } } = await c.auth.getSession();
      return session?.user?.id || null;
    } catch { return null; }
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
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {
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
        try {
          // Map app field names to DB column names
          const row = {
            id: uid,
            full_name: profileData.name || merged.name || null,
            age: profileData.age ? parseInt(profileData.age) : null,
            weight_lbs: profileData.weight ? parseFloat(profileData.weight) : null,
            height_inches: profileData.height ? parseInt(profileData.height) : null,
            gender: profileData.gender || null,
            primary_goal: profileData.goal || merged.goal || null,
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
    // Onboarding v2 / Build Plan inputs (spec §5.1)
    // These capture the user's answers from the onboarding survey and
    // the standalone Build Plan flow. They feed generateTrainingPlan()
    // and are preserved across sessions so the Build Plan screens can
    // pre-fill on subsequent use.
    'selectedSports', 'trainingGoals', 'raceEvents', 'thresholds',
    'strengthSetup', 'injuries', 'connectedApps',
  ];

  const _keyTimers = {};

  // Critical keys sync immediately (no debounce) so cross-device sync is fast.
  const _IMMEDIATE_SYNC_KEYS = new Set(['workoutSchedule', 'workouts', 'trainingPlan', 'events', 'meals']);

  async function _doSyncKey(lsKey) {
    const uid = await _userId();
    if (!uid) return;
    const raw = localStorage.getItem(lsKey);
    if (raw === null) return;
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
      if (error) console.warn(`DB: syncKey ${lsKey} error`, error.message);
    } catch (e) { console.warn(`DB: syncKey ${lsKey} offline`, e); }
  }

  function syncKey(lsKey) {
    clearTimeout(_keyTimers[lsKey]);
    // Critical keys fire immediately; others debounce 2s to batch rapid writes
    const delay = _IMMEDIATE_SYNC_KEYS.has(lsKey) ? 200 : 2000;
    _keyTimers[lsKey] = setTimeout(() => _doSyncKey(lsKey), delay);
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
    var row = {
      id: (_isUUID(w.id) ? w.id : null) || crypto.randomUUID(),
      user_id: uid,
      date: w.date || null,
      name: w.name || w.type || null,
      type: w.type || 'general',
      notes: w.notes || null,
      duration_minutes: w.duration || w.duration_minutes || null,
      avg_watts: w.avgWatts || w.avg_watts || null,
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
    var row = {
      id: (_isUUID(s.id) ? s.id : null) || crypto.randomUUID(),
      plan_id: s.planId || s.plan_id || null,
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
    _syncTimers[lsKey] = setTimeout(async () => {
      const uid = await _userId();
      if (!uid) return;
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
    refreshAllKeys,
    refreshAllTables,
    SYNCED_KEYS,
    migrateLocalStorage,
    clearLocalUserData,
    handleUserContext,
    _isOnline,
    _userId,
  };

})();
