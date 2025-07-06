// File: /src/models/StateManager.js
// State management logic for ticket transitions

// CRITICAL: Always use "state" not "status" (R2B lesson!)
const STATES = {
    ISSUED: 'issued',
    WAITING: 'waiting',
    CALLED: 'called',
    SERVING: 'serving',
    ENDED: 'ended'
};

// Valid state transitions
const VALID_TRANSITIONS = {
    [STATES.ISSUED]: [STATES.WAITING],
    [STATES.WAITING]: [STATES.CALLED],
    [STATES.CALLED]: [STATES.SERVING, STATES.WAITING], // Can recycle back to waiting
    [STATES.SERVING]: [STATES.ENDED],
    [STATES.ENDED]: [] // Terminal state
};

// Transition reasons/actions
const TRANSITIONS = {
    ISSUE: 'issue',
    CALL_NEXT: 'call_next',
    RECALL: 'recall',
    START_SERVING: 'start_serving',
    NO_SHOW: 'no_show',
    COMPLETE: 'complete',
    RECYCLE: 'recycle'
};

class StateManager {
    /**
     * Check if a state transition is valid
     * @param {string} fromState - Current state
     * @param {string} toState - Target state
     * @returns {boolean} - Whether transition is valid
     */
    static isValidTransition(fromState, toState) {
        const validStates = VALID_TRANSITIONS[fromState] || [];
        return validStates.includes(toState);
    }

    /**
     * Get valid next states from current state
     * @param {string} currentState - Current state
     * @returns {string[]} - Array of valid next states
     */
    static getValidNextStates(currentState) {
        return VALID_TRANSITIONS[currentState] || [];
    }

    /**
     * Validate and prepare state transition
     * @param {object} ticket - Current ticket object
     * @param {string} action - Transition action
     * @returns {object} - { valid, newState, updates, error }
     */
    static validateTransition(ticket, action) {
        const currentState = ticket.state;
        let newState = null;
        let updates = {};

        switch (action) {
            case TRANSITIONS.ISSUE:
                if (currentState === STATES.ISSUED) {
                    newState = STATES.WAITING;
                    updates.state = STATES.WAITING;
                }
                break;

            case TRANSITIONS.CALL_NEXT:
                if (currentState === STATES.WAITING) {
                    newState = STATES.CALLED;
                    updates.state = STATES.CALLED;
                    updates.called_at = new Date().toISOString();
                }
                break;

            case TRANSITIONS.RECALL:
                // RECALL doesn't change state, just notification
                if (currentState === STATES.CALLED) {
                    return { valid: true, newState: currentState, updates: {}, error: null };
                }
                break;

            case TRANSITIONS.START_SERVING:
                if (currentState === STATES.CALLED) {
                    newState = STATES.SERVING;
                    updates.state = STATES.SERVING;
                    updates.served_at = new Date().toISOString();
                }
                break;

            case TRANSITIONS.NO_SHOW:
                if (currentState === STATES.CALLED || currentState === STATES.SERVING) {
                    newState = STATES.ENDED;
                    updates.state = STATES.ENDED;
                    updates.ended_at = new Date().toISOString();
                    updates.is_no_show = true;
                    updates.transaction_completed = false;
                }
                break;

            case TRANSITIONS.COMPLETE:
                if (currentState === STATES.SERVING) {
                    newState = STATES.ENDED;
                    updates.state = STATES.ENDED;
                    updates.ended_at = new Date().toISOString();
                    updates.is_no_show = false;
                    updates.transaction_completed = true;
                }
                break;

            case TRANSITIONS.RECYCLE:
                if (currentState === STATES.CALLED) {
                    newState = STATES.WAITING;
                    updates.state = STATES.WAITING;
                    // Don't reset called_at, keep for history
                }
                break;

            default:
                return {
                    valid: false,
                    newState: null,
                    updates: {},
                    error: `Unknown action: ${action}`
                };
        }

        if (newState && this.isValidTransition(currentState, newState)) {
            return {
                valid: true,
                newState,
                updates,
                error: null
            };
        }

        return {
            valid: false,
            newState: null,
            updates: {},
            error: `Invalid transition: ${currentState} → ${newState || 'unknown'} via ${action}`
        };
    }

    /**
     * Get human-readable state name
     * @param {string} state - State code
     * @returns {string} - Human-readable name
     */
    static getStateName(state) {
        const names = {
            [STATES.ISSUED]: 'Issued',
            [STATES.WAITING]: 'Waiting',
            [STATES.CALLED]: 'Called',
            [STATES.SERVING]: 'Being Served',
            [STATES.ENDED]: 'Completed'
        };
        return names[state] || 'Unknown';
    }

    /**
     * Get state color for UI
     * @param {string} state - State code
     * @returns {string} - Color code
     */
    static getStateColor(state) {
        const colors = {
            [STATES.ISSUED]: '#gray',
            [STATES.WAITING]: '#blue',
            [STATES.CALLED]: '#orange',
            [STATES.SERVING]: '#green',
            [STATES.ENDED]: '#gray'
        };
        return colors[state] || '#gray';
    }

    /**
     * Calculate time in current state
     * @param {object} ticket - Ticket object
     * @returns {number} - Seconds in current state
     */
    static getTimeInState(ticket) {
        let startTime;
        
        switch (ticket.state) {
            case STATES.WAITING:
                startTime = ticket.issued_at;
                break;
            case STATES.CALLED:
                startTime = ticket.called_at;
                break;
            case STATES.SERVING:
                startTime = ticket.served_at;
                break;
            case STATES.ENDED:
                startTime = ticket.ended_at;
                break;
            default:
                startTime = ticket.issued_at;
        }

        if (!startTime) return 0;
        
        const start = new Date(startTime);
        const now = new Date();
        return Math.floor((now - start) / 1000); // Return seconds
    }
}

module.exports = {
    StateManager,
    STATES,
    TRANSITIONS
};