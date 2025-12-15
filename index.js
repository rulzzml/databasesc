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
        
        // Validasi input
        if (!Array.isArray(numbers)) {
            return res.status(400).json({
                success: false,
                error: 'Numbers must be an array'
            });
        }
        
        if (!commitMessage || !password) {
            return res.status(400).json({
                success: false,
                error: 'Commit message and password are required'
            });
        }
        
        // Auth check
        if (password !== OWNER_CONFIG.password) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        // Get current SHA
        const getResponse = await axios.get(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`,
            {
                headers: {
                    'Authorization': `token ${GITHUB_CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
        
        const sha = getResponse.data.sha;
        
        // Update to GitHub
        const updateResponse = await axios.put(
            `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`,
            {
                message: commitMessage || 'Update numbers',
                content: Buffer.from(JSON.stringify(numbers, null, 2)).toString('base64'),
                sha: sha
            },
            {
                headers: {
                    'Authorization': `token ${GITHUB_CONFIG.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        res.json({ success: true, message: 'Numbers updated successfully' });
    } catch (error) {
        console.error('Update error:', error.message);
        
        // Berikan pesan error yang lebih spesifik
        let errorMessage = 'Failed to update data';
        if (error.response && error.response.status === 404) {
            errorMessage = 'File not found in repository';
        } else if (error.response && error.response.status === 409) {
            errorMessage = 'Conflict: File has been modified by another user';
        }
        
        res.status(500).json({ 
            success: false, 
            error: errorMessage,
            details: error.message
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