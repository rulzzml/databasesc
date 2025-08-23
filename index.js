const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");

dotenv.config();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Postgres connection
const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, "public")));

// Init DB
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      name TEXT,
      provider TEXT DEFAULT 'local',
      provider_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
})();

// Home
app.get("/", (req, res) => {
  const tryPublic = path.join(__dirname, "public", "index.html");
  const tryRoot = path.join(__dirname, "index.html");
  res.sendFile(tryRoot, (err) => {
    if (err) res.sendFile(tryPublic);
  });
});

// Dashboard
app.get("/dashboard", (req, res) => {
  const tryPublic = path.join(__dirname, "public", "dashboard.html");
  const tryRoot = path.join(__dirname, "dashboard.html");
  res.sendFile(tryRoot, (err) => {
    if (err) res.sendFile(tryPublic);
  });
});

// Register
app.post("/api/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (email, password, name) VALUES ($1, $2, $3)",
      [email, hashed, name]
    );
    res.json({ success: true, message: "Registrasi berhasil!" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Email sudah digunakan!" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];
    if (!user) return res.status(400).json({ success: false, message: "User tidak ditemukan!" });

    const valid = await bcrypt.compare(password, user.password || "");
    if (!valid) return res.status(400).json({ success: false, message: "Password salah!" });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan server" });
  }
});

// Google Auth
app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;
  try {
    const payload = JSON.parse(Buffer.from(credential.split(".")[1], "base64").toString());
    let result = await pool.query("SELECT * FROM users WHERE email = $1", [payload.email]);
    let user = result.rows[0];

    if (!user) {
      await pool.query(
        "INSERT INTO users (email, name, provider, provider_id) VALUES ($1, $2, $3, $4)",
        [payload.email, payload.name, "google", payload.sub]
      );
      result = await pool.query("SELECT * FROM users WHERE email = $1", [payload.email]);
      user = result.rows[0];
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Login Google gagal" });
  }
});

// Google callback
app.post("/auth/google/callback", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Credential not found" });

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    let result = await pool.query("SELECT * FROM users WHERE email = $1", [payload.email]);
    let user = result.rows[0];

    if (!user) {
      await pool.query(
        "INSERT INTO users (email, name, provider, provider_id) VALUES ($1, $2, $3, $4)",
        [payload.email, payload.name, "google", payload.sub]
      );
      result = await pool.query("SELECT * FROM users WHERE email = $1", [payload.email]);
      user = result.rows[0];
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login sukses", jwt: token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login gagal" });
  }
});

// API 404
app.use("/api/*", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

// SPA fallback
app.get("*", (req, res) => {
  const tryPublic = path.join(__dirname, "public", "index.html");
  const tryRoot = path.join(__dirname, "index.html");
  res.sendFile(tryRoot, (err) => {
    if (err) res.sendFile(tryPublic);
  });
});

module.exports = app;