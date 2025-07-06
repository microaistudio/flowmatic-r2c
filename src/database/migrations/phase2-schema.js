// File: /src/database/migrations/phase2-schema.js
// Phase 2: Enhanced Schema for Queue Operations

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = path.join(__dirname, '../../../', process.env.DB_PATH || 'data/flowmatic.db');

async function runMigration() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                return reject(err);
            }
            console.log('Connected to database for migration');
        });

        db.serialize(() => {
            console.log('Starting Phase 2 schema migration...');

            // Step 1: Add new columns to tickets table
            const ticketColumns = [
                { name: 'called_at', type: 'DATETIME' },
                { name: 'served_at', type: 'DATETIME' },
                { name: 'ended_at', type: 'DATETIME' },
                { name: 'is_no_show', type: 'BOOLEAN DEFAULT false' },
                { name: 'transaction_completed', type: 'BOOLEAN DEFAULT false' }
            ];

            // Check and add each column if it doesn't exist
            ticketColumns.forEach(column => {
                db.all(`PRAGMA table_info(tickets)`, (err, columns) => {
                    if (err) {
                        console.error(`Error checking columns:`, err);
                        return;
                    }
                    
                    const columnExists = columns.some(col => col.name === column.name);
                    if (!columnExists) {
                        db.run(`ALTER TABLE tickets ADD COLUMN ${column.name} ${column.type}`, (err) => {
                            if (err) {
                                console.error(`Error adding ${column.name}:`, err);
                            } else {
                                console.log(`✅ Added column: ${column.name}`);
                            }
                        });
                    } else {
                        console.log(`⏭️  Column already exists: ${column.name}`);
                    }
                });
            });

            // Step 2: Create services table
            db.run(`
                CREATE TABLE IF NOT EXISTS services (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    prefix TEXT NOT NULL UNIQUE,
                    description TEXT,
                    current_number INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT true,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating services table:', err);
                } else {
                    console.log('✅ Services table created/verified');
                    
                    // Insert default service if table is empty
                    db.get(`SELECT COUNT(*) as count FROM services`, (err, row) => {
                        if (!err && row.count === 0) {
                            db.run(`
                                INSERT INTO services (name, prefix, description) 
                                VALUES ('General Service', 'A', 'Default service queue')
                            `, (err) => {
                                if (err) {
                                    console.error('Error inserting default service:', err);
                                } else {
                                    console.log('✅ Default service inserted');
                                }
                            });
                        }
                    });
                }
            });

            // Step 3: Update existing tickets to have state='waiting' if they're 'issued'
            // This prepares for the new state flow: issued → waiting → called → serving → ended
            db.run(`
                UPDATE tickets 
                SET state = 'waiting' 
                WHERE state = 'issued'
            `, (err) => {
                if (err) {
                    console.error('Error updating ticket states:', err);
                } else {
                    console.log('✅ Updated existing tickets from issued → waiting');
                }
            });

            // Step 4: Create indexes for performance
            const indexes = [
                `CREATE INDEX IF NOT EXISTS idx_tickets_state ON tickets(state)`,
                `CREATE INDEX IF NOT EXISTS idx_tickets_service ON tickets(service_id)`,
                `CREATE INDEX IF NOT EXISTS idx_tickets_queue ON tickets(service_id, state, issued_at)`,
                `CREATE INDEX IF NOT EXISTS idx_services_prefix ON services(prefix)`
            ];

            indexes.forEach(indexSql => {
                db.run(indexSql, (err) => {
                    if (err) {
                        console.error('Error creating index:', err);
                    } else {
                        console.log('✅ Index created/verified');
                    }
                });
            });

            // Give operations time to complete
            setTimeout(() => {
                console.log('\n📊 Migration Summary:');
                
                // Show current schema
                db.all(`PRAGMA table_info(tickets)`, (err, columns) => {
                    if (!err) {
                        console.log('\nTickets table columns:');
                        columns.forEach(col => {
                            console.log(`  - ${col.name} (${col.type})`);
                        });
                    }
                });

                // Show services
                db.all(`SELECT * FROM services`, (err, services) => {
                    if (!err) {
                        console.log('\nServices:');
                        services.forEach(service => {
                            console.log(`  - ${service.name} (${service.prefix})`);
                        });
                    }
                });

                // Close database
                setTimeout(() => {
                    db.close((err) => {
                        if (err) {
                            console.error('Error closing database:', err);
                            reject(err);
                        } else {
                            console.log('\n✅ Migration completed successfully!');
                            resolve();
                        }
                    });
                }, 1000);
            }, 2000);
        });
    });
}

// Run the migration
if (require.main === module) {
    runMigration()
        .then(() => {
            console.log('Migration finished');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Migration failed:', err);
            process.exit(1);
        });
}

module.exports = { runMigration };