// ---------- state ----------
let token = localStorage.getItem('cms_token') || null;
let me = null;
let ws = null;
let currentTab = 'dashboard';
let captureGeo = null;   // last geolocation captured on the PM capture page

const ROLE_LABEL = {
  admin: 'Administrator', minister: 'Minister',
  constructor: 'Constructor', project_manager: 'Project Manager',
};
const PIC_STATUS = {
  pending_constructor: { label: 'Pending review', cls: 'amber' },
  submitted_to_minister: { label: 'Submitted to minister', cls: 'green' },
  rejected: { label: 'Rejected', cls: 'red' },
};
const PROJ_STATUS = { 'In Progress': 'blue', 'Delayed': 'amber', 'Completed': 'green', 'On Hold': 'gray' };

// simple inline SVG icons (stroke = currentColor)
const ICON = {
  dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
  projects: '<path d="M3 7l9-4 9 4-9 4-9-4zm0 5l9 4 9-4M3 17l9 4 9-4"/>',
  camera: '<path d="M4 7h3l2-2h6l2 2h3v12H4V7z"/><circle cx="12" cy="13" r="3.5"/>',
  review: '<path d="M4 5h16v11H5l-1 3V5z"/><path d="M9 10l2 2 4-4"/>',
  inbox: '<path d="M4 13l2-8h12l2 8v6H4v-6z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M16 6a3 3 0 010 6M21 20c0-2-1-3.5-3-4.3"/>',
  badge: '<path d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7l7-4z"/><path d="M9 12l2 2 4-4"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5z"/><path d="M8 10h8M8 13h5"/>',
};
function icon(name) {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name] || ''}</svg>`;
}

// ---------- api helper ----------
async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch('/api' + path, { ...opts, headers });
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtMoney = (n) => 'KES ' + Number(n || 0).toLocaleString();
const fmtDate = (s) => s ? new Date(s).toLocaleDateString() : '—';
const fmtTime = (s) => s ? new Date(s).toLocaleString() : '';
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ---------- auth ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    const data = await api('/login', { method: 'POST', body: JSON.stringify({ email: $('#email').value, password: $('#password').value }) });
    token = data.token; me = data.user;
    localStorage.setItem('cms_token', token);
    enterApp();
  } catch (err) { $('#login-error').textContent = err.message; }
});

$('#logout').addEventListener('click', logout);
function logout() {
  token = null; me = null;
  localStorage.removeItem('cms_token');
  if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  $('#app-view').classList.add('hidden');
  $('#login-view').classList.remove('hidden');
}

async function enterApp() {
  try { me = await api('/me'); } catch (e) { return logout(); }
  $('#login-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#avatar').textContent = initials(me.name);
  $('#who-name').textContent = me.name;
  $('#who-role').textContent = ROLE_LABEL[me.role] + (me.ministry ? ' · ' + me.ministry : '');
  currentTab = 'dashboard';
  buildNav();
  connectWS();
  render();
}

// ---------- websocket (real-time) ----------
function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { $('#live-dot').classList.add('on'); $('#live-text').textContent = 'Live'; };
  ws.onclose = () => { $('#live-dot').classList.remove('on'); $('#live-text').textContent = 'Offline'; if (token) setTimeout(connectWS, 2500); };
  ws.onmessage = (ev) => {
    const { event } = JSON.parse(ev.data);
    if (['picture', 'project', 'activity', 'participant', 'message'].includes(event)) {
      if (openThreadId) loadThread(openThreadId, openThreadChannel);   // refresh an open conversation live
      render();
    }
  };
}

// ---------- navigation ----------
function tabsFor(role) {
  const t = [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', title: 'Dashboard', sub: 'Overview of all monitored projects' }];
  if (role === 'minister') t.push({ id: 'submissions', label: 'Submitted Photos', icon: 'inbox', title: 'Submitted Photos', sub: 'Photos assessed and forwarded to you' });
  if (role === 'project_manager') t.push({ id: 'capture', label: 'Capture & Send', icon: 'camera', title: 'Capture & Send Photos', sub: 'Send site photos to the constructor' });
  if (role === 'project_manager') t.push({ id: 'messages', label: 'Constructor Chat', icon: 'chat', title: 'Constructor Messages', sub: 'Discuss your uploaded photos with the constructor' });
  if (role === 'constructor') t.push({ id: 'review', label: 'Review Photos', icon: 'review', title: 'Review Photos', sub: 'Assess and submit photos to the minister' });
  t.push({ id: 'projects', label: 'Projects', icon: 'projects', title: 'Projects', sub: role === 'constructor' ? 'Register and manage construction projects' : (role === 'admin' ? 'Monitor all registered projects' : 'Projects you are authorised to view') });
  if (role === 'constructor') t.push({ id: 'team', label: 'Project Managers', icon: 'users', title: 'Project Managers', sub: 'Register project managers and assign them to projects' });
  if (role === 'constructor') t.push({ id: 'approvals', label: 'Laborers & Suppliers', icon: 'badge', title: 'Laborers & Suppliers', sub: 'Verify, approve and assign applicants from the sign-up app' });
  if (role === 'minister' || role === 'constructor') t.push({ id: 'feedback', label: 'Feedback', icon: 'chat', title: 'Feedback', sub: role === 'minister' ? 'Send feedback to the constructor on your projects' : 'Feedback from ministers — reply on each project' });
  if (role === 'constructor') t.push({ id: 'sitemsgs', label: 'Site Messages', icon: 'chat', title: 'Site Messages', sub: 'Discuss uploaded photos with your project managers' });
  if (role === 'admin') t.push({ id: 'users', label: 'Users', icon: 'users', title: 'User Management', sub: 'Register and manage system accounts' });
  return t;
}

function buildNav() {
  const tabs = tabsFor(me.role);
  $('#side-nav').innerHTML = tabs.map((t) =>
    `<button class="nav-item" data-tab="${t.id}">${icon(t.icon)}<span class="lbl">${t.label}</span></button>`).join('');
  $('#side-nav').querySelectorAll('.nav-item').forEach((b) =>
    b.addEventListener('click', () => { currentTab = b.dataset.tab; render(); }));
}

async function render() {
  const tabs = tabsFor(me.role);
  let tab = tabs.find((t) => t.id === currentTab);
  if (!tab) { currentTab = 'dashboard'; tab = tabs[0]; }

  // highlight active nav + set header
  $('#side-nav').querySelectorAll('.nav-item').forEach((b) =>
    b.classList.toggle('active', b.dataset.tab === currentTab));
  $('#page-title').textContent = tab.title;

  const c = $('#content');
  c.innerHTML = `<div class="page-head"><h2>${tab.title}</h2><p>${tab.sub}</p></div><div id="tab-body"></div>`;
  const body = $('#tab-body');
  try {
    if (currentTab === 'dashboard') return renderDashboard(body);
    if (currentTab === 'projects') return renderProjects(body);
    if (currentTab === 'submissions') return renderSubmissions(body);
    if (currentTab === 'capture') return renderCapture(body);
    if (currentTab === 'review') return renderReview(body);
    if (currentTab === 'team') return renderTeam(body);
    if (currentTab === 'approvals') return renderApprovals(body);
    if (currentTab === 'feedback') return renderFeedback(body, 'minister');
    if (currentTab === 'messages' || currentTab === 'sitemsgs') return renderFeedback(body, 'pm');
    if (currentTab === 'users') return renderUsers(body);
  } catch (e) { body.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}

// ---------- dashboard ----------
async function renderDashboard(body) {
  const [stats, activity] = await Promise.all([api('/stats'), api('/activity')]);
  const cards = [
    { num: stats.totalProjects, lbl: 'Projects' },
    { num: stats.inProgress, lbl: 'In progress' },
    { num: stats.delayed, lbl: 'Delayed' },
    { num: stats.avgProgress + '%', lbl: 'Avg. progress' },
  ];
  if (me.role === 'constructor') cards.push({ num: stats.pendingConstructor, lbl: 'Photos to review' });
  if (me.role === 'minister') cards.push({ num: stats.submittedToMinister, lbl: 'Photos submitted' });
  if (me.role === 'constructor') {
    cards.push({ num: stats.pendingApprovals, lbl: 'Pending approvals' });
    cards.push({ num: stats.approvedLaborers, lbl: 'Laborers assigned' });
    cards.push({ num: stats.approvedSuppliers, lbl: 'Suppliers assigned' });
  }

  body.innerHTML = `
    <div class="stats">${cards.map((c) => `<div class="stat"><div class="num">${c.num}</div><div class="lbl">${c.lbl}</div></div>`).join('')}</div>
    <div class="section-title"><h3>Live activity</h3></div>
    <div class="feed">${activity.length ? activity.map((a) => `
      <div class="feed-item"><div>${esc(a.message)}</div><div class="when">${fmtTime(a.at)}</div></div>`).join('')
      : '<div class="feed-item">No activity yet.</div>'}</div>`;
}

// ---------- projects ----------
async function renderProjects(body) {
  const projects = await api('/projects');
  const canManage = me.role === 'constructor';
  const head = canManage
    ? `<div class="section-title"><h3>${projects.length} project(s)</h3><button class="btn primary sm" id="new-project">+ New project</button></div>`
    : '';
  const list = projects.length
    ? `<div class="grid">${projects.map(projectCard).join('')}</div>`
    : `<div class="empty">${canManage ? 'No projects yet. Click “New project” to register one.' : 'No projects assigned to you.'}</div>`;
  body.innerHTML = head + list;
  if (canManage) $('#new-project').addEventListener('click', newProjectModal);
  body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openProject(Number(b.dataset.open))));
  body.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => assignPmModal(Number(b.dataset.assign))));
}

function projectCard(p) {
  const canManage = me.role === 'constructor';
  return `<div class="card">
    <div class="row"><h3>${esc(p.name)}</h3><span class="badge ${PROJ_STATUS[p.status] || 'gray'}">${esc(p.status)}</span></div>
    <p class="meta">${esc(p.type)} · ${esc(p.location)} · Ministry of ${esc(p.ministry)}</p>
    <div class="bar"><span style="width:${p.progress}%"></span></div>
    <p class="meta">${p.progress}% complete · Due ${fmtDate(p.expectedEnd)}</p>
    <p class="meta">PM: ${esc(p.projectManagerName || '— not assigned —')} · Contractor: ${esc(p.contractorName || '—')}</p>
    <div class="row" style="margin-top:12px">
      <span class="meta">${fmtMoney(p.budget)}</span>
      <span style="display:flex;gap:8px">
        ${canManage ? `<button class="btn sm ghost" data-assign="${p.id}">Assign PM</button>` : ''}
        <button class="btn sm ghost" data-open="${p.id}">View photos</button>
      </span>
    </div>
  </div>`;
}

function newProjectModal() {
  modal('Register a new project', `
    <form id="proj-form">
      <label>Project name</label><input id="np-name" required placeholder="e.g. Coastal Maternity Hospital" />
      <label>Ministry (owner of the project)</label>
      <select id="np-ministry"><option value="">Loading…</option></select>
      <label>Type</label><input id="np-type" placeholder="e.g. Hospital" />
      <label>Location</label><input id="np-location" placeholder="e.g. Mombasa" />
      <label>Budget (KES)</label><input id="np-budget" type="number" min="0" placeholder="0" />
      <label>Expected completion</label><input id="np-end" type="date" />
      <label>Project manager (optional)</label>
      <select id="np-pm"><option value="">— assign later —</option></select>
      <label>Description</label><textarea id="np-desc" rows="2" placeholder="Short description"></textarea>
      <p class="error" id="np-msg"></p>
      <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Register project</button></div>
    </form>`);
  // populate ministries + PMs
  api('/ministries').then((ms) => {
    $('#np-ministry').innerHTML = ms.length
      ? ms.map((m) => `<option value="${esc(m)}">Ministry of ${esc(m)}</option>`).join('')
      : '<option value="">No ministries available</option>';
  }).catch(() => {});
  api('/users?role=project_manager').then((pms) => {
    $('#np-pm').innerHTML = '<option value="">— assign later —</option>' +
      pms.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  }).catch(() => {});
  $('#proj-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/projects', { method: 'POST', body: JSON.stringify({
        name: $('#np-name').value, ministry: $('#np-ministry').value, type: $('#np-type').value,
        location: $('#np-location').value, budget: $('#np-budget').value, expectedEnd: $('#np-end').value,
        projectManagerId: $('#np-pm').value || null, description: $('#np-desc').value }) });
      closeModal(); toast('Project registered'); render();
    } catch (err) { $('#np-msg').textContent = err.message; }
  });
}

async function assignPmModal(projectId) {
  const [project, pms] = await Promise.all([api('/projects/' + projectId), api('/users?role=project_manager')]);
  modal('Assign project manager', `
    <p class="meta">Project: <b>${esc(project.name)}</b></p>
    <form id="assign-form">
      <label>Project manager</label>
      <select id="ap-pm">
        <option value="">— none —</option>
        ${pms.map((u) => `<option value="${u.id}" ${u.id === project.projectManagerId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
      </select>
      ${pms.length ? '' : '<p class="meta">No project managers yet — add one under “Project Managers”.</p>'}
      <p class="error" id="ap-msg"></p>
      <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Save</button></div>
    </form>`);
  $('#assign-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/projects/' + projectId + '/team', { method: 'POST', body: JSON.stringify({ projectManagerId: $('#ap-pm').value || null }) });
      closeModal(); toast('Project manager updated'); render();
    } catch (err) { $('#ap-msg').textContent = err.message; }
  });
}

