const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
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

const GITHUB_CONFIG = {
    owner: 'rulzzml',
    repo: 'sc',
    path: 'db.json',
    encryptedToken: 'bpWxgRy1QCZWbCViyR/JVm2YqMIjDyCCKbk45+AVRdRVNnZvOFhA1eIZ75zMykmM',
};

// Multiple passwords untuk login
const APP_CONFIG = {
    PASSWORDS: ["RulzzGanteng", "admin123", "password123"]
};

// Helper: Validate password
function validatePassword(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (APP_CONFIG.PASSWORDS.includes(token)) {
            return token;
        }
    }
    
    const bodyPassword = req.body.password;
    if (bodyPassword && APP_CONFIG.PASSWORDS.includes(bodyPassword)) {
        return bodyPassword;
    }
    
    return null;
}

// Helper: Clean phone number
function cleanPhoneNumber(number) {
    if (typeof number !== 'string' && typeof number !== 'number') {
        return '';
    }
    
    const numStr = String(number);
    return numStr.replace(/\D/g, '');
}

// Helper: Convert old format to new format
function convertToNewFormat(oldData) {
    // Jika data adalah array string (format lama)
    if (Array.isArray(oldData) && (oldData.length === 0 || typeof oldData[0] === 'string')) {
        console.log('🔄 Converting old array format to new format');
        return oldData.map(number => ({
            number: cleanPhoneNumber(number),
            addedDate: new Date().toISOString().split('T')[0]
        }));
    }
    
    // Jika sudah format baru
    if (oldData && oldData.numbers && Array.isArray(oldData.numbers)) {
        // Validasi setiap item
        return oldData.numbers.map(item => {
            if (typeof item === 'object' && item.number) {
                return {
                    number: cleanPhoneNumber(item.number),
                    addedDate: item.addedDate || new Date().toISOString().split('T')[0]
                };
            }
            // Jika ada yang masih string di dalam array numbers
            return {
                number: cleanPhoneNumber(item),
                addedDate: new Date().toISOString().split('T')[0]
            };
        });
    }
    
    // Default: empty array
    return [];
}

