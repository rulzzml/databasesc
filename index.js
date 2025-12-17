const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises; // Gunakan promises version
const fsSync = require('fs'); // Juga butuh sync untuk beberapa operasi
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

// Helper: Convert string array ke format baru
function convertToNewFormat(numbersArray, existingCache = []) {
    if (!Array.isArray(numbersArray)) {
        return [];
    }
    
    return numbersArray.map(number => {
        // Cari di cache apakah nomor ini sudah punya tanggal
        const cachedItem = existingCache.find(item => 
            item.number.replace(/\D/g, '') === number.replace(/\D/g, '')
        );
        
        return {
            number: number,
            addedDate: cachedItem ? cachedItem.addedDate : new Date().toISOString().split('T')[0]
        };
    });
}

// Helper: Save cache file
async function saveCache(data) {
    try {
        const cacheData = {
            numbers: data,
            lastUpdateTime: new Date().toISOString(),
            metadata: {
                totalCount: data.length,
                updatedAt: new Date().toISOString(),
                version: "2.0"
            }
        };
        
        await fs.writeFile('db_cache.json', JSON.stringify(cacheData, null, 2));
        console.log('💾 Cache saved:', data.length, 'items');
        return cacheData;
    } catch (error) {
        console.error('Error saving cache:', error.message);
        return null;
    }
}

// Helper: Load cache file
async function loadCache() {
    try {
        const content = await fs.readFile('db_cache.json', 'utf8');
        const data = JSON.parse(content);
        console.log('📂 Cache loaded:', data.numbers?.length || 0, 'items');
        return data;
    } catch (error) {
        console.log('📂 Cache not found or invalid, creating new...');
        return {
            numbers: [],
            lastUpdateTime: new Date().toISOString(),
            metadata: {
                totalCount: 0,
                updatedAt: new Date().toISOString(),
                version: "2.0"
            }
        };
    }
}

// Helper: Update cache dengan data baru
async function updateCache(newNumbers) {
    try {
        const cache = await loadCache();
        const existingNumbers = cache.numbers || [];
        
        // Merge data lama dan baru
        const mergedNumbers = [...existingNumbers];
        
        newNumbers.forEach(newItem => {
            const existingIndex = mergedNumbers.findIndex(item => 
                item.number.replace(/\D/g, '') === newItem.number.replace(/\D/g, '')
            );
            
            if (existingIndex === -1) {
                // Nomor baru, tambahkan
                mergedNumbers.push({
                    number: newItem.number,
                    addedDate: newItem.addedDate || new Date().toISOString().split('T')[0]
                });
            } else {
                // Nomor sudah ada, update jika perlu
                if (newItem.addedDate) {
                    mergedNumbers[existingIndex].addedDate = newItem.addedDate;
                }
            }
        });
        
        // Simpan cache yang sudah diupdate
        return await saveCache(mergedNumbers);
    } catch (error) {
        console.error('Error updating cache:', error.message);
        return null;
    }
}

