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

// Helper: Clean phone number
function cleanPhoneNumber(number) {
    if (typeof number !== 'string' && typeof number !== 'number') {
        console.warn('⚠️ Invalid phone number type:', typeof number, number);
        return '';
    }
    
    // Convert to string if it's a number
    const numStr = String(number);
    
    // Remove non-digit characters
    return numStr.replace(/\D/g, '');
}

// Helper: Convert string array ke format baru
function convertToNewFormat(numbersArray) {
    if (!Array.isArray(numbersArray)) {
        console.warn('⚠️ convertToNewFormat: Input is not an array');
        return [];
    }
    
    const result = [];
    const dateMap = {}; // Map untuk menyimpan tanggal per nomor
    
    for (const number of numbersArray) {
        try {
            // Skip null/undefined
            if (number == null) {
                console.warn('⚠️ Skipping null/undefined number');
                continue;
            }
            
            const cleanNum = cleanPhoneNumber(number);
            
            if (!cleanNum) {
                console.warn('⚠️ Skipping invalid number:', number);
                continue;
            }
            
            // Gunakan tanggal default untuk semua nomor
            // Atau bisa pakai tanggal dari hash untuk konsistensi
            const today = new Date().toISOString().split('T')[0];
            
            result.push({
                number: cleanNum,
                addedDate: today
            });
            
        } catch (error) {
            console.error('Error processing number:', number, error);
        }
    }
    
    console.log(`✅ Converted ${result.length} numbers from array`);
    return result;
}

// SIMPLE IN-MEMORY CACHE (tidak pakai file system)
let memoryCache = {
    numbers: [],
    lastUpdateTime: new Date().toISOString(),
    dateMap: {} // Map nomor -> tanggal
};

// Helper: Get date for a number from memory cache
function getDateFromCache(number) {
    const cleanNum = cleanPhoneNumber(number);
    return memoryCache.dateMap[cleanNum] || null;
}

// Helper: Update date in memory cache
function updateDateInCache(number, date) {
    const cleanNum = cleanPhoneNumber(number);
    if (cleanNum) {
        memoryCache.dateMap[cleanNum] = date;
        console.log(`📅 Updated date in memory cache: ${cleanNum} -> ${date}`);
    }
}

// Helper: Update memory cache with new numbers
function updateMemoryCache(newNumbers) {
    // Update date map
    newNumbers.forEach(item => {
        if (item && item.number) {
            const cleanNum = cleanPhoneNumber(item.number);
            if (cleanNum && item.addedDate) {
                memoryCache.dateMap[cleanNum] = item.addedDate;
            }
        }
    });
    
    // Update numbers array
    memoryCache.numbers = newNumbers;
    memoryCache.lastUpdateTime = new Date().toISOString();
    
    console.log(`💾 Memory cache updated: ${newNumbers.length} numbers`);
}

