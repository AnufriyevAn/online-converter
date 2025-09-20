import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import multer from "multer";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";
import { lookup as mimeLookup } from "mime-types";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5050;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

fs.mkdirSync(path.join(__dirname, "data", "uploads"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "data", "converted"), { recursive: true });

const db = new Database(path.join(__dirname, "data", "app.db"));
db.pragma("journal_mode = wal");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  last_file TEXT
);
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  author_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const upload = multer({ dest: path.join(__dirname, "data", "uploads") });
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/files", express.static(path.join(__dirname, "data", "converted")));

function sign(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
}
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}
function isAdmin(req, res, next) {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({ error: "admin only" });
}

app.post("/api/auth/register", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email & password required" });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')");
    const info = stmt.run(email.trim().toLowerCase(), hash);
    const user = db.prepare("SELECT id,email,role,last_file FROM users WHERE id=?").get(info.lastInsertRowid);
    return res.json({ token: sign(user), user });
  } catch (e) {
    return res.status(409).json({ error: "email exists" });
  }
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(String(email||"").trim().toLowerCase());
  if (!user) return res.status(401).json({ error: "invalid credentials" });
  if (!bcrypt.compareSync(password || "", user.password_hash)) return res.status(401).json({ error: "invalid credentials" });
  return res.json({ token: sign(user), user: { id:user.id, email:user.email, role:user.role, last_file:user.last_file } });
});

app.get("/api/me", auth, (req,res)=>{
  const u = db.prepare("SELECT id,email,role,last_file FROM users WHERE id=?").get(req.user.id);
  res.json(u);
});

app.get("/api/admin/users", auth, isAdmin, (req,res)=>{
  const rows = db.prepare("SELECT id,email,role,last_file FROM users ORDER BY id").all();
  res.json(rows);
});
app.delete("/api/admin/users/:id", auth, isAdmin, (req,res)=>{
  const uid = Number(req.params.id);
  db.prepare("DELETE FROM users WHERE id=?").run(uid);
  res.json({ ok:true });
});

app.post("/api/news/suggest", auth, (req,res)=>{
  const { title, body } = req.body || {};
  if(!title || !body) return res.status(400).json({ error:"title/body required" });
  db.prepare("INSERT INTO news (title, body, status, author_id) VALUES (?,?, 'pending', ?)").run(title, body, req.user.id);
  res.json({ ok:true });
});
app.get("/api/news", (req,res)=>{
  const rows = db.prepare("SELECT * FROM news WHERE status='approved' ORDER BY id DESC").all();
  res.json(rows);
});
app.get("/api/news/pending", auth, isAdmin, (req,res)=>{
  const rows = db.prepare("SELECT * FROM news WHERE status='pending' ORDER BY id").all();
  res.json(rows);
});
app.post("/api/admin/news/:id/approve", auth, isAdmin, (req,res)=>{
  db.prepare("UPDATE news SET status='approved' WHERE id=?").run(Number(req.params.id));
  res.json({ ok:true });
});
app.post("/api/admin/news/:id/reject", auth, isAdmin, (req,res)=>{
  db.prepare("UPDATE news SET status='rejected' WHERE id=?").run(Number(req.params.id));
  res.json({ ok:true });
});

app.post("/api/support/ask", auth, (req,res)=>{
  const { question } = req.body || {};
  if(!question) return res.status(400).json({ error:"question required" });
  db.prepare("INSERT INTO tickets (user_id, question, status) VALUES (?,?, 'open')").run(req.user.id, question);
  res.json({ ok:true });
});
app.get("/api/support/my", auth, (req,res)=>{
  const rows = db.prepare("SELECT * FROM tickets WHERE user_id=? ORDER BY id DESC").all(req.user.id);
  res.json(rows);
});
app.get("/api/admin/support", auth, isAdmin, (req,res)=>{
  const rows = db.prepare("SELECT * FROM tickets ORDER BY status, id DESC").all();
  res.json(rows);
});
app.post("/api/admin/support/:id/answer", auth, isAdmin, (req,res)=>{
  const { answer } = req.body || {};
  db.prepare("UPDATE tickets SET answer=?, status='answered' WHERE id=?").run(answer || "", Number(req.params.id));
  res.json({ ok:true });
});

const tempLinks = new Map();
function makeTempLink(filePath, ttlMs=10*60*1000){
  const id = nanoid();
  tempLinks.set(id, { file: filePath, expiresAt: Date.now()+ttlMs });
  return `${BASE_URL}/api/temp/${id}`;
}
app.get("/api/temp/:id", (req,res)=>{
  const item = tempLinks.get(req.params.id);
  if(!item) return res.status(404).end();
  if(Date.now() > item.expiresAt){ tempLinks.delete(req.params.id); return res.status(410).end(); }
  res.download(item.file);
});

function runCmd(cmd, args) {
  return new Promise((resolve, reject)=>{
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("close", code => code===0 ? resolve() : reject(new Error(cmd+" exit "+code)));
  });
}

async function convertFile(inputPath, outDir, targetExt, mime) {
  fs.mkdirSync(outDir, { recursive:true });
  const outPath = path.join(outDir, path.parse(inputPath).name + "." + targetExt.replace(".",""));
  const ext = (mime||"").split("/")[0];

  if (ext === "video" || ext === "audio") {
    await runCmd("ffmpeg", ["-y", "-i", inputPath, outPath]);
  } else if (ext === "image") {
    await runCmd("magick", [inputPath, outPath]);
  } else {
    await runCmd("soffice", ["--headless", "--convert-to", targetExt, "--outdir", outDir, inputPath]);
  }
  return outPath;
}

app.post("/api/convert", upload.single("file"), async (req,res)=>{
  try {
    const file = req.file;
    if(!file) return res.status(400).json({ error: "file required" });
    const { target } = req.body || {};
    const mime = mimeLookup(file.originalname) || file.mimetype || "";
    const targetExt = (target || "").replace(".","");
    if(!targetExt) return res.status(400).json({ error: "target format required" });
    const outDir = path.join(__dirname, "data", "converted");
    const outPath = await convertFile(file.path, outDir, targetExt, mime);

    if (req.headers.authorization?.startsWith("Bearer ")) {
      try {
        const user = jwt.verify(req.headers.authorization.slice(7), JWT_SECRET);
        db.prepare("UPDATE users SET last_file=? WHERE id=?").run(outPath, user.id);
      } catch {}
    }

    const tempUrl = makeTempLink(outPath);
    res.json({
      preview: mime.startsWith("image/") ? `${BASE_URL}/files/${path.basename(outPath)}` : null,
      download: tempUrl
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "conversion failed" });
  }
});

app.get("/api/last-file", auth, (req,res)=>{
  const u = db.prepare("SELECT last_file FROM users WHERE id=?").get(req.user.id);
  if (!u?.last_file || !fs.existsSync(u.last_file)) return res.status(404).json({ error:"no last file" });
  res.download(u.last_file);
});

app.use(express.static(path.join(__dirname,"..","frontend","dist"))); app.get("\*", (req,res)=>res.sendFile(path.join(__dirname,"..","frontend","dist","index.html"))); app.listen(PORT, ()=>console.log("API on "+BASE_URL));
app.get("/", (req,res)=>res.send("Online Converter API is running"));
app.get("/api/health", (req,res)=>res.json({ ok:true, port: process.env.PORT||5050 }));
