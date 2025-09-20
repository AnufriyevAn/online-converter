import Database from "better-sqlite3";
import fs from "fs";
if (fs.existsSync("data/app.db")) fs.rmSync("data/app.db");
console.log("DB removed");
