-- FlowMatic-SOLO R2C - Database Schema
-- File: /src/database/schema.sql
-- Phase 1: Ticket Printer System
-- Minimal schema for ticket issuance only

-- Drop existing tables (for development)
DROP TABLE IF EXISTS tickets;

-- Tickets table - Phase 1 minimal version
CREATE TABLE tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL,              -- Format: A001, A002, etc.
    state TEXT NOT NULL DEFAULT 'issued',
    service_id INTEGER DEFAULT 1,      -- For now, just default service
    
    -- Timestamps
    issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    printed BOOLEAN DEFAULT false,
    
    -- Basic tracking
    created_date DATE DEFAULT (DATE('now', 'localtime'))  -- For daily reset
);

-- Index for quick lookups
CREATE INDEX idx_tickets_number ON tickets(number);
CREATE INDEX idx_tickets_date ON tickets(created_date);
CREATE INDEX idx_tickets_state ON tickets(state);

-- Insert a test ticket to verify
INSERT INTO tickets (number, state, printed) 
VALUES ('A001', 'issued', false);