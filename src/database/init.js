// FlowMatic-SOLO R2C - Database Initialization
// File: /src/database/init.js
// Phase 1: Ticket Printer System
// Creates database and runs schema

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Get database path from environment
const dbPath = process.env.DATABASE_PATH || './data/flowmatic.db';

// Ensure data directory exists
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`📁 Created data directory: ${dataDir}`);
}

// Create database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
        process.exit(1);
    }
    console.log(`✅ Connected to SQLite database: ${dbPath}`);
});

// Read and execute schema
const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

// Execute schema
db.exec(schema, (err) => {
    if (err) {
        console.error('❌ Error creating schema:', err);
        db.close();
        process.exit(1);
    }
    
    console.log('✅ Database schema created successfully');
    
    // Verify by counting tickets
    db.get('SELECT COUNT(*) as count FROM tickets', (err, row) => {
        if (err) {
            console.error('❌ Error verifying database:', err);
        } else {
            console.log(`✅ Database verified - ${row.count} test ticket(s) found`);
        }
        
        // Close database
        db.close((err) => {
            if (err) {
                console.error('❌ Error closing database:', err);
            } else {
                console.log('✅ Database initialization complete!');
            }
        });
    });
});