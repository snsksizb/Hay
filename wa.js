const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

class WhatsAppSlaveBot {
    constructor(phoneNumber, telegramChatId) {
        this.phoneNumber = phoneNumber;
        this.telegramChatId = telegramChatId;
        this.sessionDir = `./session/${phoneNumber}`;
        this.logger = pino({ level: 'silent' });
    }

    async start() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
            const { version } = await fetchLatestBaileysVersion();

            this.sock = makeWASocket({
                version,
                logger: this.logger,
                printQRInTerminal: false,
                auth: state,
                browser: ['Danzy', 'Chrome', '1.0.0'],
                markOnlineOnConnect: true
            });

            // Generate pairing code
            setTimeout(async () => {
                try {
                    const code = await this.sock.requestPairingCode(this.phoneNumber);
                    console.log(`PAIRING_CODE:${code}`);
                    
                    // Monitor connection
                    this.monitorConnection();
                } catch (error) {
                    console.log(`ERROR:${error.message}`);
                }
            }, 3000);

            // Connection handler
            this.sock.ev.on('connection.update', (update) => {
                const { connection } = update;
                
                if (connection === 'open') {
                    console.log(`CONNECTED:${this.phoneNumber}`);
                    this.setupMessageHandler();
                }
                
                if (connection === 'close') {
                    console.log(`DISCONNECTED:${this.phoneNumber}`);
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

        } catch (error) {
            console.log(`ERROR:${error.message}`);
            process.exit(1);
        }
    }

    monitorConnection() {
        setTimeout(() => {
            if (!this.sock.user) {
                console.log('TIMEOUT:Failed to connect');
                process.exit(1);
            }
        }, 120000); // 2 menit timeout
    }

    setupMessageHandler() {
        this.sock.ev.on('messages.upsert', async (m) => {
            const msg = m.messages[0];
            if (!msg.key.fromMe && m.type === 'notify') {
                const messageText = msg.message?.conversation || 
                                  msg.message?.extendedTextMessage?.text || '';
                
                // Auto reply untuk testing
                if (messageText.toLowerCase() === 'ping') {
                    await this.sock.sendMessage(msg.key.remoteJid, { text: 'Pong! dari DANZY Bot' });
                }
            }
        });
    }

    async sendMessage(targetPhone, message) {
        try {
            if (!this.sock.user) {
                return { success: false, error: 'Not connected' };
            }

            const jid = targetPhone.includes('@') ? 
                       targetPhone : 
                       `${targetPhone}@s.whatsapp.net`;

            await this.sock.sendMessage(jid, { text: message });
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Run if called with arguments
if (process.argv.length >= 3) {
    const phoneNumber = process.argv[2];
    const telegramChatId = process.argv[3] || '';
    
    new WhatsAppSlaveBot(phoneNumber, telegramChatId).start();
}

module.exports = WhatsAppSlaveBot;
