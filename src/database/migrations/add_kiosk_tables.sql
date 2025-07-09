-- File: /src/database/migrations/add_kiosk_tables.sql
-- Project: FlowMatic-SOLO R2C
-- Phase: 5 - Customer Interfaces
-- Purpose: Add kiosk-specific database tables and columns
-- Dependencies: Existing services and tickets tables
-- Created: 2025-07-10

-- ===================================================================
-- KIOSK SETTINGS TABLE
-- ===================================================================

CREATE TABLE IF NOT EXISTS kiosk_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    
    -- Language Settings
    global_language TEXT DEFAULT 'en',
    allow_language_override BOOLEAN DEFAULT true,
    
    -- Display Settings  
    show_rwt BOOLEAN DEFAULT true,
    show_ewt BOOLEAN DEFAULT true,
    show_queue_count BOOLEAN DEFAULT true,
    show_descriptions BOOLEAN DEFAULT false,
    
    -- Promotional Content
    promotion_enabled BOOLEAN DEFAULT false,
    promotion_message_en TEXT DEFAULT '',
    promotion_message_th TEXT DEFAULT '',
    promotion_message_hi TEXT DEFAULT '',
    
    -- Appearance Settings
    logo_url TEXT DEFAULT '',
    background_image TEXT DEFAULT '',
    primary_color TEXT DEFAULT '#4CAF50',
    
    -- Behavior Settings
    touch_sound_enabled BOOLEAN DEFAULT true,
    screen_saver_minutes INTEGER DEFAULT 5,
    auto_language_detect BOOLEAN DEFAULT false,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default kiosk settings
INSERT OR IGNORE INTO kiosk_settings (id) VALUES (1);

-- ===================================================================
-- KIOSK ANALYTICS TABLE  
-- ===================================================================

