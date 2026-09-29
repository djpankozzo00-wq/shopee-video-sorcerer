import { createServerFn } from "@tanstack/react-start";

type ProductInfo = {
  title: string;
  description: string;
  price?: string;
  image?: string;
  shopName?: string;
  source: "shopee_api" | "not_found";
  note?: string;
};

function extractItemIds(link: string): { itemId?: string; shopId?: string } {
  const a = link.match(/i\.(\d+)\.(\d+)/);
  if (a) return { shopId: a[1], itemId: a[2] };
  const b = link.match(/[?&]itemId=(\d+)/i);
  const c = link.match(/[?&]shopId=(\d+)/i);
  return { itemId: b?.[1], shopId: c?.[1] };
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const fetchShopeeProduct = createServerFn({ method: "POST" })
  .inputValidator((input: { link: string }) => {
    const link = (input?.link ?? "").trim();
    if (!link) throw new Error("Informe o link do produto.");
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
    if (!itemId) {
      return {
        title: "",
        description: "",
        source: "not_found",
        note: "Não encontrei o código do produto no link. Cole o link completo do produto ou preencha os dados manualmente.",
      };
    }

    const query = `{ productOfferV2(itemId: ${itemId}${shopId ? `, shopId: ${shopId}` : ""}, limit: 1) { nodes { itemId productName priceMin priceMax imageUrl shopName productCatIds ratingStar sales } } }`;
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
      const node = json?.data?.productOfferV2?.nodes?.[0];
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
"hashtags":["#...","#...","#...","#...","#..."]}
Regras: roteiro total com até 30 segundos de fala (máx ~75 palavras somando as 3 partes).
Hashtags: no máximo 5, sendo 1-2 gerais da Shopee (ex: #Achadinhos, #ShopeeBrasil) e 2-3 bem específicas do nicho do produto.
Se o mês atual tiver campanha de dia gêmeo (ex: setembro = #Shopee0909, outubro = #Shopee1010), inclua a hashtag da campanha do mês atual.`;

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
            content: `Mês atual: ${monthLabel}.\nTítulo do Produto: ${data.title}\nDescrição/Especificações: ${data.description || "(não informada)"}`,
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
      hashtags: (parsed.hashtags ?? []).slice(0, 5),
    };
  });
