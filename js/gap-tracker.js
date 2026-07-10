// gap-tracker.js — Philosophy gap detection and logging
// Phase 6 of the Philosophy Engine build

/**
 * Log philosophy gaps to Supabase.
 * Called when module retrieval finds no match for a dimension.
 */
async function logPhilosophyGaps(gaps) {
  if (!gaps || gaps.length === 0) return;

  // Log locally
  try {
    const existing = JSON.parse(localStorage.getItem('philosophy_gaps') || '[]');
    for (const gap of gaps) {
      const idx = existing.findIndex(g => g.dimension === gap.dimension && g.value === gap.value);
      if (idx >= 0) {
        existing[idx].user_count = (existing[idx].user_count || 1) + 1;
        existing[idx].last_seen = gap.timestamp;
      } else {
        existing.push({
          dimension: gap.dimension,
          value: gap.value,
          user_count: 1,
          first_seen: gap.timestamp,
          last_seen: gap.timestamp
        });
      }
    }
    localStorage.setItem('philosophy_gaps', JSON.stringify(existing));
  } catch (e) {
    console.warn('[IronZ] Local gap logging failed:', e.message);
  }

  // Log to Supabase.
  //
  // Atomic per-gap counter bump via the bump_philosophy_gap() RPC
  // (see supabase/migrations/20260710_philosophy_gap_bump.sql). This
  // replaces the old SELECT-then-UPDATE/INSERT loop, which raced on
  // `existing.user_count + 1` and issued an N+1 pair of round-trips
  // per gap. The RPC does an atomic UPSERT server-side, so we can fan
  // the whole batch out in parallel.
  try {
    if (typeof supabaseClient === 'undefined') return;

    await Promise.all(gaps.map(g =>
      supabaseClient.rpc('bump_philosophy_gap', { p_dim: g.dimension, p_val: g.value })
    ));
    console.log(`[IronZ] Logged ${gaps.length} philosophy gaps to Supabase`);
  } catch (e) {
    console.warn('[IronZ] Supabase gap logging failed:', e.message);
  }
}

/**
 * Get a summary of open gaps (for admin dashboard).
 */
async function getGapSummary() {
  try {
    if (typeof supabaseClient !== 'undefined') {
      const { data } = await supabaseClient
        .from('philosophy_gaps')
        .select('*')
        .eq('resolution_status', 'open')
        .order('user_count', { ascending: false });
      return data || [];
    }
  } catch { /* ignore */ }

  // Fall back to local
  try {
    return JSON.parse(localStorage.getItem('philosophy_gaps') || '[]');
  } catch { return []; }
}

/**
 * Mark a gap as resolved.
 */
async function resolveGap(gapId, notes) {
  try {
    if (typeof supabaseClient !== 'undefined') {
      await supabaseClient.from('philosophy_gaps').update({
        resolution_status: 'resolved',
        resolution_notes: notes
      }).eq('id', gapId);
    }
  } catch (e) {
    console.warn('[IronZ] Failed to resolve gap:', e.message);
  }
}
