# Status do projeto — onde paramos

Última atualização: 13/07/2026 (rodada de fechamento: testes completos, revisão de segurança,
área de Configurações + popup de ML desconectado, README atualizado).
Este arquivo é um resumo de andamento pra retomar rápido; a documentação técnica
permanente e detalhada de cada decisão está no `README.md`.

## Ambiente: EM PRODUÇÃO desde 13/07/2026

`https://qual-o-preco-rs-v2.vercel.app` está no ar com o código atual (login, admin,
perfil, redesenho visual, integração ML por usuário, todas as correções de segurança e
precificação desta sessão). Antes dessa data, o que estava publicado ali era uma versão
bem antiga (anterior à reescrita do login e da integração por usuário) — várias sessões
de trabalho ficaram só locais até agora.

**Importante pra depuração futura:** o fluxo de login (`/api/auth/*`) funciona tanto local
quanto em produção, mas o **fluxo de conexão com o Mercado Livre não funciona testado
localmente** — o Mercado Livre exige uma `redirect_uri` fixa e pública (HTTPS, cadastrada
no DevCenter), que está configurada como a URL de produção. Ou seja: `/api/auth/start`
sempre manda o usuário de volta para `qual-o-preco-rs-v2.vercel.app/api/auth/callback`,
mesmo iniciando o fluxo em `localhost`. Login feito localmente + conexão ML (que volta em
produção) são origens diferentes — cookies de sessão não valem entre elas, o que causava
"cai de volta no login" e erros de `invalid_grant` (ver seção 10 abaixo). **Pra testar
conexão com o Mercado Livre, sempre use a URL de produção do início ao fim, nunca
localhost.**

Pra religar o servidor local (só serve pra testar UI/precificação/admin — não pra testar
conexão ML):
```
npx vercel dev --listen 3312 --yes
```
Pra publicar uma mudança nova em produção:
```
npx vercel deploy --prod --yes
```

## O que está pronto e testado

### 1. Integração real com o Mercado Livre — agora por usuário
- **Cada usuário logado conecta a PRÓPRIA conta do Mercado Livre** — banner "Conectar
  Mercado Livre" no topo do formulário da calculadora (`index.html`), com botão
  "Desconectar" quando já conectado. A RS deixou de ser a única conexão "global": o
  mecanismo (`/api/auth/start`, `/api/auth/callback`, `lib/ml.js`) agora guarda um token
  por usuário no Redis (`ml:tokens:{id do usuário}`), usando um `state` OAuth de uso único
  pra saber de quem é cada conexão que volta do Mercado Livre.
  - Novos endpoints: `/api/ml-status` (diz se o usuário atual já conectou) e
    `/api/ml-disconnect` (remove a conexão salva).
  - **A conexão antiga da RS (Magno) ficou órfã** — o admin precisa clicar em "Conectar
    Mercado Livre" de novo, uma vez, pra ficar igual a qualquer outro usuário.
- Busca de categoria real (`/api/ml-category-search`, endpoint público do ML, não exige
  conexão) e taxa real por categoria/preço (`/api/ml-fee`) — campo "Categoria no Mercado
  Livre" no formulário. Sem conectar, cai de volta na taxa de referência estática.
- Frete real (`/api/ml-shipping`) — campos de peso/dimensões da embalagem.
  **Pendente do lado do Mercado Livre**: a conta da RS ainda não tem "Mercado Envios"
  aceito, então o subsídio de frete real ainda volta R$ 0,00 (o código já está pronto, só
  falta aceitar o Mercado Envios no painel do vendedor pra virar valor de verdade — sem
  precisar mexer em código depois). Isso vale por conta — cada cliente que conectar
  também vai precisar ter Mercado Envios aceito na própria conta pra ver o frete real.
- A calculadora mostra só os 2 formatos de anúncio do ML (Clássico/Premium) — os outros 5
  marketplaces (sem API real) foram removidos a pedido seu.

### 2. Sistema de login (admin + clientes)
- Banco: projeto Supabase novo, só para autenticação (`SUPABASE_URL`/`SUPABASE_ANON_KEY`/
  `SUPABASE_SERVICE_ROLE_KEY` já configurados na Vercel em Production/Preview/Development).
- `login.html` — e-mail + senha, com botão de mostrar/ocultar senha.
- `admin.html` — cria usuários (cliente **ou** admin, escolhido num seletor), lista todos
  os usuários cadastrados. Senha do novo usuário é gerada automaticamente e mostrada uma
  única vez (com botão de copiar).
- `profile.html` ("Meu perfil", acessível a qualquer usuário logado) — edita nome, cargo,
  telefone, e-mail e foto (upload real, guardada no Supabase Storage, bucket `avatars`).
- Cabeçalho (em todas as páginas logadas) mostra nome/papel/foto do usuário, com links
  "Calculadora", "Meu perfil", "Painel admin" (só pra admin) e "Sair".
- Primeira conta admin já criada: **magno@rssolucoesdigitais.com.br** (senha é a que você
  definiu — não repetida aqui por segurança).
- Sessão própria da ferramenta (cookie `HttpOnly`/`Secure`/`SameSite=Strict`, guardada no
  Redis, 7 dias) — o navegador nunca fala direto com o Supabase, só com `/api/*` do próprio
  domínio (mantém o CSP restrito que a ferramenta já tinha para o Mercado Livre).
- Limite de 5 tentativas de login erradas por 15 minutos (proteção contra força bruta).

