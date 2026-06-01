/**
 * CadaSys — Digital Cadastral Land Registration System
 * Version: 2.1.0
 *
 * Architecture:
 * - Pure vanilla JS, no framework dependencies
 * - localStorage-based persistence (offline-first)
 * - Modular: DB layer → Business logic → UI layer
 * - Generic model: districts/woredas are user-configurable
 *
 * Data Model:
 *   settings   : { regionName, orgName, certPrefix, areaUnit, syncUrl, apiKey, autoSync }
 *   districts  : [{ id, name, zone, target, hectaresTarget, lat, lng, status, createdAt }]
 *   farmers    : [{ id, firstName, fatherName, grandfatherName, nationalId, gender, phone,
 *                   districtId, village, lat, lng, hectares, landUse, parcelId, acquisition,
 *                   boundaries, spouse, spouseId, status, certNumber, registeredAt, docs }]
 *   transfers  : [{ id, certNumber, from, to, type, date, notes, createdAt }]
 *   activity   : [{ icon, text, time }]  (last 50)
 */

/* ══════════════════════════════════
   DATABASE LAYER (localStorage)
══════════════════════════════════ */

const DB = {
  KEYS: { settings: 'cs_settings', districts: 'cs_districts', farmers: 'cs_farmers', transfers: 'cs_transfers', activity: 'cs_activity', pending: 'cs_pending' },

  get(key) {
    try { return JSON.parse(localStorage.getItem(this.KEYS[key]) || 'null'); }
    catch { return null; }
  },
  set(key, val) {
    try { localStorage.setItem(this.KEYS[key], JSON.stringify(val)); return true; }
    catch(e) { console.error('DB.set error:', e); return false; }
  },

  getSettings() { return this.get('settings') || { regionName: '', orgName: '', certPrefix: 'LR', areaUnit: 'ha', syncUrl: '', apiKey: '', autoSync: true }; },
  getDistricts() { return this.get('districts') || []; },
  getFarmers() { return this.get('farmers') || []; },
  getTransfers() { return this.get('transfers') || []; },
  getActivity() { return this.get('activity') || []; },
  getPending() { return this.get('pending') || []; },

  saveSettings(s) { return this.set('settings', s); },
  saveDistricts(d) { return this.set('districts', d); },
  saveFarmers(f) { return this.set('farmers', f); },
  saveTransfers(t) { return this.set('transfers', t); },

  addActivity(icon, text) {
    const list = this.getActivity();
    list.unshift({ icon, text, time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) });
    if (list.length > 50) list.splice(50);
    this.set('activity', list);
  },

  addPending(record) {
    const p = this.getPending();
    p.push({ ...record, pendingAt: Date.now() });
    this.set('pending', p);
  },

  clearPending() { this.set('pending', []); },

  storageUsedKB() {
    let total = 0;
    Object.values(this.KEYS).forEach(k => { total += (localStorage.getItem(k) || '').length; });
    return (total / 1024).toFixed(1);
  }
};

/* ══════════════════════════════════
   UTILITIES
══════════════════════════════════ */

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function today() { return new Date().toISOString().slice(0, 10); }

function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString() : '—'; }

function fmtNum(n) { return Number(n).toLocaleString(); }

function certNum(prefix, count) {
  return `${prefix || 'LR'}-${new Date().getFullYear()}-${String(count).padStart(5, '0')}`;
}

function statusBadge(s) {
  const map = { registered: 'green', pending: 'amber', incomplete: 'red', active: 'green', completed: 'blue', draft: 'amber' };
  return `<span class="badge badge-${map[s] || 'amber'}">${s}</span>`;
}

function pctColor(p) { return p >= 80 ? '#0f9d6e' : p >= 40 ? '#d97706' : '#dc2626'; }

let _isOffline = false;

/* ══════════════════════════════════
   TOAST NOTIFICATION
══════════════════════════════════ */

function toast(msg, duration = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

/* ══════════════════════════════════
   NAVIGATION
══════════════════════════════════ */

function showTab(name) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById('tab-' + name);
  if (sec) sec.classList.add('active');
  const btn = document.querySelector(`.nav-item[data-tab="${name}"]`);
  if (btn) btn.classList.add('active');
  document.getElementById('breadcrumb').textContent = name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');

  // Refresh tab-specific renders
  const renders = { dashboard: refreshDashboard, districts: renderDistrictTable, farmers: renderFarmerTable, register: populateDistrictDropdowns, certificates: renderCertTable, transfers: renderTransferTable, reports: renderReports, settings: renderSettings };
  if (renders[name]) renders[name]();

  // Sync mobile bottom nav active state
  const mobileTabs = ['dashboard','districts','register','farmers'];
  document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
  if (mobileTabs.includes(name)) {
    const activeBtn = document.querySelector(`.mob-nav-item[data-tab="${name}"]`);
    if (activeBtn) activeBtn.classList.add('active');
  } else {
    const moreBtn = document.querySelector('.mob-nav-item[data-tab="more-menu"]');
    if (moreBtn) moreBtn.classList.add('active');
  }
}

/* ══════════════════════════════════
   MODAL HELPERS
══════════════════════════════════ */

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
});

/* ══════════════════════════════════
   DASHBOARD
══════════════════════════════════ */

