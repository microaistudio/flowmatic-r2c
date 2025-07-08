// File: /src/scripts/init-agents.js
// FlowMatic-SOLO R2C - Initialize Agent Authentication
// Phase 3: Multi-Agent System
// Purpose: Create agent tables and seed default agents
// Created: 2025-07-08

const Agent = require('../models/Agent');

async function initializeAgents() {
  try {
    console.log('🚀 Initializing agent authentication system...');
    
    // Create agent tables
    console.log('📋 Creating agent tables...');
    await Agent.createTables();
    
    // Seed default agents
    console.log('🌱 Seeding default agents...');
    await Agent.seedAgents();
    
    // Verify agents were created
    console.log('✅ Verifying agents...');
    const agents = await Agent.getAll();
    console.log(`📊 Total agents created: ${agents.length}`);
    
    agents.forEach(agent => {
      console.log(`   👤 ${agent.username} (${agent.name}) - ${agent.role}`);
    });
    
    console.log('🎉 Agent authentication system initialized successfully!');
    console.log('');
    console.log('🔐 Default login credentials:');
    console.log('   Username: agent1, Password: test123');
    console.log('   Username: agent2, Password: test123');
    console.log('   Username: agent3, Password: test123');
    console.log('   Username: supervisor, Password: admin123');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error initializing agents:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeAgents();
}

module.exports = { initializeAgents };