### 3. SQL já rodado no Supabase (não precisa rodar de novo)
- `scripts/supabase-schema.sql` — tabela `profiles`, gatilho de criação automática, RLS.
- `scripts/supabase-schema-profile-fields.sql` — colunas `phone`, `position`, `photo_url`.

### 4. Bugs encontrados e corrigidos nesta sessão (histórico, caso reapareçam)
- Taxa do ML vinha errada em preços diferentes de R$100 (usava o valor em R$ da taxa em
  vez do percentual — corrigido em `script.js`).
- Variáveis do Supabase na Vercel ganharam um caractere invisível (BOM) ao serem coladas
  via terminal — recriadas corretamente.
- Um comando de terminal corrompeu a acentuação e caracteres de alguns arquivos
  (`index.html`, `admin.html`, `vercel.json`, `_headers`) — todos corrigidos e conferidos
  (sem nenhum caractere estranho restante).
- Botão "Trocar foto" (um `<label>` estilizado como botão) sobrepunha o texto abaixo —
  faltava `display: inline-flex` na classe `.btn` (labels não reservam espaço do padding
  por padrão como botões reservam).

### 5. Correção da lógica de precificação do ML (10/07/2026)
Ver relatório completo dado ao usuário no chat. Resumo: taxa fixa deixou de ser R$6 fixo
(agora depende do preço, ~50% até R$12,50 e R$0 acima — confirmado ao vivo na API real);
novo campo "Frete pago pelo vendedor" (manual, prioridade sobre o cálculo automático);
cartões agora mostram 9 métricas (comissão %, comissão R$, taxa fixa, frete, total de
taxas do ML, total geral de custos, lucro líquido, lucro sobre custo, margem líquida);
cálculo agora é iterativo com detecção de oscilação (itens muito baratos perto de
R$12,50 não têm preço de equilíbrio matemático único — a ferramenta escolhe o lado mais
seguro pro vendedor). Bug visual corrigido: cartão "menor preço" ocupava largura dupla
em telas de tablet (600-899px), sobra de quando existiam 7 marketplaces.

### 6. Redesenho visual — tema claro (padrão) + escuro (alternativa) (11/07/2026)
Aplicado em `login.html`, `index.html`, `admin.html` e `profile.html`, inspirado na
referência que você mandou (`rs-academy-three.vercel.app/auth`):
- **Tema claro é o padrão agora**, com botão de alternância (ícone sol/lua) no cabeçalho de
  toda página — persiste a escolha (`localStorage`), sem flash do tema errado ao carregar
  (`theme-init.js` roda antes do CSS pintar).
- Tipografia: **Space Grotesk** (baixada e hospedada local, mesmo padrão do Inter/Epilogue —
  zero requisição externa) substituiu Epilogue nos títulos/preços.
- Logo troca sozinha por tema (a versão navy no claro, a branca no escuro — ambas já
  existiam em `assets/`, só não estavam sendo usadas).
- CTA principal (botões) passou a ser laranja/âmbar (cor primária da marca) nos dois temas,
  no lugar do azul só no escuro.
- Campo de estrelas (decoração de "céu noturno") só aparece no tema escuro.

### 7. Revisão de segurança completa (11/07/2026)
Agente dedicado revisou todo o código (auth, ML, admin, upload de foto, headers). Achados
e correções:

- **Crítico**: cadastro público do Supabase estava habilitado — qualquer pessoa podia criar
  a própria conta como admin (o gatilho do banco confiava no "role" enviado pelo próprio
  usuário). **Corrigido**: cadastro público desligado no painel do Supabase (você fez) +
  `scripts/supabase-fix-role-trigger.sql` (rodado — gatilho agora sempre cria como
  'client'; só `api/admin/create-user.js`, com service_role, promove a admin). Confirmado
  via teste real: tentativa de auto-cadastro agora recebe `signup_disabled`.
- **Crítico**: `api/auth/callback.js` refletia o parâmetro `error` (vindo da URL, então
  manipulável por qualquer um) direto no HTML sem escapar — dava pra injetar
  `&lt;meta http-equiv="refresh"&gt;` e redirecionar a vítima pra phishing (CSP não bloqueia essa
  tag). **Corrigido**: escapa HTML antes de montar a página de erro.
- **Moderado**: login sem proteção contra CSRF (um `&lt;form&gt;` em outro site podia logar a
  vítima numa sessão controlada pelo atacante, incluindo depois sequestrar o token do ML
  dela). **Corrigido**: `/api/auth/login` exige `Content-Type: application/json`.
- **Moderado**: limitador de tentativas de login tinha corrida (GET + INCR separados).
  **Corrigido**: `registerLoginAttempt()` usa um único INCR atômico.
- **Moderado**: `/api/ml-category-search` (rota pública, sem login) sem limite de uso.
  **Corrigido**: limite de 30 buscas/minuto por IP (`lib/rateLimit.js`, novo).
- **Menor**: viés pequeno no gerador de senha automática (`byte % 61` não uniforme).
  **Corrigido**: rejection sampling.
- **Menor**: `/api/auth/logout` aceitava qualquer método HTTP. **Corrigido**: só POST.
- **Menor**: algumas rotas devolviam mensagem de erro interna crua pro cliente
  (login, callback do ML). **Corrigido**: mensagem genérica pro cliente, detalhe só no log
  do servidor.

Tudo testado depois das correções: login, logout, calculadora e criação de usuário
continuam funcionando normalmente; tentativa de login CSRF (sem JSON) rejeitada com 415;
busca de categoria não ficou mais lenta pro uso normal.

