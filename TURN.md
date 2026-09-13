# TURN para conectividade WebRTC

O servidor usa `coturn` em `169.58.238.52:3478` com credenciais temporárias emitidas em `/turn-credentials`. O cliente busca essas credenciais ao entrar na sala; elas expiram em uma hora.

## Portas necessárias no firewall/provedor

Libere entrada e saída para o IP do servidor:

- **TCP 3478** — TURN sobre TCP;
- **UDP 3478** — STUN/TURN preferencial;
- **UDP 49160–49200** — portas de relay de mídia TURN.

O firewall local deste servidor está permissivo e o serviço `coturn` está ativo. Se usuários externos ainda ficarem em `pc-ice state=checking` ou `failed`, a regra ausente está no firewall/security group do provedor da VM, não no túnel Cloudflare. O túnel Cloudflare só transporta HTTP/WebSocket; não transporta a mídia UDP do TURN.

## Confirmação no navegador

No painel **Diagnóstico da conexão**, cada cliente deve exibir:

```text
turn-config servers=2 relay=true
```

Em seguida, após conectar, deve evoluir de `pc-ice state=checking` para:

```text
pc-ice state=connected
pc-connection state=connected
```

Quando a conexão direta P2P não for possível, o navegador selecionará um candidato `relay` fornecido pelo TURN.
