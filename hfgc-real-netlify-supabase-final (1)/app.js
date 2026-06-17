const HFGC_SITE_URL = "https://europehfgcfunddrive2026.netlify.app/";
const districtLocales = {"UK, NORTHERN & EASTERN EUROPE DISTRICT": ["LONDON", "BERKSHIRE", "STAFFORDSHIRE", "MANCHESTER", "NORWAY", "LIVERPOOL", "FINLAND", "WALES", "IRELAND", "RUSSIA", "HUNGARY RRB", "CZECH REPUBLIC RRB", "SCOTLAND RRB", "SWEDEN / DENMARK RRB", "OTHER"], "WESTERN EUROPE DISTRICT": ["NICE", "MARSEILLE", "PARIS", "AMSTERDAM", "BELGIUM", "GENEVE", "ZURICH", "VIENNA", "MÖNCHENGLADBACH GERMANY", "BERLIN GERMANY RRB", "OTHER"], "SOUTHERN EUROPE DISTRICT": ["MADRID (VALLECAS, ARGANZUELA, PALMA DE MALLORCA)", "BARCELONA", "MARBELLA", "FUENGIROLA", "PORTUGAL", "GRAN CANARIA", "MILAN", "TORINO", "FLORENCE", "ROME", "MALTA", "CAGLIARI", "ATHENS", "CYPRUS", "GIBRALTAR RRB", "THESSALONIKI RRB", "OTHER"], "OTHER": ["OTHER"]};

const api = (path, options = {}) => fetch(`/api/${path}`, {
  ...options,
  headers: {
    "Content-Type": "application/json",
    ...(options.headers || {})
  }
}).then(async response => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
});

