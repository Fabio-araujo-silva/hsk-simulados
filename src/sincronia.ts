import { useSyncExternalStore } from "react";
import type { Parte } from "./backup";
import * as nuvem from "./nuvem";
import { MODO_PUBLICO } from "./publico";

// Onde o progresso de uma parte (HSK 1–3 ou HSKK) fica guardado, além da memória. O HSK e o HSKK usam o mesmo código,
// cada um com a sua store (src/armazenamento.ts e src/hskk/armazenamento.ts). Três destinos possíveis:
//
//  - DISCO (modo local, `npm run dev`): progresso/<arquivo>.json pelo servidor local (vite.config.ts), com backup
//    diário. O arquivo é a única fonte da verdade: nada do navegador é misturado nem restaurado.
//  - NAVEGADOR: sem o servidor local (site estático) ou no site público sem login — localStorage + backup manual.
//  - NUVEM (site público com login): tabela `progresso` do Supabase (src/nuvem.ts). A nuvem manda, como o disco;
//    o navegador guarda só uma cópia de trabalho, marcada como "pendente" enquanto algo não subiu (se a aba fechar
//    antes do envio, o que ficou pendente é mesclado na próxima abertura). Ao entrar na conta, o que foi feito sem
//    login neste navegador é MESCLADO com a nuvem — a mesma mescla do "restaurar backup".
//    Vários aparelhos na mesma conta: cada gravação confere a versão da linha; se outro aparelho gravou no meio, este
//    relê a nuvem, mescla com o que fez e grava de novo (nada é sobrescrito às cegas). A aba que volta a aparecer
//    também relê. Formatar leva uma marca de data, para a mescla não trazer de volta o que foi formatado.

export type StatusDisco = "verificando" | "ok" | "salvando" | "sem-servidor" | "erro";

interface Opcoes<E extends { salvoEm: number }> {
  parte: Parte;
  /** chave do localStorage */
  chave: string;
  /** rota do servidor local */
  api: string;
  vazio: () => E;
  normaliza: (x: Partial<E> | null | undefined) => E;
  mescla: (a: E, b: E) => E;
  /** estado atual da store */
  le: () => E;
  /** troca o estado da store e avisa as telas (sem marcar nada para gravar) */
  troca: (e: E) => void;
}

interface CopiaDeTrabalho {
  uid: string;
  /** há alterações que ainda não chegaram à nuvem */
  pendente: boolean;
  estado: unknown;
  /** marca de formatação do estado (ver combina) */
  formatadoEm?: number;
}

