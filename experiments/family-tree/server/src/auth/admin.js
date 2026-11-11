const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto');

/**
 * Minimal admin access: one shared admin password (ADMIN_PASSWORD) unlocks admin-only actions such as
 * deleting people. A successful sign-in returns a signed, expiring token that the browser sends back in
 * the Authorization header. This is a single-role gate, not a user-account system.
 */

const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// Tokens are signed with ADMIN_TOKEN_SECRET when set; otherwise with a random per-process secret,
// which simply means admins sign in again after the API restarts.
const fallbackSecret = randomBytes(32).toString('hex');
const secret = () => process.env.ADMIN_TOKEN_SECRET || fallbackSecret;
const adminPassword = () => process.env.ADMIN_PASSWORD || '';

function isConfigured() {
  return adminPassword().length > 0;
}

function sign(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  // Compare fixed-length digests so neither the content nor the length leaks through timing.
  const digest = (value) => createHmac('sha256', 'compare').update(String(value)).digest();
  return timingSafeEqual(digest(a), digest(b));
}

function issueToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: now + TOKEN_LIFETIME_MS })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(now + TOKEN_LIFETIME_MS).toISOString() };
}

function verifyToken(token, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.role !== 'admin' || typeof data.exp !== 'number' || data.exp <= now) return null;
    return data;
  } catch {
    return null;
  }
}

function bearerToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/** Express middleware: lets the request through only for a signed-in admin. */
function requireAdmin(req, res, next) {
  if (!isConfigured()) {
    return res.status(403).json({ error: 'Deleting is turned off until an admin password is set on the server.' });
  }
  if (!verifyToken(bearerToken(req))) {
    return res.status(401).json({ error: 'Only an admin can do this. Please sign in as admin.' });
  }
  return next();
}

// Simple in-memory lockout per client address after repeated wrong passwords.
const failures = new Map();

function lockedOut(key, now = Date.now()) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.until && entry.until > now) return true;
  if (entry.until && entry.until <= now) failures.delete(key);
  return false;
}

function recordFailure(key, now = Date.now()) {
  const entry = failures.get(key) ?? { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_ATTEMPTS) {
    entry.until = now + LOCKOUT_MS;
    entry.count = 0;
  }
  failures.set(key, entry);
}

function login(req, res) {
  if (!isConfigured()) {
    return res.status(403).json({ error: 'Admin sign-in is not set up. Add ADMIN_PASSWORD to server/.env.' });
  }
  const key = req.ip || 'unknown';
  if (lockedOut(key)) {
    return res.status(429).json({ error: 'Too many wrong passwords. Please wait 15 minutes and try again.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || !safeEqual(password, adminPassword())) {
    recordFailure(key);
    return res.status(401).json({ error: 'That admin password is not correct.' });
  }
  failures.delete(key);
  return res.json(issueToken());
}

function session(req, res) {
  const data = verifyToken(bearerToken(req));
  res.json({ configured: isConfigured(), admin: Boolean(data && isConfigured()), expiresAt: data ? new Date(data.exp).toISOString() : null });
}

module.exports = { requireAdmin, login, session, verifyToken, issueToken, isConfigured };