async function openProject(id) {
  const [p, pics] = await Promise.all([api('/projects/' + id), api('/pictures?projectId=' + id)]);
  const photos = pics.length ? `<div class="photos">${pics.map(photoCard).join('')}</div>` : '<div class="empty">No photos for this project yet.</div>';
  modal(`${esc(p.name)}`, `
    <p class="meta">${esc(p.description || '')}</p>
    <p class="meta">Status: <b>${esc(p.status)}</b> · ${p.progress}% complete · Budget ${fmtMoney(p.budget)}</p>
    <div class="bar"><span style="width:${p.progress}%"></span></div>
    <div class="section-title"><h3>Photos</h3></div>
    ${photos}`);
}

// Geolocation line for a photo (coordinates + map button, or "no location").
function photoGeo(pic) {
  if (pic.lat == null || pic.lng == null) {
    return '<p class="meta">📍 No location captured</p>';
  }
  const acc = pic.accuracy ? ` (±${Math.round(pic.accuracy)}m)` : '';
  return `<p class="meta">📍 ${pic.lat.toFixed(5)}, ${pic.lng.toFixed(5)}${acc}
    <button class="btn sm ghost" style="padding:2px 9px;margin-left:6px" data-map="${pic.lat},${pic.lng}" data-maplabel="${esc(pic.caption || 'Site photo')}">View on map</button></p>`;
}