function refreshDashboard() {
  const settings = DB.getSettings();
  const districts = DB.getDistricts();
  const farmers = DB.getFarmers();

  document.getElementById('dashRegionName').textContent = settings.regionName || 'Not configured';

  const registered = farmers.filter(f => f.status === 'registered').length;
  const pending = farmers.filter(f => f.status === 'pending').length;
  const incomplete = farmers.length - registered - pending;
  const certified = farmers.filter(f => f.certNumber).length;
  const totalHa = farmers.reduce((s, f) => s + (parseFloat(f.hectares) || 0), 0);
  const targetHa = districts.reduce((s, d) => s + (parseFloat(d.hectaresTarget) || 0), 0);
  const pct = farmers.length ? Math.round((registered / farmers.length) * 100) : 0;

  document.getElementById('kpiDistricts').textContent = fmtNum(districts.length);
  document.getElementById('kpiDistrictSub').textContent = districts.filter(d => d.status === 'active').length + ' active';
  document.getElementById('kpiFarmers').textContent = fmtNum(farmers.length);
  const thisMonth = farmers.filter(f => f.registeredAt && f.registeredAt.slice(0,7) === new Date().toISOString().slice(0,7)).length;
  document.getElementById('kpiFarmerSub').textContent = thisMonth + ' this month';
  document.getElementById('kpiHectares').textContent = totalHa.toFixed(1);
  document.getElementById('kpiHaSub').textContent = `of ${targetHa > 0 ? targetHa.toLocaleString() : '—'} target`;
  document.getElementById('kpiCerts').textContent = fmtNum(certified);
  document.getElementById('kpiCertSub').textContent = farmers.length ? Math.round((certified / farmers.length) * 100) + '% issuance rate' : '0% issuance rate';

  document.getElementById('overallPct').textContent = pct + '%';
  document.getElementById('progFill').style.width = pct + '%';
  document.getElementById('progLegReg').textContent = registered;
  document.getElementById('progLegPend').textContent = pending;
  document.getElementById('progLegInc').textContent = incomplete;

  // Activity
  const acts = DB.getActivity();
  const actEl = document.getElementById('activityList');
  if (acts.length === 0) {
    actEl.innerHTML = '<div class="activity-empty">No activity yet. Register land parcels to begin.</div>';
  } else {
    actEl.innerHTML = acts.slice(0, 10).map(a => `
      <div class="activity-item">
        <span class="act-icon">${a.icon}</span>
        <span class="act-text">${a.text}</span>
        <span class="act-time">${a.time}</span>
      </div>`).join('');
  }

  // District performance
  const perfEl = document.getElementById('districtPerfList');
  if (districts.length === 0) {
    perfEl.innerHTML = '<div class="empty-state">No districts configured. Go to Districts tab to add.</div>';
  } else {
    const sorted = [...districts].sort((a, b) => {
      const aReg = farmers.filter(f => f.districtId === a.id && f.status === 'registered').length;
      const bReg = farmers.filter(f => f.districtId === b.id && f.status === 'registered').length;
      const aP = a.target ? Math.round((aReg / a.target) * 100) : 0;
      const bP = b.target ? Math.round((bReg / b.target) * 100) : 0;
      return bP - aP;
    });
    perfEl.innerHTML = sorted.slice(0, 10).map(d => {
      const dReg = farmers.filter(f => f.districtId === d.id && f.status === 'registered').length;
      const dP = d.target ? Math.round((dReg / d.target) * 100) : 0;
      const color = pctColor(dP);
      return `<div class="district-perf-row">
        <span class="district-perf-name">${d.name}</span>
        <span style="color:var(--text-secondary);font-size:11px;">${d.zone || '—'}</span>
        <span style="font-size:11px;">${fmtNum(dReg)} / ${fmtNum(d.target || 0)}</span>
        <div style="height:5px;background:var(--border);border-radius:2px;overflow:hidden;width:100%;">
          <div style="height:100%;width:${dP}%;background:${color};border-radius:2px;"></div>
        </div>
        <span style="font-size:11px;font-family:var(--font-mono);color:${color};font-weight:600;">${dP}%</span>
      </div>`;
    }).join('');
  }
}

/* ══════════════════════════════════
   DISTRICTS
══════════════════════════════════ */

function saveDistrict() {
  const name = document.getElementById('d_name').value.trim();
  const zone = document.getElementById('d_zone').value.trim();
  const target = parseInt(document.getElementById('d_target').value);
  const hTarget = parseFloat(document.getElementById('d_hectaresTarget').value) || 0;
  const lat = parseFloat(document.getElementById('d_lat').value) || null;
  const lng = parseFloat(document.getElementById('d_lng').value) || null;
  const status = document.getElementById('d_status').value;

  if (!name || !target) { toast('⚠ District name and target are required.'); return; }

  const districts = DB.getDistricts();
  districts.push({ id: uid(), name, zone, target, hectaresTarget: hTarget, lat, lng, status, createdAt: today() });
  DB.saveDistricts(districts);
  DB.addActivity('◈', `District "${name}" added.`);

  closeModal('addDistrictModal');
  ['d_name','d_zone','d_target','d_hectaresTarget','d_lat','d_lng'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('d_status').value = 'active';

  renderDistrictTable();
  populateDistrictDropdowns();
  // If user is already on the register tab, refresh its dropdown immediately
  if (document.getElementById('tab-register')?.classList.contains('active')) {
    populateDistrictDropdowns();
  }
  toast(`✓ District "${name}" added.`);
}

function renderDistrictTable() {
  const districts = DB.getDistricts();
  const farmers = DB.getFarmers();
  const query = (document.getElementById('districtSearch')?.value || '').toLowerCase();
  const statusF = document.getElementById('districtStatusFilter')?.value || '';

  const filtered = districts.filter(d =>
    (!query || d.name.toLowerCase().includes(query) || (d.zone || '').toLowerCase().includes(query)) &&
    (!statusF || d.status === statusF)
  );

  const tbody = document.getElementById('districtTableBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No districts found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const reg = farmers.filter(f => f.districtId === d.id && f.status === 'registered').length;
    const pct = d.target ? Math.round((reg / d.target) * 100) : 0;
    const color = pctColor(pct);
    return `<tr>
      <td><strong>${d.name}</strong></td>
      <td style="color:var(--text-secondary)">${d.zone || '—'}</td>
      <td style="font-family:var(--font-mono)">${fmtNum(d.target || 0)}</td>
      <td style="font-family:var(--font-mono)">${fmtNum(reg)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="mini-prog"><div class="mini-prog-fill" style="width:${pct}%;background:${color}"></div></div>
          <span style="font-size:11px;font-family:var(--font-mono);color:${color}">${pct}%</span>
        </div>
      </td>
      <td>${statusBadge(d.status)}</td>
      <td>
        <button class="btn-table" onclick="editDistrictStatus('${d.id}')">Edit</button>
        <button class="btn-table del" onclick="deleteDistrict('${d.id}','${d.name}')">Delete</button>
      </td>
    </tr>`;
  }).join('');
}

