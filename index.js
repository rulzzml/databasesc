// Di awal file, tambahkan:
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { OAuth2Client } = require("google-auth-library");

dotenv.config();

const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// DB setup
// DB setup
let db;
let dbInitialized = false;

const initializeDB = async () => {
  if (dbInitialized) return;
  
  try {
    // Pastikan folder exists
    const dbDir = path.dirname('./auth.db');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = await open({
      filename: './auth.db',
      driver: sqlite3.Database,
    });
    
    // Jalankan migrasi
    const migrationPath = path.join(__dirname, 'migrations', '001_init.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await db.exec(sql);
      console.log('Database migrated successfully');
    } else {
      throw new Error('Migration file not found');
    }
    
    dbInitialized = true;
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

// Panggil initializeDB saat aplikasi dimulai
initializeDB().catch(console.error);

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Register
app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    await db.run("INSERT INTO users (email, password, name) VALUES (?, ?, ?)", [
      email,
      hashed,
      name,
    ]);
    res.json({ success: true, message: "Registrasi berhasil!" });
  } catch {
    res.status(400).json({ success: false, message: "Email sudah digunakan!" });
  }
});

// Login local
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) return res.status(400).json({ success: false, message: "User tidak ditemukan!" });

  const valid = await bcrypt.compare(password, user.password || "");
  if (!valid) return res.status(400).json({ success: false, message: "Password salah!" });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ success: true, token });
});

// Hapus endpoint /api/auth/google yang lama, gunakan yang ini saja:
app.post("/auth/google/callback", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: "Credential not found" });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    // Cari atau buat user
    let user = await db.get("SELECT * FROM users WHERE email = ?", [payload.email]);
    if (!user) {
      await db.run(
        "INSERT INTO users (email, name, provider) VALUES (?, ?, ?)",
        [payload.email, payload.name, "google"]
      );
      user = await db.get("SELECT * FROM users WHERE email = ?", [payload.email]);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ 
      success: true, 
      message: "Login sukses", 
      token, 
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      } 
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(500).json({ success: false, error: "Login gagal" });
  }
});

// Tambahkan error handling middleware di akhir
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ 
    success: false, 
    message: "Internal server error",
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Fallback
app.use((req, res) => {
  res.status(404).send("404 Not Found");
});

// 👉 export app (bukan listen!)
module.exports = app;