// Open an OpenStreetMap view (no API key needed) centred on the photo's coordinates.
function openMap(lat, lng, label) {
  const d = 0.0035;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  modal('Photo location', `
    <p class="meta">${esc(label || '')}</p>
    <iframe class="map" src="${src}" loading="lazy"></iframe>
    <p class="meta" style="margin-top:10px">Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}
      &nbsp;·&nbsp; <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}" target="_blank" rel="noopener">Open in OpenStreetMap ↗</a></p>`);
}
window.openMap = openMap;

function photoCard(pic) {
  const s = PIC_STATUS[pic.status];
  return `<div class="photo">
    <img src="${pic.url}" alt="site photo" onerror="this.style.opacity=.3" />
    <div class="pbody">
      <span class="badge ${s.cls}">${s.label}</span>
      <p><b>${esc(pic.caption || 'No caption')}</b></p>
      <p class="meta">By ${esc(pic.takenByName)} · ${fmtTime(pic.createdAt)}</p>
      ${photoGeo(pic)}
      ${pic.constructorNote ? `<p class="meta">Constructor note: ${esc(pic.constructorNote)}</p>` : ''}
    </div>
  </div>`;
}

// ---------- PM: capture & send ----------
async function renderCapture(body) {
  const projects = await api('/projects');
  if (!projects.length) return body.innerHTML = '<div class="empty">You have no assigned projects.</div>';
  body.innerHTML = `
    <div class="card form-card">
      <h3>Capture site photos &amp; send to constructor</h3>
      <p class="meta">Take a photo on your phone/tablet or choose existing images. They will be forwarded to the constructor for assessment.</p>
      <form id="cap-form">
        <label>Project</label>
        <select id="cap-project">${projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
        <label>Caption / note</label>
        <input id="cap-caption" placeholder="e.g. Second floor slab casting complete" />
        <label>Photos</label>
        <input id="cap-files" type="file" accept="image/*" capture="environment" multiple required />
        <div class="geo-box" id="geo-box">
          <span id="geo-status">📍 Requesting your location…</span>
          <button type="button" class="btn sm ghost" id="geo-retry">Use my location</button>
        </div>
        <button class="btn primary full" type="submit">Send to constructor</button>
        <p class="error" id="cap-msg"></p>
      </form>
    </div>
    <div class="section-title"><h3>Recently sent</h3></div>
    <div id="cap-recent"></div>`;

  const recent = await api('/pictures');
  const mine = recent.filter((p) => p.takenById === me.id).slice(0, 9);
  $('#cap-recent').innerHTML = mine.length ? `<div class="photos">${mine.map((p) => photoCard(p)).join('')}</div>` : '<div class="empty">Nothing sent yet.</div>';

  // --- capture device location for photo evidence ---
  captureGeo = null;
  const requestGeo = () => {
    const st = $('#geo-status');
    if (!('geolocation' in navigator)) { st.textContent = '📍 Location not supported on this device'; return; }
    st.textContent = '📍 Requesting your location…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        captureGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        st.textContent = `📍 Location captured: ${captureGeo.lat.toFixed(5)}, ${captureGeo.lng.toFixed(5)} (±${Math.round(captureGeo.accuracy)}m)`;
        $('#geo-box').classList.add('ok');
      },
      (err) => {
        captureGeo = null;
        $('#geo-box').classList.remove('ok');
        st.textContent = err.code === 1
          ? '📍 Location permission denied — photos will upload without GPS'
          : '📍 Location unavailable — photos will upload without GPS';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };
  $('#geo-retry').addEventListener('click', requestGeo);
  requestGeo();

  $('#cap-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = $('#cap-files').files;
    if (!files.length) return;
    const fd = new FormData();
    fd.append('caption', $('#cap-caption').value);
    if (captureGeo) {
      fd.append('lat', captureGeo.lat);
      fd.append('lng', captureGeo.lng);
      fd.append('accuracy', captureGeo.accuracy);
      fd.append('capturedAt', new Date().toISOString());
    }
    for (const f of files) fd.append('photos', f);
    $('#cap-msg').textContent = 'Uploading…';
    try {
      await api('/projects/' + $('#cap-project').value + '/pictures', { method: 'POST', body: fd });
      toast(captureGeo ? 'Photos sent (with location)' : 'Photos sent to the constructor');
      render();
    } catch (err) { $('#cap-msg').textContent = err.message; }
  });
}

