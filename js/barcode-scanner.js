// barcode-scanner.js — Food barcode scanning.
// Prefers the native BarcodeDetector Web API, falls back to Html5Qrcode on
// browsers that don't support it yet (notably Safari < 17.2 and older Chromes).
// Looks product nutrition up live against Open Food Facts v2 (keyless).

let _scanState = null; // { native, stream, video, rafId, html5 }

/* ─── Entry / exit ─────────────────────────────────────────────────────── */

async function openBarcodeScanner() {
  if (window.Subscription && typeof window.Subscription.requirePremium === "function") {
    const allowed = await window.Subscription.requirePremium("barcode_scanner");
    if (!allowed) return;
  }
  const modal = document.getElementById("barcode-scanner-modal");
  if (!modal) return;
  // survey-overlay is opacity:0 + pointer-events:none by default; .is-open
  // flips it to visible and interactive. Setting display:flex alone wasn't
  // enough — the camera would start (permission prompt and all) behind an
  // invisible overlay and the user would see nothing.
  modal.style.display = "flex";
  requestAnimationFrame(() => modal.classList.add("is-open"));
  document.getElementById("barcode-result-panel").style.display = "none";
  document.getElementById("barcode-camera-panel").style.display = "block";
  document.getElementById("barcode-recent-panel").style.display = "none";
  _setStatus("Starting camera…");
  _renderCameraPanel();
  renderRecentScans();

  if (typeof trackEvent === "function") trackEvent("barcode_scan_started", {});

  _startNativeOrFallback();
}

function closeBarcodeScanner() {
  const modal = document.getElementById("barcode-scanner-modal");
  if (modal) {
    modal.classList.remove("is-open");
    // Wait for the fade-out transition to complete before hiding the
    // element, matching the 0.25s opacity transition on .survey-overlay.
    setTimeout(() => { modal.style.display = "none"; }, 250);
  }
  _stopCameraStream();
}

// Kept for backwards compatibility with any external caller that already
// delivers a decoded string.
function onBarcodeDetected(barcode) { _handleDetected(barcode); }

/* ─── Camera panel rendering ───────────────────────────────────────────── */

function _renderCameraPanel() {
  const panel = document.getElementById("barcode-camera-panel");
  if (!panel) return;
  panel.innerHTML =
    '<div id="barcode-reader" class="barcode-reader">' +
      '<div class="barcode-scan-line" aria-hidden="true"></div>' +
    '</div>' +
    '<div class="barcode-detected-flash" id="barcode-detected-flash"></div>' +
    '<div style="text-align:center;margin-top:12px">' +
      '<button type="button" class="btn-link barcode-manual-link" onclick="openBarcodeManualEntry()">Enter barcode manually</button>' +
    '</div>';
}

function _startNativeOrFallback() {
  // Prefer Html5Qrcode: iOS Safari exposes BarcodeDetector but detection
  // silently fails on every frame, leaving the camera running with no
  // scans. The CDN-loaded Html5Qrcode library is slower but actually works
  // cross-browser.
  if (typeof Html5Qrcode !== "undefined") {
    _startFallbackScan();
  } else if ("BarcodeDetector" in window) {
    _startNativeScan();
  } else {
    _showCameraError("Barcode scanning is not supported on this device.");
  }
}

/* ─── Native BarcodeDetector path ──────────────────────────────────────── */