### 8. Redesenho estrutural da calculadora (11/07/2026)
Você pediu pra inovar de verdade no `index.html`, não só trocar cor/fonte — mudanças:
- **Layout em duas colunas** a partir de 1080px (`.calc-layout`): formulário à esquerda
  (largura fixa 420–480px), resultado à direita, acompanhando o scroll (`position: sticky`)
  — antes era uma coluna única, exigia rolar a página inteira pra ver o preço depois de
  calcular.
- **Formulário organizado em blocos** (`<fieldset class="field-group">` com ícone + título):
  "Produto", "Sua margem", "Mercado Livre" (opcional) e "Frete" (opcional) — antes era uma
  lista única de 8+ campos sem hierarquia visual.
- **Novo campo "Frete pago pelo vendedor"** (manual, dentro do bloco "Frete") e nota curta
  abaixo do campo de markup explicando a base de cálculo (markup incide só sobre custo +
  custos adicionais; o frete é recuperado no preço final mas não entra na base de lucro).
- **Cartões de resultado**: barra proporcional (`compare-card__breakdown`) mostrando de onde
  vem cada real do preço — custo, taxas do ML, frete, lucro — antes dos números exatos, que
  agora ficam numa grade compacta de 2 colunas (era uma lista de 9 linhas empilhadas).
  "Lucro líquido" destacado em verde.
- **Estado vazio** (`#resultsEmpty`) — antes de calcular, o painel de resultado mostra um
  placeholder convidando a preencher o formulário, em vez de ficar em branco.
- Bugs de responsividade corrigidos durante o teste: botão "Nova simulação" quebrando linha
  em telas ≥1080px (cartão do formulário ficou mais estreito no layout de 2 colunas — corrigido
  empilhando os botões só nesse breakpoint) e cabeçalho espremido em telas <480px
  (`flex-wrap` + esconder nome/cargo, mantendo só o avatar).

### 9. Redesenho visual com base no Manual de Marca RS (11/07/2026)
Depois do redesenho estrutural (item 8), você achou que ainda estava "simples demais" e
pediu pra usar o Manual de Marca RS (2026, PDF que você enviou) de verdade — cores, tipografia
e a "personalidade" do documento, não só a referência visual do RS Academy. Aplicado em
`login.html`, `index.html`, `admin.html` e `profile.html`:

- **Paleta exata do manual** (antes era uma paleta azul genérica "inspirada" na referência):
  - Primárias: `#1B1B4F` (navy — nova cor de marca, usada como fundo do tema escuro e do
    painel de identidade do login), `#E8A020` (âmbar — CTA principal, já estava certo),
    `#FFFFFF`.
  - Secundárias: `#2880B9`, `#7FB3E0`, `#003B70`, `#070E18`.
  - Apoio: `#7B8EC7`, `#0D2D3E`, `#0B0532` (tom mais escuro que o navy, usado no gradiente do
    tema escuro), `#F4F3F3` (fundo do tema claro, era `#F6F7FB`).
  - Tema escuro deixou de ser um azul-marinho genérico e passou a ser indigo/navy profundo
    (`#0B0532` → `#1B1B4F`), mais distintivo e alinhado à marca.
- **Tipografia do manual, hospedada localmente** (mesmo padrão do Inter/Epilogue/Space
  Grotesk — zero requisição externa, `assets/fonts/`):
  - **League Spartan** (700/900) — fonte primária do manual — substituiu Space Grotesk como
    `--font-display` (títulos, preços, botões). Space Grotesk/Epilogue continuam como
    fallback.
  - **Playfair Display** (itálico 400 e 700) — fonte terciária do manual, reservada para
    frases de destaque emocional — nova variável `--font-accent`, usada na citação do login
    e na tagline da calculadora.
- **Login (`login.html`) reconstruído do zero** — tela dividida em duas colunas
  (`.auth-shell`): painel de identidade fixo à esquerda (sempre nas cores do manual,
  independente do tema escolhido pelo usuário — como um pôster), com textura de grade sutil
  (`.auth-brand__grid`), logo, headline em League Spartan, a citação real do manual
  ("Quem pula etapas, paga caro.") em Playfair itálico, e uma lista numerada 01/02/03 com
  os diferenciais da ferramenta. O lado direito (formulário) segue o tema claro/escuro
  normalmente. Sem cabeçalho/rodapé genéricos — o `<header>`/`<footer>` padrão foram
  removidos só nessa página, substituídos pelo layout de duas colunas. Empilha em coluna
  única abaixo de 960px.
- **Textura de grade (blueprint)** no fundo de todas as páginas (`body::after`) — reforça o
  arquétipo Sábio/Governante do manual (estrutura, organização, controle), esmaecendo nas
  bordas via `mask-image`.
- **Componente `.brand-rule`** — parágrafo com régua lateral âmbar, motivo visual recorrente
  do próprio manual (cada bloco de texto institucional do PDF é marcado assim).
- **Rótulos "eyebrow"** (`.page-eyebrow`) em `admin.html` ("Painel administrativo") e
  `profile.html` ("Sua conta") — texto pequeno, uppercase, com marcador âmbar — dão hierarquia
  a páginas que antes eram só cartões soltos sem título de página.
- Testado com Playwright em desktop (1440px), tablet (768px) e mobile (390px), tema claro e
  escuro, nas 4 páginas — sem erros novos no console (só avisos preexistentes: CSP
  `frame-ancestors` via `<meta>` é ignorado por design do navegador, e 401 esperado da
  checagem `/api/auth/me` antes do login).

