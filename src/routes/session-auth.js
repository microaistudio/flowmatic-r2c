// File: /src/routes/session-auth.js
// Simple Session-Based Authentication Routes
// Phase 3+: Simplified Auth Migration
// Purpose: Zero-friction auth endpoints for operators
// Created: 2025-07-08

const express = require('express');
const router = express.Router();
const { 
    simpleLogin, 
    simpleLogout, 
    getSimpleSession,
    validateSimpleSession,
    simpleAuthMiddleware,
    getConfig 
} = require('../auth/session');

/**
 * POST /api/auth/session/login
 * Simple login - password optional based on config
 */
router.post('/login', async (req, res) => {
    console.log('🔐 SESSION LOGIN - Route hit!');
    console.log('🔐 Request body:', req.body);
    
    try {
        const { username, password } = req.body;

        if (!username) {
            return res.status(400).json({
                success: false,
                error: 'Username is required'
            });
        }

        const result = await simpleLogin(username, password);

        if (!result.success) {
            return res.status(401).json({
                success: false,
                error: result.error
            });
        }

        // Set session cookie if possible
        if (res.cookie) {
            res.cookie('sessionId', result.sessionId, {
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });
        }

        res.json({
            success: true,
            message: 'Login successful',
            agent: result.agent,
            sessionId: result.sessionId,
            expiresAt: result.expiresAt
        });

    } catch (error) {
        console.error('💥 Session login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * POST /api/auth/session/logout
 * Simple logout
 */
router.post('/logout', simpleAuthMiddleware, async (req, res) => {
    try {
        const sessionId = req.session.id;
        const result = await simpleLogout(sessionId);

        // Clear cookie if exists
        if (res.clearCookie) {
            res.clearCookie('sessionId');
        }

        res.json(result);

    } catch (error) {
        console.error('Session logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

/**
 * GET /api/auth/session/current
 * Get current session info
 */
router.get('/current', simpleAuthMiddleware, async (req, res) => {
    try {
        res.json({
            success: true,
            agent: req.agent,
            session: {
                id: req.session.id,
                loginAt: req.session.loginAt
            }
        });

    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get session info'
        });
    }
});

/**
 * POST /api/auth/session/validate
 * Validate session without auth middleware
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

        const validation = await validateSimpleSession(sessionId);
        
        if (!validation.valid) {
            return res.status(401).json({
                success: false,
                valid: false,
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
 * GET /api/auth/session/config
 * Get auth configuration
 */
router.get('/config', (req, res) => {
    const config = getConfig();
    
    res.json({
        success: true,
        config: config,
        message: config.passwordRequired ? 
            'Password required for login' : 
            'Username-only login enabled'
    });
});

/**
 * GET /api/auth/session/test
 * Test endpoint
 */
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Session auth routes working',
        timestamp: new Date().toISOString(),
        endpoints: {
            login: 'POST /api/auth/session/login',
            logout: 'POST /api/auth/session/logout',
            current: 'GET /api/auth/session/current',
            validate: 'POST /api/auth/session/validate',
            config: 'GET /api/auth/session/config',
            test: 'GET /api/auth/session/test'
        }
    });
});

/**
 * GET /api/auth/session/protected
 * Protected test endpoint
 */
router.get('/protected', simpleAuthMiddleware, (req, res) => {
    res.json({
        success: true,
        message: 'Protected route accessed with session',
        agent: req.agent,
        sessionId: req.session.id
    });
});

module.exports = router;