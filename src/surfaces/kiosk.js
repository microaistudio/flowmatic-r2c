// File: /src/surfaces/kiosk.js
// Project: FlowMatic-SOLO R2C
// Phase: 5 - Customer Interfaces
// Surface: Kiosk Interface Logic
// Purpose: Kiosk endpoints, configuration, and business logic
// Dependencies: Core routes (/api/*), auth, database
// Pattern: Surface-specific route architecture
// URLs: /kiosk/*, /api/kiosk/*
// Created: 2025-07-10

const express = require('express');
const path = require('path');
const router = express.Router();
const db = require('../database/connection');

// ===================================================================
// KIOSK CONFIGURATION & SETTINGS
// ===================================================================

// Load kiosk configuration from database
async function getKioskConfiguration() {
    try {
        // Get kiosk settings
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
                logo_url,
                touch_sound_enabled,
                screen_saver_minutes
            FROM kiosk_settings 
            WHERE id = 1
        `);

        // Get active services with current queue data
        const services = await db.all(`
            SELECT 
                s.id,
                s.name,
                s.prefix,
                s.color,
                s.icon,
                s.description_en,
                s.description_th,
                s.description_hi,
                s.is_active,
                s.current_number,
                COUNT(CASE WHEN t.state = 'waiting' THEN 1 END) as queue_count,
                ROUND(AVG(CASE 
                    WHEN t.state IN ('serving', 'ended') 
                    AND t.served_at IS NOT NULL 
                    AND t.called_at IS NOT NULL
                    THEN (julianday(t.served_at) - julianday(t.called_at)) * 24 * 60 
                END), 0) as avg_service_time,
                ROUND(AVG(CASE 
                    WHEN t.state IN ('called', 'serving', 'ended') 
                    AND t.called_at IS NOT NULL 
                    THEN (julianday(t.called_at) - julianday(t.issued_at)) * 24 * 60 
                END), 0) as avg_wait_time
            FROM services s
            LEFT JOIN tickets t ON s.id = t.service_id 
                AND DATE(t.issued_at) = DATE('now')
            WHERE s.is_active = 1
            GROUP BY s.id, s.name, s.prefix, s.color, s.icon, 
                     s.description_en, s.description_th, s.description_hi,
                     s.is_active, s.current_number
            ORDER BY s.id
        `);

        // Calculate estimated wait times
        const servicesWithEstimates = services.map(service => {
            const estimatedWait = Math.max(1, 
                (service.queue_count * (service.avg_service_time || 3)) || 5
            );
            const realWait = Math.max(1, service.avg_wait_time || estimatedWait);

            return {
                id: service.id,
                name: {
                    en: service.name,
                    th: service.name, // In real app, these would be separate columns
                    hi: service.name
                },
                description: {
                    en: service.description_en || `${service.name} services`,
                    th: service.description_th || service.description_en || `${service.name} services`,
                    hi: service.description_hi || service.description_en || `${service.name} services`
                },
                prefix: service.prefix,
                type: service.prefix.toLowerCase(),
                color: service.color,
                icon: service.icon || '🏢',
                isActive: Boolean(service.is_active),
                currentNumber: service.current_number,
                queueCount: service.queue_count || 0,
                estimatedWait: estimatedWait,
                realWait: realWait
            };
        });

        return {
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
                logoUrl: settings?.logo_url || '',
                touchSoundEnabled: Boolean(settings?.touch_sound_enabled ?? true),
                screenSaverMinutes: settings?.screen_saver_minutes || 5
            },
            services: servicesWithEstimates
        };
    } catch (error) {
        console.error('Error loading kiosk configuration:', error);
        throw error;
    }
}

// ===================================================================
// TICKET ISSUANCE LOGIC
// ===================================================================

async function issueKioskTicket(serviceId, language = 'en', deviceInfo = {}) {
    return new Promise(async (resolve, reject) => {
        // Start exclusive transaction for ticket generation
        await db.run('BEGIN EXCLUSIVE TRANSACTION');
        
        try {
            // Get service information
            const service = await db.get(`
                SELECT id, name, prefix, current_number, is_active 
                FROM services 
                WHERE id = ? AND is_active = 1
            `, [serviceId]);

            if (!service) {
                throw new Error('Service not found or inactive');
            }

            // Get next ticket number
            const nextNumber = await db.get(`
                SELECT COALESCE(MAX(CAST(SUBSTR(number, 2) AS INTEGER)), 0) + 1 as next_num
                FROM tickets 
                WHERE service_id = ? 
                AND DATE(issued_at) = DATE('now')
            `, [serviceId]);

            const ticketNumber = `${service.prefix}${String(nextNumber.next_num).padStart(3, '0')}`;

            // Insert new ticket
            const result = await db.run(`
                INSERT INTO tickets (
                    number, service_id, state, issued_at, printed, 
                    issued_language, device_type, screen_resolution
                ) VALUES (?, ?, 'waiting', datetime('now'), 0, ?, ?, ?)
            `, [
                ticketNumber, 
                serviceId, 
                language,
                deviceInfo.type || 'kiosk',
                deviceInfo.resolution || 'unknown'
            ]);

            const ticketId = result.lastID;

            // Update service current number
            await db.run(`
                UPDATE services 
                SET current_number = ?, updated_at = datetime('now')
                WHERE id = ?
            `, [ticketNumber, serviceId]);

            // Calculate estimated wait time
            const queueCount = await db.get(`
                SELECT COUNT(*) as count 
                FROM tickets 
                WHERE service_id = ? AND state = 'waiting' AND id < ?
            `, [serviceId, ticketId]);

            const avgServiceTime = await db.get(`
                SELECT ROUND(AVG(
                    (julianday(served_at) - julianday(called_at)) * 24 * 60
                ), 0) as avg_time
                FROM tickets 
                WHERE service_id = ? 
                AND served_at IS NOT NULL 
                AND called_at IS NOT NULL
                AND DATE(issued_at) >= DATE('now', '-7 days')
            `, [serviceId]);

            const estimatedWait = Math.max(1, 
                queueCount.count * (avgServiceTime.avg_time || 3)
            );

            // Log analytics
            await db.run(`
                INSERT INTO kiosk_analytics (
                    ticket_id, service_id, language, device_type,
                    queue_position, estimated_wait, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `, [
                ticketId, serviceId, language, deviceInfo.type || 'kiosk',
                queueCount.count + 1, estimatedWait
            ]);

            // Commit transaction first
            await db.run('COMMIT');

            // PRINT TICKET (Same as Debug Console pattern)
            try {
                // Call existing printer endpoint (same as console uses)
                const printerResponse = await fetch(`http://localhost:${process.env.PORT || 5050}/api/printer/print`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        ticketNumber: ticketNumber,
                        serviceName: service.name,
                        queuePosition: queueCount.count + 1,
                        estimatedWait: estimatedWait,
                        timestamp: new Date().toISOString(),
                        language: language
                    })
                });

                if (printerResponse.ok) {
                    console.log(`✅ Ticket ${ticketNumber} printed successfully`);
                    
                    // Mark as printed in database
                    await db.run(`
                        UPDATE tickets 
                        SET printed = 1, printed_at = datetime('now')
                        WHERE id = ?
                    `, [ticketId]);
                } else {
                    console.error(`❌ Printer failed for ticket ${ticketNumber}:`, await printerResponse.text());
                    // Still return success - ticket was created, just printing failed
                }
            } catch (printerError) {
                console.error(`❌ Printer error for ticket ${ticketNumber}:`, printerError.message);
                // Still return success - ticket was created, just printing failed
            }

            // Emit real-time update
            const io = req.app.get('io'); // Get Socket.IO instance from app
            if (io) {
                io.emit('ticket:issued', {
                    ticketNumber,
                    serviceId,
                    queuePosition: queueCount.count + 1,
                    estimatedWait
                });

                io.emit('queue:updated', {
                    serviceId,
                    queueCount: queueCount.count + 1
                });
            }

            resolve({
                success: true,
                ticketId,
                ticketNumber,
                serviceName: service.name,
                queuePosition: queueCount.count + 1,
                estimatedWait,
                message: {
                    en: `Ticket ${ticketNumber} issued successfully`,
                    th: `ออกตั๋ว ${ticketNumber} สำเร็จ`,
                    hi: `टिकट ${ticketNumber} सफलतापूर्वक जारी किया गया`
                }
            });

        } catch (error) {
            // Rollback on error
            await db.run('ROLLBACK');
            console.error('Error issuing kiosk ticket:', error);
            reject(error);
        }
    });
}

