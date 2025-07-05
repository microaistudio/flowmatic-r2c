// FlowMatic-SOLO R2C - Database Connection
// File: /src/database/connection.js
// Phase 1: Ticket Printer System
// Singleton database connection for the application

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Get configuration from environment
const config = {
    dbPath: process.env.DATABASE_PATH || './data/flowmatic.db',
    timeout: parseInt(process.env.DATABASE_TIMEOUT) || 5000,
    verbose: process.env.NODE_ENV === 'development'
};

// Single database instance
let db = null;

// Get database connection
function getDB() {
    if (!db) {
        db = new sqlite3.Database(config.dbPath, (err) => {
            if (err) {
                console.error('❌ Database connection error:', err);
                process.exit(1);
            }
            if (config.verbose) {
                console.log(`📊 Connected to database: ${config.dbPath}`);
            }
        });

        // Configure database settings
        db.configure('busyTimeout', config.timeout);
        
        // Enable foreign keys (for future use)
        db.run('PRAGMA foreign_keys = ON');
    }
    
    return db;
}

// Database helper functions
const database = {
    // Get connection
    get: getDB,
    
    // Run a query (INSERT, UPDATE, DELETE)
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            getDB().run(sql, params, function(err) {
                if (err) {
                    if (config.verbose) {
                        console.error('❌ Query error:', sql, err);
                    }
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    },
    
    // Get single row
    getOne: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            getDB().get(sql, params, (err, row) => {
                if (err) {
                    if (config.verbose) {
                        console.error('❌ Query error:', sql, err);
                    }
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    },
    
    // Get multiple rows
    getAll: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            getDB().all(sql, params, (err, rows) => {
                if (err) {
                    if (config.verbose) {
                        console.error('❌ Query error:', sql, err);
                    }
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    },
    
    // Close connection (for cleanup)
    close: () => {
        return new Promise((resolve, reject) => {
            if (db) {
                db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        db = null;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
};

module.exports = database;