const express = require('express');
const axios = require('axios');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs');
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

// Helper: Clean phone number - FIXED: handle non-string values
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

// Helper: Convert string array ke format baru - FIXED
function convertToNewFormat(numbersArray, existingCache = []) {
    if (!Array.isArray(numbersArray)) {
        console.warn('⚠️ convertToNewFormat: Input is not an array');
        return [];
    }
    
    const result = [];
    
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
            
            // Cari di cache apakah nomor ini sudah punya tanggal
            let foundDate = null;
            for (const cachedItem of existingCache) {
                if (cachedItem && cachedItem.number) {
                    const cachedClean = cleanPhoneNumber(cachedItem.number);
                    if (cachedClean === cleanNum) {
                        foundDate = cachedItem.addedDate;
                        break;
                    }
                }
            }
            
            result.push({
                number: cleanNum, // Simpan dalam format bersih (angka saja)
                addedDate: foundDate || new Date().toISOString().split('T')[0]
            });
        } catch (error) {
            console.error('Error processing number:', number, error);
        }
    }
    
    console.log(`✅ Converted ${result.length} numbers from array`);
    return result;
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
        
        // Validasi cache data
        if (!Array.isArray(data.numbers)) {
            console.warn('⚠️ Cache numbers is not an array, resetting...');
            return await createNewCache();
        }
        
        // Filter invalid entries
        const validNumbers = data.numbers.filter(item => 
            item && 
            typeof item === 'object' && 
            item.number && 
            cleanPhoneNumber(item.number)
        );
        
        console.log('📂 Cache loaded:', validNumbers.length, 'valid items');
        
        return {
            numbers: validNumbers,
            lastUpdateTime: data.lastUpdateTime || new Date().toISOString(),
            metadata: data.metadata || {
                totalCount: validNumbers.length,
                updatedAt: new Date().toISOString(),
                version: "2.0"
            }
        };
    } catch (error) {
        console.log('📂 Cache not found or invalid, creating new...');
        return await createNewCache();
    }
}

// Helper: Create new cache
async function createNewCache() {
    const newCache = {
        numbers: [],
        lastUpdateTime: new Date().toISOString(),
        metadata: {
            totalCount: 0,
            updatedAt: new Date().toISOString(),
            version: "2.0"
        }
    };
    
    try {
        await fs.writeFile('db_cache.json', JSON.stringify(newCache, null, 2));
        console.log('📝 Created new cache file');
    } catch (error) {
        console.error('Error creating cache:', error.message);
    }
    
    return newCache;
}

// Helper: Update cache dengan data baru
async function updateCache(newNumbers) {
    try {
        const cache = await loadCache();
        const existingNumbers = cache.numbers || [];
        
        // Merge data lama dan baru
        const mergedNumbers = [...existingNumbers];
        
        for (const newItem of newNumbers) {
            try {
                if (!newItem || !newItem.number) {
                    console.warn('⚠️ Skipping invalid new item:', newItem);
                    continue;
                }
                
                const newClean = cleanPhoneNumber(newItem.number);
                if (!newClean) continue;
                
                let foundIndex = -1;
                for (let i = 0; i < mergedNumbers.length; i++) {
                    const existingItem = mergedNumbers[i];
                    if (existingItem && existingItem.number) {
                        const existingClean = cleanPhoneNumber(existingItem.number);
                        if (existingClean === newClean) {
                            foundIndex = i;
                            break;
                        }
                    }
                }
                
                if (foundIndex === -1) {
                    // Nomor baru, tambahkan
                    mergedNumbers.push({
                        number: newClean,
                        addedDate: newItem.addedDate || new Date().toISOString().split('T')[0]
                    });
                } else {
                    // Nomor sudah ada, update jika perlu
                    if (newItem.addedDate) {
                        mergedNumbers[foundIndex].addedDate = newItem.addedDate;
                    }
                }
            } catch (error) {
                console.error('Error merging item:', newItem, error);
            }
        }
        
        // Simpan cache yang sudah diupdate
        return await saveCache(mergedNumbers);
    } catch (error) {
        console.error('Error updating cache:', error.message);
        return null;
    }
}