async function _startNativeScan() {
  const reader = document.getElementById("barcode-reader");
  if (!reader) return;

  // Create the video element with every attribute iOS Safari requires to
  // play a MediaStream inline: muted + playsInline + autoplay, set as both
  // properties AND attributes because iOS is picky. Ensure the container
  // has enough height so the video actually renders.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("muted", "");
  video.controls = false;
  video.style.cssText = "width:100%;height:100%;min-height:240px;display:block;object-fit:cover;background:#000";
  // Insert the video behind the scan-line overlay
  reader.insertBefore(video, reader.firstChild);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch (err) {
    console.warn("[barcode] getUserMedia failed:", err);
    if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError" || err.name === "SecurityError")) {
      _showPermissionDenied();
    } else {
      _showCameraError((err && err.message) || "Camera unavailable");
    }
    return;
  }

  video.srcObject = stream;
  // Retry play() once if the first attempt fails — iOS Safari sometimes
  // rejects the first call and accepts the second. If it still fails,
  // the video stays blank and the user sees nothing, so surface an error
  // rather than leaving them staring at a black screen.
  try {
    await video.play();
  } catch (err1) {
    console.warn("[barcode] video.play() attempt 1 failed:", err1);
    try {
      await new Promise(r => setTimeout(r, 50));
      await video.play();
    } catch (err2) {
      console.warn("[barcode] video.play() attempt 2 failed:", err2);
      _stopCameraStream();
      _showCameraError("Couldn't start the camera preview. Try closing other camera apps and reopening.");
      return;
    }
  }

  const detector = new window.BarcodeDetector({
    formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
  });

  _scanState = { native: true, stream, video, active: true, rafId: null };
  _setStatus("Point camera at a barcode");

  const tick = async () => {
    if (!_scanState || !_scanState.active) return;
    try {
      const codes = await detector.detect(video);
      if (codes && codes.length > 0) {
        const raw = codes[0].rawValue || codes[0].raw;
        if (raw) {
          _scanState.active = false;
          _stopCameraStream();
          _handleDetected(raw);
          return;
        }
      }
    } catch {
      // Some devices throw mid-frame — ignore and try the next frame.
    }
    if (_scanState) _scanState.rafId = requestAnimationFrame(tick);
  };
  _scanState.rafId = requestAnimationFrame(tick);
}

/* ─── Html5Qrcode fallback path ────────────────────────────────────────── */

