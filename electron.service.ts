import { Injectable, OnDestroy } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ElectronService implements OnDestroy {
  private electron: any;
  private messageListener: (data: any) => void;

  constructor() {
    if ((window as any).electron) {
      this.electron = (window as any).electron;
    } else {
      console.error('Electron não está disponível no ambiente atual.');
    }

    // Inicializa a função de listener
    this.messageListener = (data: any) => {
      console.log('Nova mensagem recebida:', data);
    };
  }

  onNewMessage(callback: (data: any) => void): void {
    if (this.electron) {
      // Armazena o callback fornecido para uso posterior
      this.messageListener = callback;
      this.electron.onNewMessage(this.messageListener);
    }
  }

  // Método para desconectar e evitar memory leaks
  ngOnDestroy(): void {
    if (this.electron) {
      // Remove o listener usando a função armazenada
      this.electron.removeListener('newMessage', this.messageListener);
    }
  }
}
