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
let db;
(async () => {
  db = await open({
    filename: "./auth.db",
    driver: sqlite3.Database,
  });
  const sql = fs.readFileSync("./migrations/001_init.sql", "utf-8");
  await db.exec(sql);
})();

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

// Google Auth (credential dari frontend)
app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;
  const payload = JSON.parse(Buffer.from(credential.split(".")[1], "base64").toString());

  let user = await db.get("SELECT * FROM users WHERE email = ?", [payload.email]);
  if (!user) {
    await db.run("INSERT INTO users (email, name, provider) VALUES (?, ?, ?)", [
      payload.email,
      payload.name,
      "google",
    ]);
    user = await db.get("SELECT * FROM users WHERE email = ?", [payload.email]);
  }

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ success: true, token });
});

// Google callback (verifikasi token Google)
app.post("/auth/google/callback", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: "Credential not found" });

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const token = jwt.sign(
      { id: payload.sub, email: payload.email, name: payload.name },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ message: "Login sukses", jwt: token, user: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login gagal" });
  }
});

// Fallback
app.use((req, res) => {
  res.status(404).send("404 Not Found");
});

// 👉 export app (bukan listen!)
module.exports = app;