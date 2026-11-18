import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { marcaVocab, mudaConfig, mudaPinyinSempre, useConfig, useEstado, zeraVocab } from "../armazenamento";
import { VELOCIDADES } from "../componentes/OuvirSintetico";
import { carregaVocabulario } from "../dados";
import { falaNavegador, obtemTts, temVozChinesaNoNavegador, urlTts } from "../tts";
import type { MarcaVocab, PalavraVocab } from "../tipos";

type FiltroNivel = 0 | 1 | 2 | 3;
type Situacao = "todas" | "pendentes" | "erradas" | "certas";

/** palavra + o que a busca usa, calculado uma vez só */
interface Item {
  p: PalavraVocab;
  /** "汉字|pinyin": a chave das marcações no progresso */
  chave: string;
  pyBusca: string;
  ptBusca: string;
}

/** minúsculas, sem tons nem acentos (ǎ → a, ç → c, ü → u) */
const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** pinyin para comparar: sem tons, espaços, apóstrofos, hífens e reticências; "v" vale como "ü" */
const pinyinBusca = (s: string) => semAcento(s).replace(/v/g, "u").replace(/[^a-z]/g, "");

const SITUACOES: [Situacao, string][] = [
  ["todas", "todas"],
  ["pendentes", "não marcadas"],
  ["erradas", "só as que errei"],
  ["certas", "só as que acertei"],
];

