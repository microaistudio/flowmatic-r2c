// File: /flowmatic-r2c/src/socket/queue-events.js
// Socket.IO Event Handler for Queue System
// Created: 2025-07-10
// Purpose: Real-time event broadcasting for queue operations

module.exports = function(io) {
    console.log('🔌 Socket.IO Queue Events initialized');

    // Connection handler
    io.on('connection', (socket) => {
        console.log(`✅ Client connected: ${socket.id}`);

        // Join service-specific rooms
        socket.on('join:service', (serviceId) => {
            socket.join(`service-${serviceId}`);
            console.log(`Client ${socket.id} joined service-${serviceId}`);
        });

        // Leave service rooms
        socket.on('leave:service', (serviceId) => {
            socket.leave(`service-${serviceId}`);
            console.log(`Client ${socket.id} left service-${serviceId}`);
        });

        // Test events (for our test page)
        socket.on('test:queueUpdate', () => {
            socket.emit('queue:updated', {
                serviceId: 1,
                waiting: 5,
                timestamp: new Date().toISOString()
            });
        });

        socket.on('test:ticketCall', () => {
            socket.emit('ticket:called', {
                ticket: { id: 123, number: 'A001' },
                counter: 3,
                timestamp: new Date().toISOString()
            });
        });

        socket.on('test:heartbeat', () => {
            socket.emit('heartbeat', {
                timestamp: new Date().toISOString()
            });
        });

        // Disconnect handler
        socket.on('disconnect', () => {
            console.log(`❌ Client disconnected: ${socket.id}`);
        });
    });

    // Heartbeat every 30 seconds
    setInterval(() => {
        io.emit('heartbeat', { timestamp: new Date().toISOString() });
    }, 30000);

    // Export broadcast functions for use in routes
    return {
        // Broadcast ticket called to all clients
        broadcastTicketCalled: (ticket, counterId) => {
            io.emit('ticket:called', {
                ticket: { id: ticket.id, number: ticket.number },
                counter: counterId,
                serviceId: ticket.service_id,
                timestamp: new Date().toISOString()
            });
        },

        // Broadcast queue update to service-specific room
        broadcastQueueUpdate: (serviceId, stats) => {
            io.to(`service-${serviceId}`).emit('queue:updated', {
                serviceId,
                ...stats,
                timestamp: new Date().toISOString()
            });
        },

        // Broadcast ticket state change
        broadcastStateChange: (ticket, oldState, newState) => {
            io.emit('ticket:stateChanged', {
                ticketId: ticket.id,
                number: ticket.number,
                oldState,
                newState,
                timestamp: new Date().toISOString()
            });
        },

        // Broadcast counter status change
        broadcastCounterStatus: (counterId, status) => {
            io.emit('counter:statusChanged', {
                counterId,
                status,
                timestamp: new Date().toISOString()
            });
        }
    };
};