// File: /tests/simple-route-test.js
// Simple test to verify queue routes work

const express = require('express');
const app = express();
require('dotenv').config();

// Middleware
app.use(express.json());

// Load routes
const queueRoutes = require('../src/routes/queue');

console.log('Queue routes loaded:', typeof queueRoutes);

// Register routes
app.use('/api/queue', queueRoutes);

// Simple test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'Test server working' });
});

// Error handler to see what's happening
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
});

// Start server
const PORT = 5051;
const server = app.listen(PORT, () => {
    console.log(`Test server running on port ${PORT}`);
    console.log('\nTest these endpoints:');
    console.log('- http://localhost:5051/test');
    console.log('- http://localhost:5051/api/queue/1');
    console.log('- POST http://localhost:5051/api/queue/next');
    console.log('\nPress Ctrl+C to stop');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down test server...');
    server.close(() => {
        process.exit(0);
    });
});