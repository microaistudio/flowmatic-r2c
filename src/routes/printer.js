// FlowMatic-SOLO R2C - Printer API Routes (Browser Printing)
// File: /src/routes/printer.js
// Updated: Using Opus's browser-side printing approach

const express = require('express');
const router = express.Router();
const db = require('../database/connection');

/**
 * GET /api/printer/status - Check browser printing capability
 */
router.get('/printer/status', async (req, res) => {
    try {
        // For browser printing, we just check if the client can access the API
        res.json({
            success: true,
            printer: {
                connected: true,
                type: 'Browser Printing',
                method: 'Client-side print manager',
                port: 'Browser controlled',
                note: 'Printing handled by client browser'
            }
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
 * POST /api/printer/test - Generate test ticket data for browser printing
 */
router.post('/printer/test', async (req, res) => {
    try {
        console.log('🖨️  Generating test ticket data for browser printing...');
        
        // Generate test ticket data
        const testTicketData = {
            number: 'TEST001',
            service: 'Test Service',
            serviceName: 'Printer Test Service',
            queuePosition: 1,
            estimatedWaitMinutes: 0,
            issued_at: new Date().toISOString(),
            created: new Date().toLocaleTimeString(),
            wait: '0 minutes',
            position: '1'
        };
        
        console.log('✅ Test ticket data generated for browser printing');
        
        res.json({
            success: true,
            message: 'Test ticket data ready for printing',
            printData: testTicketData,
            printMode: 'browser'
        });
        
    } catch (error) {
        console.error('❌ Error generating test ticket:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate test ticket',
            message: error.message
        });
    }
});

/**
 * POST /api/printer/ticket/:id - Get ticket data for browser printing
 */
router.post('/printer/ticket/:id', async (req, res) => {
    try {
        const ticketId = req.params.id;
        
        // Get ticket from database with service info
        const ticket = await db.getOne(`
            SELECT t.*, s.name as service_name, s.prefix 
            FROM tickets t 
            LEFT JOIN services s ON t.service_id = s.id 
            WHERE t.id = ?
        `, [ticketId]);
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'Ticket not found'
            });
        }
        
        // Get queue position
        const queuePosition = await db.getOne(`
            SELECT COUNT(*) as position 
            FROM tickets 
            WHERE service_id = ? AND state = 'waiting' AND issued_at <= ?
        `, [ticket.service_id, ticket.issued_at]);
        
        console.log(`🖨️  Preparing ticket ${ticket.number} for browser printing...`);
        
        // Prepare ticket data for browser printing
        const printData = {
            number: ticket.number,
            service: ticket.service_name || 'General Service',
            serviceName: ticket.service_name || 'General Service',
            queuePosition: queuePosition?.position || 1,
            estimatedWaitMinutes: Math.max(1, (queuePosition?.position || 1) * 3), // 3 min per person
            issued_at: ticket.issued_at,
            created: new Date(ticket.issued_at).toLocaleTimeString(),
            wait: `${Math.max(1, (queuePosition?.position || 1) * 3)} minutes`,
            position: (queuePosition?.position || 1).toString()
        };
        
        // Mark ticket as printed (browser will handle actual printing)
        await db.run(
            'UPDATE tickets SET printed = 1 WHERE id = ?',
            [ticketId]
        );
        
        console.log('✅ Ticket data prepared for browser printing');
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} ready for printing`,
            ticket: {
                id: ticket.id,
                number: ticket.number,
                printed: true
            },
            printData: printData,
            printMode: 'browser'
        });
        
    } catch (error) {
        console.error('❌ Error preparing ticket for printing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to prepare ticket for printing',
            message: error.message
        });
    }
});

/**
 * POST /api/printer/last - Get last ticket data for browser printing
 */
router.post('/printer/last', async (req, res) => {
    try {
        // Get the last ticket with service info
        const ticket = await db.getOne(`
            SELECT t.*, s.name as service_name, s.prefix 
            FROM tickets t 
            LEFT JOIN services s ON t.service_id = s.id 
            ORDER BY t.id DESC LIMIT 1
        `);
        
        if (!ticket) {
            return res.status(404).json({
                success: false,
                error: 'No tickets found'
            });
        }
        
        // Get queue position
        const queuePosition = await db.getOne(`
            SELECT COUNT(*) as position 
            FROM tickets 
            WHERE service_id = ? AND state = 'waiting' AND issued_at <= ?
        `, [ticket.service_id, ticket.issued_at]);
        
        console.log(`🖨️  Preparing last ticket ${ticket.number} for browser printing...`);
        
        // Prepare ticket data for browser printing
        const printData = {
            number: ticket.number,
            service: ticket.service_name || 'General Service',
            serviceName: ticket.service_name || 'General Service',
            queuePosition: queuePosition?.position || 1,
            estimatedWaitMinutes: Math.max(1, (queuePosition?.position || 1) * 3),
            issued_at: ticket.issued_at,
            created: new Date(ticket.issued_at).toLocaleTimeString(),
            wait: `${Math.max(1, (queuePosition?.position || 1) * 3)} minutes`,
            position: (queuePosition?.position || 1).toString()
        };
        
        // Mark ticket as printed
        await db.run(
            'UPDATE tickets SET printed = 1 WHERE id = ?',
            [ticket.id]
        );
        
        console.log('✅ Last ticket data prepared for browser printing');
        
        res.json({
            success: true,
            message: `Ticket ${ticket.number} ready for printing`,
            ticket: {
                id: ticket.id,
                number: ticket.number,
                printed: true
            },
            printData: printData,
            printMode: 'browser'
        });
        
    } catch (error) {
        console.error('❌ Error preparing last ticket for printing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to prepare last ticket for printing',
            message: error.message
        });
    }
});

module.exports = router;