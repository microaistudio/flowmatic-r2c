// FlowMatic-SOLO R2C - Ticket API Routes
// File: /src/routes/ticket.js
// Phase 1: Ticket Printer System
// Handles ticket issuance endpoints

const express = require('express');
const router = express.Router();
const db = require('../database/connection');

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
router.post('/ticket', async (req, res) => {
    try {
        // For Phase 1, we use default service (1) and prefix (A)
        const serviceId = req.body.service_id || 1;
        const prefix = config.defaultPrefix;

        console.log(`📎 Issuing new ticket for service ${serviceId}`);

        // Get today's date for daily reset check
        const today = new Date().toISOString().split('T')[0];

        // Get the last ticket number for today
        const lastTicket = await db.getOne(`
            SELECT number
            FROM tickets
            WHERE date(issued_at) = date(?)
            AND number LIKE ?
            ORDER BY id DESC
            LIMIT 1
        `, [today, prefix + '%']);

        // Calculate next number
        let nextNumber = config.startNumber;
        if (lastTicket) {
            // Extract number from format like 'A001'
            const currentNum = parseInt(lastTicket.number.substring(1));
            nextNumber = currentNum + 1;
        }

        // Format ticket number with padding (A001, A002, etc.)
        const ticketNumber = prefix + nextNumber.toString().padStart(config.padding, '0');

        // Insert new ticket with both issued_at and created_date
        const result = await db.run(`
            INSERT INTO tickets (number, state, service_id, printed, created_date)
            VALUES (?, ?, ?, ?, date('now'))
        `, [ticketNumber, 'issued', serviceId, false]);

        // Get the complete ticket record
        const ticket = await db.getOne(
            'SELECT * FROM tickets WHERE id = ?',
            [result.id]
        );

        console.log(`✅ Issued ticket: ${ticketNumber}`);

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
        console.error('❌ Error issuing ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to issue ticket',
            message: error.message
        });
    }
});

/**
 * GET /api/ticket/current - Get current ticket count for today
 */
router.get('/ticket/current', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const stats = await db.getOne(`
            SELECT
                COUNT(*) as total,
                MAX(CAST(SUBSTR(number, 2) AS INTEGER)) as last_number
            FROM tickets
            WHERE date(issued_at) = date(?)
        `, [today]);

        res.json({
            success: true,
            date: today,
            total_tickets: stats.total,
            last_number: stats.last_number || 0,
            next_number: (stats.last_number || 0) + 1
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
router.get('/ticket/:id', async (req, res) => {
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