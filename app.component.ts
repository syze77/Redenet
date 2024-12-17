import { Component, OnInit } from '@angular/core';
import { ElectronService } from './electron.service';
import { MessageService } from './message.service';

interface Message {
  sender: string;
  body: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  title = 'redenet-chatbot';
  
  constructor(
    private electronService: ElectronService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.electronService.onNewMessage((data: Message) => {
      console.log('Nova mensagem recebida:', data);
      this.messageService.addMessage(data);  // Armazena a nova mensagem via serviço
    });
  }

  // Obtém as mensagens do serviço
  get messages() {
    return this.messageService.getMessages();
  }
}
