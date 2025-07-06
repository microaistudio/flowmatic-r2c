// File: /tests/test-queue-operations.js
// Test the queue API endpoints

const http = require('http');

const API_BASE = 'http://localhost:5050/api';

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5050,
            path: `/api${path}`,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(body);
                    resolve({ status: res.statusCode, data: response });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function runTests() {
    console.log('🧪 Testing Queue Operations\n');
    
    try {
        // Test 1: Issue some tickets first
        console.log('Test 1: Issuing tickets for queue...');
        for (let i = 1; i <= 3; i++) {
            const result = await makeRequest('POST', '/ticket', {});
            console.log(`✅ Ticket ${i} issued: ${result.data.ticket.number}`);
        }
        
        // Test 2: Get queue status
        console.log('\nTest 2: Check queue status...');
        const queueStatus = await makeRequest('GET', '/queue/1');
        console.log(`✅ Queue status: ${queueStatus.data.queue.waiting.length} waiting`);
        
        // Test 3: Call next ticket
        console.log('\nTest 3: Call next ticket...');
        const nextResult = await makeRequest('POST', '/queue/next', {
            service_id: 1,
            counter_id: 1,
            agent_id: 1
        });
        
        if (nextResult.data.success) {
            console.log(`✅ Called ticket: ${nextResult.data.ticket.number}`);
            console.log(`   State: ${nextResult.data.ticket.state}`);
            console.log(`   Called at: ${nextResult.data.ticket.called_at}`);
            
            const calledTicketId = nextResult.data.ticket.id;
            
            // Test 4: Recall the same ticket
            console.log('\nTest 4: Recall ticket...');
            const recallResult = await makeRequest('POST', '/queue/recall', {
                ticket_id: calledTicketId
            });
            console.log(`✅ Recall: ${recallResult.data.message}`);
            
            // Test 5: Start serving (transition to serving state)
            console.log('\nTest 5: Start serving...');
            // First we need to manually update the ticket to serving state
            // since we don't have that endpoint yet, we'll skip this
            
            // Test 6: Mark as no-show
            console.log('\nTest 6: Testing no-show...');
            const noShowResult = await makeRequest('POST', '/queue/no-show', {
                ticket_id: calledTicketId
            });
            console.log(`✅ No-show: ${noShowResult.data.message}`);
            
        } else {
            console.log('❌ Failed to call next ticket:', nextResult.data.message);
        }
        
        // Test 7: Call another ticket and complete it
        console.log('\nTest 7: Call and complete a ticket...');
        const next2Result = await makeRequest('POST', '/queue/next', {
            service_id: 1,
            counter_id: 2,
            agent_id: 1
        });
        
        if (next2Result.data.success) {
            console.log(`✅ Called ticket: ${next2Result.data.ticket.number}`);
            
            // For now, we can't test /end because ticket needs to be in SERVING state
            // We'll add that functionality in the next step
        }
        
        // Test 8: Check final queue status
        console.log('\nTest 8: Final queue status...');
        const finalQueue = await makeRequest('GET', '/queue/1');
        console.log(`✅ Final queue: ${finalQueue.data.queue.waiting.length} waiting`);
        console.log(`   Serving: ${finalQueue.data.queue.serving.length}`);
        console.log(`   Called: ${finalQueue.data.queue.called.length}`);
        
    } catch (error) {
        console.error('❌ Test error:', error.message);
    }
}

// Run the tests
runTests().then(() => {
    console.log('\n✅ Queue operation tests complete!');
});