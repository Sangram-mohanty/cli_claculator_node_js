const express = require('express');
const { login, session } = require('../auth/admin');

const router = express.Router();

router.post('/login', login);
router.get('/session', session);

module.exports = router;
