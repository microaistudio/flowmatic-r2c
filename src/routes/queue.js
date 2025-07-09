// File: /src/routes/queue.js
// Core queue operations - CRITICAL: Routes own transactions!
// UPDATED: Added Park/Unpark operations (Phase 4)
// UPDATED: Added Socket.IO event emissions

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
 * GET /api/queue/current/:counterId
 * Get current ticket being served at a counter
 * PHASE 4: Added for Queue+ functionality
 */
router.get('/current/:counterId', async (req, res) => {
    const { counterId } = req.params;
    
    try {
        // Simple query that works based on counter_id and state
        const ticket = await db.getOne(`
            SELECT * FROM tickets 
            WHERE counter_id = ? AND state = ?
        `, [counterId, STATES.SERVING]);
        
        res.json({
            success: true,
            ticket: ticket || null
        });
        
    } catch (error) {
        console.error('Error getting current ticket:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
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
        // IMPORTANT: Exclude parked tickets from queue
        const ticket = await db.getOne(`
            SELECT * FROM tickets 
            WHERE service_id = ? AND state = ? AND is_parked = false
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
        
        // Update counter's current_ticket_id
        await db.run(`
            UPDATE counters 
            SET current_ticket_id = ? 
            WHERE id = ?
        `, [ticket.id, counter_id]);
        
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
        
        // Emit Socket.IO events
        const io = req.app.get('io');
        if (io) {
            // Get counter info for broadcast
            const counter = await db.getOne('SELECT * FROM counters WHERE id = ?', [counter_id]);
            
            // Broadcast queue update
            io.broadcastQueueUpdate(service_id, 'called', updatedTicket);
            
            // Broadcast ticket call to monitors
            io.broadcastTicketCall(updatedTicket, counter);
            
            // Emit state change event
            io.to(`service-${service_id}`).emit('ticket:state-changed', {
                ticket: updatedTicket,
                oldState: STATES.WAITING,
                newState: STATES.CALLED,
                timestamp: new Date()
            });
        }
        
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
        
        // Emit Socket.IO recall event
        const io = req.app.get('io');
        if (io) {
            const counter = await db.getOne('SELECT * FROM counters WHERE id = ?', [ticket.counter_id]);
            
            io.to('monitors').emit('ticket:recalled', {
                ticket,
                counter,
                timestamp: new Date()
            });
        }
        
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
 * POST /api/queue/serve
 * Start serving a ticket (transition from called to serving)
 * PHASE 4: Added for proper state management
 */
router.post('/serve', async (req, res) => {
    const { ticket_id, agent_id, counter_id } = req.body;
    
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
        
        // Must be in CALLED state to start serving
        if (ticket.state !== STATES.CALLED) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: `Cannot start serving ticket in ${ticket.state} state. Must be in called state.` 
            });
        }
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Update ticket state
        await db.run(`
            UPDATE tickets 
            SET state = ?, served_at = ${timeFunc}
            WHERE id = ?
        `, [STATES.SERVING, ticket_id]);
        
        // Log the event
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, counter_id, agent_id, details, created_at)
            VALUES (?, ?, ?, ?, ?, ${timeFunc})
        `, ['ticket_serving_started', ticket_id, counter_id || ticket.counter_id, agent_id || ticket.agent_id, JSON.stringify({
            ticket_number: ticket.number
        })]);
        
        await db.run('COMMIT');
        
        // Get updated ticket
        const updatedTicket = await db.getOne('SELECT * FROM tickets WHERE id = ?', [ticket_id]);
        
        // Emit Socket.IO events
        const io = req.app.get('io');
        if (io) {
            io.to(`service-${ticket.service_id}`).emit('ticket:state-changed', {
                ticket: updatedTicket,
                oldState: STATES.CALLED,
                newState: STATES.SERVING,
                timestamp: new Date()
            });
        }
        
        res.json({
            success: true,
            message: `Started serving ticket ${ticket.number}`,
            ticket: updatedTicket
        });
        
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in /serve:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/queue/park
 * Park a ticket (agent's private buffer)
 * PHASE 4: New operation
 */
router.post('/park', async (req, res) => {
    const { ticket_id, agent_id, reason = 'Waiting for documents' } = req.body;
    
    if (!ticket_id || !agent_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'ticket_id and agent_id required' 
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
        
        // Can only park tickets that are being served
        if (ticket.state !== STATES.SERVING) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: `Cannot park ticket in ${ticket.state} state. Must be in serving state.` 
            });
        }
        
        // Check if already parked
        if (ticket.is_parked) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'Ticket is already parked' 
            });
        }
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Park the ticket
        await db.run(`
            UPDATE tickets 
            SET is_parked = true, 
                parked_by = ?, 
                parked_at = ${timeFunc}, 
                park_reason = ?
            WHERE id = ?
        `, [agent_id, reason, ticket_id]);
        
        // Clear counter's current_ticket_id when parking
        if (ticket.counter_id) {
            await db.run(`
                UPDATE counters 
                SET current_ticket_id = NULL 
                WHERE id = ?
            `, [ticket.counter_id]);
        }
        
        // Log the event
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, agent_id, details, created_at)
            VALUES (?, ?, ?, ?, ${timeFunc})
        `, ['ticket_parked', ticket_id, agent_id, JSON.stringify({
            ticket_number: ticket.number,
            reason: reason
        })]);
        
        await db.run('COMMIT');
        
        // Emit Socket.IO events
        const io = req.app.get('io');
        if (io) {
            io.to(`service-${ticket.service_id}`).emit('ticket:parked', {
                ticket: { ...ticket, is_parked: true, park_reason: reason },
                agent_id,
                reason,
                timestamp: new Date()
            });
        }
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} parked successfully`,
            reason: reason
        });
        
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in /park:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/queue/unpark
 * Unpark a ticket and return to queue
 * PHASE 4: New operation
 */
