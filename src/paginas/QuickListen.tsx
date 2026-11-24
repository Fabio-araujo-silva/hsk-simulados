import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { ControleAudio, useTempo } from "../audio";
import { CONFIG_QUICK_PADRAO, leEstado, mudaConfig, mudaConfigQuick, salvaCartoes, salvaSessaoQuick, useConfig, useEstado } from "../armazenamento";
import { cartaoPalavra, idPalavra } from "../cartoes";
import { carregaIndice, carregaLexico, carregaProva, formataTempo, nomeParte, urlMidia } from "../dados";
import { DragaoAudio } from "../quick/Dragao";
import { diaDe, diasSeguidos, recentes, recorde } from "../quick/historico";
import {
  chama,
  confereDigitado,
  ITENS_POR_RODADA,
  LACUNAS_POR_ITEM,
  montaRodada,
  PONTOS_COMBO,
  PONTOS_PALAVRA,
  PONTOS_SEGUNDO,
  pontuaItem,
  SEGUNDOS_POR_ITEM,
  type ItemQuick,
  type NivelQuick,
  type PontosItem,
} from "../quick/sorteio";
import type { ConfigQuick, Lexico, SessaoQuick } from "../tipos";
import "../quick/quick.css";

// Quick Listen 🔥 (#/quick): rodadas de 5 áudios das provas reais. Cada áudio mostra o texto em hanzi com 3 lacunas
// para digitar (hanzi ou pinyin); dá para ouvir quantas vezes quiser e, com tempo, há 30 s para responder (contados do
// fim da 1ª escuta). Enquanto o áudio toca, um dragão chinês voa atrás da pérola no ritmo do trecho. No fim, a
// pontuação, o recorde e a revisão de cada áudio — com as palavras que escaparam indo para a revisão espaçada.

interface Rodada {
  id: string;
  nivel: NivelQuick;
  itens: ItemQuick[];
  /** um <audio> por arquivo de prova (dois itens da mesma prova dividem o mesmo) */
  audios: Map<string, ControleAudio>;
  /** opções da rodada, fixadas ao começar */
  cfg?: ConfigQuick;
}

interface ResultadoItem {
  item: ItemQuick;
  valores: string[];
  certas: boolean[];
  pontos: PontosItem;
  /** segundos do fim da 1ª escuta até conferir (null = conferiu antes de o áudio terminar) */
  segundos: number | null;
  repetiu: number;
  esgotou: boolean;
}

interface Fim {
  resultados: ResultadoItem[];
  sessao: SessaoQuick;
  recordeAntes: SessaoQuick | null;
}

const NOME_NIVEL: Record<NivelQuick, string> = { 0: "qualquer prova", 1: "HSK 1", 2: "HSK 2", 3: "HSK 3" };
const QUEM: Record<string, string> = { 男: "homem", 女: "mulher", 问: "pergunta", "★": "afirmação" };
const CIRCULOS = ["①", "②", "③", "④", "⑤", "⑥"];
const VELOCIDADES = [0.6, 0.75, 0.9, 1, 1.15];

const ehToque = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** botões tocados com o mouse não ficam com o foco: Espaço e Enter continuam sendo atalhos da página */
const semFoco = (e: React.MouseEvent) => e.preventDefault();

function destroiRodada(r: Rodada | null | undefined) {
  r?.audios.forEach((a) => a.destroi());
}

/** Deixa o áudio parado no começo do trecho: o navegador já baixa aquele pedaço antes do play. */
function adianta(a: ControleAudio | undefined, s: number) {
  if (!a) return;
  a.el.preload = "auto";
  const vai = () => {
    if (a.el.paused && Math.abs(a.el.currentTime - s) > 0.5) a.el.currentTime = s;
  };
  if (a.el.readyState >= HTMLMediaElement.HAVE_METADATA) vai();
  else a.el.addEventListener("loadedmetadata", vai, { once: true });
}

// =================================================================== página

