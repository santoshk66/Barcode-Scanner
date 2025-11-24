// ====== STATE ======
let codeReader = null;
let processingLock = false;
let lastScannedValue = null;
let lastScanTime = 0;

let currentBatch = []; // {code, format, existedBefore}
let pendingDuplicateCode = null;

// ====== STORAGE HELPERS ======
function getBatches() {
  try {
    return JSON.parse(localStorage.getItem("maizic_batches") || "[]");
  } catch {
    return [];
  }
}
function saveBatches(batches) {
  localStorage.setItem("maizic_batches", JSON.stringify(batches));
  updateBatchBadge();
}
function updateBatchBadge() {
  const badge = document.getElementById("batchInfoBadge");
  badge.textContent = `Saved batches: ${getBatches().length}`;
}

// ====== AUDIO ======
function playBeep(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") osc.frequency.value = 900;
    else if (type === "warning") osc.frequency.value = 350;
    else osc.frequency.value = 600;

    gain.gain.value = 0.15;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, type === "warning" ? 250 : 120);
  } catch {}
}

// ====== TOAST ======
let toastTimeout = null;
function showToast(msg, variant = "success") {
  const el = document.getElementById("toast");
  const txt = document.getElementById("toastText");
  txt.textContent = msg;
  el.className = "toast show toast-" + variant;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { el.className = "toast"; }, 2200);
}

// ====== OVERLAY ======
function flashOverlay(type) {
  const success = document.getElementById("successOverlay");
  const warning = document.getElementById("warningOverlay");
  const target = type === "success" ? success : warning;
  target.classList.add("show");
  setTimeout(() => target.classList.remove("show"), 180);
}

