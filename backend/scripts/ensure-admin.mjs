import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

// Открываем БД
const db = new Database("./data/app.db");

// На всякий: создаём таблицу пользователей, если её нет
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  last_file TEXT
)`).run();

const email = "admin@site.local";         // логин админа
const pass  = "Admin#2025";               // пароль админа
const hash  = bcrypt.hashSync(pass, 10);

// Ищем пользователя по email без учёта регистра
const row = db.prepare("SELECT id,email,role FROM users WHERE lower(email)=lower(?)").get(email);

if (row) {
  db.prepare("UPDATE users SET password_hash=?, role=? WHERE id=?").run(hash, "admin", row.id);
  console.log("Admin UPDATED:", row.id, email);
} else {
  db.prepare("INSERT INTO users (email,password_hash,role) VALUES (?,?,?)")
    .run(email.toLowerCase(), hash, "admin");
  const id = db.prepare("SELECT last_insert_rowid() AS id").get().id;
  console.log("Admin CREATED:", id, email);
}

// Печатаем текущее состояние
console.log("Users:", db.prepare("SELECT id,email,role FROM users").all());
db.close();