export function PaginaQuick({ nivelRota }: { nivelRota?: number }) {
  const geral = useConfig();
  const cfg: ConfigQuick = { ...CONFIG_QUICK_PADRAO, ...geral.quick };
  const sessoesObj = useEstado((e) => e.quick.sessoes);
  const sessoes = useMemo(() => Object.values(sessoesObj), [sessoesObj]);
  const [fase, setFase] = useState<"inicio" | "jogo" | "fim">("inicio");
  const [pronta, setPronta] = useState<Rodada | null>(null);
  const [atual, setAtual] = useState<Rodada | null>(null);
  const [fim, setFim] = useState<Fim | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lexico, setLexico] = useState<Lexico | null>(null);
  const [tentativa, setTentativa] = useState(0);

  // #/quick/3: o atalho da página de um nível já chega com o nível escolhido
  useEffect(() => {
    if (nivelRota && [1, 2, 3].includes(nivelRota) && nivelRota !== cfg.nivel) mudaConfigQuick({ nivel: nivelRota as NivelQuick });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivelRota]);

  useEffect(() => {
    carregaLexico()
      .then(setLexico)
      .catch(() => {});
  }, []);

  // os <audio> das rodadas saem junto com a página
  const prontaRef = useRef(pronta);
  prontaRef.current = pronta;
  const atualRef = useRef(atual);
  atualRef.current = atual;
  useEffect(
    () => () => {
      destroiRodada(prontaRef.current);
      destroiRodada(atualRef.current);
    },
    [],
  );

  // a próxima rodada é sorteada antes do clique em "Começar": assim o toque que começa já libera o som (iPhone) e o
  // 1º áudio toca na hora
  const precisa = fase !== "jogo" && (!pronta || pronta.nivel !== cfg.nivel);
  useEffect(() => {
    if (!precisa) return;
    let vivo = true;
    setErro(null);
    (async () => {
      const [indice, lex] = await Promise.all([carregaIndice(), carregaLexico()]);
      const itens = await montaRodada({
        nivel: cfg.nivel,
        indice,
        carrega: carregaProva,
        lexico: lex,
        recentes: recentes(Object.values(leEstado().quick.sessoes)),
      });
      if (!vivo) return;
      const audios = new Map<string, ControleAudio>();
      for (const it of itens) {
        if (audios.has(it.src)) continue;
        const a = new ControleAudio(urlMidia(it.src));
        // só o 1º arquivo baixa já; os outros, quando chegar a vez (um arquivo de prova tem ~13 MB)
        a.el.preload = "metadata";
        audios.set(it.src, a);
      }
      adianta(audios.get(itens[0].src), itens[0].s);
      const nova: Rodada = { id: Date.now().toString(36), nivel: cfg.nivel, itens, audios };
      setPronta((velha) => {
        if (velha && velha !== nova) destroiRodada(velha);
        return nova;
      });
    })().catch((e) => {
      if (vivo) setErro(e instanceof Error ? e.message : String(e));
    });
    return () => {
      vivo = false;
    };
  }, [precisa, cfg.nivel, tentativa]);

  const prontaOk = !!pronta && pronta.nivel === cfg.nivel;

  const comeca = () => {
    if (!pronta || !prontaOk) return;
    destroiRodada(atual);
    setAtual({ ...pronta, cfg: { ...cfg } });
    setPronta(null);
    setFim(null);
    setFase("jogo");
  };

  const termina = (resultados: ResultadoItem[]) => {
    const c = atual?.cfg ?? cfg;
    const agora = Date.now();
    const sessao: SessaoQuick = {
      id: `ql-${agora.toString(36)}`,
      em: agora,
      atualizado: agora,
      nivel: c.nivel,
      tempo: c.tempo,
      pontos: soma(resultados.map((r) => r.pontos.pontos)),
      certas: soma(resultados.map((r) => r.pontos.certas)),
      total: soma(resultados.map((r) => r.pontos.total)),
      itens: resultados.map((r) => ({ prova: r.item.prova, n: r.item.n, certas: r.pontos.certas, total: r.pontos.total })),
    };
    const recordeAntes = recorde(Object.values(leEstado().quick.sessoes), c);
    salvaSessaoQuick(sessao);
    setFim({ resultados, sessao, recordeAntes });
    setFase("fim");
    window.scrollTo(0, 0);
  };

  const voltaAoInicio = () => {
    destroiRodada(atual);
    setAtual(null);
    setFim(null);
    setFase("inicio");
  };

  if (fase === "jogo" && atual?.cfg) {
    return <Jogo rodada={atual} cfg={atual.cfg} velocidade={geral.velocidade} onFim={termina} onSai={voltaAoInicio} />;
  }
  if (fase === "fim" && fim && atual) {
    return (
      <FimRodada
        fim={fim}
        rodada={atual}
        sessoes={sessoes}
        lexico={lexico}
        prontaOk={prontaOk}
        erro={erro}
        velocidade={geral.velocidade}
        onDeNovo={comeca}
        onOpcoes={voltaAoInicio}
      />
    );
  }
  return (
    <InicioQuick
      cfg={cfg}
      sessoes={sessoes}
      prontaOk={prontaOk}
      erro={erro}
      onComeca={comeca}
      onTentaDeNovo={() => {
        setPronta(null);
        setTentativa((t) => t + 1);
      }}
    />
  );
}

// =================================================================== tela inicial

function Escolha<T extends string | number | boolean>({
  rotulo,
  valor,
  opcoes,
  onMuda,
}: {
  rotulo: string;
  valor: T;
  opcoes: { v: T; nome: ReactNode; dica?: string }[];
  onMuda: (v: T) => void;
}) {
  return (
    <div className="ql-escolha">
      <span className="ql-escolha-rotulo">{rotulo}</span>
      <div className="ql-seg" role="radiogroup" aria-label={rotulo}>
        {opcoes.map((o) => (
          <button key={String(o.v)} role="radio" aria-checked={o.v === valor} className={o.v === valor ? "on" : ""} title={o.dica} onClick={() => onMuda(o.v)}>
            {o.nome}
          </button>
        ))}
      </div>
    </div>
  );
}

const dataCurta = (ms: number) => {
  const d = new Date(ms);
  const hoje = diaDe(Date.now()) === diaDe(ms);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return hoje ? `hoje ${hora}` : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
};

