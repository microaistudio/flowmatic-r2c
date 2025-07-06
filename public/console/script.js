cat > public/console/script.js << 'EOF'
// FlowMatic-SOLO R2C - Debug Console JavaScript
// File: /public/console/script.js
// Phase 1: Console functionality
// Handles all debug console interactions

// API base URL
const API_BASE = '/api';

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Debug Console initialized');
    
    // API base URL
    window.API_BASE = "/api";
    
    // Setup tab switching
    setupTabs();
    
    // Check server status
    checkServerStatus();
    
    // Load initial data
    loadTickets();
    
    // Auto-refresh tickets every 5 seconds
    setInterval(loadTickets, 5000);
});

// Tab switching functionality
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Add active to clicked tab
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            document.getElementById(`${tabName}-tab`).classList.add('active');
            
            // Load data for specific tabs
            if (tabName === 'printer') {
                checkPrinterStatus();
            }
        });
    });
}

// Check server status
async function checkServerStatus() {
    try {
        const response = await fetch('/health');
        const data = await response.json();
        
        if (data.status === 'ok') {
            document.getElementById('server-status').textContent = 
                `Server: Running (v${data.version})`;
            document.getElementById('server-status').style.color = '#4CAF50';
        }
    } catch (error) {
        document.getElementById('server-status').textContent = 'Server: Offline';
        document.getElementById('server-status').style.color = '#f44336';
    }
}

// Database Functions
async function loadTickets() {
    try {
        // First get all tickets from a custom endpoint we'll add
        const response = await fetch(`/api/tickets/all`);
        
        if (!response.ok) {
            // For now, show empty table
            document.getElementById('tickets-tbody').innerHTML = 
                '<tr><td colspan="7">No endpoint yet - coming soon!</td></tr>';
            return;
        }
        
        const data = await response.json();
        const tbody = document.getElementById('tickets-tbody');
        
        if (!data.tickets || data.tickets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No tickets found</td></tr>';
            return;
        }
        
        tbody.innerHTML = data.tickets.map(ticket => `
            <tr>
                <td>${ticket.id}</td>
                <td><strong>${ticket.number}</strong></td>
                <td>${ticket.state}</td>
                <td>${ticket.service_id}</td>
                <td>${new Date(ticket.issued_at).toLocaleString()}</td>
                <td>${ticket.printed ? '✅' : '❌'}</td>
                <td>
                    <button class="btn" onclick="printTicket(${ticket.id})">Print</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Error loading tickets:', error);
    }
}

async function issueTestTicket() {
    try {
        const response = await fetch(`/api/ticket`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Ticket ${data.ticket.number} issued successfully!`);
            loadTickets();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function clearTickets() {
    if (!confirm('Are you sure you want to clear all tickets?')) return;
    
    alert('Clear function will be implemented with database endpoint');
    // TODO: Implement when we have the endpoint
}

// API Tester Functions
async function testAPI(method, endpoint) {
    const response = await sendRequest(method, endpoint);
    document.getElementById('api-response').textContent = 
        JSON.stringify(response, null, 2);
}

async function sendCustomRequest() {
    const method = document.getElementById('method').value;
    const endpoint = document.getElementById('endpoint').value;
    
    if (!endpoint) {
        alert('Please enter an endpoint');
        return;
    }
    
    const response = await sendRequest(method, endpoint);
    document.getElementById('api-response').textContent = 
        JSON.stringify(response, null, 2);
}

async function sendRequest(method, endpoint, body = null) {
    try {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        
        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }
        
        const response = await fetch(endpoint, options);
        const data = await response.json();
        
        return {
            status: response.status,
            statusText: response.statusText,
            data
        };
    } catch (error) {
        return {
            error: error.message
        };
    }
}

// Printer Functions
async function checkPrinterStatus() {
    try {
        const response = await fetch(`/api/printer/status`);
        const data = await response.json();
        
        const statusDisplay = document.getElementById('printer-status-display');
        
        if (data.success && data.printer.connected) {
            statusDisplay.className = 'printer-status connected';
            statusDisplay.textContent = `Connected: ${data.printer.port}`;
        } else {
            statusDisplay.className = 'printer-status disconnected';
            statusDisplay.textContent = `Disconnected: ${data.printer.error || 'No printer found'}`;
        }
        
        document.getElementById('printer-response').textContent = 
            JSON.stringify(data, null, 2);
            
    } catch (error) {
        document.getElementById('printer-status-display').textContent = 
            'Error checking status';
    }
}

async function printTestPage() {
    try {
        const response = await fetch(`/api/printer/test`, {
            method: 'POST'
        });
        
        const data = await response.json();
        document.getElementById('printer-response').textContent = 
            JSON.stringify(data, null, 2);
            
        if (data.success) {
            alert('Test page sent to printer!');
        } else {
            alert(`Print failed: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function printLastTicket() {
    try {
        const response = await fetch(`/api/printer/last`, {
            method: 'POST'
        });
        
        const data = await response.json();
        document.getElementById('printer-response').textContent = 
            JSON.stringify(data, null, 2);
            
        if (data.success) {
            alert(`Ticket ${data.ticket.number} sent to printer!`);
        } else {
            alert(`Print failed: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function printTicket(ticketId) {
    try {
        const response = await fetch(`/api/printer/ticket/${ticketId}`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`Ticket ${data.ticket.number} sent to printer!`);
            loadTickets();
        } else {
            alert(`Print failed: ${data.error}`);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

console.log('✅ Debug Console script loaded');
EOF