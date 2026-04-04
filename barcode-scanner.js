// barcode-scanner.js — Barcode scanning for food logging via html5-qrcode + Open Food Facts

let barcodeScanner = null;

function openBarcodeScanner() {
  const modal = document.getElementById("barcode-scanner-modal");
  if (!modal) return;
  modal.style.display = "flex";
  document.getElementById("barcode-result-panel").style.display = "none";
  document.getElementById("barcode-camera-panel").style.display = "block";
  document.getElementById("barcode-recent-panel").style.display = "none";
  document.getElementById("barcode-status").textContent = "Starting camera...";

  // Render recent scans below camera
  renderRecentScans();

  const readerEl = document.getElementById("barcode-reader");
  readerEl.innerHTML = "";

  if (typeof Html5Qrcode === "undefined") {
    document.getElementById("barcode-status").textContent = "Scanner library not loaded. Check your connection.";
    return;
  }

  barcodeScanner = new Html5Qrcode("barcode-reader");
  barcodeScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
    function (decodedText) {
      // Success
      onBarcodeDetected(decodedText);
    },
    function () {
      // Ignore scan errors (no code found yet)
    }
  ).then(function () {
    document.getElementById("barcode-status").textContent = "Point camera at a barcode";
  }).catch(function (err) {
    document.getElementById("barcode-status").textContent = "Camera error: " + err;
  });
}

function closeBarcodeScanner() {
  var modal = document.getElementById("barcode-scanner-modal");
  if (modal) modal.style.display = "none";
  if (barcodeScanner) {
    barcodeScanner.stop().catch(function () {});
    barcodeScanner = null;
  }
}

function onBarcodeDetected(barcode) {
  // Stop scanning
  if (barcodeScanner) {
    barcodeScanner.stop().catch(function () {});
    barcodeScanner = null;
  }

  document.getElementById("barcode-status").textContent = "Looking up barcode: " + barcode + "...";

  fetch("https://world.openfoodfacts.org/api/v2/product/" + encodeURIComponent(barcode) + ".json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.status === 1 && data.product) {
        showBarcodeResult(data.product, barcode);
      } else {
        showBarcodeNotFound(barcode);
      }
    })
    .catch(function () {
      showBarcodeNotFound(barcode);
    });
}

