import { createServerFn } from "@tanstack/react-start";

export type ShopeeSearchProduct = {
  itemId: string;
  shopId: string;
  title: string;
  description: string;
  price?: string | undefined;
  image?: string | undefined;
  link?: string | undefined;
  offerLink?: string | undefined;
};

type ProductInfo = {
  title: string;
  description: string;
  price?: string | undefined;
  image?: string | undefined;
  shopName?: string | undefined;
  source: "shopee_api" | "not_found";
  note?: string | undefined;
};

function extractItemIds(link: string): { itemId?: string | undefined; shopId?: string | undefined } {
  const cleanLink = (link || "").trim();

  // Formato:
  // https://shopee.com.br/product/413596010/3188171465
  const productPathMatch = cleanLink.match(
    /\/product\/(\d+)\/(\d+)/i
  );

  if (productPathMatch) {
    return {
      shopId: productPathMatch[1],
      itemId: productPathMatch[2],
    };
  }

  // Formato:
  // https://shopee.com.br/product-i.413596010.3188171465
  const productIMatch = cleanLink.match(
    /product-i\.(\d+)\.(\d+)/i
  );

  if (productIMatch) {
    return {
      shopId: productIMatch[1],
      itemId: productIMatch[2],
    };
  }

  return {
    shopId: undefined,
    itemId: undefined,
  };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function queryShopee(appId: string, appSecret: string, query: string, random: boolean): Promise<ProductInfo> {
    const payload = JSON.stringify({ query });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sha256Hex(`${appId}${timestamp}${payload}${appSecret}`);

    try {
      const res = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
        },
        body: payload,
      });
      const json = (await res.json()) as {
        data?: { productOfferV2?: { nodes?: Array<Record<string, unknown>> } };
        errors?: Array<{ message?: string }>;
      };
      const list = json?.data?.productOfferV2?.nodes ?? [];
      const node = random ? list[Math.floor(Math.random() * list.length)] : list[0];
      if (!node) {
        return {
          title: "",
          description: "",
          source: "not_found",
          note:
            json?.errors?.[0]?.message ??
            "Produto não encontrado pela API de afiliados. Preencha os dados manualmente.",
        };
      }
      const priceMin = String(node["priceMin"] ?? "");
      const priceMax = String(node["priceMax"] ?? "");
      const details = [
        node["shopName"] ? `Loja: ${node["shopName"]}` : "",
        priceMin ? `Preço: R$ ${priceMin}${priceMax && priceMax !== priceMin ? ` - R$ ${priceMax}` : ""}` : "",
        node["ratingStar"] ? `Avaliação: ${node["ratingStar"]}` : "",
        node["sales"] ? `Vendas: ${node["sales"]}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return {
        title: String(node["productName"] ?? ""),
        description: details,
        price: priceMin ? `R$ ${priceMin}` : undefined,
        image: node["imageUrl"] ? String(node["imageUrl"]) : undefined,
        shopName: node["shopName"] ? String(node["shopName"]) : undefined,
        source: "shopee_api",
      };
    } catch {
      return {
        title: "",
        description: "",
        source: "not_found",
        note: "Não consegui falar com a Shopee agora. Preencha os dados manualmente.",
      };
    }
}

export const searchShopeeProducts = createServerFn({ method: "POST" })
  .inputValidator((input: { query: string }) => {
    const query = String(input?.query ?? "").trim();

    if (!query) {
      throw new Error("Digite o nome de um produto.");
    }

    return { query };
  })
  .handler(async ({ data }): Promise<ShopeeSearchProduct[]> => {
    const appId = process.env["SHOPEE_APP_ID"];
    const appSecret = process.env["SHOPEE_APP_SECRET"];

    if (!appId || !appSecret) {
      throw new Error("Credenciais da Shopee não configuradas.");
    }

    const queryText = data.query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    const query = `{
      productOfferV2(
        keyword: "${queryText}",
        sortType: 1,
        page: 1,
        limit: 20
      ) {
        nodes {
          itemId
          productName
          productLink
          offerLink
          imageUrl
          priceMin
          priceMax
          sales
          ratingStar
          shopId
          shopName
        }
      }
    }`;

    return await queryShopeeProducts(
      appId,
      appSecret,
      query,
    );
  });

async function queryShopeeProducts(
  appId: string,
  appSecret: string,
  query: string,
): Promise<ShopeeSearchProduct[]> {
  const payload = JSON.stringify({ query });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha256Hex(
    `${appId}${timestamp}${payload}${appSecret}`,
  );

  const res = await fetch(
    "https://open-api.affiliate.shopee.com.br/graphql",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `SHA256 Credential=${appId}, Signature=${signature}, Timestamp=${timestamp}`,
      },
      body: payload,
    },
  );

  const json = (await res.json()) as {
    data?: {
      productOfferV2?: {
        nodes?: Array<Record<string, unknown>>;
      };
    };
    errors?: Array<{ message?: string }>;
  };

  if (!res.ok || json.errors?.length) {
    throw new Error(
      json.errors?.[0]?.message ?? "Erro ao buscar produtos na Shopee.",
    );
  }

  const nodes = json.data?.productOfferV2?.nodes ?? [];

  return nodes.map((node) => {
    const priceMin = String(node["priceMin"] ?? "");
    const priceMax = String(node["priceMax"] ?? "");

    const price =
      priceMin && priceMax && priceMin !== priceMax
        ? `R$ ${priceMin} - R$ ${priceMax}`
        : priceMin
          ? `R$ ${priceMin}`
          : undefined;

    const details = [
      node["shopName"] ? `Loja: ${node["shopName"]}` : "",
      price ? `Preço: ${price}` : "",
      node["sales"] !== undefined
        ? `Vendas: ${node["sales"]}`
        : "",
      node["ratingStar"]
        ? `Avaliação: ${node["ratingStar"]}`
        : "",
    ]
      .filter(Boolean)
      .join(" | ");

    return {
      itemId: String(node["itemId"] ?? ""),
      shopId: String(node["shopId"] ?? ""),
      title: String(node["productName"] ?? ""),
      description: details,
      price,
      image: node["imageUrl"]
        ? String(node["imageUrl"])
        : undefined,
      link: node["productLink"]
        ? String(node["productLink"])
        : undefined,
      offerLink: node["offerLink"]
        ? String(node["offerLink"])
        : undefined,
    };
  });
}

export const fetchShopeeProduct = createServerFn({ method: "POST" })
  .inputValidator((input: { link: string }) => {
    const link = (input?.link ?? "").trim();
    return { link };
  })
  .handler(async ({ data }): Promise<ProductInfo> => {
    const appId = process.env["SHOPEE_APP_ID"];
    const appSecret = process.env["SHOPEE_APP_SECRET"];
    if (!appId || !appSecret) {
      return {
        title: "",
        description: "",
        source: "not_found",
        note: "Credenciais da Shopee não configuradas.",
      };
    }

    const { itemId, shopId } = extractItemIds(data.link);
    if (!data.link) {
      // sem link: pega uma oferta em alta aleatória
      const page = 1 + Math.floor(Math.random() * 5);
      const q = `{ productOfferV2(sortType: 2, page: ${page}, limit: 20) { nodes { itemId productName priceMin priceMax imageUrl shopName ratingStar sales } } }`;
      return await queryShopee(appId, appSecret, q, true);
    }
    if (!itemId) {
      return {
        title: "",
        description: "",
        source: "not_found",
        note: "Não encontrei o código do produto no link. Cole o link completo do produto ou preencha os dados manualmente.",
      };
    }

    const query = `{ productOfferV2(itemId: ${itemId}${shopId ? `, shopId: ${shopId}` : ""}, limit: 1) { nodes { itemId productName priceMin priceMax imageUrl shopName productCatIds ratingStar sales } } }`;
    return await queryShopee(appId, appSecret, query, false);
  });

export type ScriptResult = {
  hooks: string[];
  script: { problema: string; demonstracao: string; cta: string };
  legenda: { titulo: string; beneficio: string; cta: string };
  hashtags: string[];
};

const SYSTEM = `Você é especialista em Social Commerce e no algoritmo do Shopee Vídeo, no Brasil.
Gere conteúdo de vendas em português do Brasil, informal, persuasivo, estilo "dica de amigo".
Responda SOMENTE com JSON válido neste formato:
{"hooks":["3 frases de impacto para os 0-3s"],
"script":{"problema":"...","demonstracao":"...","cta":"..."},
"legenda":{"titulo":"TÍTULO EM MAIÚSCULAS","beneficio":"uma linha","cta":"uma linha"},
"hashtags":["10 hashtags"]}
Regras: roteiro total com até 30 segundos de fala (máx ~75 palavras somando as 3 partes).
Hashtags: exatamente 10 estratégicas: 3 gerais da Shopee (ex: #Achadinhos, #ShopeeBrasil, #ShopeeVideo), 4 bem específicas do nicho do produto, 2 de intenção de compra/tendência (ex: #PromoçãoShopee, #Viral) e a hashtag de campanha informada, que é obrigatória.`;

export const generateVideoScript = createServerFn({ method: "POST" })
  .inputValidator((input: { title: string; description: string }) => {
    const title = (input?.title ?? "").trim();
    if (!title) throw new Error("Informe o título do produto.");
    return { title, description: (input?.description ?? "").trim() };
  })
  .handler(async ({ data }): Promise<ScriptResult> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA não configurada neste projeto.");

    const now = new Date();
    const monthLabel = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    // campanha do próximo dia gêmeo: após o dia X.X do mês, vira o mês seguinte
    const br = new Date(now.getTime() - 3 * 3600 * 1000);
    let m = br.getUTCMonth() + 1;
    if (br.getUTCDate() > m) m = (m % 12) + 1;
    const mm = String(m).padStart(2, "0");
    const campaign = `#Shopee${mm}${mm}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
        input: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Mês atual: ${monthLabel}. Hashtag de campanha obrigatória: ${campaign}.\nTítulo do Produto: ${data.title}\nDescrição/Especificações: ${data.description || "(não informada)"}`,
          },
        ],
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("Muitas solicitações agora. Tente em instantes.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados neste projeto.");
      console.error("ai gateway error", res.status, detail);
      throw new Error("Não consegui gerar o roteiro agora.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const event = JSON.parse(raw) as { type?: string; delta?: string };
          if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
            text += event.delta;
          }
        } catch {
          /* ignore partial frames */
        }
      }
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("A IA respondeu em um formato inesperado. Tente novamente.");
    const parsed = JSON.parse(match[0]) as ScriptResult;
    return {
      hooks: (parsed.hooks ?? []).slice(0, 3),
      script: {
        problema: parsed.script?.problema ?? "",
        demonstracao: parsed.script?.demonstracao ?? "",
        cta: parsed.script?.cta ?? "",
      },
      legenda: {
        titulo: parsed.legenda?.titulo ?? "",
        beneficio: parsed.legenda?.beneficio ?? "",
        cta: parsed.legenda?.cta ?? "",
      },
      hashtags: [campaign, ...(parsed.hashtags ?? []).filter((h) => h.toLowerCase() !== campaign.toLowerCase())].slice(0, 10),
    };
  });