// ---------- constructor: review ----------
async function renderReview(body) {
  const pics = await api('/pictures?status=pending_constructor');
  body.innerHTML = pics.length
    ? `<div class="photos">${pics.map(reviewCard).join('')}</div>`
    : '<div class="empty">No photos awaiting assessment. You are all caught up.</div>';
  body.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => assess(Number(b.dataset.approve), 'approve')));
  body.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => assess(Number(b.dataset.reject), 'reject')));
}

function reviewCard(pic) {
  return `<div class="photo">
    <img src="${pic.url}" onerror="this.style.opacity=.3" />
    <div class="pbody">
      <p><b>${esc(pic.projectName)}</b></p>
      <p>${esc(pic.caption || 'No caption')}</p>
      <p class="meta">By ${esc(pic.takenByName)} · ${fmtTime(pic.createdAt)}</p>
      ${photoGeo(pic)}
      <div class="pactions">
        <button class="btn sm green" data-approve="${pic.id}">Approve &amp; submit</button>
        <button class="btn sm red" data-reject="${pic.id}">Reject</button>
      </div>
    </div>
  </div>`;
}

async function assess(id, decision) {
  const note = prompt(decision === 'approve'
    ? 'Optional assessment note for the minister:'
    : 'Reason for rejecting this photo:', '');
  if (decision === 'reject' && note === null) return;
  try {
    await api('/pictures/' + id + '/assess', { method: 'POST', body: JSON.stringify({ decision, note: note || '' }) });
    toast(decision === 'approve' ? 'Approved and submitted to the minister' : 'Photo rejected');
    render();
  } catch (e) { toast(e.message); }
}

