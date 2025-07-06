// File: /tests/debug-queue-endpoint.js
// Debug what the queue endpoint is actually returning

const http = require('http');

function testQueueEndpoint() {
    const options = {
        hostname: 'localhost',
        port: 5050,
        path: '/api/queue/1',
        method: 'GET'
    };

    const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
            data += chunk;
        });
        
        res.on('end', () => {
            console.log('Status Code:', res.statusCode);
            console.log('Raw Response:', data);
            
            try {
                const parsed = JSON.parse(data);
                console.log('\nParsed Response:');
                console.log(JSON.stringify(parsed, null, 2));
                
                // Check the structure
                if (parsed.queue) {
                    console.log('\nQueue object exists');
                    console.log('Queue keys:', Object.keys(parsed.queue));
                } else {
                    console.log('\nNo queue object in response');
                }
            } catch (e) {
                console.error('Failed to parse JSON:', e.message);
            }
        });
    });
    
    req.on('error', (e) => {
        console.error('Request error:', e);
    });
    
    req.end();
}

console.log('Testing GET /api/queue/1 endpoint...\n');
testQueueEndpoint();