"use strict";

/**
 * Tabela de referência de taxas do Mercado Livre (fallback).
 *
 * A ferramenta era multi-marketplace (Mercado Livre, Shopee, TikTok Shop,
 * Amazon, Magalu, Shein) até 10/07/2026, quando o foco passou a ser só o
 * Mercado Livre — o único com integração real via API (ver seção
 * "Integração real com o Mercado Livre" no README; o histórico da
 * pesquisa multi-marketplace também continua lá).
 *
 * Estes dois valores (Clássico/Premium) são só o FALLBACK: usados quando o
 * usuário não seleciona uma categoria no formulário, ou quando a consulta
 * a /api/ml-fee falha. Com categoria selecionada (e conta do ML
 * conectada), script.js substitui "pct" pelo valor real devolvido pela
 * API do ML (ver buildFeesWithRealMlData).
 *
 * IMPORTANTE — não existe mais um "fixedFee" fixo aqui. A taxa fixa
 * NÃO é um valor único por marketplace: ela depende do PREÇO da venda
 * (ver estimateReferenceFixedFee() em script.js e a nota de pesquisa
 * abaixo). Um "fixedFee: 6" universal aqui seria simplesmente errado.
 *
 * Fonte do percentual de referência (2026-07-10): média observada em
 * https://ecommercenapratica.com/blog/comissao-mercado-livre/ e
 * https://www.gestorshop.com.br/blog/comissoes-mercado-livre-2026-tabela
 * — só usado quando não há categoria selecionada; com categoria, o valor
 * real da API sempre tem prioridade.
 */

const MARKETPLACE_FEES = [
  {
    id: "meli_classico",
    label: "Mercado Livre — Clássico",
    shortLabel: "ML Clássico",
    theme: "meli",
    kind: "ml-reference",
    pct: 13,
    range: "11% a 14%",
    note: "Varia por categoria (ex.: moda ~14%, eletrônicos 11–13%). Selecione a categoria do produto para taxa e taxa fixa reais.",
  },
  {
    id: "meli_premium",
    label: "Mercado Livre — Premium",
    shortLabel: "ML Premium",
    theme: "meli",
    kind: "ml-reference",
    pct: 17,
    range: "16% a 19%",
    note: "Anúncio com parcelamento sem juros ao comprador. Selecione a categoria do produto para taxa e taxa fixa reais.",
  },
];