### 10. Primeiro deploy em produção + teste real com 2ª conta do Mercado Livre (13/07/2026)
- **Limite de funções da Vercel**: o plano Hobby permite no máximo 12 Serverless Functions
  por deployment; tínhamos 14 arquivos em `api/`. Resolvido removendo `api/ping.js` (não
  usado por nada — sobra do scaffold inicial) e juntando `api/ml-status.js` +
  `api/ml-disconnect.js` num arquivo só, `api/ml-connection.js` (GET = status, POST =
  desconectar). Front-end (`script.js`) atualizado pra chamar a rota nova.
- **Conta de teste criada**: André Simões, `zanfaust@gmail.com`, papel "cliente" — pra
  testar o fluxo completo como um cliente real (login separado do admin).
- **Bug real encontrado e corrigido**: a tela de erro da conexão ML (`api/auth/callback.js`)
  tinha um link de texto simples pra voltar; virou um botão de verdade (âmbar, cores da
  marca) — pedido seu.
- **Causa raiz do "cai no login" / "invalid_grant"**: explicada na seção "Ambiente" acima —
  não era bug de código, era estar testando local enquanto o Mercado Livre só aceita a
  URL de produção como retorno.
- **Conexão com a 2ª conta confirmada de ponta a ponta**: depois do deploy, o André
  conectou uma segunda conta real do Mercado Livre. Validado por mim via chamada direta às
  rotas (não só pela tela): `/api/ml-connection` retornou `{"connected":true}` e uma
  consulta real de taxa (`/api/ml-fee`) trouxe a resposta real da API do Mercado Livre pra
  essa conta (Clássico 13%, Premium 18% pra categoria de teste). **A integração por usuário
  funciona de verdade, testada com uma conta independente da RS.**
- **Melhoria de UI**: o banner de conexão só mudava o texto do título e trocava o botão
  "Conectar"/"Desconectar" — fácil de não perceber que já estava conectado. Adicionado um
  selo verde "✓ CONECTADO" fixo (não mais um aviso temporário que some ao recarregar).

### 11. Admin: remover usuário + redefinir senha (13/07/2026)
Pedido seu — antes só dava pra criar usuário, não tinha como remover nem trocar a senha
de alguém sem acesso ao Supabase direto.
- **`api/admin/create-user.js` + `api/admin/list-users.js` viraram um arquivo só**,
  `api/admin/users.js`, roteado por método HTTP (GET lista, POST cria, PATCH redefine
  senha, DELETE remove) — de novo por causa do limite de 12 Serverless Functions do plano
  Hobby (tínhamos usado a folga do item 10, criar mais 2 rotas nesse ritmo estouraria de
  novo). `lib/auth.js` ganhou `deleteSupabaseUser()` e `updateSupabaseUserPassword()`.
- **Remover usuário**: botão "Remover" em cada linha da tabela (exceto na própria linha do
  admin logado — proteção dupla, no cliente por UX e no servidor de verdade, contra
  autoexclusão acidental). Pede confirmação, remove do Supabase Auth (a linha em `profiles`
  cai junto, `ON DELETE CASCADE`) e limpa a conexão ML salva daquela conta, se houver.
- **Redefinir senha**: botão "Redefinir senha" em toda linha (inclusive a própria). Gera uma
  senha nova forte (mesma função de quando cria usuário) e mostra uma única vez, com botão
  de copiar — a pessoa antiga deixa de funcionar imediatamente.
- **Bug pego no teste e corrigido**: a primeira renderização da tabela às vezes mostrava
  "Remover" na própria linha do admin — condição de corrida entre carregar a lista de
  usuários e descobrir quem é o usuário logado (`/api/auth/me`). Corrigido esperando essa
  segunda chamada terminar antes da primeira renderização.
- Testado local (criar → aparece na lista → redefinir senha → remover → some da lista;
  linha do próprio admin nunca mostra "Remover") e publicado em produção.

### 12. Bug de layout na tabela de usuários (13/07/2026)
Os botões "Redefinir senha"/"Remover" apareciam cortados no meio do texto (reportado com
print de tela). Causa real: a tabela (5 colunas, a última com 2 botões) ficava mais larga
que o cartão "Usuários cadastrados", e como o cartão tem `overflow: visible`, o conteúdo
vazava pra fora da borda arredondada em vez de aparecer — parecia texto cortado, mas era
conteúdo simplesmente invisível fora do cartão. Corrigido em três frentes: (1) botões de
ação empilhados verticalmente em vez de lado a lado, ocupando metade da largura; (2) o
container do painel admin ficou mais largo (900px, era 720px — o mesmo usado pros
formulários simples), só o cartão "Criar usuário" manteve a largura estreita original;
(3) a tabela ganhou scroll horizontal próprio como rede de segurança, pra nomes/e-mails
muito longos ou telas muito estreitas nunca mais vazarem pra fora do cartão. Também
resetei a senha do Magno diretamente (`scripts/reset-password.js`, script novo, mesmo
padrão do `create-first-admin.js`) porque ele ficou sem acesso.

