// ============= BACKEND AUDIO API =============
// routes/audio.js

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============= CONFIGURATION =============
const AUDIO_CONFIG = {
    // Google Cloud TTS
    GOOGLE_TTS: {
        projectId: process.env.GOOGLE_PROJECT_ID,
        keyFilename: process.env.GOOGLE_KEY_FILE,
    },

    // AWS Polly (Alternative)
    AWS_POLLY: {
        region: process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },

    // S3 Storage for pre-recorded audio
    S3_BUCKET: {
        name: process.env.S3_BUCKET_NAME,
        region: process.env.AWS_REGION || 'us-east-1',
        cdnUrl: process.env.CDN_URL, // CloudFront URL
    },

    // Cache settings
    CACHE_DIR: path.join(__dirname, '../cache/audio'),
    CACHE_MAX_AGE: 30 * 24 * 60 * 60 * 1000, // 30 days
};

const VOICE_MAP = {
    'ja-JP': {
        google: 'ja-JP-Neural2-B', // Giọng nữ tự nhiên (Neural)
        aws: 'Takumi'              // Giọng nam (Neural)
    },
    'en-US': {
        google: 'en-US-Neural2-C',
        aws: 'Joanna'
    },
    'vi-VN': {
        google: 'vi-VN-Neural2-A',
        aws: 'Chi' // Lưu ý: AWS 'Chi' chỉ hỗ trợ engine 'standard', không phải 'neural'
    }
};

// Initialize clients
const googleTTSClient = new TextToSpeechClient({
    projectId: AUDIO_CONFIG.GOOGLE_TTS.projectId,
    keyFilename: AUDIO_CONFIG.GOOGLE_TTS.keyFilename,
});

const s3 = new AWS.S3({
    region: AUDIO_CONFIG.AWS_POLLY.region,
    accessKeyId: AUDIO_CONFIG.AWS_POLLY.accessKeyId,
    secretAccessKey: AUDIO_CONFIG.AWS_POLLY.secretAccessKey,
});

const polly = new AWS.Polly({
    region: AUDIO_CONFIG.AWS_POLLY.region,
    accessKeyId: AUDIO_CONFIG.AWS_POLLY.accessKeyId,
    secretAccessKey: AUDIO_CONFIG.AWS_POLLY.secretAccessKey,
});

// Ensure cache directory exists
if (!fs.existsSync(AUDIO_CONFIG.CACHE_DIR)) {
    fs.mkdirSync(AUDIO_CONFIG.CACHE_DIR, { recursive: true });
}

// ============= HELPER FUNCTIONS =============

// Generate unique filename
function generateAudioFilename(text, language, voice) {
    const hash = crypto
        .createHash('md5')
        .update(`${text}_${language}_${voice}`)
        .digest('hex');
    return `${hash}.mp3`;
}

// Check if audio exists in S3
async function checkS3Audio(word) {
    const normalizedWord = word.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const key = `audio/${normalizedWord}.mp3`;

    try {
        await s3.headObject({
            Bucket: AUDIO_CONFIG.S3_BUCKET.name,
            Key: key,
        }).promise();

        return `${AUDIO_CONFIG.S3_BUCKET.cdnUrl}/${key}`;
    } catch (error) {
        console.error('checkS3Audio error:', error.code, error.message);
        return null;
    }
}


// Upload audio to S3
async function uploadToS3(audioBuffer, key) {
    try {
        await s3.putObject({
            Bucket: AUDIO_CONFIG.S3_BUCKET.name,
            Key: key,
            Body: audioBuffer,
            ContentType: 'audio/mpeg',
            CacheControl: 'max-age=31536000', // 1 year
        }).promise();

        return `${AUDIO_CONFIG.S3_BUCKET.cdnUrl}/${key}`;
    } catch (error) {
        console.error('S3 upload failed:', error);
        return null;
    }
}

/**
 * Upload một file audio lên S3
 */
async function uploadFileToS3(filePath, fileName) {
    try {
        const fileContent = fs.readFileSync(filePath);
        const normalizedFileName = fileName.toLowerCase().replace(/[^a-z0-9.]/g, '_');
        const s3Key = `audio/${normalizedFileName}`;

        await s3.putObject({
            Bucket: AUDIO_CONFIG.S3_BUCKET.name,
            Key: s3Key,
            Body: fileContent,
            ContentType: 'audio/mpeg',
            CacheControl: 'max-age=31536000', // 1 year
        }).promise();

        const cdnUrl = `${AUDIO_CONFIG.S3_BUCKET.cdnUrl}/${s3Key}`;

        return {
            success: true,
            fileName,
            s3Key,
            url: cdnUrl,
            size: fileContent.length,
        };
    } catch (error) {
        return {
            success: false,
            fileName,
            error: error.message,
        };
    }
}

