const db = require('../src/database/connection');

async function checkTickets() {
  try {
    const tickets = await db.getAll('SELECT * FROM tickets ORDER BY id');
    console.log('Current tickets in database:');
    console.table(tickets);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTickets();
