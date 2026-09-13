# Debug da negociação WebRTC

Durante testes, abra **Diagnóstico da conexão** na sala. O painel mostra, em tempo real:

- entrada na sala e quantidade de participantes;
- ofertas, respostas e candidatos ICE enviados/recebidos;
- estados `signaling`, `ICE` e conexão WebRTC;
- falhas com o nome e a mensagem do erro.

No servidor, os logs usam o prefixo `[screen-room:signal]`. Para acompanhar localmente:

```bash
cd /root/workspace/screen-room-webrtc
npm start
```

Ao testar com dois navegadores, o fluxo esperado é:

1. Ambos exibem `signal-open` e `room-peers`/`peer-joined`.
2. Ao iniciar o compartilhamento, o emissor exibe `offer-created` e `signal-send` para a oferta.
3. O espectador exibe `signal-receive`, `offer-received` e `answer-created`.
4. Ambos exibem candidatos ICE e estado `connected`.

Se `offer-created` não aparecer, não havia outro participante registrado ou a captura não iniciou. Se `offer-created` aparecer sem `signal-receive` no outro dispositivo, o problema é o túnel/sinalização. Se ambos aparecem mas ICE não chega a `connected`, é conectividade P2P/NAT e será necessário TURN.