router.post('/unpark', async (req, res) => {
    const { ticket_id, agent_id, position = 'front' } = req.body;
    
    if (!ticket_id || !agent_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'ticket_id and agent_id required' 
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
        
        // Check if ticket is parked
        if (!ticket.is_parked) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'Ticket is not parked' 
            });
        }
        
        // Check if agent owns this parked ticket
        if (ticket.parked_by !== agent_id) {
            await db.run('ROLLBACK');
            return res.status(403).json({ 
                success: false, 
                error: 'You can only unpark tickets you parked' 
            });
        }
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Determine new issued_at based on position
        let newIssuedAt;
        if (position === 'front') {
            // Place at front of queue
            const earliestTicket = await db.getOne(`
                SELECT MIN(issued_at) as min_issued FROM tickets 
                WHERE service_id = ? AND state = ? AND is_parked = false
            `, [ticket.service_id, STATES.WAITING]);
            
            if (earliestTicket && earliestTicket.min_issued) {
                // Place 1 second before earliest ticket
                const earliest = new Date(earliestTicket.min_issued);
                earliest.setSeconds(earliest.getSeconds() - 1);
                newIssuedAt = earliest.toISOString();
            } else {
                // No tickets in queue, use current time
                newIssuedAt = new Date().toISOString();
            }
        } else {
            // Default: back of queue (current time)
            newIssuedAt = new Date().toISOString();
        }
        
        // Unpark the ticket and return to waiting state
        await db.run(`
            UPDATE tickets 
            SET is_parked = false, 
                parked_by = NULL, 
                parked_at = NULL, 
                park_reason = NULL,
                state = ?,
                issued_at = ?,
                called_at = NULL,
                served_at = NULL,
                counter_id = NULL,
                agent_id = NULL
            WHERE id = ?
        `, [STATES.WAITING, newIssuedAt, ticket_id]);
        
        // Log the event
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, agent_id, details, created_at)
            VALUES (?, ?, ?, ?, ${timeFunc})
        `, ['ticket_unparked', ticket_id, agent_id, JSON.stringify({
            ticket_number: ticket.number,
            position: position,
            new_issued_at: newIssuedAt
        })]);
        
        await db.run('COMMIT');
        
        // Emit Socket.IO events
        const io = req.app.get('io');
        if (io) {
            io.broadcastQueueUpdate(ticket.service_id, 'unparked', {
                ...ticket,
                state: STATES.WAITING,
                is_parked: false
            });
        }
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} unparked and returned to ${position} of queue`,
            position: position
        });
        
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in /unpark:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * GET /api/queue/parked/:agentId
 * Get agent's parked tickets
 * PHASE 4: New operation
 */