// ---------- minister: submissions ----------
async function renderSubmissions(body) {
  const pics = await api('/pictures');
  body.innerHTML = pics.length
    ? `<div class="photos">${pics.map(ministerCard).join('')}</div>`
    : '<div class="empty">No photos have been submitted to you yet.</div>';
  pics.filter((p) => !p.ministerViewedAt).forEach((p) => api('/pictures/' + p.id + '/view', { method: 'POST' }).catch(() => {}));
}

function ministerCard(pic) {
  const verified = pic.lat != null
    ? '<span class="badge green">📍 Location verified</span>'
    : '<span class="badge gray">No location</span>';
  return `<div class="photo">
    <img src="${pic.url}" onerror="this.style.opacity=.3" />
    <div class="pbody">
      <div class="row"><p style="margin:0"><b>${esc(pic.projectName)}</b></p>${verified}</div>
      <p>${esc(pic.caption || 'No caption')}</p>
      <p class="meta">Field PM: ${esc(pic.takenByName)}</p>
      <p class="meta">Assessed &amp; submitted by: ${esc(pic.assessedByName || '—')}</p>
      ${photoGeo(pic)}
      ${pic.constructorNote ? `<p class="meta">Constructor's note: ${esc(pic.constructorNote)}</p>` : ''}
      <p class="meta">${fmtTime(pic.assessedAt)}</p>
    </div>
  </div>`;
}

// ---------- constructor: project managers (team) ----------
async function renderTeam(body) {
  const [pms, projects] = await Promise.all([api('/users?role=project_manager'), api('/projects')]);
  const projectsByPm = {};
  projects.forEach((p) => { if (p.projectManagerId) (projectsByPm[p.projectManagerId] ||= []).push(p.name); });

  body.innerHTML = `
    <div class="section-title"><h3>${pms.length} project manager(s)</h3><button class="btn primary sm" id="add-pm">+ Add project manager</button></div>
    ${pms.length ? `<table>
      <thead><tr><th>Name</th><th>Email</th><th>Assigned projects</th></tr></thead>
      <tbody>${pms.map((u) => `<tr>
        <td>${esc(u.name)}</td><td>${esc(u.email)}</td>
        <td>${(projectsByPm[u.id] || []).map(esc).join(', ') || '<span class="meta">— none —</span>'}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<div class="empty">No project managers yet. Add one, then assign them to a project.</div>'}`;

  $('#add-pm').addEventListener('click', () => {
    modal('Add project manager', `
      <form id="pm-form">
        <label>Full name</label><input id="pm-name" required />
        <label>Email</label><input id="pm-email" type="email" required />
        <label>Password</label><input id="pm-pass" required />
        <p class="error" id="pm-msg"></p>
        <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Create</button></div>
      </form>`);
    $('#pm-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('/users', { method: 'POST', body: JSON.stringify({
          name: $('#pm-name').value, email: $('#pm-email').value,
          password: $('#pm-pass').value, role: 'project_manager' }) });
        closeModal(); toast('Project manager created'); render();
      } catch (err) { $('#pm-msg').textContent = err.message; }
    });
  });
}

