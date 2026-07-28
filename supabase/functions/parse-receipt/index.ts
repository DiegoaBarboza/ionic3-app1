// Supabase Edge Function: parse-receipt
//
// Recebe a foto de uma nota fiscal (base64) e usa a API da Anthropic
// (Claude, com visão) para extrair categoria, valor, data, cidade e estado,
// devolvendo JSON estruturado para preencher o formulário de Lançamentos.
//
// Deploy: supabase functions deploy parse-receipt
// Secret necessário: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const CATEGORIES = ['combustivel', 'alimentacao', 'pedagio', 'hospedagem', 'impostos', 'diversos'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { image, mimeType } = await req.json();
    if (!image) {
      return json({ error: 'Campo "image" (base64) é obrigatório.' }, 400);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return json({ error: 'ANTHROPIC_API_KEY não configurada nas secrets do Supabase.' }, 500);
    }

    const today = new Date().toISOString().slice(0, 10);

    const prompt = `Você está analisando a foto de uma nota fiscal ou recibo brasileiro.
Extraia os dados e responda APENAS com um JSON válido, sem nenhum texto antes ou depois, no formato:
{"category":"combustivel|alimentacao|pedagio|hospedagem|impostos|diversos","amount":0.00,"date":"YYYY-MM-DD","city":"","state":"UF","description":""}

Regras:
- "category": escolha a categoria que melhor descreve a despesa entre: ${CATEGORIES.join(', ')}. Se não tiver certeza, use "diversos".
- "amount": valor total pago, em número (use ponto decimal, sem "R$" e sem separador de milhar).
- "date": data da compra no formato YYYY-MM-DD. Se não conseguir ler, use "${today}".
- "city" e "state": cidade e UF (sigla de 2 letras) do estabelecimento, se estiverem legíveis na nota.
- "description": um resumo curto (até 6 palavras) do que foi comprado/estabelecimento.
- Se algum campo não for legível, deixe como string vazia ("") ou 0 para amount, mas NUNCA invente dados.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image }
              }
            ]
          }
        ]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return json({ error: `Falha ao chamar a Anthropic API: ${errText}` }, 502);
    }

    const anthropicData = await anthropicRes.json();
    const textBlock = anthropicData.content?.find((c: { type: string }) => c.type === 'text');
    if (!textBlock) {
      return json({ error: 'Resposta da IA sem conteúdo de texto.' }, 502);
    }

    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (!match) {
      return json({ error: 'Não foi possível interpretar a resposta da IA.' }, 502);
    }

    const parsed = JSON.parse(match[0]);
    const result = {
      category: CATEGORIES.includes(parsed.category) ? parsed.category : 'diversos',
      amount: Number(parsed.amount) || 0,
      date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : today,
      city: parsed.city || '',
      state: (parsed.state || '').toUpperCase().slice(0, 2),
      description: parsed.description || ''
    };

    return json(result, 200);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' }
  });
}
