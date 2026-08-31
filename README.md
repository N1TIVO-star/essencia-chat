# Essência Chat V4


Esta versão corrige a área de voz e adiciona mensagens privadas, anexos, GIFs e participantes por canal.

## Correções e melhorias desta versão

- A transmissão de tela agora ocupa corretamente o card do participante, sem ficar “embaixo” do avatar.
- É possível entrar em canal de voz mesmo sem microfone.
- Cada canal de voz é uma sala separada.
- Os participantes conectados aparecem embaixo de cada canal de voz na barra lateral.
- Ao trocar de canal de voz, o usuário sai corretamente da sala anterior.
- Amigos aparecem em Mensagens Diretas.
- Conversa privada (PV) com histórico.
- Chamada de voz privada entre amigos.
- Botão `+` à esquerda da caixa de mensagem para arquivos, fotos e outros anexos.
- Botão `GIF` à direita para enviar um GIF do computador.
- Botão de emoji à direita.
- Imagens e GIFs aparecem dentro da conversa.
- Arquivos aparecem como cartão para abrir/baixar.
- Limite atual de upload: 20 MB por arquivo.
- Mantidas as opções 720p/30, 720p/60, 1080p/30 e 1080p/60.

## Instalação

Requer Node.js 18 ou superior.

```bash
npm install
npm start
```

Abra:

```text
http://localhost:3000
```

## Se você já tem contas e servidores na versão anterior

O banco local fica em:

```text
data/db.json
```

A nova versão é compatível com o banco antigo. Antes de substituir sua pasta atual, faça uma cópia de `data/db.json`. Depois copie esse arquivo para a pasta `data/` da nova versão.

A chave `dmMessages` é criada automaticamente quando o banco antigo for carregado.

## Sobre voz e transmissão

Voz e transmissão usam WebRTC.

Um usuário sem microfone pode entrar normalmente, ouvir os outros e assistir às transmissões.

O compartilhamento de áudio da tela depende do navegador e do sistema operacional. Quando o Chrome/Edge mostrar a opção **Compartilhar áudio**, marque-a. Um site não pode ativar o áudio do sistema sem essa permissão.

As opções 720p/1080p e 30/60 FPS são metas de captura. O navegador pode reduzir a resolução ou FPS de acordo com hardware, tela e conexão.

## Para usar pela internet de forma confiável

Para produção, adicione:

- HTTPS;
- servidor TURN (coturn);
- PostgreSQL;
- armazenamento de arquivos em S3/R2/Supabase Storage;
- rate limiting;
- recuperação de senha;
- moderação e permissões por cargos.

Sem TURN, WebRTC pode falhar entre algumas redes móveis, CGNAT ou redes corporativas.

## V3 — correções principais

- A chamada de voz não cai ao abrir um canal de texto, PV, página inicial ou outro servidor. Ela só encerra ao usar **Desconectar** ou ao entrar em outra chamada/canal de voz.
- A barra **Conectado** permanece visível na lateral e permite voltar para a chamada.
- O botão **E** no topo da barra de servidores volta para Amigos/PVs.
- A prévia da própria transmissão foi ocultada para impedir o efeito de “tela dentro da tela” ao compartilhar a aba do site.
- Transmissões de outras pessoas podem ser abertas em uma interface de tela cheia dentro do site; há também botão para tela cheia do navegador.
- Vídeos enviados no chat agora têm player com controles dentro da conversa.
- Canais de voz continuam separados e exibem quem está conectado em cada sala.


## Novidades da V4

- A prévia da sua própria transmissão aparece novamente dentro da chamada.
- A transmissão expandida usa proporção real, sem esticar a imagem.
- Participantes ficam em uma faixa abaixo da transmissão.
- Clique em qualquer participante que estiver transmitindo para trocar a tela exibida.
- Qualidade só muda depois de selecionar e clicar em **Confirmar**.
- Perfis e sessões continuam no `data/db.json`; o salvamento agora é atômico e mantém `db.json.bak`.
- 720p/1080p e 30/60 FPS agora também ajustam bitrate e parâmetros do sender WebRTC.
- Botão de olho na tela de login/cadastro para mostrar ou ocultar a senha.

