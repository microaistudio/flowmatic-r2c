// File: /src/utils/timezone.js
// Timezone utility for consistent timestamp handling
// Version: 1.0.0
// Created: 2025-07-07
// Purpose: Handle timezone configuration from .env

const getTimezoneConfig = () => {
    const timezone = process.env.TIMEZONE || 'UTC';
    const useLocaltime = process.env.USE_LOCALTIME === 'true' || timezone !== 'UTC';
    
    return {
        timezone,
        useLocaltime,
        sqliteModifier: useLocaltime ? 'localtime' : null
    };
};

const getSQLiteTimeFunction = () => {
    const config = getTimezoneConfig();
    return config.sqliteModifier ? `datetime('now', '${config.sqliteModifier}')` : `datetime('now')`;
};

const getCurrentTimestamp = () => {
    const config = getTimezoneConfig();
    if (config.useLocaltime) {
        return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
};

module.exports = {
    getTimezoneConfig,
    getSQLiteTimeFunction,
    getCurrentTimestamp
};