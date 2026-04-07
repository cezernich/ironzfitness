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
            _lsSet('profile', data);
            return data;
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
          const row = { ...profileData, id: uid, updated_at: new Date().toISOString() };
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
              _lsSet(lsKey, data);
              return data;
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
    'meals', 'savedWorkouts', 'dayRestrictions', 'completedSessions',
    'workoutRatings', 'importedPlans', 'personalRecords', 'nutritionAdjustments',
    'foodPreferences', 'equipmentRestrictions', 'trainingZones', 'hydrationLog',
    'checkinHistory', 'fitnessGoals', 'trainingPreferences', 'trainingNotes',
    'savedMealPlans', 'currentWeekMealPlan', 'hydrationSettings', 'fuelingPrefs',
    'hydrationDailyTargetOz', 'yogaTypes', 'completedChallenges', 'activeChallenges',
    'userSharedWorkouts', 'measurementSystem', 'gymStrengthEnabled',
    'nutritionEnabled', 'hydrationEnabled', 'fuelingEnabled',
  ];

  const _keyTimers = {};

  function syncKey(lsKey) {
    clearTimeout(_keyTimers[lsKey]);
    _keyTimers[lsKey] = setTimeout(async () => {
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
    }, 2000);
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

  const workouts         = _userTable('workouts', 'workouts');
  const workoutExercises = _userTable('workout_exercises', 'workoutExercises');
  const workoutSegments  = _userTable('workout_segments', 'workoutSegments');
  const trainingPlans    = _userTable('training_plans', 'trainingPlan');
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
    if (localStorage.getItem('supabase_migrated') === 'true') return;

    const uid = await _userId();
    if (!uid) return;

    console.log('DB: Starting one-time localStorage → Supabase migration');

    const migrations = [
      { lsKey: 'profile', handler: _migrateProfile },
      { lsKey: 'workouts', table: 'workouts', shape: _shapeWorkout },
      { lsKey: 'workoutSchedule', table: 'training_sessions', shape: _shapeTrainingSession },
      { lsKey: 'trainingPlan', table: 'training_plans', shape: _shapeTrainingPlan },
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

  function _shapeWorkout(w, uid) {
    return {
      id: w.id || crypto.randomUUID(),
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
  }

  function _shapeTrainingSession(s, uid) {
    return {
      id: s.id || crypto.randomUUID(),
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
  }

  function _shapeTrainingPlan(p, uid) {
    return {
      id: p.id || crypto.randomUUID(),
      user_id: uid,
      name: p.name || p.raceName || null,
      type: p.type || p.raceType || 'general',
      goal: p.goal || null,
      fitness_level: p.level || p.fitnessLevel || p.fitness_level || null,
      start_date: p.startDate || p.start_date || null,
      end_date: p.endDate || p.end_date || null,
      weeks: p.weeks || p.totalWeeks || null,
      days_per_week: p.daysPerWeek || p.days_per_week || null,
      split_type: p.splitType || p.split_type || null,
      is_active: p.isActive !== false,
      source: p.source || 'generated',
      raw_plan: p,
      created_at: p.createdAt || p.created_at || new Date().toISOString()
    };
  }

  // Meals are synced via user_data table (syncKey('meals')), not a dedicated table.

  function _shapeRaceEvent(e, uid) {
    return {
      id: e.id || crypto.randomUUID(),
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
      id: g.id || crypto.randomUUID(),
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
      id: c.id || crypto.randomUUID(),
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
      if (!raw) return;
      const arr = Array.isArray(raw) ? raw : [raw];
      if (arr.length === 0) return;
      const rows = arr.map(item => shapeFn(item, uid)).filter(Boolean);
      if (rows.length === 0) return;
      try {
        for (let i = 0; i < rows.length; i += 100) {
          const chunk = rows.slice(i, i + 100);
          const { error } = await _client()
            .from(table).upsert(chunk, { onConflict: 'id' });
          if (error) console.warn(`DB: sync ${lsKey} error`, error.message);
        }
      } catch (e) { console.warn(`DB: sync ${lsKey} offline`, e); }
    }, delay);
  }

  function syncWorkouts() {
    _debouncedSync('workouts', 'workouts', _shapeWorkout);
  }

  function syncSchedule() {
    _debouncedSync('training_sessions', 'workoutSchedule', _shapeTrainingSession);
  }

  function syncTrainingPlan() {
    _debouncedSync('training_plans', 'trainingPlan', _shapeTrainingPlan);
  }

  function syncEvents() {
    _debouncedSync('race_events', 'events', _shapeRaceEvent);
  }

  function syncGoals() {
    _debouncedSync('goals', 'goals', _shapeGoal);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    profile,
    workouts,
    workoutExercises,
    workoutSegments,
    trainingPlans,
    trainingSessions,
    planAdherence,
    weeklyCheckins,
    goals,
    raceEvents,
    philosophyModules,
    exerciseLibrary,
    philosophyGaps,
    generatedPlans,
    userOutcomes,
    syncWorkouts,
    syncSchedule,
    syncTrainingPlan,
    syncEvents,
    syncGoals,
    syncKey,
    refreshAllKeys,
    SYNCED_KEYS,
    migrateLocalStorage,
    _isOnline,
    _userId,
  };

})();