// ===================================================================
// KIOSK ANALYTICS & MONITORING
// ===================================================================

async function getKioskAnalytics(period = 'today') {
    try {
        let dateFilter = "DATE(timestamp) = DATE('now')";
        
        if (period === 'week') {
            dateFilter = "timestamp >= datetime('now', '-7 days')";
        } else if (period === 'month') {
            dateFilter = "timestamp >= datetime('now', '-30 days')";
        }

        const stats = await db.all(`
            SELECT 
                service_id,
                language,
                device_type,
                COUNT(*) as ticket_count,
                AVG(estimated_wait) as avg_estimated_wait,
                COUNT(DISTINCT DATE(timestamp)) as active_days
            FROM kiosk_analytics 
            WHERE ${dateFilter}
            GROUP BY service_id, language, device_type
            ORDER BY ticket_count DESC
        `);

        const summary = await db.get(`
            SELECT 
                COUNT(*) as total_tickets,
                COUNT(DISTINCT language) as languages_used,
                COUNT(DISTINCT device_type) as device_types,
                AVG(estimated_wait) as avg_wait_time
            FROM kiosk_analytics 
            WHERE ${dateFilter}
        `);

        return {
            period,
            summary: summary || {
                total_tickets: 0,
                languages_used: 0,
                device_types: 0,
                avg_wait_time: 0
            },
            breakdown: stats
        };
    } catch (error) {
        console.error('Error getting kiosk analytics:', error);
        throw error;
    }
}

