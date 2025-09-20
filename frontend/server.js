const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// --- middlewares ---
app.use(express.json());
app.use(cors()); // на будущее, если откроете фронт с другого порта

// --- статика фронтенда (../frontend) ---
app.use(express.static(path.join(__dirname, '../frontend')));

// --- настройка хранения файлов ---
const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (_req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// --- маршруты ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  res.json({
    message: 'Файл успешно загружен',
    file: {
      originalName: req.file.originalname,
      savedAs: req.file.filename,
      size: req.file.size
    }
  });
});

// корневой: отдадим index.html из фронта
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- старт сервера ---
app.listen(PORT, () => {
  console.log('Server started on http://localhost:' + PORT);
});
