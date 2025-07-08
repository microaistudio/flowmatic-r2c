// File: /src/routes/queue.js
// Core queue operations - CRITICAL: Routes own transactions!
// UPDATED: Timezone support from .env

const express = require('express');
const router = express.Router();
const { StateManager, STATES, TRANSITIONS } = require('../models/StateManager');
const { getSQLiteTimeFunction } = require('../utils/timezone');

// Get database connection
const db = require('../database/connection');

// Test route to verify queue routes are loaded
router.get('/test', (req, res) => {
    res.json({ message: 'Queue routes are working!', timestamp: new Date() });
});

/**
 * POST /api/queue/next
 * Call the next ticket in queue (FIFO by issued_at)
 * CRITICAL: Atomic operation with EXCLUSIVE lock
 */
router.post('/next', async (req, res) => {
    const { service_id = 1, counter_id = 1, agent_id = 1 } = req.body;
    
    try {
        // CRITICAL: Route owns the transaction!
        await db.run('BEGIN EXCLUSIVE TRANSACTION');
        
        // Get next ticket in queue (FIFO by issued_at, not number!)
        const ticket = await db.getOne(`
            SELECT * FROM tickets 
            WHERE service_id = ? AND state = ?
            ORDER BY issued_at ASC
            LIMIT 1
        `, [service_id, STATES.WAITING]);
        
        if (!ticket) {
            await db.run('ROLLBACK');
            return res.json({ 
                success: false, 
                message: 'No tickets in queue' 
            });
        }
        
        // Validate state transition
        const validation = StateManager.validateTransition(ticket, TRANSITIONS.CALL_NEXT);
        if (!validation.valid) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: validation.error 
            });
        }
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Update ticket state atomically with timezone-aware timestamp
        await db.run(`
            UPDATE tickets 
            SET state = ?, called_at = ${timeFunc}, counter_id = ?, agent_id = ?
            WHERE id = ?
        `, [
            validation.updates.state,
            counter_id,
            agent_id,
            ticket.id
        ]);
        
        // Log the event with timezone-aware timestamp
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, counter_id, agent_id, details, created_at)
            VALUES (?, ?, ?, ?, ?, ${timeFunc})
        `, ['ticket_called', ticket.id, counter_id, agent_id, JSON.stringify({
            service_id,
            ticket_number: ticket.number
        })]);
        
        // Commit the transaction
        await db.run('COMMIT');
        
        // Get updated ticket
        const updatedTicket = await db.getOne('SELECT * FROM tickets WHERE id = ?', [ticket.id]);
        
        res.json({
            success: true,
            ticket: updatedTicket,
            message: `Called ticket ${ticket.number}`
        });
        
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in /next:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/queue/recall
 * Send recall notification (no state change)
 */
router.post('/recall', async (req, res) => {
    const { ticket_id } = req.body;
    
    if (!ticket_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'ticket_id required' 
        });
    }
    
    try {
        const ticket = await db.getOne('SELECT * FROM tickets WHERE id = ?', [ticket_id]);
        
        if (!ticket) {
            return res.status(404).json({ 
                success: false, 
                error: 'Ticket not found' 
            });
        }
        
        // Validate this is a recall (no state change)
        const validation = StateManager.validateTransition(ticket, TRANSITIONS.RECALL);
        if (!validation.valid) {
            return res.status(400).json({ 
                success: false, 
                error: validation.error 
            });
        }
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Log the recall event with timezone-aware timestamp (no transaction needed - single operation)
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, details, created_at)
            VALUES (?, ?, ?, ${timeFunc})
        `, ['ticket_recalled', ticket_id, JSON.stringify({
            ticket_number: ticket.number,
            counter_id: ticket.counter_id
        })]);
        
        res.json({
            success: true,
            message: `Recall sent for ticket ${ticket.number}`,
            ticket
        });
        
    } catch (error) {
        console.error('Error in /recall:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/queue/no-show
 * Mark ticket as no-show (customer absent)
 */
router.post('/no-show', async (req, res) => {
    const { ticket_id } = req.body;
    
    if (!ticket_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'ticket_id required' 
        });
    }
    
    try {
        await db.run('BEGIN EXCLUSIVE TRANSACTION');
        
        const ticket = await db.getOne('SELECT * FROM tickets WHERE id = ?', [ticket_id]);
        
        if (!ticket) {
            await db.run('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'Ticket not found' 
            });
        }
        
        // Validate state transition
        const validation = StateManager.validateTransition(ticket, TRANSITIONS.NO_SHOW);
        if (!validation.valid) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: validation.error 
            });
        }
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Update ticket with timezone-aware timestamp
        await db.run(`
            UPDATE tickets 
            SET state = ?, ended_at = ${timeFunc}, is_no_show = ?, transaction_completed = ?
            WHERE id = ?
        `, [
            validation.updates.state,
            validation.updates.is_no_show,
            validation.updates.transaction_completed,
            ticket_id
        ]);
        
        // Free up the counter if assigned
        if (ticket.counter_id) {
            await db.run(`
                UPDATE counters 
                SET current_ticket_id = NULL, state = 'available'
                WHERE id = ?
            `, [ticket.counter_id]);
        }
        
        // Log event with timezone-aware timestamp
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, details, created_at)
            VALUES (?, ?, ?, ${timeFunc})
        `, ['ticket_no_show', ticket_id, JSON.stringify({
            ticket_number: ticket.number,
            counter_id: ticket.counter_id
        })]);
        
        await db.run('COMMIT');
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} marked as no-show`
        });
        
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in /no-show:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/queue/end
 * Complete transaction successfully
 */
