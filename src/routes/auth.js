// File: /src/routes/auth.js
// Authentication API Routes
// Phase 3: Multi-Agent System
// Purpose: Login, logout, session management endpoints
// Created: 2025-07-07

const express = require('express');
const router = express.Router();
const { 
    authenticateAgent, 
    logoutAgent, 
    getSessionInfo,
    validateSession,
    authenticateToken,
    validateSessionMiddleware 
} = require('../auth/jwt');

/**
 * POST /api/auth/login
 * Authenticate agent with username/password
 */
router.post('/login', async (req, res) => {
    console.log('🔍 LOGIN ATTEMPT - Route hit!');
    console.log('🔍 Request body:', req.body);
    
    try {
        const { username, password } = req.body;
        console.log('🔍 Extracted credentials:', { username, password: '***' });

        if (!username || !password) {
            console.log('❌ Missing credentials');
            return res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
        }

        console.log('🔍 Calling authenticateAgent...');
        const result = await authenticateAgent(username, password);
        console.log('🔍 Authentication result:', { success: result.success, error: result.error || 'none' });

        if (!result.success) {
            console.log('❌ Authentication failed:', result.error);
            return res.status(401).json({
                success: false,
                error: result.error
            });
        }

        console.log('✅ Authentication successful - sending response');
        res.json({
            success: true,
            message: 'Login successful',
            agent: result.agent,
            token: result.token,
            sessionId: result.sessionId,
            expiresIn: result.expiresIn
        });

    } catch (error) {
        console.error('💥 Login route error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout agent and invalidate session
 */
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const sessionId = req.agent.sessionId;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID not found'
            });
        }

        const result = await logoutAgent(sessionId);
        res.json(result);

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

/**
 * GET /api/auth/session
 * Get current session information
 */
router.get('/session', authenticateToken, validateSessionMiddleware, async (req, res) => {
    try {
        res.json({
            success: true,
            agent: {
                id: req.agent.agentId,
                username: req.agent.username,
                name: req.agent.name,
                isActive: req.agent.isActive
            },
            session: {
                id: req.agent.sessionId,
                loginAt: req.session.login_at,
                isActive: req.session.is_active
            }
        });

    } catch (error) {
        console.error('Session info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get session info'
        });
    }
});

/**
 * POST /api/auth/validate
 * Validate session by ID
 */
router.post('/validate', async (req, res) => {
    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID required'
            });
        }

        const validation = await validateSession(sessionId);
        
        if (!validation.valid) {
            return res.status(401).json({
                success: false,
                error: validation.error
            });
        }

        res.json({
            success: true,
            valid: true,
            session: validation.session
        });

    } catch (error) {
        console.error('Session validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Validation failed'
        });
    }
});

/**
 * GET /api/auth/test
 * Test endpoint to verify auth routes are working
 */
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Auth routes are working',
        timestamp: new Date().toISOString(),
        endpoints: {
            login: 'POST /api/auth/login',
            logout: 'POST /api/auth/logout',
            session: 'GET /api/auth/session',
            validate: 'POST /api/auth/validate',
            test: 'GET /api/auth/test'
        }
    });
});

/**
 * Protected test endpoint
 */
router.get('/protected', authenticateToken, (req, res) => {
    res.json({
        success: true,
        message: 'Protected route accessed successfully',
        agent: {
            id: req.agent.agentId,
            username: req.agent.username,
            sessionId: req.agent.sessionId
        }
    });
});

module.exports = router;