function token() { return localStorage.getItem("hfgc_token") || ""; }
function euro(n) { return "€" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function safe(v) { return String(v || "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function buildDistrictOptions(selected="") { return Object.keys(districtLocales).map(d => `<option value="${safe(d)}" ${d===selected?"selected":""}>${safe(d)}</option>`).join(""); }
function buildLocaleOptions(district, selected="") { return (districtLocales[district] || []).map(l => `<option value="${safe(l)}" ${l===selected?"selected":""}>${safe(l)}</option>`).join(""); }

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (file.size > 4500000) return reject(new Error("Proof file is too large. Please upload below 4.5MB."));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function calculateTotals(entries) {
  const received = entries.filter(e => e.status === "Received");
  const pending = entries.filter(e => e.status !== "Received");
  const receivedTotal = received.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const pendingTotal = pending.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  return { receivedTotal, pendingTotal, total: receivedTotal + pendingTotal };
}

function groupTotals(entries, key) {
  const grouped = {};
  entries.forEach(entry => {
    const groupName = entry[key] || "Other";
    if (!grouped[groupName]) grouped[groupName] = { name: groupName, total: 0, count: 0 };
    grouped[groupName].total += Number(entry.amount || 0);
    grouped[groupName].count += 1;
  });
  return Object.values(grouped).sort((a, b) => b.total - a.total);
}

function renderPaymentBreakdown(entries) {
  const methods = ["CASH", "BANK TRANSFER", "PLEDGE", "CHECK", "CARD", "OTHER"];
  document.getElementById("paymentBreakdownRows").innerHTML = methods.map(method => {
    const received = entries.filter(e => e.payment_method === method && e.status === "Received").reduce((s,e)=>s+Number(e.amount||0),0);
    const pending = entries.filter(e => e.payment_method === method && e.status !== "Received").reduce((s,e)=>s+Number(e.amount||0),0);
    return `<tr><td>${safe(method)}</td><td>${euro(received)}</td><td>${euro(pending)}</td><td>${euro(received+pending)}</td></tr>`;
  }).join("");
}

async function loadPublicData() {
  return await api("public");
}

async function initPublicPage() {
  const districtSelect = document.getElementById("district");
  const localeSelect = document.getElementById("locale");
  const otherDistrictWrap = document.getElementById("otherDistrictWrap");
  const otherLocaleWrap = document.getElementById("otherLocaleWrap");
  const otherDistrict = document.getElementById("otherDistrict");
  const otherLocale = document.getElementById("otherLocale");
  const paymentMethod = document.getElementById("payment_method");
  const bankDetails = document.getElementById("bankDetails");
  const pledgeDateWrap = document.getElementById("pledgeDateWrap");
  const pledgeDate = document.getElementById("pledgeDate");
  const form = document.getElementById("donationForm");
  const sortMode = document.getElementById("sortMode");

  districtSelect.innerHTML = '<option value="">Select District</option>' + buildDistrictOptions();

  function updateDistrictLocaleFields() {
    const selectedDistrict = districtSelect.value;
    otherDistrictWrap.style.display = selectedDistrict === "OTHER" ? "grid" : "none";
    otherDistrict.required = selectedDistrict === "OTHER";
    localeSelect.innerHTML = '<option value="">Select Locale</option>' + buildLocaleOptions(selectedDistrict);
    updateLocaleOtherField();
  }
  function updateLocaleOtherField() {
    otherLocaleWrap.style.display = localeSelect.value === "OTHER" ? "grid" : "none";
    otherLocale.required = localeSelect.value === "OTHER";
  }
  function updatePaymentFields() {
    bankDetails.style.display = paymentMethod.value === "BANK TRANSFER" ? "block" : "none";
    pledgeDateWrap.style.display = paymentMethod.value === "PLEDGE" ? "grid" : "none";
    pledgeDate.required = paymentMethod.value === "PLEDGE";
  }

  districtSelect.addEventListener("change", updateDistrictLocaleFields);
  localeSelect.addEventListener("change", updateLocaleOtherField);
  paymentMethod.addEventListener("change", updatePaymentFields);
  sortMode.addEventListener("change", renderPublicList);
  document.getElementById("progressView").addEventListener("change", renderPublicList);

  form.addEventListener("submit", async function(e) {
    e.preventDefault();
    try {
      const selectedDistrict = districtSelect.value;
      const selectedLocale = localeSelect.value;
      const finalDistrict = selectedDistrict === "OTHER" ? otherDistrict.value.trim() : selectedDistrict;
      const finalLocale = selectedLocale === "OTHER" ? otherLocale.value.trim() : selectedLocale;
      const proofFile = document.getElementById("proof")?.files?.[0];
      const proofData = paymentMethod.value === "BANK TRANSFER" ? await fileToDataUrl(proofFile) : "";
      if (!finalDistrict || !finalLocale) return alert("Please complete district and locale.");

      await api("donations", {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("name").value.trim(),
          district: finalDistrict,
          locale: finalLocale,
          amount: Number(document.getElementById("amount").value || 0),
          payment_method: paymentMethod.value,
          pledge_date: paymentMethod.value === "PLEDGE" ? pledgeDate.value : "",
          note: document.getElementById("note").value.trim(),
          proof: proofData
        })
      });

      form.reset();
      localeSelect.innerHTML = '<option value="">Select District First</option>';
      otherDistrictWrap.style.display = "none";
      otherLocaleWrap.style.display = "none";
      bankDetails.style.display = "none";
      pledgeDateWrap.style.display = "none";
      document.getElementById("success").style.display = "block";
      setTimeout(() => document.getElementById("success").style.display = "none", 3000);
      await renderPublicList();
    } catch (error) {
      alert(error.message);
    }
  });

  await renderPublicList();
}

async function renderPublicList() {
  const data = await loadPublicData();
  const entries = data.entries || [];
  const settings = data.settings || { goal: 250000, show_progress: true, show_leaderboard: true };
  const totals = calculateTotals(entries);
  const goal = Number(settings.goal || 250000);
  const percent = goal > 0 ? Math.min(100, Math.round((totals.receivedTotal / goal) * 100)) : 0;

  document.getElementById("progressCard").style.display = settings.show_progress ? "block" : "none";
  document.getElementById("leaderboardCard").style.display = settings.show_leaderboard ? "block" : "none";
  document.getElementById("liveTotal").textContent = euro(totals.receivedTotal);
  document.getElementById("progressPercent").textContent = percent;
  document.getElementById("goalText").textContent = euro(goal);
  document.getElementById("progressBar").style.width = percent + "%";
  document.getElementById("receivedTotal").textContent = euro(totals.receivedTotal);
  document.getElementById("pendingTotal").textContent = euro(totals.pendingTotal);
  document.getElementById("overallTotal").textContent = euro(totals.total);
  document.getElementById("totalEntriesProgress").textContent = entries.length;
  document.getElementById("totalEntries").textContent = entries.length;
  document.getElementById("totalAmount").textContent = euro(totals.total);

  const progressView = document.getElementById("progressView").value;
  document.getElementById("progressSummaryView").style.display = progressView === "summary" ? "block" : "none";
  document.getElementById("paymentBreakdownView").style.display = progressView === "payment" ? "block" : "none";
  renderPaymentBreakdown(entries);

  const mode = document.getElementById("sortMode").value;
  const rowsEl = document.getElementById("donationRows");
  const tableHead = document.getElementById("tableHead");

  if (mode === "district" || mode === "locale") {
    const label = mode === "district" ? "District" : "Locale";
    const groups = groupTotals(entries, mode);
    tableHead.innerHTML = `<tr><th>Rank</th><th>${label}</th><th>Total Amount</th><th>Total Entries</th></tr>`;
    rowsEl.innerHTML = groups.length ? groups.map((g, i) => `<tr><td>${i+1}</td><td>${safe(g.name)}</td><td>${euro(g.total)}</td><td>${g.count}</td></tr>`).join("") : '<tr><td colspan="4" class="empty">No entries yet.</td></tr>';
    return;
  }

  const sorted = entries.slice().sort((a,b) => {
    if (mode === "highest") return Number(b.amount) - Number(a.amount);
    if (mode === "lowest") return Number(a.amount) - Number(b.amount);
    if (mode === "az") return a.name.localeCompare(b.name);
    if (mode === "za") return b.name.localeCompare(a.name);
    return Number(b.amount) - Number(a.amount);
  });
  tableHead.innerHTML = `<tr><th>Rank</th><th>Name</th><th>District</th><th>Locale</th><th>Amount</th><th>Status</th></tr>`;
  rowsEl.innerHTML = sorted.length ? sorted.map((e, i) => `<tr><td>${i+1}</td><td>${safe(e.name)}</td><td>${safe(e.district)}</td><td>${safe(e.locale)}</td><td>${euro(e.amount)}</td><td>${safe(e.status || "Pending")}</td></tr>`).join("") : '<tr><td colspan="6" class="empty">No entries yet.</td></tr>';
}

function initLoginPage() {
  document.getElementById("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    try {
      const data = await api("login", {
        method: "POST",
        body: JSON.stringify({ username: document.getElementById("username").value, password: document.getElementById("password").value })
      });
      localStorage.setItem("hfgc_token", data.token);
      location.href = "admin.html";
    } catch {
      document.getElementById("loginError").style.display = "block";
    }
  });
}