function _startFallbackScan() {
  const reader = document.getElementById("barcode-reader");
  if (reader) reader.innerHTML = '<div class="barcode-scan-line" aria-hidden="true"></div>';
  const html5 = new Html5Qrcode("barcode-reader");
  _scanState = { native: false, html5 };
  // Don't restrict formats. Earlier versions narrowed to EAN/UPC only
  // because grocery barcodes are overwhelmingly those formats — but a
  // sharp UPC-A perfectly framed in the qrbox was still failing to
  // decode (see user reports 2026-04-30). Letting Html5Qrcode try the
  // full format set gives ZXing more decoder paths to attempt and has
  // not produced false-positive reads in testing.
  const supportedFormats = undefined;
  // qrbox sized as a percentage of the viewport so it scales with the
  // modal width — the old fixed 250x150 was too small on iPhone Pro
  // Max devices and clipped barcodes that visibly fit between the
  // brackets. Higher fps gives more chances per second to lock onto
  // a slightly-angled or moving barcode (the user reported scanning
  // a barcode pointed straight at it that never resolved).
  const config = {
    // 24 fps gives the scanner ~50% more chances per second to lock onto
    // a slightly-angled or moving barcode without being so high that we
    // burn battery for nothing — 15 fps was leaving real barcodes
    // un-decoded long enough that users gave up and tapped the manual
    // entry link.
    fps: 24,
    qrbox: function (viewfinderWidth, viewfinderHeight) {
      // Wide rectangle that fills most of the visible viewfinder: 92%
      // of the width, 70% of the height. The viewfinder is forced to
      // a small fixed-height container via CSS (#barcode-reader has
      // max-height + the video uses object-fit:cover), so this gives
      // a thick scan area with only thin dim bands top/bottom.
      return {
        width:  Math.floor(viewfinderWidth  * 0.92),
        height: Math.floor(viewfinderHeight * 0.70),
      };
    },
    // aspectRatio is effectively a no-op on iOS Safari (the camera
    // stream is natively portrait and Html5Qrcode can't rotate it),
    // so size is controlled via CSS on #barcode-reader instead.
    // Keep this off. iOS Safari exposes BarcodeDetector but its detect()
    // silently returns nothing on every frame (see _startNativeOrFallback
    // comment) — turning the flag on routes Html5Qrcode through that
    // same broken native detector instead of ZXing, so a perfectly
    // sharp, centered UPC never decodes. ZXing is slower but it
    // actually works.
    experimentalFeatures: { useBarCodeDetectorIfSupported: false },
  };
  if (supportedFormats) config.formatsToSupport = supportedFormats;
  // Detailed camera constraints — iPhones default to a low resolution
  // unless asked for more, which leaves a barcode shot from arms-length
  // (the only distance where the lens actually focuses) too few pixels
  // to decode. Asking for 1920×1080 ideal pulls more detail through and
  // continuous autofocus keeps a closely-held package from staying
  // permanently blurry. Falls back gracefully if the device can't honor
  // the constraint — `ideal` doesn't fail, just downgrades. (User
  // feedback 2026-04-29: scanner couldn't lock — too blurry up close,
  // too small from arms-length.)
  // Html5Qrcode's first arg must be a string camera id OR a single-key
  // object — the full MediaTrackConstraints goes in config.videoConstraints.
  config.videoConstraints = {
    facingMode: "environment",
    width:  { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
    advanced: [
      { focusMode: "continuous" },
      { focusDistance: { min: 0.05 } },
    ],
  };
  html5.start(
    { facingMode: "environment" },
    config,
    function (decodedText) {
      if (!_scanState || !_scanState.html5) return;
      if (_scanState._hintTimer) { clearTimeout(_scanState._hintTimer); _scanState._hintTimer = null; }
      _scanState.html5.stop().catch(() => {});
      _scanState = null;
      _handleDetected(decodedText);
    },
    function () { /* frame-level scan errors are ignored — normal until a code is found */ }
  ).then(function () {
    _setStatus("Point camera at a barcode");
    // After 8 seconds with no successful decode, swap the status text
    // to something the user can act on. iPhone main lenses don't focus
    // closer than ~10cm, so the most common failure mode is "too close
    // → blurry" — leading the user to back up usually unsticks it.
    if (_scanState) {
      _scanState._hintTimer = setTimeout(() => {
        if (_scanState && _scanState.html5) {
          _setStatus("Trouble locking? Hold ~6–10 in. away with steady hands.");
        }
      }, 8000);
    }
  }).catch(function (err) {
    const msg = String(err || "");
    if (/permission|notallowed|denied/i.test(msg)) {
      _showPermissionDenied();
    } else {
      _showCameraError(msg || "Camera unavailable");
    }
  });
}

function _stopCameraStream() {
  if (!_scanState) return;
  if (_scanState.rafId) {
    try { cancelAnimationFrame(_scanState.rafId); } catch {}
  }
  if (_scanState._hintTimer) {
    try { clearTimeout(_scanState._hintTimer); } catch {}
  }
  if (_scanState.stream && _scanState.stream.getTracks) {
    _scanState.stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
  }
  if (_scanState.html5) {
    try { _scanState.html5.stop().catch(() => {}); } catch {}
  }
  _scanState = null;
}

/* ─── Detection handoff ────────────────────────────────────────────────── */

function _handleDetected(barcode) {
  // Haptic + visual confirmation
  try { if (navigator.vibrate) navigator.vibrate(100); } catch {}
  const flash = document.getElementById("barcode-detected-flash");
  if (flash) {
    flash.textContent = "✓ " + barcode;
    flash.classList.add("is-visible");
    setTimeout(() => flash.classList.remove("is-visible"), 500);
  }
  _setStatus("Looking up " + barcode + "…");
  setTimeout(() => _lookupBarcode(barcode), 300);
}

function _lookupBarcode(barcode) {
  fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(barcode) + ".json")
    .then(r => r.json())
    .then(data => {
      if (data && data.status === 1 && data.product) {
        const productName = data.product.product_name || data.product.generic_name || "";
        if (typeof trackEvent === "function") trackEvent("barcode_scan_success", { barcode, product_name: productName });
        showBarcodeResult(data.product, barcode);
      } else {
        if (typeof trackEvent === "function") trackEvent("barcode_scan_not_found", { barcode });
        showBarcodeNotFound(barcode);
      }
    })
    .catch((err) => {
      if (typeof trackEvent === "function") trackEvent("barcode_scan_not_found", { barcode, reason: "fetch_failed" });
      if (typeof reportCaughtError === "function") reportCaughtError(err, { context: "barcode_scanner", action: "openfoodfacts_fetch", barcode });
      showBarcodeNotFound(barcode);
    });
}

/* ─── Result panel ─────────────────────────────────────────────────────── */

