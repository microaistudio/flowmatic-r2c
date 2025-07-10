// File: /src/routes/debug.js
// Version: 2.0.0
// Created: 2025-07-06
// Updated: Enhanced with proper state management APIs
// Purpose: Debug endpoints for console operations
// Phase: 2 - Queue Operations

const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const { STATES } = require('../models/StateManager');

// Get recent tickets
router.get('/recent-tickets', async (req, res) => {
    try {
        const tickets = await db.getAll(`
            SELECT t.*, s.name as service_name, s.prefix 
            FROM tickets t
            LEFT JOIN services s ON t.service_id = s.id
            ORDER BY t.issued_at DESC
            LIMIT 20
        `);
        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get table data
router.get('/table/:tableName', async (req, res) => {
    const { tableName } = req.params;
    
    // Whitelist tables for security
    const allowedTables = ['tickets', 'services', 'counters', 'agents', 'sessions'];
    if (!allowedTables.includes(tableName)) {
        return res.status(400).json({ error: 'Invalid table name' });
    }
    
    try {
        const data = await db.getAll(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 100`);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Execute custom query - ENHANCED to support UPDATE/INSERT for DEV
router.post('/query', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: 'Query required' });
    }
    
    const upperQuery = query.trim().toUpperCase();
    const isSelect = upperQuery.startsWith('SELECT');
    
    try {
        if (isSelect) {
            const data = await db.getAll(query);
            res.json(data);
        } else {
            // For UPDATE/INSERT/DELETE - use transaction
            await db.run('BEGIN TRANSACTION');
            try {
                const result = await db.run(query);
                await db.run('COMMIT');
                res.json({ 
                    success: true, 
                    changes: result.changes,
                    lastID: result.lastID,
                    message: `Query executed successfully. Rows affected: ${result.changes}`
                });
            } catch (innerError) {
                await db.run('ROLLBACK');
                throw innerError;
            }
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============= NEW DEBUG APIS FOR PROPER STATE MANAGEMENT =============

// Move single ticket to waiting state
router.post('/ticket/activate/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    
    try {
        await db.run('BEGIN TRANSACTION');
        try {
            const result = await db.run(
                `UPDATE tickets SET state = ? WHERE id = ? AND state = ?`,
                [STATES.WAITING, ticketId, STATES.ISSUED]
            );
            
            await db.run('COMMIT');
            
            res.json({ 
                success: true, 
                message: `Ticket ${ticketId} activated to waiting state`,
                changes: result.changes
            });
        } catch (innerError) {
            await db.run('ROLLBACK');
            throw innerError;
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Move single ticket to serving state (for testing)
router.post('/ticket/start-serving/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    
    try {
        await db.run('BEGIN TRANSACTION');
        try {
            const result = await db.run(
                `UPDATE tickets 
                 SET state = ?, served_at = datetime('now') 
                 WHERE id = ? AND state = ?`,
                [STATES.SERVING, ticketId, STATES.CALLED]
            );
            
            await db.run('COMMIT');
            
            res.json({ 
                success: true, 
                message: `Ticket ${ticketId} moved to serving state`,
                changes: result.changes
            });
        } catch (innerError) {
            await db.run('ROLLBACK');
            throw innerError;
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk activate all issued tickets
router.post('/queue/activate-all', async (req, res) => {
    try {
        await db.run('BEGIN TRANSACTION');
        try {
            const result = await db.run(
                `UPDATE tickets SET state = ? WHERE state = ?`,
                [STATES.WAITING, STATES.ISSUED]
            );
            
            await db.run('COMMIT');
            
            res.json({ 
                success: true, 
                message: `Activated ${result.changes} tickets to waiting state`,
                changes: result.changes
            });
        } catch (innerError) {
            await db.run('ROLLBACK');
            throw innerError;
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset entire queue (end all active tickets) - FIXED: No nested transactions
router.post('/queue/reset-all', async (req, res) => {
    try {
        // No manual transaction management - let each statement be atomic
        
        // End all active tickets
        const result = await db.run(`
            UPDATE tickets 
            SET state = ?, ended_at = datetime('now'), is_no_show = 1
            WHERE state IN (?, ?, ?, ?)
        `, [STATES.ENDED, STATES.ISSUED, STATES.WAITING, STATES.CALLED, STATES.SERVING]);
        
        // Reset service counters
        await db.run(`UPDATE services SET current_number = 0`);
        
        // Get stats for response
        const stats = await db.get(`
            SELECT 
                (SELECT COUNT(*) FROM tickets WHERE DATE(issued_at) = DATE('now')) as today_total,
                (SELECT COUNT(*) FROM tickets WHERE state = 'ended' AND DATE(issued_at) = DATE('now')) as ended_today
        `);
        
        res.json({ 
            success: true, 
            message: `Reset complete. Ended ${result.changes} active tickets`,
            changes: result.changes,
            stats: {
                tickets_ended: stats.ended_today,
                total_today: stats.today_total
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create test data (5 waiting tickets)
router.post('/queue/create-test-data', async (req, res) => {
    const { service_id = 1, count = 5 } = req.body;
    
    try {
        await db.run('BEGIN TRANSACTION');
        try {
            const tickets = [];
            for (let i = 0; i < count; i++) {
                // Get next number
                const service = await db.getOne('SELECT * FROM services WHERE id = ?', [service_id]);
                const nextNumber = (service.current_number || 0) + 1;
                const ticketNumber = `${service.prefix}${String(nextNumber).padStart(3, '0')}`;
                
                // Create ticket directly in waiting state
                const result = await db.run(`
                    INSERT INTO tickets (number, state, service_id, issued_at)
                    VALUES (?, ?, ?, datetime('now'))
                `, [ticketNumber, STATES.WAITING, service_id]);
                
                // Update service counter
                await db.run(
                    'UPDATE services SET current_number = ? WHERE id = ?',
                    [nextNumber, service_id]
                );
                
                tickets.push({ id: result.lastID, number: ticketNumber });
            }
            
            await db.run('COMMIT');
            
            res.json({ 
                success: true, 
                message: `Created ${count} test tickets in waiting state`,
                tickets: tickets
            });
        } catch (innerError) {
            await db.run('ROLLBACK');
            throw innerError;
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Auto-flow a ticket through states (for testing complete flow)
router.post('/ticket/auto-flow/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    const { targetState = STATES.SERVING } = req.body;
    
    try {
        await db.run('BEGIN TRANSACTION');
        try {
            const ticket = await db.getOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);
            if (!ticket) {
                throw new Error('Ticket not found');
            }
            
            let updates = 0;
            
            // Move through states as needed
            if (ticket.state === STATES.ISSUED && [STATES.WAITING, STATES.CALLED, STATES.SERVING].includes(targetState)) {
                await db.run('UPDATE tickets SET state = ? WHERE id = ?', [STATES.WAITING, ticketId]);
                updates++;
            }
            
            if (ticket.state === STATES.WAITING && [STATES.CALLED, STATES.SERVING].includes(targetState)) {
                await db.run('UPDATE tickets SET state = ?, called_at = datetime("now") WHERE id = ?', [STATES.CALLED, ticketId]);
                updates++;
            }
            
            if ([ticket.state, STATES.CALLED].includes(ticket.state) && targetState === STATES.SERVING) {
                await db.run('UPDATE tickets SET state = ?, served_at = datetime("now") WHERE id = ?', [STATES.SERVING, ticketId]);
                updates++;
            }
            
            await db.run('COMMIT');
            
            const updatedTicket = await db.getOne('SELECT * FROM tickets WHERE id = ?', [ticketId]);
            
            res.json({ 
                success: true, 
                message: `Ticket ${ticket.number} auto-flowed to ${targetState}`,
                updates: updates,
                ticket: updatedTicket
            });
        } catch (innerError) {
            await db.run('ROLLBACK');
            throw innerError;
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get queue statistics
router.get('/queue-stats/:serviceId', async (req, res) => {
    const { serviceId } = req.params;
    
    try {
        const stats = await db.getOne(`
            SELECT 
                SUM(CASE WHEN state = 'waiting' THEN 1 ELSE 0 END) as waiting,
                SUM(CASE WHEN state = 'called' THEN 1 ELSE 0 END) as called,
                SUM(CASE WHEN state = 'serving' THEN 1 ELSE 0 END) as serving,
                COUNT(*) as total_active
            FROM tickets
            WHERE service_id = ? AND state NOT IN ('ended', 'issued')
        `, [serviceId]);
        
        res.json(stats || { waiting: 0, called: 0, serving: 0, total_active: 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get system health
router.get('/health', async (req, res) => {
    try {
        // Test database connection
        await db.getOne('SELECT 1 as test');
        
        // Get basic stats
        const ticketCount = await db.getOne('SELECT COUNT(*) as count FROM tickets');
        const todayCount = await db.getOne(`
            SELECT COUNT(*) as count FROM tickets 
            WHERE date(issued_at) = date('now')
        `);
        
        res.json({
            status: 'healthy',
            database: 'connected',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            tickets: {
                total: ticketCount.count,
                today: todayCount.count
            }
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error',
            error: error.message 
        });
    }
});

module.exports = router;