/** Revisão do vocabulário do HSK 1 a 3: cartões com pinyin e significado tampados, acertei/errei e voz sintética. */
export function PaginaVocabulario() {
  const cfg = useConfig();
  const vocab = useEstado((e) => e.vocab);
  const nivel: FiltroNivel = cfg.vocabNivel === 1 || cfg.vocabNivel === 2 || cfg.vocabNivel === 3 ? cfg.vocabNivel : 0;
  const [palavras, setPalavras] = useState<PalavraVocab[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  /** índices em `palavras` depois de embaralhar (null = ordem da lista) */
  const [ordem, setOrdem] = useState<number[] | null>(null);
  /** cartões com pinyin e significado à mostra */
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const [confirmaZerar, setConfirmaZerar] = useState(false);
  const campoBusca = useRef<HTMLInputElement>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const voz = useVoz();

  useEffect(() => {
    carregaVocabulario()
      .then(setPalavras)
      .catch((e) => setErro(String(e)));
  }, []);

  const itens = useMemo<Item[]>(
    () => (palavras ?? []).map((p) => ({ p, chave: `${p.hz}|${p.py}`, pyBusca: pinyinBusca(p.py), ptBusca: semAcento(p.pt) })),
    [palavras],
  );

  /** caracteres que aparecem na lista com mais de uma leitura (还 hái/huán…): a voz sintética lê os dois igual */
  const variasLeituras = useMemo(() => {
    const leituras = new Map<string, Set<string>>();
    for (const { p } of itens) leituras.set(p.hz, (leituras.get(p.hz) ?? new Set()).add(p.py));
    return new Set([...leituras].filter(([, l]) => l.size > 1).map(([hz]) => hz));
  }, [itens]);

  const porNivel = useMemo(() => {
    const n = [itens.length, 0, 0, 0];
    for (const { p } of itens) n[p.nivel]++;
    return n;
  }, [itens]);

  const placar = useMemo(() => {
    let certas = 0;
    let erradas = 0;
    let total = 0;
    for (const { p, chave } of itens) {
      if (nivel && p.nivel !== nivel) continue;
      total++;
      const m = vocab.marcas[chave];
      if (m === "k") certas++;
      else if (m === "x") erradas++;
    }
    return { total, certas, erradas, faltam: total - certas - erradas };
  }, [itens, nivel, vocab.marcas]);

  const visiveis = useMemo(() => {
    const q = busca.trim();
    const qPy = pinyinBusca(q);
    const qPt = semAcento(q);
    return (ordem ?? itens.map((_, i) => i))
      .map((i) => itens[i])
      .filter(({ p, chave, pyBusca, ptBusca }) => {
        if (nivel && p.nivel !== nivel) return false;
        const m = vocab.marcas[chave];
        if (situacao === "pendentes" && m) return false;
        if (situacao === "erradas" && m !== "x") return false;
        if (situacao === "certas" && m !== "k") return false;
        if (!q) return true;
        return p.hz.includes(q) || (!!qPy && pyBusca.includes(qPy)) || (!!qPt && ptBusca.includes(qPt));
      });
  }, [itens, ordem, nivel, situacao, busca, vocab.marcas]);

  const alterna = useCallback((chave: string) => {
    setAbertos((s) => {
      const novo = new Set(s);
      if (!novo.delete(chave)) novo.add(chave);
      return novo;
    });
  }, []);

  const embaralha = () => {
    const o = itens.map((_, i) => i);
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    setOrdem(o);
    setAbertos(new Set());
    window.scrollTo(0, 0);
  };
  const tampaTudo = () => setAbertos(new Set());
  const alternaPinyin = () => mudaPinyinSempre(!vocab.pinyinSempre);

  const nMarcas = Object.keys(vocab.marcas).length;
  const zera = () => {
    if (!nMarcas) return;
    if (!confirmaZerar) return setConfirmaZerar(true);
    zeraVocab();
    setConfirmaZerar(false);
  };
  useEffect(() => {
    if (!confirmaZerar) return;
    const t = window.setTimeout(() => setConfirmaZerar(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirmaZerar]);

  // atalhos (fora dos campos de texto): / buscar · P pinyin · T tampar tudo · E embaralhar
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable) {
        if (e.key === "Escape" && alvo === campoBusca.current) {
          setBusca("");
          alvo.blur();
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "/") {
        e.preventDefault();
        campoBusca.current?.focus();
      } else if (k === "p") alternaPinyin();
      else if (k === "t") tampaTudo();
      else if (k === "e") embaralha();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });

  // o placar gruda logo abaixo do cabeçalho do app, que muda de altura quando quebra linha (celular)
  useLayoutEffect(() => {
    const topo = document.querySelector<HTMLElement>(".topo");
    const el = raiz.current;
    if (!topo || !el) return;
    const ajusta = () => el.style.setProperty("--altura-topo", `${topo.offsetHeight}px`);
    ajusta();
    const ro = new ResizeObserver(ajusta);
    ro.observe(topo);
    return () => ro.disconnect();
  }, [palavras]);

  if (erro) return <div className="erro">Não consegui carregar o vocabulário: {erro}</div>;
  if (!palavras) return <div className="carregando">carregando…</div>;

  const pct = (n: number) => (placar.total ? `${(n / placar.total) * 100}%` : "0%");

  return (
    <div className="vocabulario" ref={raiz}>
      <h1>Vocabulário</h1>
      <p className="vocab-intro">
        As palavras do HSK 1 ao 3 (formato 2.0) — no HSK 2 e no HSK 3, só as novas de cada nível. Toque no caractere para ouvir, no olho para ver
        pinyin e significado, e marque se acertou.
      </p>

      <div className="vocab-niveis" role="group" aria-label="nível">
        {([0, 1, 2, 3] as const).map((nv) => (
          <button key={nv} className={nivel === nv ? "pri" : "sec"} aria-pressed={nivel === nv} onClick={() => mudaConfig({ vocabNivel: nv })}>
            {nv === 0 ? "HSK 1–3" : `só HSK ${nv}`} <small>({porNivel[nv]})</small>
          </button>
        ))}
      </div>

      <div className="vocab-filtros">
        <input
          ref={campoBusca}
          type="search"
          className="entrada"
          placeholder="buscar: caractere, pinyin ou significado"
          aria-label="buscar palavra"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <select className="entrada" aria-label="situação" value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)}>
          {SITUACOES.map(([v, rotulo]) => (
            <option key={v} value={v}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>

      <div className="vocab-acoes">
        <button className="sec" onClick={embaralha}>
          🔀 embaralhar
        </button>
        <button className="sec" onClick={() => setOrdem(null)} disabled={!ordem} title="volta à ordem das listas (A–Z dentro de cada nível)">
          ordem A–Z
        </button>
        <button className={`sec${vocab.pinyinSempre ? " on" : ""}`} aria-pressed={vocab.pinyinSempre} onClick={alternaPinyin}>
          pinyin sempre visível{vocab.pinyinSempre ? " ✓" : ""}
        </button>
        <button className="sec" onClick={tampaTudo} disabled={!abertos.size} title="esconde de novo o pinyin e o significado de todos os cartões">
          tampar tudo
        </button>
        <button
          className={confirmaZerar ? "perigo" : "sec"}
          onClick={zera}
          disabled={!nMarcas}
          title="apaga todas as marcações de acertei/errei (de todos os níveis)"
        >
          {confirmaZerar ? `clique de novo para zerar ${nMarcas === 1 ? "1 marcação" : `${nMarcas} marcações`}` : "zerar marcações"}
        </button>
        <label className="vocab-velocidade" title="velocidade da voz sintética">
          🔊
          <select className="entrada" value={cfg.velocidadeVoz ?? 1} onChange={(e) => mudaConfig({ velocidadeVoz: Number(e.target.value) })}>
            {VELOCIDADES.map((v) => (
              <option key={v} value={v}>
                {String(v).replace(".", ",")}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="vocab-placar">
        <p>
          <b>{placar.total}</b> palavras · <b className="aprovado">{placar.certas}</b> certas · <b className="reprovado">{placar.erradas}</b> erradas ·{" "}
          {placar.faltam} faltam
          {visiveis.length !== placar.total && <span className="vocab-mostrando"> · mostrando {visiveis.length}</span>}
        </p>
        <div
          className="vocab-progresso"
          role="img"
          aria-label={`${placar.certas} certas e ${placar.erradas} erradas de ${placar.total}`}
        >
          <i className="certas" style={{ width: pct(placar.certas) }} />
          <i className="erradas" style={{ width: pct(placar.erradas) }} />
        </div>
      </div>

      <div className="vocab-grade">
        {visiveis.length === 0 ? (
          <p className="vocab-vazio">Nenhuma palavra com esses filtros.</p>
        ) : (
          visiveis.map(({ p, chave }) => (
            <CartaoPalavra
              key={chave}
              p={p}
              chave={chave}
              marca={vocab.marcas[chave]}
              aberto={abertos.has(chave)}
              pinyinSempre={vocab.pinyinSempre}
              tocando={voz.tocando === chave}
              variasLeituras={variasLeituras.has(p.hz)}
              onAlterna={alterna}
              onFala={voz.fala}
            />
          ))
        )}
      </div>

      <p className="atalhos vocab-atalhos">
        atalhos: <kbd>/</kbd> buscar · <kbd>P</kbd> pinyin sempre visível · <kbd>T</kbd> tampar tudo · <kbd>E</kbd> embaralhar
      </p>

      {voz.aviso && (
        <div className="vocab-aviso" role="status">
          <span>{voz.aviso}</span>
          <button className="link" onClick={voz.fechaAviso} aria-label="fechar aviso">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

interface PropsCartao {
  p: PalavraVocab;
  chave: string;
  marca?: MarcaVocab;
  aberto: boolean;
  pinyinSempre: boolean;
  tocando: boolean;
  variasLeituras: boolean;
  onAlterna: (chave: string) => void;
  onFala: (p: PalavraVocab, chave: string) => void;
}

const CartaoPalavra = memo(function CartaoPalavra({ p, chave, marca, aberto, pinyinSempre, tocando, variasLeituras, onAlterna, onFala }: PropsCartao) {
  const pyVisivel = aberto || pinyinSempre;
  const mostra = () => onAlterna(chave);
  return (
    <div className={`vocab-cartao${marca === "k" ? " certa" : marca === "x" ? " errada" : ""}`}>
      <div className="vocab-topo">
        {variasLeituras && (
          <span
            className="vocab-leituras zh"
            title="Este caractere aparece na lista com mais de uma leitura. A voz sintética lê o caractere sozinho sempre do mesmo jeito: confira o pinyin."
          >
            多音字
          </span>
        )}
        <span className="vocab-num">
          HSK {p.nivel} · {p.n}
        </span>
      </div>
      <button className={`vocab-hz zh${tocando ? " tocando" : ""}`} onClick={() => onFala(p, chave)} title="ouvir" aria-label={`ouvir ${p.hz}`}>
        {p.hz}
      </button>
      {pyVisivel ? (
        <div className="vocab-py">{p.py}</div>
      ) : (
        <div className="vocab-py tampado" onClick={mostra} title="mostrar o pinyin e o significado">
          ••••••
        </div>
      )}
      <div className="vocab-sig">
        <button
          className="vocab-olho"
          onClick={mostra}
          aria-pressed={aberto}
          title={aberto ? "esconder" : pinyinSempre ? "mostrar o significado" : "mostrar o pinyin e o significado"}
          aria-label={aberto ? "esconder" : "mostrar"}
        >
          {aberto ? <OlhoRiscado /> : <Olho />}
        </button>
        {aberto ? (
          <span className="vocab-pt">{p.pt}</span>
        ) : (
          <span className="vocab-pt tampado" onClick={mostra} title="mostrar">
            ••••• •••• ••••••
          </span>
        )}
      </div>
      <div className="vocab-marcas">
        <button className={`certa${marca === "k" ? " on" : ""}`} aria-pressed={marca === "k"} onClick={() => marcaVocab(chave, "k")}>
          ✓ acertei
        </button>
        <button className={`errada${marca === "x" ? " on" : ""}`} aria-pressed={marca === "x"} onClick={() => marcaVocab(chave, "x")}>
          ✗ errei
        </button>
      </div>
    </div>
  );
});

const Olho = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const OlhoRiscado = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 3l18 18" />
    <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);

/**
 * Voz do caractere clicado: a voz sintética do app (gerada uma vez e guardada em public/tts/), na velocidade
 * escolhida. Se falhar, usa a voz do navegador — só se ele tiver voz chinesa; senão, só avisa.
 */
function useVoz() {
  const velocidade = useConfig().velocidadeVoz ?? 1;
  const audio = useRef<HTMLAudioElement | null>(null);
  const cancela = useRef<() => void>(() => {});
  const sessao = useRef(0);
  const vel = useRef(velocidade);
  vel.current = velocidade;
  const [tocando, setTocando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    audio.current = new Audio();
    return () => {
      sessao.current++;
      cancela.current();
      audio.current?.pause();
    };
  }, []);

  // mudar a velocidade vale também para o que já está tocando
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = velocidade;
  }, [velocidade]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 8000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const fala = useCallback((p: PalavraVocab, chave: string) => {
    const minha = ++sessao.current;
    cancela.current();
    cancela.current = () => {};
    audio.current?.pause();
    const fim = () => {
      if (minha === sessao.current) setTocando(null);
    };
    setTocando(chave);
    obtemTts(p.hz)
      .then((t) => {
        if (minha !== sessao.current) return;
        const a = audio.current!;
        a.src = urlTts(t);
        a.defaultPlaybackRate = vel.current;
        a.playbackRate = vel.current;
        (a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
        a.onended = fim;
        a.onerror = () => {
          setAviso("Não consegui tocar o arquivo de voz. Clique de novo para tentar outra vez.");
          fim();
        };
        cancela.current = () => a.pause();
        a.play().catch((e) => {
          setAviso(`O navegador bloqueou o som (${String(e?.message ?? e).slice(0, 80)}). Clique de novo.`);
          fim();
        });
      })
      .catch((e) => {
        if (minha !== sessao.current) return;
        const motivo = String(e?.message ?? e).slice(0, 120);
        if (temVozChinesaNoNavegador()) {
          setAviso(`Voz sintética indisponível agora (${motivo}): usei a voz do navegador.`);
          cancela.current = falaNavegador(p.hz, fim, vel.current);
        } else {
          setAviso(`Sem voz: a voz sintética não respondeu (${motivo}) e o navegador não tem voz chinesa instalada.`);
          fim();
        }
      });
  }, []);

  return { fala, tocando, aviso, fechaAviso: () => setAviso(null) };
}
