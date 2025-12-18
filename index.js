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
app.use('/assets', express.static('assets'))

// Serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/newsletter', (req, res) => {
    res.sendFile(path.join(__dirname, 'newsletter.html'));
});

app.get('/index.css', (req, res) => {
  res.sendFile(path.join(__dirname, "index.css"));
});

app.get('/index.js', (req, res) => {
  res.sendFile(path.join(__dirname, "indexnya.js"));
});

app.get('/assets/newsletter.css', (req, res) => {
  res.sendFile(path.join(__dirname, "assets", "newsletter.css"));
});

app.get('/assets/newsletter.js', (req, res) => {
  res.sendFile(path.join(__dirname, "assets", "newsletter.js"));
});

// Handle 404
app.use((req, res) => {
    res.status(404).send('Page not found');
});

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

// GitHub Configuration untuk kedua database
const GITHUB_CONFIG = {
    phone: {
        owner: 'rulzzml',
        repo: 'sc',
        path: 'db.json',
        encryptedToken: 'bpWxgRy1QCZWbCViyR/JVm2YqMIjDyCCKbk45+AVRdRVNnZvOFhA1eIZ75zMykmM',
    },
    newsletter: {
        owner: 'rulzzml',
        repo: 'sc',
        path: 'news.json',
        encryptedToken: 'bpWxgRy1QCZWbCViyR/JVm2YqMIjDyCCKbk45+AVRdRVNnZvOFhA1eIZ75zMykmM',
    }
};

// Multiple passwords untuk login
const APP_CONFIG = {
    PASSWORDS: ["RulzzGanteng", "admin123", "password123"]
};

