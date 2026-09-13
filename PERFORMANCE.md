# Performance da transmissão

## Perfis disponíveis

| Perfil | Resolução máxima | FPS máximo | Bitrate máximo | Uso recomendado |
|---|---:|---:|---:|---|
| Economia | 1280×720 | 15 | 800 kbps | rede móvel, TURN, muitos espectadores |
| Equilibrado (padrão) | 1280×720 | 20 | 1,5 Mbps | apresentações e sistemas |
| Alta qualidade | 1920×1080 | 20 | 3 Mbps | Wi‑Fi estável e poucos espectadores |

Os limites são aplicados tanto na captura (`getDisplayMedia`) quanto no `RTCRtpSender` via `setParameters`.

## Controles durante a transmissão

- **Qualidade da transmissão:** troca o bitrate/FPS para novas e conexões existentes.
- **Mutar áudio da tela:** desativa somente as `audioTracks` capturadas na tela/aba. Não solicita, captura ou controla microfone.
- **Rede:** atualiza a cada 3 segundos com bitrate de envio, perda de pacotes, RTT e número de conexões.

Quando a perda relatada por WebRTC passa de 5%, a aplicação reduz uma etapa de qualidade no máximo uma vez a cada 20 segundos. Ela nunca aumenta a qualidade automaticamente, para evitar oscilações; o apresentador escolhe o aumento manualmente.

## Limite da arquitetura

A sala ainda é WebRTC mesh: o apresentador envia um fluxo para cada espectador. Mesmo com bitrate limitado, o upload do apresentador cresce proporcionalmente ao número de espectadores. Para grupos maiores, a evolução indicada é um SFU (LiveKit, mediasoup ou Janus).