/**
 * Lấy danh sách tất cả file audio trong thư mục
 */
function getAudioFiles(directory) {
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a'];
    const files = [];

    function scanDirectory(dir) {
        const items = fs.readdirSync(dir);

        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // Đệ quy vào thư mục con
                scanDirectory(fullPath);
            } else if (stat.isFile()) {
                const ext = path.extname(item).toLowerCase();
                if (audioExtensions.includes(ext)) {
                    files.push({
                        fullPath,
                        fileName: item,
                        relativePath: path.relative(directory, fullPath),
                        size: stat.size,
                    });
                }
            }
        }
    }

    scanDirectory(directory);
    return files;
}

/**
 * ⚡ Upload files song song với giới hạn concurrency
 */
async function uploadFilesInParallel(files, concurrency = 10) {
    const results = [];
    const queue = [...files];
    let completed = 0;
    let inProgress = 0;

    return new Promise((resolve) => {
        const processNext = async () => {
            if (queue.length === 0 && inProgress === 0) {
                resolve(results);
                return;
            }

            while (inProgress < concurrency && queue.length > 0) {
                inProgress++;
                const file = queue.shift();

                uploadFileToS3(file.fullPath, file.fileName)
                    .then(result => {
                        results.push(result);
                        completed++;
                        
                        if (result.success) {
                            console.log(`✅ [${completed}/${files.length}] Uploaded: ${file.fileName}`);
                        } else {
                            console.error(`❌ [${completed}/${files.length}] Failed: ${file.fileName} - ${result.error}`);
                        }
                        
                        inProgress--;
                        processNext();
                    })
                    .catch(error => {
                        results.push({
                            success: false,
                            fileName: file.fileName,
                            error: error.message,
                        });
                        completed++;
                        console.error(`❌ [${completed}/${files.length}] Error: ${file.fileName}`);
                        inProgress--;
                        processNext();
                    });
            }
        };

        processNext();
    });
}

// ============= API ENDPOINTS - Thêm vào cuối file trước module.exports =============

/**
 * POST /api/audio/upload-all
 * Upload tất cả file audio từ thư mục local lên S3
 */
router.post('/upload-all', async (req, res) => {
    try {
        const { directory, dryRun = false } = req.body;

        // Sử dụng thư mục từ env hoặc từ request
        const sourceDir = directory || process.env.LOCAL_AUDIO_DIR || AUDIO_CONFIG.CACHE_DIR;

        // Kiểm tra thư mục có tồn tại
        if (!fs.existsSync(sourceDir)) {
            return res.status(400).json({
                error: 'Directory not found',
                path: sourceDir,
            });
        }

        // Lấy danh sách file
        const audioFiles = getAudioFiles(sourceDir);

        if (audioFiles.length === 0) {
            return res.json({
                message: 'No audio files found',
                directory: sourceDir,
            });
        }

        // Nếu dryRun, chỉ trả về danh sách file
        if (dryRun) {
            return res.json({
                dryRun: true,
                directory: sourceDir,
                totalFiles: audioFiles.length,
                files: audioFiles,
                totalSize: audioFiles.reduce((sum, f) => sum + f.size, 0),
                totalSizeMB: (audioFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2),
            });
        }

        // Upload từng file
        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const file of audioFiles) {
            const result = await uploadFileToS3(file.fullPath, file.fileName);
            results.push(result);

            if (result.success) {
                successCount++;
                console.log(`✅ Uploaded: ${file.fileName}`);
            } else {
                failCount++;
                console.error(`❌ Failed: ${file.fileName} - ${result.error}`);
            }
        }

        res.json({
            success: true,
            directory: sourceDir,
            totalFiles: audioFiles.length,
            successCount,
            failCount,
            results,
        });

    } catch (error) {
        console.error('Upload all failed:', error);
        res.status(500).json({
            error: 'Failed to upload files',
            message: error.message,
        });
    }
});

/**
 * POST /api/audio/upload-single
 * Upload một file cụ thể lên S3
 */
