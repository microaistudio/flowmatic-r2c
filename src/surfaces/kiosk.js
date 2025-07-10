// File: /src/surfaces/kiosk.js
// Project: FlowMatic-SOLO R2C
// Phase: 5 - Customer Interfaces
// Purpose: Minimal kiosk surface - just serve HTML and kiosk-specific settings
// Note: All business logic uses existing /api/* endpoints from core routes

const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../database/connection');

// ===================================================================
// SERVE KIOSK HTML
// ===================================================================

// Serve kiosk interface
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/kiosk/index.html'));
});

// ===================================================================
// KIOSK-SPECIFIC SETTINGS (Display preferences only)
// ===================================================================

// Get kiosk display settings
router.get('/settings', async (req, res) => {
    try {
        const settings = await db.get(`
            SELECT 
                global_language,
                allow_language_override,
                show_rwt,
                show_ewt,
                show_queue_count,
                show_descriptions,
                promotion_enabled,
                promotion_message_en,
                promotion_message_th,
                promotion_message_hi,
                touch_sound_enabled,
                screen_saver_minutes
            FROM kiosk_settings 
            WHERE id = 1
        `);

        res.json({
            globalLanguage: settings?.global_language || 'en',
            allowLanguageOverride: Boolean(settings?.allow_language_override ?? true),
            displaySettings: {
                showRWT: Boolean(settings?.show_rwt ?? true),
                showEWT: Boolean(settings?.show_ewt ?? true),
                showQueueCount: Boolean(settings?.show_queue_count ?? true),
                showDescription: Boolean(settings?.show_descriptions ?? false)
            },
            promotions: {
                enabled: Boolean(settings?.promotion_enabled ?? false),
                message: {
                    en: settings?.promotion_message_en || 'Welcome to FlowMatic!',
                    th: settings?.promotion_message_th || 'ยินดีต้อนรับสู่ FlowMatic!',
                    hi: settings?.promotion_message_hi || 'FlowMatic में आपका स्वागत है!'
                }
            },
            appearance: {
                touchSoundEnabled: Boolean(settings?.touch_sound_enabled ?? true),
                screenSaverMinutes: settings?.screen_saver_minutes || 5
            }
        });
    } catch (error) {
        console.error('Error loading kiosk settings:', error);
        res.status(500).json({ 
            error: 'Failed to load kiosk settings',
            message: error.message 
        });
    }
});

// Update kiosk display settings (admin only)
router.post('/settings', async (req, res) => {
    try {
        const {
            globalLanguage,
            allowLanguageOverride,
            showRWT,
            showEWT,
            showQueueCount,
            showDescriptions,
            promotionEnabled,
            promotionMessages,
            touchSoundEnabled,
            screenSaverMinutes
        } = req.body;

        await db.run(`
            UPDATE kiosk_settings 
            SET 
                global_language = ?,
                allow_language_override = ?,
                show_rwt = ?,
                show_ewt = ?,
                show_queue_count = ?,
                show_descriptions = ?,
                promotion_enabled = ?,
                promotion_message_en = ?,
                promotion_message_th = ?,
                promotion_message_hi = ?,
                touch_sound_enabled = ?,
                screen_saver_minutes = ?,
                updated_at = datetime('now')
            WHERE id = 1
        `, [
            globalLanguage,
            allowLanguageOverride,
            showRWT,
            showEWT,
            showQueueCount,
            showDescriptions,
            promotionEnabled,
            promotionMessages?.en || '',
            promotionMessages?.th || '',
            promotionMessages?.hi || '',
            touchSoundEnabled,
            screenSaverMinutes
        ]);

        res.json({ 
            success: true, 
            message: 'Kiosk settings updated successfully' 
        });

    } catch (error) {
        console.error('Error updating kiosk settings:', error);
        res.status(500).json({ 
            error: 'Failed to update kiosk settings',
            message: error.message 
        });
    }
});

// ===================================================================
// KIOSK ANALYTICS (Optional - for tracking kiosk usage patterns)
// ===================================================================

// Log kiosk interaction (called by frontend)
router.post('/analytics', async (req, res) => {
    try {
        const { event, data } = req.body;
        
        await db.run(`
            INSERT INTO kiosk_analytics (
                event_type, 
                event_data, 
                timestamp
            ) VALUES (?, ?, datetime('now'))
        `, [event, JSON.stringify(data)]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error logging analytics:', error);
        res.status(500).json({ error: 'Failed to log analytics' });
    }
});

// Get kiosk usage analytics
router.get('/analytics', async (req, res) => {
    try {
        const { period = 'today' } = req.query;
        
        let dateFilter = "DATE(timestamp) = DATE('now')";
        if (period === 'week') {
            dateFilter = "timestamp >= datetime('now', '-7 days')";
        } else if (period === 'month') {
            dateFilter = "timestamp >= datetime('now', '-30 days')";
        }

        const stats = await db.all(`
            SELECT 
                event_type,
                COUNT(*) as count,
                DATE(timestamp) as date
            FROM kiosk_analytics 
            WHERE ${dateFilter}
            GROUP BY event_type, DATE(timestamp)
            ORDER BY date DESC, count DESC
        `);

        res.json({ period, stats });
    } catch (error) {
        console.error('Error getting analytics:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

module.exports = router;

// ===================================================================
// THAT'S IT! Everything else uses existing routes:
// - POST /api/ticket - Issue tickets (from ticket.js)
// - GET /api/queue/:serviceId - Get queue status (from queue.js) 
// - GET /api/services - Get services list (from services.js)
// - All other business logic already exists!
// ===================================================================