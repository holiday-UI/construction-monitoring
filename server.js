const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const store = require('./store');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- file uploads (pictures) ----------
// Photos go to Cloudinary when CLOUDINARY_URL is configured (persistent, needed
// in the cloud where local disk is wiped on redeploy); otherwise they are saved
// to local disk for zero-setup development.
const USE_CLOUDINARY = !!process.env.CLOUDINARY_URL;
let cloudinary = null;
if (USE_CLOUDINARY) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({ secure: true }); // reads CLOUDINARY_URL from the environment
}

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: USE_CLOUDINARY
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => {
          const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + '-' + safe);
        },
      }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Returns a public URL for an uploaded file, storing it in the chosen backend.
function storeUploadedFile(f) {
  if (USE_CLOUDINARY) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'construction-monitoring' },
        (err, result) => (err ? reject(err) : resolve(result.secure_url))
      );
      stream.end(f.buffer);
    });
  }
  return Promise.resolve('/uploads/' + f.filename);
}

// ---------- helpers ----------
const now = () => new Date().toISOString();

function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = store.findOne('users', (u) => u.id === payload.id);
    if (!user) return res.status(401).json({ error: 'Unknown user' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden for your role' });
    next();
  };
}

function logActivity(type, message, projectId) {
  const entry = store.insert('activity', { type, message, projectId: projectId || null, at: now() });
  broadcast({ event: 'activity', data: entry });
  return entry;
}

// Projects a given user is allowed to see.
function visibleProjects(user) {
  const projects = store.all('projects');
  switch (user.role) {
    case 'admin': return projects;
    case 'minister': return projects.filter((p) => p.ministry === user.ministry);
    case 'constructor': return projects.filter((p) => p.contractorId === user.id);
    case 'project_manager': return projects.filter((p) => p.projectManagerId === user.id);
    default: return [];
  }
}

function canSeeProject(user, project) {
  return visibleProjects(user).some((p) => p.id === project.id);
}

// Decorate a project with people names for display.
function decorate(p) {
  const pm = store.findOne('users', (u) => u.id === p.projectManagerId);
  const con = store.findOne('users', (u) => u.id === p.contractorId);
  return { ...p, projectManagerName: pm ? pm.name : null, contractorName: con ? con.name : null };
}

