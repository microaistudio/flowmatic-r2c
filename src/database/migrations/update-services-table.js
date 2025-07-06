// File: /src/database/migrations/update-services-table.js
// Update services table with additional fields

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = path.join(__dirname, '../../../', process.env.DB_PATH || 'data/flowmatic.db');

async function updateServicesTable() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                return reject(err);
            }
            console.log('Connected to database for services update');
        });

        db.serialize(() => {
            console.log('Updating services table...');

            // Add additional columns to services table
            const newColumns = [
                { name: 'range_start', type: 'INTEGER DEFAULT 1' },
                { name: 'range_end', type: 'INTEGER DEFAULT 999' },
                { name: 'estimated_service_time', type: 'INTEGER DEFAULT 300' }, // 5 minutes in seconds
                { name: 'updated_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' }
            ];

            // Check and add each column if it doesn't exist
            newColumns.forEach(column => {
                db.all(`PRAGMA table_info(services)`, (err, columns) => {
                    if (err) {
                        console.error(`Error checking columns:`, err);
                        return;
                    }
                    
                    const columnExists = columns.some(col => col.name === column.name);
                    if (!columnExists) {
                        db.run(`ALTER TABLE services ADD COLUMN ${column.name} ${column.type}`, (err) => {
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

            // Add more default services
            setTimeout(() => {
                const defaultServices = [
                    { name: 'Account Services', prefix: 'B', description: 'Account related services', range_start: 1, range_end: 999 },
                    { name: 'VIP Services', prefix: 'V', description: 'Priority services for VIP customers', range_start: 1, range_end: 99 },
                    { name: 'Technical Support', prefix: 'T', description: 'Technical assistance', range_start: 1, range_end: 499 }
                ];

                defaultServices.forEach(service => {
                    db.run(`
                        INSERT OR IGNORE INTO services (name, prefix, description, range_start, range_end) 
                        VALUES (?, ?, ?, ?, ?)
                    `, [service.name, service.prefix, service.description, service.range_start, service.range_end], (err) => {
                        if (err) {
                            console.error(`Error inserting ${service.name}:`, err);
                        } else {
                            console.log(`✅ Service ready: ${service.name} (${service.prefix})`);
                        }
                    });
                });

                // Show final services table
                setTimeout(() => {
                    console.log('\n📊 Services Table Summary:');
                    
                    db.all(`PRAGMA table_info(services)`, (err, columns) => {
                        if (!err) {
                            console.log('\nServices table columns:');
                            columns.forEach(col => {
                                console.log(`  - ${col.name} (${col.type})`);
                            });
                        }
                    });

                    db.all(`SELECT * FROM services`, (err, services) => {
                        if (!err) {
                            console.log('\nConfigured services:');
                            services.forEach(service => {
                                console.log(`  - ${service.name} (${service.prefix}) Range: ${service.range_start}-${service.range_end}`);
                            });
                        }
                    });

                    setTimeout(() => {
                        db.close((err) => {
                            if (err) {
                                console.error('Error closing database:', err);
                                reject(err);
                            } else {
                                console.log('\n✅ Services table update completed!');
                                resolve();
                            }
                        });
                    }, 1000);
                }, 1000);
            }, 1000);
        });
    });
}

// Run the update
if (require.main === module) {
    updateServicesTable()
        .then(() => {
            console.log('Update finished');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Update failed:', err);
            process.exit(1);
        });
}

module.exports = { updateServicesTable };