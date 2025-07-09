// File: /flowmatic-r2c/src/config/features.js
// Purpose: Feature toggles configuration
// Created: 2025-07-10
// Phase: 4 - Advanced Features

// Feature toggle configuration
// Can be controlled via environment variables or config file
const features = {
    // Queue Operations
    ENABLE_PARK: process.env.ENABLE_PARK !== 'false', // Default: true
    ENABLE_TRANSFER: process.env.ENABLE_TRANSFER !== 'false', // Default: true
    ENABLE_RECYCLE: process.env.ENABLE_RECYCLE !== 'false', // Default: true
    
    // Real-time Features
    ENABLE_SOCKET_IO: process.env.ENABLE_SOCKET_IO !== 'false', // Default: true
    ENABLE_HEARTBEAT: process.env.ENABLE_HEARTBEAT !== 'false', // Default: true
    
    // Reporting
    ENABLE_REPORTS: process.env.ENABLE_REPORTS !== 'false', // Default: true
    ENABLE_DAILY_REPORTS: process.env.ENABLE_DAILY_REPORTS !== 'false', // Default: true
    ENABLE_AGENT_REPORTS: process.env.ENABLE_AGENT_REPORTS !== 'false', // Default: true
    ENABLE_SERVICE_REPORTS: process.env.ENABLE_SERVICE_REPORTS !== 'false', // Default: true
    
    // Authentication
    ENABLE_JWT_AUTH: process.env.ENABLE_JWT_AUTH !== 'false', // Default: true
    ENABLE_SESSION_AUTH: process.env.ENABLE_SESSION_AUTH !== 'false', // Default: true
    
    // Debug Features
    ENABLE_DEBUG_CONSOLE: process.env.ENABLE_DEBUG_CONSOLE !== 'false', // Default: true
    ENABLE_SQL_QUERIES: process.env.ENABLE_SQL_QUERIES !== 'false', // Default: true
    
    // Printer Features
    ENABLE_PRINTING: process.env.ENABLE_PRINTING !== 'false', // Default: true
    ENABLE_PRINTER_STATUS: process.env.ENABLE_PRINTER_STATUS !== 'false', // Default: true
    
    // Queue Behavior
    MAX_RECYCLE_COUNT: parseInt(process.env.MAX_RECYCLE_COUNT) || 3,
    DEFAULT_RECYCLE_POSITION: parseInt(process.env.DEFAULT_RECYCLE_POSITION) || 3,
    NO_SHOW_TIMEOUT_MINUTES: parseInt(process.env.NO_SHOW_TIMEOUT_MINUTES) || 5,
    
    // System Limits
    MAX_TICKETS_PER_SERVICE: parseInt(process.env.MAX_TICKETS_PER_SERVICE) || 999,
    MAX_PARKED_TICKETS_PER_AGENT: parseInt(process.env.MAX_PARKED_TICKETS_PER_AGENT) || 10,
    SESSION_TIMEOUT_HOURS: parseInt(process.env.SESSION_TIMEOUT_HOURS) || 8,
    
    // UI Features (for Phase 5)
    ENABLE_KIOSK_MODE: process.env.ENABLE_KIOSK_MODE !== 'false', // Default: true
    ENABLE_PUBLIC_MONITOR: process.env.ENABLE_PUBLIC_MONITOR !== 'false', // Default: true
    ENABLE_AGENT_TERMINAL: process.env.ENABLE_AGENT_TERMINAL !== 'false', // Default: true
    ENABLE_OPS_DASHBOARD: process.env.ENABLE_OPS_DASHBOARD !== 'false', // Default: true
    
    // Voice Features (for Phase 5)
    ENABLE_VOICE_ANNOUNCEMENTS: process.env.ENABLE_VOICE_ANNOUNCEMENTS === 'true', // Default: false
    VOICE_LANGUAGE: process.env.VOICE_LANGUAGE || 'en-US', // Default: English
    
    // Business Rules
    ALLOW_DUPLICATE_TICKETS: process.env.ALLOW_DUPLICATE_TICKETS === 'true', // Default: false
    REQUIRE_AGENT_LOGIN: process.env.REQUIRE_AGENT_LOGIN !== 'false', // Default: true
    AUTO_CLOSE_COUNTERS: process.env.AUTO_CLOSE_COUNTERS === 'true', // Default: false
    
    // Development Features
    ENABLE_HOT_RELOAD: process.env.NODE_ENV === 'development',
    ENABLE_ERROR_DETAILS: process.env.NODE_ENV === 'development',
    ENABLE_REQUEST_LOGGING: process.env.NODE_ENV === 'development'
};