router.post('/end', async (req, res) => {
    const { ticket_id } = req.body;
    
    if (!ticket_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'ticket_id required' 
        });
    }
    
    try {
        await db.run('BEGIN EXCLUSIVE TRANSACTION');
        
        const ticket = await db.getOne('SELECT * FROM tickets WHERE id = ?', [ticket_id]);
        
        if (!ticket) {
            await db.run('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'Ticket not found' 
            });
        }
        
        // Must be in SERVING state to complete
        if (ticket.state !== STATES.SERVING) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: `Cannot complete ticket in ${ticket.state} state` 
            });
        }
        
        // Validate state transition
        const validation = StateManager.validateTransition(ticket, TRANSITIONS.COMPLETE);
        if (!validation.valid) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: validation.error 
            });
        }
        
        // Calculate service duration
        const servedAt = new Date(ticket.served_at);
        const endedAt = new Date();
        const serviceDuration = Math.floor((endedAt - servedAt) / 1000); // seconds
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Update ticket with timezone-aware timestamp
        await db.run(`
            UPDATE tickets 
            SET state = ?, ended_at = ${timeFunc}, is_no_show = ?, transaction_completed = ?, service_duration = ?
            WHERE id = ?
        `, [
            validation.updates.state,
            validation.updates.is_no_show,
            validation.updates.transaction_completed,
            serviceDuration,
            ticket_id
        ]);
        
        // Free up the counter
        if (ticket.counter_id) {
            await db.run(`
                UPDATE counters 
                SET current_ticket_id = NULL, state = 'available'
                WHERE id = ?
            `, [ticket.counter_id]);
        }
        
        // Log event with timezone-aware timestamp
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, details, created_at)
            VALUES (?, ?, ?, ${timeFunc})
        `, ['ticket_completed', ticket_id, JSON.stringify({
            ticket_number: ticket.number,
            counter_id: ticket.counter_id,
            service_duration: serviceDuration
        })]);
        
        await db.run('COMMIT');
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} completed successfully`,
            service_duration: serviceDuration
        });
        
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in /end:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * GET /api/queue/:serviceId
 * Get current queue for a service
 */
router.get('/:serviceId', async (req, res) => {
    const { serviceId } = req.params;
    
    try {
        const waitingTickets = await db.getAll(`
            SELECT * FROM tickets 
            WHERE service_id = ? AND state = ?
            ORDER BY issued_at ASC
        `, [serviceId, STATES.WAITING]);
        
        const calledTickets = await db.getAll(`
            SELECT * FROM tickets 
            WHERE service_id = ? AND state = ?
            ORDER BY called_at DESC
            LIMIT 5
        `, [serviceId, STATES.CALLED]);
        
        const servingTickets = await db.getAll(`
            SELECT * FROM tickets 
            WHERE service_id = ? AND state = ?
        `, [serviceId, STATES.SERVING]);
        
        res.json({
            success: true,
            queue: {
                waiting: waitingTickets,
                called: calledTickets,
                serving: servingTickets,
                stats: {
                    waiting_count: waitingTickets.length,
                    avg_wait_time: 0 // TODO: Calculate
                }
            }
        });
        
    } catch (error) {
        console.error('Error getting queue:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = router;