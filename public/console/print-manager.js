// FlowMatic R2C - Print Manager (Local Service Mode)
// Direct USB printing via local service - NO BROWSER DIALOGS

class R2CPrintManager {
    constructor() {
        this.localServiceUrl = 'http://localhost:3001';
        this.config = {
            paperWidth: 80,
            encoding: 'UTF-8',
            companyName: 'FLOWMATIC'
        };
        this.init();
    }

    async init() {
        console.log('🖨️ R2C Print Manager initialized (Local Service Mode)');
        
        try {
            const response = await fetch(`${this.localServiceUrl}/status`);
            const status = await response.json();
            if (status.success) {
                console.log('✅ Local print service connected:', status);
                this.showStatus('success', 'Local print service ready');
            } else {
                console.log('⚠️ Local print service unavailable:', status);
                this.showStatus('warning', 'Local print service not available');
            }
        } catch (error) {
            console.log('❌ Local print service not running:', error.message);
            this.showStatus('error', 'Local print service not running on port 3001');
        }
        
        return true;
    }

    async printTicketData(ticketData) {
        console.log('🖨️ Printing via local service:', ticketData);
        
        try {
            const response = await fetch(`${this.localServiceUrl}/print`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(ticketData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Ticket printed successfully via local service');
                this.showStatus('success', 'Ticket printed to TM-T82III');
                return { success: true, message: 'Ticket printed successfully' };
            } else {
                throw new Error(result.error || 'Print failed');
            }
            
        } catch (error) {
            console.error('❌ Local service print failed:', error);
            this.showStatus('error', `Print failed: ${error.message}`);
            throw error;
        }
    }

    async printTest() {
        console.log('🧪 Printing test ticket via local service...');
        
        const testTicket = {
            number: 'TEST001',
            service: 'Test Service',
            wait: '0 minutes',
            position: '1',
            created: new Date().toLocaleTimeString()
        };
        
        return await this.printTicketData(testTicket);
    }

    async checkLocalService() {
        try {
            const response = await fetch(`${this.localServiceUrl}/status`);
            const status = await response.json();
            return status;
        } catch (error) {
            return { success: false, error: 'Local service not available' };
        }
    }

    showStatus(type, message) {
        const statusStyles = {
            success: 'background: #d4edda; color: #155724; border: 1px solid #c3e6cb;',
            error: 'background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;',
            warning: 'background: #fff3cd; color: #856404; border: 1px solid #ffeaa7;',
            info: 'background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb;'
        };
        
        console.log(`%c🖨️ ${message}`, statusStyles[type] || statusStyles.info);
        
        const statusEl = document.getElementById('printerStatus');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = `printer-status ${type}`;
            
            setTimeout(() => {
                statusEl.className = 'printer-status';
                statusEl.textContent = 'Ready for local service printing';
            }, 5000);
        }
    }
}

console.log('🚀 Loading R2C Print Manager (Local Service Mode)...');
window.r2cPrintManager = new R2CPrintManager();

window.testPrintR2C = async () => {
    try {
        await window.r2cPrintManager.printTest();
    } catch (error) {
        console.error('❌ Test print failed:', error);
        window.r2cPrintManager.showStatus('error', `Test print failed: ${error.message}`);
    }
};

window.printTicketFromData = async (ticketData) => {
    try {
        await window.r2cPrintManager.printTicketData(ticketData);
        return true;
    } catch (error) {
        console.error('❌ Print failed:', error);
        window.r2cPrintManager.showStatus('error', `Print failed: ${error.message}`);
        return false;
    }
};

window.checkLocalPrintService = async () => {
    const status = await window.r2cPrintManager.checkLocalService();
    console.log('Local print service status:', status);
    return status;
};