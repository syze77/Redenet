import { Injectable } from '@angular/core';

interface Message {
  sender: string;
  body: string;
}

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private messages: Message[] = [];

  getMessages(): Message[] {
    return this.messages;
  }

  addMessage(message: Message): void {
    this.messages.push(message);
  }
}