// ===================================================================
// HTTP ROUTES
// ===================================================================

// Serve kiosk interface
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/kiosk/index.html'));
});

// Get kiosk configuration
router.get('/api/config', async (req, res) => {
    try {
        const config = await getKioskConfiguration();
        res.json(config);
    } catch (error) {
        console.error('Error loading kiosk config:', error);
        res.status(500).json({ 
            error: 'Failed to load kiosk configuration',
            message: error.message 
        });
    }
});

// Issue ticket from kiosk
router.post('/api/ticket', async (req, res) => {
    try {
        const { serviceId, language = 'en' } = req.body;
        
        if (!serviceId) {
            return res.status(400).json({ 
                error: 'Service ID is required' 
            });
        }

        // Get device info from request
        const deviceInfo = {
            type: req.headers['x-device-type'] || 'kiosk',
            resolution: req.headers['x-screen-resolution'] || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown'
        };

        const result = await issueKioskTicket(serviceId, language, deviceInfo);
        res.json(result);

    } catch (error) {
        console.error('Error issuing kiosk ticket:', error);
        res.status(500).json({ 
            error: 'Failed to issue ticket',
            message: error.message 
        });
    }
});

// Get real-time queue status
router.get('/api/queue', async (req, res) => {
    try {
        const { serviceId } = req.query; // Change from :serviceId? to query parameter
        
        let query = `
            SELECT 
                s.id as service_id,
                s.name as service_name,
                s.prefix,
                s.current_number,
                COUNT(CASE WHEN t.state = 'waiting' THEN 1 END) as waiting_count,
                COUNT(CASE WHEN t.state = 'called' THEN 1 END) as called_count,
                COUNT(CASE WHEN t.state = 'serving' THEN 1 END) as serving_count
            FROM services s
            LEFT JOIN tickets t ON s.id = t.service_id 
                AND DATE(t.issued_at) = DATE('now')
            WHERE s.is_active = 1
        `;
        
        let params = [];
        
        if (serviceId) {
            query += ' AND s.id = ?';
            params.push(serviceId);
        }
        
        query += ' GROUP BY s.id, s.name, s.prefix, s.current_number ORDER BY s.id';
        
        const queueStatus = await db.all(query, params);
        
        res.json({
            timestamp: new Date().toISOString(),
            queues: queueStatus
        });
        
    } catch (error) {
        console.error('Error getting queue status:', error);
        res.status(500).json({ 
            error: 'Failed to get queue status',
            message: error.message 
        });
    }
});

// Add specific route for single service (alternative)
router.get('/api/queue/:serviceId', async (req, res) => {
    try {
        const { serviceId } = req.params;
        
        const query = `
            SELECT 
                s.id as service_id,
                s.name as service_name,
                s.prefix,
                s.current_number,
                COUNT(CASE WHEN t.state = 'waiting' THEN 1 END) as waiting_count,
                COUNT(CASE WHEN t.state = 'called' THEN 1 END) as called_count,
                COUNT(CASE WHEN t.state = 'serving' THEN 1 END) as serving_count
            FROM services s
            LEFT JOIN tickets t ON s.id = t.service_id 
                AND DATE(t.issued_at) = DATE('now')
            WHERE s.is_active = 1 AND s.id = ?
            GROUP BY s.id, s.name, s.prefix, s.current_number
        `;
        
        const queueStatus = await db.all(query, [serviceId]);
        
        res.json({
            timestamp: new Date().toISOString(),
            queues: queueStatus
        });
        
    } catch (error) {
        console.error('Error getting queue status:', error);
        res.status(500).json({ 
            error: 'Failed to get queue status',
            message: error.message 
        });
    }
});

// Get kiosk analytics
router.get('/api/analytics', async (req, res) => {
    try {
        const { period = 'today' } = req.query;
        const analytics = await getKioskAnalytics(period);
        res.json(analytics);
    } catch (error) {
        console.error('Error getting kiosk analytics:', error);
        res.status(500).json({ 
            error: 'Failed to get analytics',
            message: error.message 
        });
    }
});

// Health check endpoint
router.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        surface: 'kiosk',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.env.npm_package_version || '1.0.0'
    });
});

// Update kiosk settings (admin only)
router.post('/api/settings', async (req, res) => {
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

        // Emit settings update to all connected kiosks
        const io = req.app.get('io'); // Get Socket.IO instance from app
        if (io) {
            io.emit('kiosk:settings-updated', {
                globalLanguage,
                allowLanguageOverride,
                displaySettings: {
                    showRWT,
                    showEWT,
                    showQueueCount,
                    showDescriptions
                }
            });
        }

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

// Error handling middleware for kiosk routes
router.use((error, req, res, next) => {
    console.error('Kiosk route error:', error);
    res.status(500).json({
        error: 'Internal server error',
        surface: 'kiosk',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;