import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Check, Copy, Loader2, Search, Sparkles } from "lucide-react";

import { fetchShopeeProduct, generateVideoScript, type ScriptResult } from "@/lib/shopee.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Roteirista de Shopee Vídeo | Gerador de roteiros e hashtags" },
      {
        name: "description",
        content:
          "Cole o link do produto da Shopee e receba ganchos, roteiro de 30 segundos, legenda e as 10 hashtags estratégicas.",
      },
      { property: "og:title", content: "Roteirista de Shopee Vídeo" },
      {
        property: "og:description",
        content: "Ganchos, roteiro, legenda e hashtags prontas para o seu vídeo de vendas na Shopee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function CopyButton({ text, label = "Copiar" }: { text: string; label?: string | undefined }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? "Copiado!" : label}
    </button>
  );
}

function Card({
  title,
  copyText,
  copyLabel,
  children,
}: {
  title: string;
  copyText: string;
  copyLabel?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
        <CopyButton text={copyText} label={copyLabel} />
      </div>
      <div className="space-y-3 text-sm leading-relaxed text-card-foreground">{children}</div>
    </section>
  );
}

function Index() {
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [result, setResult] = useState<ScriptResult | null>(null);

  const fetchProduct = useServerFn(fetchShopeeProduct);
  const generate = useServerFn(generateVideoScript);

  const generateMutation = useMutation({
    mutationFn: (input: { title: string; description: string }) => generate({ data: input }),
    onSuccess: (data) => setResult(data),
  });

  const searchMutation = useMutation({
    mutationFn: (value: string) => fetchProduct({ data: { link: value } }),
    onSuccess: (product) => {
      setNote(product.note);
      setImage(product.image);
      if (product.title) {
        setTitle(product.title);
        setDescription(product.description);
        setResult(null);
        generateMutation.mutate({ title: product.title, description: product.description });
      }
    },
  });

  const busy = searchMutation.isPending || generateMutation.isPending;
  const error =
    (searchMutation.error as Error | null)?.message ?? (generateMutation.error as Error | null)?.message;

  const hashtagsText = result?.hashtags.join(" ") ?? "";
  const legendaText = result
    ? `${result.legenda.titulo}\n${result.legenda.beneficio}\n${result.legenda.cta}\n\n${hashtagsText}`
    : "";
  const roteiroText = result
    ? `PROBLEMA/DESEJO\n${result.script.problema}\n\nDEMONSTRAÇÃO\n${result.script.demonstracao}\n\nCTA\n${result.script.cta}`
    : "";
  const tudoText = result
    ? `GANCHOS\n${result.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\n${roteiroText}\n\nLEGENDA\n${legendaText}`
    : "";

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2 text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <Sparkles className="size-3.5" /> Shopee Vídeo
          </p>
          <h1 className="text-3xl font-black tracking-tight text-foreground">
            Roteiro de vendas em segundos
          </h1>
          <p className="text-sm text-muted-foreground">
            Toque no botão e eu escolho um achadinho em alta (ou cole um link, se quiser). Eu busco o produto e crio gancho, roteiro, legenda e hashtags.
          </p>
        </header>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <input
            value={link}
            onChange={(e) => {
  const value = e.target.value.replace(
    /https:\/\/shopee\.com\.br\/product\.(\d+)\.(\d+)/g,
    "https://shopee.com.br/product-i.$1.$2"
  );
  setLink(value);
}}
            placeholder="https://shopee.com.br/product-i.123456.789012"
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              generateMutation.reset();
              searchMutation.mutate(link.trim());
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {searchMutation.isPending
              ? "Buscando produto..."
              : generateMutation.isPending
                ? "Criando roteiro..."
                : "Buscar produto e gerar"}
          </button>

          <details className="rounded-xl bg-muted/60 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
              Preencher manualmente
            </summary>
            <div className="mt-3 space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título do produto"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição / especificações"
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                disabled={busy || !title.trim()}
                onClick={() => {
                  setResult(null);
                  generateMutation.mutate({ title: title.trim(), description: description.trim() });
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent"
              >
                Gerar com estes dados
              </button>
            </div>
          </details>

          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </section>

        {title && (
          <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
            {image && <img src={image} alt={title} className="size-16 rounded-lg object-cover" />}
            <div>
              <p className="text-sm font-semibold text-card-foreground">{title}</p>
              {description && <p className="text-xs text-muted-foreground">{description}</p>}
            </div>
          </section>
        )}

        {result && (
          <div className="space-y-4">
            <Card title="1. Gancho inicial (0-3s)" copyText={result.hooks.join("\n")}>
              <ol className="list-decimal space-y-1 pl-5">
                {result.hooks.map((hook) => (
                  <li key={hook}>{hook}</li>
                ))}
              </ol>
            </Card>

            <Card title="2. Roteiro (até 30s)" copyText={roteiroText}>
              <p>
                <strong>Problema/Desejo:</strong> {result.script.problema}
              </p>
              <p>
                <strong>Demonstração:</strong> {result.script.demonstracao}
              </p>
              <p>
                <strong>CTA:</strong> {result.script.cta}
              </p>
            </Card>

            <Card title="3. Legenda profissional" copyText={legendaText} copyLabel="Copiar legenda">
              <p className="font-bold uppercase">{result.legenda.titulo}</p>
              <p>{result.legenda.beneficio}</p>
              <p>{result.legenda.cta}</p>
            </Card>

            <Card title="4. Hashtags estratégicas" copyText={hashtagsText} copyLabel="Copiar #">
              <div className="flex flex-wrap gap-2">
                {result.hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Card>

            <div className="flex justify-center">
              <CopyButton text={tudoText} label="Copiar tudo" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