// API endpoint untuk get numbers - DIUBAH: Pakai cache
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
        const githubData = content ? JSON.parse(content) : [];
        
        console.log('📊 Raw data from GitHub:', Array.isArray(githubData) ? `Array with ${githubData.length} items` : 'Object');
        
        // Load cache yang ada
        const cache = await loadCache();
        
        // Convert data GitHub ke format object dengan tanggal dari cache
        let numbers = [];
        
        if (Array.isArray(githubData)) {
            numbers = convertToNewFormat(githubData, cache.numbers);
        } else if (githubData && typeof githubData === 'object' && githubData.numbers) {
            // Jika somehow sudah format object (future proof)
            numbers = githubData.numbers;
        }
        
        console.log(`✅ Processed ${numbers.length} numbers`);
        
        // Update cache dengan data terbaru
        const updatedCache = await updateCache(numbers);
        
        // Kembalikan data dengan tanggal
        res.json({ 
            success: true, 
            numbers: updatedCache ? updatedCache.numbers : numbers,
            lastUpdateTime: updatedCache ? updatedCache.lastUpdateTime : new Date().toISOString(),
            totalCount: numbers.length,
            source: 'github-with-cache-dates'
        });
        
    } catch (error) {
        console.error('❌ GitHub API error:', error.message);
        
        // Jika file tidak ditemukan (404), coba pakai cache saja
        if (error.response && error.response.status === 404) {
            console.log('📄 GitHub file not found, trying cache...');
            
            try {
                const cache = await loadCache();
                
                return res.json({
                    success: true,
                    numbers: cache.numbers || [],
                    lastUpdateTime: cache.lastUpdateTime,
                    totalCount: cache.numbers ? cache.numbers.length : 0,
                    source: 'cache-only',
                    warning: 'GitHub file not found, using cached data'
                });
            } catch (cacheError) {
                console.log('❌ Cache also not available');
            }
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

// API endpoint untuk update numbers
app.post('/api/numbers', async (req, res) => {
    try {
        const { numbers, commitMessage, password } = req.body;
        
        console.log('📝 Update request received');
        console.log('📊 Data to save:', Array.isArray(numbers) ? `Array with ${numbers.length} items` : 'Invalid format');
        
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
        const processedNumbers = numbers.map(item => {
            // Jika format object dari frontend
            if (typeof item === 'object' && item.number) {
                return {
                    number: item.number,
                    addedDate: item.addedDate || new Date().toISOString().split('T')[0]
                };
            }
            // Jika format string (backward compatibility)
            else if (typeof item === 'string') {
                return {
                    number: item,
                    addedDate: new Date().toISOString().split('T')[0]
                };
            }
            // Format tidak valid
            else {
                throw new Error('Invalid number format');
            }
        });
        
        // Untuk disimpan di GitHub, kita simpan sebagai array string (format lama)
        const numbersForGitHub = processedNumbers.map(item => item.number);
        
        // Update cache dengan data baru
        const updatedCache = await updateCache(processedNumbers);
        
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
            lastUpdateTime: updatedCache ? updatedCache.lastUpdateTime : new Date().toISOString(),
            numbers: updatedCache ? updatedCache.numbers : processedNumbers
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
        
        // Load cache
        const cache = await loadCache();
        const numbers = cache.numbers || [];
        
        const cleanNumber = number.replace(/\D/g, '');
        
        // Cari nomor di cache
        const index = numbers.findIndex(item => 
            item.number.replace(/\D/g, '') === cleanNumber
        );

        if (index === -1) {
            // Nomor tidak ditemukan di cache, mungkin belum ada
            // Coba tambahkan dengan tanggal yang diberikan
            numbers.push({
                number: number,
                addedDate: newDate
            });
            
            console.log('➕ Number not found in cache, added new with date:', newDate);
        } else {
            // Update tanggal yang ada
            const oldDate = numbers[index].addedDate || 'Unknown';
            numbers[index].addedDate = newDate;
            console.log('✏️ Updated date from', oldDate, 'to', newDate);
        }
        
        // Save updated cache
        await saveCache(numbers);
        
        // TIDAK perlu update GitHub karena GitHub hanya simpan array string tanpa tanggal
        
        res.json({
            success: true,
            message: 'Date updated successfully',
            number: number,
            newDate: newDate,
            totalInCache: numbers.length
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

// Endpoint untuk view cache (debug purpose)
app.get('/api/cache', async (req, res) => {
    try {
        const cache = await loadCache();
        
        res.json({
            success: true,
            cache: {
                totalNumbers: cache.numbers.length,
                lastUpdateTime: cache.lastUpdateTime,
                metadata: cache.metadata,
                numbers: cache.numbers
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to load cache'
        });
    }
});

// Endpoint untuk reset cache (debug purpose)
app.post('/api/cache/reset', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password || !APP_CONFIG.PASSWORDS.includes(password)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid password' 
            });
        }
        
        // Reset cache ke empty
        await saveCache([]);
        
        res.json({
            success: true,
            message: 'Cache reset successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to reset cache'
        });
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const cache = await loadCache();
        
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            version: '2.0',
            cache: {
                totalNumbers: cache.numbers.length,
                lastUpdate: cache.lastUpdateTime
            },
            features: {
                multiPassword: true,
                dateTracking: true,
                localCache: true,
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
    } catch (error) {
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            error: 'Cache load failed',
            features: {
                multiPassword: true,
                dateTracking: false,
                localCache: false
            }
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

// Initialize cache file jika belum ada
async function initializeCache() {
    try {
        await fs.access('db_cache.json');
        console.log('✅ Cache file already exists');
    } catch (error) {
        console.log('📝 Creating initial cache file...');
        await saveCache([]);
        console.log('✅ Cache file created');
    }
}

app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 GitHub: ${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`);
    console.log(`🔑 Valid passwords: ${APP_CONFIG.PASSWORDS.join(', ')}`);
    console.log(`✨ Features:`);
    console.log(`   - Multiple password support (${APP_CONFIG.PASSWORDS.length} passwords)`);
    console.log(`   - Phone number date tracking (local cache)`);
    console.log(`   - Backward compatible with existing db.json`);
    console.log(`   - Auto cache management`);
    
    // Initialize cache
    await initializeCache();
    
    console.log(`\n📂 File structure:`);
    console.log(`   - db_cache.json (local cache with dates)`);
    console.log(`   - GitHub db.json (array of strings)`);
    console.log(`\n🔄 Flow:`);
    console.log(`   1. Frontend → Objects with dates`);
    console.log(`   2. Backend → Convert & cache dates locally`);
    console.log(`   3. GitHub → Store as array of strings`);
});