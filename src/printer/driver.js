// FlowMatic-SOLO R2C - ESC/POS Printer Driver
// File: /src/printer/driver.js
// Phase 1: Direct thermal printer integration
// Target: Epson TM-T82III or compatible

const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ESC/POS Commands
const CMD = {
    // Printer control
    INIT: '\x1B\x40',              // Initialize printer
    CUT: '\x1D\x56\x00',           // Full cut
    PARTIAL_CUT: '\x1D\x56\x01',   // Partial cut
    
    // Text formatting
    BOLD_ON: '\x1B\x45\x01',       // Bold on
    BOLD_OFF: '\x1B\x45\x00',      // Bold off
    UNDERLINE_ON: '\x1B\x2D\x01',  // Underline on
    UNDERLINE_OFF: '\x1B\x2D\x00', // Underline off
    
    // Text alignment
    ALIGN_LEFT: '\x1B\x61\x00',    // Left align
    ALIGN_CENTER: '\x1B\x61\x01',  // Center align
    ALIGN_RIGHT: '\x1B\x61\x02',   // Right align
    
    // Text size
    SIZE_NORMAL: '\x1D\x21\x00',   // Normal size
    SIZE_DOUBLE_HEIGHT: '\x1D\x21\x01', // Double height
    SIZE_DOUBLE_WIDTH: '\x1D\x21\x10',  // Double width
    SIZE_LARGE: '\x1D\x21\x11',    // Double width and height
    
    // Line spacing
    LINE_SPACING_DEFAULT: '\x1B\x32', // Default line spacing
    LINE_SPACING_SET: '\x1B\x33',     // Set line spacing (followed by n)
    
    // Paper feed
    FEED_LINE: '\x0A',             // Line feed
    FEED_LINES: '\x1B\x64',        // Feed n lines (followed by n)
};

class PrinterDriver {
    constructor() {
        this.port = process.env.PRINTER_PORT || '/dev/usb/lp0';
        this.type = process.env.PRINTER_TYPE || 'USB';
        this.isWindows = process.platform === 'win32';
        this.printerName = process.env.PRINTER_NAME || 'EPSON TM-T82III';
    }

    /**
     * Build command sequence from array of commands
     */
    buildCommand(commands) {
        return commands.join('');
    }

    /**
     * Send raw data to printer
     */
    async sendToPrinter(data) {
        try {
            if (this.isWindows) {
                // Windows: Use printer name
                return await this.sendWindows(data);
            } else {
                // Linux: Direct to device
                return await this.sendLinux(data);
            }
        } catch (error) {
            console.error('❌ Printer error:', error);
            throw new Error(`Failed to print: ${error.message}`);
        }
    }

    /**
     * Windows printing using printer name
     */
    async sendWindows(data) {
        // Create temporary file
        const tempFile = `temp_print_${Date.now()}.prn`;
        await fs.writeFile(tempFile, data, 'binary');
        
        try {
            // Send to printer using Windows print command
            await execPromise(`print /d:"${this.printerName}" ${tempFile}`);
            console.log('✅ Sent to Windows printer');
        } finally {
            // Clean up temp file
            await fs.unlink(tempFile).catch(() => {});
        }
    }

    /**
     * Linux printing directly to device
     */
    async sendLinux(data) {
        await fs.writeFile(this.port, data, 'binary');
        console.log('✅ Sent to Linux printer device');
    }

    /**
     * Test printer connection
     */
    async testPrinter() {
        const commands = [
            CMD.INIT,
            CMD.ALIGN_CENTER,
            CMD.SIZE_LARGE,
            'PRINTER TEST\n',
            CMD.SIZE_NORMAL,
            '\n',
            `Date: ${new Date().toLocaleString()}\n`,
            `Port: ${this.port}\n`,
            `Type: ${this.type}\n`,
            '\n',
            CMD.ALIGN_LEFT,
            'If you can read this,\n',
            'the printer is working!\n',
            '\n\n\n',
            CMD.CUT
        ];

        const data = this.buildCommand(commands);
        await this.sendToPrinter(Buffer.from(data, 'binary'));
        return { success: true, message: 'Test print sent successfully' };
    }

    /**
     * Print a ticket
     */
    async printTicket(ticket) {
        const commands = [
            CMD.INIT,
            // Header
            CMD.ALIGN_CENTER,
            CMD.SIZE_LARGE,
            CMD.BOLD_ON,
            `${process.env.COMPANY_NAME || 'FLOWMATIC'}\n`,
            CMD.BOLD_OFF,
            CMD.SIZE_NORMAL,
            '\n',
            
            // Service name
            CMD.SIZE_DOUBLE_HEIGHT,
            `${ticket.service_name || 'General Service'}\n`,
            CMD.SIZE_NORMAL,
            '\n',
            
            // Ticket number - the main focus
            'Your Number\n',
            CMD.SIZE_LARGE,
            CMD.BOLD_ON,
            `${ticket.number}\n`,
            CMD.BOLD_OFF,
            CMD.SIZE_NORMAL,
            '\n',
            
            // Date and time
            CMD.ALIGN_LEFT,
            `Date: ${new Date(ticket.issued_at).toLocaleDateString()}\n`,
            `Time: ${new Date(ticket.issued_at).toLocaleTimeString()}\n`,
            '\n',
            
            // Footer
            CMD.ALIGN_CENTER,
            'Please wait for your number\n',
            'to be called\n',
            '\n',
            
            // Barcode or QR code could go here
            
            '\n\n',
            CMD.CUT
        ];

        const data = this.buildCommand(commands);
        await this.sendToPrinter(Buffer.from(data, 'binary'));
        
        console.log(`✅ Printed ticket: ${ticket.number}`);
        return { success: true, ticketNumber: ticket.number };
    }

    /**
     * Get printer status (basic implementation)
     */
    async getStatus() {
        try {
            // For now, just check if we can access the printer port
            if (this.isWindows) {
                // Check if printer exists in Windows
                const { stdout } = await execPromise('wmic printer get name');
                const printerExists = stdout.includes(this.printerName);
                return {
                    connected: printerExists,
                    port: this.printerName,
                    type: 'Windows Printer'
                };
            } else {
                // Check if device exists in Linux
                await fs.access(this.port);
                return {
                    connected: true,
                    port: this.port,
                    type: 'Linux Device'
                };
            }
        } catch (error) {
            return {
                connected: false,
                port: this.port || this.printerName,
                error: error.message
            };
        }
    }
}

// Export singleton instance
module.exports = new PrinterDriver();