// ---------- auth routes ----------
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = store.findOne('users', (u) => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

// ---------- users ----------
// Admin sees everyone; constructor may list project managers (to assign them).
app.get('/api/users', auth, requireRole('admin', 'constructor'), (req, res) => {
  let users = store.all('users');
  if (req.user.role === 'constructor') users = users.filter((u) => u.role === 'project_manager');
  if (req.query.role) users = users.filter((u) => u.role === req.query.role);
  res.json(users.map(publicUser));
});

app.post('/api/users', auth, requireRole('admin', 'constructor'), (req, res) => {
  const { name, email, password, role, ministry } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'name, email, password, role required' });
  if (store.findOne('users', (u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Email already exists' });
  }
  const valid = ['admin', 'minister', 'constructor', 'project_manager'];
  if (!valid.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  // A constructor may only create project managers.
  if (req.user.role === 'constructor' && role !== 'project_manager') {
    return res.status(403).json({ error: 'Constructors can only create project managers' });
  }
  const user = store.insert('users', {
    name, email, password: bcrypt.hashSync(password, 10), role,
    ministry: role === 'minister' ? (ministry || null) : null,
    createdById: req.user.id, createdAt: now(),
  });
  logActivity('user_created', `${req.user.name} created a new ${role.replace('_', ' ')} account: ${name}`);
  res.status(201).json(publicUser(user));
});

// Ministries available to assign a project to (those that have a minister).
app.get('/api/ministries', auth, requireRole('admin', 'constructor'), (req, res) => {
  const set = new Set(store.all('users').filter((u) => u.role === 'minister' && u.ministry).map((u) => u.ministry));
  res.json([...set].sort());
});

// ---------- projects ----------
app.get('/api/projects', auth, (req, res) => {
  res.json(visibleProjects(req.user).map(decorate));
});

app.get('/api/projects/:id', auth, (req, res) => {
  const project = store.findOne('projects', (p) => p.id === Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canSeeProject(req.user, project)) return res.status(403).json({ error: 'Not your project' });
  res.json(decorate(project));
});

// Constructors and admins register projects. A constructor is auto-set as the contractor.
app.post('/api/projects', auth, requireRole('admin', 'constructor'), (req, res) => {
  const { name, type, ministry, location, contractorId, projectManagerId, budget, startDate, expectedEnd, description } = req.body || {};
  if (!name || !ministry) return res.status(400).json({ error: 'name and ministry required' });
  const contractor = req.user.role === 'constructor' ? req.user.id : (contractorId ? Number(contractorId) : null);
  const project = store.insert('projects', {
    name, type: type || 'General', ministry, location: location || '',
    contractorId: contractor,
    projectManagerId: projectManagerId ? Number(projectManagerId) : null,
    status: 'In Progress', progress: 0,
    budget: budget ? Number(budget) : 0,
    startDate: startDate || null, expectedEnd: expectedEnd || null,
    description: description || '', createdAt: now(),
  });
  logActivity('project_created', `${req.user.name} registered project "${name}" under Ministry of ${ministry}.`, project.id);
  broadcast({ event: 'project', data: decorate(project) });
  res.status(201).json(decorate(project));
});

// Constructor / admin assign (or change) the project manager on a project.
app.post('/api/projects/:id/team', auth, requireRole('admin', 'constructor'), (req, res) => {
  const project = store.findOne('projects', (p) => p.id === Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (req.user.role === 'constructor' && project.contractorId !== req.user.id) {
    return res.status(403).json({ error: 'Not your project' });
  }
  const { projectManagerId } = req.body || {};
  const pmId = projectManagerId ? Number(projectManagerId) : null;
  if (pmId) {
    const pm = store.findOne('users', (u) => u.id === pmId && u.role === 'project_manager');
    if (!pm) return res.status(400).json({ error: 'Unknown project manager' });
  }
  const updated = store.update('projects', project.id, { projectManagerId: pmId });
  const pm = store.findOne('users', (u) => u.id === pmId);
  logActivity('team', `${req.user.name} assigned ${pm ? pm.name : 'no one'} as project manager of "${project.name}".`, project.id);
  broadcast({ event: 'project', data: decorate(updated) });
  res.json(decorate(updated));
});

// PM / admin update progress & status
app.post('/api/projects/:id/progress', auth, requireRole('project_manager', 'admin'), (req, res) => {
  const project = store.findOne('projects', (p) => p.id === Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canSeeProject(req.user, project)) return res.status(403).json({ error: 'Not your project' });
  const { progress, status, note } = req.body || {};
  const patch = {};
  if (progress != null) patch.progress = Math.max(0, Math.min(100, Number(progress)));
  if (status) patch.status = status;
  const updated = store.update('projects', project.id, patch);
  logActivity('progress', `${req.user.name} updated "${project.name}" -> ${updated.progress}% (${updated.status})${note ? ': ' + note : ''}`, project.id);
  broadcast({ event: 'project', data: decorate(updated) });
  res.json(decorate(updated));
});

// ---------- pictures (the core workflow) ----------
// PM uploads -> pending_constructor
app.post('/api/projects/:id/pictures', auth, requireRole('project_manager', 'admin'), upload.array('photos', 8), async (req, res) => {
  const project = store.findOne('projects', (p) => p.id === Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canSeeProject(req.user, project)) return res.status(403).json({ error: 'Not your project' });
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'No photos uploaded' });

  // Optional geolocation captured by the PM's device at the time of the photo.
  const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
  const lat = num(req.body.lat), lng = num(req.body.lng), accuracy = num(req.body.accuracy);
  const capturedAt = req.body.capturedAt || null;

  let urls;
  try {
    urls = await Promise.all(req.files.map(storeUploadedFile));
  } catch (e) {
    console.error('Photo upload failed:', e.message);
    return res.status(502).json({ error: 'Photo upload failed, please try again' });
  }

  const created = req.files.map((f, i) => store.insert('pictures', {
    projectId: project.id,
    url: urls[i],
    caption: req.body.caption || '',
    lat, lng, accuracy, capturedAt,
    takenById: req.user.id,
    takenByName: req.user.name,
    status: 'pending_constructor',
    constructorNote: '',
    assessedById: null,
    assessedByName: null,
    assessedAt: null,
    ministerViewedAt: null,
    createdAt: now(),
  }));

  const geoNote = lat != null ? ' (location captured)' : '';
  logActivity('picture_uploaded', `${req.user.name} sent ${created.length} photo(s) of "${project.name}" to the constructor for review${geoNote}.`, project.id);
  created.forEach((pic) => broadcast({ event: 'picture', data: pic }));
  res.status(201).json(created);
});

// list pictures (filtered by role + optional project/status)
app.get('/api/pictures', auth, (req, res) => {
  const visibleIds = new Set(visibleProjects(req.user).map((p) => p.id));
  let pics = store.all('pictures').filter((pic) => visibleIds.has(pic.projectId));

  if (req.query.projectId) pics = pics.filter((p) => p.projectId === Number(req.query.projectId));
  if (req.query.status) pics = pics.filter((p) => p.status === req.query.status);

  // Ministers only ever see what was submitted to them.
  if (req.user.role === 'minister') pics = pics.filter((p) => p.status === 'submitted_to_minister');

  const byProject = Object.fromEntries(store.all('projects').map((p) => [p.id, p.name]));
  pics = pics.map((p) => ({ ...p, projectName: byProject[p.projectId] || 'Unknown' }));
  pics.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(pics);
});

// Constructor assesses: approve (-> submit to minister) or reject
app.post('/api/pictures/:id/assess', auth, requireRole('constructor', 'admin'), (req, res) => {
  const pic = store.findOne('pictures', (p) => p.id === Number(req.params.id));
  if (!pic) return res.status(404).json({ error: 'Picture not found' });
  const project = store.findOne('projects', (p) => p.id === pic.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (req.user.role === 'constructor' && project.contractorId !== req.user.id) {
    return res.status(403).json({ error: 'Not your project' });
  }
  const { decision, note } = req.body || {};
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or reject' });

  const status = decision === 'approve' ? 'submitted_to_minister' : 'rejected';
  const updated = store.update('pictures', pic.id, {
    status,
    constructorNote: note || '',
    assessedById: req.user.id,
    assessedByName: req.user.name,
    assessedAt: now(),
  });

  const minister = store.findOne('users', (u) => u.role === 'minister' && u.ministry === project.ministry);
  const target = minister ? minister.name : `Minister of ${project.ministry}`;
  const msg = decision === 'approve'
    ? `${req.user.name} assessed a photo of "${project.name}" and submitted it to ${target}.`
    : `${req.user.name} rejected a photo of "${project.name}"${note ? ': ' + note : ''}.`;
  logActivity(decision === 'approve' ? 'picture_submitted' : 'picture_rejected', msg, project.id);
  broadcast({ event: 'picture', data: updated });
  res.json(updated);
});

// Minister marks a submitted picture as viewed
app.post('/api/pictures/:id/view', auth, requireRole('minister'), (req, res) => {
  const pic = store.findOne('pictures', (p) => p.id === Number(req.params.id));
  if (!pic || pic.status !== 'submitted_to_minister') return res.status(404).json({ error: 'Not available' });
  const project = store.findOne('projects', (p) => p.id === pic.projectId);
  if (!project || project.ministry !== req.user.ministry) return res.status(403).json({ error: 'Not your ministry' });
  const updated = store.update('pictures', pic.id, { ministerViewedAt: pic.ministerViewedAt || now() });
  broadcast({ event: 'picture', data: updated });
  res.json(updated);
});

// ---------- laborers & suppliers (from the external sign-up app) ----------
// They register in a separate application; here the constructor verifies their
// legitimacy, then approves & assigns them to one of their projects, or rejects.

function decorateParticipant(p) {
  const proj = p.assignedProjectId ? store.findOne('projects', (x) => x.id === p.assignedProjectId) : null;
  return { ...p, assignedProjectName: proj ? proj.name : null };
}

// What a user is allowed to see: admin -> all; constructor -> all pending (the
// shared incoming pool) plus anyone assigned to one of their projects.
function visibleParticipants(user) {
  const list = store.all('participants');
  if (user.role === 'admin') return list;
  if (user.role === 'constructor') {
    const myProjectIds = new Set(visibleProjects(user).map((p) => p.id));
    return list.filter((p) => p.status === 'pending' || (p.assignedProjectId && myProjectIds.has(p.assignedProjectId)) || p.reviewedById === user.id);
  }
  return [];
}

app.get('/api/participants', auth, requireRole('admin', 'constructor'), (req, res) => {
  let list = visibleParticipants(req.user);
  if (req.query.kind) list = list.filter((p) => p.kind === req.query.kind);
  if (req.query.status) list = list.filter((p) => p.status === req.query.status);
  list = list.map(decorateParticipant).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json(list);
});

// Approve (+ assign to a project) or reject an applicant.
app.post('/api/participants/:id/review', auth, requireRole('admin', 'constructor'), (req, res) => {
  const p = store.findOne('participants', (x) => x.id === Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Applicant not found' });
  const { decision, projectId, note } = req.body || {};
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision must be approve or reject' });

  let assignedProjectId = null;
  if (decision === 'approve') {
    if (!projectId) return res.status(400).json({ error: 'A project is required to approve & assign' });
    const project = store.findOne('projects', (x) => x.id === Number(projectId));
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (req.user.role === 'constructor' && project.contractorId !== req.user.id) {
      return res.status(403).json({ error: 'You can only assign to your own projects' });
    }
    assignedProjectId = project.id;
  }

  const updated = store.update('participants', p.id, {
    status: decision === 'approve' ? 'approved' : 'rejected',
    assignedProjectId,
    reviewNote: note || '',
    reviewedById: req.user.id,
    reviewedByName: req.user.name,
    reviewedAt: now(),
  });

  const proj = assignedProjectId ? store.findOne('projects', (x) => x.id === assignedProjectId) : null;
  const label = p.kind === 'supplier' ? 'supplier' : 'laborer';
  const msg = decision === 'approve'
    ? `${req.user.name} approved ${label} ${p.name} and assigned them to "${proj.name}".`
    : `${req.user.name} rejected ${label} ${p.name}${note ? ': ' + note : ''}.`;
  logActivity(decision === 'approve' ? 'participant_approved' : 'participant_rejected', msg, assignedProjectId);
  broadcast({ event: 'participant', data: decorateParticipant(updated) });
  res.json(decorateParticipant(updated));
});

// Simulate an incoming sign-up from the external app (stand-in until it is linked).
app.post('/api/participants/simulate', auth, requireRole('admin', 'constructor'), (req, res) => {
  const laborers = [
    ['Peter Kamau', 'Mason'], ['Alice Wanjiku', 'Electrician'], ['Joseph Otieno', 'Plumber'],
    ['Mary Chebet', 'Steel fixer'], ['Samuel Mwangi', 'Carpenter'], ['Grace Akinyi', 'Painter'],
    ['Daniel Kiprono', 'Welder'], ['Esther Njeri', 'Tiler'],
  ];
  const suppliers = [
    ['Bamburi Cement Ltd', 'Cement & aggregates'], ['Devki Steel Mills', 'Steel & reinforcement'],
    ['Crown Paints Ltd', 'Paints & finishes'], ['Mabati Rolling Mills', 'Roofing sheets'],
    ['Savannah Sand Suppliers', 'Sand & ballast'],
  ];
  const kind = Math.random() < 0.6 ? 'laborer' : 'supplier';
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const [name, specialty] = kind === 'laborer' ? pick(laborers) : pick(suppliers);
  const verifications = ['verified', 'verified', 'verified', 'unverified', 'flagged'];
  const verification = verifications[Math.floor(Math.random() * verifications.length)];
  const created = store.insert('participants', {
    kind, name, specialty,
    idNumber: kind === 'laborer' ? String(10000000 + Math.floor(Math.random() * 89999999))
                                 : 'BRS-' + (100000 + Math.floor(Math.random() * 899999)),
    contact: '07' + (10000000 + Math.floor(Math.random() * 89999999)),
    source: 'WorkerConnect App', externalId: 'WC-' + (1000 + Math.floor(Math.random() * 9000)),
    verification, status: 'pending',
    assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null,
    createdAt: now(),
  });
  logActivity('participant_incoming', `New ${kind} sign-up received from external app: ${name} (${specialty}).`);
  broadcast({ event: 'participant', data: decorateParticipant(created) });
  res.status(201).json(decorateParticipant(created));
});

// CORS for the public external endpoints (the WorkerConnect app may run on a
// different origin, e.g. Flutter web or a mobile webview).
app.use('/api/external', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------- external sign-up (WorkerConnect mobile app) ----------
// PUBLIC, no auth: laborers & suppliers register themselves from the mobile app.
// They land in the shared "pending" pool that constructors verify, approve and
// assign to a project. Self-registrations start as "unverified".
app.post('/api/external/register', (req, res) => {
  const b = req.body || {};
  const kind = b.kind === 'supplier' ? 'supplier' : (b.kind === 'laborer' ? 'laborer' : null);
  const name = String(b.name || '').trim();
  const specialty = String(b.specialty || '').trim();
  const idNumber = String(b.idNumber || '').trim();
  const contact = String(b.contact || '').trim();

  if (!kind) return res.status(400).json({ error: 'kind must be "laborer" or "supplier"' });
  if (!name) return res.status(400).json({ error: 'Full name / company name is required' });
  if (!contact) return res.status(400).json({ error: 'A phone contact is required' });
  if (!specialty) return res.status(400).json({ error: kind === 'supplier' ? 'What you supply is required' : 'Your trade / specialty is required' });

  // Avoid obvious duplicate sign-ups from the same phone while still pending.
  const dup = store.findOne('participants', (p) => p.contact === contact && p.status === 'pending');
  if (dup) {
    return res.status(409).json({
      error: 'An application from this phone number is already pending review.',
      trackingId: dup.externalId,
    });
  }

  const seq = 1000 + store.all('participants').length + 1;
  const externalId = (kind === 'laborer' ? 'WC-1' : 'WC-2') + seq;
  const created = store.insert('participants', {
    kind, name, specialty,
    idNumber: idNumber || null,
    contact,
    source: 'WorkerConnect App',
    externalId,
    verification: 'unverified',
    status: 'pending',
    assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null,
    createdAt: now(),
  });
  logActivity('participant_incoming', `New ${kind} sign-up received from WorkerConnect: ${name} (${specialty}).`);
  broadcast({ event: 'participant', data: decorateParticipant(created) });
  // Return only what the applicant should see (no internal review fields).
  res.status(201).json({
    trackingId: created.externalId,
    kind: created.kind,
    name: created.name,
    specialty: created.specialty,
    status: created.status,
    verification: created.verification,
    createdAt: created.createdAt,
  });
});

// PUBLIC, no auth: an applicant checks the status of their application by
// tracking id (externalId) or phone contact.
app.get('/api/external/status', (req, res) => {
  const trackingId = String(req.query.trackingId || '').trim();
  const contact = String(req.query.contact || '').trim();
  if (!trackingId && !contact) return res.status(400).json({ error: 'Provide a tracking id or phone contact' });

  const p = store.findOne('participants', (x) =>
    (trackingId && x.externalId && x.externalId.toLowerCase() === trackingId.toLowerCase()) ||
    (contact && x.contact === contact));
  if (!p) return res.status(404).json({ error: 'No application found for those details' });

  const proj = p.assignedProjectId ? store.findOne('projects', (x) => x.id === p.assignedProjectId) : null;
  res.json({
    trackingId: p.externalId,
    kind: p.kind,
    name: p.name,
    specialty: p.specialty,
    contact: p.contact,
    status: p.status,                 // pending | approved | rejected
    verification: p.verification,     // unverified | verified | flagged
    assignedProjectName: proj ? proj.name : null,
    assignedProjectLocation: proj ? (proj.location || null) : null,
    reviewNote: p.reviewNote || '',
    reviewedByName: p.reviewedByName || null,
    reviewedAt: p.reviewedAt || null,
    createdAt: p.createdAt,
  });
});

// ---------- conversations (per project, two channels) ----------
// channel 'minister' : minister  <-> constructor  (feedback / oversight)
// channel 'pm'       : constructor <-> project manager (discussing uploaded photos)
const CHANNELS = ['minister', 'pm'];
const chanOf = (m) => m.channel || 'minister';

function canUseChannel(user, project, channel) {
  if (user.role === 'admin') return true;
  if (channel === 'minister') {
    if (user.role === 'minister') return project.ministry === user.ministry;
    if (user.role === 'constructor') return project.contractorId === user.id;
    return false;
  }
  if (channel === 'pm') {
    if (user.role === 'constructor') return project.contractorId === user.id;
    if (user.role === 'project_manager') return project.projectManagerId === user.id;
    return false;
  }
  return false;
}

app.get('/api/projects/:id/messages', auth, requireRole('minister', 'constructor', 'project_manager', 'admin'), (req, res) => {
  const channel = CHANNELS.includes(req.query.channel) ? req.query.channel : 'minister';
  const project = store.findOne('projects', (p) => p.id === Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canUseChannel(req.user, project, channel)) return res.status(403).json({ error: 'Not permitted for this conversation' });
  const msgs = store.find('messages', (m) => m.projectId === project.id && chanOf(m) === channel).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  res.json(msgs);
});

app.post('/api/projects/:id/messages', auth, requireRole('minister', 'constructor', 'project_manager', 'admin'), (req, res) => {
  const channel = CHANNELS.includes(req.body && req.body.channel) ? req.body.channel : 'minister';
  const project = store.findOne('projects', (p) => p.id === Number(req.params.id));
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canUseChannel(req.user, project, channel)) return res.status(403).json({ error: 'Not permitted for this conversation' });
  const body = String((req.body && req.body.body) || '').trim();
  if (!body) return res.status(400).json({ error: 'Message cannot be empty' });

  const msg = store.insert('messages', {
    projectId: project.id,
    channel,
    fromId: req.user.id,
    fromName: req.user.name,
    fromRole: req.user.role,
    body,
    createdAt: now(),
  });
  let dir;
  if (channel === 'minister') dir = req.user.role === 'minister' ? 'to the constructor' : 'to the minister';
  else dir = req.user.role === 'constructor' ? 'to the project manager' : 'to the constructor';
  const what = channel === 'pm' ? 'a site message' : 'feedback';
  logActivity('message', `${req.user.name} sent ${what} ${dir} on "${project.name}".`, project.id);
  broadcast({ event: 'message', data: msg });
  res.status(201).json(msg);
});

// Per-project conversation summaries for a channel (the list view).
app.get('/api/feedback', auth, requireRole('minister', 'constructor', 'project_manager', 'admin'), (req, res) => {
  const channel = CHANNELS.includes(req.query.channel) ? req.query.channel : 'minister';
  const projects = visibleProjects(req.user).filter((p) => canUseChannel(req.user, p, channel));
  const nameOf = (id) => (store.findOne('users', (u) => u.id === id) || {}).name || null;
  const out = projects.map((p) => {
    const msgs = store.find('messages', (m) => m.projectId === p.id && chanOf(m) === channel).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const last = msgs[0] || null;
    return {
      id: p.id, name: p.name, ministry: p.ministry,
      contractorName: nameOf(p.contractorId), pmName: nameOf(p.projectManagerId),
      messageCount: msgs.length,
      lastFrom: last ? last.fromName : null,
      lastBody: last ? last.body : null,
      lastAt: last ? last.createdAt : null,
    };
  }).sort((a, b) => ((a.lastAt || '') < (b.lastAt || '') ? 1 : -1));
  res.json(out);
});

// ---------- activity feed + dashboard stats ----------
app.get('/api/activity', auth, (req, res) => {
  const visibleIds = new Set(visibleProjects(req.user).map((p) => p.id));
  let items = store.all('activity').filter((a) => a.projectId == null || visibleIds.has(a.projectId));
  if (req.user.role === 'minister') items = items.filter((a) => a.projectId != null && visibleIds.has(a.projectId));
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  res.json(items.slice(0, 50));
});

app.get('/api/stats', auth, (req, res) => {
  const projects = visibleProjects(req.user);
  const visibleIds = new Set(projects.map((p) => p.id));
  const pics = store.all('pictures').filter((p) => visibleIds.has(p.projectId));
  const avg = projects.length ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / projects.length) : 0;
  const parts = visibleParticipants(req.user);
  res.json({
    totalProjects: projects.length,
    inProgress: projects.filter((p) => p.status === 'In Progress').length,
    delayed: projects.filter((p) => p.status === 'Delayed').length,
    completed: projects.filter((p) => p.status === 'Completed').length,
    avgProgress: avg,
    pendingConstructor: pics.filter((p) => p.status === 'pending_constructor').length,
    submittedToMinister: pics.filter((p) => p.status === 'submitted_to_minister').length,
    pendingApprovals: parts.filter((p) => p.status === 'pending').length,
    approvedLaborers: parts.filter((p) => p.status === 'approved' && p.kind === 'laborer').length,
    approvedSuppliers: parts.filter((p) => p.status === 'approved' && p.kind === 'supplier').length,
  });
});

// fallback to SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------- WebSocket (real-time) ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((c) => { if (c.readyState === 1) c.send(msg); });
}
wss.on('connection', (ws) => ws.send(JSON.stringify({ event: 'hello', data: { ts: now() } })));

store.init()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\nReal-Time Construction Monitoring System running:`);
      console.log(`   http://localhost:${PORT}\n`);
      if (!store.all('users').length) console.log('No users found — run "npm run seed" first.\n');
    });
  })
  .catch((e) => {
    console.error('Failed to start (store init error):', e.message);
    process.exit(1);
  });
