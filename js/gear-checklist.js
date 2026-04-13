// js/gear-checklist.js
//
// Triathlon gear checklist data + storage layer.
// Spec: SPEC_triathlon_gear_checklist.md (in-app feature, v1)
//
// Catalog data sourced from IronZ_Triathlon_Equipment_Guide.xlsx
// "Equipment List" sheet columns 1–10. Why + Pro Tip text is verbatim
// from columns I and J.
//
// Public API (window.GearChecklist):
//   isTriathlon(race)                   → boolean
//   detectDistance(race)                → "sprint"|"olympic"|"half"|"full"
//   distanceLabel(distance)             → human-readable string
//   defaultItemsForDistance(distance)   → [item, ...]  (fresh copy)
//   loadChecklist(raceId)               → {raceId, distance, items, updatedAt}
//   saveChecklist(checklist)            → persist to localStorage + DB sync
//   resetChecklist(raceId, race)        → rebuild from defaults
//   toggleItem(raceId, itemId)          → flip checked, return updated checklist
//   removeItem(raceId, itemId)          → set removed=true
//   restoreItem(raceId, itemId)         → set removed=false
//   progressFor(raceId)                 → { checked, total }

(function () {
  "use strict";

  const LS_KEY = "gear_checklists_v1";

  // ── Catalog ──────────────────────────────────────────────────────────────
  // Each item: id, category, name, tier, applies (distances), why, tip.
  // applies values: "sprint"|"olympic"|"half"|"full". Missing = not included
  // for that distance. Mirror of the xlsx spreadsheet (sheet 1).
  const CATALOG = [
    // ── SWIM ────────────────────────────────────────────────────────────
    { id: "swim-goggles", category: "swim", name: "Goggles", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "You literally cannot see without them in open water.",
      tip: "Get two pairs — clear lens for cloudy days, tinted for sun. Practice with both." },
    { id: "swim-tri-suit", category: "swim", name: "Tri suit (one-piece or two-piece)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Wear it for all three legs — no changing. Quick-dry, chamois padding for the bike.",
      tip: "One-piece is faster in transition. Two-piece lets you use the bathroom easier on long courses." },
    { id: "swim-race-cap", category: "swim", name: "Swim cap (race provided)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "The race gives you one for wave identification. Mandatory.",
      tip: "Bring your own silicone cap to wear under the race cap — extra warmth + keeps hair contained." },
    { id: "swim-wetsuit", category: "swim", name: "Wetsuit", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Required in cold water, huge buoyancy advantage. Most races allow below 76°F.",
      tip: "Rent before you buy ($40–60/race). Practice open water in it before race day — it feels very different from a pool." },
    { id: "swim-anti-fog", category: "swim", name: "Anti-fog spray / baby shampoo", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Goggles fog up in cold water. Baby shampoo on the lenses works just as well.",
      tip: "Apply the night before, let it dry, rinse lightly morning of. Don't touch the inside of lenses." },
    { id: "swim-earplugs", category: "swim", name: "Ear plugs", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Prevents swimmer's ear and cold water discomfort.",
      tip: "Mack's silicone putty ear plugs stay in better than foam." },
    { id: "swim-skin", category: "swim", name: "Swim skin (no-wetsuit races)", tier: "extra",
      applies: ["half","full"],
      why: "When water is too warm for wetsuits, a swim skin reduces drag.",
      tip: "Only worth it if you're competitive. Most age-groupers skip this." },
    { id: "swim-pull-buoy", category: "swim", name: "Pull buoy (training)", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Training aid — not for race day. Teaches proper body position in the water.",
      tip: "Great for isolating the pull, but don't become dependent on it — you still need to kick on race day." },
    { id: "swim-paddles", category: "swim", name: "Paddles (training)", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Training aid — not for race day. Build upper-body swim strength and catch feel.",
      tip: "Start small — oversized paddles are a shoulder-injury factory. Finis Freestyler is a good starter." },

    // ── BIKE ────────────────────────────────────────────────────────────
    { id: "bike-bike", category: "bike", name: "Road or tri bike", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Any road bike works for your first race. Tri bikes have aero bars but aren't required.",
      tip: "Borrow or buy used for your first tri. A proper bike fit ($150–250) matters more than the bike itself." },
    { id: "bike-helmet", category: "bike", name: "Helmet (CPSC certified)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Mandatory. No helmet = no race, no exceptions.",
      tip: "Make sure it fits level on your head. Practice buckling it fast — you'll fumble in T1." },
    { id: "bike-shoes", category: "bike", name: "Cycling shoes + clipless pedals", tier: "need",
      applies: ["olympic","half","full"],
      why: "Clip-in pedals transfer 30%+ more power. Game changer for longer distances.",
      tip: "For sprint you can race in running shoes with flat pedals. Olympic+ you really want clipless." },
    { id: "bike-bottles", category: "bike", name: "Water bottles + cages (2)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Dehydration kills performance. Two bottle cages minimum.",
      tip: "Behind-the-seat bottle is more aero. Front-mount for easy access on long rides." },
    { id: "bike-flat-kit", category: "bike", name: "Flat repair kit (tube, levers, CO2)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "You WILL get a flat eventually. No support car in most races.",
      tip: "Practice changing a tube at home until you can do it in under 5 minutes." },
    { id: "bike-pump", category: "bike", name: "Tire pump (floor pump)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Tires lose pressure weekly. Race morning you need proper inflation.",
      tip: "Check pressure the morning of. Road tires: 80–100 PSI depending on weight and tire width." },
    { id: "bike-computer", category: "bike", name: "Bike computer / GPS", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Pace yourself on the bike — critical for half and full distance.",
      tip: "A $50 Wahoo ELEMNT BOLT refurb is fine. Don't need a $400 head unit for your first races." },
    { id: "bike-sunglasses", category: "bike", name: "Sunglasses", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Road debris, bugs, sun glare. Protects eyes at 20+ mph.",
      tip: "Cheap cycling glasses work fine. Make sure they don't fog up coming out of the swim." },
    { id: "bike-chamois", category: "bike", name: "Cycling shorts / chamois (training)", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "For training rides only — your tri suit has a thin chamois for race day.",
      tip: "Don't wear underwear under cycling shorts. Ever. The chamois IS the underwear." },
    { id: "bike-aero-bars", category: "bike", name: "Aero bars (clip-on)", tier: "nice",
      applies: ["olympic","half","full"],
      why: "Clip onto road bike handlebars for an aero position. Big free speed on flat courses.",
      tip: "Get a bike fit after installing. Wrong position = back pain at mile 40." },
    { id: "bike-chain-lube", category: "bike", name: "Chain lube", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Clean chain = faster, quieter, longer-lasting drivetrain.",
      tip: "Lube the night before race day, wipe excess. Wet lube for rain, dry lube for fair weather." },
    { id: "bike-power-meter", category: "bike", name: "Power meter", tier: "extra",
      applies: ["half","full"],
      why: "Measures actual watts output — the gold standard for pacing on the bike.",
      tip: "Only useful if you train with power. Otherwise HR and perceived effort are free and work fine." },
    { id: "bike-aero-wheels", category: "bike", name: "Deep section / disc wheels", tier: "extra",
      applies: ["half","full"],
      why: "Aero wheels are the single biggest speed upgrade after position.",
      tip: "Rent for race day ($100–200) before buying. Wind affects deep wheels — practice in crosswinds." },

    // ── RUN ─────────────────────────────────────────────────────────────
    { id: "run-shoes", category: "run", name: "Running shoes (properly fitted)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Your most important piece of gear. Get fitted at a running store.",
      tip: "Train in the shoes you'll race in. Never debut new shoes on race day." },
    { id: "run-race-belt", category: "run", name: "Race belt with bib number", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Holds your bib without safety pins on your tri suit. Flip to back on bike, front on run.",
      tip: "Elastic belt with clips. Attach your bib the night before — one less thing race morning." },
    { id: "run-body-glide", category: "run", name: "Body Glide / anti-chafe", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Chafing gets brutal after the swim. Tri suit seams + salt water + sweat = pain.",
      tip: "Apply everywhere the suit touches skin. Inner thighs, underarms, nipples (yes, seriously)." },
    { id: "run-hat", category: "run", name: "Hat or visor", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Sun protection and keeps sweat out of your eyes.",
      tip: "Visor breathes better than a hat. White reflects heat — skip the black one." },
    { id: "run-elastic-laces", category: "run", name: "Elastic laces (lock laces)", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Slip shoes on in T2 without tying — saves 15–30 seconds.",
      tip: "Install and adjust BEFORE race day. Too tight = numb toes at mile 8." },
    { id: "run-gps-watch", category: "run", name: "GPS watch", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Track pace, HR, distance across all three legs.",
      tip: "Garmin 245/255 or Apple Watch Ultra. Set up your race as a multisport activity for auto-transitions." },
    { id: "run-compression-socks", category: "run", name: "Compression socks", tier: "extra",
      applies: ["half","full"],
      why: "May help with calf fatigue on the run after a long bike.",
      tip: "If you use them, practice running in them. They're hard to pull on with wet feet in T2." },

    // ── TRANSITION ──────────────────────────────────────────────────────
    { id: "t-bag", category: "transition", name: "Transition bag / backpack", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Carries everything to the race. Doesn't have to be fancy — a tote bag works.",
      tip: "Pack the night before. Lay out your transition area at home first as a rehearsal." },
    { id: "t-towel", category: "transition", name: "Towel (small, bright color)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Mark your transition spot + wipe sand/dirt off feet before bike shoes.",
      tip: "Bright color = find your spot fast in 500 identical racks. Lay shoes on the towel." },
    { id: "t-sunscreen", category: "transition", name: "Sunscreen (pre-applied)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Apply BEFORE you put on your wetsuit. You won't have time in transition.",
      tip: "Use sport SPF 50+. The swim washes off anything water-soluble." },
    { id: "t-nutrition-pack", category: "transition", name: "Nutrition (gels, bars, electrolytes)", tier: "need",
      applies: ["olympic","half","full"],
      why: "Sprint you might not need any. Olympic+ you need a fueling plan.",
      tip: "Practice your nutrition in training. Never try new food on race day. Tape gels to your bike frame." },
    { id: "t-plastic-bag", category: "transition", name: "Plastic bag for wet gear", tier: "nice",
      applies: ["sprint","olympic","half","full"],
      why: "Stuff your wetsuit in it post-swim so it doesn't get everything else wet.",
      tip: "A grocery bag works perfectly." },
    { id: "t-baby-powder", category: "transition", name: "Baby powder in shoes", tier: "extra",
      applies: ["sprint","olympic","half","full"],
      why: "Helps wet feet slide into shoes faster and prevents blisters.",
      tip: "Shake some into bike and run shoes the night before." },

    // ── NUTRITION ───────────────────────────────────────────────────────
    { id: "nut-course-water", category: "nutrition", name: "Water / sports drink (on course)", tier: "need",
      applies: ["sprint","olympic","half","full"],
      why: "Provided at aid stations. Know what brand the race uses.",
      tip: "Train with the same brand the race provides. Switching on race day = stomach issues." },
    { id: "nut-gels", category: "nutrition", name: "Energy gels (30–60g carbs/hr)", tier: "need",
      applies: ["olympic","half","full"],
      why: "Your engine needs fuel after ~75 min of effort.",
      tip: "Start fueling 30 min into the bike, not when you feel hungry. By then it's too late." },
    { id: "nut-salt", category: "nutrition", name: "Salt / electrolyte tabs", tier: "nice",
      applies: ["olympic","half","full"],
      why: "Prevents cramping in heat. Critical for half and full distance.",
      tip: "SaltStick or LMNT. One cap every 30–45 min in hot conditions." },
    { id: "nut-caffeine", category: "nutrition", name: "Caffeinated gel (for the run)", tier: "nice",
      applies: ["half","full"],
      why: "Mental and physical boost when fatigue hits on the run.",
      tip: "Save your caffeine gel for mile 1–2 of the run. Test in training first — some stomachs don't tolerate it." },
    { id: "nut-bento", category: "nutrition", name: "Bento box / top tube bag", tier: "nice",
      applies: ["olympic","half","full"],
      why: "Stores nutrition on the bike within easy reach.",
      tip: "Velcro-mount on top tube. Faster than reaching into jersey pockets while riding." },
  ];

  const CATEGORY_ORDER = ["swim", "bike", "run", "transition", "nutrition"];
  const CATEGORY_LABELS = {
    swim: "Swim", bike: "Bike", run: "Run",
    transition: "Transition", nutrition: "Nutrition",
  };
  const TIER_LABELS  = { need: "Need", nice: "Nice", extra: "Extra" };
  const DISTANCE_LABELS = {
    sprint: "Sprint",
    olympic: "Olympic",
    half: "Half Ironman",
    full: "Full Ironman",
  };

  // ── Detection ───────────────────────────────────────────────────────────

  function isTriathlon(race) {
    if (!race) return false;
    // Explicit race.type from the form (ironman/halfIronman/olympic/sprint)
    const triTypes = new Set(["ironman", "halfIronman", "olympic", "sprint"]);
    if (race.type && triTypes.has(race.type)) return true;
    if (race.raceType === "triathlon") return true;
    // Fallback: parse the race name
    const name = String(race.name || "").toLowerCase();
    return /triathlon|ironman|70\.?3|140\.?6|half.?im\b|sprint.?tri/.test(name);
  }

  function detectDistance(race) {
    if (!race) return "full";
    // Explicit type → exact mapping
    const typeMap = {
      ironman: "full",
      halfIronman: "half",
      olympic: "olympic",
      sprint: "sprint",
    };
    if (race.type && typeMap[race.type]) return typeMap[race.type];

    const name = String(race.name || "").toLowerCase();
    if (/sprint/.test(name)) return "sprint";
    if (/olympic|standard/.test(name)) return "olympic";
    if (/70\.?3|half\s*iron|half.?im\b/.test(name)) return "half";
    if (/ironman|140\.?6|full\s*iron/.test(name)) return "full";
    // Unknown — default to full (shows all items, user removes what they don't need)
    return "full";
  }

  function distanceLabel(d) { return DISTANCE_LABELS[d] || "Triathlon"; }

  // ── Catalog filtering ──────────────────────────────────────────────────

  function defaultItemsForDistance(distance) {
    const d = String(distance || "full").toLowerCase();
    // Deep-copy items so per-race state mutations don't leak into the catalog
    return CATALOG
      .filter(it => it.applies.indexOf(d) !== -1)
      .map(it => ({
        id: it.id,
        category: it.category,
        name: it.name,
        tier: it.tier,
        why: it.why,
        tip: it.tip,
        checked: false,
        removed: false,
      }));
  }

  // ── Storage ────────────────────────────────────────────────────────────
  // Stored shape: { [raceId]: {raceId, distance, items, updatedAt} }

  function _readAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
  }

  function _writeAll(all) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(all));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(LS_KEY);
    } catch (e) {
      console.warn("[GearChecklist] write failed:", e);
    }
  }

  function loadChecklist(raceId, race) {
    if (!raceId) return null;
    const all = _readAll();
    if (all[raceId]) return all[raceId];
    // First load — build defaults from the race's distance
    const distance = detectDistance(race || { id: raceId });
    const checklist = {
      raceId,
      raceType: "triathlon",
      distance,
      items: defaultItemsForDistance(distance),
      updatedAt: new Date().toISOString(),
    };
    all[raceId] = checklist;
    _writeAll(all);
    return checklist;
  }

  function saveChecklist(checklist) {
    if (!checklist || !checklist.raceId) return;
    checklist.updatedAt = new Date().toISOString();
    const all = _readAll();
    all[checklist.raceId] = checklist;
    _writeAll(all);
    return checklist;
  }

  function resetChecklist(raceId, race) {
    const all = _readAll();
    delete all[raceId];
    _writeAll(all);
    return loadChecklist(raceId, race);
  }

  function _mutateItem(raceId, itemId, mutator) {
    const all = _readAll();
    const cl = all[raceId];
    if (!cl || !cl.items) return null;
    const item = cl.items.find(i => i.id === itemId);
    if (!item) return cl;
    mutator(item);
    cl.updatedAt = new Date().toISOString();
    _writeAll(all);
    return cl;
  }

  function toggleItem(raceId, itemId) {
    const cl = _mutateItem(raceId, itemId, i => { i.checked = !i.checked; });
    if (cl && typeof trackEvent === "function") {
      const it = cl.items.find(i => i.id === itemId);
      if (it && it.checked) {
        trackEvent("gear_checklist_item_checked", {
          item_id: it.id, category: it.category, tier: it.tier,
        });
      }
      // Completion event — fire once all non-removed items are checked
      const active = cl.items.filter(i => !i.removed);
      if (active.length && active.every(i => i.checked)) {
        trackEvent("gear_checklist_completed", { distance: cl.distance, total: active.length });
      }
    }
    return cl;
  }

  function removeItem(raceId, itemId) {
    const cl = _mutateItem(raceId, itemId, i => { i.removed = true; });
    if (cl && typeof trackEvent === "function") {
      const it = cl.items.find(i => i.id === itemId);
      if (it) trackEvent("gear_checklist_item_removed", { item_id: it.id, category: it.category, tier: it.tier });
    }
    return cl;
  }

  function restoreItem(raceId, itemId) {
    return _mutateItem(raceId, itemId, i => { i.removed = false; });
  }

  function progressFor(raceId) {
    const all = _readAll();
    const cl = all[raceId];
    if (!cl || !cl.items) return { checked: 0, total: 0 };
    const active = cl.items.filter(i => !i.removed);
    const checked = active.filter(i => i.checked).length;
    return { checked, total: active.length };
  }

  // ── Public API ─────────────────────────────────────────────────────────
  const api = {
    isTriathlon,
    detectDistance,
    distanceLabel,
    defaultItemsForDistance,
    loadChecklist,
    saveChecklist,
    resetChecklist,
    toggleItem,
    removeItem,
    restoreItem,
    progressFor,
    CATALOG,
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    TIER_LABELS,
    DISTANCE_LABELS,
    LS_KEY,
  };

  if (typeof window !== "undefined") window.GearChecklist = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
