// File: /flowmatic-r2c/src/routes/reports.js
// Purpose: Reporting endpoints for queue statistics
// Created: 2025-07-10
// Phase: 4 - Advanced Features

const express = require('express');
const router = express.Router();
const db = require('../database/connection');

// GET /api/reports/daily - Daily summary report
router.get('/daily', async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        
        // Get daily statistics
        const stats = await db.getOne(`
            SELECT 
                COUNT(*) as total_tickets,
                SUM(CASE WHEN state = 'ended' AND transaction_completed = 1 THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN is_no_show = 1 THEN 1 ELSE 0 END) as no_shows,
                AVG(CASE 
                    WHEN served_at IS NOT NULL AND called_at IS NOT NULL 
                    THEN (julianday(served_at) - julianday(called_at)) * 24 * 60 
                    ELSE NULL 
                END) as avg_wait_minutes,
                AVG(CASE 
                    WHEN ended_at IS NOT NULL AND served_at IS NOT NULL 
                    THEN (julianday(ended_at) - julianday(served_at)) * 24 * 60 
                    ELSE NULL 
                END) as avg_service_minutes
            FROM tickets
            WHERE DATE(issued_at) = ?
        `, [date]);

        // Get hourly distribution
        const hourly = await db.getAll(`
            SELECT 
                strftime('%H', issued_at) as hour,
                COUNT(*) as count
            FROM tickets
            WHERE DATE(issued_at) = ?
            GROUP BY hour
            ORDER BY hour
        `, [date]);

        // Get service breakdown
        const byService = await db.getAll(`
            SELECT 
                s.name as service_name,
                s.prefix,
                COUNT(t.id) as total,
                SUM(CASE WHEN t.state = 'ended' AND t.transaction_completed = 1 THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN t.is_no_show = 1 THEN 1 ELSE 0 END) as no_shows
            FROM services s
            LEFT JOIN tickets t ON s.id = t.service_id AND DATE(t.issued_at) = ?
            GROUP BY s.id, s.name, s.prefix
        `, [date]);

        res.json({
            date,
            summary: {
                total_tickets: stats.total_tickets || 0,
                completed: stats.completed || 0,
                no_shows: stats.no_shows || 0,
                completion_rate: stats.total_tickets > 0 ? 
                    ((stats.completed / stats.total_tickets) * 100).toFixed(1) : 0,
                avg_wait_time: stats.avg_wait_minutes ? 
                    Math.round(stats.avg_wait_minutes) : null,
                avg_service_time: stats.avg_service_minutes ? 
                    Math.round(stats.avg_service_minutes) : null
            },
            hourly_distribution: hourly,
            by_service: byService
        });

    } catch (error) {
        console.error('Daily report error:', error);
        res.status(500).json({ error: 'Failed to generate daily report' });
    }
});

// GET /api/reports/agent/:id - Agent performance report
router.get('/agent/:id', async (req, res) => {
    try {
        const agentId = req.params.id;
        const startDate = req.query.start_date || 
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endDate = req.query.end_date || 
            new Date().toISOString().split('T')[0];

        // Get agent info
        const agent = await db.getOne(`
            SELECT id, name, username FROM agents WHERE id = ?
        `, [agentId]);

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        // Get performance stats
        const stats = await db.getOne(`
            SELECT 
                COUNT(DISTINCT t.id) as tickets_served,
                SUM(CASE WHEN t.is_no_show = 1 THEN 1 ELSE 0 END) as no_shows_marked,
                AVG(CASE 
                    WHEN t.ended_at IS NOT NULL AND t.served_at IS NOT NULL 
                    THEN (julianday(t.ended_at) - julianday(t.served_at)) * 24 * 60 
                    ELSE NULL 
                END) as avg_service_minutes,
                COUNT(DISTINCT DATE(t.served_at)) as days_worked
            FROM tickets t
            JOIN sessions s ON t.served_at BETWEEN s.login_at AND COALESCE(s.logout_at, datetime('now'))
            WHERE s.agent_id = ?
            AND DATE(t.served_at) BETWEEN ? AND ?
        `, [agentId, startDate, endDate]);

        // Get daily breakdown
        const daily = await db.getAll(`
            SELECT 
                DATE(t.served_at) as date,
                COUNT(*) as tickets,
                AVG(CASE 
                    WHEN t.ended_at IS NOT NULL AND t.served_at IS NOT NULL 
                    THEN (julianday(t.ended_at) - julianday(t.served_at)) * 24 * 60 
                    ELSE NULL 
                END) as avg_service_time
            FROM tickets t
            JOIN sessions s ON t.served_at BETWEEN s.login_at AND COALESCE(s.logout_at, datetime('now'))
            WHERE s.agent_id = ?
            AND DATE(t.served_at) BETWEEN ? AND ?
            GROUP BY DATE(t.served_at)
            ORDER BY date DESC
        `, [agentId, startDate, endDate]);

        // Get service breakdown
        const byService = await db.getAll(`
            SELECT 
                sv.name as service_name,
                COUNT(*) as count
            FROM tickets t
            JOIN sessions s ON t.served_at BETWEEN s.login_at AND COALESCE(s.logout_at, datetime('now'))
            JOIN services sv ON t.service_id = sv.id
            WHERE s.agent_id = ?
            AND DATE(t.served_at) BETWEEN ? AND ?
            GROUP BY sv.id, sv.name
        `, [agentId, startDate, endDate]);

        res.json({
            agent,
            period: { start_date: startDate, end_date: endDate },
            summary: {
                tickets_served: stats.tickets_served || 0,
                no_shows_marked: stats.no_shows_marked || 0,
                avg_service_time: stats.avg_service_minutes ? 
                    Math.round(stats.avg_service_minutes) : null,
                days_worked: stats.days_worked || 0,
                avg_tickets_per_day: stats.days_worked > 0 ? 
                    Math.round(stats.tickets_served / stats.days_worked) : 0
            },
            daily_performance: daily,
            service_distribution: byService
        });

    } catch (error) {
        console.error('Agent report error:', error);
        res.status(500).json({ error: 'Failed to generate agent report' });
    }
});

