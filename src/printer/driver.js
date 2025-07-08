// FlowMatic-SOLO R2C - Fixed ESC/POS Printer Driver
// File: /src/printer/driver.js
// COMPLETE REPLACEMENT - Copy this entire file content

const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ESC/POS Commands
const CMD = {
    INIT: '\x1B\x40',
    CUT: '\x1D\x56\x00',
    BOLD_ON: '\x1B\x45\x01',
    BOLD_OFF: '\x1B\x45\x00',
    ALIGN_CENTER: '\x1B\x61\x01',
    ALIGN_LEFT: '\x1B\x61\x00',
    SIZE_LARGE: '\x1D\x21\x11',
    SIZE_NORMAL: '\x1D\x21\x00',
    SIZE_DOUBLE_HEIGHT: '\x1D\x21\x01'
};

class PrinterDriver {
    constructor() {
        this.detectedPort = null;
        this.isWindows = process.platform === 'win32';
        this.printerName = process.env.PRINTER_NAME || 'EPSON TM-T82III';
    }

    /**
     * Find working printer port
     */
    async findPrinterPort() {
        console.log('🔍 === STARTING PRINTER DETECTION ===');
        
        if (this.detectedPort) {
            console.log(`✅ Using cached port: ${this.detectedPort}`);
            return this.detectedPort;
        }

        const possiblePorts = [
            '/dev/usb/lp0',
            '/dev/usb/lp1', 
            '/dev/usb/lp2',
            '/dev/lp0',
            '/dev/lp1'
        ];

        for (const port of possiblePorts) {
            console.log(`🔍 Testing port: ${port}`);
            try {
                await fs.access(port, fs.constants.F_OK | fs.constants.W_OK);
                console.log(`✅ FOUND WORKING PORT: ${port}`);
                this.detectedPort = port;
                return port;
            } catch (error) {
                console.log(`❌ Port ${port} failed: ${error.message}`);
            }
        }
        
        throw new Error('No accessible printer ports found');
    }

    /**
     * Send data directly to printer port
     */
    async sendToPrinter(data) {
        const port = await this.findPrinterPort();
        console.log(`🖨️  === SENDING TO PRINTER ===`);
        console.log(`Port: ${port}`);
        console.log(`Data length: ${data.length} bytes`);
        
        try {
            await fs.writeFile(port, data, 'binary');
            console.log(`✅ === DATA SENT SUCCESSFULLY ===`);
            return { success: true, port: port };
        } catch (error) {
            console.error(`❌ === SEND FAILED ===`);
            console.error(`Error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Test printer with simple message
     */
    async testPrinter() {
        console.log('🖨️  === TEST PRINTER CALLED ===');
        
        const testMessage = [
            CMD.INIT,
            CMD.ALIGN_CENTER,
            CMD.SIZE_LARGE,
            'FLOWMATIC TEST\n',
            CMD.SIZE_NORMAL,
            '\n',
            `Time: ${new Date().toLocaleString()}\n`,
            'If you see this,\n',
            'printer is working!\n',
            '\n\n\n',
            CMD.CUT
        ].join('');

        const result = await this.sendToPrinter(Buffer.from(testMessage, 'binary'));
        console.log('✅ === TEST PRINT COMPLETED ===');
        return { success: true, message: 'Test print sent successfully' };
    }

    /**
     * Print a ticket
     */
    async printTicket(ticket) {
        console.log(`🖨️  === PRINT TICKET ${ticket.number} ===`);
        
        const ticketData = [
            CMD.INIT,
            CMD.ALIGN_CENTER,
            CMD.SIZE_LARGE,
            CMD.BOLD_ON,
            'FLOWMATIC\n',
            CMD.BOLD_OFF,
            CMD.SIZE_NORMAL,
            '\n',
            CMD.SIZE_DOUBLE_HEIGHT,
            'General Service\n',
            CMD.SIZE_NORMAL,
            '\n',
            'Your Number\n',
            CMD.SIZE_LARGE,
            CMD.BOLD_ON,
            `${ticket.number}\n`,
            CMD.BOLD_OFF,
            CMD.SIZE_NORMAL,
            '\n',
            CMD.ALIGN_LEFT,
            `Date: ${new Date(ticket.issued_at).toLocaleDateString()}\n`,
            `Time: ${new Date(ticket.issued_at).toLocaleTimeString()}\n`,
            '\n',
            CMD.ALIGN_CENTER,
            'Please wait for your number\n',
            'to be called\n',
            '\n\n\n',
            CMD.CUT
        ].join('');

        const result = await this.sendToPrinter(Buffer.from(ticketData, 'binary'));
        console.log(`✅ === TICKET ${ticket.number} PRINTED ===`);
        return { success: true, ticketNumber: ticket.number };
    }

    /**
     * Get printer status
     */
    async getStatus() {
        try {
            const port = await this.findPrinterPort();
            return {
                connected: true,
                port: port,
                type: 'Linux Device',
                autoDetected: true
            };
        } catch (error) {
            return {
                connected: false,
                port: 'Not found',
                error: error.message
            };
        }
    }
}

module.exports = new PrinterDriver();