// Helper function to check if a feature is enabled
function isEnabled(featureName) {
    if (!(featureName in features)) {
        console.warn(`Unknown feature: ${featureName}`);
        return false;
    }
    return features[featureName];
}

// Helper function to get feature value (for non-boolean features)
function getFeatureValue(featureName, defaultValue = null) {
    if (!(featureName in features)) {
        console.warn(`Unknown feature: ${featureName}`);
        return defaultValue;
    }
    return features[featureName];
}

// Helper function to override features at runtime (useful for testing)
function setFeature(featureName, value) {
    if (!(featureName in features)) {
        console.warn(`Unknown feature: ${featureName}`);
        return false;
    }
    features[featureName] = value;
    console.log(`Feature ${featureName} set to ${value}`);
    return true;
}

// Get all features (for admin panel)
function getAllFeatures() {
    return { ...features };
}

// Get feature categories (for organized display)
function getFeaturesByCategory() {
    return {
        queue: {
            ENABLE_PARK: features.ENABLE_PARK,
            ENABLE_TRANSFER: features.ENABLE_TRANSFER,
            ENABLE_RECYCLE: features.ENABLE_RECYCLE,
            MAX_RECYCLE_COUNT: features.MAX_RECYCLE_COUNT,
            DEFAULT_RECYCLE_POSITION: features.DEFAULT_RECYCLE_POSITION,
            NO_SHOW_TIMEOUT_MINUTES: features.NO_SHOW_TIMEOUT_MINUTES
        },
        realtime: {
            ENABLE_SOCKET_IO: features.ENABLE_SOCKET_IO,
            ENABLE_HEARTBEAT: features.ENABLE_HEARTBEAT
        },
        reports: {
            ENABLE_REPORTS: features.ENABLE_REPORTS,
            ENABLE_DAILY_REPORTS: features.ENABLE_DAILY_REPORTS,
            ENABLE_AGENT_REPORTS: features.ENABLE_AGENT_REPORTS,
            ENABLE_SERVICE_REPORTS: features.ENABLE_SERVICE_REPORTS
        },
        auth: {
            ENABLE_JWT_AUTH: features.ENABLE_JWT_AUTH,
            ENABLE_SESSION_AUTH: features.ENABLE_SESSION_AUTH,
            REQUIRE_AGENT_LOGIN: features.REQUIRE_AGENT_LOGIN,
            SESSION_TIMEOUT_HOURS: features.SESSION_TIMEOUT_HOURS
        },
        printing: {
            ENABLE_PRINTING: features.ENABLE_PRINTING,
            ENABLE_PRINTER_STATUS: features.ENABLE_PRINTER_STATUS
        },
        ui: {
            ENABLE_DEBUG_CONSOLE: features.ENABLE_DEBUG_CONSOLE,
            ENABLE_KIOSK_MODE: features.ENABLE_KIOSK_MODE,
            ENABLE_PUBLIC_MONITOR: features.ENABLE_PUBLIC_MONITOR,
            ENABLE_AGENT_TERMINAL: features.ENABLE_AGENT_TERMINAL,
            ENABLE_OPS_DASHBOARD: features.ENABLE_OPS_DASHBOARD
        },
        voice: {
            ENABLE_VOICE_ANNOUNCEMENTS: features.ENABLE_VOICE_ANNOUNCEMENTS,
            VOICE_LANGUAGE: features.VOICE_LANGUAGE
        },
        limits: {
            MAX_TICKETS_PER_SERVICE: features.MAX_TICKETS_PER_SERVICE,
            MAX_PARKED_TICKETS_PER_AGENT: features.MAX_PARKED_TICKETS_PER_AGENT
        },
        development: {
            ENABLE_HOT_RELOAD: features.ENABLE_HOT_RELOAD,
            ENABLE_ERROR_DETAILS: features.ENABLE_ERROR_DETAILS,
            ENABLE_REQUEST_LOGGING: features.ENABLE_REQUEST_LOGGING,
            ENABLE_SQL_QUERIES: features.ENABLE_SQL_QUERIES
        }
    };
}

// Middleware to check features in routes
function requireFeature(featureName) {
    return (req, res, next) => {
        if (!isEnabled(featureName)) {
            return res.status(403).json({
                error: 'Feature disabled',
                feature: featureName,
                message: `The ${featureName} feature is currently disabled`
            });
        }
        next();
    };
}

// Export all functions and features
module.exports = {
    features,
    isEnabled,
    getFeatureValue,
    setFeature,
    getAllFeatures,
    getFeaturesByCategory,
    requireFeature
};