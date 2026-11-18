/// <reference types="vite/client" />

// variáveis do build público (src/publico.ts); todas opcionais — sem elas o app roda no modo local
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_MIDIA_URL?: string;
  /** chave pública do Cloudflare Turnstile (proteção do login contra robôs; docs/deploy.md, passo 1.7) */
  readonly VITE_TURNSTILE_SITEKEY?: string;
  /** contato para pedidos de retirada de material e de exclusão de conta (página Sobre) */
  readonly VITE_CONTATO?: string;
}

// a biblioteca do Supabase entra por um módulo virtual: no modo local o vite.config.ts troca por um substituto vazio
// (o modo local não depende do pacote nem o leva para o build); os tipos são os da biblioteca
declare module "virtual:supabase" {
  export * from "@supabase/supabase-js";
}
