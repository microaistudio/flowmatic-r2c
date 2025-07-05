// FlowMatic-SOLO R2C - Main Server
// File: /server.js
// Phase 1: Ticket Printer System
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

// API Routes
const ticketRoutes = require('./src/routes/ticket');
app.use(`${config.apiPrefix}`, ticketRoutes);

// Basic health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        system: config.systemName,
        version: config.systemVersion,
        environment: config.nodeEnv,
        phase: 1,
        checkpoint: 'Ticket Printer System',
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
        ready: true
    });
});

// Start server
app.listen(config.port, config.host, () => {
    console.log(`✅ ${config.systemName} Server running`);
    console.log(`📍 Version: ${config.systemVersion}`);
    console.log(`🌐 URL: http://localhost:${config.port}`);
    console.log(`🔗 Health: http://localhost:${config.port}/health`);
    console.log(`📡 API: ${config.apiPrefix}/${config.apiVersion}`);
    console.log(`🏭 Environment: ${config.nodeEnv}`);
});

module.exports = app; // For testing later