### Importante sobre qualidade real

Os modos são metas reais de captura/transmissão, mas o navegador pode limitar o resultado conforme a resolução da tela, hardware, encoder, rede e receptor. Para transmissões públicas grandes, o próximo passo técnico seria usar um SFU (como LiveKit/mediasoup) em vez de WebRTC P2P.


## V5 — volume individual

- Cada participante remoto possui um botão de volume.
- O volume da voz e o volume do áudio da transmissão são controlados separadamente.
- Os níveis ficam salvos no navegador por usuário.
- O mesmo controle pode ser aberto pelos cards dos participantes enquanto uma transmissão está ampliada.


## V6 — volume e PostgreSQL Neon

- Clique com o botão direito sobre uma transmissão remota para abrir um painel de volume.
- O painel ajusta o áudio da transmissão e a voz do participante em tempo real.
- Na transmissão ampliada/tela cheia há uma barra fixa de volume do compartilhamento.
- As preferências de volume continuam salvas no navegador por usuário.
- A persistência principal agora usa PostgreSQL (Neon) via `DATABASE_URL`.
- O `data/db.json` continua sendo mantido como cache/backup local.
- Na primeira execução com o PostgreSQL vazio, os dados existentes de `data/db.json` são importados automaticamente.


## V7 — membros e convite de amigos

- A lista de membros usa o painel lateral já existente dentro do servidor.
- Exibe foto/GIF animado de perfil, nick, @username, dono e você.
- Campo para buscar membros.
- No desktop a lista abre automaticamente ao entrar no servidor.
- O botão de adicionar membro agora mostra sua lista de amigos.
- É possível selecionar vários amigos e adicionar todos de uma vez.
- Amigos que já estão no grupo são ocultados do seletor.


## V8 — chamada fixa e participantes

- A barra verde da chamada agora fica fixa no rodapé da lateral, imediatamente acima do perfil.
- A barra mostra miniaturas dos participantes conectados.
- A lista de participantes dos canais de voz é sincronizada novamente ao entrar na sala.
- O `voice:join` agora devolve o estado atual da sala por ACK, evitando o bug de entrar de novo e não ver quem está conectado.
- `voice:state` continua atualizando a chamada ativa mesmo se você estiver navegando em PV/Amigos/outro chat.


## V9 — correção do som

- O áudio remoto agora passa por Web Audio `GainNode`, em vez de depender apenas de `HTMLAudioElement.volume`.
- 0% aplica ganho 0 no áudio da transmissão: mute real.
- O volume entre 0 e 100% usa uma curva perceptiva, então 50% fica claramente mais baixo.
- O controle vai até 200% para amplificação opcional.
- Microfone e áudio do compartilhamento têm mixers separados.
- O sinal WebRTC agora também informa os IDs das faixas de microfone e da tela para evitar classificar o som compartilhado como voz.
- Clique direito na transmissão abre um mixer redesenhado com presets.
- A transmissão ampliada mantém uma barra de volume funcional.


## V10 — interface mobile

A interface para celular foi refeita sem alterar o funcionamento do desktop.

Principais mudanças:
- menu lateral agora cabe corretamente em telas de 320 px;
- fundo escurecido para fechar menus tocando fora;
- botão de fechar dentro do menu e da lista de membros;
- lista de membros virou drawer lateral próprio no celular;
- altura acompanha `visualViewport`, melhorando o comportamento quando o teclado abre;
- botão Enviar voltou a aparecer no celular;
- barra de mensagem respeita safe area e teclado;
- login e modais foram adaptados para telas pequenas;
- modais usam formato bottom-sheet;
- chat, fotos, vídeos e arquivos são responsivos;
- canal de voz ganhou cards proporcionais e controles maiores para toque;
- transmissão ampliada, participantes e volume foram ajustados para celular;
- navegação fecha automaticamente ao abrir canal, PV ou página inicial;
- botões principais têm áreas de toque maiores.
