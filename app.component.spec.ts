import { TestBed, ComponentFixture } from '@angular/core/testing';  // Importando ComponentFixture
import { AppComponent } from './app.component';
import { MessageService } from './message.service';
import { ElectronService } from './electron.service';

// Mock do ElectronService
class MockElectronService {
  onNewMessage(callback: (data: any) => void): void {
    // Simula a emissão de uma nova mensagem
    callback({ sender: 'John', body: 'Hello, world!' });
  }
}

describe('AppComponent', () => {
  let messageService: MessageService;
  let fixture: ComponentFixture<AppComponent>;  // Agora a variável fixture tem o tipo correto
  let app: AppComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      providers: [
        { provide: ElectronService, useClass: MockElectronService },
        MessageService
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    messageService = TestBed.inject(MessageService);
    fixture = TestBed.createComponent(AppComponent);
    app = fixture.componentInstance;
  });

  it('should create the app', () => {
    expect(app).toBeTruthy();
  });

  it(`should have the 'redenet-chatbot' title`, () => {
    expect(app.title).toEqual('redenet-chatbot');
  });

  it('should render messages from MessageService', () => {
    fixture.detectChanges(); // Detecta as mudanças
    const compiled = fixture.nativeElement as HTMLElement;

    // Verifica se a mensagem mockada está sendo renderizada
    expect(compiled.querySelector('ul')?.textContent).toContain('John: Hello, world!');
  });

  it('should display "No messages" when there are no messages', () => {
    // Verifica que a mensagem "Não há mensagens" aparece quando não há mensagens
    messageService['messages'] = [];
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('p')?.textContent).toContain('Não há mensagens no momento.');
  });
});
