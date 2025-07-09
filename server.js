// FlowMatic-SOLO R2C - Main Server
// File: /server.js
// Phase 3+: Multi-Agent System with Dual Auth Support
// All configuration from environment

const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const app = express();

// Create HTTP server for Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
    cors: {
        origin: "*", // In production, specify your actual origins
        methods: ["GET", "POST"]
    }
});

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

// Make io available to routes for emitting events
app.set('io', io);

// Request logging middleware (helps debug routing issues)
if (config.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
        next();
    });
}

// Initialize Socket.IO with our queue events
require('./src/socket/queue-events')(io);

// Import all routes
const ticketRoutes = require('./src/routes/ticket');
const printerRoutes = require('./src/routes/printer');
const queueRoutes = require('./src/routes/queue');
const debugRoutes = require('./src/routes/debug');
const authRoutes = require('./src/routes/auth');
const sessionAuthRoutes = require('./src/routes/session-auth'); // NEW: Simple session auth
const counterRoutes = require('./src/routes/counter');
const reportsRoutes = require('./src/routes/reports'); // NEW: Reports endpoints
const featuresRoutes = require('./src/routes/features'); // NEW: Feature toggles

// Register routes in correct order - SPECIFIC routes before GENERIC ones!
// This order is CRITICAL - we learned this the hard way in Session 3!
app.use(`${config.apiPrefix}/auth/session`, sessionAuthRoutes); // NEW: Session auth (more specific)
app.use(`${config.apiPrefix}/auth`, authRoutes);                 // Existing JWT auth
app.use(`${config.apiPrefix}/counter`, counterRoutes);          // Specific: /api/counter/*
app.use(`${config.apiPrefix}/queue`, queueRoutes);              // Specific: /api/queue/*
app.use(`${config.apiPrefix}/printer`, printerRoutes);          // Specific: /api/printer/*
app.use(`${config.apiPrefix}/debug`, debugRoutes);              // Specific: /api/debug/*
app.use(`${config.apiPrefix}/reports`, reportsRoutes);          // NEW: Reports /api/reports/*
app.use(`${config.apiPrefix}/features`, featuresRoutes);        // NEW: Features /api/features/*
app.use(`${config.apiPrefix}/ticket`, ticketRoutes);            // Has generic /:id routes, so goes last!

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
        phase: '4',
        checkpoint: 'Phase 4 Complete - Advanced Features',
        timestamp: new Date().toISOString(),
        config: {
            port: config.port,
            api: `${config.apiPrefix}/${config.apiVersion}`
        },
        auth: {
            jwt: 'Active (complex)',
            session: 'Active (simple)'
        },
        socketIO: 'Active',
        features: 'Configurable'
    });
});

