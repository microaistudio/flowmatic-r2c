// File: /tests/test-state-manager.js
// Test the state management logic

const { StateManager, STATES, TRANSITIONS } = require('../src/models/StateManager');

console.log('🧪 Testing State Management Logic\n');

// Test 1: Valid transitions
console.log('Test 1: Valid State Transitions');
console.log('==============================');

const testTransitions = [
    { from: STATES.ISSUED, to: STATES.WAITING, expected: true },
    { from: STATES.WAITING, to: STATES.CALLED, expected: true },
    { from: STATES.CALLED, to: STATES.SERVING, expected: true },
    { from: STATES.SERVING, to: STATES.ENDED, expected: true },
    { from: STATES.CALLED, to: STATES.WAITING, expected: true }, // Recycle
    { from: STATES.WAITING, to: STATES.SERVING, expected: false }, // Invalid
    { from: STATES.ENDED, to: STATES.WAITING, expected: false }, // Invalid
];

testTransitions.forEach(test => {
    const result = StateManager.isValidTransition(test.from, test.to);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`${status} ${test.from} → ${test.to}: ${result}`);
});

// Test 2: Action-based transitions
console.log('\nTest 2: Action-Based Transitions');
console.log('================================');

const mockTickets = [
    { id: 1, state: STATES.ISSUED, action: TRANSITIONS.ISSUE },
    { id: 2, state: STATES.WAITING, action: TRANSITIONS.CALL_NEXT },
    { id: 3, state: STATES.CALLED, action: TRANSITIONS.START_SERVING },
    { id: 4, state: STATES.SERVING, action: TRANSITIONS.COMPLETE },
    { id: 5, state: STATES.CALLED, action: TRANSITIONS.NO_SHOW },
    { id: 6, state: STATES.CALLED, action: TRANSITIONS.RECYCLE },
    { id: 7, state: STATES.CALLED, action: TRANSITIONS.RECALL },
];

mockTickets.forEach(ticket => {
    const result = StateManager.validateTransition(ticket, ticket.action);
    if (result.valid) {
        console.log(`✅ Ticket ${ticket.id}: ${ticket.state} → ${result.newState} (${ticket.action})`);
        if (Object.keys(result.updates).length > 0) {
            console.log(`   Updates:`, result.updates);
        }
    } else {
        console.log(`❌ Ticket ${ticket.id}: ${result.error}`);
    }
});

// Test 3: State properties
console.log('\nTest 3: State Properties');
console.log('========================');

Object.values(STATES).forEach(state => {
    console.log(`${state}: "${StateManager.getStateName(state)}" (${StateManager.getStateColor(state)})`);
});

// Test 4: Time calculations
console.log('\nTest 4: Time in State');
console.log('====================');

const testTicket = {
    state: STATES.WAITING,
    issued_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 minutes ago
};

const timeInState = StateManager.getTimeInState(testTicket);
console.log(`Ticket in WAITING state for ${timeInState} seconds (~${Math.floor(timeInState / 60)} minutes)`);

console.log('\n✅ State Manager Tests Complete!');