// API endpoint untuk get numbers - FIXED
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
        
        console.log('📊 Raw data type from GitHub:', typeof githubData, Array.isArray(githubData) ? `Array with ${githubData.length} items` : 'Not an array');
        
        // Debug: log beberapa item pertama
        if (Array.isArray(githubData) && githubData.length > 0) {
            console.log('🔍 First 3 items from GitHub:', githubData.slice(0, 3).map(item => ({
                value: item,
                type: typeof item
            })));
        }
        
        // Load cache yang ada
        const cache = await loadCache();
        
        // Convert data GitHub ke format object dengan tanggal dari cache
        let numbers = [];
        
        if (Array.isArray(githubData)) {
            numbers = convertToNewFormat(githubData, cache.numbers);
        } else {
            console.warn('⚠️ GitHub data is not an array, using empty array');
            numbers = [];
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
                return res.json({
                    success: true,
                    numbers: [],
                    lastUpdateTime: new Date().toISOString(),
                    totalCount: 0,
                    source: 'empty',
                    warning: 'No data available'
                });
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

// API endpoint untuk update numbers - FIXED
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
        
        // Process numbers untuk frontend (format object) - FIXED
        const processedNumbers = [];
        const errors = [];
        
        for (const item of numbers) {
            try {
                // Jika format object dari frontend
                if (typeof item === 'object' && item.number) {
                    const cleanNum = cleanPhoneNumber(item.number);
                    if (cleanNum) {
                        processedNumbers.push({
                            number: cleanNum,
                            addedDate: item.addedDate || new Date().toISOString().split('T')[0]
                        });
                    } else {
                        errors.push(`Invalid number: ${item.number}`);
                    }
                }
                // Jika format string (backward compatibility)
                else if (typeof item === 'string' || typeof item === 'number') {
                    const cleanNum = cleanPhoneNumber(item);
                    if (cleanNum) {
                        processedNumbers.push({
                            number: cleanNum,
                            addedDate: new Date().toISOString().split('T')[0]
                        });
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
            numbers: updatedCache ? updatedCache.numbers : processedNumbers,
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

// Endpoint untuk update tanggal manual - FIXED
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
        
        // Load cache
        const cache = await loadCache();
        const numbers = cache.numbers || [];
        
        const cleanNumber = cleanPhoneNumber(number);
        
        if (!cleanNumber) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number'
            });
        }
        
        // Cari nomor di cache
        let foundIndex = -1;
        for (let i = 0; i < numbers.length; i++) {
            const item = numbers[i];
            if (item && item.number) {
                const itemClean = cleanPhoneNumber(item.number);
                if (itemClean === cleanNumber) {
                    foundIndex = i;
                    break;
                }
            }
        }

        if (foundIndex === -1) {
            // Nomor tidak ditemukan di cache, tambahkan baru
            numbers.push({
                number: cleanNumber,
                addedDate: finalDate
            });
            
            console.log('➕ Number not found in cache, added new with date:', finalDate);
        } else {
            // Update tanggal yang ada
            const oldDate = numbers[foundIndex].addedDate || 'Unknown';
            numbers[foundIndex].addedDate = finalDate;
            console.log('✏️ Updated date from', oldDate, 'to', finalDate);
        }
        
        // Save updated cache
        await saveCache(numbers);
        
        res.json({
            success: true,
            message: 'Date updated successfully',
            number: cleanNumber,
            newDate: finalDate,
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
                numbers: cache.numbers.slice(0, 10) // Only show first 10 for preview
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
        await createNewCache();
        
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
        
        // Validasi cache file
        const cache = await loadCache();
        console.log(`✅ Cache validated: ${cache.numbers.length} items`);
    } catch (error) {
        console.log('📝 Creating initial cache file...');
        await createNewCache();
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
    console.log(`   - Error handling for invalid data`);
    
    // Initialize cache
    await initializeCache();
    
    console.log(`\n📂 File structure:`);
    console.log(`   - db_cache.json (local cache with dates)`);
    console.log(`   - GitHub db.json (array of strings)`);
    console.log(`\n🔧 Debug endpoints:`);
    console.log(`   - GET /api/cache (view cache)`);
    console.log(`   - POST /api/cache/reset (reset cache)`);
    console.log(`   - GET /health (server status)`);
});