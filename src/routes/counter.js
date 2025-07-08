// File: /src/routes/counter.js
// Counter Management API Routes
// Phase 3: Multi-Agent System
// Purpose: Counter open/close, agent assignment, status management
// Created: 2025-07-07

const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const { authenticateToken, validateSessionMiddleware } = require('../auth/jwt');

/**
 * GET /api/counter/status
 * Get status of all counters
 */
router.get('/status', async (req, res) => {
    try {
        const counters = await db.getAll(`
            SELECT 
                c.*,
                a.username as agent_username,
                a.name as agent_name,
                t.number as current_ticket_number
            FROM counters c
            LEFT JOIN agents a ON c.current_agent_id = a.id
            LEFT JOIN tickets t ON c.current_ticket_id = t.id
            ORDER BY c.number
        `);

        res.json({
            success: true,
            counters: counters,
            summary: {
                total: counters.length,
                available: counters.filter(c => c.state === 'available').length,
                closed: counters.filter(c => c.state === 'closed').length,
                serving: counters.filter(c => c.state === 'serving').length
            }
        });

    } catch (error) {
        console.error('Counter status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get counter status'
        });
    }
});

/**
 * GET /api/counter/:id/status
 * Get status of specific counter
 */
router.get('/:id/status', async (req, res) => {
    try {
        const counterId = parseInt(req.params.id);
        
        const counter = await db.getOne(`
            SELECT 
                c.*,
                a.username as agent_username,
                a.name as agent_name,
                t.number as current_ticket_number,
                t.state as ticket_state
            FROM counters c
            LEFT JOIN agents a ON c.current_agent_id = a.id
            LEFT JOIN tickets t ON c.current_ticket_id = t.id
            WHERE c.id = ?
        `, [counterId]);

        if (!counter) {
            return res.status(404).json({
                success: false,
                error: 'Counter not found'
            });
        }

        res.json({
            success: true,
            counter: counter
        });

    } catch (error) {
        console.error('Counter status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get counter status'
        });
    }
});

/**
 * POST /api/counter/:id/open
 * Open a counter (no agent assignment required)
 */
router.post('/:id/open', async (req, res) => {
    try {
        const counterId = parseInt(req.params.id);
        
        // Check if counter exists
        const counter = await db.getOne(`
            SELECT * FROM counters WHERE id = ?
        `, [counterId]);

        if (!counter) {
            return res.status(404).json({
                success: false,
                error: 'Counter not found'
            });
        }

        if (counter.state === 'available') {
            return res.status(400).json({
                success: false,
                error: 'Counter is already open'
            });
        }

        // Open the counter
        await db.run(`
            UPDATE counters 
            SET state = 'available', 
                current_agent_id = NULL,
                current_ticket_id = NULL,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `, [counterId]);

        // Get updated counter info
        const updatedCounter = await db.getOne(`
            SELECT * FROM counters WHERE id = ?
        `, [counterId]);

        console.log(`✅ Counter ${counter.number} (${counter.name}) opened`);

        res.json({
            success: true,
            message: `Counter ${counter.number} opened successfully`,
            counter: updatedCounter
        });

    } catch (error) {
        console.error('Counter open error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to open counter'
        });
    }
});

/**
 * POST /api/counter/:id/close
 * Close a counter
 */
router.post('/:id/close', async (req, res) => {
    try {
        const counterId = parseInt(req.params.id);
        
        // Check if counter exists
        const counter = await db.getOne(`
            SELECT * FROM counters WHERE id = ?
        `, [counterId]);

        if (!counter) {
            return res.status(404).json({
                success: false,
                error: 'Counter not found'
            });
        }

        if (counter.state === 'closed') {
            return res.status(400).json({
                success: false,
                error: 'Counter is already closed'
            });
        }

        // Check if counter is currently serving
        if (counter.current_ticket_id) {
            return res.status(400).json({
                success: false,
                error: 'Cannot close counter while serving a customer'
            });
        }

        // Close the counter
        await db.run(`
            UPDATE counters 
            SET state = 'closed', 
                current_agent_id = NULL,
                current_ticket_id = NULL,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `, [counterId]);

        // Get updated counter info
        const updatedCounter = await db.getOne(`
            SELECT * FROM counters WHERE id = ?
        `, [counterId]);

        console.log(`🔒 Counter ${counter.number} (${counter.name}) closed`);

        res.json({
            success: true,
            message: `Counter ${counter.number} closed successfully`,
            counter: updatedCounter
        });

    } catch (error) {
        console.error('Counter close error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to close counter'
        });
    }
});

