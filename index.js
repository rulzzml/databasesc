// Di awal file, tambahkan:
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");
const fs = require("fs");

(async () => {
  try {
    const initSql = fs.readFileSync(path.join(__dirname, "migrations/001_init.sql"), "utf-8");
    await pool.query(initSql);
    console.log("✅ Database ready");
  } catch (err) {
    console.error("❌ Error init DB:", err);
  }
})();

dotenv.config();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
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

// Init DB table
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

// Serve HTML files
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: "Invalid token" });
    }
    req.user = user;
    next();
  });
};

// API Routes
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
  } catch (error) {
    console.error("Registration error:", error);
    res.status(400).json({ success: false, message: "Email sudah digunakan!" });
  }
});

// API endpoint untuk login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "User tidak ditemukan!" 
      });
    }

    const valid = await bcrypt.compare(password, user.password || "");
    if (!valid) {
      return res.status(400).json({ 
        success: false, 
        message: "Password salah!" 
      });
    }

    const token = jwt.sign({ 
      id: user.id, 
      email: user.email 
    }, JWT_SECRET, { expiresIn: "1h" });
    
    res.json({ 
      success: true, 
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
});

// API endpoint untuk Google auth
app.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ 
        success: false, 
        error: "Credential not found" 
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

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
    res.status(500).json({ 
      success: false, 
      error: "Login gagal" 
    });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await db.get("SELECT id, email, name, provider FROM users WHERE id = ?", [req.user.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, authenticated: true, user });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  // Di aplikasi stateless dengan JWT, logout dilakukan di client dengan menghapus token
  res.json({ success: true, message: "Logout successful" });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ 
    success: false, 
    message: "Internal server error",
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Fallback untuk API routes yang tidak ditemukan
app.use("/api/*", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

// Fallback untuk routes lainnya - serve index.html untuk SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.listen(PORT, () => {
  console.log(`Server Telah Berjalan > http://localhost:${PORT}`)
})

// Export app untuk Vercel
module.exports = app;