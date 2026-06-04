// Seeds demo users and projects. Run with: npm run seed
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const hash = (p) => bcrypt.hashSync(p, 10);
const now = () => new Date().toISOString();

const users = [
  { id: 1, name: 'System Administrator', email: 'admin@cms.gov',            password: hash('admin123'),    role: 'admin',           ministry: null,        createdAt: now() },
  { id: 2, name: 'Hon. Minister of Health', email: 'minister.health@cms.gov', password: hash('minister123'), role: 'minister',     ministry: 'Health',    createdAt: now() },
  { id: 3, name: 'Hon. Minister of Education', email: 'minister.edu@cms.gov',  password: hash('minister123'), role: 'minister',     ministry: 'Education', createdAt: now() },
  { id: 4, name: 'BuildCo Constructors Ltd', email: 'constructor@buildco.com', password: hash('build123'),    role: 'constructor',     ministry: null,        createdAt: now() },
  { id: 5, name: 'John Mwangi (Site PM)',    email: 'pm.john@buildco.com',     password: hash('pm123'),       role: 'project_manager', ministry: null,        createdAt: now() },
  { id: 6, name: 'Grace Otieno (Site PM)',   email: 'pm.grace@buildco.com',    password: hash('pm123'),       role: 'project_manager', ministry: null,        createdAt: now() },
];

const projects = [
  { id: 1, name: 'Nairobi General Hospital - New Wing', type: 'Hospital', ministry: 'Health',    location: 'Nairobi',  contractorId: 4, projectManagerId: 5, status: 'In Progress', progress: 62, budget: 480000000, startDate: '2025-09-01', expectedEnd: '2026-12-15', description: '120-bed surgical wing with ICU and theatres.', createdAt: now() },
  { id: 2, name: 'Coastal Maternity Hospital',          type: 'Hospital', ministry: 'Health',    location: 'Mombasa',  contractorId: 4, projectManagerId: 6, status: 'In Progress', progress: 35, budget: 210000000, startDate: '2026-01-10', expectedEnd: '2027-03-01', description: 'New 80-bed maternity and neonatal facility.', createdAt: now() },
  { id: 3, name: 'Kisumu Rural Health Clinic Upgrade',  type: 'Hospital', ministry: 'Health',    location: 'Kisumu',   contractorId: 4, projectManagerId: 5, status: 'Delayed',     progress: 18, budget: 65000000,  startDate: '2025-11-20', expectedEnd: '2026-08-30', description: 'Outpatient block and laboratory upgrade.', createdAt: now() },
  { id: 4, name: 'Westlands Primary School Block',       type: 'School',   ministry: 'Education', location: 'Nairobi',  contractorId: 4, projectManagerId: 6, status: 'In Progress', progress: 50, budget: 90000000,  startDate: '2025-10-05', expectedEnd: '2026-09-01', description: '12-classroom block (shown to demonstrate ministry filtering).', createdAt: now() },
];

// Incoming laborers & suppliers from the external sign-up app, awaiting the
// constructor's verification, approval and assignment to a project.
const participants = [
  { id: 1, kind: 'laborer',  name: 'Peter Kamau',          specialty: 'Mason',                  idNumber: '23456789', contact: '0712345678', source: 'WorkerConnect App', externalId: 'WC-1001', verification: 'verified',   status: 'pending', assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null, createdAt: now() },
  { id: 2, kind: 'laborer',  name: 'Alice Wanjiku',        specialty: 'Electrician',            idNumber: '31245678', contact: '0722333444', source: 'WorkerConnect App', externalId: 'WC-1002', verification: 'verified',   status: 'pending', assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null, createdAt: now() },
  { id: 3, kind: 'laborer',  name: 'Joseph Otieno',        specialty: 'Plumber',                idNumber: '40567812', contact: '0733555666', source: 'WorkerConnect App', externalId: 'WC-1003', verification: 'unverified', status: 'pending', assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null, createdAt: now() },
  { id: 4, kind: 'laborer',  name: 'Mary Chebet',          specialty: 'Steel fixer',            idNumber: '29876543', contact: '0744777888', source: 'WorkerConnect App', externalId: 'WC-1004', verification: 'flagged',    status: 'pending', assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null, createdAt: now() },
  { id: 5, kind: 'supplier', name: 'Bamburi Cement Ltd',   specialty: 'Cement & aggregates',    idNumber: 'BRS-204517', contact: '0709123456', source: 'WorkerConnect App', externalId: 'WC-2001', verification: 'verified',   status: 'pending', assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null, createdAt: now() },
  { id: 6, kind: 'supplier', name: 'Devki Steel Mills',    specialty: 'Steel & reinforcement',  idNumber: 'BRS-118903', contact: '0709987654', source: 'WorkerConnect App', externalId: 'WC-2002', verification: 'verified',   status: 'pending', assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null, createdAt: now() },
  { id: 7, kind: 'supplier', name: 'Coast Hardware Co.',   specialty: 'General hardware',       idNumber: 'BRS-330221', contact: '0701112223', source: 'WorkerConnect App', externalId: 'WC-2003', verification: 'unverified', status: 'pending', assignedProjectId: null, reviewNote: '', reviewedById: null, reviewedByName: null, reviewedAt: null, createdAt: now() },
];

// Sample conversations. channel 'minister' = minister<->constructor;
// channel 'pm' = constructor<->project manager (discussing uploaded photos).
const messages = [
  { id: 1, projectId: 1, channel: 'minister', fromId: 2, fromName: 'Hon. Minister of Health',  fromRole: 'minister',        body: 'Please prioritise the ICU wing and share weekly progress photos.', createdAt: now() },
  { id: 2, projectId: 1, channel: 'minister', fromId: 4, fromName: 'BuildCo Constructors Ltd', fromRole: 'constructor',     body: 'Noted, Honourable Minister. ICU works are on schedule; photos will follow every Friday.', createdAt: now() },
  { id: 3, projectId: 1, channel: 'pm',       fromId: 4, fromName: 'BuildCo Constructors Ltd', fromRole: 'constructor',     body: 'The slab photo looks good, but please retake the rebar close-up with better lighting.', createdAt: now() },
  { id: 4, projectId: 1, channel: 'pm',       fromId: 5, fromName: 'John Mwangi (Site PM)',    fromRole: 'project_manager', body: 'Understood. I will retake the rebar photo this afternoon and upload it.', createdAt: now() },
];

const db = { users, projects, pictures: [], participants, messages, activity: [
  { id: 1, type: 'project_created', projectId: 1, message: 'Project "Nairobi General Hospital - New Wing" registered.', at: now() },
] };

fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
console.log('Seeded', users.length, 'users,', projects.length, 'projects and', participants.length, 'pending applicants -> data/db.json');
console.log('\nLogin accounts (email / password):');
console.log('  Admin .............. admin@cms.gov / admin123');
console.log('  Minister of Health . minister.health@cms.gov / minister123');
console.log('  Minister of Educ. .. minister.edu@cms.gov / minister123');
console.log('  Constructor ........ constructor@buildco.com / build123');
console.log('  Project Manager .... pm.john@buildco.com / pm123');
console.log('  Project Manager .... pm.grace@buildco.com / pm123');