/**
 * POST /api/counter/:id/assign
 * Assign agent to counter (requires authentication)
 */
router.post('/:id/assign', authenticateToken, async (req, res) => {
    try {
        const counterId = parseInt(req.params.id);
        const agentId = req.agent.agentId; // From JWT token
        
        // Check if counter exists and is available
        const counter = await db.getOne(`
            SELECT * FROM counters WHERE id = ?
        `, [counterId]);

        if (!counter) {
            return res.status(404).json({
                success: false,
                error: 'Counter not found'
            });
        }

        if (counter.state !== 'available') {
            return res.status(400).json({
                success: false,
                error: 'Counter is not available for assignment'
            });
        }

        if (counter.current_agent_id) {
            return res.status(400).json({
                success: false,
                error: 'Counter is already assigned to another agent'
            });
        }

        // Check if agent is already assigned to another counter
        const existingAssignment = await db.getOne(`
            SELECT c.*, c.number as counter_number, c.name as counter_name
            FROM counters c 
            WHERE c.current_agent_id = ?
        `, [agentId]);

        if (existingAssignment) {
            return res.status(400).json({
                success: false,
                error: `Agent is already assigned to Counter ${existingAssignment.counter_number}`
            });
        }

        // Assign agent to counter
        await db.run(`
            UPDATE counters 
            SET current_agent_id = ?,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `, [agentId, counterId]);

        // Get updated counter info with agent details
        const updatedCounter = await db.getOne(`
            SELECT 
                c.*,
                a.username as agent_username,
                a.name as agent_name
            FROM counters c
            LEFT JOIN agents a ON c.current_agent_id = a.id
            WHERE c.id = ?
        `, [counterId]);

        console.log(`👤 Agent ${req.agent.username} assigned to Counter ${counter.number}`);

        res.json({
            success: true,
            message: `Successfully assigned to Counter ${counter.number}`,
            counter: updatedCounter,
            agent: {
                id: agentId,
                username: req.agent.username,
                name: req.agent.name
            }
        });

    } catch (error) {
        console.error('Counter assignment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to assign counter'
        });
    }
});

/**
 * POST /api/counter/:id/unassign
 * Unassign agent from counter (requires authentication)
 */
router.post('/:id/unassign', authenticateToken, async (req, res) => {
    try {
        const counterId = parseInt(req.params.id);
        const agentId = req.agent.agentId; // From JWT token
        
        // Check if counter exists
        const counter = await db.getOne(`
            SELECT * FROM counters WHERE id = ?
        `, [counterId]);

        if (!counter) {
            return res.status(404).json({
                success: false,
                error: 'Counter not found'
            });
        }

        // Check if agent is assigned to this counter
        if (counter.current_agent_id !== agentId) {
            return res.status(400).json({
                success: false,
                error: 'Agent is not assigned to this counter'
            });
        }

        // Check if counter is currently serving
        if (counter.current_ticket_id) {
            return res.status(400).json({
                success: false,
                error: 'Cannot unassign while serving a customer'
            });
        }

        // Unassign agent from counter
        await db.run(`
            UPDATE counters 
            SET current_agent_id = NULL,
                updated_at = datetime('now', 'localtime')
            WHERE id = ?
        `, [counterId]);

        // Get updated counter info
        const updatedCounter = await db.getOne(`
            SELECT * FROM counters WHERE id = ?
        `, [counterId]);

        console.log(`👤 Agent ${req.agent.username} unassigned from Counter ${counter.number}`);

        res.json({
            success: true,
            message: `Successfully unassigned from Counter ${counter.number}`,
            counter: updatedCounter
        });

    } catch (error) {
        console.error('Counter unassignment error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unassign counter'
        });
    }
});

/**
 * GET /api/counter/test
 * Test endpoint for counter routes
 */
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Counter routes are working',
        timestamp: new Date().toISOString(),
        endpoints: {
            status: 'GET /api/counter/status',
            counterStatus: 'GET /api/counter/:id/status',
            open: 'POST /api/counter/:id/open',
            close: 'POST /api/counter/:id/close',
            assign: 'POST /api/counter/:id/assign (requires auth)',
            unassign: 'POST /api/counter/:id/unassign (requires auth)',
            test: 'GET /api/counter/test'
        }
    });
});

module.exports = router;