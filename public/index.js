const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// DB setup
let db;
(async () => {
  db = await open({
    filename: "./auth.db",
    driver: sqlite3.Database,
  });
  const migration = await import("fs/promises");
  const sql = await migration.readFile("./migrations/001_init.sql", "utf-8");
  await db.exec(sql);
})();

app.get('/', (req, res) => {
res.sendFile(path.join(__dirname, 'index.html'));
})

app.get('/dashboard', (req, res) => {
res.sendFile(path.join(__dirname, 'dashboard.html'));
})

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
  } catch (err) {
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

// Google Auth (frontend kirim credential JWT dari Google)
app.post("/api/auth/google", async (req, res) => {
  const { credential } = req.body;
  // NOTE: Credential ini harus diverifikasi via Google API di backend real.
  // Untuk demo, kita langsung decode saja.
  const payload = JSON.parse(
    Buffer.from(credential.split(".")[1], "base64").toString()
  );

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

// Protected route
app.get("/api/dashboard", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ success: false, message: "Unauthorized" });

  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await db.get("SELECT id, email, name FROM users WHERE id = ?", [decoded.id]);
    res.json({ success: true, user });
  } catch (err) {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
});

// Callback dari Google Sign-In
app.post("/auth/google/callback", async (req, res) => {
  try {
    const { credential } = req.body; // token dari frontend
    if (!credential) {
      return res.status(400).json({ error: "Credential not found" });
    }

    // Verifikasi token Google
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    // Buat JWT internal untuk session
    const token = jwt.sign(
      { id: payload.sub, email: payload.email, name: payload.name },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login sukses",
      jwt: token,
      user: {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login gagal" });
  }
  
  app.use((err, req, res, next) => {
  console.log(err.stack);
  res.status(500).send("Error");
});


app.use((req, res, next) => {
res.send("Hello World :)")
});
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});