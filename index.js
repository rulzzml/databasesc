const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Load config from .env (sebaiknya token disimpan di .env)
const GITHUB_CONFIG = {
    owner: process.env.GITHUB_OWNER || 'rulzzml',
    repo: process.env.GITHUB_REPO || 'sc',
    path: process.env.GITHUB_PATH || 'db.json',
    token: process.env.GITHUB_TOKEN || "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" // HATI-HATI: JANGAN SIMPAN TOKEN DI KODE
};

const OWNER_CONFIG = {
    password: process.env.OWNER_PASSWORD || 'RulzzGanteng'
};

// API endpoint untuk get numbers
app.get('/api/numbers', async (req, res) => {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`,
            {
                headers: {
                    'Authorization': `token ${GITHUB_CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        const numbers = content ? JSON.parse(content) : [];
        
        // Validasi bahwa numbers adalah array
        if (!Array.isArray(numbers)) {
            return res.status(500).json({
                success: false,
                error: 'Invalid data format: db.json should contain an array'
            });
        }
        
        res.json({ success: true, numbers });
    } catch (error) {
        console.error('GitHub API error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch data from GitHub' 
        });
    }
});

// API endpoint untuk update numbers
app.post('/api/numbers', async (req, res) => {
    try {
        const { numbers, commitMessage, password } = req.body;
        
        // Validasi input lebih ketat
        if (!numbers || !Array.isArray(numbers)) {
            return res.status(400).json({
                success: false,
                error: 'Numbers must be an array'
            });
        }
        
        if (!commitMessage || typeof commitMessage !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Valid commit message is required'
            });
        }
        
        if (!password || password !== OWNER_CONFIG.password) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        let sha = null;
        
        try {
            // Coba dapatkan SHA dari file yang ada
            const getResponse = await axios.get(
                `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`,
                {
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            sha = getResponse.data.sha;
        } catch (error) {
            // Jika file belum ada (404), sha akan tetap null
            if (error.response && error.response.status !== 404) {
                throw error; // Lempar error selain 404
            }
        }
        
        // Prepare update payload
        const payload = {
            message: commitMessage,
            content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64')
        };
        
        // Tambahkan SHA hanya jika file sudah ada
        if (sha) {
            payload.sha = sha;
        }
        
        // Update/create file di GitHub
        await axios.put(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`,
            payload,
            {
                headers: {
                    'Authorization': `token ${GITHUB_CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        res.json({ 
            success: true, 
            message: 'Numbers updated successfully' 
        });
        
    } catch (error) {
        console.error('Update error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        
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