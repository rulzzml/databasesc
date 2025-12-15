const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Load config from .env
const GITHUB_CONFIG = {
    owner: 'rulzzml',
    repo: 'sc',
    path: 'db.json',
    token: "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"
};

const OWNER_CONFIG = {
    password: 'RulzzGanteng'
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
        
        const content = Buffer.from(response.data.content, 'base64').toString();
        const numbers = content ? JSON.parse(content) : [];
        
        res.json({ success: true, numbers });
    } catch (error) {
        console.error('GitHub API error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API endpoint untuk update numbers
app.post('/api/numbers', async (req, res) => {
    try {
        const { numbers, commitMessage, password } = req.body;
        
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
                message: commitMessage,
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
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update error:', error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
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


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`GitHub: ${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`);
});