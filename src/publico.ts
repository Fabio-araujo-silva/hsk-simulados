// Modo do app, decidido NO BUILD pelas variáveis VITE_ (ver docs/deploy.md):
//  - local (padrão, `npm run dev`): progresso em progresso/*.json pelo servidor local, voz gerada na hora, transcrição do HSKK;
//  - público (site na Vercel): com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY definidas — contas por e-mail e progresso
//    na nuvem (Supabase), voz sintética só do que já está em public/tts e HSKK sem transcrição automática.
// VITE_MIDIA_URL (opcional, independente) manda buscar o áudio e as figuras pesados num bucket (Cloudflare R2),
// porque eles não cabem no deploy da Vercel. Sem nenhuma dessas variáveis o app é exatamente o de sempre.

const limpa = (s: string | undefined) => (s ?? "").trim().replace(/\/+$/, "");

export const SUPABASE_URL = limpa(import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
export const MODO_PUBLICO = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

/** endereço do bucket público com audio/, img/, hskk/audio/ e hskk/img/ ("" = servir de public/, como sempre) */
export const MIDIA_URL = limpa(import.meta.env.VITE_MIDIA_URL);

/** chave pública (site key) do Cloudflare Turnstile: com ela o pedido do link de acesso leva o desafio anti-robô */
export const TURNSTILE_SITEKEY = (import.meta.env.VITE_TURNSTILE_SITEKEY ?? "").trim();

/** contato do responsável pelo site (e-mail ou link), mostrado na página Sobre para retirada de material e exclusão de conta */
export const CONTATO = (import.meta.env.VITE_CONTATO ?? "").trim();