CREATE TABLE IF NOT EXISTS kiosk_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Ticket Information
    ticket_id INTEGER,
    service_id INTEGER NOT NULL,
    
    -- User Interaction Data
    language TEXT DEFAULT 'en',
    device_type TEXT DEFAULT 'kiosk',
    screen_resolution TEXT,
    user_agent TEXT,
    
    -- Queue Metrics
    queue_position INTEGER,
    estimated_wait INTEGER, -- minutes
    
    -- Session Data
    session_duration INTEGER, -- seconds on kiosk
    touch_count INTEGER DEFAULT 1,
    
    -- Timestamps
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS idx_kiosk_analytics_date ON kiosk_analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_kiosk_analytics_service ON kiosk_analytics(service_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_kiosk_analytics_language ON kiosk_analytics(language, timestamp);

-- ===================================================================
-- ENHANCE EXISTING TABLES
-- ===================================================================

-- Add kiosk-specific columns to tickets table
-- (Only if they don't already exist)

-- Language used when issuing ticket
ALTER TABLE tickets ADD COLUMN issued_language TEXT DEFAULT 'en';

-- Device information
ALTER TABLE tickets ADD COLUMN device_type TEXT DEFAULT 'kiosk';
ALTER TABLE tickets ADD COLUMN screen_resolution TEXT;

-- Add multilingual support to services table
-- (Only if they don't already exist)

-- Service descriptions in multiple languages
ALTER TABLE services ADD COLUMN description_en TEXT;
ALTER TABLE services ADD COLUMN description_th TEXT;  
ALTER TABLE services ADD COLUMN description_hi TEXT;

-- Service display settings
ALTER TABLE services ADD COLUMN icon TEXT DEFAULT '🏢';
ALTER TABLE services ADD COLUMN color TEXT DEFAULT '#4CAF50';

-- ===================================================================
-- UPDATE EXISTING DATA
-- ===================================================================

-- Set default colors for existing services
UPDATE services SET color = '#4CAF50' WHERE prefix = 'A' AND color IS NULL;
UPDATE services SET color = '#FF9800' WHERE prefix = 'B' AND color IS NULL;
UPDATE services SET color = '#9C27B0' WHERE prefix = 'V' AND color IS NULL;
UPDATE services SET color = '#2196F3' WHERE prefix = 'T' AND color IS NULL;

-- Set default icons for existing services
UPDATE services SET icon = '🏢' WHERE prefix = 'A' AND icon IS NULL;
UPDATE services SET icon = '💳' WHERE prefix = 'B' AND icon IS NULL;
UPDATE services SET icon = '⭐' WHERE prefix = 'V' AND icon IS NULL;
UPDATE services SET icon = '🔧' WHERE prefix = 'T' AND icon IS NULL;

-- Set default descriptions for existing services
UPDATE services SET description_en = name || ' - General inquiries and services' 
WHERE prefix = 'A' AND description_en IS NULL;

UPDATE services SET description_en = name || ' - Account opening and modifications' 
WHERE prefix = 'B' AND description_en IS NULL;

UPDATE services SET description_en = name || ' - Premium customer services' 
WHERE prefix = 'V' AND description_en IS NULL;

UPDATE services SET description_en = name || ' - Technical assistance and support' 
WHERE prefix = 'T' AND description_en IS NULL;

-- ===================================================================
-- KIOSK CONFIGURATION VIEWS
-- ===================================================================

-- View for easy kiosk configuration retrieval
CREATE VIEW IF NOT EXISTS kiosk_config_view AS
SELECT 
    ks.global_language,
    ks.allow_language_override,
    ks.show_rwt,
    ks.show_ewt,
    ks.show_queue_count,
    ks.show_descriptions,
    ks.promotion_enabled,
    ks.promotion_message_en,
    ks.promotion_message_th,
    ks.promotion_message_hi,
    ks.logo_url,
    ks.touch_sound_enabled,
    ks.screen_saver_minutes,
    COUNT(s.id) as active_services_count
FROM kiosk_settings ks
CROSS JOIN (SELECT COUNT(*) as id FROM services WHERE is_active = 1) s;

-- View for kiosk analytics summary
CREATE VIEW IF NOT EXISTS kiosk_analytics_summary AS
SELECT 
    DATE(timestamp) as date,
    service_id,
    language,
    device_type,
    COUNT(*) as tickets_issued,
    AVG(estimated_wait) as avg_estimated_wait,
    AVG(queue_position) as avg_queue_position,
    SUM(touch_count) as total_touches,
    AVG(session_duration) as avg_session_duration
FROM kiosk_analytics
GROUP BY DATE(timestamp), service_id, language, device_type;

-- ===================================================================
-- SAMPLE DATA FOR TESTING
-- ===================================================================

-- Insert sample promotional messages
UPDATE kiosk_settings SET 
    promotion_enabled = 1,
    promotion_message_en = '📱 Download our mobile app for faster service and queue updates!',
    promotion_message_th = '📱 ดาวน์โหลดแอปของเราเพื่อบริการที่รวดเร็วขึ้นและการอัปเดตคิว!',
    promotion_message_hi = '📱 तेज़ सेवा और क्यू अपडेट के लिए हमारा मोबाइल ऐप डाउनलोड करें!'
WHERE id = 1;

-- ===================================================================
-- KIOSK MAINTENANCE PROCEDURES
-- ===================================================================

-- Procedure to clean old analytics data (keep last 90 days)
-- Run this periodically to maintain performance
-- DELETE FROM kiosk_analytics WHERE timestamp < datetime('now', '-90 days');

-- Procedure to reset daily kiosk counters
-- This could be run via cron job at midnight
-- UPDATE kiosk_settings SET updated_at = datetime('now') WHERE id = 1;

-- ===================================================================
-- VERIFICATION QUERIES
-- ===================================================================

-- Verify kiosk tables were created successfully
-- SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kiosk_%';

-- Check kiosk settings
-- SELECT * FROM kiosk_settings;

-- Check service enhancements  
-- SELECT id, name, prefix, color, icon, description_en FROM services;

-- Check if analytics table is ready
-- SELECT COUNT(*) as analytics_ready FROM kiosk_analytics WHERE 1=0;