// ---------- constructor: laborers & suppliers approval ----------
let approvalsFilter = 'pending';
async function renderApprovals(body) {
  const [parts, projects] = await Promise.all([api('/participants'), api('/projects')]);
  const counts = {
    pending: parts.filter((p) => p.status === 'pending').length,
    laborer: parts.filter((p) => p.kind === 'laborer').length,
    supplier: parts.filter((p) => p.kind === 'supplier').length,
    approved: parts.filter((p) => p.status === 'approved').length,
  };
  const filters = [
    ['pending', `Pending (${counts.pending})`],
    ['laborer', `Laborers (${counts.laborer})`],
    ['supplier', `Suppliers (${counts.supplier})`],
    ['approved', `Approved (${counts.approved})`],
    ['all', 'All'],
  ];
  let list = parts;
  if (approvalsFilter === 'pending') list = parts.filter((p) => p.status === 'pending');
  else if (approvalsFilter === 'approved') list = parts.filter((p) => p.status === 'approved');
  else if (approvalsFilter === 'laborer' || approvalsFilter === 'supplier') list = parts.filter((p) => p.kind === approvalsFilter);

  body.innerHTML = `
    <div class="section-title">
      <div style="display:flex;gap:8px;flex-wrap:wrap">${filters.map(([k, lbl]) =>
        `<button class="btn sm ${approvalsFilter === k ? 'primary' : 'ghost'}" data-filter="${k}">${lbl}</button>`).join('')}</div>
    </div>
    ${list.length ? `<div class="grid">${list.map((p) => participantCard(p, projects)).join('')}</div>`
                  : '<div class="empty">No applicants in this view.</div>'}`;

  body.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { approvalsFilter = b.dataset.filter; render(); }));
  body.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => {
    const sel = body.querySelector(`#proj-${b.dataset.approve}`);
    reviewParticipant(Number(b.dataset.approve), 'approve', sel ? sel.value : '');
  }));
  body.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => reviewParticipant(Number(b.dataset.reject), 'reject')));
}

