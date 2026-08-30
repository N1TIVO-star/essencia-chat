# Essência Chat V3.0.2 / V30.2

Versão atual do Essência.

## Novidades da V30.2

- Corrigida a engrenagem dos **canais de voz**, que agora fica alinhada no mesmo bloco do canal como nos canais de texto.
- Restaurado o botão **E** no topo da barra lateral para voltar ao menu principal de Amigos/PVs.
- O menu de GIFs agora mostra **somente GIFs**; a aba Emoji foi removida porque o Essência já possui um seletor de emojis separado.
- Biblioteca de GIFs integrada ao **Tenor**, com busca e resultados em grade.
- O botão de enviar GIF manualmente pelo dispositivo foi removido do picker.
- A chave do Tenor fica no servidor, via variável `TENOR_API_KEY`, sem ser exposta no navegador.
- Site e aplicativo continuam usando a mesma base e recebem as mesmas correções.

## Configuração necessária para o Tenor

Na Square Cloud, adicione a variável de ambiente:

```text
TENOR_API_KEY=sua_chave_da_API_do_Tenor
```

Sem essa variável, o restante do Essência continua funcionando normalmente; apenas a biblioteca online de GIFs mostra que o Tenor ainda não foi configurado.
