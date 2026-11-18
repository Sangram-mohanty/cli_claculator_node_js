const { promisify } = require('node:util');
const { createHmac, randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../models/User');

const scryptAsync = promisify(scrypt);
const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const fallbackSecret = randomBytes(32).toString('hex');
const secret = () => process.env.AUTH_TOKEN_SECRET || fallbackSecret;

function sign(value) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(first, second) {
  const digest = (value) => createHmac('sha256', 'roots-account-compare').update(String(value)).digest();
  return timingSafeEqual(digest(first), digest(second));
}

function issueToken(user, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    sub: String(user._id),
    exp: now + TOKEN_LIFETIME_MS
  })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(now + TOKEN_LIFETIME_MS).toISOString() };
}

function verifyToken(token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !safeEqual(parts[1], sign(parts[0]))) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!mongoose.isValidObjectId(data.sub) || typeof data.exp !== 'number' || data.exp <= now) return null;
    return data;
  } catch {
    return null;
  }
}

function bearerToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in to access your family data.' });
  return next();
}

async function optionalAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) return next();
  const claims = verifyToken(token);
  if (!claims) return res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.' });
  try {
    const user = await User.findById(claims.sub).select('email');
    if (!user) return res.status(401).json({ error: 'Your account could not be found. Please sign in again.' });
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('base64url')}`;
}

async function verifyPassword(password, passwordHash) {
  const [algorithm, salt, encodedHash] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !encodedHash) return false;
  const expected = Buffer.from(encodedHash, 'base64url');
  const actual = await scryptAsync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function signedPhotoUrl(filename, expires = Date.now() + 15 * 60 * 1000) {
  const value = `${filename}.${expires}`;
  const signature = sign(`photo:${value}`);
  return `/uploads/${filename}?expires=${expires}&signature=${signature}`;
}

function verifyPhotoSignature(filename, expires, signature, now = Date.now()) {
  const expiration = Number(expires);
  if (!Number.isSafeInteger(expiration) || expiration <= now || expiration > now + 16 * 60 * 1000) return false;
  if (!/^[\da-f-]{36}\.(jpg|png|webp)$/.test(filename)) return false;
  return safeEqual(signature, sign(`photo:${filename}.${expiration}`));
}

module.exports = {
  requireAuth,
  optionalAuth,
  issueToken,
  verifyToken,
  hashPassword,
  verifyPassword,
  signedPhotoUrl,
  verifyPhotoSignature
};
