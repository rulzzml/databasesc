const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// AES Encryption/Decryption
const algorithm = "aes-256-cbc";
const key = crypto.createHash("sha256").update(String("rulzzofficial")).digest();
const iv = Buffer.alloc(16, 0);

function decryptToken(encryptedToken) {
    try {
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encryptedToken, "base64", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (error) {
        console.error('Token decryption failed:', error.message);
        return null;
    }
}

// Config dengan encrypted token
// Untuk mendapatkan encrypted token: node encode.js "ghp_yourActualGitHubToken"
const GITHUB_CONFIG = {
    owner: process.env.GITHUB_OWNER || 'rulzzml',
    repo: process.env.GITHUB_REPO || 'sc',
    path: process.env.GITHUB_PATH || 'db.json',
    // TOKEN SUDAH DIENKRIPSI PAKE AES
    encryptedToken: process.env.ENCRYPTED_TOKEN || 'U2FsdGVkX1+9K5J7w8VjK3LmNpQwTyuioPASDFGHJKL=',
    password: process.env.ADMIN_PASSWORD || 'RulzzGanteng'
};

// API endpoint untuk get numbers (WITH AUTH)
app.get('/api/numbers', async (req, res) => {
    try {
        // Check authorization header
        const authHeader = req.headers.authorization;
        const clientPassword = authHeader ? authHeader.replace('Bearer ', '') : null;
        
        // Simple auth check (password dari frontend)
        if (!clientPassword || clientPassword !== GITHUB_CONFIG.password) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Decrypt GitHub token
        const decryptedToken = decryptToken(GITHUB_CONFIG.encryptedToken);
        
        if (!decryptedToken) {
            return res.status(500).json({
                success: false,
                error: 'Token decryption failed'
            });
        }

        console.log('Fetching from GitHub...');
        
        // Fetch data dari GitHub
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`,
            {
                headers: {
                    'Authorization': `token ${decryptedToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Node.js-App'
                },
                timeout: 10000
            }
        );
        
        // Decode content dari base64
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        const numbers = content ? JSON.parse(content) : [];
        
        // Validasi bahwa numbers adalah array
        if (!Array.isArray(numbers)) {
            return res.status(500).json({
                success: false,
                error: 'Invalid data format: db.json should contain an array'
            });
        }
        
        console.log(`Fetched ${numbers.length} numbers from GitHub`);
        
        res.json({ 
            success: true, 
            numbers,
            count: numbers.length
        });
        
    } catch (error) {
        console.error('GitHub API error:', error.message);
        
        let errorMessage = 'Failed to fetch data from GitHub';
        let statusCode = 500;
        
        if (error.response) {
            statusCode = error.response.status;
            
            switch (statusCode) {
                case 401:
                    errorMessage = 'GitHub authentication failed (token invalid/expired)';
                    break;
                case 403:
                    errorMessage = 'Rate limit exceeded or no access to repository';
                    break;
                case 404:
                    errorMessage = 'Repository or file not found';
                    break;
                case 422:
                    errorMessage = 'Validation failed';
                    break;
            }
        }
        
        res.status(statusCode).json({ 
            success: false, 
            error: errorMessage,
            details: error.response?.data?.message || error.message
        });
    }
});

// API endpoint untuk update numbers (WITH AUTH)
app.post('/api/numbers', async (req, res) => {
    try {
        const { numbers, commitMessage, password } = req.body;
        
        // Auth check dengan password dari body
        if (!password || password !== GITHUB_CONFIG.password) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        // Validasi input
        if (!Array.isArray(numbers)) {
            return res.status(400).json({
                success: false,
                error: 'Numbers must be an array'
            });
        }
        
        // Decrypt GitHub token
        const decryptedToken = decryptToken(GITHUB_CONFIG.encryptedToken);
        
        if (!decryptedToken) {
            return res.status(500).json({
                success: false,
                error: 'Token decryption failed'
            });
        }
        
        let sha = null;
        
        try {
            // Coba dapatkan SHA dari file yang ada
            const getResponse = await axios.get(
                `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`,
                {
                    headers: {
                        'Authorization': `token ${decryptedToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            sha = getResponse.data.sha;
        } catch (error) {
            // Jika file belum ada (404), sha akan tetap null
            if (error.response && error.response.status !== 404) {
                throw error;
            }
        }
        
        // Prepare update payload
        const payload = {
            message: commitMessage || 'Update numbers via API',
            content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64')
        };
        
        // Tambahkan SHA hanya jika file sudah ada
        if (sha) {
            payload.sha = sha;
        }
        
        console.log('Updating GitHub...');
        
        // Update/create file di GitHub
        const updateResponse = await axios.put(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`,
            payload,
            {
                headers: {
                    'Authorization': `token ${decryptedToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('GitHub update successful');
        
        res.json({ 
            success: true, 
            message: 'Numbers updated successfully',
            count: numbers.length
        });
        
    } catch (error) {
        console.error('Update error details:', error.message);
        
        let errorMessage = 'Failed to update data to GitHub';
        
        if (error.response) {
            switch (error.response.status) {
                case 401:
                    errorMessage = 'GitHub authentication failed (invalid token)';
                    break;
                case 404:
                    errorMessage = 'Repository or file not found';
                    break;
                case 409:
                    errorMessage = 'Conflict: File has been modified. Please try again';
                    break;
                case 422:
                    errorMessage = 'Validation failed (check token permissions)';
                    break;
            }
        }
        
        res.status(500).json({ 
            success: false, 
            error: errorMessage,
            details: error.response?.data?.message || error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'RulzXD Database API',
        version: '1.0.0'
    });
});

// Serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/newsletter', (req, res) => {
    res.sendFile(path.join(__dirname, 'newsletter.html'));
});

// Handle 404
app.use((req, res) => {
    res.status(404).send('Page not found');
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`GitHub: ${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`);
});