function editDistrictStatus(id) {
  const districts = DB.getDistricts();
  const d = districts.find(x => x.id === id);
  if (!d) return;
  const newStatus = prompt(`Change status for "${d.name}":\n(active / pending / completed)`, d.status);
  if (!newStatus || !['active','pending','completed'].includes(newStatus)) return;
  d.status = newStatus;
  DB.saveDistricts(districts);
  renderDistrictTable();
  toast(`✓ Status updated to "${newStatus}".`);
}

function deleteDistrict(id, name) {
  if (!confirm(`Delete district "${name}"? Farmer records in this district will lose their district assignment.`)) return;
  let districts = DB.getDistricts().filter(d => d.id !== id);
  DB.saveDistricts(districts);
  DB.addActivity('✕', `District "${name}" deleted.`);
  renderDistrictTable();
  populateDistrictDropdowns();
  toast(`District "${name}" deleted.`);
}

/* ══════════════════════════════════
   FARMERS
══════════════════════════════════ */

function renderFarmerTable() {
  const farmers = DB.getFarmers();
  const districts = DB.getDistricts();
  const query = (document.getElementById('farmerSearch')?.value || '').toLowerCase();
  const distF = document.getElementById('farmerDistrictFilter')?.value || '';
  const statusF = document.getElementById('farmerStatusFilter')?.value || '';

  const dMap = Object.fromEntries(districts.map(d => [d.id, d.name]));

  const filtered = farmers.filter(f =>
    (!query || `${f.firstName} ${f.fatherName} ${f.grandfatherName} ${f.nationalId} ${f.certNumber || ''}`.toLowerCase().includes(query)) &&
    (!distF || f.districtId === distF) &&
    (!statusF || f.status === statusF)
  );

  const tbody = document.getElementById('farmerTableBody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">No farmers found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(f => `<tr>
    <td style="font-family:var(--font-mono);font-size:11px">${f.id.slice(-6).toUpperCase()}</td>
    <td><strong>${f.firstName} ${f.fatherName}</strong>${f.grandfatherName ? ' ' + f.grandfatherName : ''}</td>
    <td>${dMap[f.districtId] || '—'}</td>
    <td>${f.village || '—'}</td>
    <td style="font-family:var(--font-mono)">${parseFloat(f.hectares || 0).toFixed(2)}</td>
    <td style="font-family:var(--font-mono);font-size:11px">${f.certNumber || '—'}</td>
    <td>${statusBadge(f.status)}</td>
    <td>
      <button class="btn-table" onclick="issueCertificate('${f.id}')">🏅 Cert</button>
      <button class="btn-table del" onclick="deleteFarmer('${f.id}')">✕</button>
    </td>
  </tr>`).join('');
}

function issueCertificate(farmerId) {
  const farmers = DB.getFarmers();
  const f = farmers.find(x => x.id === farmerId);
  if (!f) return;
  if (f.certNumber) { toast('ℹ Certificate already issued: ' + f.certNumber); return; }
  if (f.status !== 'registered') { toast('⚠ Only registered farmers can receive certificates.'); return; }
  const settings = DB.getSettings();
  const issued = farmers.filter(x => x.certNumber).length;
  f.certNumber = certNum(settings.certPrefix, issued + 1);
  f.certIssuedAt = today();
  DB.saveFarmers(farmers);
  DB.addActivity('✦', `Certificate ${f.certNumber} issued to ${f.firstName} ${f.fatherName}.`);
  renderFarmerTable();
  renderCertTable();
  toast(`✓ Certificate ${f.certNumber} issued.`);
}

function deleteFarmer(id) {
  if (!confirm('Delete this farmer record? This cannot be undone.')) return;
  const farmers = DB.getFarmers().filter(f => f.id !== id);
  DB.saveFarmers(farmers);
  renderFarmerTable();
  refreshDashboard();
  toast('Farmer record deleted.');
}

/* ══════════════════════════════════
   LAND REGISTRATION FORM
══════════════════════════════════ */

function captureGPS() {
  const status = document.getElementById('gpsStatus');
  status.textContent = '⌛ Acquiring GPS...';
  if (!navigator.geolocation) {
    // Fallback: simulate GPS for demo/offline
    const lat = (13.8 + Math.random() * 0.8).toFixed(4);
    const lng = (38.4 + Math.random() * 0.6).toFixed(4);
    document.getElementById('f_lat').value = lat;
    document.getElementById('f_lng').value = lng;
    status.textContent = `⌖ Simulated: ${lat}, ${lng}`;
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('f_lat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('f_lng').value = pos.coords.longitude.toFixed(6);
      status.textContent = `⌖ Captured: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(pos.coords.accuracy)}m)`;
    },
    () => {
      const lat = (13.8 + Math.random() * 0.8).toFixed(4);
      const lng = (38.4 + Math.random() * 0.6).toFixed(4);
      document.getElementById('f_lat').value = lat;
      document.getElementById('f_lng').value = lng;
      status.textContent = `⌖ GPS unavailable. Demo coords used: ${lat}, ${lng}`;
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function fakeUpload(type) {
  const el = document.getElementById('doc-' + type);
  el.textContent = '✓ Attached (demo)';
  el.style.color = 'var(--green)';
  toast(`📎 Document "${type}" attached.`);
}

function submitRegistration() {
  const settings = DB.getSettings();
  const firstName = document.getElementById('f_firstName').value.trim();
  const fatherName = document.getElementById('f_fatherName').value.trim();
  const districtId = document.getElementById('f_district').value;
  const village = document.getElementById('f_village').value.trim();
  const hectares = document.getElementById('f_hectares').value;

  if (!firstName || !fatherName) { toast('⚠ First name and father\'s name are required.'); return; }
  if (!districtId) { toast('⚠ Please select a district.'); return; }
  if (!hectares || parseFloat(hectares) <= 0) { toast('⚠ Please enter a valid parcel area.'); return; }

  const farmers = DB.getFarmers();
  const record = {
    id: uid(),
    firstName, fatherName,
    grandfatherName: document.getElementById('f_grandfatherName').value.trim(),
    nationalId: document.getElementById('f_nationalId').value.trim(),
    gender: document.getElementById('f_gender').value,
    phone: document.getElementById('f_phone').value.trim(),
    districtId,
    village,
    lat: document.getElementById('f_lat').value || null,
    lng: document.getElementById('f_lng').value || null,
    hectares: parseFloat(hectares),
    landUse: document.getElementById('f_landUse').value,
    parcelId: document.getElementById('f_parcelId').value.trim() || `P-${uid().slice(-6).toUpperCase()}`,
    acquisition: document.getElementById('f_acquisition').value,
    boundaries: document.getElementById('f_boundaries').value.trim(),
    spouse: document.getElementById('f_spouse').value.trim(),
    spouseId: document.getElementById('f_spouseId').value.trim(),
    status: 'registered',
    certNumber: null,
    registeredAt: today(),
    docs: {}
  };

  farmers.push(record);
  DB.saveFarmers(farmers);

  if (_isOffline) {
    DB.addPending(record);
    DB.addActivity('⚡', `[Offline] ${firstName} ${fatherName} — ${hectares}ha saved locally.`);
    toast(`⚡ Saved offline. Will sync when connected.`);
  } else {
    DB.addActivity('✦', `${firstName} ${fatherName} registered — ${hectares}ha, ${village}.`);
    toast(`✓ ${firstName} ${fatherName} registered successfully.`);
  }

  resetForm();
  refreshDashboard();
  updatePendingCount();
}

function saveDraft() {
  const firstName = document.getElementById('f_firstName').value.trim();
  const fatherName = document.getElementById('f_fatherName').value.trim();
  const districtId = document.getElementById('f_district').value;
  const hectares = document.getElementById('f_hectares').value;

  if (!firstName) { toast('⚠ Enter at least a name to save draft.'); return; }

  const farmers = DB.getFarmers();
  const record = {
    id: uid(), firstName, fatherName,
    districtId, village: document.getElementById('f_village').value.trim(),
    hectares: parseFloat(hectares) || 0,
    landUse: document.getElementById('f_landUse').value,
    parcelId: document.getElementById('f_parcelId').value.trim() || `P-${uid().slice(-6).toUpperCase()}`,
    acquisition: document.getElementById('f_acquisition').value,
    status: 'pending',
    certNumber: null,
    registeredAt: today(),
    lat: document.getElementById('f_lat').value || null,
    lng: document.getElementById('f_lng').value || null,
    gender: document.getElementById('f_gender').value,
    nationalId: document.getElementById('f_nationalId').value.trim(),
    phone: document.getElementById('f_phone').value.trim(),
    grandfatherName: document.getElementById('f_grandfatherName').value.trim(),
    boundaries: document.getElementById('f_boundaries').value.trim(),
    spouse: document.getElementById('f_spouse').value.trim(),
    spouseId: document.getElementById('f_spouseId').value.trim(),
    docs: {}
  };
  farmers.push(record);
  DB.saveFarmers(farmers);
  DB.addActivity('⊡', `Draft saved: ${firstName} ${fatherName}.`);
  toast('⊡ Draft saved.');
  resetForm();
  refreshDashboard();
}

function resetForm() {
  ['f_firstName','f_fatherName','f_grandfatherName','f_nationalId','f_phone','f_village','f_lat','f_lng','f_hectares','f_parcelId','f_boundaries','f_spouse','f_spouseId'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['f_gender','f_district','f_landUse','f_acquisition'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
  document.getElementById('gpsStatus').textContent = '';
  ['id','photo','cert'].forEach(type => {
    const el = document.getElementById('doc-' + type);
    if (el) { el.textContent = type === 'cert' ? 'Click to attach (if any)' : 'Click to attach'; el.style.color = ''; }
  });
}

/* ══════════════════════════════════
   CERTIFICATES
══════════════════════════════════ */

function renderCertTable() {
  const farmers = DB.getFarmers();
  const districts = DB.getDistricts();
  const dMap = Object.fromEntries(districts.map(d => [d.id, d.name]));
  const query = (document.getElementById('certSearch')?.value || '').toLowerCase();

  const certified = farmers.filter(f => f.certNumber && (!query || f.certNumber.toLowerCase().includes(query) || `${f.firstName} ${f.fatherName}`.toLowerCase().includes(query)));

  const tbody = document.getElementById('certTableBody');
  if (!certified.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No certificates issued yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = certified.map(f => `<tr>
    <td style="font-family:var(--font-mono);font-size:12px">${f.certNumber}</td>
    <td><strong>${f.firstName} ${f.fatherName}</strong></td>
    <td>${dMap[f.districtId] || '—'}</td>
    <td style="font-family:var(--font-mono)">${parseFloat(f.hectares || 0).toFixed(2)}</td>
    <td>${fmtDate(f.certIssuedAt || f.registeredAt)}</td>
    <td><span class="badge badge-green">Issued</span></td>
    <td><button class="btn-table" onclick="printCertificate('${f.id}')">🖨 Print</button></td>
  </tr>`).join('');
}

function printCertificate(farmerId) {
  const farmers = DB.getFarmers();
  const districts = DB.getDistricts();
  const f = farmers.find(x => x.id === farmerId);
  if (!f) return;
  const district = districts.find(d => d.id === f.districtId);
  const settings = DB.getSettings();

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Land Certificate — ${f.certNumber}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 40px; border: 3px double #0f9d6e; }
    h1 { text-align:center; font-size:20px; color:#0d1117; }
    .sub { text-align:center; color:#5a6478; font-size:13px; margin-bottom:24px; }
    .cert-no { text-align:center; font-family:monospace; font-size:18px; color:#0f9d6e; letter-spacing:2px; font-weight:bold; margin:16px 0; }
    table { width:100%; border-collapse:collapse; margin-top:20px; }
    td { padding:8px 12px; border:1px solid #ddd; font-size:13px; }
    td:first-child { font-weight:bold; width:40%; background:#f8f9fb; }
    .footer { margin-top:40px; display:flex; justify-content:space-between; }
    .sig { border-top:1px solid #333; padding-top:6px; font-size:12px; color:#666; min-width:180px; text-align:center; }
  </style></head><body>
  <h1>${settings.orgName || 'Bureau of Land Administration'}</h1>
  <div class="sub">${settings.regionName || 'Land Registry'} — Official Land Ownership Certificate</div>
  <div class="cert-no">${f.certNumber}</div>
  <table>
    <tr><td>Full Name</td><td>${f.firstName} ${f.fatherName}${f.grandfatherName ? ' ' + f.grandfatherName : ''}</td></tr>
    ${f.spouse ? `<tr><td>Co-owner / Spouse</td><td>${f.spouse}</td></tr>` : ''}
    <tr><td>National ID</td><td>${f.nationalId || '—'}</td></tr>
    <tr><td>District / Woreda</td><td>${district?.name || '—'}</td></tr>
    <tr><td>Village / Kebele</td><td>${f.village || '—'}</td></tr>
    <tr><td>Parcel ID</td><td>${f.parcelId || '—'}</td></tr>
    <tr><td>Land Area</td><td>${parseFloat(f.hectares || 0).toFixed(4)} ${settings.areaUnit || 'ha'}</td></tr>
    <tr><td>Land Use</td><td>${f.landUse || '—'}</td></tr>
    <tr><td>Acquisition Type</td><td>${f.acquisition || '—'}</td></tr>
    ${f.lat ? `<tr><td>GPS Coordinates</td><td>${f.lat}, ${f.lng}</td></tr>` : ''}
    <tr><td>Issue Date</td><td>${fmtDate(f.certIssuedAt || f.registeredAt)}</td></tr>
  </table>
  <div class="footer">
    <div class="sig">Farmer Signature</div>
    <div class="sig">Authorized Officer</div>
    <div class="sig">Official Stamp</div>
  </div>
  </body></html>`);
  win.document.close();
  win.print();
}