function showBarcodeResult(product, barcode) {
  const n = product.nutriments || {};
  const name = product.product_name || product.generic_name || "Unknown Product";
  const brand = product.brands || "";
  const servingText = product.serving_size || "";
  const displayName = brand ? name + " (" + brand + ")" : name;

  const per100 = {
    cal:     Math.round(n["energy-kcal_100g"]    || n["energy-kcal"]   || 0),
    protein: Math.round(n.proteins_100g          || n.proteins         || 0),
    carbs:   Math.round(n.carbohydrates_100g     || n.carbohydrates    || 0),
    fat:     Math.round(n.fat_100g               || n.fat              || 0),
  };
  const hasServing = !!servingText && (
    n["energy-kcal_serving"] != null ||
    n.proteins_serving != null ||
    n.carbohydrates_serving != null ||
    n.fat_serving != null
  );
  const perServing = hasServing ? {
    cal:     Math.round(n["energy-kcal_serving"] || 0),
    protein: Math.round(n.proteins_serving       || 0),
    carbs:   Math.round(n.carbohydrates_serving  || 0),
    fat:     Math.round(n.fat_serving            || 0),
  } : null;

  const modeDefault = hasServing ? "serving" : "100g";

  document.getElementById("barcode-camera-panel").style.display = "none";
  document.getElementById("barcode-result-panel").style.display = "block";
  _setStatus("");

  const modeToggleHtml = hasServing
    ? '<div class="barcode-mode-toggle">' +
        '<button type="button" class="barcode-mode-btn is-active" data-mode="serving" onclick="_setBarcodeMode(\'serving\')">Per serving (' + escHtml(servingText) + ')</button>' +
        '<button type="button" class="barcode-mode-btn" data-mode="100g" onclick="_setBarcodeMode(\'100g\')">Per 100 g</button>' +
      '</div>'
    : '<p class="hint" style="margin:0 0 12px">Values per 100 g</p>';

  document.getElementById("barcode-result-panel").innerHTML =
    '<h3 style="margin:0 0 4px">Product Found</h3>' +
    '<p style="font-weight:600;margin:0 0 10px">' + escHtml(displayName) + '</p>' +
    modeToggleHtml +
    '<div class="form-row"><label for="barcode-name">Name</label>' +
    '<input type="text" id="barcode-name" value="' + escHtml(displayName).replace(/"/g, "&quot;") + '" /></div>' +
    '<div class="form-row"><label for="barcode-servings">Servings</label>' +
    '<input type="number" id="barcode-servings" value="1" min="0.25" step="0.25" onchange="updateBarcodeServings()" oninput="updateBarcodeServings()" /></div>' +
    '<div class="macro-grid-barcode">' +
      '<div class="macro-item"><span class="macro-label">Calories</span><input type="number" id="barcode-cal" value="0" /></div>' +
      '<div class="macro-item"><span class="macro-label">Protein (g)</span><input type="number" id="barcode-protein" value="0" /></div>' +
      '<div class="macro-item"><span class="macro-label">Carbs (g)</span><input type="number" id="barcode-carbs" value="0" /></div>' +
      '<div class="macro-item"><span class="macro-label">Fat (g)</span><input type="number" id="barcode-fat" value="0" /></div>' +
    '</div>' +
    '<button class="btn-primary" style="width:100%;margin-top:12px" onclick="confirmBarcodeLog()">Log This Item</button>' +
    '<button class="btn-secondary" style="width:100%;margin-top:8px" onclick="barcodeScanAgain()">Scan Another</button>' +
    '<button class="btn-secondary" style="width:100%;margin-top:8px" onclick="closeBarcodeScanner(); openManualMealLog();">Manual Entry Instead</button>';

  const panel = document.getElementById("barcode-result-panel");
  panel.dataset.per100 = JSON.stringify(per100);
  panel.dataset.perServing = perServing ? JSON.stringify(perServing) : "";
  panel.dataset.mode = modeDefault;
  panel.dataset.barcode = barcode || "";
  panel.dataset.productName = displayName;

  updateBarcodeServings();
}

function _setBarcodeMode(mode) {
  const panel = document.getElementById("barcode-result-panel");
  if (!panel) return;
  panel.dataset.mode = mode;
  panel.querySelectorAll(".barcode-mode-btn").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.mode === mode);
  });
  updateBarcodeServings();
}

function updateBarcodeServings() {
  const panel = document.getElementById("barcode-result-panel");
  if (!panel) return;
  const mode = panel.dataset.mode || "100g";
  let base = null;
  if (mode === "serving" && panel.dataset.perServing) {
    try { base = JSON.parse(panel.dataset.perServing); } catch {}
  }
  if (!base) {
    try { base = JSON.parse(panel.dataset.per100 || "{}"); } catch { base = {}; }
  }
  const s = parseFloat(document.getElementById("barcode-servings").value) || 1;
  document.getElementById("barcode-cal").value     = Math.round((base.cal     || 0) * s);
  document.getElementById("barcode-protein").value = Math.round((base.protein || 0) * s);
  document.getElementById("barcode-carbs").value   = Math.round((base.carbs   || 0) * s);
  document.getElementById("barcode-fat").value     = Math.round((base.fat     || 0) * s);
}

