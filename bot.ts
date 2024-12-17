import { ipcMain, BrowserWindow, app } from 'electron';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import hydraBot from 'hydra-bot';

// Caminhos importantes
const executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const cookiesPath = path.join(__dirname, 'cookies.json');

// Estado global encapsulado
const appState = {
  browser: undefined as Browser | undefined,
  page: undefined as Page | undefined,
  activeChats: 0,
  waitingList: [] as { chatId: string; nome: string; cidade: string; cargo: string; escola: string }[],
  maxActiveChats: 4,
};

interface UserInfo {
  nome: string;
  cidade: string;
  cargo: string;
  escola: string;
}

type HydraConnection = {
  connect: boolean;
  client: {
    ev: {
      on: (event: string, callback: (data: any) => void) => void;
    };
    sendMessage: (message: { to: string; body: string; options: { type: string } }) => Promise<void>;
  };
};

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
    },
  });

  win.loadURL('http://localhost:4200'); // URL do frontend Angular

  return win;
}

app.whenReady().then(async () => {
  const win = createWindow();
  await startBrowser();

  ipcMain.on('sendStatusUpdate', (_, statusUpdate) => {
    win.webContents.send('statusUpdate', statusUpdate); // Envia status para o Angular
  });

  ipcMain.on('runBot', async () => {
    console.log('Bot iniciado...');
    await startBrowser(); // Inicia o navegador e configura o bot
  });
});

async function startBrowser(): Promise<void> {
  try {
    if (appState.browser) {
      console.log('O navegador já está em execução.');
      return;
    }

    console.log('Iniciando o navegador...');
    appState.browser = await puppeteer.launch({
      headless: false,
      executablePath,
      slowMo: 100,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    appState.page = await appState.browser.newPage();
    console.log('Página aberta com sucesso.');

    await loadCookies(appState.page);
    await appState.page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });

    await setupHydra();
  } catch (err) {
    console.error('Erro ao iniciar o navegador:', err);
    if (appState.browser) await appState.browser.close();
    appState.browser = undefined;
  }
}

async function saveCookies(page: Page): Promise<void> {
  const cookies = await page.cookies();
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log('Cookies salvos com sucesso.');
}

async function loadCookies(page: Page): Promise<void> {
  if (fs.existsSync(cookiesPath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    for (const cookie of cookies) {
      await page.setCookie(cookie);
    }
    console.log('Cookies carregados com sucesso.');
  }
}

async function setupHydra(): Promise<void> {
  try {
    console.log('Configurando o Hydra...');
    const ev = await hydraBot.initServer({
      puppeteerOptions: {
        headless: false,
        devtools: true,
      },
      timeAutoClose: 0,
      printQRInTerminal: true,
    });

    ev.on('connection', async (conn: HydraConnection) => {
      console.log('Status da conexão:', conn);
      if (conn.connect) {
        console.log('Conexão Hydra estabelecida.');
        await startListeningForMessages(conn);
      } else {
        console.log('Erro na conexão Hydra.');
      }
    });

    ev.on('qrcode', (qrcode: string) => {
      console.log('QR Code gerado pelo Hydra:', qrcode);
    });

    if (appState.page) {
      await ev.client.ev.emit('setPage', appState.page); // Passa a página diretamente
    } else {
      throw new Error('Página não inicializada.');
    }
  } catch (error) {
    console.error('Erro ao configurar o Hydra:', error);
    if (appState.browser) await appState.browser.close();
    appState.browser = undefined;
    await startBrowser();
  }
}

async function startListeningForMessages(conn: HydraConnection): Promise<void> {
  conn.client.ev.on('newMessage', async (newMsg: any) => {
    if (!newMsg?.result) return;

    const msg = newMsg.result;
    if (!msg.fromMe) {
      const messageText = msg.body.toLowerCase();
      const chatId = msg.chatId;

      console.log('Mensagem recebida:', messageText);

      if (messageText.startsWith('nome:')) {
        const userInfo = parseUserInfo(messageText);
        if (userInfo) {
          if (appState.activeChats < appState.maxActiveChats) {
            appState.activeChats++;
            console.log('Atendendo novo chat...');
            await sendMessage(conn, chatId, 'Obrigado pelas informações! Estamos iniciando seu atendimento.');
          } else {
            appState.waitingList.push({ chatId, ...userInfo });
            console.log('Usuário na fila de espera');
            await sendMessage(conn, chatId, 'Você está na lista de espera. Aguarde sua vez.');
          }
          sendUpdateToRenderer();
        } else {
          await sendMessage(
            conn,
            chatId,
            `⚠️ Por favor, insira suas informações no formato correto:
            
Nome completo:
Cidade:
Cargo: (Aluno, Supervisor, Secretário, Professor, Administrador, Responsável)
Escola: (Informe o nome da escola, se você for Aluno, Responsável, Professor ou Supervisor)`
          );
        }
      } else {
        await sendMessage(
          conn,
          chatId,
          `Olá! Para iniciarmos seu atendimento, envie suas informações no formato abaixo:
          
Nome completo:
Cidade:
Cargo: (Aluno, Supervisor, Secretário, Professor, Administrador, Responsável)
Escola: (Informe o nome da escola, se você for Aluno, Responsável, Professor ou Supervisor)`
        );
      }
    }
  });

  conn.client.ev.on('chatClosed', (chatId: string) => {
    appState.activeChats = Math.max(appState.activeChats - 1, 0);
    sendUpdateToRenderer();
  });
}

function parseUserInfo(messageText: string): UserInfo | null {
  const info: { [key: string]: string } = {};
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

function sendMessage(conn: HydraConnection, to: string, body: string): Promise<void> {
  return conn.client.sendMessage({
    to,
    body,
    options: { type: 'sendText' },
  });
}

function sendUpdateToRenderer(): void {
  ipcMain.emit('sendStatusUpdate', {
    activeChats: appState.activeChats,
    waitingList: appState.waitingList,
  });
}
