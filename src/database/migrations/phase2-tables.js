// File: /src/database/migrations/phase2-tables.js
// Create event_log and counters tables for Phase 2

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = path.join(__dirname, '../../../', process.env.DB_PATH || 'data/flowmatic.db');

async function createPhase2Tables() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                return reject(err);
            }
            console.log('Connected to database for Phase 2 tables');
        });

        db.serialize(() => {
            console.log('Creating Phase 2 tables...');

            // Create event_log table
            db.run(`
                CREATE TABLE IF NOT EXISTS event_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    ticket_id INTEGER,
                    counter_id INTEGER,
                    agent_id INTEGER,
                    details TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating event_log table:', err);
                } else {
                    console.log('✅ Event log table created');
                }
            });

            // Create counters table (basic for now, will enhance in Phase 3)
            db.run(`
                CREATE TABLE IF NOT EXISTS counters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    number INTEGER NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    location TEXT,
                    state TEXT DEFAULT 'closed',
                    current_ticket_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (current_ticket_id) REFERENCES tickets(id)
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating counters table:', err);
                } else {
                    console.log('✅ Counters table created');
                    
                    // Insert default counters
                    const defaultCounters = [
                        { number: 1, name: 'Counter 1', location: 'Main Hall' },
                        { number: 2, name: 'Counter 2', location: 'Main Hall' },
                        { number: 3, name: 'Counter 3', location: 'Side Area' }
                    ];
                    
                    defaultCounters.forEach(counter => {
                        db.run(`
                            INSERT OR IGNORE INTO counters (number, name, location) 
                            VALUES (?, ?, ?)
                        `, [counter.number, counter.name, counter.location], (err) => {
                            if (!err) {
                                console.log(`✅ Counter ${counter.number} ready`);
                            }
                        });
                    });
                }
            });

            // Add missing columns to tickets table
            db.run(`ALTER TABLE tickets ADD COLUMN counter_id INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.error('Error adding counter_id:', err);
                } else if (!err) {
                    console.log('✅ Added counter_id to tickets');
                }
            });

            db.run(`ALTER TABLE tickets ADD COLUMN agent_id INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.error('Error adding agent_id:', err);
                } else if (!err) {
                    console.log('✅ Added agent_id to tickets');
                }
            });

            db.run(`ALTER TABLE tickets ADD COLUMN service_duration INTEGER`, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                    console.error('Error adding service_duration:', err);
                } else if (!err) {
                    console.log('✅ Added service_duration to tickets');
                }
            });

            // Create indexes
            setTimeout(() => {
                const indexes = [
                    `CREATE INDEX IF NOT EXISTS idx_event_log_ticket ON event_log(ticket_id)`,
                    `CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type)`,
                    `CREATE INDEX IF NOT EXISTS idx_event_log_time ON event_log(created_at)`,
                    `CREATE INDEX IF NOT EXISTS idx_counters_state ON counters(state)`,
                    `CREATE INDEX IF NOT EXISTS idx_tickets_counter ON tickets(counter_id)`
                ];

                indexes.forEach(indexSql => {
                    db.run(indexSql, (err) => {
                        if (!err) {
                            console.log('✅ Index created');
                        }
                    });
                });

                setTimeout(() => {
                    db.close((err) => {
                        if (err) {
                            console.error('Error closing database:', err);
                            reject(err);
                        } else {
                            console.log('\n✅ Phase 2 tables created successfully!');
                            resolve();
                        }
                    });
                }, 1000);
            }, 1000);
        });
    });
}

// Run if called directly
if (require.main === module) {
    createPhase2Tables()
        .then(() => {
            console.log('Phase 2 tables setup complete');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Setup failed:', err);
            process.exit(1);
        });
}

module.exports = { createPhase2Tables };