function showBarcodeNotFound(barcode) {
  document.getElementById("barcode-camera-panel").style.display = "none";
  document.getElementById("barcode-result-panel").style.display = "block";
  _setStatus("");

  document.getElementById("barcode-result-panel").innerHTML =
    '<div style="text-align:center;padding:20px 0">' +
      '<p style="font-weight:600;margin:0 0 8px">Product Not Found</p>' +
      '<p class="hint" style="margin:0 0 16px">Barcode ' + escHtml(barcode) + ' was not found in the Open Food Facts database.</p>' +
      '<button class="btn-primary" style="width:100%;margin-bottom:8px" onclick="closeBarcodeScanner(); openManualMealLog();">Enter Manually</button>' +
      '<button class="btn-secondary" style="width:100%" onclick="barcodeScanAgain()">Scan Again</button>' +
    '</div>';
}

function barcodeScanAgain() {
  document.getElementById("barcode-result-panel").style.display = "none";
  document.getElementById("barcode-result-panel").innerHTML = "";
  document.getElementById("barcode-camera-panel").style.display = "block";
  document.getElementById("barcode-recent-panel").style.display = "none";
  _renderCameraPanel();
  _startNativeOrFallback();
}

function confirmBarcodeLog() {
  const dateStr = typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10);
  const name = document.getElementById("barcode-name").value.trim() || "Scanned Item";
  const calories = parseInt(document.getElementById("barcode-cal").value) || 0;
  const protein  = parseInt(document.getElementById("barcode-protein").value) || 0;
  const carbs    = parseInt(document.getElementById("barcode-carbs").value) || 0;
  const fat      = parseInt(document.getElementById("barcode-fat").value) || 0;
  const panel = document.getElementById("barcode-result-panel");
  const barcode = panel.dataset.barcode || "";
  const productName = panel.dataset.productName || name;

  const meal = {
    id: typeof generateId === "function" ? generateId("meal") : "meal-" + Date.now(),
    date: dateStr,
    name,
    calories, protein, carbs, fat,
    source: "barcode_scan",
    barcode,
  };

  const meals = JSON.parse(localStorage.getItem("meals") || "[]");
  meals.push(meal);
  localStorage.setItem("meals", JSON.stringify(meals));
  if (typeof DB !== "undefined") DB.syncKey("meals");

  if (typeof trackEvent === "function") {
    trackEvent("meal_logged", { source: "barcode_scan", product_name: productName, calories });
  }

  // Save to Recent Scans in per-100g shape so quickLog multiplies correctly.
  let per100 = {};
  try { per100 = JSON.parse(panel.dataset.per100 || "{}"); } catch {}
  saveRecentScan({
    name,
    barcode,
    calories: per100.cal     || calories,
    protein:  per100.protein || protein,
    carbs:    per100.carbs   || carbs,
    fat:      per100.fat     || fat,
  });

  closeBarcodeScanner();

  if (typeof renderNutritionHistory === "function") renderNutritionHistory();
  if (typeof updateNutritionDashboard === "function") updateNutritionDashboard();
}

/* ─── Manual barcode entry (inline, in-modal) ──────────────────────────── */

function openBarcodeManualEntry() {
  _stopCameraStream();
  const panel = document.getElementById("barcode-camera-panel");
  if (!panel) return;
  panel.innerHTML =
    '<div style="padding:16px 4px">' +
      '<p class="hint" style="margin:0 0 10px">Enter the barcode number printed on the product.</p>' +
      '<input type="text" inputmode="numeric" id="barcode-manual-input" placeholder="e.g. 3017620422003" ' +
        'style="width:100%;padding:10px;margin-bottom:10px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);font-size:1rem" ' +
        'onkeydown="if(event.key===\'Enter\'){_barcodeManualSubmit()}" />' +
      '<button class="btn-primary" style="width:100%;margin-bottom:8px" onclick="_barcodeManualSubmit()">Look Up</button>' +
      '<button class="btn-secondary" style="width:100%" onclick="barcodeScanAgain()">Back to Camera</button>' +
    '</div>';
  setTimeout(() => { const el = document.getElementById("barcode-manual-input"); if (el) el.focus(); }, 100);
  _setStatus("");
}

