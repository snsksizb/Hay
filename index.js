const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const moment = require('moment');

class TelegramMasterBot {
    constructor() {
        this.token = '7016192874:AAEO7f9MCg82L0aNL1DklSQQHvkVxaRY3rk'; // Ganti dengan token Anda
        this.masterChatId = '7804835628'; // Ganti dengan chat ID Anda
        this.bot = new TelegramBot(this.token, { polling: true });
        this.sessions = new Map();
        this.setupDatabase();
        this.setupCommands();
        this.startServer();
    }

    setupDatabase() {
        this.dbPath = './database/sessions.json';
        this.ensureDatabase();
    }

    ensureDatabase() {
        if (!fs.existsSync('./database')) {
            fs.mkdirSync('./database');
        }
        
        if (!fs.existsSync(this.dbPath)) {
            fs.writeFileSync(this.dbPath, JSON.stringify({
                sessions: [],
                messages: [],
                config: { maxSessions: 5, autoReconnect: true }
            }, null, 2));
        }
    }

    setupCommands() {
        // Start command
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const welcome = `
🤖 **DANZY MAXIMAL WHATSAPP SYSTEM**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ *Dual Bot Architecture Active*

*Fitur Utama:*
• /addsender - Tambah sender WhatsApp baru
• /listsenders - Lihat semua sender
• /send [nomor] [pesan] - Kirim via sender
• /broadcast [pesan] - Kirim ke semua kontak
• /status - Status koneksi
• /logs - Lihat aktivitas
• /removesender [nomor] - Hapus sender

*Cara pakai:*
1. /addsender untuk daftar nomor baru
2. Masukkan nomor WhatsApp
3. Dapatkan kode pairing 8 digit
4. Hubungkan di WhatsApp Anda
            `;
            this.bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
        });

        // Add new sender
        this.bot.onText(/\/addsender/, (msg) => {
            const chatId = msg.chat.id;
            
            const message = `
🔄 **MENAMBAH SENDER WHATSAPP BARU**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 Masukkan nomor WhatsApp:
Format: 6281234567890 atau 081234567890
            `;
            
            this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            
            this.bot.once('message', async (response) => {
                if (response.text.startsWith('/')) return;
                
                const phoneNumber = response.text.trim();
                
                if (!this.validatePhoneNumber(phoneNumber)) {
                    this.bot.sendMessage(chatId, "❌ Format nomor salah! Gunakan 628xxx atau 08xxx");
                    return;
                }

                await this.addNewSender(chatId, phoneNumber);
            });
        });

        // List senders
        this.bot.onText(/\/listsenders/, (msg) => {
            const chatId = msg.chat.id;
            const sessions = this.getSessions();
            
            if (sessions.length === 0) {
                this.bot.sendMessage(chatId, "❌ Belum ada sender yang terhubung");
                return;
            }

            let message = "📱 **SENDER TERHUBUNG:**\n\n";
            sessions.forEach((session, index) => {
                const statusEmoji = session.status === 'connected' ? '🟢' : '🔴';
                message += `${index + 1}. ${statusEmoji} ${session.phoneNumber}\n`;
                message += `   Status: ${session.status}\n`;
                message += `   Added: ${moment(session.addedAt).format('DD/MM/YY HH:mm')}\n\n`;
            });
            
            this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        });

        // Send message
        this.bot.onText(/\/send (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const args = match[1].split(' ');
            const targetPhone = args[0];
            const message = args.slice(1).join(' ');
            
            if (!targetPhone || !message) {
                this.bot.sendMessage(chatId, "❌ Format: /send 628xxx pesan yang ingin dikirim");
                return;
            }

            await this.sendMessage(chatId, targetPhone, message);
        });

        // Broadcast message
        this.bot.onText(/\/broadcast (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const message = match[1];
            
            await this.broadcastMessage(chatId, message);
        });

        // Remove sender
        this.bot.onText(/\/removesender (.+)/, (msg, match) => {
            const chatId = msg.chat.id;
            const phoneNumber = match[1];
            
            this.removeSender(chatId, phoneNumber);
        });

        // Status
        this.bot.onText(/\/status/, (msg) => {
            const chatId = msg.chat.id;
            const sessions = this.getSessions();
            
            const totalSenders = sessions.length;
            const connectedSenders = sessions.filter(s => s.status === 'connected').length;
            
            const message = `
📊 **STATUS SISTEM**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *Bot Telegram:* Online
📱 *Total Senders:* ${totalSenders}
🟢 *Connected:* ${connectedSenders}
🔴 *Disconnected:* ${totalSenders - connectedSenders}
📊 *Messages Sent:* ${this.getMessageCount()}
⏰ *Last Update:* ${moment().format('DD/MM/YY HH:mm:ss')}
            `;
            
            this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        });

        // Logs
        this.bot.onText(/\/logs/, (msg) => {
            const chatId = msg.chat.id;
            const logs = this.getRecentLogs();
            
            let message = "📊 **AKTIVITAS TERBARU:**\n\n";
            logs.slice(-10).forEach(log => {
                message += `• ${moment(log.timestamp).format('HH:mm')} - ${log.action}\n`;
            });
            
            this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        });
    }

    async addNewSender(telegramChatId, phoneNumber) {
        showLoading(telegramChatId, "Membuat kode pairing...");
        
        const formatted = phoneNumber.startsWith('08') 
            ? '62' + phoneNumber.slice(1) 
            : phoneNumber;

        try {
            // Spawn WhatsApp bot
            const { spawn } = require('child_process');
            const child = spawn('node', ['whatsapp-slave.js', formatted, telegramChatId], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let code = null;
            let error = null;

            child.stdout.on('data', (data) => {
                const output = data.toString();
                if (output.includes('PAIRING_CODE:')) {
                    code = output.split('PAIRING_CODE:')[1].trim();
                }
            });

            child.stderr.on('data', (data) => {
                error = data.toString();
            });

            // Timeout 60 detik
            setTimeout(() => {
                child.kill();
                
                if (code) {
                    this.sendPairingCode(telegramChatId, formatted, code);
                    this.logActivity(`Generated pairing code for ${formatted}`);
                } else {
                    this.bot.sendMessage(telegramChatId, `❌ Error: ${error || 'Timeout'}`);
                }
            }, 60000);

        } catch (error) {
            this.bot.sendMessage(telegramChatId, `❌ Error: ${error.message}`);
        }
    }

    sendPairingCode(chatId, phoneNumber, code) {
        const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
        
        const message = `
✅ **KODE PAIRING DIHASILKAN**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 **Nomor:** ${phoneNumber}
🔐 **Kode:** \`${formattedCode}\`
⏱️ **Berlaku:** 2 menit

📝 **Langkah selanjutnya:**
1. Buka WhatsApp di HP Anda
2. Ketuk titik tiga (⋮) → Perangkat tertaut
3. Pilih "Hubungkan perangkat"
4. Masukkan kode: **${formattedCode}**

⚡ *Bot akan otomatis terhubung dalam 30 detik*
        `;
        
        this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }

    async sendMessage(chatId, targetPhone, message) {
        const sessions = this.getSessions();
        const connected = sessions.filter(s => s.status === 'connected');
        
        if (connected.length === 0) {
            this.bot.sendMessage(chatId, "❌ Tidak ada sender yang online");
            return;
        }

        // Gunakan sender pertama yang tersedia
        const sender = connected[0];
        
        try {
            // Kirim via HTTP API ke WhatsApp bot
            const result = await this.sendViaWhatsApp(sender.phoneNumber, targetPhone, message);
            
            if (result.success) {
                this.bot.sendMessage(chatId, `
✅ **PESAN TERKIRIM**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 *Dari:* ${sender.phoneNumber}
📲 *Ke:* ${targetPhone}
💬 *Pesan:* ${message}
⏰ *Waktu:* ${moment().format('HH:mm:ss')}
                `, { parse_mode: 'Markdown' });
                
                this.logMessage(sender.phoneNumber, targetPhone, message);
            } else {
                this.bot.sendMessage(chatId, `❌ Gagal kirim: ${result.error}`);
            }
        } catch (error) {
            this.bot.sendMessage(chatId, `❌ Error: ${error.message}`);
        }
    }

    async broadcastMessage(chatId, message) {
        const sessions = this.getSessions();
        const connected = sessions.filter(s => s.status === 'connected');
        
        if (connected.length === 0) {
            this.bot.sendMessage(chatId, "❌ Tidak ada sender yang online");
            return;
        }

        let successCount = 0;
        for (const sender of connected) {
            // Implementasi broadcast ke kontak
            // Di real implementasi, baca kontak dari phonebook
        }

        this.bot.sendMessage(chatId, `📊 Broadcast selesai ke ${successCount} kontak`);
    }

    validatePhoneNumber(phone) {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10 && (cleaned.startsWith('62') || cleaned.startsWith('08'));
    }

    getSessions() {
        try {
            const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
            return data.sessions || [];
        } catch {
            return [];
        }
    }

    getMessageCount() {
        try {
            const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
            return data.messages ? data.messages.length : 0;
        } catch {
            return 0;
        }
    }

    getRecentLogs() {
        try {
            const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
            return data.messages ? data.messages.slice(-20) : [];
        } catch {
            return [];
        }
    }

    logActivity(action) {
        try {
            const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
            if (!data.messages) data.messages = [];
            
            data.messages.push({
                action,
                timestamp: new Date().toISOString()
            });
            
            fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
        } catch {}
    }

    logMessage(from, to, message) {
        this.logActivity(`Sent message from ${from} to ${to}: ${message.substring(0, 50)}...`);
    }

    startServer() {
        console.log('🤖 Telegram Master Bot Started!');
        console.log('📱 Ready to manage WhatsApp senders');
    }

    removeSender(chatId, phoneNumber) {
        const sessions = this.getSessions();
        const filtered = sessions.filter(s => s.phoneNumber !== phoneNumber);
        
        const data = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        data.sessions = filtered;
        fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
        
        this.bot.sendMessage(chatId, `✅ Sender ${phoneNumber} dihapus`);
    }
}

module.exports = TelegramMasterBot;

// Jalankan langsung
if (require.main === module) {
    new TelegramMasterBot();
}
