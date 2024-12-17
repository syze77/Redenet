import { app, BrowserWindow, ipcMain } from 'electron';
import puppeteer from 'puppeteer-core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import hydraBot from 'hydra-bot';

// Resolver __dirname e __filename para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cookiesPath = path.join(__dirname, 'cookies.json');
let browser;
let page;
let activeChats = 0;
let waitingList = [];
const maxActiveChats = 4;
let browserRunning = false;  // Flag para evitar reinicialização do navegador
let hydraRunning = false;    // Flag para evitar reinicialização do Hydra
let hydraConnectionActive = false;  // Flag para verificar se a conexão Hydra está ativa

function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true, // Context isolation ativado para maior segurança
        },
    });
    win.loadURL('http://localhost:4200'); // URL do frontend Angular
    return win;
}

async function startBrowser() {
    if (browserRunning) {
        console.log('O navegador já está em execução.');
        return;
    }

    try {
        console.log('Iniciando o navegador...');
        browserRunning = true;
        browser = await puppeteer.launch({
            headless: false,
            executablePath,
            slowMo: 100,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        page = await browser.newPage();
        console.log('Página aberta com sucesso.');
        await loadCookies(page);
        await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });

        // Espera explícita de 40 segundos antes de configurar o Hydra
        await new Promise(resolve => setTimeout(resolve, 40000));  // Atraso de 40 segundos

        await setupHydra();
    } catch (err) {
        console.error('Erro ao iniciar o navegador:', err);
        if (browser) await browser.close();
        browserRunning = false;
    }
}

async function saveCookies(page) {
    try {
        const cookies = await page.cookies();
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
        console.log('Cookies salvos com sucesso.');
    } catch (error) {
        console.error('Erro ao salvar cookies:', error);
    }
}

async function loadCookies(page) {
    try {
        if (fs.existsSync(cookiesPath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
            for (const cookie of cookies) {
                await page.setCookie(cookie);
            }
            console.log('Cookies carregados com sucesso.');
        }
    } catch (error) {
        console.error('Erro ao carregar cookies:', error);
    }
}

async function setupHydra() {
    if (hydraRunning) {
        console.log('O Hydra já está em execução.');
        return;
    }

    try {
        console.log('Configurando o Hydra...');
        hydraRunning = true;
        const ev = await hydraBot.initServer({
            puppeteerOptions: {
                headless: false,
                devtools: true,
            },
            timeAutoClose: 0,
            printQRInTerminal: true,
        });

        ev.on('connection', async (conn) => {
            console.log('Status da conexão:', conn);
            if (conn.connect) {
                console.log('Conexão Hydra estabelecida.');
                hydraConnectionActive = true; // Marca a conexão como ativa
                await startListeningForMessages(conn);
            } else {
                console.log('Erro na conexão Hydra.');
                hydraConnectionActive = false;
            }
        });

        ev.on('qrcode', (qrcode) => {
            console.log('QR Code gerado pelo Hydra:', qrcode);
        });

        await ev.client.ev.emit('setPage', page);
    } catch (error) {
        console.error('Erro ao configurar o Hydra:', error);
        if (browser) await browser.close();
        browserRunning = false;
        hydraRunning = false;  // Resetando a flag para tentar novamente
        // Evita reiniciar o Hydra sem necessidade
        if (!hydraConnectionActive) await startBrowser();
    }
}

async function startListeningForMessages(conn) {
    conn.client.ev.on('newMessage', async (newMsg) => {
        if (newMsg && newMsg.result) {
            const msg = newMsg.result;
            if (!msg.fromMe) {
                const messageText = msg.body.toLowerCase();
                const chatId = msg.chatId;
                console.log('Mensagem recebida:', messageText);

                // Evitar múltiplas respostas para a mesma mensagem
                if (!msg.answered) {  // Marque a mensagem como respondida
                    msg.answered = true; // Flag para marcar a mensagem como respondida
                    if (messageText.startsWith('nome:')) {
                        const userInfo = parseUserInfo(messageText);
                        if (userInfo) {
                            if (activeChats < maxActiveChats) {
                                activeChats++;
                                console.log('Atendendo novo chat...');
                                await conn.client.sendMessage({
                                    to: chatId,
                                    body: 'Obrigado pelas informações! Estamos iniciando seu atendimento.',
                                    options: { type: 'sendText' },
                                });
                            } else {
                                waitingList.push({ chatId, ...userInfo });
                                console.log('Usuário na fila de espera');
                                await conn.client.sendMessage({
                                    to: chatId,
                                    body: 'Você está na lista de espera. Aguarde sua vez.',
                                    options: { type: 'sendText' },
                                });
                            }
                            sendUpdateToRenderer();
                        } else {
                            await conn.client.sendMessage({
                                to: chatId,
                                body: 'Por favor, insira suas informações no formato correto: Nome: [seu nome], Cidade: [sua cidade], Cargo: [seu cargo], Escola: [sua escola]',
                                options: { type: 'sendText' },
                            });
                        }
                    } else {
                        await conn.client.sendMessage({
                            to: chatId,
                            body: `Olá! Para iniciarmos seu atendimento, envie suas informações no formato abaixo:
                            
Nome completo:
Cidade:
Cargo: (Aluno, Supervisor, Secretário, Professor, Administrador, Responsável)
Escola: (Informe o nome da escola, se você for Aluno, Responsável, Professor ou Supervisor)

⚠️ Atenção: Certifique-se de preencher todas as informações corretamente para agilizar o atendimento.`,
                            options: { type: 'sendText' },
                        });
                    }
                }
            }
        }
    });

    conn.client.ev.on('chatClosed', async (chatId) => {
        activeChats--;
        sendUpdateToRenderer();
    });
}

function parseUserInfo(messageText) {
    const info = {};
    const lines = messageText.split('\n');
    for (const line of lines) {
        const [key, ...value] = line.split(':');
        if (key && value) {
            info[key.trim().toLowerCase()] = value.join(':').trim();
        }
    }
    if (info['nome'] && info['cidade'] && info['cargo'] && info['escola']) {
        return {
            nome: info['nome'],
            cidade: info['cidade'],
            cargo: info['cargo'],
            escola: info['escola'],
        };
    }
    return null;
}

function sendUpdateToRenderer() {
    ipcMain.emit('sendStatusUpdate', {
        activeChats,
        waitingList,
    });
}

export async function runBot() {
    console.log('Bot iniciado...');
    await startBrowser();
}

app.whenReady().then(async () => {
    const win = createWindow();
    await startBrowser();
    ipcMain.on('sendStatusUpdate', (event, statusUpdate) => {
        win.webContents.send('statusUpdate', statusUpdate);
    });
    ipcMain.on('runBot', runBot);
});