// ====== BATCH RENDER ======
function renderCurrentBatch() {
  const tbody = document.getElementById("batchTableBody");
  tbody.innerHTML = "";

  if (!currentBatch.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="empty-row">No barcodes scanned yet.</td></tr>';
  } else {
    currentBatch.forEach((item, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${item.code}</td>
        <td>${item.format || "-"}</td>
        <td>${
          item.existedBefore
            ? '<span class="tag tag-dup">Yes</span>'
            : '<span class="tag">No</span>'
        }</td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById("batchCount").textContent = String(currentBatch.length);
  const finishBtn = document.getElementById("finishBatchBtn");
  const hasName = document.getElementById("scannerName").value.trim().length > 0;
  finishBtn.disabled = !(currentBatch.length && hasName);
}

function existsInCurrentBatch(code) {
  return currentBatch.some((b) => b.code === code);
}
function existsInPreviousBatches(code) {
  const batches = getBatches();
  for (const batch of batches) {
    if (batch.barcodes && batch.barcodes.some((b) => b.code === code)) return true;
  }
  return false;
}

// ====== SCAN HANDLER ======
function handleBarcodeScanned(code, format) {
  const scannerName = document.getElementById("scannerName").value.trim();
  if (!scannerName) {
    showToast("Set scanner name before scanning.", "error");
    playBeep("warning");
    flashOverlay("warning");
    return;
  }

  if (existsInCurrentBatch(code)) {
    showToast("Duplicate in current batch – ignored.", "warning");
    playBeep("warning");
    flashOverlay("warning");
    return;
  }

  const existedBefore = existsInPreviousBatches(code);

  currentBatch.push({ code, format, existedBefore });
  renderCurrentBatch();
  playBeep("success");
  flashOverlay("success");
  showToast("Scanned: " + code, "success");

  if (existedBefore) {
    pendingDuplicateCode = code;
    document.getElementById("duplicateModalText").textContent =
      `Barcode "${code}" has been scanned in an earlier batch. Do you want to keep it in the current batch?`;
    document.getElementById("duplicateModalBackdrop").classList.add("show");
    playBeep("warning");
  }
}

// ====== CAMERA ======
async function startCamera() {
  if (codeReader) return;

  codeReader = new ZXing.BrowserMultiFormatReader();
  document.getElementById("startCameraBtn").disabled = true;
  document.getElementById("stopCameraBtn").disabled = false;

  try {
    await codeReader.decodeFromVideoDevice(null, "video", (result, err) => {
      if (result) {
        const now = Date.now();
        const value = result.getText();
        if (
          processingLock &&
          value === lastScannedValue &&
          now - lastScanTime < 1500
        ) return;

        processingLock = true;
        lastScannedValue = value;
        lastScanTime = now;

        handleBarcodeScanned(
          value,
          result.getBarcodeFormat && result.getBarcodeFormat()
        );

        setTimeout(() => { processingLock = false; }, 700);
      }
    });
  } catch (e) {
    console.error(e);
    showToast("Could not start camera. Check permissions.", "error");
    document.getElementById("startCameraBtn").disabled = false;
    document.getElementById("stopCameraBtn").disabled = true;
    if (codeReader) { codeReader.reset(); codeReader = null; }
  }
}

function stopCamera() {
  if (codeReader) {
    codeReader.reset();
    codeReader = null;
  }
  document.getElementById("startCameraBtn").disabled = false;
  document.getElementById("stopCameraBtn").disabled = true;
}

// ====== FINISH BATCH ======
function openFinishModal() {
  if (!currentBatch.length) {
    showToast("Scan at least one barcode.", "warning");
    return;
  }
  if (!document.getElementById("scannerName").value.trim()) {
    showToast("Scanner name is required.", "warning");
    return;
  }
  document.getElementById("partnerSelect").value = "";
  document.getElementById("finishModalBackdrop").classList.add("show");
}

function saveCurrentBatch() {
  const partner = document.getElementById("partnerSelect").value;
  const scannerName = document.getElementById("scannerName").value.trim();
  if (!partner) {
    showToast("Select a delivery partner.", "warning");
    return;
  }

  const batches = getBatches();
  const newBatch = {
    id: "batch_" + Date.now(),
    scannerName,
    partner,
    createdAt: new Date().toISOString(),
    barcodes: currentBatch,
  };
  batches.push(newBatch);
  saveBatches(batches);

  currentBatch = [];
  renderCurrentBatch();
  document.getElementById("finishModalBackdrop").classList.remove("show");
  showToast("Batch saved successfully.", "success");
  playBeep("success");
}

// ====== EVENTS ======
document.getElementById("startCameraBtn").addEventListener("click", startCamera);
document.getElementById("stopCameraBtn").addEventListener("click", stopCamera);
document.getElementById("finishBatchBtn").addEventListener("click", openFinishModal);

document.getElementById("finishCancelBtn").addEventListener("click", () => {
  document.getElementById("finishModalBackdrop").classList.remove("show");
});
document.getElementById("finishConfirmBtn").addEventListener("click", saveCurrentBatch);

document.getElementById("duplicateCancelBtn").addEventListener("click", () => {
  if (pendingDuplicateCode) {
    currentBatch = currentBatch.filter((b) => b.code !== pendingDuplicateCode);
    renderCurrentBatch();
  }
  pendingDuplicateCode = null;
  document.getElementById("duplicateModalBackdrop").classList.remove("show");
  showToast("Duplicate removed from current batch.", "warning");
});
document.getElementById("duplicateAddBtn").addEventListener("click", () => {
  pendingDuplicateCode = null;
  document.getElementById("duplicateModalBackdrop").classList.remove("show");
  showToast("Duplicate kept in current batch.", "success");
});

document.getElementById("scannerName").addEventListener("input", (e) => {
  localStorage.setItem("maizic_scanner_name", e.target.value.trim());
  renderCurrentBatch();
});

// ====== INIT ======
(function init() {
  const savedName = localStorage.getItem("maizic_scanner_name");
  if (savedName) document.getElementById("scannerName").value = savedName;
  updateBatchBadge();
  renderCurrentBatch();
})();
