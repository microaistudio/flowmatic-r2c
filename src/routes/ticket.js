// FlowMatic-SOLO R2C - Ticket API Routes
// File: /src/routes/ticket.js
// Phase 1: Ticket Printer System
// Handles ticket issuance endpoints
// FIXED: Now respects service prefixes

const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const printer = require('../printer/driver');

// Get configuration from environment
const config = {
    defaultPrefix: process.env.TICKET_PREFIX_DEFAULT || 'A',
    startNumber: parseInt(process.env.TICKET_START_NUMBER) || 1,
    padding: parseInt(process.env.TICKET_PADDING) || 3,
    resetDaily: process.env.TICKET_RESET_DAILY === 'true'
};

/**
 * POST /api/ticket - Issue a new ticket
 * Body: { service_id?: number } (optional, defaults to 1)
 */
router.post('/', async (req, res) => {
    try {
        const serviceId = req.body.service_id || 1;

        console.log(`📎 Issuing new ticket for service ${serviceId}`);

        // FIXED: Get service details including prefix
        const service = await db.getOne(
            'SELECT * FROM services WHERE id = ?',
            [serviceId]
        );

        if (!service) {
            return res.status(400).json({
                success: false,
                error: `Service ${serviceId} not found`
            });
        }

        // Use service's prefix instead of default
        const prefix = service.prefix || config.defaultPrefix;

        // Get the next number from service's current_number
        const nextNumber = (service.current_number || 0) + 1;

        // Format ticket number with padding (A001, B001, V001, T001, etc.)
        const ticketNumber = prefix + nextNumber.toString().padStart(config.padding, '0');

        // Start transaction to ensure atomicity
        await db.run('BEGIN TRANSACTION');

        try {
            // Insert new ticket with both issued_at and created_date
            const result = await db.run(`
                INSERT INTO tickets (number, state, service_id, printed, created_date)
                VALUES (?, ?, ?, ?, date('now'))
            `, [ticketNumber, 'issued', serviceId, false]);

            // Update service's current_number
            await db.run(
                'UPDATE services SET current_number = ? WHERE id = ?',
                [nextNumber, serviceId]
            );

            // Commit transaction
            await db.run('COMMIT');

            // Get the complete ticket record - use the ticket number to find it
            const ticket = await db.getOne(
                'SELECT * FROM tickets WHERE number = ? ORDER BY id DESC LIMIT 1',
                [ticketNumber]
            );

            if (!ticket) {
                throw new Error('Failed to retrieve created ticket');
            }

            console.log(`✅ Issued ticket: ${ticketNumber} for service ${service.name}`);

            // Return ticket info
            res.status(201).json({
                success: true,
                ticket: {
                    id: ticket.id,
                    number: ticket.number,
                    state: ticket.state,
                    service_id: ticket.service_id,
                    issued_at: ticket.issued_at,
                    printed: false
                },
                message: `Ticket ${ticketNumber} issued successfully`
            });

        } catch (error) {
            // Only rollback if transaction is active
            try {
                await db.run('ROLLBACK');
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
            throw error;
        }

    } catch (error) {
        console.error('❌ Error issuing ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to issue ticket',
            message: error.message
        });
    }
});

/**
 * GET /api/ticket/current - Get current ticket count for default service
 */
router.get('/current', async (req, res) => {
    try {
        const serviceId = 1; // Default service
        const today = new Date().toISOString().split('T')[0];

        // Get service info
        const service = await db.getOne(
            'SELECT * FROM services WHERE id = ?',
            [serviceId]
        );

        if (!service) {
            return res.status(404).json({
                success: false,
                error: `Service ${serviceId} not found`
            });
        }

        res.json({
            success: true,
            service: service.name,
            prefix: service.prefix,
            date: today,
            total_tickets: 0,
            last_number: service.current_number || 0,
            next_number: (service.current_number || 0) + 1
        });

    } catch (error) {
        console.error('❌ Error getting ticket stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get ticket statistics'
        });
    }
});

/**
 * GET /api/ticket/current/:serviceId - Get current ticket count for service
 * GET /api/ticket/current - Get current ticket count for default service
 */
router.get('/current/:serviceId', async (req, res) => {
    try {
        const serviceId = req.params.serviceId;
        const today = new Date().toISOString().split('T')[0];

        // Get service info
        const service = await db.getOne(
            'SELECT * FROM services WHERE id = ?',
            [serviceId]
        );

        if (!service) {
            return res.status(404).json({
                success: false,
                error: `Service ${serviceId} not found`
            });
        }

        // Get stats for this service
        const stats = await db.getOne(`
            SELECT
                COUNT(*) as total,
                MAX(CAST(SUBSTR(number, 2) AS INTEGER)) as last_number
            FROM tickets
            WHERE date(issued_at) = date(?)
            AND service_id = ?
        `, [today, serviceId]);

        res.json({
            success: true,
            service: service.name,
            prefix: service.prefix,
            date: today,
            total_tickets: stats.total,
            last_number: service.current_number || 0,
            next_number: (service.current_number || 0) + 1
        });

    } catch (error) {
        console.error('❌ Error getting ticket stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get ticket statistics'
        });
    }
});

/**
 * GET /api/ticket/:id - Get specific ticket by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const ticket = await db.getOne(
            'SELECT * FROM tickets WHERE id = ?',
            [req.params.id]
        );

        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }

        res.json({
            success: true,
            ticket
        });

    } catch (error) {
        console.error('❌ Error getting ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get ticket'
        });
    }
});

module.exports = router;