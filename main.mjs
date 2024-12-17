import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { runBot } from './dist/out-tsc/bot_services/bot.js'; // Importa o bot

let mainWindow;

// Função para criar a janela principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Habilita o preload
    },
  });

  // Carrega a aplicação Angular
  const angularPath = path.join(__dirname, './dist/redenet-chatbot/browser/index.html');
  mainWindow.loadFile(angularPath).then(() => {
    console.log('Aplicação Angular carregada.');
  }).catch((error) => {
    console.error('Erro ao carregar a aplicação Angular:', error);
  });
}

// Função para iniciar o bot
async function startBot() {
  try {
    console.log('Iniciando o bot...');
    await runBot(); // Executa o bot
    console.log('Bot iniciado com sucesso.');
  } catch (error) {
    console.error('Erro ao iniciar o bot:', error);
  }
}

// Gerenciador IPC para receber dados do Angular
ipcMain.on('user-data', (event, userData) => {
  console.log('Dados recebidos do Angular:', userData);

  // Aqui você pode processar os dados ou enviar para o bot
  const { nome, cidade, cargo, escola } = userData;

  // Responder ao Angular
  event.reply('user-data-received', { success: true, message: 'Dados processados com sucesso!' });

  // Enviar informações para o bot ou processar conforme necessário
  console.log(`Usuário: ${nome}, Cidade: ${cidade}, Cargo: ${cargo}, Escola: ${escola}`);
});

// Evento para quando o Electron estiver pronto
app.whenReady().then(() => {
  createWindow();
  startBot();

  // Reabre a janela se ela for fechada no macOS
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Fecha o app no Windows/Linux quando todas as janelas forem fechadas
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    console.log('Todas as janelas foram fechadas. Encerrando o aplicativo...');
    app.quit();
  }
});
