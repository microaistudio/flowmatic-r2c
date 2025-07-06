// FlowMatic-SOLO R2C - Printer API Routes
// File: /src/routes/printer.js
// Phase 1: Printer management endpoints

const express = require('express');
const router = express.Router();
const printer = require('../printer/driver');
const db = require('../database/connection');

/**
 * GET /api/printer/status - Check printer status
 */
router.get('/printer/status', async (req, res) => {
    try {
        const status = await printer.getStatus();
        res.json({
            success: true,
            printer: status
        });
    } catch (error) {
        console.error('❌ Error checking printer status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check printer status',
            message: error.message
        });
    }
});

/**
 * POST /api/printer/test - Print test page
 */
router.post('/printer/test', async (req, res) => {
    try {
        console.log('🖨️  Printing test page...');
        const result = await printer.testPrinter();
        
        res.json({
            success: true,
            message: 'Test page sent to printer',
            result
        });
    } catch (error) {
        console.error('❌ Error printing test page:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to print test page',
            message: error.message
        });
    }
});

/**
 * POST /api/printer/ticket/:id - Print specific ticket
 */
router.post('/printer/ticket/:id', async (req, res) => {
    try {
        const ticketId = req.params.id;
        
        // Get ticket from database
        const ticket = await db.getOne(
            'SELECT * FROM tickets WHERE id = ?',
            [ticketId]
        );
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        console.log(`🖨️  Printing ticket ${ticket.number}...`);
        
        // Print the ticket
        const result = await printer.printTicket(ticket);
        
        // Mark ticket as printed
        await db.run(
            'UPDATE tickets SET printed = 1 WHERE id = ?',
            [ticketId]
        );
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} sent to printer`,
            ticket: {
                id: ticket.id,
                number: ticket.number,
                printed: true
            }
        });
        
    } catch (error) {
        console.error('❌ Error printing ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to print ticket',
            message: error.message
        });
    }
});

/**
 * POST /api/printer/last - Print the last issued ticket
 */
router.post('/printer/last', async (req, res) => {
    try {
        // Get the last ticket
        const ticket = await db.getOne(
            'SELECT * FROM tickets ORDER BY id DESC LIMIT 1'
        );
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'No tickets found'
            });
        }
        
        console.log(`🖨️  Printing last ticket ${ticket.number}...`);
        
        // Print the ticket
        const result = await printer.printTicket(ticket);
        
        // Mark ticket as printed
        await db.run(
            'UPDATE tickets SET printed = 1 WHERE id = ?',
            [ticket.id]
        );
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} sent to printer`,
            ticket: {
                id: ticket.id,
                number: ticket.number,
                printed: true
            }
        });
        
    } catch (error) {
        console.error('❌ Error printing last ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to print ticket',
            message: error.message
        });
    }
});

module.exports = router;