// API version prefix
app.get(`${config.apiPrefix}/${config.apiVersion}/status`, (req, res) => {
    res.json({
        api: 'FlowMatic Queue API',
        version: config.apiVersion,
        ready: true,
        socketIO: true,
        endpoints: {
            auth: {
                jwt: {
                    login: `POST ${config.apiPrefix}/auth/login`,
                    logout: `POST ${config.apiPrefix}/auth/logout`,
                    session: `GET ${config.apiPrefix}/auth/session`,
                    validate: `POST ${config.apiPrefix}/auth/validate`,
                    test: `GET ${config.apiPrefix}/auth/test`
                },
                session: {
                    login: `POST ${config.apiPrefix}/auth/session/login`,
                    logout: `POST ${config.apiPrefix}/auth/session/logout`,
                    current: `GET ${config.apiPrefix}/auth/session/current`,
                    validate: `POST ${config.apiPrefix}/auth/session/validate`,
                    config: `GET ${config.apiPrefix}/auth/session/config`,
                    test: `GET ${config.apiPrefix}/auth/session/test`
                }
            },
            counters: {
                status: `GET ${config.apiPrefix}/counter/status`,
                counterStatus: `GET ${config.apiPrefix}/counter/:id/status`,
                open: `POST ${config.apiPrefix}/counter/:id/open`,
                close: `POST ${config.apiPrefix}/counter/:id/close`,
                assign: `POST ${config.apiPrefix}/counter/:id/assign`,
                unassign: `POST ${config.apiPrefix}/counter/:id/unassign`,
                test: `GET ${config.apiPrefix}/counter/test`
            },
            tickets: `${config.apiPrefix}/ticket`,
            printer: `${config.apiPrefix}/printer/*`,
            queue: {
                next: `POST ${config.apiPrefix}/queue/next`,
                recall: `POST ${config.apiPrefix}/queue/recall`,
                serve: `POST ${config.apiPrefix}/queue/serve`,
                park: `POST ${config.apiPrefix}/queue/park`,
                unpark: `POST ${config.apiPrefix}/queue/unpark`,
                transfer: `POST ${config.apiPrefix}/queue/transfer`,
                recycle: `POST ${config.apiPrefix}/queue/recycle`,
                noShow: `POST ${config.apiPrefix}/queue/no-show`,
                end: `POST ${config.apiPrefix}/queue/end`,
                view: `GET ${config.apiPrefix}/queue/:serviceId`,
                parked: `GET ${config.apiPrefix}/queue/parked/:agentId`
            },
            debug: {
                recentTickets: `GET ${config.apiPrefix}/debug/recent-tickets`,
                tableView: `GET ${config.apiPrefix}/debug/table/:tableName`,
                customQuery: `POST ${config.apiPrefix}/debug/query`,
                queueStats: `GET ${config.apiPrefix}/debug/queue-stats/:serviceId`,
                health: `GET ${config.apiPrefix}/debug/health`
            },
            reports: {
                daily: `GET ${config.apiPrefix}/reports/daily`,
                agent: `GET ${config.apiPrefix}/reports/agent/:id`,
                service: `GET ${config.apiPrefix}/reports/service/:id`,
                test: `GET ${config.apiPrefix}/reports/test`
            },
            features: {
                all: `GET ${config.apiPrefix}/features`,
                byCategory: `GET ${config.apiPrefix}/features/category`,
                check: `GET ${config.apiPrefix}/features/:name`,
                toggle: `PUT ${config.apiPrefix}/features/:name`,
                test: `GET ${config.apiPrefix}/features/test/status`
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

// Start server - CHANGED from app.listen to server.listen for Socket.IO
server.listen(config.port, config.host, () => {
    console.log(`✅ ${config.systemName} Server running`);
    console.log(`📍 Version: ${config.systemVersion}`);
    console.log(`🌐 URL: http://localhost:${config.port}`);
    console.log(`🔗 Health: http://localhost:${config.port}/health`);
    console.log(`🖥️  Console: http://localhost:${config.port}/console`);
    console.log(`📡 API: ${config.apiPrefix}/${config.apiVersion}`);
    console.log(`🏭 Environment: ${config.nodeEnv}`);
    console.log(`📋 Phase: 4 COMPLETE - Advanced Features Ready`);
    console.log(`🔐 JWT Auth: ${config.apiPrefix}/auth/*`);
    console.log(`🔑 Session Auth: ${config.apiPrefix}/auth/session/*`);
    console.log(`🏢 Counter: ${config.apiPrefix}/counter/*`);
    console.log(`📊 Reports: ${config.apiPrefix}/reports/*`);
    console.log(`⚙️  Features: ${config.apiPrefix}/features/*`);
    console.log(`🔌 Socket.IO: ws://localhost:${config.port}`);
    console.log(`\n🚨 Route Order: Specific routes registered before generic ones!`);
    console.log(`\n🎯 Auth Migration: Both JWT and Session auth available`);
    console.log(`\n⚡ Real-time: Socket.IO enabled for live updates`);
    console.log(`\n🏁 Phase 4: 100% Complete - Ready for Phase 5 UIs!`);
});

module.exports = server; // Changed from app to server for testing later