function _barcodeManualSubmit() {
  const val = (document.getElementById("barcode-manual-input")?.value || "").trim();
  if (!val) return;
  _handleDetected(val);
}

/* ─── Permission / error panels ────────────────────────────────────────── */

function _showPermissionDenied() {
  const panel = document.getElementById("barcode-camera-panel");
  if (!panel) return;
  panel.innerHTML =
    '<div style="text-align:center;padding:24px 16px">' +
      '<p style="font-weight:600;margin:0 0 8px">Camera access needed</p>' +
      '<p class="hint" style="margin:0 0 16px">To scan barcodes, enable camera access for this site in your browser settings — or enter the number manually.</p>' +
      '<button class="btn-primary" style="width:100%;margin-bottom:8px" onclick="openBarcodeManualEntry()">Enter Barcode Manually</button>' +
      '<button class="btn-secondary" style="width:100%" onclick="closeBarcodeScanner()">Close</button>' +
    '</div>';
  _setStatus("");
}

function _showCameraError(msg) {
  const panel = document.getElementById("barcode-camera-panel");
  if (!panel) return;
  panel.innerHTML =
    '<div style="text-align:center;padding:24px 16px">' +
      '<p style="font-weight:600;margin:0 0 8px">Camera unavailable</p>' +
      '<p class="hint" style="margin:0 0 16px">' + escHtml(msg) + '</p>' +
      '<button class="btn-primary" style="width:100%;margin-bottom:8px" onclick="openBarcodeManualEntry()">Enter Barcode Manually</button>' +
      '<button class="btn-secondary" style="width:100%" onclick="closeBarcodeScanner()">Close</button>' +
    '</div>';
  _setStatus("");
}

function _setStatus(msg) {
  const el = document.getElementById("barcode-status");
  if (el) el.textContent = msg;
}

/* ─── Recent Scans ─────────────────────────────────────────────────────── */

function getRecentScans() {
  return JSON.parse(localStorage.getItem("recentScans") || "[]");
}

function saveRecentScan(item) {
  let scans = getRecentScans();
  if (item.barcode) {
    scans = scans.filter(function (s) { return s.barcode !== item.barcode; });
  }
  item.scannedAt = new Date().toISOString();
  scans.unshift(item);
  if (scans.length > 20) scans = scans.slice(0, 20);
  localStorage.setItem("recentScans", JSON.stringify(scans));
}

function renderRecentScans() {
  const panel = document.getElementById("barcode-recent-panel");
  if (!panel) return;
  const scans = getRecentScans();
  if (scans.length === 0) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  let html = '<h3 style="margin:0 0 8px">Recent Scans</h3>';
  scans.forEach(function (item, i) {
    html += '<div class="recent-scan-item" onclick="quickLogRecentScan(' + i + ')">' +
      '<div class="recent-scan-name">' + escHtml(item.name) + '</div>' +
      '<div class="recent-scan-macros">' +
        item.calories + ' cal &middot; ' + item.protein + 'p &middot; ' + item.carbs + 'c &middot; ' + item.fat + 'f' +
      '</div>' +
    '</div>';
  });
  panel.innerHTML = html;
}

function quickLogRecentScan(index) {
  const scans = getRecentScans();
  const item = scans[index];
  if (!item) return;

  const dateStr = typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10);
  const meal = {
    id: typeof generateId === "function" ? generateId("meal") : "meal-" + Date.now(),
    date: dateStr,
    name: item.name,
    calories: item.calories || 0,
    protein:  item.protein  || 0,
    carbs:    item.carbs    || 0,
    fat:      item.fat      || 0,
    source: "barcode_scan",
    barcode: item.barcode || "",
  };

  const meals = JSON.parse(localStorage.getItem("meals") || "[]");
  meals.push(meal);
  localStorage.setItem("meals", JSON.stringify(meals));
  if (typeof DB !== "undefined") DB.syncKey("meals");

  if (typeof trackEvent === "function") trackEvent("meal_logged", { source: "quick_add", product_name: item.name, calories: meal.calories });

  closeBarcodeScanner();

  if (typeof renderNutritionHistory === "function") renderNutritionHistory();
  if (typeof updateNutritionDashboard === "function") updateNutritionDashboard();
}
