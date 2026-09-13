# Configuração Sliplane

## Deploy pelo painel

1. Acesse o painel do Sliplane e crie um novo **App Runtime**.
2. Conecte o repositório GitHub deste projeto.
3. Selecione deploy por `Dockerfile`.
4. Use a porta interna `3000`.
5. Não configure um comando de start adicional: o `CMD` do Dockerfile já executa o servidor.
6. Faça o deploy.

O Sliplane fornecerá um endereço HTTPS em um subdomínio `sliplane.app`. Esse endereço já funciona com o WebSocket `/signal`, necessário para a negociação WebRTC.

## Configuração equivalente

- Build: `Dockerfile`
- Port: `3000`
- Health check: `/`
- WebSocket: habilitado automaticamente no App Runtime
- Variável `PORT`: fornecida pelo Sliplane; o servidor já a utiliza

Depois do deploy, teste em um computador usando Chrome ou Edge. Para enviar áudio, selecione uma aba no seletor de compartilhamento e marque a opção de áudio.
