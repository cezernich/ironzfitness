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
  // Prefer @zxing/browser, used directly. Earlier versions wrapped
  // html5-qrcode around it (which in turn wraps zxing), but the
  // wrapper's iOS Safari path silently failed to decode well-framed
  // UPC-A barcodes — driving zxing ourselves is the smaller surface
  // area and stops the camera lifecycle from being a black box.
  // The UMD bundle exposes the API at window.ZXing.
  if (typeof window !== "undefined" && window.ZXing && window.ZXing.BrowserMultiFormatReader) {
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

/* ─── @zxing/browser scan path ────────────────────────────────────────── */
// Drives the underlying ZXing decoder directly. Replaces the previous
// html5-qrcode wrapper, whose iOS Safari path silently failed to
// decode well-framed UPC-A barcodes despite a sharp, centered image.
// Going direct lets us own the camera lifecycle, qrbox overlay, and
// error surfaces explicitly.

async function _startFallbackScan() {
  const reader = document.getElementById("barcode-reader");
  if (!reader) return;

  // Build the inner DOM ourselves: a <video> for the live preview, a
  // qrbox bracket overlay (for visual framing), and the optional
  // dim-around-scan-area mask the user asked for. Replaces whatever
  // a previous run left behind.
  reader.innerHTML = `
    <video id="barcode-zxing-video" playsinline muted autoplay
      style="width:100%;height:100%;object-fit:cover;display:block;background:#000;border-radius:8px"></video>
    <div class="barcode-zxing-mask" aria-hidden="true"></div>
    <div class="barcode-zxing-brackets" aria-hidden="true">
      <span class="bz-corner bz-tl"></span>
      <span class="bz-corner bz-tr"></span>
      <span class="bz-corner bz-bl"></span>
      <span class="bz-corner bz-br"></span>
    </div>
  `;

  const video = document.getElementById("barcode-zxing-video");

  // Camera constraints — same intent as before: prefer 1080p + the
  // back camera + continuous autofocus so a barcode held 6-10 inches
  // from the lens stays in focus. iOS honors the `ideal` hints and
  // downgrades silently if it can't.
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width:  { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
      advanced: [{ focusMode: "continuous" }],
    },
  };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError" || err.name === "SecurityError")) {
      _showPermissionDenied();
    } else {
      _showCameraError((err && err.message) || "Camera unavailable");
    }
    return;
  }

  video.srcObject = stream;
  // iOS Safari sometimes rejects the first play() — retry once.
  try { await video.play(); }
  catch {
    try { await new Promise(r => setTimeout(r, 50)); await video.play(); }
    catch (err2) {
      _showCameraError("Couldn't start the camera preview. Try closing other camera apps and reopening.");
      stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      return;
    }
  }

  // Build the ZXing reader. decodeFromVideoElement runs internal
  // requestAnimationFrame loop, scans every frame, and fires the
  // callback exactly once per decoded code (we stop ourselves on
  // first hit). No format restriction — the multi-format reader
  // tries every supported decoder, which on a UPC-A image lights
  // up the UPC-A path immediately.
  const reader2 = new window.ZXing.BrowserMultiFormatReader();
  _scanState = { native: false, zxing: reader2, stream, video, _hintTimer: null };
  _setStatus("Point camera at a barcode");

  // After 8s with no decode, soften the message — iPhone main
  // lenses don't focus closer than ~10cm, so "too close → blurry"
  // is the dominant failure mode and "back up" usually unsticks it.
  _scanState._hintTimer = setTimeout(() => {
    if (_scanState && _scanState.zxing) {
      _setStatus("Trouble locking? Hold ~6–10 in. away with steady hands.");
    }
  }, 8000);

  reader2.decodeFromVideoElement(video, (result, err, controls) => {
    if (!_scanState || !_scanState.zxing) return;
    if (result) {
      // Decoded. Tear down before handing off so the camera light
      // turns off immediately.
      if (_scanState._hintTimer) { clearTimeout(_scanState._hintTimer); _scanState._hintTimer = null; }
      try { controls && controls.stop(); } catch {}
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      _scanState = null;
      _handleDetected(result.getText());
    }
    // Frame-level decode errors are normal (NotFoundException every
    // frame until the barcode is found) — swallow silently.
  }).catch(err => {
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
  if (_scanState.zxing) {
    // BrowserMultiFormatReader exposes reset() to tear down its
    // internal scan loop; safe to call regardless of state.
    try { _scanState.zxing.reset(); } catch {}
  }
  if (_scanState.stream && _scanState.stream.getTracks) {
    _scanState.stream.getTracks().forEach(t => { try { t.stop(); } catch {} });
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

// Open Food Facts often stores serving sizes as "113.39800 g" or
// "1 portion (113.398g)" — overly-precise numbers read as noise on
// the toggle button. Round any number with more than 1 decimal to 1.
function _roundNumbersInText(s) {
  if (!s) return s;
  return String(s).replace(/(\d+\.\d{2,})/g, (_, num) => {
    const n = parseFloat(num);
    if (!Number.isFinite(n)) return num;
    return (Math.round(n * 10) / 10).toString();
  });
}

function showBarcodeResult(product, barcode) {
  const n = product.nutriments || {};
  const name = product.product_name || product.generic_name || "Unknown Product";
  const brand = product.brands || "";
  const servingText = _roundNumbersInText(product.serving_size || "");
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

  // "Whole package" mode — uses Open Food Facts' product_quantity
  // (grams) scaled against the per-100g values. Different products
  // have different package sizes (a 113g yogurt vs a 454g lb of
  // ground beef), so this is a per-product convenience, not a
  // one-size-fits-all button. Skip silently when the field is missing
  // or zero so we don't render a misleading "0 g" pill.
  const pkgGramsRaw = product.product_quantity != null ? parseFloat(product.product_quantity) : NaN;
  const pkgGrams = Number.isFinite(pkgGramsRaw) && pkgGramsRaw > 0 ? pkgGramsRaw : null;
  const perPackage = pkgGrams ? {
    cal:     Math.round(per100.cal     * pkgGrams / 100),
    protein: Math.round(per100.protein * pkgGrams / 100),
    carbs:   Math.round(per100.carbs   * pkgGrams / 100),
    fat:     Math.round(per100.fat     * pkgGrams / 100),
  } : null;
  const pkgLabel = pkgGrams ? Math.round(pkgGrams * 10) / 10 + " g" : "";

  const modeDefault = hasServing ? "serving" : "100g";

  document.getElementById("barcode-camera-panel").style.display = "none";
  document.getElementById("barcode-result-panel").style.display = "block";
  _setStatus("");

  const servingBtn = hasServing
    ? '<button type="button" class="barcode-mode-btn is-active" data-mode="serving" onclick="_setBarcodeMode(\'serving\')">Per serving (' + escHtml(servingText) + ')</button>'
    : "";
  const per100Btn = '<button type="button" class="barcode-mode-btn' + (hasServing ? "" : " is-active") + '" data-mode="100g" onclick="_setBarcodeMode(\'100g\')">Per 100 g</button>';
  const pkgBtn = perPackage
    ? '<button type="button" class="barcode-mode-btn" data-mode="package" onclick="_setBarcodeMode(\'package\')">Whole package (' + escHtml(pkgLabel) + ')</button>'
    : "";
  const modeToggleHtml = (hasServing || perPackage)
    ? '<div class="barcode-mode-toggle">' + servingBtn + per100Btn + pkgBtn + '</div>'
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
  panel.dataset.perPackage = perPackage ? JSON.stringify(perPackage) : "";
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
  } else if (mode === "package" && panel.dataset.perPackage) {
    try { base = JSON.parse(panel.dataset.perPackage); } catch {}
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
