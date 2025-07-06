// File: /tests/debug-queue-db.js
// Debug the database to see what's happening

const { getConnection } = require('../src/database/connection');

async function debugDatabase() {
    const db = getConnection();
    
    console.log('🔍 Debugging Queue Database\n');
    
    try {
        // Check all tickets
        console.log('1. All tickets in database:');
        const allTickets = await db.getAll('SELECT id, number, state, service_id, issued_at FROM tickets ORDER BY id DESC LIMIT 10');
        console.table(allTickets);
        
        // Check tickets in waiting state
        console.log('\n2. Tickets in WAITING state:');
        const waitingTickets = await db.getAll(`SELECT id, number, state, service_id FROM tickets WHERE state = 'waiting'`);
        console.table(waitingTickets);
        
        // Check services
        console.log('\n3. Services:');
        const services = await db.getAll('SELECT * FROM services');
        console.table(services);
        
        // Check if we have the right columns
        console.log('\n4. Tickets table structure:');
        const tableInfo = await db.getAll("PRAGMA table_info(tickets)");
        console.log('Columns:', tableInfo.map(col => col.name).join(', '));
        
        // Update tickets from 'issued' to 'waiting' if needed
        console.log('\n5. Updating any \'issued\' tickets to \'waiting\':');
        const updateResult = await db.run(`UPDATE tickets SET state = 'waiting' WHERE state = 'issued'`);
        console.log('Updated rows:', updateResult.changes);
        
        // Check again
        console.log('\n6. Tickets after update:');
        const updatedTickets = await db.getAll('SELECT id, number, state FROM tickets WHERE state = "waiting" ORDER BY issued_at');
        console.table(updatedTickets);
        
    } catch (error) {
        console.error('Error:', error);
    }
}

debugDatabase().then(() => {
    console.log('\n✅ Debug complete');
    process.exit(0);
});