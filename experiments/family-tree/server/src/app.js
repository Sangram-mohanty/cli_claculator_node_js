const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('node:path');
const treeRoutes = require('./routes/trees');

const app = express();
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || 'uploads');

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:4200' }));
app.use(express.json({ limit: '100kb' }));
app.use('/uploads', express.static(uploadDirectory, {
  dotfiles: 'deny',
  index: false,
  maxAge: '1d',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; sandbox");
  }
}));

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api/v1/trees', treeRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      error: error.code === 'LIMIT_FILE_SIZE'
        ? 'Photo must be 5 MB or smaller.'
        : 'The photo upload is invalid.'
    });
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ error: error.message });
  }
  if (error.code === 11000) {
    return res.status(409).json({ error: 'This family connection already exists.' });
  }
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: status >= 500 ? 'An unexpected server error occurred.' : error.message });
});

module.exports = app;