function logoutAdmin() {
  localStorage.removeItem("hfgc_token");
  location.href = "login.html";
}

async function adminApi(path, payload={}, method="POST") {
  return await api(path, {
    method,
    headers: { Authorization: `Bearer ${token()}` },
    body: method === "GET" ? undefined : JSON.stringify(payload)
  });
}

async function initAdminPage() {
  const adminDistrict = document.getElementById("adminDistrict");
  const adminLocale = document.getElementById("adminLocale");
  const adminOtherDistrict = document.getElementById("adminOtherDistrict");
  const adminOtherLocale = document.getElementById("adminOtherLocale");
  const adminPayment = document.getElementById("adminPayment");
  const adminPledgeDate = document.getElementById("adminPledgeDate");

  adminDistrict.innerHTML = '<option value="">Select District</option>' + buildDistrictOptions();

  function updateAdminDistrictLocale() {
    adminOtherDistrict.style.display = adminDistrict.value === "OTHER" ? "block" : "none";
    adminOtherDistrict.required = adminDistrict.value === "OTHER";
    adminLocale.innerHTML = '<option value="">Select Locale</option>' + buildLocaleOptions(adminDistrict.value);
    updateAdminLocaleOther();
  }
  function updateAdminLocaleOther() {
    adminOtherLocale.style.display = adminLocale.value === "OTHER" ? "block" : "none";
    adminOtherLocale.required = adminLocale.value === "OTHER";
  }
  function updateAdminPaymentFields() {
    adminPledgeDate.style.display = adminPayment.value === "PLEDGE" ? "block" : "none";
    adminPledgeDate.required = adminPayment.value === "PLEDGE";
  }

  adminDistrict.addEventListener("change", updateAdminDistrictLocale);
  adminLocale.addEventListener("change", updateAdminLocaleOther);
  adminPayment.addEventListener("change", updateAdminPaymentFields);

  document.getElementById("goalForm").addEventListener("submit", async e => {
    e.preventDefault();
    await adminApi("settings", { goal: Number(document.getElementById("goalInput").value || 0) });
    await renderAdmin();
  });
  document.getElementById("toggleProgressBtn").addEventListener("click", async () => { await adminApi("toggle-progress"); await renderAdmin(); });
  document.getElementById("toggleLeaderboardBtn").addEventListener("click", async () => { await adminApi("toggle-leaderboard"); await renderAdmin(); });

  document.getElementById("adminAddForm").addEventListener("submit", async e => {
    e.preventDefault();
    const finalDistrict = adminDistrict.value === "OTHER" ? adminOtherDistrict.value.trim() : adminDistrict.value;
    const finalLocale = adminLocale.value === "OTHER" ? adminOtherLocale.value.trim() : adminLocale.value;
    if (!finalDistrict || !finalLocale) return alert("Please complete district and locale.");
    await adminApi("admin/add", {
      name: document.getElementById("adminName").value.trim(),
      district: finalDistrict,
      locale: finalLocale,
      amount: Number(document.getElementById("adminAmount").value || 0),
      payment_method: adminPayment.value,
      pledge_date: adminPayment.value === "PLEDGE" ? adminPledgeDate.value : "",
      status: document.getElementById("adminStatus").value,
      note: document.getElementById("adminNote").value.trim()
    });
    e.target.reset();
    adminLocale.innerHTML = '<option value="">Select District First</option>';
    adminOtherDistrict.style.display = "none";
    adminOtherLocale.style.display = "none";
    adminPledgeDate.style.display = "none";
    await renderAdmin();
  });

  await renderAdmin();
}

