// coach-request-flow.js — "Request a Coach" form modal + submit handler.
//
// Tap "Request a Coach" on Profile → opens a 4-question form modal →
// submit → POSTs to the send-coach-request-email Supabase edge function.
// The edge function inserts into coach_requests and emails
// ironzsupport@gmail.com.
//
// Spec: new features/COACHING_FEATURE_SPEC_2026-04-28.md (Phase 1E)
// Edge function: supabase/functions/send-coach-request-email/

(function () {
  "use strict";

  let _isOpen = false;

  function openCoachRequestForm() {
    const overlay = document.getElementById("coach-request-overlay");
    if (!overlay) return;

    // Reset state every open — fields, error, confirmation panel.
    _resetForm();

    overlay.classList.add("is-open");
    _isOpen = true;

    // Wire the live char counter on the notes textarea.
    const notes = document.getElementById("coach-req-notes");
    const counter = document.getElementById("coach-req-notes-count");
    if (notes && counter && !notes._wired) {
      notes.addEventListener("input", () => {
        const n = (notes.value || "").length;
        counter.textContent = `${n} / 500`;
      });
      notes._wired = true;
    }

    if (typeof trackEvent === "function") {
      try { trackEvent("coach_request_opened"); } catch {}
    }
  }

  function closeCoachRequestForm() {
    const overlay = document.getElementById("coach-request-overlay");
    if (!overlay) return;
    overlay.classList.remove("is-open");
    _isOpen = false;
  }

  function _resetForm() {
    ["coach-req-sport", "coach-req-goal", "coach-req-experience"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const notes = document.getElementById("coach-req-notes");
    if (notes) notes.value = "";
    const counter = document.getElementById("coach-req-notes-count");
    if (counter) counter.textContent = "0 / 500";
    const err = document.getElementById("coach-req-error");
    if (err) err.textContent = "";
    const confirmEl = document.getElementById("coach-req-confirm");
    const body = document.querySelector("#coach-request-overlay .quick-entry-body");
    if (confirmEl) confirmEl.style.display = "none";
    if (body) body.style.display = "";
    const btn = document.getElementById("coach-req-send-btn");
    if (btn) { btn.disabled = false; btn.textContent = "Send"; }
  }

  async function submitCoachRequest() {
    const sport      = document.getElementById("coach-req-sport")?.value;
    const goal       = document.getElementById("coach-req-goal")?.value;
    const experience = document.getElementById("coach-req-experience")?.value;
    const notes      = (document.getElementById("coach-req-notes")?.value || "").slice(0, 500);

    const errEl = document.getElementById("coach-req-error");
    const setErr = (msg) => { if (errEl) errEl.textContent = msg || ""; };
    setErr("");

    if (!sport)      return setErr("Pick a primary sport.");
    if (!goal)       return setErr("Pick a primary goal.");
    if (!experience) return setErr("Pick an experience level.");

    const btn = document.getElementById("coach-req-send-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }

    try {
      const client = window.supabaseClient;
      if (!client) throw new Error("Auth client not available — try again in a moment.");

      const session = (await client.auth.getSession())?.data?.session;
      const jwt = session?.access_token;
      if (!jwt) throw new Error("Not signed in — sign in first.");

      // Edge function URL — derived from the Supabase URL the client was
      // initialized with so we don't hardcode a project ref here.
      const supaUrl = (typeof window.SUPABASE_URL === "string" && window.SUPABASE_URL)
        || (client.supabaseUrl /* deprecated but still present in v2 client */);
      if (!supaUrl) throw new Error("Server URL not configured.");

      const fnUrl = `${supaUrl.replace(/\/$/, "")}/functions/v1/send-coach-request-email`;

      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sport, goal, experience, notes }),
      });

      let body = null;
      try { body = await res.json(); } catch {}

      if (!res.ok) {
        throw new Error((body && body.error) || `Request failed (${res.status})`);
      }

      // Success — swap to the confirmation panel.
      const formBody = document.querySelector("#coach-request-overlay .quick-entry-body");
      const confirmEl = document.getElementById("coach-req-confirm");
      if (formBody) formBody.style.display = "none";
      if (confirmEl) confirmEl.style.display = "";

      if (typeof trackEvent === "function") {
        try {
          trackEvent("coach_request_submitted", {
            sport, goal, experience,
            email_sent: !!(body && body.emailSent),
          });
        } catch {}
      }
    } catch (e) {
      setErr((e && e.message) || "Couldn't send your request — try again.");
      if (btn) { btn.disabled = false; btn.textContent = "Send"; }
    }
  }

  // ── Visibility ───────────────────────────────────────────────────────
  //
  // Toggles two cards on the Profile screen based on the current user's
  // coaching context:
  //   • #section-coach-entry  — shown when the user has profile.is_coach=true
  //     (Phase 1 lands the markup; the Open button is wired in Phase 2 by
  //     coach-portal.js).
  //   • #section-coach-request — shown UNLESS the user already has an
  //     active coaching_assignments row as the client. A coached athlete
  //     doesn't need to ask for a coach again. Spec: "Where it lives"
  //     update — hide for users who already have an active assignment as
  //     a client.
  //
  // Called from auth.js after window._userRole is set, alongside
  // initAdminVisibility(). Re-runnable — safe on re-auth / role refresh.
  async function initCoachVisibility() {
    const entryCard   = document.getElementById("section-coach-entry");
    const requestCard = document.getElementById("section-coach-request");
    const client      = window.supabaseClient;
    if (!client) {
      // No client yet — leave both hidden. Will be retried on next auth tick.
      if (entryCard)   entryCard.style.display = "none";
      if (requestCard) requestCard.style.display = "none";
      return;
    }

    // Resolve the current user. getSession is the cheap path; getUser is
    // the authoritative one. We read the session so we don't burn a
    // network round-trip when one isn't needed.
    const { data: sessRes } = await client.auth.getSession();
    const userId = sessRes?.session?.user?.id;
    if (!userId) {
      if (entryCard)   entryCard.style.display = "none";
      if (requestCard) requestCard.style.display = "none";
      return;
    }

    // Two parallel reads.
    const [profileRes, assignRes] = await Promise.all([
      client.from("profiles").select("is_coach").eq("id", userId).maybeSingle(),
      client.from("coaching_assignments")
        .select("id", { count: "exact", head: true })
        .eq("client_id", userId)
        .eq("active", true),
    ]);

    const isCoach           = !!profileRes?.data?.is_coach;
    const hasActiveAsClient = (assignRes?.count ?? 0) > 0;

    if (entryCard)   entryCard.style.display   = isCoach ? "" : "none";
    if (requestCard) requestCard.style.display = hasActiveAsClient ? "none" : "";
  }

  // Public surface — inline onclick handlers in index.html call these.
  window.openCoachRequestForm  = openCoachRequestForm;
  window.closeCoachRequestForm = closeCoachRequestForm;
  window.submitCoachRequest    = submitCoachRequest;
  window.initCoachVisibility   = initCoachVisibility;
})();
