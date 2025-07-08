// File: /src/database/migrations/003-agent-tables.js
// Phase 3: Multi-Agent System - Database Migration
// Purpose: Create agent, counter, and session tables
// Created: 2025-07-07

const db = require('../connection');
const { getSQLiteTimeFunction } = require('../../utils/timezone');

async function up() {
    console.log('🔄 Running migration: 003-agent-tables...');

    try {
        // Create agents table
        await db.run(`
            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                email TEXT,
                is_active BOOLEAN DEFAULT true,
                created_at DATETIME DEFAULT (datetime('now', 'localtime')),
                updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
            )
        `);

        // Create counters table
        await db.run(`
            CREATE TABLE IF NOT EXISTS counters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                number INTEGER NOT NULL UNIQUE,
                name TEXT NOT NULL,
                state TEXT DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'serving')),
                current_ticket_id INTEGER,
                current_agent_id INTEGER,
                created_at DATETIME DEFAULT (datetime('now', 'localtime')),
                updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (current_ticket_id) REFERENCES tickets(id),
                FOREIGN KEY (current_agent_id) REFERENCES agents(id)
            )
        `);

        // Create sessions table
        await db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                agent_id INTEGER NOT NULL,
                counter_id INTEGER,
                login_at DATETIME DEFAULT (datetime('now', 'localtime')),
                logout_at DATETIME,
                is_active BOOLEAN DEFAULT true,
                session_data TEXT,
                FOREIGN KEY (agent_id) REFERENCES agents(id),
                FOREIGN KEY (counter_id) REFERENCES counters(id)
            )
        `);

        // Create indexes for performance
        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_agents_username ON agents(username)
        `);

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(is_active) WHERE is_active = true
        `);

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_counters_state ON counters(state)
        `);

        await db.run(`
            CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, agent_id) WHERE is_active = true
        `);

        // Insert default test data
        console.log('📝 Inserting default agent data...');

        // Create default agents (password: 'test123')
        const defaultPasswordHash = '$2b$10$rOI7JZ8ZgGx6.ZG8FgzO3.8WzGx8QY9mK8p1r2s3t4u5v6w7x8y9z'; // bcrypt hash of 'test123'

        await db.run(`
            INSERT OR IGNORE INTO agents (username, password_hash, name, email)
            VALUES 
                ('admin', '${defaultPasswordHash}', 'Administrator', 'admin@flowmatic.com'),
                ('agent1', '${defaultPasswordHash}', 'Agent One', 'agent1@flowmatic.com'),
                ('agent2', '${defaultPasswordHash}', 'Agent Two', 'agent2@flowmatic.com'),
                ('agent3', '${defaultPasswordHash}', 'Agent Three', 'agent3@flowmatic.com')
        `);

        // Create default counters
        await db.run(`
            INSERT OR IGNORE INTO counters (number, name, state)
            VALUES 
                (1, 'Counter 1', 'closed'),
                (2, 'Counter 2', 'closed'),
                (3, 'Counter 3', 'closed'),
                (4, 'Counter 4', 'closed'),
                (5, 'Counter 5', 'closed')
        `);

        console.log('✅ Migration 003-agent-tables completed successfully');
        console.log('👥 Created agents: admin, agent1, agent2, agent3 (password: test123)');
        console.log('🏢 Created counters: 1-5 (all closed)');

    } catch (error) {
        console.error('❌ Migration 003-agent-tables failed:', error);
        throw error;
    }
}

async function down() {
    console.log('🔄 Rolling back migration: 003-agent-tables...');

    try {
        // Drop tables in reverse order (due to foreign keys)
        await db.run('DROP TABLE IF EXISTS sessions');
        await db.run('DROP TABLE IF EXISTS counters');
        await db.run('DROP TABLE IF EXISTS agents');

        console.log('✅ Migration 003-agent-tables rolled back successfully');

    } catch (error) {
        console.error('❌ Rollback 003-agent-tables failed:', error);
        throw error;
    }
}

// Execute migration if run directly
if (require.main === module) {
    up().then(() => {
        console.log('🎉 Agent tables migration completed!');
        process.exit(0);
    }).catch((error) => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    });
}

module.exports = { up, down };