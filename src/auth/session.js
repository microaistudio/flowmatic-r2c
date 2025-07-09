// File: /src/auth/session.js
// Simple Session-Based Authentication System
// Phase 3+: Simplified Auth Migration
// Purpose: Zero-friction session management for operators
// Created: 2025-07-08

const crypto = require('crypto');
const db = require('../database/connection');

// Configuration from environment
const SESSION_CONFIG = {
    passwordRequired: process.env.AUTH_PASSWORD_REQUIRED === 'true' || false,
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_HOURS || '24') * 60 * 60 * 1000,
    defaultPassword: process.env.DEFAULT_PASSWORD || 'test123'
};

/**
 * Generate simple session ID
 */
function generateSessionId() {
    return 'sess_' + crypto.randomBytes(16).toString('hex');
}

/**
 * Simple login - username only or username/password
 */
async function simpleLogin(username, password = null) {
    try {
        console.log('🔐 Simple Auth: Login attempt for:', username);
        
        // Get agent from database
        const agent = await db.getOne(`
            SELECT id, username, name, is_active 
            FROM agents 
            WHERE username = ? AND is_active = true
        `, [username]);

        if (!agent) {
            console.log('❌ Simple Auth: Agent not found');
            return { success: false, error: 'Invalid username' };
        }

        // Check password if required
        if (SESSION_CONFIG.passwordRequired) {
            // For migration period, accept the default password for all agents
            if (password !== SESSION_CONFIG.defaultPassword) {
                console.log('❌ Simple Auth: Invalid password');
                return { success: false, error: 'Invalid password' };
            }
        }

        // Generate session
        const sessionId = generateSessionId();
        const expiresAt = new Date(Date.now() + SESSION_CONFIG.sessionTimeout);

        // Create session record
        await db.run(`
            INSERT INTO sessions (id, agent_id, login_at, is_active)
            VALUES (?, ?, datetime('now', 'localtime'), true)
        `, [sessionId, agent.id]);

        console.log('✅ Simple Auth: Session created:', sessionId);

        return {
            success: true,
            agent: {
                id: agent.id,
                username: agent.username,
                name: agent.name
            },
            sessionId: sessionId,
            expiresAt: expiresAt
        };

    } catch (error) {
        console.error('💥 Simple Auth error:', error);
        return { success: false, error: 'Login failed' };
    }
}

/**
 * Simple logout
 */
async function simpleLogout(sessionId) {
    try {
        await db.run(`
            UPDATE sessions 
            SET is_active = false, logout_at = datetime('now', 'localtime')
            WHERE id = ? AND is_active = true
        `, [sessionId]);

        return { success: true, message: 'Logged out successfully' };

    } catch (error) {
        console.error('Simple logout error:', error);
        return { success: false, error: 'Logout failed' };
    }
}

/**
 * Get session info
 */
async function getSimpleSession(sessionId) {
    try {
        const session = await db.getOne(`
            SELECT s.*, a.id as agent_id, a.username, a.name, a.is_active as agent_active
            FROM sessions s
            JOIN agents a ON s.agent_id = a.id
            WHERE s.id = ? AND s.is_active = true
        `, [sessionId]);

        if (!session || !session.agent_active) {
            return null;
        }

        // Check if session expired
        const loginTime = new Date(session.login_at).getTime();
        const now = Date.now();
        
        if (now - loginTime > SESSION_CONFIG.sessionTimeout) {
            // Auto-expire the session
            await db.run(`
                UPDATE sessions SET is_active = false 
                WHERE id = ?
            `, [sessionId]);
            return null;
        }

        return session;

    } catch (error) {
        console.error('Get session error:', error);
        return null;
    }
}

/**
 * Simple session validation
 */
async function validateSimpleSession(sessionId) {
    const session = await getSimpleSession(sessionId);
    
    if (!session) {
        return { valid: false, error: 'Session expired or invalid' };
    }

    return { 
        valid: true, 
        session: {
            id: session.id,
            agentId: session.agent_id,
            username: session.username,
            name: session.name,
            loginAt: session.login_at
        }
    };
}

/**
 * Express middleware for simple session auth
 */
async function simpleAuthMiddleware(req, res, next) {
    // Check for session ID in multiple places
    const sessionId = req.headers['x-session-id'] || 
                     req.cookies?.sessionId || 
                     req.query.sessionId;

    if (!sessionId) {
        return res.status(401).json({ 
            success: false, 
            error: 'Session ID required' 
        });
    }

    const validation = await validateSimpleSession(sessionId);
    
    if (!validation.valid) {
        return res.status(401).json({
            success: false,
            error: validation.error
        });
    }

    // Attach session info to request
    req.session = validation.session;
    req.agent = {
        id: validation.session.agentId,
        username: validation.session.username,
        name: validation.session.name
    };
    
    next();
}

/**
 * Get current configuration
 */
function getConfig() {
    return {
        passwordRequired: SESSION_CONFIG.passwordRequired,
        sessionTimeoutHours: SESSION_CONFIG.sessionTimeout / (60 * 60 * 1000),
        authMode: 'simple-session'
    };
}

module.exports = {
    simpleLogin,
    simpleLogout,
    getSimpleSession,
    validateSimpleSession,
    simpleAuthMiddleware,
    getConfig,
    SESSION_CONFIG
};