router.post('/upload-single', async (req, res) => {
    try {
        const { filePath, fileName } = req.body;

        if (!filePath) {
            return res.status(400).json({ error: 'filePath is required' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const name = fileName || path.basename(filePath);
        const result = await uploadFileToS3(filePath, name);

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }

    } catch (error) {
        res.status(500).json({
            error: 'Upload failed',
            message: error.message,
        });
    }
});

/**
 * GET /api/audio/list-local
 * Liệt kê tất cả file audio trong thư mục local
 */
router.get('/list-local', (req, res) => {
    try {
        const { directory } = req.query;
        const sourceDir = directory || process.env.LOCAL_AUDIO_DIR || AUDIO_CONFIG.CACHE_DIR;

        if (!fs.existsSync(sourceDir)) {
            return res.status(400).json({
                error: 'Directory not found',
                path: sourceDir,
            });
        }

        const audioFiles = getAudioFiles(sourceDir);

        res.json({
            directory: sourceDir,
            totalFiles: audioFiles.length,
            files: audioFiles,
            totalSize: audioFiles.reduce((sum, f) => sum + f.size, 0),
            totalSizeMB: (audioFiles.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2),
        });

    } catch (error) {
        res.status(500).json({
            error: 'Failed to list files',
            message: error.message,
        });
    }
});

/**
 * GET /api/audio/list-s3
 * Liệt kê tất cả file audio trên S3
 */
router.get('/list-s3', async (req, res) => {
    try {
        const { prefix = 'audio/', maxKeys = 1000 } = req.query;

        const params = {
            Bucket: AUDIO_CONFIG.S3_BUCKET.name,
            Prefix: prefix,
            MaxKeys: parseInt(maxKeys),
        };

        const data = await s3.listObjectsV2(params).promise();

        const files = data.Contents.map(item => ({
            key: item.Key,
            fileName: path.basename(item.Key),
            size: item.Size,
            lastModified: item.LastModified,
            url: `${AUDIO_CONFIG.S3_BUCKET.cdnUrl}/${item.Key}`,
        }));

        res.json({
            bucket: AUDIO_CONFIG.S3_BUCKET.name,
            prefix,
            totalFiles: files.length,
            files,
            totalSize: files.reduce((sum, f) => sum + f.size, 0),
            totalSizeMB: (files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024)).toFixed(2),
            isTruncated: data.IsTruncated,
        });

    } catch (error) {
        console.error('List S3 failed:', error);
        res.status(500).json({
            error: 'Failed to list S3 files',
            message: error.message,
        });
    }
});

/**
 * POST /api/audio/sync
 * Đồng bộ: Upload các file local chưa có trên S3
 * ⚡ OPTIMIZED: Parallel upload
 */
router.post('/sync', async (req, res) => {
    try {
        const { directory, dryRun = false, concurrency = 10 } = req.body;
        const sourceDir = directory || process.env.LOCAL_AUDIO_DIR || AUDIO_CONFIG.CACHE_DIR;

        if (!fs.existsSync(sourceDir)) {
            return res.status(400).json({
                error: 'Directory not found',
                path: sourceDir,
            });
        }

        // Lấy danh sách file local
        const localFiles = getAudioFiles(sourceDir);

        // Lấy danh sách file trên S3
        const s3Data = await s3.listObjectsV2({
            Bucket: AUDIO_CONFIG.S3_BUCKET.name,
            Prefix: 'audio/',
        }).promise();

        const s3FileNames = new Set(
            s3Data.Contents.map(item => path.basename(item.Key).toLowerCase())
        );

        // Tìm file cần upload (chưa có trên S3)
        const filesToUpload = localFiles.filter(file => {
            const normalizedName = file.fileName.toLowerCase().replace(/[^a-z0-9.]/g, '_');
            return !s3FileNames.has(normalizedName);
        });

        if (filesToUpload.length === 0) {
            return res.json({
                message: 'All files are already on S3',
                totalLocalFiles: localFiles.length,
                totalS3Files: s3Data.Contents.length,
            });
        }

        // Nếu dryRun, chỉ trả về danh sách
        if (dryRun) {
            return res.json({
                dryRun: true,
                directory: sourceDir,
                totalLocalFiles: localFiles.length,
                totalS3Files: s3Data.Contents.length,
                filesToUpload: filesToUpload.length,
                files: filesToUpload,
            });
        }

        // ⚡ Upload song song
        const startTime = Date.now();
        const results = await uploadFilesInParallel(filesToUpload, concurrency);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        res.json({
            success: true,
            directory: sourceDir,
            totalLocalFiles: localFiles.length,
            totalS3Files: s3Data.Contents.length,
            filesUploaded: filesToUpload.length,
            successCount,
            failCount,
            duration: `${duration}s`,
            averageSpeed: `${(filesToUpload.length / duration).toFixed(2)} files/s`,
            concurrency,
            results,
        });

    } catch (error) {
        console.error('Sync failed:', error);
        res.status(500).json({
            error: 'Sync failed',
            message: error.message,
        });
    }
});

/**
 * GET /api/audio/tts
 * Generate audio using Text-to-Speech
 * Query params:
 *  - text: Text to convert
 *  - language: Language code (default: en-US)
 *  - voice: Voice name (optional)
 *  - provider: google|aws (default: google)
 */
router.get('/tts', async (req, res) => {
    try {
        const {
            text,
            language = 'en-US',
            voice,
            provider = 'aws',
            speed = 1.0,
            pitch = 0,
        } = req.query;

        if (!text) {
            return res.status(400).json({ error: 'Text parameter is required' });
        }

        // Check cache first
        const filename = generateAudioFilename(text, language, voice || 'default');
        const cachePath = path.join(AUDIO_CONFIG.CACHE_DIR, filename);

        if (fs.existsSync(cachePath)) {
            const stats = fs.statSync(cachePath);
            if (Date.now() - stats.mtimeMs < AUDIO_CONFIG.CACHE_MAX_AGE) {
                return res.sendFile(cachePath);
            }
        }

        let audioBuffer;

        // Generate using selected provider
        if (provider === 'google') {
            audioBuffer = await generateGoogleTTS(text, language, voice, {
                speed: parseFloat(speed),
                pitch: parseFloat(pitch),
            });
        } else if (provider === 'aws') {
            audioBuffer = await generateAWSPolly(text, language, voice);
        } else {
            return res.status(400).json({ error: 'Invalid provider' });
        }

        // Save to cache
        fs.writeFileSync(cachePath, audioBuffer);

        // Send response
        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'public, max-age=2592000', // 30 days
        });
        res.send(audioBuffer);

    } catch (error) {
        console.error('TTS generation failed:', error);
        res.status(500).json({
            error: 'Audio generation failed',
            message: error.message,
        });
    }
});