export function criaSincronia<E extends { salvoEm: number }>(o: Opcoes<E>) {
  let carregado = false;
  let sujo = false;
  let gravacaoLocal: number | undefined;
  let gravacaoDisco: number | undefined;

  let statusDisco: StatusDisco = "verificando";
  const ouvintesStatus = new Set<() => void>();
  const mudaStatus = (s: StatusDisco) => {
    statusDisco = s;
    ouvintesStatus.forEach((f) => f());
  };
  function useStatus() {
    return useSyncExternalStore(
      (f) => {
        ouvintesStatus.add(f);
        return () => ouvintesStatus.delete(f);
      },
      () => statusDisco,
    );
  }

  // ------------------------------------------------------------- navegador

  function carregaLocal(): E {
    try {
      const bruto = localStorage.getItem(o.chave);
      return bruto ? o.normaliza(JSON.parse(bruto)) : o.vazio();
    } catch {
      return o.vazio();
    }
  }

  function gravaLocal() {
    try {
      localStorage.setItem(o.chave, JSON.stringify(o.le()));
    } catch (err) {
      console.error("não foi possível salvar no navegador", err);
    }
  }

  function apagaLocal() {
    try {
      localStorage.removeItem(o.chave);
    } catch {
      /* ignora */
    }
  }

  // ------------------------------------------------------- disco (modo local)

  async function enviaDisco() {
    if (statusDisco === "sem-servidor" || !carregado || !sujo) return;
    sujo = false;
    mudaStatus("salvando");
    try {
      const r = await fetch(o.api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o.le()) });
      mudaStatus(r.ok ? "ok" : "erro");
    } catch {
      mudaStatus("erro");
    }
  }

  async function iniciaDisco() {
    try {
      const r = await fetch(o.api, { cache: "no-store" });
      const tipo = r.headers.get("content-type") ?? "";
      if (r.status !== 204 && (!r.ok || !tipo.includes("json"))) throw new Error("sem servidor local");
      // o ARQUIVO LOCAL manda: nada do navegador é misturado nem restaurado
      const e = r.status === 204 ? o.vazio() : o.normaliza(await r.json());
      apagaLocal();
      carregado = true;
      // o estado antes do status: as páginas só montam com o status pronto (App.tsx) e já têm de ver o progresso
      o.troca(e);
      mudaStatus("ok");
    } catch {
      // site estático sem o servidor local: aí sim usa o navegador (+ backup manual)
      carregado = true;
      o.troca(carregaLocal());
      mudaStatus("sem-servidor");
    }
  }

  // ------------------------------------------------------- nuvem (site público)

  /** id da conta cuja nuvem está carregada (null = sem login: só o navegador) */
  let usuario: string | null = null;
  /** já conseguimos ler a nuvem desta conta? Antes disso NADA sobe (senão um estado vazio apagaria o da nuvem) */
  let nuvemLida = false;
  /** conta as alterações, para saber se o que acabou de subir ainda é o estado atual */
  let versao = 0;
  /**
   * versão da linha na nuvem que este navegador viu por último (null = ainda não existe linha). Cada gravação só vale
   * se a nuvem ainda estiver nela (src/nuvem.ts → gravaProgresso); se outro aparelho gravou no meio, relê e mescla.
   */
  let versaoRemota: number | null = null;
  /**
   * quando este progresso foi formatado pela última vez (ms; 0 = nunca; null = não sabemos, ex.: a nuvem não respondeu
   * e não havia cópia neste navegador). Vai junto para a nuvem como `formatadoEm` — ver combina().
   */
  let formatadoEm: number | null = null;
  let gravacaoCopia: number | undefined;
  let novaTentativa: number | undefined;
  /** um envio/leitura de cada vez: o atraso de 0,8 s, a aba escondida, o logout e a volta da internet podem pedir juntos */
  let fila: Promise<void> = Promise.resolve();
  const chaveCopia = `${o.chave}:nuvem`;

  function leCopia(): CopiaDeTrabalho | null {
    try {
      const bruto = localStorage.getItem(chaveCopia);
      return bruto ? (JSON.parse(bruto) as CopiaDeTrabalho) : null;
    } catch {
      return null;
    }
  }

  function gravaCopia(pendente: boolean) {
    if (!usuario) return;
    try {
      const copia: CopiaDeTrabalho = { uid: usuario, pendente, estado: o.le(), ...(formatadoEm === null ? {} : { formatadoEm }) };
      localStorage.setItem(chaveCopia, JSON.stringify(copia));
    } catch (err) {
      console.error("não foi possível guardar a cópia de trabalho no navegador", err);
    }
  }

  /** Estado guardado (nuvem ou cópia) → estado da store + a marca de formatação que viajou junto. */
  function separa(bruto: unknown): { estado: E; f: number } {
    const { formatadoEm: f, ...resto } = (bruto && typeof bruto === "object" ? bruto : {}) as { formatadoEm?: unknown };
    return { estado: o.normaliza(resto as Partial<E>), f: typeof f === "number" ? f : 0 };
  }

  /** O que sobe para a nuvem: o estado + a marca de formatação. */
  const paraNuvem = () => ({ ...o.le(), formatadoEm: formatadoEm ?? 0 });

  /**
   * Junta duas versões do progresso da MESMA conta (a da nuvem e a deste navegador). Em geral é a mescla do
   * "restaurar backup": item a item vence o alterado por último e o que foi apagado continua apagado. A exceção é
   * formatar: a mescla traria tudo de volta, então se um lado foi formatado depois do outro, ele vence inteiro.
   * `fb` null = não sabemos de quando é a marca do lado b: mescla (nunca joga fora o que não sabemos se foi formatado).
   */
  function combina(a: E, fa: number, b: E, fb: number | null): { estado: E; f: number } {
    const f = fb ?? fa;
    if (fa > f) return { estado: a, f: fa };
    if (f > fa) return { estado: b, f };
    return { estado: o.mescla(a, b), f: fa };
  }

  /** Junta ao estado vindo da nuvem o que ainda não tinha subido e o que foi feito sem login neste navegador. */
  function juntaPendentes(r: nuvem.Remoto | null, uid: string): { estado: E; f: number; mudou: boolean } {
    let { estado, f } = r ? separa(r.estado) : { estado: o.vazio(), f: 0 };
    let mudou = false;
    const copia = leCopia();
    if (copia?.uid === uid && copia.pendente) {
      const c = separa(copia.estado);
      ({ estado, f } = combina(estado, f, c.estado, typeof copia.formatadoEm === "number" ? copia.formatadoEm : null));
      mudou = true;
    }
    // o "sem login" é outra história (não tem marca de formatação): sempre mescla
    const semLogin = carregaLocal();
    if (semLogin.salvoEm > 0) {
      estado = o.mescla(estado, semLogin);
      mudou = true;
    }
    return { estado, f, mudou };
  }

  /** Traz para a memória o que está na nuvem; com alterações daqui que ainda não subiram, combina as duas. */
  function aplicaRemoto(r: nuvem.Remoto | null, comPendentes: boolean) {
    const rem = r ? separa(r.estado) : { estado: o.vazio(), f: 0 };
    versaoRemota = r?.versao ?? null;
    const c = comPendentes ? combina(rem.estado, rem.f, o.le(), formatadoEm) : { estado: rem.estado, f: rem.f };
    formatadoEm = c.f;
    o.troca(c.estado);
  }

  /** Põe na fila um envio (ou leitura): nunca dois ao mesmo tempo, para a versão vista não se embaralhar. */
  function naFila(f: () => Promise<void>): Promise<void> {
    fila = fila.then(f, f);
    return fila;
  }

  const enviaNuvem = () => naFila(enviaUmaVez);

  async function enviaUmaVez() {
    if (!usuario || !carregado || !sujo) return;
    const uid = usuario;
    window.clearTimeout(novaTentativa);
    sujo = false;
    mudaStatus("salvando");
    try {
      if (!nuvemLida) {
        // a nuvem não respondeu na abertura: lê agora e junta com o que foi feito aqui antes de gravar qualquer coisa
        const r = await nuvem.leProgresso(o.parte);
        if (usuario !== uid) return;
        aplicaRemoto(r, true);
        const semLogin = carregaLocal();
        if (semLogin.salvoEm > 0) o.troca(o.mescla(o.le(), semLogin));
        nuvemLida = true;
        apagaLocal();
      }
      for (let tentativa = 0; ; tentativa++) {
        const v = versao;
        const nova = await nuvem.gravaProgresso(o.parte, paraNuvem(), versaoRemota);
        if (usuario !== uid) return;
        if (nova !== null) {
          versaoRemota = nova;
          if (v === versao) gravaCopia(false);
          break;
        }
        // outro aparelho gravou depois da última vez que olhamos: relê, junta com o daqui e tenta de novo
        if (tentativa >= 4) throw new Error("a nuvem mudou várias vezes seguidas");
        const r = await nuvem.leProgresso(o.parte);
        if (usuario !== uid) return;
        aplicaRemoto(r, true);
        gravaCopia(true);
      }
      mudaStatus(sujo ? "salvando" : "ok");
    } catch (e) {
      if (usuario !== uid) return;
      console.error("não foi possível salvar na nuvem", e);
      sujo = true;
      mudaStatus("erro");
      // a nuvem pode ter caído ou a internet sumido: tenta de novo daqui a pouco, sem depender de outra alteração
      window.clearTimeout(novaTentativa);
      novaTentativa = window.setTimeout(() => void enviaNuvem(), 15_000);
    }
  }

  /**
   * A aba voltou a aparecer: se outro aparelho gravou enquanto ela estava escondida, traz o que ele fez (sem isso,
   * o celular aberto desde ontem mostraria o progresso de ontem até a próxima gravação).
   */
  function atualizaDaNuvem() {
    return naFila(async () => {
      if (!usuario || !nuvemLida) return;
      const uid = usuario;
      try {
        const r = await nuvem.leProgresso(o.parte);
        if (usuario !== uid || (r?.versao ?? null) === versaoRemota) return;
        const pendente = sujo;
        aplicaRemoto(r, pendente);
        gravaCopia(pendente);
        if (pendente) void enviaNuvem();
      } catch {
        /* sem rede: fica com o que tem; o próximo envio confere a versão de qualquer jeito */
      }
    });
  }

  /** Entrou na conta (ao abrir o site já logado, ou agora pelo link/código): carrega a nuvem e mescla o deste navegador. */
  async function entraNaNuvem(c: nuvem.Conta) {
    // o que estava pendente no navegador sem login vai junto
    if (usuario === null && carregado) {
      window.clearTimeout(gravacaoLocal);
      if (sujo) gravaLocal();
    }
    usuario = c.id;
    nuvemLida = false;
    versaoRemota = null;
    formatadoEm = null;
    if (carregado) mudaStatus("salvando");
    try {
      const r = await nuvem.leProgresso(o.parte);
      if (usuario !== c.id) return;
      const j = juntaPendentes(r, c.id);
      nuvemLida = true;
      versaoRemota = r?.versao ?? null;
      formatadoEm = j.f;
      apagaLocal(); // o que era "sem login" agora pertence à conta
      carregado = true;
      o.troca(j.estado);
      gravaCopia(j.mudou);
      if (j.mudou) {
        sujo = true;
        await enviaNuvem();
      } else {
        sujo = false;
        mudaStatus("ok");
      }
    } catch (e) {
      if (usuario !== c.id) return;
      // nuvem fora do ar (ou sessão que não deu para renovar): trabalha com a cópia deste navegador; nada sobe até a
      // nuvem ser lida (ver enviaUmaVez)
      console.error("não foi possível ler o progresso da nuvem", e);
      const copia = leCopia();
      const minha = copia?.uid === c.id ? copia : null;
      carregado = true;
      o.troca(minha ? separa(minha.estado).estado : o.vazio());
      formatadoEm = typeof minha?.formatadoEm === "number" ? minha.formatadoEm : null;
      sujo = !!minha?.pendente;
      mudaStatus("erro");
      novaTentativa = window.setTimeout(() => {
        sujo = true;
        void enviaNuvem();
      }, 15_000);
    }
  }

  /**
   * Saiu da conta (pelo botão, ou a sessão foi recusada de vez): o progresso dela sai deste navegador. A exceção é o
   * que ainda não chegou à nuvem (sem rede): fica guardado aqui, preso a esta conta, e é mesclado quando ela entrar de
   * novo neste navegador (juntaPendentes) — sair nunca perde nada em silêncio.
   */
  function saiDaNuvem() {
    window.clearTimeout(gravacaoDisco);
    window.clearTimeout(gravacaoCopia);
    window.clearTimeout(novaTentativa);
    if (sujo) gravaCopia(true);
    if (!leCopia()?.pendente) {
      try {
        localStorage.removeItem(chaveCopia);
      } catch {
        /* ignora */
      }
    }
    usuario = null;
    nuvemLida = false;
    versaoRemota = null;
    formatadoEm = null;
    sujo = false;
    apagaLocal();
    o.troca(o.vazio());
    mudaStatus("sem-servidor");
  }

  async function iniciaPublico() {
    nuvem.aoTrocarConta((nova, antes) => {
      if (nova && nova.id !== usuario) void entraNaNuvem(nova);
      else if (!nova && antes) saiDaNuvem();
    });
    nuvem.antesDoLogout(async () => {
      if (!usuario) return true;
      window.clearTimeout(gravacaoDisco);
      await enviaNuvem();
      return !sujo;
    });
    // a aba voltou: traz o que outro aparelho fez; a internet voltou: sobe já o que ficou pendente
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void atualizaDaNuvem();
    });
    window.addEventListener("online", () => {
      if (usuario && sujo) void enviaNuvem();
    });
    const c = await nuvem.contaInicial();
    if (c) return entraNaNuvem(c);
    carregado = true;
    o.troca(carregaLocal());
    mudaStatus("sem-servidor");
  }

  // ------------------------------------------------------------- interface

  /** Chamar depois de cada alteração do estado. */
  function grava() {
    sujo = true;
    if (usuario) {
      versao++;
      window.clearTimeout(gravacaoCopia);
      gravacaoCopia = window.setTimeout(() => gravaCopia(true), 150);
      window.clearTimeout(gravacaoDisco);
      gravacaoDisco = window.setTimeout(() => void enviaNuvem(), 800);
      return;
    }
    if (statusDisco === "sem-servidor") {
      window.clearTimeout(gravacaoLocal);
      gravacaoLocal = window.setTimeout(gravaLocal, 150);
      return;
    }
    window.clearTimeout(gravacaoDisco);
    gravacaoDisco = window.setTimeout(() => void enviaDisco(), 800);
  }

  /**
   * grava já o que está pendente (sem esperar o atraso de 0,8 s) — para quando a aba some.
   * `fechando`: a página está sendo fechada (beforeunload); senão ela só foi escondida (trocou de aba, bloqueou o celular).
   */
  function gravaAgora(fechando: boolean) {
    if (!carregado || !sujo) return;
    if (usuario) {
      // a cópia do navegador fica "pendente" até a nuvem confirmar
      window.clearTimeout(gravacaoCopia);
      gravaCopia(true);
      if (!nuvemLida) return;
      if (fechando) {
        // keepalive: o navegador termina o envio mesmo com a página fechada (até 64 KB; acima, fica a cópia pendente)
        nuvem.gravaProgressoJa(o.parte, JSON.stringify(paraNuvem()), versaoRemota);
      } else {
        // aba escondida: a página ainda vive alguns segundos, o envio normal (sem limite de tamanho) costuma terminar
        window.clearTimeout(gravacaoDisco);
        void enviaNuvem();
      }
      return;
    }
    if (statusDisco === "sem-servidor") gravaLocal();
    else {
      window.clearTimeout(gravacaoDisco);
      sujo = false;
      try {
        navigator.sendBeacon(o.api, new Blob([JSON.stringify(o.le())], { type: "application/json" }));
      } catch {
        sujo = true;
      }
    }
  }

  /** Depois de formatar: tira a cópia do navegador e grava o estado zerado já. */
  function formatou() {
    apagaLocal();
    window.clearTimeout(gravacaoDisco);
    if (usuario) {
      // marca de formatação: numa mescla com outro aparelho, o estado zerado vence (senão a mescla traria tudo de volta)
      formatadoEm = Date.now();
      void enviaNuvem();
    } else void enviaDisco();
  }

  function inicia() {
    window.addEventListener("beforeunload", () => gravaAgora(true));
    // trocar de aba, minimizar ou bloquear o celular: o beforeunload nem sempre chega a disparar depois disso
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") gravaAgora(false);
    });
    void (MODO_PUBLICO ? iniciaPublico() : iniciaDisco());
  }

  return { inicia, grava, formatou, useStatus };
}