Depois do primeiro ajuste, o resultado (dois cartões empilhados com larguras bem
diferentes — "Criar usuário" estreito, "Usuários cadastrados" largo) ficou desequilibrado
visualmente ("ficou feio", seu feedback). Reformulado como grade de 2 colunas a partir de
880px — formulário à esquerda (largura de formulário, ~360-400px), tabela à direita
(largura livre) — empilha em coluna única abaixo de 880px. Só `admin.html` usa essa grade
(nova classe `admin-manage-layout`); `profile.html`, que reaproveita as mesmas classes
`.admin-page`/`.page-container`, ficou de fora de propósito e continua com o cartão único
estreito de antes.

### 13. Amazon como 2º marketplace — taxas editáveis pelo admin (13/07/2026)
Você pediu pra adicionar Amazon, Shopee, TikTok Shop, Magalu e Shein. Pesquisei se
alguma tinha API de "calcular taxa antes de vender": só a Amazon tem (`Product Fees API`),
mas em 2026 passou a cobrar US$1.400/ano de assinatura — inviável pra esse caso de uso.
Nenhuma das outras (Shopee, TikTok Shop, Magalu) tem essa API, só taxa de pedido já
concluído. Decisão: tabela de referência por categoria, **editável no painel admin**
(banco, não hardcoded em arquivo — você corrige um valor sem precisar de mim/deploy).
Começamos só pela Amazon; as outras 4 entram do mesmo jeito quando você mandar os prints
das telas oficiais de cada uma (mesmo processo: você manda print da tabela oficial do
painel do vendedor, eu confiro e cadastro).