/**
 * GET /api/audio/word/:word
 * Get pre-recorded audio for a word, fallback to TTS
 */
router.get('/word/:word', async (req, res) => {
    try {
        const { word } = req.params;
        const { language = 'en-US' } = req.query;

        // Try to get pre-recorded audio from S3
        const s3Url = await checkS3Audio(word);

        if (s3Url) {
            return res.json({
                url: s3Url,
                source: 'pre-recorded',
                word,
            });
        }

        // Fallback to TTS
        const filename = generateAudioFilename(word, language, 'default');
        const cachePath = path.join(AUDIO_CONFIG.CACHE_DIR, filename);

        let audioBuffer;

        if (fs.existsSync(cachePath)) {
            audioBuffer = fs.readFileSync(cachePath);
        } else {
            audioBuffer = await generateAWSPolly(word, language);
            fs.writeFileSync(cachePath, audioBuffer);

            // Upload to S3 for future use
            //tạm thời
            const normalizedWord = word.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_');
            const s3Key = `audio/${normalizedWord}.mp3`;
            await uploadToS3(audioBuffer, s3Key);
        }
        console.log('🔎 [DEBUG] audioBuffer length:', audioBuffer.length);
        console.log('🔎 [DEBUG] first bytes:', audioBuffer.slice(0, 50).toString('utf8'));

        res.set({
            'Content-Type': 'audio/mpeg',
            'Content-Length': audioBuffer.length,
            'Cache-Control': 'public, max-age=2592000',
        });
        res.send(audioBuffer);

    } catch (error) {
        console.error('Audio retrieval failed:', error);
        res.status(500).json({
            error: 'Failed to get audio',
            message: error.message,
        });
    }
});

/**
 * POST /api/audio/batch
 * Generate audio for multiple words (for pre-warming cache)
 */
