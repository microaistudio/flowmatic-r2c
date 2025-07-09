// File: /src/database/migrations/phase4_complete_fixed.js
// Purpose: Complete Phase 4 migration with correct database path
// Run with: node phase4_complete_fixed.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Find the database - check multiple possible locations
function findDatabase() {
    const possiblePaths = [
        path.join(__dirname, '../../../data/flowmatic.db'),  // From migrations folder
        path.join(__dirname, '../../data/flowmatic.db'),     // If in src/database
        path.join(__dirname, '../data/flowmatic.db'),        // If in src
        path.join(process.cwd(), 'data/flowmatic.db'),       // From project root
        './data/flowmatic.db'                                // Relative to current dir
    ];
    
    for (const dbPath of possiblePaths) {
        console.log(`Checking: ${dbPath}`);
        if (fs.existsSync(dbPath)) {
            console.log(`✓ Found database at: ${dbPath}\n`);
            return dbPath;
        }
    }
    
    throw new Error('Database file not found! Please ensure flowmatic.db exists in the data directory.');
}

// Get database path
const dbPath = findDatabase();
const db = new sqlite3.Database(dbPath);

// Promisify database methods
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

async function checkColumnExists(table, column) {
    try {
        const result = await all(`PRAGMA table_info(${table})`);
        return result.some(col => col.name === column);
    } catch (error) {
        return false;
    }
}

async function addColumnIfNotExists(table, column, definition) {
    try {
        const exists = await checkColumnExists(table, column);
        if (!exists) {
            await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
            console.log(`✓ Added ${column} to ${table} table`);
        } else {
            console.log(`⚠️  Column ${column} already exists in ${table} table`);
        }
    } catch (error) {
        if (error.message.includes('duplicate column name')) {
            console.log(`⚠️  Column ${column} already exists in ${table} table`);
        } else {
            throw error;
        }
    }
}

async function runPhase4Migration() {
    console.log('🚀 Starting Phase 4 Complete Migration...\n');
    
    try {
        // Test database connection
        await all('SELECT 1');
        console.log('✓ Database connection successful\n');
        
        // 1. Park/Unpark columns (already done, but let's ensure)
        console.log('📦 1. Park/Unpark Features:');
        await addColumnIfNotExists('tickets', 'is_parked', 'BOOLEAN DEFAULT false');
        await addColumnIfNotExists('tickets', 'parked_by', 'INTEGER');
        await addColumnIfNotExists('tickets', 'parked_at', 'DATETIME');
        await addColumnIfNotExists('tickets', 'park_reason', 'TEXT');
        
        // 2. Transfer operation columns
        console.log('\n🔄 2. Transfer Operation Features:');
        await addColumnIfNotExists('tickets', 'transferred_from', 'INTEGER');
        await addColumnIfNotExists('tickets', 'transferred_to', 'INTEGER');
        await addColumnIfNotExists('tickets', 'transferred_at', 'DATETIME');
        await addColumnIfNotExists('tickets', 'transfer_reason', 'TEXT');
        
        // 3. Recycle operation columns
        console.log('\n♻️  3. Recycle Operation Features:');
        await addColumnIfNotExists('tickets', 'recycled_count', 'INTEGER DEFAULT 0');
        await addColumnIfNotExists('tickets', 'last_recycled_at', 'DATETIME');
        
        // 4. Service duration tracking
        console.log('\n⏱️  4. Service Duration Tracking:');
        await addColumnIfNotExists('tickets', 'service_duration', 'INTEGER');
        await addColumnIfNotExists('tickets', 'wait_duration', 'INTEGER');
        
        // 5. Counter state tracking
        console.log('\n🏢 5. Counter State Enhancement:');
        // Check if counters table exists first
        const tables = await all("SELECT name FROM sqlite_master WHERE type='table' AND name='counters'");
        if (tables.length > 0) {
            await addColumnIfNotExists('counters', 'state', 'TEXT DEFAULT "closed"');
            await addColumnIfNotExists('counters', 'current_ticket_id', 'INTEGER');
            await addColumnIfNotExists('counters', 'current_agent_id', 'INTEGER');
        } else {
            console.log('⚠️  Counters table does not exist, skipping counter columns');
        }
        
        // 6. Create event_log table for real-time features
        console.log('\n📊 6. Event Log Table:');
        await run(`
            CREATE TABLE IF NOT EXISTS event_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                ticket_id INTEGER,
                counter_id INTEGER,
                agent_id INTEGER,
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id),
                FOREIGN KEY (counter_id) REFERENCES counters(id),
                FOREIGN KEY (agent_id) REFERENCES agents(id)
            )
        `);
        console.log('✓ Event log table ready');
        
        // 7. Create indexes for performance
        console.log('\n🚀 7. Performance Indexes:');
        
        try {
            await run(`
                CREATE INDEX IF NOT EXISTS idx_parked_tickets 
                ON tickets(parked_by, is_parked) 
                WHERE is_parked = 1
            `);
            console.log('✓ Created index for parked tickets');
        } catch (e) {
            console.log('⚠️  Index idx_parked_tickets already exists or failed');
        }
        
        try {
            await run(`
                CREATE INDEX IF NOT EXISTS idx_queue_advanced 
                ON tickets(service_id, state, is_parked, issued_at)
            `);
            console.log('✓ Created index for advanced queue operations');
        } catch (e) {
            console.log('⚠️  Index idx_queue_advanced already exists or failed');
        }
        
        try {
            await run(`
                CREATE INDEX IF NOT EXISTS idx_event_log 
                ON event_log(created_at, event_type)
            `);
            console.log('✓ Created index for event log');
        } catch (e) {
            console.log('⚠️  Index idx_event_log already exists or failed');
        }
        
        // 8. Update existing data for consistency
        console.log('\n🔧 8. Data Consistency Updates:');
        
        // Ensure all counters have state (if table exists)
        if (tables.length > 0) {
            await run(`
                UPDATE counters 
                SET state = 'closed' 
                WHERE state IS NULL
            `);
            console.log('✓ Updated counter states');
        }
        
        // Clear any orphaned parking data
        await run(`
            UPDATE tickets 
            SET is_parked = 0, parked_by = NULL, parked_at = NULL, park_reason = NULL
            WHERE state = 'ended' AND is_parked = 1
        `);
        console.log('✓ Cleaned orphaned parking data');
        
        console.log('\n✅ Phase 4 Migration Completed Successfully!');
        console.log('\n📋 Summary of Features Added:');
        console.log('  • Park/Unpark functionality');
        console.log('  • Transfer between services');
        console.log('  • Recycle tickets to queue');
        console.log('  • Service duration tracking');
        console.log('  • Event logging for real-time');
        console.log('  • Performance indexes');
        
        // Display current schema
        console.log('\n📊 Current Tickets Table Schema:');
        const schema = await all('PRAGMA table_info(tickets)');
        console.table(schema.map(col => ({
            Column: col.name,
            Type: col.type,
            NotNull: col.notnull ? 'Yes' : 'No',
            Default: col.dflt_value || 'NULL'
        })));
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error);
        throw error;
    }
}

// Run the migration
if (require.main === module) {
    runPhase4Migration()
        .then(() => {
            console.log('\n🎉 Migration process completed!');
            db.close();
            process.exit(0);
        })
        .catch(err => {
            console.error('\n💥 Migration error:', err);
            db.close();
            process.exit(1);
        });
}

module.exports = { runPhase4Migration };