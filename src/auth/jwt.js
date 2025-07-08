// File: /src/auth/jwt.js
// JWT Authentication System
// Phase 3: Multi-Agent System
// Purpose: Token generation, verification, and middleware
// Created: 2025-07-07

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../database/connection');

// Get JWT configuration from environment
const JWT_CONFIG = {
    secret: process.env.JWT_SECRET || 'flowmatic-default-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    issuer: process.env.JWT_ISSUER || 'flowmatic-r2c',
    audience: process.env.JWT_AUDIENCE || 'flowmatic-agents'
};

/**
 * Generate JWT token for authenticated agent
 */
function generateToken(agent, sessionId) {
    const payload = {
        agentId: agent.id,
        username: agent.username,
        name: agent.name,
        sessionId: sessionId,
        isActive: agent.is_active
    };

    const options = {
        expiresIn: JWT_CONFIG.expiresIn,
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience,
        subject: agent.id.toString()
    };

    return jwt.sign(payload, JWT_CONFIG.secret, options);
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
    const options = {
        issuer: JWT_CONFIG.issuer,
        audience: JWT_CONFIG.audience
    };

    return jwt.verify(token, JWT_CONFIG.secret, options);
}

/**
 * Hash password using bcrypt
 */
async function hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify password against hash
 */
async function verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generate unique session ID
 */
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Authenticate agent with username/password
 */
async function authenticateAgent(username, password) {
    try {
        console.log('🔍 JWT: Starting authentication for:', username);
        
        // Get agent from database
        const agent = await db.getOne(`
            SELECT * FROM agents 
            WHERE username = ? AND is_active = true
        `, [username]);

        console.log('🔍 JWT: Database query result:', agent ? 'FOUND' : 'NOT FOUND');
        
        if (agent) {
            console.log('🔍 JWT: Agent details:', { 
                id: agent.id, 
                username: agent.username, 
                name: agent.name,
                is_active: agent.is_active,
                password_hash_length: agent.password_hash ? agent.password_hash.length : 'MISSING'
            });
        }

        if (!agent) {
            console.log('❌ JWT: No agent found for username:', username);
            return { success: false, error: 'Invalid username or password' };
        }

        console.log('🔍 JWT: Agent found, checking password...');
        console.log('🔍 JWT: Password hash from DB:', agent.password_hash.substring(0, 20) + '...');
        
        // Verify password
        const isValidPassword = await verifyPassword(password, agent.password_hash);
        console.log('🔍 JWT: Password check result:', isValidPassword);
        
        if (!isValidPassword) {
            console.log('❌ JWT: Password verification failed');
            return { success: false, error: 'Invalid username or password' };
        }

        console.log('✅ JWT: Password verified successfully');
        
        // Generate session ID
        const sessionId = generateSessionId();
        console.log('🔍 JWT: Generated session ID:', sessionId.substring(0, 16) + '...');

        // Create session record
        await db.run(`
            INSERT INTO sessions (id, agent_id, login_at, is_active)
            VALUES (?, ?, datetime('now', 'localtime'), true)
        `, [sessionId, agent.id]);

        console.log('✅ JWT: Session created in database');

        // Generate JWT token
        const token = generateToken(agent, sessionId);
        console.log('✅ JWT: JWT token generated');

        // Remove password hash from response
        const { password_hash, ...agentData } = agent;

        console.log('✅ JWT: Authentication complete - returning success');
        return {
            success: true,
            agent: agentData,
            token: token,
            sessionId: sessionId,
            expiresIn: JWT_CONFIG.expiresIn
        };

    } catch (error) {
        console.error('💥 JWT Authentication error:', error);
        return { success: false, error: 'Authentication failed' };
    }
}

/**
 * Logout agent and invalidate session
 */
async function logoutAgent(sessionId) {
    try {
        await db.run(`
            UPDATE sessions 
            SET is_active = false, logout_at = datetime('now', 'localtime')
            WHERE id = ? AND is_active = true
        `, [sessionId]);

        return { success: true, message: 'Logged out successfully' };

    } catch (error) {
        console.error('Logout error:', error);
        return { success: false, error: 'Logout failed' };
    }
}

/**
 * Get active session info
 */
async function getSessionInfo(sessionId) {
    try {
        const session = await db.getOne(`
            SELECT s.*, a.username, a.name, a.is_active as agent_active
            FROM sessions s
            JOIN agents a ON s.agent_id = a.id
            WHERE s.id = ? AND s.is_active = true
        `, [sessionId]);

        return session;

    } catch (error) {
        console.error('Session info error:', error);
        return null;
    }
}

/**
 * Validate active session
 */
async function validateSession(sessionId) {
    const session = await getSessionInfo(sessionId);
    
    if (!session) {
        return { valid: false, error: 'Session not found or expired' };
    }

    if (!session.agent_active) {
        return { valid: false, error: 'Agent account is inactive' };
    }

    return { valid: true, session };
}

/**
 * Express middleware for JWT authentication
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Access token required' 
        });
    }

    try {
        const decoded = verifyToken(token);
        req.agent = decoded;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        return res.status(403).json({ 
            success: false, 
            error: 'Invalid or expired token' 
        });
    }
}

/**
 * Express middleware for session validation
 */
async function validateSessionMiddleware(req, res, next) {
    if (!req.agent || !req.agent.sessionId) {
        return res.status(401).json({
            success: false,
            error: 'Session information missing'
        });
    }

    const validation = await validateSession(req.agent.sessionId);
    
    if (!validation.valid) {
        return res.status(401).json({
            success: false,
            error: validation.error
        });
    }

    req.session = validation.session;
    next();
}

/**
 * Create default admin user if none exists
 */
async function createDefaultAdmin() {
    try {
        const adminExists = await db.getOne(`
            SELECT id FROM agents WHERE username = 'admin'
        `);

        if (!adminExists) {
            const hashedPassword = await hashPassword('admin123');
            
            await db.run(`
                INSERT INTO agents (username, password_hash, name, email)
                VALUES ('admin', ?, 'System Administrator', 'admin@flowmatic.com')
            `, [hashedPassword]);

            console.log('✅ Default admin user created (username: admin, password: admin123)');
        }

    } catch (error) {
        console.error('Error creating default admin:', error);
    }
}

module.exports = {
    generateToken,
    verifyToken,
    hashPassword,
    verifyPassword,
    generateSessionId,
    authenticateAgent,
    logoutAgent,
    getSessionInfo,
    validateSession,
    authenticateToken,
    validateSessionMiddleware,
    createDefaultAdmin,
    JWT_CONFIG
};