// ========== LOGIN API ==========
app.post('/api/login', (req, res) => {
    try {
        const { password } = req.body;
        
        console.log('🔐 Login attempt');
        
        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Password is required'
            });
        }
        
        if (APP_CONFIG.PASSWORDS.includes(password)) {
            console.log('✅ Login successful');
            return res.json({
                success: true,
                message: 'Login successful',
                token: password // Return password as token for Bearer auth
            });
        } else {
            console.log('❌ Login failed');
            return res.status(401).json({
                success: false,
                error: 'Invalid password'
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Helper: Validate password dari header atau body
function validatePassword(req) {
    // Cek dari header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (APP_CONFIG.PASSWORDS.includes(token)) {
            return token;
        }
    }
    
    // Cek dari body (untuk backward compatibility)
    const bodyPassword = req.body.password;
    if (bodyPassword && APP_CONFIG.PASSWORDS.includes(bodyPassword)) {
        return bodyPassword;
    }
    
    return null;
}

// Helper: Clean input
function cleanInput(input) {
    if (typeof input !== 'string' && typeof input !== 'number') {
        return '';
    }
    return String(input).trim();
}

// Helper: Format database structure
function formatDatabaseData(items, itemType = 'phone') {
    const now = new Date().toISOString();
    
    if (itemType === 'phone') {
        // Format untuk nomor telepon
        return {
            numbers: items.map(item => ({
                number: item.number.replace(/\D/g, ''),
                addedDate: item.addedDate || now.split('T')[0]
            })),
            lastUpdate: now,
            metadata: {
                type: 'phone_numbers',
                count: items.length,
                version: '2.0'
            }
        };
    } else {
        // Format untuk newsletter
        return {
            items: items.map(item => ({
                id: item.id || item,
                addedDate: item.addedDate || now.split('T')[0]
            })),
            lastUpdate: now,
            metadata: {
                type: 'newsletter',
                count: items.length,
                version: '2.0'
            }
        };
    }
}

// Helper: Convert old format to new format
function convertToNewFormat(oldData, itemType = 'phone') {
    if (itemType === 'phone') {
        // Jika data adalah array string (format lama)
        if (Array.isArray(oldData) && (oldData.length === 0 || typeof oldData[0] === 'string')) {
            console.log('🔄 Converting old phone array to new format');
            return oldData.map(number => ({
                number: cleanInput(number).replace(/\D/g, ''),
                addedDate: new Date().toISOString().split('T')[0]
            }));
        }
        
        // Jika sudah format baru
        if (oldData && oldData.numbers && Array.isArray(oldData.numbers)) {
            return oldData.numbers.map(item => {
                if (typeof item === 'object' && item.number) {
                    return {
                        number: cleanInput(item.number).replace(/\D/g, ''),
                        addedDate: item.addedDate || new Date().toISOString().split('T')[0]
                    };
                }
                return {
                    number: cleanInput(item).replace(/\D/g, ''),
                    addedDate: new Date().toISOString().split('T')[0]
                };
            });
        }
    } else {
        // Untuk newsletter
        if (Array.isArray(oldData)) {
            console.log('🔄 Converting old newsletter array to new format');
            return oldData.map(item => ({
                id: cleanInput(item),
                addedDate: new Date().toISOString().split('T')[0]
            }));
        }
        
        if (oldData && oldData.items && Array.isArray(oldData.items)) {
            return oldData.items.map(item => {
                if (typeof item === 'object' && item.id) {
                    return {
                        id: cleanInput(item.id),
                        addedDate: item.addedDate || new Date().toISOString().split('T')[0]
                    };
                }
                return {
                    id: cleanInput(item),
                    addedDate: new Date().toISOString().split('T')[0]
                };
            });
        }
    }
    
    return [];
}

// ========== PHONE NUMBERS API ==========

app.get('/api/numbers', async (req, res) => {
    try {
        console.log('📱 GET /api/numbers requested');
        
        // Check authorization
        const clientPassword = validatePassword(req);
        if (!clientPassword) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('✅ Phone auth successful');
        
        // Decrypt GitHub token
        const decryptedToken = decryptToken(GITHUB_CONFIG.phone.encryptedToken);
        if (!decryptedToken) {
            return res.status(500).json({
                success: false,
                error: 'Token decryption failed'
            });
        }

        // Fetch data dari GitHub
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_CONFIG.phone.owner}/${GITHUB_CONFIG.phone.repo}/contents/${GITHUB_CONFIG.phone.path}`,
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
        
        console.log(`📊 Phone data: ${Array.isArray(githubData) ? 'Array' : 'Object'}`);
        
        // Convert to new format
        const numbers = convertToNewFormat(githubData, 'phone');
        
        console.log(`✅ Returning ${numbers.length} phone numbers`);
        
        res.json({ 
            success: true, 
            numbers: numbers,
            lastUpdateTime: githubData?.lastUpdate || new Date().toISOString(),
            totalCount: numbers.length
        });
        
    } catch (error) {
        console.error('❌ Phone API error:', error.message);
        
        if (error.response && error.response.status === 404) {
            return res.json({
                success: true,
                numbers: [],
                lastUpdateTime: new Date().toISOString(),
                totalCount: 0
            });
        }
        
        let errorMessage = 'Failed to fetch phone data';
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

app.post('/api/numbers', async (req, res) => {
    try {
        const { numbers, commitMessage, password } = req.body;
        
        console.log('📱 POST /api/numbers requested');
        
        // Auth check
        if (!password || !APP_CONFIG.PASSWORDS.includes(password)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        console.log('✅ Phone update auth successful');
        
        // Validasi input
        if (!Array.isArray(numbers)) {
            return res.status(400).json({
                success: false,
                error: 'Numbers must be an array'
            });
        }
        
        // Process numbers
        const processedNumbers = numbers.map(item => {
            // Jika format object
            if (typeof item === 'object' && item.number) {
                const cleanNum = cleanInput(item.number).replace(/\D/g, '');
                if (cleanNum) {
                    return {
                        number: cleanNum,
                        addedDate: item.addedDate || new Date().toISOString().split('T')[0]
                    };
                }
            }
            // Jika format string
            else if (typeof item === 'string' || typeof item === 'number') {
                const cleanNum = cleanInput(item).replace(/\D/g, '');
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
        const decryptedToken = decryptToken(GITHUB_CONFIG.phone.encryptedToken);
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
                `https://api.github.com/repos/${GITHUB_CONFIG.phone.owner}/${GITHUB_CONFIG.phone.repo}/contents/${GITHUB_CONFIG.phone.path}`,
                {
                    headers: {
                        'Authorization': `token ${decryptedToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            sha = getResponse.data.sha;
            console.log('📄 Got phone file SHA');
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                throw error;
            }
            console.log('📄 Phone file does not exist yet');
        }
        
        // Prepare data untuk GitHub
        const dataForGitHub = formatDatabaseData(processedNumbers, 'phone');
        
        // Update payload
        const payload = {
            message: commitMessage || 'Update phone numbers',
            content: Buffer.from(JSON.stringify(dataForGitHub, null, 2)).toString('base64')
        };
        
        if (sha) {
            payload.sha = sha;
        }
        
        console.log(`🔄 Saving ${processedNumbers.length} phone numbers to GitHub...`);
        
        // Save to GitHub
        await axios.put(
            `https://api.github.com/repos/${GITHUB_CONFIG.phone.owner}/${GITHUB_CONFIG.phone.repo}/contents/${GITHUB_CONFIG.phone.path}`,
            payload,
            {
                headers: {
                    'Authorization': `token ${decryptedToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ Phone numbers saved to GitHub');
        
        res.json({ 
            success: true, 
            message: 'Phone numbers updated successfully',
            count: processedNumbers.length,
            lastUpdateTime: dataForGitHub.lastUpdate,
            numbers: processedNumbers
        });
        
    } catch (error) {
        console.error('❌ Phone update error:', error.message);
        
        let errorMessage = 'Failed to update phone data';
        
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

// ========== NEWSLETTER API ==========

app.get('/api/newsletter', async (req, res) => {
    try {
        console.log('📧 GET /api/newsletter requested');
        
        // Check authorization
        const clientPassword = validatePassword(req);
        if (!clientPassword) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        console.log('✅ Newsletter auth successful');
        
        // Decrypt GitHub token
        const decryptedToken = decryptToken(GITHUB_CONFIG.newsletter.encryptedToken);
        if (!decryptedToken) {
            return res.status(500).json({
                success: false,
                error: 'Token decryption failed'
            });
        }

        // Fetch data dari GitHub
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_CONFIG.newsletter.owner}/${GITHUB_CONFIG.newsletter.repo}/contents/${GITHUB_CONFIG.newsletter.path}`,
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
        
        console.log(`📊 Newsletter data: ${Array.isArray(githubData) ? 'Array' : 'Object'}`);
        
        // Convert to new format
        const items = convertToNewFormat(githubData, 'newsletter');
        
        console.log(`✅ Returning ${items.length} newsletter items`);
        
        res.json({ 
            success: true, 
            items: items,
            lastUpdateTime: githubData?.lastUpdate || new Date().toISOString(),
            totalCount: items.length
        });
        
    } catch (error) {
        console.error('❌ Newsletter API error:', error.message);
        
        if (error.response && error.response.status === 404) {
            return res.json({
                success: true,
                items: [],
                lastUpdateTime: new Date().toISOString(),
                totalCount: 0
            });
        }
        
        let errorMessage = 'Failed to fetch newsletter data';
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

app.post('/api/newsletter', async (req, res) => {
    try {
        const { items, commitMessage, password } = req.body;
        
        console.log('📧 POST /api/newsletter requested');
        
        // Auth check
        if (!password || !APP_CONFIG.PASSWORDS.includes(password)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        console.log('✅ Newsletter update auth successful');
        
        // Validasi input
        if (!Array.isArray(items)) {
            return res.status(400).json({
                success: false,
                error: 'Items must be an array'
            });
        }
        
        // Process items
        const processedItems = items.map(item => {
            // Jika format object
            if (typeof item === 'object' && item.id) {
                const cleanId = cleanInput(item.id);
                if (cleanId) {
                    return {
                        id: cleanId,
                        addedDate: item.addedDate || new Date().toISOString().split('T')[0]
                    };
                }
            }
            // Jika format string
            else if (typeof item === 'string') {
                const cleanId = cleanInput(item);
                if (cleanId) {
                    return {
                        id: cleanId,
                        addedDate: new Date().toISOString().split('T')[0]
                    };
                }
            }
            
            return null;
        }).filter(item => item !== null);
        
        if (processedItems.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid items to save'
            });
        }
        
        // Decrypt GitHub token
        const decryptedToken = decryptToken(GITHUB_CONFIG.newsletter.encryptedToken);
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
                `https://api.github.com/repos/${GITHUB_CONFIG.newsletter.owner}/${GITHUB_CONFIG.newsletter.repo}/contents/${GITHUB_CONFIG.newsletter.path}`,
                {
                    headers: {
                        'Authorization': `token ${decryptedToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            sha = getResponse.data.sha;
            console.log('📄 Got newsletter file SHA');
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                throw error;
            }
            console.log('📄 Newsletter file does not exist yet');
        }
        
        // Prepare data untuk GitHub
        const dataForGitHub = formatDatabaseData(processedItems, 'newsletter');
        
        // Update payload
        const payload = {
            message: commitMessage || 'Update newsletter',
            content: Buffer.from(JSON.stringify(dataForGitHub, null, 2)).toString('base64')
        };
        
        if (sha) {
            payload.sha = sha;
        }
        
        console.log(`🔄 Saving ${processedItems.length} newsletter items to GitHub...`);
        
        // Save to GitHub
        await axios.put(
            `https://api.github.com/repos/${GITHUB_CONFIG.newsletter.owner}/${GITHUB_CONFIG.newsletter.repo}/contents/${GITHUB_CONFIG.newsletter.path}`,
            payload,
            {
                headers: {
                    'Authorization': `token ${decryptedToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ Newsletter items saved to GitHub');
        
        res.json({ 
            success: true, 
            message: 'Newsletter updated successfully',
            count: processedItems.length,
            lastUpdateTime: dataForGitHub.lastUpdate,
            items: processedItems
        });
        
    } catch (error) {
        console.error('❌ Newsletter update error:', error.message);
        
        let errorMessage = 'Failed to update newsletter data';
        
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

// Endpoint untuk update tanggal manual (untuk kedua database)
app.post('/api/update-date', async (req, res) => {
    try {
        const { id, newDate, password, type = 'phone' } = req.body;
        
        // Auth check
        if (!password || !APP_CONFIG.PASSWORDS.includes(password)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'ID is required'
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
        
        const cleanId = cleanInput(id);
        if (!cleanId) {
            return res.status(400).json({
                success: false,
                error: 'Invalid ID'
            });
        }
        
        const finalDate = newDate || new Date().toISOString().split('T')[0];
        
        // Pilih config berdasarkan type
        const config = type === 'phone' ? GITHUB_CONFIG.phone : GITHUB_CONFIG.newsletter;
        const decryptedToken = decryptToken(config.encryptedToken);
        
        if (!decryptedToken) {
            return res.status(500).json({
                success: false,
                error: 'Token decryption failed'
            });
        }
        
        // 1. Get current data from GitHub
        let currentData = null;
        let sha = null;
        
        try {
            const getResponse = await axios.get(
                `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`,
                {
                    headers: {
                        'Authorization': `token ${decryptedToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            
            sha = getResponse.data.sha;
            const content = Buffer.from(getResponse.data.content, 'base64').toString('utf8');
            currentData = content ? JSON.parse(content) : null;
            
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                throw error;
            }
        }
        
        // 2. Convert to new format
        let dataItems = convertToNewFormat(currentData, type);
        
        // 3. Find and update the date
        let updated = false;
        const fieldName = type === 'phone' ? 'number' : 'id';
        
        dataItems = dataItems.map(item => {
            if (cleanInput(item[fieldName]) === cleanId) {
                updated = true;
                return {
                    ...item,
                    addedDate: finalDate
                };
            }
            return item;
        });
        
        // 4. Jika item tidak ditemukan, tambahkan baru
        if (!updated) {
            dataItems.push({
                [fieldName]: cleanId,
                addedDate: finalDate
            });
        }
        
        // 5. Prepare update data
        const updateData = formatDatabaseData(dataItems, type);
        
        // 6. Save back to GitHub
        const payload = {
            message: `Update date for ${type === 'phone' ? 'number' : 'newsletter'}: ${cleanId} to ${finalDate}`,
            content: Buffer.from(JSON.stringify(updateData, null, 2)).toString('base64')
        };
        
        if (sha) {
            payload.sha = sha;
        }
        
        await axios.put(
            `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`,
            payload,
            {
                headers: {
                    'Authorization': `token ${decryptedToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log(`✅ Updated date for ${cleanId} to ${finalDate}`);
        
        res.json({
            success: true,
            message: 'Date updated successfully',
            id: cleanId,
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '3.0-with-login',
        features: {
            loginApi: true,
            multiPassword: true,
            dateTracking: true,
            phoneDatabase: true,
            newsletterDatabase: true,
            noLocalFiles: true,
            encryptedToken: true
        },
        config: {
            validPasswords: APP_CONFIG.PASSWORDS.length,
            phoneFile: GITHUB_CONFIG.phone.path,
            newsletterFile: GITHUB_CONFIG.newsletter.path
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 GitHub Repository: ${GITHUB_CONFIG.phone.owner}/${GITHUB_CONFIG.phone.repo}`);
    console.log(`📄 Database Files:`);
    console.log(`   - Phone Numbers: ${GITHUB_CONFIG.phone.path}`);
    console.log(`   - Newsletter: ${GITHUB_CONFIG.newsletter.path}`);
    console.log(`🔑 Valid passwords: ${APP_CONFIG.PASSWORDS.join(', ')}`);
    console.log(`✨ API ENDPOINTS:`);
    console.log(`   1. Login: POST /api/login`);
    console.log(`   2. Phone Numbers: GET/POST /api/numbers`);
    console.log(`   3. Newsletter: GET/POST /api/newsletter`);
    console.log(`   4. Update Date: POST /api/update-date`);
    console.log(`   5. Health: GET /health`);
});