router.post('/batch', async (req, res) => {
    try {
        const { words, language = 'en-US' } = req.body;

        if (!Array.isArray(words) || words.length === 0) {
            return res.status(400).json({ error: 'Words array is required' });
        }

        const results = [];

        for (const word of words.slice(0, 50)) { // Limit to 50 words per request
            try {
                const filename = generateAudioFilename(word, language, 'default');
                const cachePath = path.join(AUDIO_CONFIG.CACHE_DIR, filename);

                if (!fs.existsSync(cachePath)) {
                    const audioBuffer = await generateGoogleTTS(word, language);
                    fs.writeFileSync(cachePath, audioBuffer);

                    // Upload to S3
                    const normalizedWord = word.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    const s3Key = `audio/${normalizedWord}.mp3`;
                    const s3Url = await uploadToS3(audioBuffer, s3Key);

                    results.push({
                        word,
                        status: 'generated',
                        url: s3Url,
                    });
                } else {
                    results.push({
                        word,
                        status: 'cached',
                    });
                }
            } catch (error) {
                results.push({
                    word,
                    status: 'failed',
                    error: error.message,
                });
            }
        }

        res.json({
            success: true,
            results,
            totalProcessed: results.length,
        });

    } catch (error) {
        console.error('Batch generation failed:', error);
        res.status(500).json({
            error: 'Batch generation failed',
            message: error.message,
        });
    }
});

// ============= TTS GENERATION FUNCTIONS =============

// Google Cloud TTS
// Google Cloud TTS
async function generateGoogleTTS(text, language, voiceName, options = {}) {
    // 1. Xác định giọng mặc định dựa trên ngôn ngữ
    let targetVoice = voiceName;

    if (!targetVoice) {
        // Nếu có trong map thì lấy, không thì fallback về logic cũ
        targetVoice = VOICE_MAP[language]?.google || `${language}-Neural2-C`;
    }

    const request = {
        input: { text },
        voice: {
            languageCode: language,
            name: targetVoice,
        },
        audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: options.speed || 1.0,
            pitch: options.pitch || 0,
            volumeGainDb: 0,
            effectsProfileId: ['headphone-class-device'],
        },
    };

    const [response] = await googleTTSClient.synthesizeSpeech(request);
    return response.audioContent;
}

// AWS Polly
async function generateAWSPolly(text, language, voiceName) {
    const defaultVoice = VOICE_MAP[language]?.aws || 'Joanna';
    const finalVoice = voiceName || defaultVoice;
    let engine = 'neural';
    const standardOnlyVoices = ['Chi', 'Mizuki'];
    const params = {
        Text: text,
        OutputFormat: 'mp3',
        VoiceId: finalVoice,
        LanguageCode: language,
        Engine: engine,
    };

    try {
        const response = await polly.synthesizeSpeech(params).promise();
        return response.AudioStream;
    } catch (error) {
        // Fallback: Nếu lỗi Engine not supported (ví dụ giọng cũ), thử lại với standard
        if (error.code === 'EngineNotSupported') {
            console.warn(`Neural engine not supported for ${finalVoice}, falling back to standard.`);
            params.Engine = 'standard';
            const response = await polly.synthesizeSpeech(params).promise();
            return response.AudioStream;
        }
        throw error;
    }
}

// ============= ADMIN ENDPOINTS =============

/**
 * DELETE /api/audio/cache
 * Clear audio cache
 */
router.delete('/cache', async (req, res) => {
    try {
        const files = fs.readdirSync(AUDIO_CONFIG.CACHE_DIR);

        let deletedCount = 0;
        for (const file of files) {
            const filePath = path.join(AUDIO_CONFIG.CACHE_DIR, file);
            fs.unlinkSync(filePath);
            deletedCount++;
        }

        res.json({
            success: true,
            deletedFiles: deletedCount,
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to clear cache',
            message: error.message,
        });
    }
});

/**
 * GET /api/audio/stats
 * Get audio cache statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const files = fs.readdirSync(AUDIO_CONFIG.CACHE_DIR);

        let totalSize = 0;
        files.forEach(file => {
            const filePath = path.join(AUDIO_CONFIG.CACHE_DIR, file);
            const stats = fs.statSync(filePath);
            totalSize += stats.size;
        });

        res.json({
            cachedFiles: files.length,
            totalSize: totalSize,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            cacheDir: AUDIO_CONFIG.CACHE_DIR,
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to get stats',
            message: error.message,
        });
    }
});

module.exports = router;