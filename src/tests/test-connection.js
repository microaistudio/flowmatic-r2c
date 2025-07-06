// FlowMatic-SOLO R2C - Database Connection Test
// File: /src/database/test-connection.js
// Phase 1: Ticket Printer System
// Test script to verify database connection

const db = require('../database/connection');

async function testConnection() {
    console.log('🧪 Testing database connection...\n');
    
    try {
        // Test 1: Count tickets
        console.log('Test 1: Count existing tickets');
        const count = await db.getOne('SELECT COUNT(*) as total FROM tickets');
        console.log(`✅ Found ${count.total} ticket(s)\n`);
        
        // Test 2: Get all tickets
        console.log('Test 2: Fetch all tickets');
        const tickets = await db.getAll('SELECT * FROM tickets ORDER BY id');
        tickets.forEach(ticket => {
            console.log(`  📎 Ticket ${ticket.number}: ${ticket.state}`);
        });
        console.log('');
        
        // Test 3: Insert a new ticket
        console.log('Test 3: Insert new ticket');
        const result = await db.run(
            'INSERT INTO tickets (number, state) VALUES (?, ?)',
            ['A002', 'issued']
        );
        console.log(`✅ Inserted ticket with ID: ${result.id}\n`);
        
        // Test 4: Get the newly inserted ticket
        console.log('Test 4: Fetch specific ticket');
        const newTicket = await db.getOne(
            'SELECT * FROM tickets WHERE id = ?',
            [result.id]
        );
        console.log(`✅ Retrieved: ${newTicket.number} - ${newTicket.state}\n`);
        
        // Test 5: Update ticket
        console.log('Test 5: Update ticket state');
        await db.run(
            'UPDATE tickets SET printed = ? WHERE id = ?',
            [true, result.id]
        );
        console.log('✅ Updated ticket printed status\n');
        
        console.log('🎉 All database tests passed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
    
    // Note: In a real app, the connection stays open
    console.log('\n✅ Tests completed!');
}

// Run tests
testConnection();