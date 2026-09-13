# Screen Room

Aplicação WebRTC para salas com múltiplas pessoas, dedicada a **compartilhamento de tela e áudio da tela**. Não há botão, permissão ou fluxo de microfone: o cliente usa exclusivamente `navigator.mediaDevices.getDisplayMedia()`.

## Executar localmente

```bash
cd /root/workspace/screen-room-webrtc
npm install
npm start
```

Abra `http://localhost:3000`, informe ou gere um nome de sala e copie o link criado, por exemplo:

```text
http://localhost:3000/?room=demonstracao
```

Para testar entre dispositivos na mesma rede, abra `http://IP-DO-SERVIDOR:3000`. Em produção, publique atrás de HTTPS (obrigatório para captura de tela fora de `localhost`).

## Uso

1. Crie/entre em uma sala pelo nome.
2. Clique em **Copiar link** e envie aos participantes.
3. Clique em **Compartilhar tela**.
4. No diálogo do navegador, escolha uma tela/janela/aba. Para enviar som, escolha uma **aba** e marque **Compartilhar áudio** quando o navegador exibir essa opção.

> O áudio de sistema pode depender do SO/navegador. Chrome/Edge normalmente permitem áudio apenas ao compartilhar uma aba; Firefox/Safari possuem limitações próprias.

## Arquitetura

- **Node.js + `ws`**: sinalização WebSocket em `/signal` e hospedagem estática.
- **WebRTC mesh**: cada participante negocia uma conexão ponto-a-ponto com os demais, sem servidor de mídia.
- **STUN público**: usado para descoberta inicial de rede.

A topologia mesh é apropriada para grupos pequenos (por exemplo, 3–6 participantes). Para grupos grandes ou redes restritivas, adicione um servidor **TURN** e, idealmente, migre a mídia para um SFU (LiveKit, mediasoup ou Janus). Configure TURN em `public/app.js`, na constante `rtcConfig`; nunca exponha credenciais TURN permanentes no frontend.

## Verificações

```bash
npm test
node --check public/app.js
```

Também exibe uma mensagem específica quando a página não está em contexto seguro (HTTPS/localhost) ou quando o navegador não disponibiliza captura de tela.