async function renderAdmin() {
  try {
    const data = await adminApi("admin", {}, "GET");
    const entries = data.entries || [];
    const settings = data.settings || { goal: 250000, show_progress: true, show_leaderboard: true };
    const totals = calculateTotals(entries);

    document.getElementById("adminReceived").textContent = euro(totals.receivedTotal);
    document.getElementById("adminPending").textContent = euro(totals.pendingTotal);
    document.getElementById("adminGoal").textContent = euro(settings.goal);
    document.getElementById("adminCount").textContent = entries.length;
    document.getElementById("goalInput").value = settings.goal;
    document.getElementById("progressStatus").textContent = settings.show_progress ? "Visible" : "Hidden";
    document.getElementById("leaderboardStatus").textContent = settings.show_leaderboard ? "Visible" : "Hidden";

    const sorted = entries.slice().sort((a,b) => Number(b.amount) - Number(a.amount));
    document.getElementById("adminRows").innerHTML = sorted.length ? sorted.map(e => `
      <tr>
        <td>${safe(e.name)}</td><td>${safe(e.district)}</td><td>${safe(e.locale)}</td><td>${euro(e.amount)}</td>
        <td>${safe(e.payment_method)}</td><td>${safe(e.pledge_date || "—")}</td><td>${safe(e.status || "Pending")}</td>
        <td>${e.proof ? `<button onclick="viewProof('${e.id}')">View</button>` : "—"}</td>
        <td>
          <button onclick="setStatus('${e.id}', 'Received')">Received</button>
          <button onclick="setStatus('${e.id}', 'Pending')">Pending</button>
          <button class="danger-btn small-btn" onclick="deleteEntry('${e.id}')">Delete</button>
        </td>
      </tr>`).join("") : '<tr><td colspan="9" class="empty">No entries yet.</td></tr>';
  } catch (error) {
    location.href = "login.html";
  }
}

async function setStatus(id, status) { await adminApi("status", { id, status }); await renderAdmin(); }
async function deleteEntry(id) { if (confirm("Delete this entry?")) { await adminApi("delete", { id }); await renderAdmin(); } }
async function viewProof(id) {
  const data = await adminApi(`proof/${id}`, {}, "GET");
  const w = window.open();
  if (data.proof.startsWith("data:application/pdf")) w.document.write(`<iframe src="${data.proof}" style="width:100%;height:100vh;border:0"></iframe>`);
  else w.document.write(`<img src="${data.proof}" style="max-width:100%;height:auto">`);
}


async function getAdminExportRows() {
  const data = await adminApi("admin", {}, "GET");
  return data.entries || [];
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportAdminCSV() {
  try {
    const rows = await getAdminExportRows();

    const headers = [
      "Name",
      "District",
      "Locale",
      "Amount",
      "Payment Method",
      "Pledge Date",
      "Status",
      "Note",
      "Created At",
      "Has Proof"
    ];

    const csvRows = [
      headers.map(csvEscape).join(","),
      ...rows.map(row => [
        row.name,
        row.district,
        row.locale,
        Number(row.amount || 0).toFixed(2),
        row.payment_method,
        row.pledge_date || "",
        row.status || "Pending",
        row.note || "",
        row.created_at || "",
        row.proof ? "Yes" : "No"
      ].map(csvEscape).join(","))
    ];

    const blob = new Blob(["\ufeff" + csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `hfgc-fund-drive-donations-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    alert("Export failed: " + error.message);
  }
}

async function exportAdminGoogleSheet() {
  try {
    await exportAdminCSV();
    window.open("https://sheets.new", "_blank");
  } catch (error) {
    alert("Google Sheets export failed: " + error.message);
  }
}

window.logoutAdmin = logoutAdmin;
window.setStatus = setStatus;
window.deleteEntry = deleteEntry;
window.viewProof = viewProof;
window.exportAdminCSV = exportAdminCSV;
window.exportAdminGoogleSheet = exportAdminGoogleSheet;
