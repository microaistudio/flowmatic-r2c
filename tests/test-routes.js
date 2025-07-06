// File: /tests/test-routes.js
// Test if routes are properly registered

const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Load routes exactly like server.js does
const ticketRoutes = require('../src/routes/ticket');
const printerRoutes = require('../src/routes/printer');
const queueRoutes = require('../src/routes/queue');

console.log('Route modules loaded:');
console.log('- ticketRoutes:', typeof ticketRoutes);
console.log('- printerRoutes:', typeof printerRoutes);
console.log('- queueRoutes:', typeof queueRoutes);

// Register routes
app.use('/api', ticketRoutes);
app.use('/api/printer', printerRoutes);
app.use('/api/queue', queueRoutes);

// List all registered routes
console.log('\nRegistered routes:');
app._router.stack.forEach((middleware) => {
    if (middleware.route) {
        console.log(`${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
        middleware.handle.stack.forEach((handler) => {
            if (handler.route) {
                const methods = Object.keys(handler.route.methods).join(',').toUpperCase();
                console.log(`${methods} ${middleware.regexp.source} -> ${handler.route.path}`);
            }
        });
    }
});

// Test server
const PORT = 5051;
app.listen(PORT, () => {
    console.log(`\nTest server running on port ${PORT}`);
    console.log('Try: curl http://localhost:5051/api/queue/1');
    
    // Auto-close after 5 seconds
    setTimeout(() => {
        console.log('\nTest complete, closing...');
        process.exit(0);
    }, 5000);
});