- **Fonte dos dados**: tabela oficial do painel do vendedor Amazon Brasil (você mandou
  print em duas rodadas — a primeira tinha alguns números borrados/errados, a segunda
  print, mais nítida, corrigiu tudo). 38 categorias, conferidas uma a uma, incluindo as
  notas de rodapé (tarifa fixa de R$2,00 em "Mídia", faixas de preço em "Acessórios
  Eletrônicos"/"Móveis"/"Colchões").
- **Banco novo**: tabela `marketplace_rates` no Supabase (`scripts/supabase-marketplace-rates.sql`,
  rodado por você) — campos cobrem os formatos de cobrança encontrados: percentual base,
  faixa de preço com percentual diferente acima de um valor (`tier_threshold`/
  `pct_above_threshold`), tarifa fixa adicional por venda (`fixed_fee`), comissão mínima
  (`min_fee`). Populada via `scripts/seed-amazon-rates.js` (idempotente — pode rodar de
  novo sem duplicar).
- **Rota nova**: `api/marketplace-rates.js` (GET liberado pra qualquer usuário logado —
  a calculadora precisa disso —, POST/PATCH/DELETE só admin). De novo ficamos no limite de
  12 Serverless Functions do Hobby, sem sobra — se precisar de mais uma rota no futuro,
  primeiro precisa consolidar alguma existente.
- **Painel admin**: nova seção "Taxas de marketplace — Amazon" (`admin.html`/`admin.js`),
  abaixo da grade de usuários — formulário pra adicionar/editar categoria (categoria,
  comissão, faixa de preço opcional, tarifa fixa opcional, comissão mínima, observação) +
  tabela com as 38 categorias, editar/remover por linha.
- **Calculadora**: novo campo "Amazon" (opcional, com seletor de categoria — diferente do
  campo do Mercado Livre, que busca a taxonomia real do ML; aqui é uma lista simples com
  as categorias que você cadastrou). Sem categoria selecionada, a Amazon simplesmente não
  entra na comparação (decisão consciente: nada de mostrar uma "taxa média" que poderia
  enganar). Card da Amazon entra no mesmo ranking por preço dos cartões do ML, com selo de
  categoria e aviso de que é taxa de referência, não tempo real.
- **Refatoração do motor de cálculo** (`resolveEntryPricing` em `script.js`): generalizado
  pra suportar 3 tipos de taxa (`ml-real`, `ml-reference`, `amazon-tiered`) através de uma
  função `resolveFeesForEntry(entry, price)` só, em vez de lógica só pro ML. A taxa por
  faixa de preço da Amazon (ex.: 15% até R$100, 10% acima) usa o mesmo motor iterativo já
  testado do ML (preço depende da taxa, taxa depende do preço) — resolvida como um
  percentual "efetivo" que dá a mesma comissão em reais que a regra por faixa. Testado
  matematicamente: Acessórios Eletrônicos com preço final ~R$197 deu comissão efetiva de
  12,54% (exatamente a mistura correta entre 15% e 10% no limiar de R$100) — confirmado
  reproduzindo a conta à mão. Testada também a regressão: cenários só com Mercado Livre
  (sem Amazon) continuam batendo os mesmos números de antes da refatoração.
- Publicado em produção e testado lá também (não só local).

### 14. Shopee como 3º marketplace — taxa por faixa de preço, não categoria (13/07/2026)

Diferente da Amazon, a comissão da Shopee **não varia por categoria de produto**, só por
faixa de preço do item (tabela nacional única) — então a modelagem e a UI tiveram que ser
diferentes, não uma cópia do fluxo da Amazon:

- **Fonte dos dados**: prints da central de ajuda do vendedor Shopee, conferidos em
  13/07/2026. Tabela de comissão por faixa de preço (até R$79,99: 20%+R$4; R$80–99,99:
  14%+R$16; R$100–199,99: 14%+R$20; R$200–499,99: 14%+R$26; acima de R$500: 14%+R$26) +
  regra de item abaixo de R$8 (a tarifa fixa vira metade do preço do produto, não R$4 fixo).
- **Decisão de escopo, confirmada com você**: cadastramos só a comissão padrão (válida pra
  CNPJ, e pra CPF com até 450 pedidos em 90 dias). Ficou de fora o adicional de R$3/item pra
  CPF acima de 450 pedidos/90 dias — é uma métrica de histórico da loja, não dá pra calcular
  numa cotação avulsa, e o texto da própria Shopee sobre a "regressividade" abaixo de R$12
  desse adicional específico ficou ambíguo nos prints (números não batiam com um adicional
  simples de R$3). Cada card da Shopee traz uma nota avisando dessa limitação.
- **Subsídio Pix da Shopee**: conferido matematicamente (não só copiado) que ele não muda o
  valor líquido que o vendedor recebe — é um desconto que a própria Shopee banca pro
  comprador, refletido como uma comissão menor exatamente na mesma proporção. Por isso não
  entrou na modelagem, só a comissão "cheia" (cartão/boleto), que já é o valor líquido real
  em qualquer forma de pagamento.
- **Reaproveitamento de banco**: nenhuma migração de schema nova — cada faixa de preço da
  Shopee é uma linha comum em `marketplace_rates` (`marketplace="shopee"`), usando o campo
  `tier_threshold` já existente com um significado diferente do da Amazon (aqui é "a partir
  de que preço esta linha vale", não "onde o % muda dentro da mesma categoria"). Populada via
  `scripts/seed-shopee-rates.js` (mesmo padrão idempotente do script da Amazon).
- **Painel admin generalizado**: a seção "Taxas de marketplace" (antes só Amazon) ganhou um
  seletor de marketplace (`admin.html`/`admin.js`) — os campos do formulário se adaptam
  automaticamente (Amazon mostra "muda de % acima de" + "comissão mínima"; Shopee mostra "a
  partir de que preço" e esconde os campos que não fazem sentido pra ela), sem duplicar
  código: é a mesma tabela, mesmo formulário, mesma rota `/api/marketplace-rates`.
- **Calculadora**: campo "Shopee" é um checkbox simples ("Incluir a Shopee"), não um seletor
  de categoria como o da Amazon — decisão deliberada, já que não existe categoria pra
  escolher. A faixa de preço certa é escolhida automaticamente pelo próprio motor de cálculo
  a partir do preço final (mesmo estilo iterativo já usado pro ML e pra Amazon).
- **Motor de cálculo**: novo tipo de taxa `shopee-banded` em `resolveFeesForEntry`
  (`script.js`) — percorre as faixas cadastradas e aplica a que vale pro preço candidato,
  com a regra especial de "abaixo de R$8 = metade do preço" só na faixa inicial.
- **Bug real encontrado e corrigido durante o teste**: a proteção contra "oscilação" do
  motor iterativo (criada originalmente pro salto abrupto da taxa fixa do ML perto de
  R$12,50) media só se o preço tinha "parado de se mexer muito" — e a regra da Shopee
  abaixo de R$8 converge de forma suave e lenta (não é um salto abrupto), então esse teste
  cortava a conta cedo demais e entregava um preço errado (testado: custo R$1 e markup 0%
  devia dar ~R$3,33, mas a versão com bug entregava R$3,78/R$3,79). Corrigido trocando a
  detecção por "o preço mudou de direção em relação ao passo anterior" (sobe-desce-sobe é
  oscilação de verdade; sobe-sobe-sobe cada vez mais devagar é só convergência lenta) —
  mais correto matematicamente e não devia afetar os cálculos do ML/Amazon que já
  funcionavam (só ficaram com mais margem de iterações de segurança). Testado de novo depois
  da correção: bateu a conta certinha.
- Testado localmente (painel admin trocando entre Amazon/Shopee, e dois cenários de cálculo
  com valores conferidos à mão) antes de publicar em produção.

### 15. TikTok Shop como 4º marketplace — mesmo formato de faixa da Shopee (13/07/2026)

Mesmo formato da Shopee (comissão por faixa de preço, sem categoria), então reaproveitou
quase tudo — a única mudança de fundo foi generalizar o nome do tipo de taxa no motor de
cálculo, que antes se chamava `"shopee-banded"` (específico demais) e virou `"price-banded"`,
com a regra opcional do "abaixo de X reais" (usada só pela Shopee) marcada por um campo
próprio (`entry.halveFeeBelow`) em vez de estar hardcoded no nome do marketplace.

- **Fonte dos dados**: comunicado oficial do TikTok Shop para o vendedor, conferido em
  13/07/2026. Tabela por faixa de preço: até R$49,99 → 10% + R$4,00; a partir de R$50,00 →
  6% + R$6,00.
- **Detalhe temporal importante**: essa tarifa só passa a valer a partir de 15/07/2026
  00:00 (2 dias depois da conferência) — antes disso era uma taxa fixa (6% + R$4,00 pra
  qualquer preço, sem faixa). Decisão confirmada com você: cadastrar já a tabela nova, já
  que a antiga fica obsoleta em 2 dias e a ferramenta serve pra precificar vendas futuras.
- **Validação rigorosa**: o comunicado trazia dois exemplos numéricos prontos (camisa
  R$45,00 → taxa total R$8,50; calça com preço líquido R$75,00 → taxa total R$10,50).
  Reproduzi os dois exatos no simulador (ajustando custo/markup pra chegar nesses preços
  finais) e bateram certinho, confirmando que o motor de cálculo replica a fórmula oficial
  corretamente antes de publicar.
- **Sem informação de**: taxa de processamento de pagamento separada, nem distinção
  CPF/CNPJ — o material recebido não mencionou nenhuma das duas; nota registrada em cada
  linha cadastrada avisando dessa limitação.
- **Painel admin**: seletor de marketplace ganhou a opção "TikTok Shop", reaproveitando o
  mesmo layout de formulário da Shopee (faixa de preço, sem os campos de categoria da
  Amazon).
- **Calculadora**: checkbox "Incluir o TikTok Shop", mesmo padrão do checkbox da Shopee
  (sem seletor de categoria, pelo mesmo motivo).
- **Visual**: cartão branco com borda preta, preço em magenta (#FE2C55) e um traço
  duotone ciano/magenta (#25F4EE / #FE2C55) sob o nome — as cores reais da marca, mesmo
  padrão de autenticidade usado nos cartões da Amazon e da Shopee.
- Publicado em produção e testado lá também (reproduzindo o exemplo da camisa, bateu
  R$45,00 → R$8,50 de taxa total).

### 16. Layout da calculadora: formulário em 2 colunas + resultado compacto com popup (13/07/2026)

O formulário já tinha 7 seções (e cresce a cada marketplace novo) e ficava numa coluna
estreita ao lado do resultado — pedido seu foi encurtar isso e mover o resultado pra baixo,
em cartões menores que abrem um popup com o detalhe completo ao tocar.

- **Formulário em 2 colunas** (`.calc-form-cols`, a partir de 760px de largura, empilha em
  telas estreitas): coluna esquerda com os campos "principais" (Produto, Sua margem,
  Mercado Livre, Frete); coluna direita com os marketplaces de referência (Amazon, Shopee,
  TikTok Shop, e os próximos que entrarem). O card do formulário deixou de ter largura
  travada (~420-480px) e agora usa a largura toda do layout.
- **Bug de grid encontrado e corrigido no processo**: as duas colunas não ficavam do mesmo
  tamanho mesmo com `1fr 1fr` — a linha de dimensões da embalagem (3 campos + "×") tem um
  "tamanho mínimo de conteúdo" maior que a metade da largura, e por padrão um item de grid
  não encolhe além do próprio conteúdo. Corrigido com `min-width: 0` na coluna, um ajuste
  clássico de CSS Grid.
- **Resultado movido pra baixo do formulário**, em cartões compactos (nome, preço, selo de
  "menor preço"/"empate" — só o essencial, decisão confirmada com você) numa grade que
  ajusta quantos cabem por linha (`repeat(auto-fill, minmax(180px, 1fr))`).
- **Popup de detalhe**: cada cartão compacto é um `<button>` que, ao ser tocado, abre um
  `<dialog>` nativo com o cartão completo (barra proporcional, legenda, comissão, taxa fixa,
  lucro etc.) — o mesmo conteúdo que antes ficava sempre visível. Usar `<dialog>` nativo em
  vez de um modal construído à mão evitou reimplementar foco preso dentro do popup, fechar
  com Esc, e devolver o foco pro elemento que abriu — o navegador já cuida de tudo isso via
  `showModal()`. "Fechar ao clicar fora" foi implementado fazendo o `<dialog>` cobrir a tela
  inteira (transparente, só centralizando o conteúdo) e comparando `event.target` com o
  próprio dialog — o `::backdrop` de verdade não recebe clique diretamente.
- **Bug de CSS encontrado e corrigido no processo**: o cartão completo dentro do popup
  ficava invisível — `.compare-card` começa com `opacity: 0` e só fica visível através da
  animação de entrada da grade (`card-in`); ao desativar essa animação dentro do popup (pra
  não repetir o efeito, já que o popup tem a própria entrada), esqueci de repor
  `opacity: 1` manualmente, então o cartão ficava permanentemente invisível. Pego e corrigido
  antes de publicar, com captura de tela confirmando a correção.
- Testado localmente e em produção: desktop (colunas lado a lado, largura idêntica) e mobile
  (colunas empilhadas, popup ocupando a tela com rolagem), abrir/fechar o popup pelas 3 formas
  (botão X, tecla Esc, clique fora) com o foco voltando corretamente pro cartão que abriu.

### 17. Dois bugs de acabamento no layout novo, corrigidos logo em seguida (13/07/2026)

Encontrados no uso real (por você) logo depois do redesenho da seção 16:

- **Selo "menor preço" colidindo com o número de posição**: no cartão compacto (estreito), o
  selo (fluxo normal) e o círculo de posição (posicionado por cima) disputavam o mesmo canto e
  ficavam sobrepostos. Corrigido fazendo o selo **substituir** o número quando o cartão é o
  mais barato (o selo já deixa claro que é o primeiro colocado — não precisa dos dois); nos
  outros cartões, só o número aparece. No popup completo (sem essa restrição de espaço), os
  dois continuam aparecendo juntos.
- **Botão de fechar do popup cortado**: `overflow-y: auto` num único eixo faz o CSS tratar o
  eixo horizontal como "auto" também (regra da própria especificação) — como o botão de
  fechar fica de propósito parcialmente pra fora do cartão, ele estava sendo cortado por essa
  clipagem "acidental", e a fatia cortada ainda contava como conteúdo, abrindo uma barra de
  rolagem horizontal indesejada. Corrigido movendo a rolagem de verdade pro elemento interno
  (`.card-modal__content`), deixando o wrapper que contém o botão sem overflow nenhum;
  aproveitado pra deixar o botão mais bonito (círculo cheio, sombra, gira ao passar o mouse).

Os dois publicados em produção e testados antes de subir pro GitHub.

### 18. Rodada de fechamento: testes completos, revisão de segurança, área de Configurações + popup de ML, README atualizado (13/07/2026)

Pedido seu pra "fechar" esta etapa: testar tudo, conferir segurança, e atualizar a
documentação — mais um pedido novo de funcionalidade que entrou no meio (área de
Configurações).

- **Bateria de testes end-to-end**: calculadora com os 5 marketplaces simultâneos (ML
  Clássico/Premium + Amazon + Shopee + TikTok Shop), popup abrindo/fechando em cada um,
  validação de campo obrigatório, guards de sessão (sem login redireciona, cliente não acessa
  admin), responsividade mobile — 30/31 checagens automatizadas passaram (a única "falha" é o
  aviso já documentado do `frame-ancestors`). CRUD de usuário (criar/redefinir
  senha/remover/auto-proteção) e de taxas de marketplace testados e confirmados — com
  limpeza de todo dado de teste criado, verificada direto no banco.
- **Instabilidade do `vercel dev` local**: depois de um dia inteiro de testes automatizados
  nesta sessão, o servidor local degradou de vez (chegou a ficar 30s+ sem responder, ou
  devolver 502). Não é bug de produto — confirmado comparando com produção, que respondeu
  normalmente o tempo todo. A partir daqui, verificação final passou a ser feita direto em
  produção quando o local está ruim, sempre com a mesma disciplina de limpeza dos dados de
  teste depois.
- **Revisão de segurança focada no que mudou** desde a revisão completa da seção 7 (Amazon,
  Shopee, TikTok Shop, popup/`<dialog>`, painel admin multi-marketplace): tudo seguro. Achado
  só 2 itens cosméticos, ambos corrigidos: um `innerHTML` no rótulo dinâmico do formulário de
  taxas do admin (não explorável — a string vinha de uma constante do próprio código, nunca
  do banco — mas quebrava o padrão "zero innerHTML" do projeto, trocado por `textContent`), e
  o comentário do CSP desatualizado sobre o uso de `'unsafe-inline'` em `style-src`.
- **Nova área de Configurações** (`settings.html`/`settings.js`), pedido seu: o banner
  "Conectar Mercado Livre" saiu do formulário da calculadora e ganhou página própria, linkada
  no menu de todas as páginas — libera espaço na precificação sem perder a funcionalidade
  (conectar/desconectar/status idênticos a antes). O redirecionamento pós-OAuth
  (`api/auth/callback.js`) passou a voltar pra Configurações em vez da calculadora.
- **Popup avisando pra conectar o ML**, também pedido seu: quando o cliente abre a
  calculadora com a conta desconectada, um popup (reaproveitando o mesmo `<dialog>` do popup
  de detalhe dos cartões) avisa e convida a conectar, com um link direto pra Configurações.
  Aparece uma vez por sessão do navegador — "Agora não"/Esc/clique fora não incomoda de novo
  até a aba ser fechada (`sessionStorage`). Testado nos dois cenários: conta conectada (popup
  não aparece — confirmado com a própria conta do admin) e conta desconectada (popup aparece
  — confirmado criando um cliente de teste descartável, verificado, removido em seguida).
- **`README.md` totalmente atualizado**: menção a Amazon/Shopee/TikTok Shop em vez de "em
  breve", seção de marketplaces de referência reescrita explicando os dois motores de cálculo
  (`amazon-tiered` por categoria vs. `price-banded` por faixa de preço), árvore de arquitetura
  com `settings.html`/`settings.js` e os scripts de seed novos, integração do Mercado Livre
  atualizada pra citar Configurações e o popup, identidade visual com as cores reais de cada
  marketplace, seção de testes e limitações atualizadas.
- Tudo publicado em produção, testado lá, e commitado/subido pro GitHub.

## Onde paramos / próximo passo em aberto

Redesenho visual, integração de ML por usuário, revisão de segurança (duas rodadas), primeiro
deploy em produção, Amazon + Shopee + TikTok Shop como marketplaces de referência, o layout
novo (2 colunas + popup), a área de Configurações e o popup de ML desconectado — tudo testado,
publicado em produção e documentado no README. Falta:

1. **Adicionar Magalu e Shein** — mesmo processo dos anteriores: você manda print da
   tabela oficial de comissão do painel do vendedor de cada uma, eu confiro e cadastro em
   `marketplace_rates` (a estrutura já suporta os formatos encontrados até agora: por
   categoria, por faixa de preço, com/sem tarifa fixa).
2. **Lembrete de calendário**: a tarifa nova do TikTok Shop (10%/6% por faixa) só vale de
   verdade a partir de 15/07/2026 — nada a fazer agora, é só pra não estranhar se comparar
   com o painel oficial deles antes dessa data.
3. Considerar um domínio próprio em vez de `qual-o-preco-rs-v2.vercel.app` (ainda não
   configurado).
4. A conta de teste do André Simões (`zanfaust@gmail.com`) não existe mais (foi removida em
   algum momento desta sessão) — se quiser voltar a testar com uma segunda conta real do
   Mercado Livre, precisa criar uma nova.
5. **Reiniciar o `vercel dev` local** antes da próxima sessão de testes — ficou degradado
   depois de tanto uso seguido (ver seção 18).
6. A página de Configurações hoje só tem a conexão com o Mercado Livre — é o lugar natural
   pra outras preferências de conta que vierem depois.
