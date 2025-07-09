// File: /public/console/session-auth.js
// Session Auth Testing for Debug Console
// Phase 3+: Simple Auth Migration
// Created: 2025-07-08

// Global session state
let currentSessionId = null;
let currentSessionAgent = null;

// Add session auth buttons to the page
function addSessionAuthUI() {
    // Find the auth optgroup in the endpoint selector
    const authOptgroup = document.querySelector('optgroup[label="🔐 Authentication"]');
    
    if (authOptgroup) {
        // Add session auth endpoints
        const sessionEndpoints = [
            { value: 'POST:/api/auth/session/login', text: '🔑 [SESSION] Simple Login' },
            { value: 'POST:/api/auth/session/logout', text: '🚪 [SESSION] Simple Logout' },
            { value: 'GET:/api/auth/session/current', text: '📋 [SESSION] Current Session' },
            { value: 'POST:/api/auth/session/validate', text: '✅ [SESSION] Validate Session' },
            { value: 'GET:/api/auth/session/config', text: '⚙️ [SESSION] Auth Config' },
            { value: 'GET:/api/auth/session/test', text: '🧪 [SESSION] Test Routes' }
        ];
        
        sessionEndpoints.forEach(endpoint => {
            const option = document.createElement('option');
            option.value = endpoint.value;
            option.textContent = endpoint.text;
            authOptgroup.appendChild(option);
        });
    }
    
    // Add session templates
    Object.assign(endpointTemplates, {
        'POST:/api/auth/session/login': {
            body: '{\n  "username": "admin",\n  "password": "test123"\n}',
            description: 'Simple session login (password optional based on config)'
        },
        'POST:/api/auth/session/logout': {
            body: '{}',
            description: 'Logout session (requires session ID)'
        },
        'POST:/api/auth/session/validate': {
            body: '{\n  "sessionId": "sess_xxxxx"\n}',
            description: 'Validate a session ID'
        }
    });
    
    // Add quick session test buttons
    const apiTab = document.getElementById('api-tab');
    if (apiTab) {
        const sessionTestDiv = document.createElement('div');
        sessionTestDiv.style.cssText = 'margin: 20px 0; padding: 15px; border: 2px solid #00ff00; background: #003300;';
        sessionTestDiv.innerHTML = `
            <h3 style="margin-bottom: 10px; color: #00ff00;">🔑 Quick Session Auth Test</h3>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                <button onclick="quickSessionLogin('admin')" style="background: #004400;">Login as Admin</button>
                <button onclick="quickSessionLogin('agent2')" style="background: #004400;">Login as Agent2</button>
                <button onclick="checkSessionConfig()">Check Config</button>
                <button onclick="validateCurrentSession()">Validate Session</button>
                <button onclick="sessionLogout()" style="background: #660000;">Logout</button>
            </div>
            <div id="session-status" style="margin-top: 10px; padding: 10px; background: #000; border: 1px solid #00ff00; font-family: monospace; font-size: 12px;">
                Session Status: Not logged in
            </div>
        `;
        
        // Insert after the API tester header
        const h2 = apiTab.querySelector('h2');
        if (h2 && h2.nextSibling) {
            h2.parentNode.insertBefore(sessionTestDiv, h2.nextSibling);
        }
    }
}

// Quick session login
async function quickSessionLogin(username) {
    try {
        const response = await fetch('/api/auth/session/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: username, 
                password: 'test123' 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentSessionId = data.sessionId;
            currentSessionAgent = data.agent;
            
            // Update session status display
            updateSessionStatus(`✅ Logged in as ${data.agent.name} (${data.agent.username})\nSession ID: ${data.sessionId}\nExpires: ${new Date(data.expiresAt).toLocaleString()}`);
            
            // Auto-fill the session ID in custom headers for API testing
            document.getElementById('api-headers').value = JSON.stringify({
                'X-Session-ID': data.sessionId
            }, null, 2);
            
            // Show success in API response area too
            document.getElementById('api-response').textContent = 
                `Session Login Successful!\n\n` + JSON.stringify(data, null, 2);
        } else {
            updateSessionStatus(`❌ Login failed: ${data.error}`);
        }
    } catch (error) {
        updateSessionStatus(`❌ Error: ${error.message}`);
    }
}

// Check session config
async function checkSessionConfig() {
    try {
        const response = await fetch('/api/auth/session/config');
        const data = await response.json();
        
        updateSessionStatus(`⚙️ Session Configuration:\n${JSON.stringify(data.config, null, 2)}\n\n${data.message}`);
        document.getElementById('api-response').textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        updateSessionStatus(`❌ Error: ${error.message}`);
    }
}

// Validate current session
async function validateCurrentSession() {
    if (!currentSessionId) {
        updateSessionStatus('❌ No session ID available. Please login first.');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/session/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: currentSessionId })
        });
        
        const data = await response.json();
        
        if (data.valid) {
            updateSessionStatus(`✅ Session Valid!\n${JSON.stringify(data.session, null, 2)}`);
        } else {
            updateSessionStatus(`❌ Session Invalid: ${data.error}`);
            currentSessionId = null;
            currentSessionAgent = null;
        }
        
        document.getElementById('api-response').textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        updateSessionStatus(`❌ Error: ${error.message}`);
    }
}

// Session logout
async function sessionLogout() {
    if (!currentSessionId) {
        updateSessionStatus('❌ No active session to logout');
        return;
    }
    
    try {
        const response = await fetch('/api/auth/session/logout', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Session-ID': currentSessionId
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateSessionStatus('✅ Logged out successfully');
            currentSessionId = null;
            currentSessionAgent = null;
            document.getElementById('api-headers').value = '{}';
        } else {
            updateSessionStatus(`❌ Logout failed: ${data.error}`);
        }
        
        document.getElementById('api-response').textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        updateSessionStatus(`❌ Error: ${error.message}`);
    }
}

// Update session status display
function updateSessionStatus(message) {
    const statusEl = document.getElementById('session-status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    addSessionAuthUI();
    console.log('✅ Session auth UI loaded');
});

// Export functions to window for onclick handlers
window.quickSessionLogin = quickSessionLogin;
window.checkSessionConfig = checkSessionConfig;
window.validateCurrentSession = validateCurrentSession;
window.sessionLogout = sessionLogout;