/* ══════════════════════════════════
   TRANSFERS
══════════════════════════════════ */

function saveTransfer() {
  const cert = document.getElementById('t_cert').value.trim();
  const from = document.getElementById('t_from').value.trim();
  const to = document.getElementById('t_to').value.trim();
  const type = document.getElementById('t_type').value;
  const date = document.getElementById('t_date').value;
  const notes = document.getElementById('t_notes').value.trim();

  if (!cert || !from || !to || !date) { toast('⚠ Certificate, from, to, and date are required.'); return; }

  const transfers = DB.getTransfers();
  transfers.push({ id: uid(), certNumber: cert, from, to, type, date, notes, createdAt: today() });
  DB.saveTransfers(transfers);
  DB.addActivity('⇄', `Transfer: ${from} → ${to} (${type}).`);

  closeModal('addTransferModal');
  ['t_cert','t_from','t_to','t_date','t_notes'].forEach(id => document.getElementById(id).value = '');
  renderTransferTable();
  toast(`✓ Transfer recorded.`);
}

function renderTransferTable() {
  const transfers = DB.getTransfers();
  const tbody = document.getElementById('transferTableBody');
  if (!transfers.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No transfers recorded.</td></tr>`;
    return;
  }
  tbody.innerHTML = [...transfers].reverse().map(t => `<tr>
    <td style="font-family:var(--font-mono);font-size:11px">${t.id.slice(-6).toUpperCase()}</td>
    <td style="font-family:var(--font-mono);font-size:12px">${t.certNumber}</td>
    <td>${t.from}</td>
    <td>${t.to}</td>
    <td>${statusBadge(t.type)}</td>
    <td>${fmtDate(t.date)}</td>
    <td><span class="badge badge-green">Recorded</span></td>
  </tr>`).join('');
}

/* ══════════════════════════════════
   REPORTS
══════════════════════════════════ */

function renderReports() {
  const farmers = DB.getFarmers();
  const districts = DB.getDistricts();
  const transfers = DB.getTransfers();

  const reg = farmers.filter(f => f.status === 'registered').length;
  const cert = farmers.filter(f => f.certNumber).length;
  const totalHa = farmers.reduce((s, f) => s + (parseFloat(f.hectares) || 0), 0);

  const statsEl = document.getElementById('reportStats');
  statsEl.innerHTML = [
    { label: 'Total Farmers', val: fmtNum(farmers.length) },
    { label: 'Registered', val: fmtNum(reg) },
    { label: 'Certified', val: fmtNum(cert) },
    { label: 'Total Area (ha)', val: totalHa.toFixed(1) },
    { label: 'Districts', val: fmtNum(districts.length) },
    { label: 'Transfers', val: fmtNum(transfers.length) },
  ].map(s => `<div class="report-stat"><div class="report-stat-label">${s.label}</div><div class="report-stat-val">${s.val}</div></div>`).join('');

  // Bar chart
  const barEl = document.getElementById('barChart');
  if (!districts.length) { barEl.innerHTML = '<div class="empty-state">No districts.</div>'; }
  else {
    const sorted = [...districts].map(d => {
      const dReg = farmers.filter(f => f.districtId === d.id && f.status === 'registered').length;
      const pct = d.target ? Math.min(100, Math.round((dReg / d.target) * 100)) : 0;
      return { name: d.name, pct };
    }).sort((a, b) => b.pct - a.pct).slice(0, 15);
    barEl.innerHTML = sorted.map(d => `
      <div class="bar-row">
        <span class="bar-label">${d.name}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${d.pct}%;background:${pctColor(d.pct)}"></div></div>
        <span class="bar-pct">${d.pct}%</span>
      </div>`).join('');
  }

  // Report district table
  const tbody = document.getElementById('reportDistrictBody');
  if (!districts.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">No districts.</td></tr>`;
    return;
  }
  tbody.innerHTML = districts.map(d => {
    const dF = farmers.filter(f => f.districtId === d.id);
    const dReg = dF.filter(f => f.status === 'registered').length;
    const dCert = dF.filter(f => f.certNumber).length;
    const dHa = dF.reduce((s, f) => s + (parseFloat(f.hectares) || 0), 0);
    const pct = d.target ? Math.min(100, Math.round((dReg / d.target) * 100)) : 0;
    return `<tr>
      <td><strong>${d.name}</strong><br><span style="font-size:11px;color:var(--text-secondary)">${d.zone || ''}</span></td>
      <td style="font-family:var(--font-mono)">${fmtNum(d.target || 0)}</td>
      <td style="font-family:var(--font-mono)">${fmtNum(dReg)}</td>
      <td style="font-family:var(--font-mono)">${fmtNum(dCert)}</td>
      <td style="font-family:var(--font-mono)">${dHa.toFixed(1)}</td>
      <td><span style="color:${pctColor(pct)};font-weight:600;font-family:var(--font-mono)">${pct}%</span></td>
    </tr>`;
  }).join('');
}

