# Qual o Preço? | RS Soluções Digitais

Ferramenta interna da **RS Soluções Digitais** para precificar produtos de marketplace em
poucos segundos — custo, margem desejada, frete e taxas reais de cada plataforma entram, o
preço de venda ideal sai, comparado lado a lado entre Mercado Livre, Amazon, Shopee, TikTok
Shop, Magalu e (em breve) Shein.

**Por que existe:** precificar errado é uma dor recorrente de quem vende em marketplace —
taxa de comissão que varia por categoria, taxa fixa que muda por faixa de preço, frete que
some da margem sem ninguém perceber. A RS enxergou esse problema nos próprios clientes e
está construindo esta ferramenta primeiro para uso interno, com o objetivo de repassá-la aos
clientes assim que estiver madura o suficiente.

**Em produção:** https://qualopreco.rssolucoesdigitais.com.br

## Índice

- [O que a ferramenta faz](#o-que-a-ferramenta-faz)
- [Como rodar localmente](#como-rodar-localmente)
- [Arquitetura](#arquitetura)
- [Fórmula de precificação](#fórmula-de-precificação)
- [Integração com o Mercado Livre](#integração-com-o-mercado-livre)
- [Amazon, Shopee, TikTok Shop e Magalu (taxas de referência editáveis)](#amazon-shopee-tiktok-shop-e-magalu-taxas-de-referência-editáveis)
- [Contas e permissões](#contas-e-permissões)
- [Segurança](#segurança)
- [Identidade visual](#identidade-visual)
- [Testes](#testes)
- [Limitações conhecidas e próximos passos](#limitações-conhecidas-e-próximos-passos)

## O que a ferramenta faz

1. O usuário informa custo do produto, custos adicionais (embalagem, etiqueta, frete de
   aquisição) e a margem de lucro desejada (markup sobre o custo), com reserva de marketing e
   imposto opcionais — formulário organizado em blocos (Produto & Margem sempre visível,
   marketplaces de referência como chips clicáveis, Frete como accordion), pra não virar uma
   parede de campos conforme mais marketplaces entram.
2. Opcionalmente, busca uma categoria do Mercado Livre para trazer a comissão **e a taxa fixa
   reais** da categoria, direto da API a cada cálculo (nunca uma tabela cadastrada) — e o frete
   real subsidiado pelo vendedor, se a conta tiver Mercado Envios aceito e estiver conectada
   (ver [Integração com o Mercado Livre](#integração-com-o-mercado-livre)).
3. Opcionalmente, escolhe uma categoria da Amazon, uma forma de repasse do Magalu, ou inclui a
   Shopee/TikTok Shop (taxa de referência por faixa de preço, sem categoria) — todas
   cadastradas e editáveis pelo admin.
4. A ferramenta calcula o preço de venda sugerido para cada marketplace escolhido e mostra um
   cartão compacto por opção (nome, preço, selo de menor preço), ordenados do mais barato para
   o mais caro ao cliente final — todos com o **mesmo lucro líquido em reais** (o markup
   incide sobre o custo, não sobre o preço — por isso o que muda entre os cartões é só o preço
   final e as taxas, nunca o lucro). Tocar num cartão abre um popup com o detalhe completo
   (comissão, taxa fixa, origem do custo de frete — manual, modalidade real da API, ou nenhum
   —, barra proporcional de composição do preço, selo de lucro líquido total).

## Como rodar localmente

Precisa de [Node.js](https://nodejs.org) ≥ 20 e da [Vercel CLI](https://vercel.com/docs/cli)
(`npx vercel`, não precisa instalar globalmente).

```bash
npm install
npx vercel env pull .env.local   # baixa as variáveis de ambiente do projeto na Vercel
npx vercel dev --listen 3312     # sobe o site + as funções serverless em localhost:3312
```

**Importante:** o fluxo de **conexão com o Mercado Livre não funciona em `localhost`** — o
Mercado Livre exige uma `redirect_uri` fixa e pública (HTTPS, cadastrada no DevCenter), que
está configurada para a URL de produção. Login, calculadora, painel admin e taxas de
marketplace funcionam normalmente em local; só o "Conectar Mercado Livre" (em
`settings.html`) precisa ser testado direto em produção.

### Variáveis de ambiente

Ver `.env.example`. Resumo:

| Variável | Para quê |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Projeto Supabase dedicado a autenticação (contas de admin/cliente e taxas de marketplace) — nunca dados de produto/preço |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Redis (Upstash) — sessões de login, tokens do Mercado Livre, limitador de tentativas de login |
| `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI` | App registrado em developers.mercadolivre.com.br/devcenter, usado por **todos** os usuários (cada um autoriza a própria conta — ver seção do Mercado Livre) |

## Arquitetura

Frontend estático (HTML/CSS/JS puro, sem framework nem build) + backend fino em
[Vercel Functions](https://vercel.com/docs/functions) — cada arquivo em `api/` é uma rota
serverless (`module.exports = async (req, res) => {}`, sem Express).

```
qual-o-preco-rs/
├── index.html / script.js          — calculadora (página principal)
├── login.html / login.js           — tela de login
├── admin.html / admin.js           — painel admin (usuários + taxas de marketplace)
├── profile.html / profile.js       — edição do próprio perfil
├── settings.html / settings.js     — configurações da conta (hoje: conexão com o Mercado Livre)
├── auth-guard.js                   — confere sessão em toda página protegida
├── marketplace-fees.js             — fallback estático do Mercado Livre (Clássico/Premium)
├── styles.css                      — design tokens (Manual de Marca RS) + todo o CSS
├── theme-init.js / theme-toggle.js — tema claro/escuro
├── background-fx.js                — decoração compartilhada (estrelas, revelação ao rolar)
├── api/
│   ├── auth/            — login, logout, sessão atual, OAuth do Mercado Livre (start/callback)
│   ├── admin/users.js   — criar, listar, redefinir senha, remover usuário (só admin)
│   ├── profile/update.js
│   ├── marketplace-rates.js  — taxas de referência por marketplace/categoria (GET p/ qualquer logado, escrita só admin)
│   └── ml-*.js          — busca de categoria, taxa e frete reais do Mercado Livre
├── lib/
│   ├── auth.js           — sessão própria, Supabase Admin API, rate limit de login
│   ├── ml.js              — OAuth2 e chamadas à API do Mercado Livre (token por usuário)
│   ├── marketplaceRates.js — CRUD das taxas de referência (Supabase REST)
│   ├── redis.js / rateLimit.js / env.js
├── calc-form-ui.js         — chips de marketplace, accordion de frete, tooltips, prévia de preço ao vivo (não mexe em cálculo/validação)
├── scripts/               — SQL de schema + scripts Node avulsos (bootstrap de admin, reset de senha, seed de taxas — seed-amazon-rates.js, seed-shopee-rates.js, seed-tiktok-rates.js)
└── assets/
    ├── marketplace-logos/  — logos oficiais (Mercado Livre, Amazon, Shopee, TikTok Shop, Magalu)
    └── fonts/               — League Spartan, Playfair Display, Inter (self-hosted)
```

**Decisões que valem a pena entender antes de mexer:**

- **Sem SDK de terceiro no navegador.** Nem `@supabase/supabase-js`, nem chamada direta à API
  do Mercado Livre do lado do cliente. O navegador só fala com `/api/*` do próprio domínio —
  isso mantém um `Content-Security-Policy` com `connect-src 'self'` sem nenhuma exceção de
  origem externa (ver [Segurança](#segurança)).
- **Sessão própria, não a do Supabase.** `lib/auth.js` chama o Supabase (GoTrue) só para
  validar e-mail/senha; a partir daí a ferramenta emite seu próprio cookie de sessão
  (`HttpOnly; Secure; SameSite=Strict`, UUID aleatório mapeado no Redis, TTL de 7 dias).
- **Cada usuário conecta a própria conta do Mercado Livre** (OAuth por usuário, token salvo
  em `ml:tokens:{id do usuário}` no Redis) — não é uma conexão global da RS.
- **Limite de 12 Serverless Functions** (plano Hobby da Vercel). Por isso várias rotas
  relacionadas moram no mesmo arquivo, roteadas por método HTTP (ex.: `api/admin/users.js`
  faz GET/POST/PATCH/DELETE; `api/marketplace-rates.js` também). Antes de criar um arquivo
  novo em `api/`, veja se cabe como método novo em uma rota existente.

## Fórmula de precificação

```
CP = custo do produto
CA = custos adicionais
FR = frete pago pelo vendedor (manual ou consultado via API do Mercado Livre)
TF = taxa fixa da venda (varia por marketplace/categoria/faixa de preço)
TP = taxa percentual do marketplace (decimal)
MK = markup desejado sobre o custo (decimal, sem limite superior)
RP = reserva de marketing opcional (decimal, cupom/campanha/anúncio)
XP = imposto opcional (decimal, digitado manualmente — a ferramenta não sabe o regime
     tributário de ninguém)

Preço de venda sugerido:
PV = ((CP + CA) × (1 + MK) + TF + FR) / (1 - TP - RP - XP)

Lucro líquido = PV − CP − CA − FR − (PV × TP) − TF − (PV × RP) − (PV × XP)
```

O markup incide só sobre `CP + CA` — nunca sobre o frete ou a taxa fixa, senão o vendedor
estaria "lucrando" em cima de um custo repassado. A reserva de marketing e o imposto entram no
mesmo denominador que a comissão do marketplace (não no markup), pelo mesmo motivo: o preço
sobe o suficiente pra cobrir exatamente esse % sem tirar nada do lucro combinado. Resultado: o
**lucro líquido em reais é idêntico em todos os cartões**, com ou sem reserva/imposto ligados,
para qualquer marketplace ou categoria — o que muda de verdade é o preço final ao cliente e a
taxa cobrada.

**Cálculo iterativo.** Taxa fixa e frete reais (Mercado Livre) e taxa por categoria/faixa de
preço (Amazon, Shopee, TikTok Shop, Magalu) podem depender do preço final — que depende deles.
`resolveEntryPricing()` (`script.js`) recalcula em cima do próprio resultado até estabilizar
(máx. 12 tentativas no motor local; o handler de submit usa uma versão à parte com consulta
real à API, máx. 8 rodadas). Perto de um limiar onde a regra muda bruscamente (ex.: taxa fixa
do ML que cai de ~50% do preço para R$0 acima de R$12,50), pode não existir um preço de
equilíbrio matemático único — a detecção de ciclo guarda cada preço arredondado já consultado
nessa simulação (não só "a diferença ficou pequena", que não pega ciclos com salto grande) e,
ao repetir um preço já visto, fica com o candidato de **maior taxa fixa** entre os vistos,
recalculando o preço final a partir dele — mais conservador para a margem do vendedor, e
sempre consistente entre o preço mostrado e a taxa mostrada.

## Integração com o Mercado Livre

Cada usuário conecta a **própria conta** — não existe mais uma conexão única da RS. A tela de
conectar/desconectar fica em `settings.html` ("Configurações", linkada no menu do cabeçalho em
toda página) — separada da calculadora de propósito, pra não competir por espaço com o
formulário de precificação. Quando o usuário abre a calculadora sem estar conectado, um popup
avisa e convida a conectar (aparece uma vez por sessão do navegador; "Agora não"/Esc/clique
fora não incomoda de novo até a aba ser fechada).

- **OAuth2 por usuário** (`api/auth/start.js` + `api/auth/callback.js` + `lib/ml.js`): o
  usuário clica em "Conectar Mercado Livre" (em Configurações), autoriza na tela do próprio
  ML, e o token (access de 6h + refresh de 6 meses, renovado automaticamente) fica no Redis em
  `ml:tokens:{id do usuário}`. Um `state` OAuth de uso único liga o retorno do ML ao usuário
  que iniciou a conexão (o cookie de sessão não pode ser usado aqui — é
  `SameSite=Strict`, e o redirecionamento do ML é uma navegação de origem cruzada).
- **Permissão exigida no app**: "Publicação e sincronização" habilitada no painel do app em
  developers.mercadolivre.com.br/devcenter — sem ela, a consulta de taxa responde `403
  PA_UNAUTHORIZED_RESULT_FROM_POLICIES` mesmo com token válido.
- **Busca de categoria** (`api/ml-category-search.js`, público, sem OAuth): sugere categorias
  reais a partir do nome do produto digitado (`GET /sites/MLB/domain_discovery/search`).
- **Taxa real, incluindo a taxa fixa** (`api/ml-fee.js`): com categoria escolhida, consulta
  `GET /sites/MLB/listing_prices` e substitui tanto a comissão quanto a taxa fixa (campo
  `sale_fee_details.fixed_fee`) dos cartões Clássico (`gold_special`) e Premium (`gold_pro`)
  pelo valor real, com o selo "Taxa real consultada agora" — **nunca uma tabela cadastrada por
  nós**; o valor exibido é sempre exatamente o que a API retornar naquele cálculo. Hoje (dado
  confirmado ao vivo em 15/07/2026, 100 consultas em 5 categorias) isso equivale a ~50% do
  preço até R$12,50 e R$0,00 acima disso — mas se o Mercado Livre mudar a regra de novo, a
  ferramenta acompanha sozinha, sem precisar de código novo (ver nota em
  `estimateReferenceFixedFee()`, `script.js`, usada só como estimativa de partida quando não há
  categoria selecionada). Um custo em degraus por faixa de preço (R$6,25/6,50/6,75 até R$79)
  circulou bastante em conteúdo de terceiros — existiu de fato até fev/2026, mas foi
  substituído em 2 de março de 2026 por um custo logístico variável por peso/dimensão/preço,
  que é uma coisa separada (frete, não taxa de venda).
- **Frete real** (`api/ml-shipping.js`): com peso + dimensões da embalagem, consulta
  `GET /users/{id}/shipping_options` com `free_shipping=true`; o custo repassado ao vendedor
  é `list_cost − cost`, usando a modalidade que o próprio ML retornar como mais barata pra
  aquela conta/pacote (nunca uma modalidade presumida por nós — Full, Flex etc.). **Só funciona
  com Mercado Envios aceito na conta** — sem isso, a API devolve o valor cheio (sem subsídio).
  O popup de detalhe de cada cartão mostra explicitamente a origem do frete usado no cálculo
  (`shippingSourceLabel()`, `script.js`): informado manualmente, a modalidade real retornada
  pela API, ou nenhum custo aplicado — nunca fica implícito.

## Amazon, Shopee, TikTok Shop e Magalu (taxas de referência editáveis)

Esses marketplaces (e outros grandes marketplaces brasileiros — Shein)
**não têm API pública para calcular taxa antes da venda**:

- **Amazon** tem uma API de estimativa de taxa (`Product Fees API` / SP-API), mas em 2026
  passou a exigir assinatura paga de US$1.400/ano — inviável para este caso de uso.
- **Shopee** e **TikTok Shop** só expõem taxa de um pedido **já concluído**
  (`payment.get_escrow_detail` / Finance API), nunca uma simulação prévia.
- **Magalu** só tem uma API de conciliação financeira (dados de pedidos já
  entregues/cancelados, `developers.magalu.com`), nunca uma simulação prévia. Diferente das
  outras, sua comissão varia principalmente pela **forma de repasse** escolhida pelo vendedor
  (parcelado × à vista/antecipado), não por categoria de produto — por isso o campo
  "categoria" cadastrado pro Magalu é, na prática, a forma de repasse.
- **Shein** não tem API de taxa documentada publicamente.

A solução foi uma **tabela de referência editável pelo admin** — guardada no banco
(`marketplace_rates`, Supabase), não hardcoded em arquivo de código. O admin corrige um valor
direto no painel (`admin.html` → "Taxas de marketplace", com um seletor pra trocar entre
marketplaces cadastrados), sem precisar de deploy.

O modelo de dados cobre os dois formatos de cobrança encontrados na pesquisa, que exigiram
motores de cálculo diferentes:

- **Por categoria** (Amazon): cada linha é uma categoria de produto, escolhida pelo usuário
  num seletor. Campos: `pct` (comissão base), `tier_threshold`/`pct_above_threshold`
  (percentual muda acima de um valor — ex.: Acessórios Eletrônicos: 15% até R$100, 10% acima),
  `fixed_fee` (tarifa fixa somada à comissão — ex.: Mídia: +R$2,00 fixo), `min_fee` (comissão
  mínima — R$1,00 em qualquer categoria da Amazon). Resolvido como um percentual "efetivo" por
  iteração (`kind: "amazon-tiered"` em `resolveFeesForEntry()`, `script.js`).
- **Por faixa de preço** (Shopee, TikTok Shop): a comissão não varia por categoria, só pelo
  preço final do item — cada linha é uma faixa (ex.: Shopee "R$80,00 a R$99,99": 14% + R$16
  fixo), escolhida **automaticamente** pelo motor de cálculo a partir do preço, não pelo
  usuário (por isso esses dois aparecem como um simples checkbox "Incluir X", sem seletor de
  categoria). Resolvido pelo mesmo motor iterativo já usado pela taxa fixa do Mercado Livre
  (`kind: "price-banded"`), com uma regra extra opcional por linha (`entry.halveFeeBelow` —
  usada só pela Shopee, cuja tarifa fixa vira metade do preço do produto abaixo de R$8).

**Hoje Amazon (38 categorias), Shopee (5 faixas), TikTok Shop (2 faixas) e Magalu (2 formas de
repasse) estão cadastradas**, todas conferidas contra a fonte oficial de cada marketplace
(Amazon/Shopee/TikTok Shop em 13/07/2026, `scripts/seed-amazon-rates.js`,
`seed-shopee-rates.js`, `seed-tiktok-rates.js`; Magalu em 15/07/2026, com os percentuais
informados pela diretoria de e-commerce e a tarifa fixa de referência do Portal do Seller).
Shein entra pelo mesmo processo: alguém com acesso ao painel do vendedor manda a tabela
oficial de comissão, os valores são conferidos e cadastrados.

Sem categoria/forma de repasse selecionada (Amazon, Magalu) ou checkbox marcado
(Shopee/TikTok Shop), o marketplace de referência simplesmente **não entra** na comparação (em
vez de mostrar uma taxa "média" que poderia enganar).

## Contas e permissões

Não existe cadastro público — só um **admin** cria contas, pelo painel (`admin.html`).

- **Papéis**: `admin` (cria/remove usuários, redefine senha, gerencia taxas de marketplace,
  usa a calculadora) e `client` (usa só a calculadora e o próprio perfil). Guardados em
  `public.profiles` (Supabase), criados automaticamente por um gatilho quando uma conta nova
  aparece em `auth.users` — o gatilho **sempre** cria como `client`, nunca confia no papel
  enviado pelo cliente (ver [Segurança](#segurança)).
- **Senha**: gerada automaticamente (16 caracteres, sem `0/O/1/l`) na criação e mostrada uma
  única vez na tela do admin. A ferramenta nunca guarda senha em texto puro — quem guarda
  (com hash) é o Supabase Auth.
- **Redefinir senha**: o admin pode gerar uma nova senha para qualquer usuário (inclusive a
  própria) pelo painel. Se o próprio admin ficar sem acesso, `scripts/reset-password.js`
  redefine por fora, usando a `service_role` key direto (não depende de estar logado).
- **Remover usuário**: exclui a conta do Supabase Auth (a linha em `profiles` cai junto,
  `ON DELETE CASCADE`) e limpa a conexão com o Mercado Livre dessa conta, se houver.
  Protegido contra autoexclusão (o admin não vê o botão na própria linha, e o servidor
  bloqueia mesmo que o botão seja forçado).
- **Primeiro admin**: `scripts/create-first-admin.js` (bootstrap fora da aplicação, já que só
  admin cria conta).
- **Fora de escopo por enquanto**: cliente redefinir a própria senha sem passar pelo admin.

## Segurança

- **Content-Security-Policy restritivo** (deny-by-default): `default-src 'none'`, liberando
  só o necessário — `script-src 'self'` (sem inline/eval), `connect-src 'self'` (só rotas
  `/api/*` do próprio domínio; o navegador nunca fala direto com Mercado Livre ou Supabase),
  `img-src` com exceção só para o bucket público de avatares no Supabase Storage.
- **Zero dependência externa em runtime**: fontes (League Spartan, Playfair Display, Inter)
  self-hosted em `assets/fonts/`, nenhuma chamada a CDN ou Google Fonts.
- **Sem superfície de XSS**: nenhum uso de `innerHTML`/`document.write`/`eval`; toda saída
  dinâmica via `textContent`/`createElement`.
- **CSRF**: `/api/auth/login` exige `Content-Type: application/json` (um `<form>` de outro
  site não consegue montar essa requisição).
- **Rate limiting**: 5 tentativas de login erradas por e-mail bloqueiam por 15 minutos
  (contador atômico no Redis); busca de categoria do ML (rota pública, sem login) limitada a
  30 requisições/minuto por IP.
- **HTML-injection corrigida**: a página de erro do callback OAuth do Mercado Livre escapa
  qualquer valor antes de montar o HTML (o parâmetro `error` vem da URL, então é
  manipulável por qualquer um — antes dava para injetar uma tag de redirecionamento).
- **Cadastro público desligado no Supabase** + gatilho de criação de perfil que nunca confia
  no papel (`role`) enviado pelo próprio cliente — só `role='client'` por padrão; promover a
  admin exige uma segunda chamada com `service_role`, só possível pelo backend.
- Headers HTTP adicionais (`X-Frame-Options`, `Strict-Transport-Security`,
  `Permissions-Policy`) em `vercel.json` — não têm efeito quando declarados só em `<meta>`.
- Revisado de novo em 13/07/2026 depois da leva de features de marketplace/layout (Amazon,
  Shopee, TikTok Shop, popup de detalhe, área de Configurações) — nenhuma delas abriu brecha
  nova; o padrão de "zero `innerHTML`" segue valendo em todo o código.

## Identidade visual

Segue o **Manual de Marca RS (2026)**: azul-marinho `#1B1B4F` e âmbar `#E8A020` como cores
primárias, com a paleta secundária/de apoio do manual completa nos temas claro (padrão) e
escuro (alternativa, botão no cabeçalho). Tipografia: **League Spartan** (títulos, fonte
primária do manual), **Playfair Display** (citações/destaques emocionais, fonte terciária) e
**Inter** (corpo de texto) — todas self-hosted. O login usa um painel de identidade fixo
(sempre nas cores do manual, independente do tema escolhido) com uma textura de grade sutil,
reforçando o arquétipo Sábio/Governante do manual (estrutura, organização, controle).

Cada cartão de marketplace usa as cores reais da própria marca (não uma paleta genérica) pra
ficar reconhecível de relance: Mercado Livre em amarelo, Amazon em branco/navy/laranja, Shopee
em branco/laranja, TikTok Shop em branco/preto com o duotone ciano/magenta característico, e
Magalu em branco/azul (`#0E89FF`). O detalhe completo de cada cartão abre num popup nativo
(`<dialog>`), mantendo a grade de comparação compacta mesmo com vários marketplaces escolhidos
ao mesmo tempo. Na entrada de dados, cada marketplace de referência (Amazon/Shopee/TikTok
Shop/Magalu) é um **chip clicável** com a mesma cor de marca, que expande pra mostrar o campo
relevante (categoria, forma de repasse, ou checkbox) só quando ativado.

## Testes

Sem suíte automatizada formal — verificação feita via Playwright (Chromium headless) a cada
mudança relevante: fluxo completo de login → calcular (nos marketplaces de referência e com
taxa real do Mercado Livre) → abrir o popup de detalhe de cada cartão → painel admin (usuários
e taxas de marketplace) → Configurações, responsividade (320px a 1440px), navegação por
teclado, contraste de cores (WCAG AA), ausência de erros de console, e conferência matemática
dos cenários de cálculo (inclusive casos de borda como taxa por faixa de preço e comissão
mínima). Testes de produção sempre depois de aprovação em ambiente local (exceto o fluxo de
conexão com o Mercado Livre, que só funciona em produção — ver [Como rodar
localmente](#como-rodar-localmente)); quando o ambiente local está indisponível ou instável, a
verificação final é feita direto em produção, sempre com limpeza de qualquer dado de teste
criado (usuário, taxa de marketplace) logo em seguida.

## Limitações conhecidas e próximos passos

- Shein ainda não tem taxas cadastradas (estrutura pronta, falta o dado — ver [Amazon, Shopee,
  TikTok Shop e Magalu](#amazon-shopee-tiktok-shop-e-magalu-taxas-de-referência-editáveis)).
- Cliente não redefine a própria senha sem passar pelo admin.
- Frete real do Mercado Livre exige a conta ter Mercado Envios aceito — cada cliente que
  conectar precisa dessa adesão feita no próprio painel do Mercado Livre para ver o valor
  real (sem isso, a ferramenta simplesmente não aplica custo de frete algum, e o popup de
  detalhe deixa isso explícito).
- A página de Configurações hoje só tem a conexão com o Mercado Livre — é o lugar natural pra
  outras preferências de conta que vierem depois.
- Categoria do Mercado Livre selecionada mostra só o nome final (ex.: "Fones de Ouvido"), não
  o caminho completo até a raiz — dificulta saber que tipo de produto realmente entra ali.
  Tecnicamente pronto pra fazer (`GET /categories/{id}`, campo `path_from_root`, endpoint
  público sem autenticação), ainda não implementado.