// API endpoint untuk get numbers
app.get('/api/numbers', async (req, res) => {
    try {
        console.log('🔑 GET /api/numbers requested');
        
        // Check authorization
        const authHeader = req.headers.authorization;
        let clientPassword = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            clientPassword = authHeader.substring(7);
        } else if (req.query.password) {
            clientPassword = req.query.password;
        }
        
        if (!clientPassword || !APP_CONFIG.PASSWORDS.includes(clientPassword)) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('✅ Authentication successful');
        
        // Decrypt GitHub token
        const decryptedToken = decryptToken(GITHUB_CONFIG.encryptedToken);
        
        if (!decryptedToken) {
            return res.status(500).json({
                success: false,
                error: 'Token decryption failed'
            });
        }

        console.log('📡 Fetching from GitHub...');
        
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
        
        // Decode content
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        const githubData = content ? JSON.parse(content) : null;
        
        console.log('📊 GitHub data type:', typeof githubData, Array.isArray(githubData) ? 'Array' : 'Object');
        
        // Convert to new format
        const numbers = convertToNewFormat(githubData);
        
        console.log(`✅ Returning ${numbers.length} numbers`);
        
        res.json({ 
            success: true, 
            numbers: numbers,
            lastUpdateTime: githubData?.lastUpdate || new Date().toISOString(),
            totalCount: numbers.length
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        
        // Jika file tidak ditemukan
        if (error.response && error.response.status === 404) {
            console.log('📄 File not found, returning empty');
            return res.json({
                success: true,
                numbers: [],
                lastUpdateTime: new Date().toISOString(),
                totalCount: 0
            });
        }
        
        let errorMessage = 'Failed to fetch data';
        let statusCode = 500;
        
        if (error.response) {
            statusCode = error.response.status;
            switch (statusCode) {
                case 401:
                    errorMessage = 'GitHub authentication failed';
                    break;
                case 403:
                    errorMessage = 'Rate limit exceeded';
                    break;
            }
        }
        
        res.status(statusCode).json({ 
            success: false, 
            error: errorMessage
        });
    }
});

// API endpoint untuk update numbers
app.post('/api/numbers', async (req, res) => {
    try {
        const { numbers, commitMessage, password } = req.body;
        
        console.log('📝 POST /api/numbers requested');
        
        // Auth check
        if (!password || !APP_CONFIG.PASSWORDS.includes(password)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        console.log('✅ Authentication successful');
        
        // Validasi input
        if (!Array.isArray(numbers)) {
            return res.status(400).json({
                success: false,
                error: 'Numbers must be an array'
            });
        }
        
        // Process numbers - pastikan format object dengan tanggal
        const processedNumbers = numbers.map(item => {
            // Jika format object
            if (typeof item === 'object' && item.number) {
                const cleanNum = cleanPhoneNumber(item.number);
                if (cleanNum) {
                    return {
                        number: cleanNum,
                        addedDate: item.addedDate || new Date().toISOString().split('T')[0]
                    };
                }
            }
            // Jika format string
            else if (typeof item === 'string' || typeof item === 'number') {
                const cleanNum = cleanPhoneNumber(item);
                if (cleanNum) {
                    return {
                        number: cleanNum,
                        addedDate: new Date().toISOString().split('T')[0]
                    };
                }
            }
            
            return null;
        }).filter(item => item !== null);
        
        if (processedNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid numbers to save'
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
            // Get current file SHA
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
            console.log('📄 Got file SHA');
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                throw error;
            }
            console.log('📄 File does not exist yet');
        }
        
        // Prepare data untuk GitHub (format baru)
        const dataForGitHub = {
            numbers: processedNumbers,
            lastUpdate: new Date().toISOString()
        };
        
        // Update payload
        const payload = {
            message: commitMessage || 'Update phone numbers',
            content: Buffer.from(JSON.stringify(dataForGitHub, null, 2)).toString('base64')
        };
        
        if (sha) {
            payload.sha = sha;
        }
        
        console.log(`🔄 Saving ${processedNumbers.length} numbers to GitHub...`);
        
        // Save to GitHub
        await axios.put(
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
        
        console.log('✅ Saved to GitHub successfully');
        
        res.json({ 
            success: true, 
            message: 'Numbers updated successfully',
            count: processedNumbers.length,
            lastUpdateTime: dataForGitHub.lastUpdate,
            numbers: processedNumbers
        });
        
    } catch (error) {
        console.error('❌ Update error:', error.message);
        
        let errorMessage = 'Failed to update data';
        
        if (error.response) {
            switch (error.response.status) {
                case 401:
                    errorMessage = 'GitHub authentication failed';
                    break;
                case 404:
                    errorMessage = 'Repository not found';
                    break;
                case 409:
                    errorMessage = 'Conflict: File was modified';
                    break;
            }
        }
        
        res.status(500).json({ 
            success: false, 
            error: errorMessage
        });
    }
});

// Endpoint untuk update tanggal manual
app.post('/api/update-date', async (req, res) => {
    try {
        const { number, newDate, password } = req.body;
        
        // Auth check
        if (!password || !APP_CONFIG.PASSWORDS.includes(password)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        if (!number) {
            return res.status(400).json({
                success: false,
                error: 'Number is required'
            });
        }

        // Validasi tanggal
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (newDate && !dateRegex.test(newDate)) {
            return res.status(400).json({
                success: false,
                error: 'Date must be in YYYY-MM-DD format'
            });
        }
        
        const cleanNumber = cleanPhoneNumber(number);
        if (!cleanNumber) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number'
            });
        }
        
        const finalDate = newDate || new Date().toISOString().split('T')[0];
        
        // Decrypt GitHub token
        const decryptedToken = decryptToken(GITHUB_CONFIG.encryptedToken);
        
        if (!decryptedToken) {
            return res.status(500).json({
                success: false,
                error: 'Token decryption failed'
            });
        }
        
        // 1. Get current data from GitHub
        let currentData = { numbers: [], lastUpdate: new Date().toISOString() };
        let sha = null;
        
        try {
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
            const content = Buffer.from(getResponse.data.content, 'base64').toString('utf8');
            currentData = content ? JSON.parse(content) : { numbers: [] };
            
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                throw error;
            }
        }
        
        // 2. Convert to new format jika masih format lama
        let numbers = convertToNewFormat(currentData);
        
        // 3. Find and update the date
        let updated = false;
        numbers = numbers.map(item => {
            if (cleanPhoneNumber(item.number) === cleanNumber) {
                updated = true;
                return {
                    ...item,
                    addedDate: finalDate
                };
            }
            return item;
        });
        
        // 4. Jika nomor tidak ditemukan, tambahkan baru
        if (!updated) {
            numbers.push({
                number: cleanNumber,
                addedDate: finalDate
            });
        }
        
        // 5. Prepare update data
        const updateData = {
            numbers: numbers,
            lastUpdate: new Date().toISOString()
        };
        
        // 6. Save back to GitHub
        const payload = {
            message: `Update date for number: ${cleanNumber} to ${finalDate}`,
            content: Buffer.from(JSON.stringify(updateData, null, 2)).toString('base64')
        };
        
        if (sha) {
            payload.sha = sha;
        }
        
        await axios.put(
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
        
        console.log(`✅ Updated date for ${cleanNumber} to ${finalDate}`);
        
        res.json({
            success: true,
            message: 'Date updated successfully',
            number: cleanNumber,
            newDate: finalDate,
            action: updated ? 'updated' : 'added new'
        });
        
    } catch (error) {
        console.error('❌ Date update error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to update date'
        });
    }
});

// API endpoint untuk login
app.post('/api/login', (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Password is required'
            });
        }
        
        if (APP_CONFIG.PASSWORDS.includes(password)) {
            return res.json({
                success: true,
                message: 'Login successful',
                timestamp: new Date().toISOString()
            });
        } else {
            return res.status(401).json({
                success: false,
                error: 'Invalid password'
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '3.0-final',
        features: {
            multiPassword: true,
            dateTracking: true,
            githubStorage: true,
            noLocalFiles: true,
            encryptedToken: true
        },
        config: {
            validPasswords: APP_CONFIG.PASSWORDS.length,
            owner: GITHUB_CONFIG.owner,
            repo: GITHUB_CONFIG.repo
        }
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
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 GitHub: ${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`);
    console.log(`🔑 Valid passwords: ${APP_CONFIG.PASSWORDS.join(', ')}`);
    console.log(`✨ FINAL VERSION FEATURES:`);
    console.log(`   1. Multiple password support`);
    console.log(`   2. Store dates IN GITHUB (not locally)`);
    console.log(`   3. Auto-convert old format to new`);
    console.log(`   4. No local files needed`);
    console.log(`   5. Edit dates directly in GitHub`);
    console.log(`\n📊 GitHub db.json format:`);
    console.log(`   {
      "numbers": [
        {"number": "628xxx", "addedDate": "2024-01-01"},
        {"number": "131xxx", "addedDate": "2024-01-02"}
      ],
      "lastUpdate": "2024-01-17T..."
    }`);
});