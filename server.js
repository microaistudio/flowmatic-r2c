// FlowMatic-SOLO R2C - Main Server
// File: /server.js
// Phase 2: Queue Operations System
// All configuration from environment

const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();

// Get ALL config from environment
const config = {
    port: process.env.PORT || 5050,
    host: process.env.HOST || '0.0.0.0',
    systemName: process.env.SYSTEM_NAME || 'FlowMatic-SOLO',
    systemVersion: process.env.SYSTEM_VERSION || '1.0.0',
    apiPrefix: process.env.API_PREFIX || '/api',
    apiVersion: process.env.API_VERSION || 'v1',
    nodeEnv: process.env.NODE_ENV || 'development'
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Request logging middleware (helps debug routing issues)
if (config.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
        next();
    });
}

// Import all routes
const ticketRoutes = require('./src/routes/ticket');
const printerRoutes = require('./src/routes/printer');
const queueRoutes = require('./src/routes/queue');
const debugRoutes = require('./src/routes/debug');

// Register routes in correct order - SPECIFIC routes before GENERIC ones!
// This order is CRITICAL - we learned this the hard way in Session 3!
app.use(`${config.apiPrefix}/queue`, queueRoutes);    // Specific: /api/queue/*
app.use(`${config.apiPrefix}/printer`, printerRoutes); // Specific: /api/printer/*
app.use(`${config.apiPrefix}/debug`, debugRoutes);     // Specific: /api/debug/*
app.use(`${config.apiPrefix}/ticket`, ticketRoutes);   // Has generic /:id routes, so goes last!

// Debug Console route
app.get('/console', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'console', 'index.html'));
});

// Basic health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        system: config.systemName,
        version: config.systemVersion,
        environment: config.nodeEnv,
        phase: 2,
        checkpoint: 'Queue Operations System',
        timestamp: new Date().toISOString(),
        config: {
            port: config.port,
            api: `${config.apiPrefix}/${config.apiVersion}`
        }
    });
});

// API version prefix
app.get(`${config.apiPrefix}/${config.apiVersion}/status`, (req, res) => {
    res.json({
        api: 'FlowMatic Queue API',
        version: config.apiVersion,
        ready: true,
        endpoints: {
            tickets: `${config.apiPrefix}/ticket`,
            printer: `${config.apiPrefix}/printer/*`,
            queue: {
                next: `POST ${config.apiPrefix}/queue/next`,
                recall: `POST ${config.apiPrefix}/queue/recall`,
                noShow: `POST ${config.apiPrefix}/queue/no-show`,
                end: `POST ${config.apiPrefix}/queue/end`,
                view: `GET ${config.apiPrefix}/queue/:serviceId`
            },
            debug: {
                recentTickets: `GET ${config.apiPrefix}/debug/recent-tickets`,
                tableView: `GET ${config.apiPrefix}/debug/table/:tableName`,
                customQuery: `POST ${config.apiPrefix}/debug/query`,
                queueStats: `GET ${config.apiPrefix}/debug/queue-stats/:serviceId`,
                health: `GET ${config.apiPrefix}/debug/health`
            }
        }
    });
});

// 404 handler for unknown routes
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.url} not found`,
        availableEndpoints: {
            health: '/health',
            console: '/console',
            api: `${config.apiPrefix}/${config.apiVersion}/status`
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        ...(config.nodeEnv === 'development' && { stack: err.stack })
    });
});

// Start server
app.listen(config.port, config.host, () => {
    console.log(`✅ ${config.systemName} Server running`);
    console.log(`📍 Version: ${config.systemVersion}`);
    console.log(`🌐 URL: http://localhost:${config.port}`);
    console.log(`🔗 Health: http://localhost:${config.port}/health`);
    console.log(`🖥️  Console: http://localhost:${config.port}/console`);
    console.log(`📡 API: ${config.apiPrefix}/${config.apiVersion}`);
    console.log(`🏭 Environment: ${config.nodeEnv}`);
    console.log(`📋 Phase: 2 - Queue Operations Active`);
    console.log(`\n🚨 Route Order: Specific routes registered before generic ones!`);
});

module.exports = app; // For testing later