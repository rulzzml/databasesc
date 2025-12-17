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

// DIUBAH: Multiple passwords untuk login
const APP_CONFIG = {
    PASSWORDS: ["RulzzGanteng", "admin123", "password123"]
};

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

// Helper: Migrate old format to new format
function migrateToNewFormat(data) {
    // Jika data adalah array string, convert ke format baru
    if (Array.isArray(data) && (data.length === 0 || typeof data[0] === 'string')) {
        console.log('🔄 Migrating old format to new format...');
        return data.map(number => ({
            number: number,
            addedDate: new Date().toISOString().split('T')[0] // Default: hari ini
        }));
    }
    
    // Jika sudah format baru, return as-is
    return data;
}

// Helper: Get database structure
function getDatabaseStructure(numbers) {
    return {
        numbers: numbers,
        lastUpdateTime: new Date().toISOString(),
        metadata: {
            totalCount: numbers.length,
            updatedAt: new Date().toISOString(),
            version: "2.0"
        }
    };
}

// API endpoint untuk get numbers - DIUBAH: Support multiple passwords
app.get('/api/numbers', async (req, res) => {
    try {
        console.log('🔑 Received auth header:', req.headers.authorization);
        
        // Check authorization header
        const authHeader = req.headers.authorization;
        let clientPassword = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            clientPassword = authHeader.substring(7); // Remove "Bearer "
        } 
        // Juga cek query parameter sebagai fallback
        else if (req.query.password) {
            clientPassword = req.query.password;
        }
        
        console.log('🔑 Client password received:', clientPassword ? 'YES' : 'NO');
        
        // DIUBAH: Auth check dengan multiple passwords
        if (!clientPassword || !APP_CONFIG.PASSWORDS.includes(clientPassword)) {
            console.log('❌ Auth failed. Valid passwords:', APP_CONFIG.PASSWORDS);
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
        
        // Decode content dari base64
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        const data = content ? JSON.parse(content) : {};
        
        // DIUBAH: Handle different data formats
        let numbers = [];
        let lastUpdateTime = null;
        
        // Format lama: array langsung
        if (Array.isArray(data)) {
            numbers = migrateToNewFormat(data);
            lastUpdateTime = new Date().toISOString();
        }
        // Format baru: object dengan struktur
        else if (data.numbers) {
            numbers = migrateToNewFormat(data.numbers);
            lastUpdateTime = data.lastUpdateTime || new Date().toISOString();
        }
        // Format kosong
        else {
            numbers = [];
            lastUpdateTime = new Date().toISOString();
        }
        
        console.log(`✅ Fetched ${numbers.length} numbers from GitHub`);
        console.log('📊 Data format:', Array.isArray(data) ? 'Legacy array' : 'Structured object');
        
        res.json({ 
            success: true, 
            numbers: numbers,
            lastUpdateTime: lastUpdateTime,
            totalCount: numbers.length
        });
        
    } catch (error) {
        console.error('❌ GitHub API error:', error.message);
        
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
                    // File belum ada, return empty array
                    return res.json({
                        success: true,
                        numbers: [],
                        lastUpdateTime: new Date().toISOString(),
                        totalCount: 0
                    });
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

// API endpoint untuk update numbers - DIUBAH: Support multiple passwords
app.post('/api/numbers', async (req, res) => {
    try {
        const { numbers, commitMessage, password } = req.body;
        
        console.log('📝 Update request received');
        console.log('🔑 Password from body:', password ? 'YES' : 'NO');
        
        // DIUBAH: Auth check dengan multiple passwords
        if (!password || !APP_CONFIG.PASSWORDS.includes(password)) {
            console.log('❌ Auth failed. Valid passwords:', APP_CONFIG.PASSWORDS);
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
        
        // Validasi setiap item dalam array
        for (const item of numbers) {
            // Jika format baru (object)
            if (typeof item === 'object' && item.number) {
                if (!item.number || item.number.replace(/\D/g, '').length < 8) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid phone number: ${item.number}`
                    });
                }
                // Pastikan ada addedDate
                if (!item.addedDate) {
                    item.addedDate = new Date().toISOString().split('T')[0];
                }
            }
            // Jika format lama (string) - auto convert
            else if (typeof item === 'string') {
                if (item.replace(/\D/g, '').length < 8) {
                    return res.status(400).json({
                        success: false,
                        error: `Invalid phone number: ${item}`
                    });
                }
            }
            // Format tidak valid
            else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid number format'
                });
            }
        }
        
        // Migrasi format jika perlu
        const migratedNumbers = migrateToNewFormat(numbers);
        
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
            console.log('📄 Got file SHA:', sha.substring(0, 10) + '...');
        } catch (error) {
            // Jika file belum ada (404), sha akan tetap null
            if (error.response && error.response.status !== 404) {
                throw error;
            }
            console.log('📄 File does not exist yet, will create new');
        }
        
        // DIUBAH: Simpan dengan struktur lengkap
        const dataToSave = getDatabaseStructure(migratedNumbers);
        
        // Prepare update payload
        const payload = {
            message: commitMessage || 'Update numbers via API',
            content: Buffer.from(JSON.stringify(dataToSave, null, 2)).toString('base64')
        };
        
        // Tambahkan SHA hanya jika file sudah ada
        if (sha) {
            payload.sha = sha;
        }
        
        console.log('🔄 Updating GitHub...');
        console.log('📊 Data structure:', dataToSave.metadata);
        
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
        
        console.log('✅ GitHub update successful');
        
        res.json({ 
            success: true, 
            message: 'Numbers updated successfully',
            count: migratedNumbers.length,
            lastUpdateTime: dataToSave.lastUpdateTime
        });
        
    } catch (error) {
        console.error('❌ Update error:', error.message);
        
        let errorMessage = 'Failed to update data to GitHub';
        
        if (error.response) {
            console.error('GitHub API response:', error.response.status, error.response.data);
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

// DIUBAH: Endpoint untuk migration manual
app.post('/api/migrate', async (req, res) => {
    try {
        const { password } = req.body;
        
        // Auth check
        if (!password || !APP_CONFIG.PASSWORDS.includes(password)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        console.log('🔄 Starting manual migration...');
        
        // Decrypt GitHub token
        const decryptedToken = decryptToken(GITHUB_CONFIG.encryptedToken);
        
        if (!decryptedToken) {
            return res.status(500).json({
                success: false,
                error: 'Token decryption failed'
            });
        }
        
        let sha = null;
        let oldData = [];
        
        try {
            // Ambil data lama
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
            oldData = content ? JSON.parse(content) : [];
            
            console.log('📄 Got existing file');
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                throw error;
            }
            console.log('📄 No existing file found');
        }
        
        // Migrasi data
        const migratedNumbers = migrateToNewFormat(oldData);
        
        // Simpan dengan format baru
        const dataToSave = getDatabaseStructure(migratedNumbers);
        
        const payload = {
            message: 'Migration to new format v2.0',
            content: Buffer.from(JSON.stringify(dataToSave, null, 2)).toString('base64')
        };
        
        if (sha) {
            payload.sha = sha;
        }
        
        // Update di GitHub
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
        
        console.log('✅ Migration successful');
        
        res.json({
            success: true,
            message: 'Migration completed',
            oldCount: Array.isArray(oldData) ? oldData.length : (oldData.numbers ? oldData.numbers.length : 0),
            newCount: migratedNumbers.length,
            version: '2.0'
        });
        
    } catch (error) {
        console.error('❌ Migration error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Migration failed',
            details: error.message
        });
    }
});

// DIUBAH: Endpoint untuk edit tanggal
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
        
        if (!number || !newDate) {
            return res.status(400).json({
                success: false,
                error: 'Number and newDate are required'
            });
        }

        // Validasi format tanggal (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(newDate)) {
            return res.status(400).json({
                success: false,
                error: 'Date must be in YYYY-MM-DD format'
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
        let data = { numbers: [] };
        
        try {
            // Ambil data yang ada
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
            data = content ? JSON.parse(content) : { numbers: [] };
            
            console.log('📄 Got existing file for date update');
        } catch (error) {
            if (error.response && error.response.status !== 404) {
                throw error;
            }
            console.log('📄 No existing file found');
        }
        
        // Migrasi format jika perlu
        let numbers = migrateToNewFormat(data.numbers || data);
        const cleanNumber = number.replace(/\D/g, '');
        
        // Cari nomor yang akan diupdate
        const index = numbers.findIndex(item => 
            item.number.replace(/\D/g, '') === cleanNumber
        );

        if (index === -1) {
            return res.status(404).json({
                success: false,
                error: 'Number not found'
            });
        }

        // Simpan tanggal lama
        const oldDate = numbers[index].addedDate || 'Unknown';
        
        // Update tanggal
        numbers[index].addedDate = newDate;
        
        // Update struktur data
        const dataToSave = getDatabaseStructure(numbers);
        
        const payload = {
            message: `Update date for number: ${cleanNumber} from ${oldDate} to ${newDate}`,
            content: Buffer.from(JSON.stringify(dataToSave, null, 2)).toString('base64')
        };
        
        if (sha) {
            payload.sha = sha;
        }
        
        // Update di GitHub
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
        
        console.log('✅ Date update successful');
        
        res.json({
            success: true,
            message: 'Date updated successfully',
            number: numbers[index].number,
            oldDate: oldDate,
            newDate: newDate
        });
        
    } catch (error) {
        console.error('❌ Date update error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to update date',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '2.0',
        features: {
            multiPassword: true,
            dateTracking: true,
            formatMigration: true,
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
    console.log(`✨ Features:`);
    console.log(`   - Multiple password support (${APP_CONFIG.PASSWORDS.length} passwords)`);
    console.log(`   - Phone number date tracking`);
    console.log(`   - Auto format migration`);
    console.log(`   - Last update time tracking`);
    console.log(`   - International phone number support`);
    console.log(`   - Encrypted GitHub token`);
});