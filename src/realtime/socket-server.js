// File: /src/realtime/socket-server.js
// Socket.IO server implementation with modular organization
// Phase 4: Real-time events

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('../database/connection');

/**
 * Initialize Socket.IO server
 */
function initializeSocketServer(server) {
    const io = socketIO(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // ============================================
    // MIDDLEWARE SECTION
    // ============================================
    
    /**
     * Authentication middleware
     * Future: Extract to /middleware/auth-socket.js
     */
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            const sessionId = socket.handshake.auth.sessionId;
            
            // Support both JWT and session auth
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.agentId = decoded.agentId;
                socket.authType = 'jwt';
            } else if (sessionId) {
                // Verify session
                const session = await db.get(
                    'SELECT * FROM sessions WHERE id = ? AND is_active = 1',
                    [sessionId]
                );
                if (session) {
                    socket.agentId = session.agent_id;
                    socket.authType = 'session';
                }
            }
            
            next();
        } catch (err) {
            next(new Error('Authentication failed'));
        }
    });

    // ============================================
    // CONNECTION HANDLERS
    // ============================================
    
    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);
        
        // Join rooms based on role
        handleRoomJoining(socket);
        
        // Register event handlers
        registerQueueHandlers(io, socket);
        registerAgentHandlers(io, socket);
        registerSystemHandlers(io, socket);
        
        // Handle disconnection
        socket.on('disconnect', () => {
            handleDisconnection(io, socket);
        });
    });

    // ============================================
    // ROOM MANAGEMENT
    // Future: Extract to /rooms/room-manager.js
    // ============================================
    
    function handleRoomJoining(socket) {
        // Join service rooms
        socket.on('join:service', (serviceId) => {
            socket.join(`service-${serviceId}`);
            console.log(`Socket ${socket.id} joined service-${serviceId}`);
        });
        
        // Join counter room if agent
        if (socket.agentId) {
            socket.join('agents');
            
            // Check if agent has active counter
            db.get(
                'SELECT counter_id FROM sessions WHERE agent_id = ? AND is_active = 1',
                [socket.agentId]
            ).then(session => {
                if (session?.counter_id) {
                    socket.join(`counter-${session.counter_id}`);
                }
            });
        }
        
        // Join monitor room for public displays
        socket.on('join:monitor', () => {
            socket.join('monitors');
        });
    }

    // ============================================
    // QUEUE EVENT HANDLERS
    // Future: Extract to /events/queue-events.js
    // ============================================
    
    function registerQueueHandlers(io, socket) {
        // Listen for queue updates from routes
        socket.on('queue:changed', async (data) => {
            const { serviceId, action, ticket } = data;
            
            // Broadcast to all clients watching this service
            io.to(`service-${serviceId}`).emit('queue:updated', {
                serviceId,
                action,
                ticket,
                timestamp: new Date()
            });
            
            // Special handling for called tickets
            if (action === 'called') {
                io.to('monitors').emit('ticket:called', {
                    ticket,
                    counter: data.counter,
                    timestamp: new Date()
                });
            }
        });
        
        // State change notifications
        socket.on('ticket:state-changed', (data) => {
            io.to(`service-${data.serviceId}`).emit('ticket:state-update', data);
        });
    }

    // ============================================
    // AGENT EVENT HANDLERS
    // Future: Extract to /events/agent-events.js
    // ============================================
    
    function registerAgentHandlers(io, socket) {
        // Agent status updates
        socket.on('agent:status', (status) => {
            io.to('agents').emit('agent:status-update', {
                agentId: socket.agentId,
                status,
                timestamp: new Date()
            });
        });
        
        // Counter status changes
        socket.on('counter:status', async (data) => {
            const { counterId, status } = data;
            
            // Broadcast to all agents and monitors
            io.to('agents').to('monitors').emit('counter:status-changed', {
                counterId,
                status,
                timestamp: new Date()
            });
        });
    }

    // ============================================
    // SYSTEM EVENT HANDLERS
    // Future: Extract to /events/system-events.js
    // ============================================
    
    function registerSystemHandlers(io, socket) {
        // Heartbeat handling
        let lastHeartbeat = Date.now();
        
        socket.on('heartbeat', () => {
            lastHeartbeat = Date.now();
            socket.emit('heartbeat:ack', { timestamp: lastHeartbeat });
        });
        
        // Check heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
            const now = Date.now();
            if (now - lastHeartbeat > 90000) { // 90 seconds
                console.log(`Client ${socket.id} timed out`);
                socket.disconnect();
            }
        }, 30000);
        
        // Clean up on disconnect
        socket.on('disconnect', () => {
            clearInterval(heartbeatInterval);
        });
        
        // System announcements
        socket.on('system:announce', (message) => {
            if (socket.agentId && hasAdminRole(socket.agentId)) {
                io.emit('system:announcement', {
                    message,
                    timestamp: new Date()
                });
            }
        });
    }

    // ============================================
    // DISCONNECTION HANDLER
    // Future: Extract to /handlers/disconnect-handler.js
    // ============================================
    
    function handleDisconnection(io, socket) {
        console.log(`Client disconnected: ${socket.id}`);
        
        // Notify if agent disconnected
        if (socket.agentId) {
            io.to('agents').emit('agent:disconnected', {
                agentId: socket.agentId,
                timestamp: new Date()
            });
        }
    }

    // ============================================
    // BROADCAST UTILITIES
    // Future: Extract to /utils/broadcast-utils.js
    // ============================================
    
    // Expose broadcast methods for routes to use
    io.broadcastQueueUpdate = (serviceId, action, data) => {
        io.to(`service-${serviceId}`).emit('queue:updated', {
            serviceId,
            action,
            data,
            timestamp: new Date()
        });
    };
    
    io.broadcastTicketCall = (ticket, counter) => {
        io.to('monitors').emit('ticket:called', {
            ticket,
            counter,
            timestamp: new Date()
        });
    };
    
    io.broadcastCounterStatus = (counterId, status) => {
        io.to('agents').to('monitors').emit('counter:status-changed', {
            counterId,
            status,
            timestamp: new Date()
        });
    };

    // ============================================
    // HELPER FUNCTIONS
    // Future: Extract to /utils/socket-helpers.js
    // ============================================
    
    async function hasAdminRole(agentId) {
        // Check if agent has admin privileges
        const agent = await db.get(
            'SELECT role FROM agents WHERE id = ?',
            [agentId]
        );
        return agent?.role === 'admin';
    }

    return io;
}

module.exports = { initializeSocketServer };