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

// ============= API ENDPOINTS =============

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
            const normalizedWord = word.toLowerCase().replace(/[^a-z0-9]/g, '_');
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
async function generateGoogleTTS(text, language, voiceName, options = {}) {
    const request = {
        input: { text },
        voice: {
            languageCode: language,
            name: voiceName || `${language}-Neural2-C`, // Default female voice
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
    const params = {
        Text: text,
        OutputFormat: 'mp3',
        VoiceId: voiceName || 'Joanna', // Default voice
        LanguageCode: language,
        Engine: 'neural', // Use neural voices for better quality
    };

    const response = await polly.synthesizeSpeech(params).promise();
    return response.AudioStream;
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