// GET /api/reports/service/:id - Service statistics report
router.get('/service/:id', async (req, res) => {
    try {
        const serviceId = req.params.id;
        const date = req.query.date || new Date().toISOString().split('T')[0];

        // Get service info
        const service = await db.getOne(`
            SELECT id, name, prefix FROM services WHERE id = ?
        `, [serviceId]);

        if (!service) {
            return res.status(404).json({ error: 'Service not found' });
        }

        // Get service stats for the day
        const stats = await db.getOne(`
            SELECT 
                COUNT(*) as total_tickets,
                SUM(CASE WHEN state = 'ended' AND transaction_completed = 1 THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN state = 'waiting' THEN 1 ELSE 0 END) as currently_waiting,
                SUM(CASE WHEN state = 'called' THEN 1 ELSE 0 END) as currently_called,
                SUM(CASE WHEN state = 'serving' THEN 1 ELSE 0 END) as currently_serving,
                SUM(CASE WHEN is_no_show = 1 THEN 1 ELSE 0 END) as no_shows,
                MIN(CASE WHEN state = 'waiting' THEN issued_at ELSE NULL END) as oldest_waiting,
                AVG(CASE 
                    WHEN called_at IS NOT NULL AND issued_at IS NOT NULL 
                    THEN (julianday(called_at) - julianday(issued_at)) * 24 * 60 
                    ELSE NULL 
                END) as avg_wait_minutes
            FROM tickets
            WHERE service_id = ?
            AND DATE(issued_at) = ?
        `, [serviceId, date]);

        // Get hourly pattern
        const hourly = await db.getAll(`
            SELECT 
                strftime('%H', issued_at) as hour,
                COUNT(*) as issued,
                SUM(CASE WHEN state = 'ended' AND transaction_completed = 1 THEN 1 ELSE 0 END) as completed
            FROM tickets
            WHERE service_id = ?
            AND DATE(issued_at) = ?
            GROUP BY hour
            ORDER BY hour
        `, [serviceId, date]);

        // Get agent activity
        const agentActivity = await db.getAll(`
            SELECT 
                a.name as agent_name,
                COUNT(DISTINCT t.id) as tickets_served,
                AVG(CASE 
                    WHEN t.ended_at IS NOT NULL AND t.served_at IS NOT NULL 
                    THEN (julianday(t.ended_at) - julianday(t.served_at)) * 24 * 60 
                    ELSE NULL 
                END) as avg_service_time
            FROM agents a
            JOIN sessions s ON a.id = s.agent_id
            JOIN tickets t ON t.served_at BETWEEN s.login_at AND COALESCE(s.logout_at, datetime('now'))
            WHERE t.service_id = ?
            AND DATE(t.served_at) = ?
            GROUP BY a.id, a.name
        `, [serviceId, date]);

        // Calculate current wait time for oldest ticket
        let estimated_wait = null;
        if (stats.oldest_waiting) {
            const waitMinutes = (new Date() - new Date(stats.oldest_waiting)) / (1000 * 60);
            estimated_wait = Math.round(waitMinutes);
        }

        res.json({
            service,
            date,
            current_status: {
                waiting: stats.currently_waiting || 0,
                called: stats.currently_called || 0,
                serving: stats.currently_serving || 0,
                oldest_waiting_time: estimated_wait
            },
            summary: {
                total_tickets: stats.total_tickets || 0,
                completed: stats.completed || 0,
                no_shows: stats.no_shows || 0,
                completion_rate: stats.total_tickets > 0 ? 
                    ((stats.completed / stats.total_tickets) * 100).toFixed(1) : 0,
                avg_wait_time: stats.avg_wait_minutes ? 
                    Math.round(stats.avg_wait_minutes) : null
            },
            hourly_pattern: hourly,
            agent_performance: agentActivity
        });

    } catch (error) {
        console.error('Service report error:', error);
        res.status(500).json({ error: 'Failed to generate service report' });
    }
});

// Test endpoint
router.get('/test', (req, res) => {
    res.json({ 
        message: 'Reports API working',
        endpoints: [
            'GET /api/reports/daily',
            'GET /api/reports/agent/:id',
            'GET /api/reports/service/:id'
        ]
    });
});

module.exports = router;