function InicioQuick({
  cfg,
  sessoes,
  prontaOk,
  erro,
  onComeca,
  onTentaDeNovo,
}: {
  cfg: ConfigQuick;
  sessoes: SessaoQuick[];
  prontaOk: boolean;
  erro: string | null;
  onComeca: () => void;
  onTentaDeNovo: () => void;
}) {
  const seq = diasSeguidos(sessoes);
  const rec = recorde(sessoes, cfg);
  const ultimas = [...sessoes].sort((a, b) => b.em - a.em).slice(0, 8);
  const hoje = sessoes.filter((s) => diaDe(s.em) === diaDe(Date.now())).length;

  const comecaRef = useRef(onComeca);
  comecaRef.current = onComeca;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Enter" && tag !== "BUTTON" && tag !== "A" && tag !== "INPUT" && tag !== "SELECT") {
        e.preventDefault();
        comecaRef.current();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  return (
    <div className="ql-inicio">
      <header className="ql-cabeca">
        <h1>
          Quick Listen <span className="ql-fogo">🔥</span>
        </h1>
        <p>
          Um áudio de prova real por vez, com o texto em hanzi embaixo e <b>3 palavras faltando</b>. Ouça quantas vezes precisar e digite as
          palavras (hanzi ou pinyin). São <b>{ITENS_POR_RODADA} áudios</b> por rodada, com a pontuação no fim.
        </p>
      </header>

      <div className="ql-stats">
        <div className={seq.dias > 0 ? "ql-stat fogo" : "ql-stat"}>
          <b>{seq.dias > 0 ? `🔥 ${seq.dias}` : "0"}</b>
          <small>{seq.dias === 1 ? "dia seguido" : "dias seguidos"}</small>
          {seq.dias > 0 && !seq.hoje && <small className="ql-alerta">jogue hoje para não perder</small>}
        </div>
        <div className="ql-stat">
          <b>{rec ? rec.pontos : "—"}</b>
          <small>recorde nestas opções</small>
        </div>
        <div className="ql-stat">
          <b>{hoje}</b>
          <small>{hoje === 1 ? "rodada hoje" : "rodadas hoje"}</small>
        </div>
      </div>

      <div className="ql-opcoes">
        <Escolha<NivelQuick>
          rotulo="Provas"
          valor={cfg.nivel}
          onMuda={(v) => mudaConfigQuick({ nivel: v })}
          opcoes={[
            { v: 0, nome: "Qualquer uma", dica: "sorteia entre todas as provas do HSK 1, 2 e 3" },
            { v: 1, nome: "HSK 1" },
            { v: 2, nome: "HSK 2" },
            { v: 3, nome: "HSK 3" },
          ]}
        />
        <Escolha<boolean>
          rotulo="Tempo"
          valor={cfg.tempo}
          onMuda={(v) => mudaConfigQuick({ tempo: v })}
          opcoes={[
            { v: true, nome: `⏱ ${SEGUNDOS_POR_ITEM} s por áudio`, dica: "o relógio começa quando o áudio termina de tocar pela 1ª vez" },
            { v: false, nome: "Sem tempo" },
          ]}
        />
      </div>

      {erro ? (
        <div className="aviso">
          Não consegui preparar a rodada: {erro}{" "}
          <button className="sec" onClick={onTentaDeNovo}>
            tentar de novo
          </button>
        </div>
      ) : (
        <button className="pri grande ql-comecar" disabled={!prontaOk} onClick={onComeca}>
          {prontaOk ? (
            <>
              Começar 🔥 <kbd>Enter</kbd>
            </>
          ) : (
            "preparando os áudios…"
          )}
        </button>
      )}

      <ul className="ql-regras">
        <li>
          {cfg.tempo ? (
            <>
              O relógio de {SEGUNDOS_POR_ITEM} s começa quando o áudio termina de tocar pela 1ª vez. Ouvir de novo não tira ponto — só gasta
              tempo.
            </>
          ) : (
            <>Sem relógio: ouça e responda no seu ritmo (a rodada não ganha bônus de tempo).</>
          )}
        </li>
        <li>
          {PONTOS_PALAVRA} pontos por palavra certa.
          {cfg.tempo && <> Acertou as {LACUNAS_POR_ITEM}: +{PONTOS_SEGUNDO} por segundo que sobrou.</>} Áudios perfeitos seguidos fazem combo 🔥
          (+{PONTOS_COMBO}, +{PONTOS_COMBO * 2}…).
        </li>
        <li>
          Digite o hanzi ou o pinyin (sem tom vale; <code>ni3</code> também). <kbd>Enter</kbd> passa para a próxima lacuna e, na última,
          confere · <kbd>Esc</kbd> ouve de novo · clicar numa palavra do texto toca dali.
        </li>
      </ul>

      {ultimas.length > 0 && (
        <section className="ql-historico">
          <h2>Últimas rodadas</h2>
          <table>
            <tbody>
              {ultimas.map((s) => {
                const ch = chama(s.certas, s.total);
                return (
                  <tr key={s.id}>
                    <td className="ql-h-data">{dataCurta(s.em)}</td>
                    <td>{NOME_NIVEL[s.nivel]}</td>
                    <td className="ql-h-modo">{s.tempo ? `⏱ ${SEGUNDOS_POR_ITEM} s` : "sem tempo"}</td>
                    <td className="ql-h-certas">
                      {s.certas}/{s.total}
                    </td>
                    <td className="ql-h-pontos">
                      <b>{s.pontos}</b> <span title={ch.nome}>{ch.fogo}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

// =================================================================== rodada

function Jogo({
  rodada,
  cfg,
  velocidade,
  onFim,
  onSai,
}: {
  rodada: Rodada;
  cfg: ConfigQuick;
  velocidade: number;
  onFim: (r: ResultadoItem[]) => void;
  onSai: () => void;
}) {
  const [k, setK] = useState(0);
  const [resultados, setResultados] = useState<ResultadoItem[]>([]);
  const n = rodada.itens.length;
  const item = rodada.itens[k];
  const audio = rodada.audios.get(item.src) ?? null;
  const comboAntes = k > 0 ? resultados[k - 1]?.pontos.comboDepois ?? 0 : 0;
  const feito = resultados[k];
  const combo = feito ? feito.pontos.comboDepois : comboAntes;
  const placar = soma(resultados.map((r) => r.pontos.pontos));

  useEffect(() => {
    rodada.audios.forEach((a) => a.velocidade(velocidade));
  }, [rodada, velocidade]);

  // enquanto responde um, o arquivo do próximo (se for de outra prova) já vai baixando
  useEffect(() => {
    const prox = rodada.itens[k + 1];
    if (prox && prox.src !== item.src) adianta(rodada.audios.get(prox.src), prox.s);
  }, [rodada, k, item.src]);

  const avanca = () => {
    if (!resultados[k]) return;
    if (k + 1 < n) {
      setK(k + 1);
      window.scrollTo(0, 0);
    } else onFim(resultados);
  };

  return (
    <div className="ql-jogo">
      <div className="ql-topo">
        <button className="link" onClick={onSai} title="sair da rodada (ela não conta)">
          ✕ sair
        </button>
        <div className="ql-passos" aria-label={`áudio ${k + 1} de ${n}`}>
          {rodada.itens.map((_, i) => {
            const r = resultados[i];
            const cls = r ? (r.pontos.certas === r.pontos.total ? "ok" : r.pontos.certas > 0 ? "meio" : "zero") : i === k ? "atual" : "";
            return <span key={i} className={`ql-passo ${cls}`} />;
          })}
          <span className="ql-contagem">
            {k + 1}/{n}
          </span>
        </div>
        <span className={`ql-combo ${combo >= 2 ? "on" : ""}`} title="áudios perfeitos seguidos">
          🔥×{combo}
        </span>
        <span className="ql-placar">
          <b>{placar}</b> pts
        </span>
      </div>
      <ItemJogo
        key={`${rodada.id}-${k}`}
        item={item}
        audio={audio}
        cfg={cfg}
        velocidade={velocidade}
        comboAntes={comboAntes}
        ultimo={k + 1 === n}
        onConfere={(r) =>
          setResultados((rs) => {
            const c = rs.slice();
            c[k] = r;
            return c;
          })
        }
        onProximo={avanca}
      />
    </div>
  );
}

function ItemJogo({
  item,
  audio,
  cfg,
  velocidade,
  comboAntes,
  ultimo,
  onConfere,
  onProximo,
}: {
  item: ItemQuick;
  audio: ControleAudio | null;
  cfg: ConfigQuick;
  velocidade: number;
  comboAntes: number;
  ultimo: boolean;
  onConfere: (r: ResultadoItem) => void;
  onProximo: () => void;
}) {
  const [valores, setValores] = useState<string[]>(() => item.lacunas.map(() => ""));
  /** fim da 1ª escuta (ms): o relógio conta daí */
  const [inicio, setInicio] = useState<number | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [res, setRes] = useState<ResultadoItem | null>(null);
  const [repetiu, setRepetiu] = useState(0);
  const [pinyin, setPinyin] = useState(false);
  const { tempo, tocando } = useTempo(audio);
  const tocou = useRef(false);
  const entradas = useRef<(HTMLInputElement | null)[]>([]);

  const meuTocando = tocando && tempo >= item.s - 0.3 && tempo <= item.e + 0.3;

  // o áudio toca sozinho ao abrir
  useEffect(() => {
    if (!audio) {
      setInicio(Date.now());
      return;
    }
    void audio.toca(item.s, item.e);
    return () => audio.pausa();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  // o relógio começa quando a 1ª escuta termina (ou é pausada)
  useEffect(() => {
    if (meuTocando) tocou.current = true;
    else if (tocou.current && inicio === null && !res) setInicio(Date.now());
  }, [meuTocando, inicio, res]);

  // no computador o cursor já começa na 1ª lacuna (no celular não: o teclado cobriria o texto antes de ouvir)
  useEffect(() => {
    if (!ehToque()) entradas.current[0]?.focus({ preventScroll: true });
  }, []);

  const correndo = cfg.tempo && inicio !== null && !res;
  useEffect(() => {
    if (!correndo) return;
    const t = window.setInterval(() => setAgora(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [correndo]);
  const restante = cfg.tempo ? (inicio === null ? SEGUNDOS_POR_ITEM : Math.min(SEGUNDOS_POR_ITEM, Math.max(0, SEGUNDOS_POR_ITEM - (agora - inicio) / 1000))) : null;

  /** mexeu na resposta sem o áudio ter tocado (som bloqueado, arquivo que não carregou): o relógio começa já */
  const mexeu = () => {
    if (inicio === null && !tocou.current && !meuTocando) setInicio(Date.now());
  };

  const confere = (esgotou = false) => {
    if (res) return;
    const certas = item.lacunas.map((l, i) => confereDigitado(valores[i], l));
    const nCertas = certas.filter(Boolean).length;
    const gastos = inicio === null ? null : (Date.now() - inicio) / 1000;
    const r: ResultadoItem = {
      item,
      valores,
      certas,
      pontos: pontuaItem(nCertas, item.lacunas.length, esgotou ? 0 : restante, comboAntes),
      segundos: gastos === null ? null : cfg.tempo ? Math.min(SEGUNDOS_POR_ITEM, gastos) : gastos,
      repetiu,
      esgotou,
    };
    setRes(r);
    onConfere(r);
    // sai da caixa de texto: Espaço e Enter voltam a ser atalhos (ouvir, próximo)
    (document.activeElement as HTMLElement | null)?.blur?.();
  };

  useEffect(() => {
    if (correndo && restante !== null && restante <= 0) confere(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [correndo, restante]);

  const ouveDeNovo = () => {
    if (!audio) return;
    if (meuTocando) {
      audio.pausa();
      return;
    }
    setRepetiu((x) => x + 1);
    void audio.toca(item.s, item.e);
  };

  // ------------------------------------------------ digitar
  const digita = (i: number, v: string) => {
    if (res) return;
    mexeu();
    const novos = valores.slice();
    novos[i] = v;
    setValores(novos);
  };
  const enterNaLacuna = (i: number) => {
    if (res) return onProximo();
    const prox = valores.findIndex((v, j) => j > i && !v.trim());
    if (prox >= 0) entradas.current[prox]?.focus();
    else confere();
  };

  // ------------------------------------------------ teclado
  const teclas = useRef<(e: KeyboardEvent) => void>();
  teclas.current = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    const emCampo = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    const emBotao = tag === "BUTTON" || tag === "A";
    if (e.key === "Escape") {
      e.preventDefault();
      ouveDeNovo();
      return;
    }
    if (emCampo) return;
    if (e.key === " " && !emBotao) {
      e.preventDefault();
      ouveDeNovo();
    } else if (e.key === "Enter" && !emBotao) {
      e.preventDefault();
      if (res) onProximo();
      else confere();
    } else if (!res && e.key.length === 1 && /\S/.test(e.key)) {
      // começou a digitar fora da caixa (clicou no texto, no player…): a letra vai para a 1ª lacuna vazia
      const i = valores.findIndex((v) => !v.trim());
      const alvo = entradas.current[i >= 0 ? i : 0];
      if (alvo) alvo.focus({ preventScroll: true });
    }
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => teclas.current?.(e);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const perfeito = !!res && res.pontos.certas === res.pontos.total;

  return (
    <div className={`ql-item ${res ? (perfeito ? "perfeito" : "conferido") : ""}`}>
      <Relogio ligado={cfg.tempo} restante={restante ?? 0} comecou={inicio !== null} parado={!!res} />
      <PlayerQuick item={item} audio={audio} velocidade={velocidade} onOuvir={ouveDeNovo} />

      <TextoQuick
        item={item}
        audio={audio}
        valores={valores}
        certas={res?.certas ?? null}
        pinyin={pinyin}
        digitar={{ entradas, onDigita: digita, onEnter: enterNaLacuna }}
      />

      {!res ? (
        <div className="ql-acoes">
          <button className="pri grande" onMouseDown={semFoco} onClick={() => confere()}>
            Conferir <kbd>Enter</kbd>
          </button>
          {repetiu > 0 && (
            <span className="ql-repetiu">
              ouviu {repetiu + 1}×
            </span>
          )}
        </div>
      ) : (
        <div className={`ql-retorno ${perfeito ? "perfeito" : ""}`} role="status">
          <div className="ql-ganho">
            <b>+{res.pontos.pontos}</b>
            <span>
              {res.pontos.certas}/{res.pontos.total} {res.pontos.total === 1 ? "palavra" : "palavras"}
              {res.pontos.tempo > 0 && ` · +${res.pontos.tempo} de tempo`}
              {res.pontos.combo > 0 && ` · +${res.pontos.combo} de combo 🔥`}
              {res.esgotou && " · o tempo acabou"}
            </span>
          </div>
          <label className="ql-check">
            <input
              type="checkbox"
              checked={pinyin}
              onChange={(e) => {
                setPinyin(e.target.checked);
                e.currentTarget.blur();
              }}
            />{" "}
            pinyin
          </label>
          <button className="pri grande" onMouseDown={semFoco} onClick={onProximo}>
            {ultimo ? "Ver resultado" : "Próximo"} <kbd>Enter</kbd>
          </button>
        </div>
      )}
      {res && <Origem item={item} />}
    </div>
  );
}

function Origem({ item, link }: { item: ItemQuick; link?: boolean }) {
  return (
    <div className="ql-origem">
      HSK {item.nivel} · {item.prova} · questão {item.n} · {nomeParte(item.nivel, `L${item.parte}`)}
      {link && (
        <>
          {" · "}
          <a href={`#/estudo/${item.prova}/${item.n}`} target="_blank" rel="noopener">
            abrir no modo estudo ↗
          </a>
        </>
      )}
    </div>
  );
}

function Relogio({ ligado, restante, comecou, parado }: { ligado: boolean; restante: number; comecou: boolean; parado: boolean }) {
  if (!ligado) return <div className="ql-relogio livre">sem tempo · responda com calma</div>;
  const s = Math.ceil(restante);
  const cls = !comecou ? "espera" : parado ? "parado" : s <= 5 ? "acabando" : s <= 10 ? "pouco" : "";
  return (
    <div className={`ql-relogio ${cls}`} role="timer" aria-live="off">
      <div className="ql-relogio-barra">
        <div style={{ width: `${(restante / SEGUNDOS_POR_ITEM) * 100}%` }} />
      </div>
      <span className="ql-relogio-num">{comecou ? `${s} s` : `${SEGUNDOS_POR_ITEM} s · começa quando o áudio terminar`}</span>
    </div>
  );
}

function PlayerQuick({ item, audio, velocidade, onOuvir }: { item: ItemQuick; audio: ControleAudio | null; velocidade: number; onOuvir: () => void }) {
  const { tempo, tocando } = useTempo(audio);
  if (!audio) return <div className="aviso">Este áudio não carregou — responda pelo texto.</div>;
  const dura = Math.max(0.1, item.e - item.s);
  const dentro = tempo >= item.s - 0.3 && tempo <= item.e + 0.3;
  const meu = tocando && dentro;
  const prog = dentro ? Math.min(1, Math.max(0, (tempo - item.s) / dura)) : 0;
  return (
    <div className={`ql-player ${meu ? "tocando" : ""}`}>
      <DragaoAudio audio={audio} s={item.s} e={item.e} onSalta={(t) => void audio.toca(t, item.e)} />
      <div className="ql-player-controles">
        <button
          className="btn-play grande"
          onMouseDown={semFoco}
          onClick={onOuvir}
          title={meu ? "pausar" : "ouvir de novo (Esc)"}
          aria-label={meu ? "pausar" : "ouvir de novo"}
        >
          {meu ? "❚❚" : "▶"}
        </button>
        <div className="player-meio">
          <div className="ql-player-linha">
            <span>
              {meu ? "tocando…" : "ouvir de novo"} <kbd>Esc</kbd>
            </span>
            <select
              value={velocidade}
              title="velocidade"
              onChange={(e) => {
                mudaConfig({ velocidade: Number(e.target.value) });
                e.currentTarget.blur();
              }}
            >
              {VELOCIDADES.map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </div>
          <div
            className="barra"
            onMouseDown={semFoco}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              void audio.toca(item.s + ((e.clientX - r.left) / r.width) * dura, item.e);
            }}
          >
            <div className="barra-cheia" style={{ width: `${prog * 100}%` }} />
          </div>
        </div>
        <span className="player-tempo">
          {formataTempo(dentro ? tempo - item.s : 0)} / {formataTempo(dura)}
        </span>
      </div>
    </div>
  );
}

// =================================================================== o texto com as lacunas

interface Digitar {
  entradas: MutableRefObject<(HTMLInputElement | null)[]>;
  onDigita: (i: number, v: string) => void;
  onEnter: (i: number) => void;
}

/**
 * O texto do áudio, fala por fala, com as lacunas. Antes de conferir: uma caixa de texto em cada lacuna e a palavra
 * falada acesa (karaokê — a lacuna pisca quando é a vez dela). Depois: cada lacuna com a resposta, o pinyin e a
 * tradução de cada fala. Clicar numa palavra toca o áudio dali; numa lacuna conferida, só a palavra.
 */
function TextoQuick({
  item,
  audio,
  valores,
  certas,
  pinyin,
  digitar,
}: {
  item: ItemQuick;
  audio: ControleAudio | null;
  valores: string[];
  /** null = ainda respondendo */
  certas: boolean[] | null;
  pinyin: boolean;
  /** caixas de texto das lacunas (só enquanto responde) */
  digitar?: Digitar;
}) {
  const { tempo, tocando } = useTempo(audio);
  const noTrecho = tempo >= item.s - 0.3 && tempo <= item.e + 0.3;
  const soa = (t?: [number, number] | null) => !!t && tocando && noTrecho && tempo >= t[0] && tempo < t[1] + 0.05;
  const tocaDe = (t?: [number, number] | null) => {
    if (t && audio) void audio.toca(t[0], item.e);
  };
  const tocaPalavra = (t?: [number, number] | null) => {
    if (t && audio) void audio.toca(Math.max(0, t[0] - 0.2), t[1] + 0.3);
  };

  return (
    <div className={`ql-texto zh ${certas ? "conferido" : ""} ${pinyin ? "com-pinyin" : ""}`}>
      {item.falas.map((fa, fi) => (
        <div className="ql-fala" key={fi}>
          {fa.fal && (
            <span className={`ql-quem q-${fa.fal === "男" ? "h" : fa.fal === "女" ? "m" : "x"}`} title={QUEM[fa.fal] ?? ""}>
              {fa.fal}
            </span>
          )}
          <div className="ql-fala-corpo">
            <span className="ql-frase">
              {fa.f.tk.map((w, ti) => {
                const li = item.lacunas.findIndex((l) => l.fala === fi && l.tk === ti);
                const t = fa.f.a?.[ti] ?? null;
                if (li < 0) {
                  const py = fa.f.py[ti];
                  return (
                    <span key={ti} className={`tk ${t ? "clicavel" : ""} ${soa(t) ? "ativo" : ""}`} onClick={() => tocaDe(t)}>
                      {pinyin && py ? (
                        <ruby>
                          {w}
                          <rt>{py}</rt>
                        </ruby>
                      ) : (
                        w
                      )}
                    </span>
                  );
                }
                const l = item.lacunas[li];
                if (certas || !digitar) {
                  const ok = !!certas?.[li];
                  return (
                    <span
                      key={ti}
                      className={`ql-lacuna resolvida ${ok ? "certa" : "errada"} ${soa(t) ? "soando" : ""}`}
                      onClick={() => tocaPalavra(t)}
                      title="ouvir só esta palavra"
                    >
                      {!ok && <s className="ql-sua">{valores[li]?.trim() || "—"}</s>}
                      <ruby className="ql-palavra">
                        {l.palavra}
                        <rt>{l.py}</rt>
                      </ruby>
                    </span>
                  );
                }
                return (
                  <input
                    key={ti}
                    ref={(el) => {
                      digitar.entradas.current[li] = el;
                    }}
                    className={`ql-lacuna ql-entrada ${valores[li]?.trim() ? "cheia" : ""} ${soa(t) ? "soando" : ""}`}
                    style={{ width: `${Math.max(4.2, l.palavra.length * 2.2 + 0.8)}em` }}
                    value={valores[li]}
                    placeholder={CIRCULOS[li]}
                    aria-label={`lacuna ${li + 1} (hanzi ou pinyin)`}
                    lang="zh"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint={li === item.lacunas.length - 1 ? "done" : "next"}
                    onChange={(e) => digitar.onDigita(li, e.target.value)}
                    onKeyDown={(e) => {
                      // Enter da escolha do caractere no teclado chinês (IME) não conta
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                        e.preventDefault();
                        digitar.onEnter(li);
                      }
                    }}
                  />
                );
              })}
            </span>
            {certas && fa.f.pt && <div className="ql-pt">{fa.f.pt}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// =================================================================== fim da rodada

/** O número sobe até o valor (sem animação para quem pediu menos movimento). */
function Contador({ valor }: { valor: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(valor);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setV(Math.round(valor * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{v}</>;
}

function FimRodada({
  fim,
  rodada,
  sessoes,
  lexico,
  prontaOk,
  erro,
  velocidade,
  onDeNovo,
  onOpcoes,
}: {
  fim: Fim;
  rodada: Rodada;
  sessoes: SessaoQuick[];
  lexico: Lexico | null;
  prontaOk: boolean;
  erro: string | null;
  velocidade: number;
  onDeNovo: () => void;
  onOpcoes: () => void;
}) {
  const { resultados, sessao, recordeAntes } = fim;
  const ch = chama(sessao.certas, sessao.total);
  const novoRecorde = sessao.pontos > 0 && (!recordeAntes || sessao.pontos > recordeAntes.pontos);
  const seq = diasSeguidos(sessoes);
  const tempos = resultados.map((r) => r.segundos).filter((x): x is number => x !== null);
  const media = tempos.length ? soma(tempos) / tempos.length : null;
  const ouviu = soma(resultados.map((r) => r.repetiu + 1));
  const cartoes = useEstado((e) => e.cartoes);
  const [pinyin, setPinyin] = useState(false);
  const [enviadas, setEnviadas] = useState<number | null>(null);

  useEffect(() => {
    rodada.audios.forEach((a) => a.velocidade(velocidade));
  }, [rodada, velocidade]);

  // palavras que escaparam (uma vez cada), com a frase onde apareceram
  const erradas = useMemo(() => {
    const vistas = new Set<string>();
    const out: { w: string; py: string; r: ResultadoItem; fala: number }[] = [];
    for (const r of resultados)
      r.item.lacunas.forEach((l, i) => {
        if (r.certas[i] || vistas.has(l.palavra)) return;
        vistas.add(l.palavra);
        out.push({ w: l.palavra, py: l.py, r, fala: l.fala });
      });
    return out;
  }, [resultados]);
  const faltam = erradas.filter((x) => !cartoes[idPalavra(x.w)]);

  const manda = () => {
    const novos = faltam.map((x) => cartaoPalavra(x.w, { prova: x.r.item.prova, n: x.r.item.n }, lexico, x.r.item.falas[x.fala].f, x.r.item.prova));
    salvaCartoes(novos);
    setEnviadas(novos.length);
  };

  const deNovoRef = useRef(onDeNovo);
  deNovoRef.current = onDeNovo;
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Enter" && tag !== "BUTTON" && tag !== "A" && tag !== "INPUT" && tag !== "SELECT") {
        e.preventDefault();
        deNovoRef.current();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  return (
    <div className="ql-fim">
      <section className={`ql-fim-topo ${sessao.certas === sessao.total ? "perfeito" : ""}`}>
        <div className="ql-fogo-grande" aria-hidden>
          {ch.fogo}
        </div>
        <div className="ql-chama">{ch.nome}</div>
        <div className="ql-pontos-grande">
          <Contador valor={sessao.pontos} /> <small>pts</small>
        </div>
        {novoRecorde ? (
          <div className="ql-recorde">🏆 Novo recorde{recordeAntes ? ` — o anterior era ${recordeAntes.pontos}` : ""}</div>
        ) : (
          recordeAntes && <div className="ql-recorde-antes">recorde nestas opções: {recordeAntes.pontos}</div>
        )}
        <div className="ql-resumo">
          <span>
            <b>
              {sessao.certas}/{sessao.total}
            </b>{" "}
            palavras
          </span>
          <span>
            <b>{soma(resultados.map((r) => r.pontos.palavras))}</b> das palavras
          </span>
          {rodada.cfg?.tempo && (
            <span>
              <b>+{soma(resultados.map((r) => r.pontos.tempo))}</b> de tempo
            </span>
          )}
          <span>
            <b>+{soma(resultados.map((r) => r.pontos.combo))}</b> de combo 🔥
          </span>
          {media !== null && (
            <span>
              <b>{Math.round(media)} s</b> por áudio
            </span>
          )}
          <span>
            ouviu <b>{ouviu}×</b>
          </span>
          {seq.dias > 0 && (
            <span>
              <b>🔥 {seq.dias}</b> {seq.dias === 1 ? "dia seguido" : "dias seguidos"}
            </span>
          )}
        </div>
        <div className="ql-fim-acoes">
          <button className="pri grande" disabled={!prontaOk} onClick={onDeNovo}>
            {prontaOk ? (
              <>
                Jogar de novo 🔥 <kbd>Enter</kbd>
              </>
            ) : erro ? (
              "não consegui sortear outra rodada"
            ) : (
              "sorteando outra rodada…"
            )}
          </button>
          <button className="sec" onClick={onOpcoes}>
            Mudar as opções
          </button>
        </div>
        <div className="ql-fim-opcoes">
          {NOME_NIVEL[sessao.nivel]} · {sessao.tempo ? `${SEGUNDOS_POR_ITEM} s por áudio` : "sem tempo"}
        </div>
      </section>

      {erradas.length > 0 && (
        <section className="ql-erradas">
          <h2>Palavras que escaparam</h2>
          <div className="ql-erradas-lista">
            {erradas.map((x) => {
              const v = lexico?.[x.w];
              const ja = !!cartoes[idPalavra(x.w)];
              return (
                <span key={x.w} className={`ql-errada ${ja ? "ja" : ""}`} title={ja ? "já está nos seus cartões" : undefined}>
                  <span className="zh">{x.w}</span> <span className="ql-errada-py">{x.py}</span>
                  {(v?.pt ?? v?.en) && <span className="ql-errada-pt">{v?.pt ?? v?.en}</span>}
                </span>
              );
            })}
          </div>
          {enviadas !== null ? (
            <p className="ql-enviadas">
              ✓ {enviadas} {enviadas === 1 ? "cartão criado" : "cartões criados"} — estão na <a href="#/revisao">Revisão</a>, com a frase e o
              áudio da prova.
            </p>
          ) : faltam.length > 0 ? (
            <button className="sec" onClick={manda} disabled={!lexico}>
              Mandar {faltam.length === 1 ? "esta palavra" : `as ${faltam.length} palavras`} para a revisão espaçada
            </button>
          ) : (
            <p className="ql-enviadas">Todas já estão nos seus cartões de revisão.</p>
          )}
        </section>
      )}

      <section className="ql-revisao">
        <div className="ql-revisao-topo">
          <h2>Os {resultados.length} áudios</h2>
          <label className="ql-check">
            <input type="checkbox" checked={pinyin} onChange={(e) => setPinyin(e.target.checked)} /> pinyin
          </label>
        </div>
        {resultados.map((r, i) => (
          <ItemRevisao key={i} r={r} i={i} audio={rodada.audios.get(r.item.src) ?? null} pinyin={pinyin} />
        ))}
      </section>
    </div>
  );
}

function ItemRevisao({ r, i, audio, pinyin }: { r: ResultadoItem; i: number; audio: ControleAudio | null; pinyin: boolean }) {
  const { tempo, tocando } = useTempo(audio);
  const meu = tocando && tempo >= r.item.s - 0.3 && tempo <= r.item.e + 0.3;
  const perfeito = r.pontos.certas === r.pontos.total;
  return (
    <article className={`ql-rev-item ${perfeito ? "perfeito" : r.pontos.certas ? "meio" : "zero"}`}>
      <header>
        <button
          className="btn-play"
          onClick={() => (meu ? audio?.pausa() : void audio?.toca(r.item.s, r.item.e))}
          disabled={!audio}
          aria-label={meu ? "pausar" : `ouvir o áudio ${i + 1}`}
        >
          {meu ? "❚❚" : "▶"}
        </button>
        <span className="ql-rev-n">{i + 1}</span>
        <span className="ql-rev-placar">
          {r.pontos.certas}/{r.pontos.total} · <b>+{r.pontos.pontos}</b>
          {r.esgotou && " · tempo esgotado"}
        </span>
      </header>
      <TextoQuick item={r.item} audio={audio} valores={r.valores} certas={r.certas} pinyin={pinyin} />
      <Origem item={r.item} link />
    </article>
  );
}