const VERIF = {
  verified: { label: '✔ Verified', cls: 'green' },
  unverified: { label: '… Unverified', cls: 'amber' },
  flagged: { label: '⚠ Flagged', cls: 'red' },
};
function participantCard(p, projects) {
  const v = VERIF[p.verification] || VERIF.unverified;
  const kindBadge = p.kind === 'supplier' ? '<span class="badge blue">Supplier</span>' : '<span class="badge gray">Laborer</span>';
  const idLabel = p.kind === 'supplier' ? 'Business reg' : 'National ID';
  let footer;
  if (p.status === 'pending') {
    footer = `
      <select id="proj-${p.id}" style="margin-top:8px">
        <option value="">Select project to assign…</option>
        ${projects.map((pr) => `<option value="${pr.id}">${esc(pr.name)}</option>`).join('')}
      </select>
      <div class="pactions">
        <button class="btn sm green" data-approve="${p.id}">Approve &amp; assign</button>
        <button class="btn sm red" data-reject="${p.id}">Reject</button>
      </div>`;
  } else if (p.status === 'approved') {
    footer = `<p class="meta" style="margin-top:8px">✅ Assigned to <b>${esc(p.assignedProjectName || '—')}</b><br>by ${esc(p.reviewedByName || '')}</p>`;
  } else {
    footer = `<p class="meta" style="margin-top:8px">❌ Rejected${p.reviewNote ? ' — ' + esc(p.reviewNote) : ''}</p>`;
  }
  return `<div class="card">
    <div class="row"><h3 style="font-size:15px">${esc(p.name)}</h3>${kindBadge}</div>
    <p class="meta">${esc(p.specialty)}</p>
    <p class="meta">${idLabel}: ${esc(p.idNumber)} · Tel: ${esc(p.contact)}</p>
    <p class="meta">Source: ${esc(p.source)} (${esc(p.externalId)})</p>
    <p style="margin:8px 0 0"><span class="badge ${v.cls}">${v.label}</span></p>
    ${footer}
  </div>`;
}

async function reviewParticipant(id, decision, projectId) {
  if (decision === 'approve' && !projectId) { toast('Select a project to assign this applicant to'); return; }
  let note = '';
  if (decision === 'reject') {
    note = prompt('Reason for rejecting this applicant:', '');
    if (note === null) return;
  }
  try {
    await api('/participants/' + id + '/review', { method: 'POST', body: JSON.stringify({ decision, projectId: projectId || null, note }) });
    toast(decision === 'approve' ? 'Approved and assigned' : 'Applicant rejected');
    render();
  } catch (e) { toast(e.message); }
}

// ---------- conversations (channel 'minister' or 'pm') ----------
let openThreadId = null;
let openThreadChannel = 'minister';

// Who the current user is talking to, given a thread summary + channel.
function counterpart(t, channel) {
  if (channel === 'pm') {
    return me.role === 'constructor' ? (t.pmName || 'the project manager (unassigned)') : (t.contractorName || 'the constructor');
  }
  return me.role === 'minister' ? (t.contractorName || 'the constructor') : `the Minister of ${t.ministry}`;
}

async function renderFeedback(body, channel) {
  const threads = await api('/feedback?channel=' + channel);
  if (!threads.length) {
    return body.innerHTML = `<div class="empty">${channel === 'pm'
      ? 'No projects to discuss yet.' : 'No projects available for feedback yet.'}</div>`;
  }
  body.innerHTML = `<div class="grid">${threads.map((t) => threadCard(t, channel)).join('')}</div>`;
  body.querySelectorAll('[data-thread]').forEach((b) => b.addEventListener('click', () => openThread(Number(b.dataset.thread), channel)));
}

function threadCard(t, channel) {
  const last = t.lastBody
    ? `<p class="meta" style="margin-top:8px"><b>${esc(t.lastFrom)}:</b> ${esc(t.lastBody.length > 90 ? t.lastBody.slice(0, 90) + '…' : t.lastBody)}</p>
       <p class="meta">${fmtTime(t.lastAt)}</p>`
    : '<p class="meta" style="margin-top:8px">No messages yet — start the conversation.</p>';
  const sub = channel === 'pm'
    ? `${esc(t.name)} · with ${esc(counterpart(t, channel))}`
    : `Ministry of ${esc(t.ministry)} · Contractor: ${esc(t.contractorName || '—')}`;
  return `<div class="card">
    <div class="row"><h3 style="font-size:15px">${esc(t.name)}</h3>
      <span class="badge ${t.messageCount ? 'blue' : 'gray'}">${t.messageCount} message${t.messageCount === 1 ? '' : 's'}</span></div>
    <p class="meta">${sub}</p>
    ${last}
    <div class="pactions"><button class="btn sm primary" data-thread="${t.id}">Open conversation</button></div>
  </div>`;
}

