const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bookings.json');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ nextId: 1, bookings: [] }, null, 2), 'utf8');
  }
}
function readStore() {
  ensureStore();
  const fresh = { nextId: 1, bookings: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    // Support older/empty booking-store formats.
    if (Array.isArray(parsed)) {
      const bookings = parsed;
      const maxId = bookings.reduce((max, b) => {
        const id = Number(b?.id);
        return Number.isFinite(id) ? Math.max(max, id) : max;
      }, 0);
      const normalized = { nextId: maxId + 1, bookings };
      fs.writeFileSync(DATA_FILE, JSON.stringify(normalized, null, 2), 'utf8');
      return normalized;
    }

    if (parsed && Array.isArray(parsed.bookings)) {
      const nextId = Number(parsed.nextId);
      return {
        nextId: Number.isFinite(nextId) && nextId > 0 ? nextId : 1,
        bookings: parsed.bookings
      };
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  } catch {
    fs.writeFileSync(DATA_FILE, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}
function writeStore(store) {
  ensureStore();
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temp, DATA_FILE);
}

ensureStore();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const bookingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const sessions = new Map();

function makeRef() {
  return 'PCB-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}
function clean(v, max = 200) { return String(v ?? '').trim().slice(0, max); }
function auth(req, res, next) {
  const token = req.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const session = token && sessions.get(token);
  if (!session || session.expires < Date.now()) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'Pari Cab Service' }));

app.post('/api/bookings', bookingLimiter, (req, res) => {
  const customer_name = clean(req.body.customer_name, 100);
  const phone = clean(req.body.phone, 30);
  const pickup = clean(req.body.pickup, 150);
  const dropoff = clean(req.body.dropoff, 150);
  const travel_date = clean(req.body.travel_date, 20);
  const travel_time = clean(req.body.travel_time, 20);
  const cab_type = clean(req.body.cab_type, 80);
  const trip_type = clean(req.body.trip_type, 40) || 'One Way';
  const return_date = clean(req.body.return_date, 20);
  const notes = clean(req.body.notes, 500);

  if (!customer_name || !phone || !pickup || !dropoff || !cab_type) {
    return res.status(400).json({ error: 'Name, phone, pickup, drop and cab type are required.' });
  }

  const store = readStore();
  let booking_ref = makeRef();
  while (store.bookings.some(b => b.booking_ref === booking_ref)) booking_ref = makeRef();

  const booking = {
    id: store.nextId++,
    trip_type,
    return_date,
    booking_ref,
    customer_name,
    phone,
    pickup,
    dropoff,
    travel_date,
    travel_time,
    cab_type,
    notes,
    status: 'New',
    created_at: new Date().toISOString()
  };

  store.bookings.push(booking);
  writeStore(store);
  res.status(201).json({ ok: true, booking_ref });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const username = clean(req.body.username, 100);
  const password = String(req.body.password || '');
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid credentials' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expires: Date.now() + 8 * 60 * 60 * 1000 });
  res.json({ token, expires_in: 8 * 60 * 60 });
});

app.post('/api/admin/logout', auth, (req, res) => {
  const token = req.get('Authorization')?.replace(/^Bearer\s+/i, '');
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/admin/bookings', auth, (req, res) => {
  const status = clean(req.query.status, 30);
  const store = readStore();
  const rows = status && status !== 'All'
    ? store.bookings.filter(b => b.status === status)
    : store.bookings.slice();
  rows.sort((a, b) => b.id - a.id);
  res.json(rows);
});

app.patch('/api/admin/bookings/:id', auth, (req, res) => {
  const status = clean(req.body.status, 30);
  const allowed = ['New', 'Confirmed', 'Completed', 'Cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const store = readStore();
  const booking = store.bookings.find(b => b.id === Number(req.params.id));
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  booking.status = status;
  writeStore(store);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => console.log(`Pari Cab Service running at http://localhost:${PORT}`));