router.get('/parked/:agentId', async (req, res) => {
    const { agentId } = req.params;
    
    try {
        const parkedTickets = await db.getAll(`
            SELECT * FROM tickets 
            WHERE parked_by = ? AND is_parked = true
            ORDER BY parked_at DESC
        `, [agentId]);
        
        res.json({
            success: true,
            tickets: parkedTickets,
            count: parkedTickets.length
        });
        
    } catch (error) {
        console.error('Error getting parked tickets:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/queue/transfer
 * Transfer ticket to different service
 * PHASE 4: New operation
 */
router.post('/transfer', async (req, res) => {
    const { ticket_id, to_service, reason = 'Customer needs different service' } = req.body;
    
    if (!ticket_id || !to_service) {
        return res.status(400).json({ 
            success: false, 
            error: 'ticket_id and to_service required' 
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
        
        // Can only transfer tickets that are waiting or called
        if (ticket.state !== STATES.WAITING && ticket.state !== STATES.CALLED) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: `Cannot transfer ticket in ${ticket.state} state` 
            });
        }
        
        // Get the new service info
        const newService = await db.getOne('SELECT * FROM services WHERE id = ?', [to_service]);
        if (!newService) {
            await db.run('ROLLBACK');
            return res.status(404).json({ 
                success: false, 
                error: 'Target service not found' 
            });
        }
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Update ticket with transfer info
        await db.run(`
            UPDATE tickets 
            SET service_id = ?,
                transferred_from = ?,
                transferred_to = ?,
                transferred_at = ${timeFunc},
                transfer_reason = ?,
                state = ?,
                counter_id = NULL,
                agent_id = NULL
            WHERE id = ?
        `, [to_service, ticket.service_id, to_service, reason, STATES.WAITING, ticket_id]);
        
        // Log the event
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, details, created_at)
            VALUES (?, ?, ?, ${timeFunc})
        `, ['ticket_transferred', ticket_id, JSON.stringify({
            ticket_number: ticket.number,
            from_service: ticket.service_id,
            to_service: to_service,
            reason: reason
        })]);
        
        await db.run('COMMIT');
        
        // Emit Socket.IO events
        const io = req.app.get('io');
        if (io) {
            // Notify old service
            io.to(`service-${ticket.service_id}`).emit('ticket:transferred-out', {
                ticket,
                to_service,
                reason,
                timestamp: new Date()
            });
            
            // Notify new service
            io.to(`service-${to_service}`).emit('ticket:transferred-in', {
                ticket: { ...ticket, service_id: to_service },
                from_service: ticket.service_id,
                reason,
                timestamp: new Date()
            });
        }
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} transferred from service ${ticket.service_id} to service ${to_service}`,
            ticket_number: ticket.number,
            from_service: ticket.service_id,
            to_service: to_service
        });
        
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in /transfer:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

/**
 * POST /api/queue/recycle
 * Recycle ticket to strategic position in queue (3-5)
 * PHASE 4: New operation
 */
router.post('/recycle', async (req, res) => {
    const { ticket_id, position = 3 } = req.body;
    
    if (!ticket_id) {
        return res.status(400).json({ 
            success: false, 
            error: 'ticket_id required' 
        });
    }
    
    // Validate position (must be between 3-5)
    const targetPosition = Math.max(3, Math.min(5, parseInt(position) || 3));
    
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
        
        // Can only recycle tickets that are called or serving
        if (ticket.state !== STATES.CALLED && ticket.state !== STATES.SERVING) {
            await db.run('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: `Cannot recycle ticket in ${ticket.state} state` 
            });
        }
        
        // Get tickets in queue to calculate new position
        const queueTickets = await db.getAll(`
            SELECT id, issued_at FROM tickets 
            WHERE service_id = ? AND state = ? AND is_parked = false
            ORDER BY issued_at ASC
            LIMIT 10
        `, [ticket.service_id, STATES.WAITING]);
        
        // Calculate new issued_at based on target position
        let newIssuedAt;
        if (queueTickets.length >= targetPosition - 1) {
            // Place between position-1 and position
            const beforeTicket = queueTickets[targetPosition - 2];
            const afterTicket = queueTickets[targetPosition - 1];
            
            const beforeTime = new Date(beforeTicket.issued_at).getTime();
            const afterTime = new Date(afterTicket.issued_at).getTime();
            
            // Place in the middle
            newIssuedAt = new Date((beforeTime + afterTime) / 2).toISOString();
        } else {
            // Not enough tickets, place at end
            newIssuedAt = new Date().toISOString();
        }
        
        // Get timezone-aware time function
        const timeFunc = getSQLiteTimeFunction();
        
        // Update ticket
        await db.run(`
            UPDATE tickets 
            SET state = ?,
                issued_at = ?,
                recycled_count = recycled_count + 1,
                last_recycled_at = ${timeFunc},
                called_at = NULL,
                served_at = NULL,
                counter_id = NULL,
                agent_id = NULL
            WHERE id = ?
        `, [STATES.WAITING, newIssuedAt, ticket_id]);
        
        // Log the event
        await db.run(`
            INSERT INTO event_log (event_type, ticket_id, details, created_at)
            VALUES (?, ?, ?, ${timeFunc})
        `, ['ticket_recycled', ticket_id, JSON.stringify({
            ticket_number: ticket.number,
            target_position: targetPosition,
            actual_position: Math.min(targetPosition, queueTickets.length + 1)
        })]);
        
        await db.run('COMMIT');
        
        // Emit Socket.IO events
        const io = req.app.get('io');
        if (io) {
            io.broadcastQueueUpdate(ticket.service_id, 'recycled', {
                ...ticket,
                state: STATES.WAITING,
                recycled_count: ticket.recycled_count + 1
            });
        }
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} recycled to position ${targetPosition} in queue`,
            ticket_number: ticket.number,
            target_position: targetPosition,
            recycled_count: ticket.recycled_count + 1
        });
        
    } catch (error) {
        await db.run('ROLLBACK');
        console.error('Error in /recycle:', error);
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
        
        // Emit Socket.IO events
        const io = req.app.get('io');
        if (io) {
            io.to(`service-${ticket.service_id}`).emit('ticket:no-show', {
                ticket: { ...ticket, state: STATES.ENDED, is_no_show: true },
                timestamp: new Date()
            });
            
            if (ticket.counter_id) {
                io.broadcastCounterStatus(ticket.counter_id, 'available');
            }
        }
        
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
        
        // Emit Socket.IO events
        const io = req.app.get('io');
        if (io) {
            io.to(`service-${ticket.service_id}`).emit('ticket:completed', {
                ticket: { 
                    ...ticket, 
                    state: STATES.ENDED, 
                    transaction_completed: true,
                    service_duration: serviceDuration 
                },
                timestamp: new Date()
            });
            
            if (ticket.counter_id) {
                io.broadcastCounterStatus(ticket.counter_id, 'available');
            }
        }
        
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
        // IMPORTANT: Exclude parked tickets from waiting count
        const waitingTickets = await db.getAll(`
            SELECT * FROM tickets 
            WHERE service_id = ? AND state = ? AND is_parked = false
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