// API endpoint untuk get numbers - SIMPLIFIED: langsung dari GitHub
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
        let githubData;
        
        try {
            githubData = content ? JSON.parse(content) : [];
        } catch (parseError) {
            console.error('❌ JSON parse error:', parseError.message);
            return res.status(500).json({
                success: false,
                error: 'Invalid JSON format in GitHub file'
            });
        }
        
        console.log('📊 Raw data from GitHub:', Array.isArray(githubData) ? `Array with ${githubData.length} items` : 'Not an array');
        
        // Debug: log beberapa item pertama
        if (Array.isArray(githubData) && githubData.length > 0) {
            console.log('🔍 Sample items from GitHub:', githubData.slice(0, 3));
        }
        
        // Convert data GitHub ke format object
        let numbers = [];
        
        if (Array.isArray(githubData)) {
            numbers = convertToNewFormat(githubData);
            
            // Apply dates from memory cache if available
            numbers = numbers.map(item => {
                const cachedDate = getDateFromCache(item.number);
                if (cachedDate) {
                    return {
                        ...item,
                        addedDate: cachedDate
                    };
                }
                return item;
            });
        } else {
            console.warn('⚠️ GitHub data is not an array, using empty array');
            numbers = [];
        }
        
        console.log(`✅ Processed ${numbers.length} numbers`);
        
        // Update memory cache
        updateMemoryCache(numbers);
        
        // Kembalikan data dengan tanggal
        res.json({ 
            success: true, 
            numbers: numbers,
            lastUpdateTime: memoryCache.lastUpdateTime,
            totalCount: numbers.length,
            source: 'github-direct'
        });
        
    } catch (error) {
        console.error('❌ GitHub API error:', error.message);
        
        // Jika file tidak ditemukan (404), return empty
        if (error.response && error.response.status === 404) {
            console.log('📄 GitHub file not found, returning empty');
            return res.json({
                success: true,
                numbers: [],
                lastUpdateTime: new Date().toISOString(),
                totalCount: 0,
                source: 'empty',
                warning: 'GitHub file not found'
            });
        }
        
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

// API endpoint untuk update numbers - SIMPLIFIED
app.post('/api/numbers', async (req, res) => {
    try {
        const { numbers, commitMessage, password } = req.body;
        
        console.log('📝 Update request received');
        console.log('📊 Data type:', Array.isArray(numbers) ? `Array with ${numbers.length} items` : 'Invalid format');
        
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
        
        // Process numbers untuk frontend (format object)
        const processedNumbers = [];
        const errors = [];
        
        for (const item of numbers) {
            try {
                // Jika format object dari frontend
                if (typeof item === 'object' && item.number) {
                    const cleanNum = cleanPhoneNumber(item.number);
                    if (cleanNum) {
                        const finalDate = item.addedDate || new Date().toISOString().split('T')[0];
                        processedNumbers.push({
                            number: cleanNum,
                            addedDate: finalDate
                        });
                        // Update memory cache
                        updateDateInCache(cleanNum, finalDate);
                    } else {
                        errors.push(`Invalid number: ${item.number}`);
                    }
                }
                // Jika format string (backward compatibility)
                else if (typeof item === 'string' || typeof item === 'number') {
                    const cleanNum = cleanPhoneNumber(item);
                    if (cleanNum) {
                        const today = new Date().toISOString().split('T')[0];
                        processedNumbers.push({
                            number: cleanNum,
                            addedDate: today
                        });
                        updateDateInCache(cleanNum, today);
                    } else {
                        errors.push(`Invalid number: ${item}`);
                    }
                }
                // Format tidak valid
                else {
                    errors.push(`Invalid format: ${JSON.stringify(item)}`);
                }
            } catch (error) {
                errors.push(`Error processing: ${item} - ${error.message}`);
            }
        }
        
        if (errors.length > 0) {
            console.warn('⚠️ Processing errors:', errors);
        }
        
        if (processedNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid numbers to save',
                errors: errors
            });
        }
        
        // Untuk disimpan di GitHub, kita simpan sebagai array string (format lama)
        const numbersForGitHub = processedNumbers.map(item => item.number);
        
        // Update memory cache dengan semua data
        updateMemoryCache(processedNumbers);
        
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
        
        // Prepare update payload - Simpan sebagai array string di GitHub
        const payload = {
            message: commitMessage || 'Update numbers via API',
            content: Buffer.from(JSON.stringify(numbersForGitHub, null, 2)).toString('base64')
        };
        
        // Tambahkan SHA hanya jika file sudah ada
        if (sha) {
            payload.sha = sha;
        }
        
        console.log('🔄 Updating GitHub with', numbersForGitHub.length, 'numbers...');
        
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
            count: processedNumbers.length,
            lastUpdateTime: memoryCache.lastUpdateTime,
            numbers: processedNumbers,
            warnings: errors.length > 0 ? errors : undefined
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

// Endpoint untuk update tanggal manual - SIMPLE: Memory only
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

        // Validasi format tanggal (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const finalDate = newDate && dateRegex.test(newDate) ? newDate : new Date().toISOString().split('T')[0];
        
        const cleanNumber = cleanPhoneNumber(number);
        
        if (!cleanNumber) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number'
            });
        }
        
        // Update date in memory cache
        updateDateInCache(cleanNumber, finalDate);
        
        // Also update in memoryCache.numbers if exists
        const index = memoryCache.numbers.findIndex(item => 
            cleanPhoneNumber(item.number) === cleanNumber
        );
        
        if (index !== -1) {
            memoryCache.numbers[index].addedDate = finalDate;
        }
        
        res.json({
            success: true,
            message: 'Date updated successfully (in memory)',
            number: cleanNumber,
            newDate: finalDate,
            note: 'Date is stored in server memory only, will persist until server restarts'
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

// Endpoint untuk view memory cache (debug purpose)
app.get('/api/memory-cache', async (req, res) => {
    try {
        res.json({
            success: true,
            cache: {
                totalNumbers: memoryCache.numbers.length,
                lastUpdateTime: memoryCache.lastUpdateTime,
                dateMapSize: Object.keys(memoryCache.dateMap).length,
                sampleDates: Object.entries(memoryCache.dateMap).slice(0, 5)
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get memory cache'
        });
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '2.0-memory',
        memoryCache: {
            totalNumbers: memoryCache.numbers.length,
            dateMapSize: Object.keys(memoryCache.dateMap).length,
            lastUpdate: memoryCache.lastUpdateTime
        },
        features: {
            multiPassword: true,
            dateTracking: true,
            memoryCache: true,
            noFileSystem: true, // Tidak pakai filesystem!
            backwardCompatible: true,
            encryptedToken: true
        },
        config: {
            validPasswords: APP_CONFIG.PASSWORDS.length,
            owner: GITHUB_CONFIG.owner,
            repo: GITHUB_CONFIG.repo,
            githubFormat: 'Array of strings',
            frontendFormat: 'Array of objects with dates'
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

app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 GitHub: ${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`);
    console.log(`🔑 Valid passwords: ${APP_CONFIG.PASSWORDS.join(', ')}`);
    console.log(`✨ Features:`);
    console.log(`   - Multiple password support (${APP_CONFIG.PASSWORDS.length} passwords)`);
    console.log(`   - Phone number date tracking (MEMORY CACHE)`);
    console.log(`   - Backward compatible with existing db.json`);
    console.log(`   - NO FILE SYSTEM ACCESS (safe for read-only env)`);
    console.log(`   - Direct GitHub API access`);
    console.log(`\n⚠️  NOTE: Dates are stored in memory only`);
    console.log(`   Will be lost when server restarts`);
    console.log(`\n🔧 Debug endpoints:`);
    console.log(`   - GET /api/memory-cache (view memory cache)`);
    console.log(`   - GET /health (server status)`);
});