// File: /tests/simple-db-check.js
// Simple check of database state

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const dbPath = path.join(__dirname, '../', process.env.DB_PATH || 'data/flowmatic.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
});

console.log('🔍 Checking Database State\n');

// Check tickets
db.all('SELECT id, number, state, service_id FROM tickets ORDER BY id DESC LIMIT 10', (err, tickets) => {
    if (err) {
        console.error('Error:', err);
        return;
    }
    
    console.log('Current tickets:');
    console.table(tickets);
    
    // Count by state
    db.all('SELECT state, COUNT(*) as count FROM tickets GROUP BY state', (err, counts) => {
        if (!err) {
            console.log('\nTickets by state:');
            console.table(counts);
        }
        
        // Update issued to waiting
        db.run(`UPDATE tickets SET state = 'waiting' WHERE state = 'issued'`, function(err) {
            if (err) {
                console.error('Update error:', err);
            } else {
                console.log(`\n✅ Updated ${this.changes} tickets from 'issued' to 'waiting'`);
                
                // Show updated state
                db.all('SELECT id, number, state FROM tickets WHERE state = "waiting"', (err, waiting) => {
                    if (!err) {
                        console.log('\nTickets now in WAITING state:');
                        console.table(waiting);
                    }
                    
                    db.close();
                });
            }
        });
    });
});