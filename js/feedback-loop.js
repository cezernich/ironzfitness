// feedback-loop.js — User outcomes tracking and module effectiveness analysis
// Phase 6 of the Philosophy Engine build

/**
 * Record a weekly check-in from the user.
 * This data feeds back into philosophy refinement.
 */
async function recordWeeklyCheckIn(checkInData) {
  const profile = getProfileForPhilosophy ? getProfileForPhilosophy() : {};

  // Store latest check-in locally for recovery state derivation
  const checkIn = {
    sleep_quality: checkInData.sleep || checkInData.sleepQuality,
    energy_level: checkInData.energy || checkInData.energyLevel,
    soreness_level: checkInData.soreness || checkInData.sorenessLevel,
    timestamp: new Date().toISOString()
  };
  localStorage.setItem('latestCheckIn', JSON.stringify(checkIn));

  // Store in Supabase
  try {
    if (typeof supabaseClient === 'undefined') return;

    const { data: session } = await supabaseClient.auth.getSession();
    if (!session?.session?.user?.id) return;

    const userId = session.session.user.id;
    const activePlan = await getActivePlan(userId);

    await supabaseClient.from('user_outcomes').insert({
      user_id: userId,
      plan_id: activePlan?.id || null,
      week_number: checkInData.weekNumber || null,
      sessions_planned: checkInData.planned || null,
      sessions_completed: checkInData.completed || null,
      difficulty_rating: checkInData.difficulty || null,
      energy_level: checkIn.energy_level,
      sleep_quality: checkIn.sleep_quality,
      soreness_level: checkIn.soreness_level,
      notes: checkInData.notes || null
    });

    console.log('[IronZ] Weekly check-in recorded');

    // Update recovery state based on check-in
    const classification = classifyUser(profile);
    const newRecoveryState = classification.recoveryState;
    localStorage.setItem('currentRecoveryState', newRecoveryState);

  } catch (e) {
    console.warn('[IronZ] Failed to record check-in:', e.message);
  }
}

/**
 * Aggregate analysis: compare user outcomes against module predictions.
 * Run periodically (every 4-8 weeks) to identify modules that need updating.
 */
async function analyzeModuleEffectiveness() {
  try {
    if (typeof supabaseClient === 'undefined') return null;

    const { data, error } = await supabaseClient.rpc('module_effectiveness_report');
    if (error) throw error;

    // Flag modules where users consistently rate "too_hard" or "too_easy"
    const flagged = (data || []).filter(m =>
      (m.avg_difficulty_score !== null && (m.avg_difficulty_score > 0.7 || m.avg_difficulty_score < 0.3)) ||
      (m.avg_completion_rate !== null && m.avg_completion_rate < 0.6)
    );

    if (flagged.length > 0) {
      console.log('[IronZ] Flagged modules for review:', flagged.map(m => m.module_id));
    }

    return { all: data, flagged };
  } catch (e) {
    console.warn('[IronZ] Module effectiveness analysis failed:', e.message);
    return null;
  }
}

/**
 * Get user's check-in history for a plan.
 */
async function getCheckInHistory(planId) {
  try {
    if (typeof supabaseClient !== 'undefined') {
      const { data } = await supabaseClient
        .from('user_outcomes')
        .select('*')
        .eq('plan_id', planId)
        .order('week_number', { ascending: true });
      return data || [];
    }
  } catch { /* ignore */ }
  return [];
}

/**
 * Calculate adherence rate from outcomes.
 */
function calculateAdherenceRate(outcomes) {
  if (!outcomes || outcomes.length === 0) return null;
  const withData = outcomes.filter(o => o.sessions_planned > 0);
  if (withData.length === 0) return null;
  const totalPlanned = withData.reduce((sum, o) => sum + o.sessions_planned, 0);
  const totalCompleted = withData.reduce((sum, o) => sum + o.sessions_completed, 0);
  return totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : null;
}

/**
 * Get difficulty trend (are things getting easier, harder, or stable?)
 */
function getDifficultyTrend(outcomes) {
  if (!outcomes || outcomes.length < 3) return 'insufficient_data';
  const diffMap = { 'too_easy': -1, 'just_right': 0, 'too_hard': 1 };
  const recent = outcomes.slice(-3).map(o => diffMap[o.difficulty_rating] ?? 0);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  if (avg > 0.5) return 'getting_harder';
  if (avg < -0.5) return 'getting_easier';
  return 'stable';
}