function exportReport(type) {
  const farmers = DB.getFarmers();
  const districts = DB.getDistricts();
  const dMap = Object.fromEntries(districts.map(d => [d.id, d.name]));

  let csv = '';
  if (type === 'summary') {
    const reg = farmers.filter(f => f.status === 'registered').length;
    const cert = farmers.filter(f => f.certNumber).length;
    const totalHa = farmers.reduce((s, f) => s + (parseFloat(f.hectares) || 0), 0);
    csv = 'Metric,Value\nTotal Farmers,' + farmers.length + '\nRegistered,' + reg + '\nCertified,' + cert + '\nTotal Hectares,' + totalHa.toFixed(2) + '\nDistricts,' + districts.length;
  } else {
    csv = 'District,Zone,Target,Registered,Certified,Hectares,Completion%\n';
    csv += districts.map(d => {
      const dF = farmers.filter(f => f.districtId === d.id);
      const dReg = dF.filter(f => f.status === 'registered').length;
      const dCert = dF.filter(f => f.certNumber).length;
      const dHa = dF.reduce((s, f) => s + (parseFloat(f.hectares) || 0), 0);
      const pct = d.target ? Math.round((dReg / d.target) * 100) : 0;
      return `"${d.name}","${d.zone || ''}",${d.target || 0},${dReg},${dCert},${dHa.toFixed(2)},${pct}%`;
    }).join('\n');
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `cadasys_${type}_${today()}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('⬇ Report exported.');
}

/* ══════════════════════════════════
   SETTINGS
══════════════════════════════════ */

function renderSettings() {
  const s = DB.getSettings();
  document.getElementById('s_regionName').value = s.regionName || '';
  document.getElementById('s_orgName').value = s.orgName || '';
  document.getElementById('s_certPrefix').value = s.certPrefix || 'LR';
  document.getElementById('s_areaUnit').value = s.areaUnit || 'ha';
  document.getElementById('s_syncUrl').value = s.syncUrl || '';
  document.getElementById('s_apiKey').value = s.apiKey || '';
  document.getElementById('s_autoSync').checked = s.autoSync !== false;
  document.getElementById('storageInfo').textContent = `Storage used: ~${DB.storageUsedKB()} KB`;
  updatePendingCount();
}

function saveSettings() {
  const s = {
    regionName: document.getElementById('s_regionName').value.trim(),
    orgName: document.getElementById('s_orgName').value.trim(),
    certPrefix: (document.getElementById('s_certPrefix').value.trim() || 'LR').toUpperCase(),
    areaUnit: document.getElementById('s_areaUnit').value,
    syncUrl: document.getElementById('s_syncUrl').value.trim(),
    apiKey: document.getElementById('s_apiKey').value.trim(),
    autoSync: document.getElementById('s_autoSync').checked
  };
  DB.saveSettings(s);
  refreshDashboard();
  toast('✓ Settings saved.');
}

function exportAllData() {
  const data = {
    exportedAt: new Date().toISOString(),
    version: '2.1.0',
    settings: DB.getSettings(),
    districts: DB.getDistricts(),
    farmers: DB.getFarmers(),
    transfers: DB.getTransfers(),
    activity: DB.getActivity()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `cadasys_backup_${today()}.json`;
  a.click(); URL.revokeObjectURL(url);
  toast('⬇ Full data exported.');
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm(`Import data from "${file.name}"? This will REPLACE all current data.`)) return;
      if (data.settings) DB.saveSettings(data.settings);
      if (data.districts) DB.saveDistricts(data.districts);
      if (data.farmers) DB.saveFarmers(data.farmers);
      if (data.transfers) DB.saveTransfers(data.transfers);
      if (data.activity) DB.set('activity', data.activity);
      toast('✓ Data imported successfully.');
      init();
    } catch { toast('⚠ Invalid file. Could not import.'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function clearAllData() {
  if (!confirm('⚠ This will permanently delete ALL data including districts, farmers, certificates, and transfers. Are you sure?')) return;
  if (!confirm('Last confirmation: delete everything?')) return;
  Object.values(DB.KEYS).forEach(k => localStorage.removeItem(k));
  toast('All data cleared.');
  init();
}

/* ══════════════════════════════════
   SYNC (Offline-first)
══════════════════════════════════ */

function updatePendingCount() {
  const pending = DB.getPending();
  const el = document.getElementById('pendingSyncCount');
  if (el) el.textContent = `Pending sync: ${pending.length} records`;
}

async function forceSyncNow() {
  const settings = DB.getSettings();
  const pending = DB.getPending();
  if (!pending.length) { toast('ℹ No pending records to sync.'); return; }
  if (!settings.syncUrl) { toast('ℹ No sync URL configured. Records saved locally.'); return; }

  toast('⚡ Syncing...');
  try {
    const res = await fetch(settings.syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(settings.apiKey ? { 'X-API-Key': settings.apiKey } : {}) },
      body: JSON.stringify({ records: pending, timestamp: Date.now() })
    });
    if (res.ok) {
      DB.clearPending();
      toast(`✓ ${pending.length} records synced.`);
      updatePendingCount();
    } else { toast('⚠ Sync failed: server error ' + res.status); }
  } catch { toast('⚠ Sync failed: network error. Records kept locally.'); }
}

function toggleOffline() {
  _isOffline = !_isOffline;
  const dot = document.querySelector('.sync-dot');
  const label = document.querySelector('.sync-label');
  const badge = document.getElementById('syncBadge');
  const notice = document.getElementById('offlineNotice');
  const icon = document.getElementById('connIcon');

  if (_isOffline) {
    dot.classList.remove('online'); dot.classList.add('offline');
    label.textContent = 'Offline';
    if (notice) notice.style.display = 'flex';
    icon.textContent = '⚡';
    toast('⚡ Offline mode — data will save locally.');
  } else {
    dot.classList.remove('offline'); dot.classList.add('online');
    label.textContent = 'Synced';
    if (notice) notice.style.display = 'none';
    icon.textContent = '⚡';
    toast('✓ Online mode.');
  }
}

/* ══════════════════════════════════
   HELPERS & DROPDOWNS
══════════════════════════════════ */

function populateDistrictDropdowns() {
  const districts = DB.getDistricts();
  const opts = districts.map(d => `<option value="${d.id}">${d.name}${d.zone ? ' (' + d.zone + ')' : ''}</option>`).join('');
  const selects = ['f_district', 'farmerDistrictFilter'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const placeholder = id === 'farmerDistrictFilter' ? '<option value="">All Districts</option>' : '<option value="">Select district...</option>';
    el.innerHTML = placeholder + opts;
  });
}

function updateVillageOptions() {
  // Could populate villages per district from a lookup table; left as free text for flexibility
}

/* ══════════════════════════════════
   SIDEBAR TOGGLE
══════════════════════════════════ */

document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
  document.getElementById('mainContent').classList.toggle('expanded');
});

/* ══════════════════════════════════
   INIT
══════════════════════════════════ */

function init() {
  populateDistrictDropdowns();
  refreshDashboard();
  renderSettings();

  // Set today as default transfer date
  const td = document.getElementById('t_date');
  if (td) td.value = today();

  // Offline toggle button
  document.getElementById('offlineToggle').addEventListener('click', toggleOffline);

  // Sidebar nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });

  // Show dashboard on load
  showTab('dashboard');
}

document.addEventListener('DOMContentLoaded', init);

/* ══════════════════════════════════
   PWA — SERVICE WORKER REGISTRATION
══════════════════════════════════ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('SW registered:', reg.scope);
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              toast('🔄 New version available — refresh to update.');
            }
          });
        });
      })
      .catch(err => console.warn('SW registration failed:', err));
  });
}

/* ══════════════════════════════════
   PWA INSTALL PROMPT
══════════════════════════════════ */

let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // Show install banner
  const banner = document.getElementById('installBanner');
  if (banner) banner.classList.add('show');
  // Show install button in Settings
  const pwaBtn = document.getElementById('pwaInstallBtn');
  if (pwaBtn) pwaBtn.style.display = 'block';
});

function triggerInstall() {
  if (_deferredInstallPrompt) {
    _deferredInstallPrompt.prompt();
    _deferredInstallPrompt.userChoice.then(result => {
      if (result.outcome === 'accepted') {
        toast('✓ CadaSys installed successfully!');
        document.getElementById('installBanner')?.classList.remove('show');
      }
      _deferredInstallPrompt = null;
    });
  } else {
    // iOS fallback hint
    const hint = document.getElementById('pwaIosHint');
    if (hint) hint.style.display = 'block';
    toast('ℹ iPhone: Safari → Share ⬆ → Add to Home Screen');
  }
}

// Install banner buttons
document.getElementById('installBtn')?.addEventListener('click', triggerInstall);
document.getElementById('installDismiss')?.addEventListener('click', () => {
  document.getElementById('installBanner')?.classList.remove('show');
});

// App installed event
window.addEventListener('appinstalled', () => {
  document.getElementById('installBanner')?.classList.remove('show');
  toast('✓ CadaSys installed!');
  _deferredInstallPrompt = null;
});

/* ══════════════════════════════════
   MOBILE BOTTOM NAV
══════════════════════════════════ */

document.querySelectorAll('.mob-nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    if (tab === 'more-menu') {
      openMoreDrawer();
    } else {
      showTab(tab);
      // Sync active state with bottom nav
      document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
  });
});

function openMoreDrawer() {
  document.getElementById('moreDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
}
function closeMoreDrawer() {
  document.getElementById('moreDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

document.getElementById('drawerOverlay')?.addEventListener('click', closeMoreDrawer);

document.querySelectorAll('.drawer-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    closeMoreDrawer();
    showTab(tab);
    // Mark "more" button active
    document.querySelectorAll('.mob-nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.mob-nav-item:last-child').classList.add('active');
  });
});

// (mobile nav sync is handled inside showTab directly — see core showTab)

/* ══════════════════════════════════
   CAMERA / DOCUMENT UPLOAD (MOBILE)
══════════════════════════════════ */

function openCamera(type) {
  // Trigger the hidden file input (which has capture attribute for mobile camera)
  document.getElementById('doc-' + type)?.click();
}

function handleDocUpload(type, input) {
  const file = input.files[0];
  if (!file) return;

  const label = document.getElementById(`doc-${type}-label`);
  if (label) {
    label.textContent = `✓ ${file.name.slice(0, 20)}`;
    label.style.color = 'var(--green)';
  }

  // Show preview if it's an image
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = e => {
      const strip = document.getElementById('photoPreviewStrip');
      if (!strip) return;
      const wrap = document.createElement('div');
      wrap.style.textAlign = 'center';
      const img = document.createElement('img');
      img.src = e.target.result;
      img.className = 'photo-thumb';
      img.alt = type;
      const lbl = document.createElement('div');
      lbl.className = 'photo-thumb-label';
      lbl.textContent = type;
      wrap.appendChild(img);
      wrap.appendChild(lbl);
      // Remove old preview of same type
      strip.querySelectorAll(`[data-doctype="${type}"]`).forEach(el => el.remove());
      wrap.dataset.doctype = type;
      strip.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  }

  toast(`📎 ${type} attached: ${file.name.slice(0, 30)}`);
}

/* ══════════════════════════════════
   MOBILE TOPBAR MENU BUTTON
   (shows sidebar on mobile as drawer)
══════════════════════════════════ */

document.getElementById('mobMenuBtn')?.addEventListener('click', () => {
  openMoreDrawer();
});

/* ══════════════════════════════════
   NETWORK STATUS (Online/Offline)
══════════════════════════════════ */

function updateNetworkStatus() {
  const online = navigator.onLine;
  const dot = document.querySelector('.sync-dot');
  const label = document.querySelector('.sync-label');
  const notice = document.getElementById('offlineNotice');
  if (!dot) return;

  if (!online || _isOffline) {
    dot.classList.remove('online'); dot.classList.add('offline');
    label.textContent = 'Offline';
    if (notice) notice.style.display = 'flex';
  } else {
    dot.classList.remove('offline'); dot.classList.add('online');
    label.textContent = 'Synced';
    if (notice) notice.style.display = 'none';
    // Auto-sync pending records if configured
    const s = DB.getSettings();
    if (s.autoSync && s.syncUrl && DB.getPending().length) {
      forceSyncNow();
    }
  }
}

window.addEventListener('online', () => { updateNetworkStatus(); toast('✓ Connection restored.'); });
window.addEventListener('offline', () => { updateNetworkStatus(); toast('⚡ Gone offline — saves locally.'); });