function showBarcodeResult(product, barcode) {
  var n = product.nutriments || {};
  var name = product.product_name || product.generic_name || "Unknown Product";
  var brand = product.brands || "";
  var serving = product.serving_size || "";
  var calories = Math.round(n["energy-kcal_100g"] || n["energy-kcal"] || 0);
  var protein = Math.round(n.proteins_100g || n.proteins || 0);
  var carbs = Math.round(n.carbohydrates_100g || n.carbohydrates || 0);
  var fat = Math.round(n.fat_100g || n.fat || 0);

  var displayName = brand ? name + " (" + brand + ")" : name;

  document.getElementById("barcode-camera-panel").style.display = "none";
  document.getElementById("barcode-result-panel").style.display = "block";
  document.getElementById("barcode-status").textContent = "";

  document.getElementById("barcode-result-panel").innerHTML =
    '<h3 style="margin:0 0 8px">Product Found</h3>' +
    '<p style="font-weight:600;margin:0 0 4px">' + escHtml(displayName) + '</p>' +
    (serving ? '<p class="hint" style="margin:0 0 12px">Serving: ' + escHtml(serving) + '</p>' : '<p class="hint" style="margin:0 0 12px">Values per 100g</p>') +
    '<div class="form-row"><label for="barcode-name">Name</label>' +
    '<input type="text" id="barcode-name" value="' + escHtml(displayName).replace(/"/g, '&quot;') + '" /></div>' +
    '<div class="form-row"><label for="barcode-servings">Servings</label>' +
    '<input type="number" id="barcode-servings" value="1" min="0.25" step="0.25" onchange="updateBarcodeServings()" oninput="updateBarcodeServings()" /></div>' +
    '<div class="macro-grid-barcode">' +
      '<div class="macro-item"><span class="macro-label">Calories</span><input type="number" id="barcode-cal" value="' + calories + '" /></div>' +
      '<div class="macro-item"><span class="macro-label">Protein (g)</span><input type="number" id="barcode-protein" value="' + protein + '" /></div>' +
      '<div class="macro-item"><span class="macro-label">Carbs (g)</span><input type="number" id="barcode-carbs" value="' + carbs + '" /></div>' +
      '<div class="macro-item"><span class="macro-label">Fat (g)</span><input type="number" id="barcode-fat" value="' + fat + '" /></div>' +
    '</div>' +
    '<button class="btn-primary" style="width:100%;margin-top:12px" onclick="confirmBarcodeLog()">Log This Item</button>' +
    '<button class="btn-secondary" style="width:100%;margin-top:8px" onclick="barcodeScanAgain()">Scan Another</button>' +
    '<button class="btn-secondary" style="width:100%;margin-top:8px" onclick="closeBarcodeScanner(); openManualMealLog();">Manual Entry Instead</button>';

  // Store base values for serving multiplier
  document.getElementById("barcode-result-panel").dataset.baseCal = calories;
  document.getElementById("barcode-result-panel").dataset.baseProtein = protein;
  document.getElementById("barcode-result-panel").dataset.baseCarbs = carbs;
  document.getElementById("barcode-result-panel").dataset.baseFat = fat;
  document.getElementById("barcode-result-panel").dataset.barcode = barcode || "";
}

function updateBarcodeServings() {
  var panel = document.getElementById("barcode-result-panel");
  var s = parseFloat(document.getElementById("barcode-servings").value) || 1;
  document.getElementById("barcode-cal").value = Math.round((parseFloat(panel.dataset.baseCal) || 0) * s);
  document.getElementById("barcode-protein").value = Math.round((parseFloat(panel.dataset.baseProtein) || 0) * s);
  document.getElementById("barcode-carbs").value = Math.round((parseFloat(panel.dataset.baseCarbs) || 0) * s);
  document.getElementById("barcode-fat").value = Math.round((parseFloat(panel.dataset.baseFat) || 0) * s);
}

function showBarcodeNotFound(barcode) {
  document.getElementById("barcode-camera-panel").style.display = "none";
  document.getElementById("barcode-result-panel").style.display = "block";
  document.getElementById("barcode-status").textContent = "";

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
  openBarcodeScanner();
}

function confirmBarcodeLog() {
  var dateStr = typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10);
  var name = document.getElementById("barcode-name").value.trim() || "Scanned Item";
  var calories = parseInt(document.getElementById("barcode-cal").value) || 0;
  var protein = parseInt(document.getElementById("barcode-protein").value) || 0;
  var carbs = parseInt(document.getElementById("barcode-carbs").value) || 0;
  var fat = parseInt(document.getElementById("barcode-fat").value) || 0;
  var barcode = document.getElementById("barcode-result-panel").dataset.barcode || "";

  var meal = {
    id: typeof generateId === "function" ? generateId("meal") : "meal-" + Date.now(),
    date: dateStr,
    name: name,
    calories: calories,
    protein: protein,
    carbs: carbs,
    fat: fat,
    source: "barcode",
    barcode: barcode
  };

  var meals = JSON.parse(localStorage.getItem("meals") || "[]");
  meals.push(meal);
  localStorage.setItem("meals", JSON.stringify(meals));

  // Save to recent scans
  saveRecentScan({
    name: name,
    barcode: barcode,
    calories: parseInt(document.getElementById("barcode-result-panel").dataset.baseCal) || calories,
    protein: parseInt(document.getElementById("barcode-result-panel").dataset.baseProtein) || protein,
    carbs: parseInt(document.getElementById("barcode-result-panel").dataset.baseCarbs) || carbs,
    fat: parseInt(document.getElementById("barcode-result-panel").dataset.baseFat) || fat
  });

  closeBarcodeScanner();

  // Refresh nutrition UI
  if (typeof renderNutritionHistory === "function") renderNutritionHistory();
  if (typeof updateNutritionDashboard === "function") updateNutritionDashboard();
}

// --- Recent Scans ---

function getRecentScans() {
  return JSON.parse(localStorage.getItem("recentScans") || "[]");
}

function saveRecentScan(item) {
  var scans = getRecentScans();
  // Remove duplicate by barcode if exists
  if (item.barcode) {
    scans = scans.filter(function (s) { return s.barcode !== item.barcode; });
  }
  item.scannedAt = new Date().toISOString();
  scans.unshift(item);
  if (scans.length > 20) scans = scans.slice(0, 20);
  localStorage.setItem("recentScans", JSON.stringify(scans));
}

function renderRecentScans() {
  var panel = document.getElementById("barcode-recent-panel");
  if (!panel) return;
  var scans = getRecentScans();
  if (scans.length === 0) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";
  var html = '<h3 style="margin:0 0 8px">Recent Scans</h3>';
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
  var scans = getRecentScans();
  var item = scans[index];
  if (!item) return;

  var dateStr = typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10);
  var meal = {
    id: typeof generateId === "function" ? generateId("meal") : "meal-" + Date.now(),
    date: dateStr,
    name: item.name,
    calories: item.calories || 0,
    protein: item.protein || 0,
    carbs: item.carbs || 0,
    fat: item.fat || 0,
    source: "barcode",
    barcode: item.barcode || ""
  };

  var meals = JSON.parse(localStorage.getItem("meals") || "[]");
  meals.push(meal);
  localStorage.setItem("meals", JSON.stringify(meals));

  closeBarcodeScanner();

  if (typeof renderNutritionHistory === "function") renderNutritionHistory();
  if (typeof updateNutritionDashboard === "function") updateNutritionDashboard();
}
