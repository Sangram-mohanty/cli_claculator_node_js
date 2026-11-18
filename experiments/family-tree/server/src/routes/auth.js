const express = require('express');
const User = require('../models/User');
const {
  hashPassword,
  issueToken,
  optionalAuth,
  requireAuth,
  verifyPassword
} = require('../auth/accounts');

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/signup', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!emailPattern.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: 'Your password must be between 10 and 128 characters.' });
    }
    const user = await User.create({ email, passwordHash: await hashPassword(password) });
    return res.status(201).json({ ...issueToken(user), user: { id: String(user._id), email: user.email } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ email }).select('+passwordHash email');
    if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    return res.json({ ...issueToken(user), user: { id: String(user._id), email: user.email } });
  } catch (error) {
    return next(error);
  }
});

router.use(optionalAuth);
router.get('/session', requireAuth, (req, res) => {
  res.json({ user: { id: String(req.user._id), email: req.user.email } });
});

module.exports = router;
