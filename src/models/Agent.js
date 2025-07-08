// File: /src/models/Agent.js
// FlowMatic-SOLO R2C - Agent Authentication Model
// Phase 3: Multi-Agent System
// Purpose: Agent management and authentication
// Created: 2025-07-08

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('../database/connection');

class Agent {
  // Create agent tables if they don't exist
  static async createTables() {
    try {
      // Create agents table
      await db.run(`
        CREATE TABLE IF NOT EXISTS agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT,
          role TEXT DEFAULT 'agent',
          is_active BOOLEAN DEFAULT true,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create sessions table
      await db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          agent_id INTEGER NOT NULL,
          counter_id INTEGER,
          login_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          is_active BOOLEAN DEFAULT true,
          user_agent TEXT,
          ip_address TEXT,
          FOREIGN KEY (agent_id) REFERENCES agents(id),
          FOREIGN KEY (counter_id) REFERENCES counters(id)
        )
      `);

      // Create indexes for performance
      await db.run('CREATE INDEX IF NOT EXISTS idx_agents_username ON agents(username)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id, is_active)');
      await db.run('CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at)');

      console.log('✅ Agent tables created successfully');
      return true;
    } catch (error) {
      console.error('❌ Error creating agent tables:', error);
      throw error;
    }
  }

  // Seed default agents for testing
  static async seedAgents() {
    try {
      const existingAgents = await db.getAll('SELECT COUNT(*) as count FROM agents');
      if (existingAgents[0].count > 0) {
        console.log('📋 Agents already exist, skipping seed');
        return;
      }

      const defaultAgents = [
        { username: 'agent1', password: 'test123', name: 'Agent One', email: 'agent1@example.com' },
        { username: 'agent2', password: 'test123', name: 'Agent Two', email: 'agent2@example.com' },
        { username: 'agent3', password: 'test123', name: 'Agent Three', email: 'agent3@example.com' },
        { username: 'supervisor', password: 'admin123', name: 'Supervisor', email: 'supervisor@example.com', role: 'supervisor' }
      ];

      for (const agent of defaultAgents) {
        await this.create(agent);
      }

      console.log('🌱 Default agents seeded successfully');
    } catch (error) {
      console.error('❌ Error seeding agents:', error);
      throw error;
    }
  }

  // Create new agent
  static async create({ username, password, name, email, role = 'agent' }) {
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      
      const result = await db.run(`
        INSERT INTO agents (username, password_hash, name, email, role)
        VALUES (?, ?, ?, ?, ?)
      `, [username, passwordHash, name, email, role]);

      return await this.findById(result.lastID);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  // Find agent by ID
  static async findById(id) {
    try {
      const agent = await db.getOne('SELECT * FROM agents WHERE id = ?', [id]);
      if (agent) {
        delete agent.password_hash; // Don't return password hash
      }
      return agent;
    } catch (error) {
      throw error;
    }
  }

  // Find agent by username
  static async findByUsername(username) {
    try {
      const agent = await db.getOne('SELECT * FROM agents WHERE username = ?', [username]);
      return agent; // Keep password_hash for authentication
    } catch (error) {
      throw error;
    }
  }

  // Authenticate agent
  static async authenticate(username, password) {
    try {
      const agent = await this.findByUsername(username);
      if (!agent) {
        throw new Error('Invalid username or password');
      }

      if (!agent.is_active) {
        throw new Error('Agent account is disabled');
      }

      const isValid = await bcrypt.compare(password, agent.password_hash);
      if (!isValid) {
        throw new Error('Invalid username or password');
      }

      // Remove password hash from returned object
      delete agent.password_hash;
      return agent;
    } catch (error) {
      throw error;
    }
  }

  // Create session
  static async createSession(agentId, counterId = null, userAgent = null, ipAddress = null) {
    try {
      const sessionId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours

      await db.run(`
        INSERT INTO sessions (id, agent_id, counter_id, expires_at, user_agent, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [sessionId, agentId, counterId, expiresAt.toISOString(), userAgent, ipAddress]);

      return sessionId;
    } catch (error) {
      throw error;
    }
  }

  // Find session
  static async findSession(sessionId) {
    try {
      const session = await db.getOne(`
        SELECT s.*, a.username, a.name, a.email, a.role
        FROM sessions s
        JOIN agents a ON s.agent_id = a.id
        WHERE s.id = ? AND s.is_active = true AND s.expires_at > datetime('now')
      `, [sessionId]);

      return session;
    } catch (error) {
      throw error;
    }
  }

  // Update session activity
  static async updateSessionActivity(sessionId) {
    try {
      await db.run(`
        UPDATE sessions 
        SET last_activity = datetime('now')
        WHERE id = ? AND is_active = true
      `, [sessionId]);
    } catch (error) {
      throw error;
    }
  }

  // End session
  static async endSession(sessionId) {
    try {
      await db.run(`
        UPDATE sessions 
        SET is_active = false
        WHERE id = ?
      `, [sessionId]);
    } catch (error) {
      throw error;
    }
  }

  // Get all active sessions
  static async getActiveSessions() {
    try {
      return await db.getAll(`
        SELECT s.*, a.username, a.name, c.number as counter_number, c.name as counter_name
        FROM sessions s
        JOIN agents a ON s.agent_id = a.id
        LEFT JOIN counters c ON s.counter_id = c.id
        WHERE s.is_active = true AND s.expires_at > datetime('now')
        ORDER BY s.login_at DESC
      `);
    } catch (error) {
      throw error;
    }
  }

  // Get all agents
  static async getAll() {
    try {
      return await db.getAll(`
        SELECT id, username, name, email, role, is_active, created_at
        FROM agents
        ORDER BY name
      `);
    } catch (error) {
      throw error;
    }
  }

  // Update agent
  static async update(id, updates) {
    try {
      const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(id);

      await db.run(`
        UPDATE agents 
        SET ${fields}, updated_at = datetime('now')
        WHERE id = ?
      `, values);

      return await this.findById(id);
    } catch (error) {
      throw error;
    }
  }

  // Deactivate agent
  static async deactivate(id) {
    try {
      await db.run('UPDATE agents SET is_active = false WHERE id = ?', [id]);
      
      // End all active sessions for this agent
      await db.run('UPDATE sessions SET is_active = false WHERE agent_id = ?', [id]);
      
      return true;
    } catch (error) {
      throw error;
    }
  }

  // Clean up expired sessions
  static async cleanupSessions() {
    try {
      const result = await db.run(`
        UPDATE sessions 
        SET is_active = false 
        WHERE expires_at <= datetime('now') AND is_active = true
      `);

      console.log(`🧹 Cleaned up ${result.changes} expired sessions`);
      return result.changes;
    } catch (error) {
      console.error('❌ Error cleaning up sessions:', error);
      throw error;
    }
  }
}

module.exports = Agent;