async function openThread(projectId, channel) {
  openThreadId = projectId; openThreadChannel = channel;
  const project = await api('/projects/' + projectId);
  const other = counterpart({ contractorName: project.contractorName, pmName: project.projectManagerName, ministry: project.ministry }, channel);

  // In the constructor<->PM channel, show the project's photos as context.
  let photoStrip = '';
  if (channel === 'pm') {
    try {
      const pics = await api('/pictures?projectId=' + projectId);
      if (pics.length) {
        photoStrip = `<div class="photo-strip">${pics.slice(0, 12).map((p) => {
          const s = PIC_STATUS[p.status];
          return `<div class="thumb" title="${esc(p.caption || '')}">
            <img src="${p.url}" onerror="this.style.opacity=.3" />
            <span class="badge ${s.cls}">${s.label}</span></div>`;
        }).join('')}</div>`;
      }
    } catch (e) { /* ignore */ }
  }

  modal(`${channel === 'pm' ? 'Site messages' : 'Feedback'} — ${esc(project.name)}`, `
    <p class="meta">Conversation with ${esc(other)}.</p>
    ${photoStrip}
    <div class="thread" id="thread"><p class="meta">Loading…</p></div>
    <form id="msg-form" class="composer">
      <textarea id="msg-body" rows="2" placeholder="${channel === 'pm' ? 'Write a message about the photos…' : 'Write your feedback…'}" required></textarea>
      <button class="btn primary" type="submit">Send</button>
    </form>`);

  const root = $('#modal-root');
  const obs = new MutationObserver(() => { if (!root.firstChild) { openThreadId = null; obs.disconnect(); } });
  obs.observe(root, { childList: true });

  $('#msg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#msg-body').value.trim();
    if (!text) return;
    try {
      await api('/projects/' + projectId + '/messages', { method: 'POST', body: JSON.stringify({ body: text, channel }) });
      $('#msg-body').value = '';
      loadThread(projectId, channel);
    } catch (err) { toast(err.message); }
  });
  loadThread(projectId, channel);
}

async function loadThread(projectId, channel) {
  const el = document.getElementById('thread');
  if (!el) return;
  let msgs;
  try { msgs = await api('/projects/' + projectId + '/messages?channel=' + (channel || openThreadChannel)); } catch (e) { return; }
  el.innerHTML = msgs.length ? msgs.map((m) => {
    const mine = m.fromId === me.id;
    return `<div class="bubble ${mine ? 'me' : 'them'}">
      <div class="who-line">${esc(m.fromName)} · ${ROLE_LABEL[m.fromRole] || m.fromRole}</div>
      <div>${esc(m.body)}</div>
      <div class="when">${fmtTime(m.createdAt)}</div>
    </div>`;
  }).join('') : '<p class="meta">No messages yet — start the conversation.</p>';
  el.scrollTop = el.scrollHeight;
}

// ---------- admin: users ----------
async function renderUsers(body) {
  const users = await api('/users');
  body.innerHTML = `
    <div class="section-title"><h3>System accounts</h3><button class="btn primary sm" id="add-user">+ Add user</button></div>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Ministry</th></tr></thead>
      <tbody>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${ROLE_LABEL[u.role]}</td><td>${esc(u.ministry || '—')}</td></tr>`).join('')}</tbody>
    </table>`;
  $('#add-user').addEventListener('click', addUserModal);
}

function addUserModal() {
  modal('Add user', `
    <form id="user-form">
      <label>Full name</label><input id="u-name" required />
      <label>Email</label><input id="u-email" type="email" required />
      <label>Password</label><input id="u-pass" required />
      <label>Role</label>
      <select id="u-role">
        <option value="project_manager">Project Manager</option>
        <option value="constructor">Constructor</option>
        <option value="minister">Minister</option>
        <option value="admin">Administrator</option>
      </select>
      <div id="u-ministry-wrap" class="hidden"><label>Ministry</label><input id="u-ministry" placeholder="e.g. Health" /></div>
      <p class="error" id="u-msg"></p>
      <div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn primary">Create</button></div>
    </form>`);
  const roleSel = $('#u-role');
  const toggle = () => $('#u-ministry-wrap').classList.toggle('hidden', roleSel.value !== 'minister');
  roleSel.addEventListener('change', toggle); toggle();
  $('#user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({
        name: $('#u-name').value, email: $('#u-email').value, password: $('#u-pass').value,
        role: roleSel.value, ministry: $('#u-ministry') ? $('#u-ministry').value : null }) });
      closeModal(); toast('User created'); render();
    } catch (err) { $('#u-msg').textContent = err.message; }
  });
}

// ---------- modal ----------
function modal(title, html) {
  $('#modal-root').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)closeModal()">
    <div class="modal"><h2>${esc(title)}</h2>${html}</div></div>`;
}
function closeModal() { $('#modal-root').innerHTML = ''; }
window.closeModal = closeModal;

// ---------- map button delegation (works across all photo cards) ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-map]');
  if (!b) return;
  const [lat, lng] = b.dataset.map.split(',').map(Number);
  openMap(lat, lng, b.dataset.maplabel || '');
});

// ---------- boot ----------
if (token) enterApp(); else { $('#login-view').classList.remove('hidden'); }
