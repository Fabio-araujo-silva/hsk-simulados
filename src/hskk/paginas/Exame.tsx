import { useEffect, useRef, useState } from "react";
import { useTempo } from "../../audio";
import { useControleAudio } from "../audio";
import { adicionaGravacao, arquivaTentativa, mudaTentativa, novaTentativa, useConfig, useEstado } from "../armazenamento";
import { AvisoMicrofone, Medidor } from "../componentes/Gravador";
import { Frase, ProvedorLeitura } from "../../componentes/Leitura";
import { carregaProva, ehFalar, formataTempo, urlPublica } from "../dados";
import { nomeGravacao, salvaGravacao } from "../gravacoes";
import { Gravacao, pedeMicrofone, useMicrofone } from "../microfone";
import type { Prova, QuestaoFalar, Tentativa } from "../tipos";

// Modo prova: o áudio ORIGINAL corre do começo ao fim, como no dia (instruções, frases, 嘀, os 10 min de preparação
// e os 2 min de cada resposta). O app grava sua voz em cada janela de resposta, sem texto, pinyin nem tradução.

type TipoFase = "abertura" | "aquecimento" | "instrucao1" | "p1" | "transicao" | "preparo" | "p23" | "fim";
interface Fase {
  tipo: TipoFase;
  n?: number;
  /** a janela de resposta está aberta (grava) */
  fala: boolean;
  /** fim da etapa atual (s no áudio), para o relógio */
  ate?: number;
  /** de onde retomar se a aba fechar */
  retomar: number;
}

function faseEm(p: Prova, t: number): Fase {
  const q1 = p.questoes[0];
  if (t < (p.aquecimento[0]?.s ?? q1.t.p) - 0.3) return { tipo: "abertura", fala: false, retomar: 0 };
  const ultAq = p.aquecimento[p.aquecimento.length - 1];
  if (ultAq && t < ultAq.re) return { tipo: "aquecimento", fala: false, retomar: 0 };
  if (t < q1.t.p) return { tipo: "instrucao1", fala: false, retomar: 0 };
  for (const q of p.questoes) {
    if (q.parte !== 1) continue;
    if (t >= q.t.p && t < q.t.re) return { tipo: "p1", n: q.n, fala: t >= q.t.rs, ate: t >= q.t.rs ? q.t.re : q.t.rs, retomar: q.t.p };
  }
  const prep = p.preparo;
  const q11 = p.questoes.find((q) => q.n === 11)!;
  if (prep && t < prep.s) return { tipo: "transicao", fala: false, ate: prep.s, retomar: prep.s - 12 };
  if (prep && t < prep.e) return { tipo: "preparo", fala: false, ate: prep.e, retomar: prep.s };
  for (const q of p.questoes) {
    if (q.parte === 1) continue;
    if (t >= q.t.p - 0.2 && t < q.t.re) return { tipo: "p23", n: q.n, fala: t >= q.t.rs, ate: t >= q.t.rs ? q.t.re : q.t.rs, retomar: q.t.p };
  }
  if (t < q11.t.p) return { tipo: "preparo", fala: false, ate: q11.t.p, retomar: prep?.s ?? q11.t.p };
  return { tipo: "fim", fala: false, retomar: 0 };
}

const chaveFase = (f: Fase) => `${f.tipo}:${f.n ?? ""}`;

export function PaginaExame({ id }: { id: string }) {
  const [prova, setProva] = useState<Prova | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentId, setTentId] = useState<string | null>(null);
  const emAndamento = useEstado((e) => Object.values(e.tentativas).find((t) => t.prova === id && t.modo === "prova" && !t.fim && !t.arquivada));

  useEffect(() => {
    carregaProva(id).then(setProva).catch((e) => setErro(String(e)));
  }, [id]);

  if (erro) return <div className="erro">Não consegui carregar a prova {id}: {erro}</div>;
  if (!prova) return <div className="carregando">carregando…</div>;
  if (!prova.audio || !prova.preparo) return <div className="erro">Esta prova está sem áudio ou sem os tempos — rode scripts/tempos.py e scripts/monta.py.</div>;
  if (tentId) return <ProvaRodando prova={prova} tentId={tentId} />;
  return <Preparativos prova={prova} emAndamento={emAndamento} onComeca={setTentId} />;
}

function Preparativos({ prova, emAndamento, onComeca }: { prova: Prova; emAndamento?: Tentativa; onComeca: (id: string) => void }) {
  const mic = useMicrofone();
  const semMic = mic.estado === "negado" || mic.estado === "indisponivel";
  const total = prova.audio ? Math.round(prova.audio.duracao / 60) : 23;

  const comeca = (semMicrofone: boolean, continuar?: Tentativa) => {
    if (continuar) {
      if (semMicrofone && !continuar.semMicrofone) mudaTentativa(continuar.id, (t) => ({ ...t, semMicrofone: true }));
      onComeca(continuar.id);
      return;
    }
    if (emAndamento) arquivaTentativa(emAndamento.id);
    const t = novaTentativa(prova.id, "prova");
    if (semMicrofone) mudaTentativa(t.id, (x) => ({ ...x, semMicrofone: true }));
    onComeca(t.id);
  };

  const qRetomar = emAndamento?.retomar ? faseEm(prova, emAndamento.retomar + 0.5) : null;
  return (
    <div className="exame-inicio">
      <h1>
        {prova.id} · modo prova <span className="zh">HSK口语（中级）</span>
      </h1>
      <ol className="regras">
        <li>
          O <b>áudio original</b> toca do começo ao fim, sem pausa (~{total} min): abertura com perguntas de aquecimento, as 10 frases para repetir,{" "}
          <b>10 min de preparação</b> e as 4 respostas de <b>2 min</b> cada.
        </li>
        <li>
          Sua voz é gravada automaticamente em cada janela de resposta (o microfone liga e desliga sozinho). As gravações ficam em{" "}
          <code>progresso/gravacoes/</code>, no seu computador.
        </li>
        <li>
          Nada de texto, pinyin ou tradução das frases — no exame você só ouve uma vez. As figuras e as perguntas aparecem como no caderno (as
          perguntas 13–14 vêm com pinyin impresso).
        </li>
        <li>Na preparação dá para anotar (no exame real você escreve no caderno). No fim você ouve cada gravação ao lado do original.</li>
        <li>Use fone de ouvido: assim o microfone não grava o áudio da prova junto com a sua voz.</li>
      </ol>
      <AvisoMicrofone />
      {mic.estado === "pronto" && (
        <div className="teste-mic">
          Fale alguma coisa: a barra tem que se mexer → <Medidor ativo />
        </div>
      )}
      <div className="acoes">
        {emAndamento && qRetomar && (
          <button className="pri" onClick={async () => comeca(!(await pedeMicrofone()), emAndamento)}>
            Continuar de onde parei ({qRetomar.n ? `questão ${qRetomar.n}` : qRetomar.tipo === "preparo" ? "preparação" : "começo"})
          </button>
        )}
        <button
          className={emAndamento ? "sec" : "pri"}
          disabled={mic.estado === "pedindo"}
          onClick={async () => {
            const s = await pedeMicrofone();
            if (s) comeca(false);
          }}
        >
          {emAndamento ? "Recomeçar do zero" : "Começar a prova"}
        </button>
        {semMic && (
          <button className="sec" onClick={() => comeca(true)}>
            fazer sem gravar
          </button>
        )}
        <a className="link" href={`#/estudo/${prova.id}`}>
          voltar ao estudo
        </a>
      </div>
    </div>
  );
}

function ProvaRodando({ prova, tentId }: { prova: Prova; tentId: string }) {
  const cfg = useConfig();
  const tent = useEstado((e) => e.tentativas[tentId]);
  const audio = useControleAudio(urlPublica(prova.audio!.src));
  const { tempo, tocando } = useTempo(audio);
  const [pausado, setPausado] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const rec = useRef<{ n: number; g: Gravacao } | null>(null);
  // ao retomar, as janelas que já tinham terminado não são gravadas de novo (a gravação antiga fica)
  const feitas = useRef(new Set<number>(prova.questoes.filter((q) => q.t.re <= (tent?.retomar ?? 0) + 0.5).map((q) => q.n)));
  const salvando = useRef<Promise<void>[]>([]);
  const ultimaFase = useRef("");
  const [gravandoN, setGravandoN] = useState<number | null>(null);
  const [notas, setNotas] = useState(tent?.notas?.[0] ?? "");
  const notasRef = useRef(notas);
  notasRef.current = notas;

  const fase = faseEm(prova, tempo);

  // começa (ou retoma) o áudio
  useEffect(() => {
    if (!audio) return;
    audio.velocidade(1);
    void audio.toca(tent?.retomar ?? 0, null);
    // só em desenvolvimento: permite testes automáticos pularem no áudio
    if (import.meta.env.DEV) (window as unknown as { __audioProva?: HTMLAudioElement }).__audioProva = audio.el;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio]);

  const salva = (r: { n: number; g: Gravacao }) => {
    const p = (async () => {
      const { blob, dur } = await r.g.para();
      if (!blob.size) return;
      const arquivo = nomeGravacao(tentId, r.n, r.g.ext);
      const { soNaSessao } = await salvaGravacao(arquivo, blob);
      adicionaGravacao(tentId, r.n, { arquivo, dur, em: Date.now(), ...(soNaSessao ? { soNaSessao } : {}) }, true);
    })();
    salvando.current.push(p);
  };

  const termina = async () => {
    if (terminando) return;
    setTerminando(true);
    audio?.pausa();
    if (rec.current) {
      salva(rec.current);
      rec.current = null;
    }
    await Promise.allSettled(salvando.current);
    mudaTentativa(tentId, (t) => ({ ...t, fim: Date.now(), notas: { ...(t.notas ?? {}), 0: notasRef.current } }));
    window.location.hash = `/resultado/${tentId}`;
  };

  // liga/desliga a gravação conforme a janela de resposta do áudio
  useEffect(() => {
    if (terminando) return;
    const k = chaveFase(fase);
    // (só depois que o áudio começou a tocar: antes disso o tempo ainda é 0 e apagaria o ponto de retomada)
    if (k !== ultimaFase.current && tocando) {
      ultimaFase.current = k;
      if (fase.tipo !== "fim") mudaTentativa(tentId, (t) => ({ ...t, retomar: fase.retomar }));
    }
    const r = rec.current;
    if (r && (!fase.fala || fase.n !== r.n)) {
      salva(r);
      rec.current = null;
      setGravandoN(null);
    }
    // (com menos de 1 s de janela não vale a pena começar: só sobraria um pedaço vazio)
    if (fase.fala && fase.n && !rec.current && !feitas.current.has(fase.n) && !tent?.semMicrofone && (fase.ate ?? 0) - tempo > 1) {
      feitas.current.add(fase.n);
      const n = fase.n;
      void pedeMicrofone().then((s) => {
        if (!s || rec.current) return;
        try {
          rec.current = { n, g: new Gravacao(s) };
          setGravandoN(n);
        } catch (e) {
          console.error(e);
        }
      });
    }
    if ((prova.fim && tempo >= prova.fim) || (audio && !tocando && !pausado && audio.duracao > 0 && tempo >= audio.duracao - 0.3)) void termina();
  });

  // segurança: grava as anotações de vez em quando
  useEffect(() => {
    const id = window.setInterval(() => {
      if (notasRef.current !== (tent?.notas?.[0] ?? "")) mudaTentativa(tentId, (t) => ({ ...t, notas: { ...(t.notas ?? {}), 0: notasRef.current } }));
    }, 5000);
    return () => window.clearInterval(id);
  }, [tentId, tent?.notas]);

  const pausa = () => {
    if (!audio) return;
    if (pausado) {
      void audio.continua();
      rec.current?.g.continua();
      setPausado(false);
    } else {
      audio.pausa();
      rec.current?.g.pausa();
      setPausado(true);
    }
  };

  const sair = () => {
    if (!confirm("Sair da prova? Ela fica em andamento: dá para continuar depois da última questão começada.")) return;
    audio?.pausa();
    if (rec.current) {
      salva(rec.current);
      rec.current = null;
    }
    window.location.hash = "/";
  };

  const total = prova.audio!.duracao;
  const resta = fase.ate !== undefined ? fase.ate - tempo : null;
  const rotulo: Record<TipoFase, string> = {
    abertura: "Abertura",
    aquecimento: "Aquecimento (não vale nota)",
    instrucao1: "第一部分 · instruções",
    p1: `第一部分 听后重复 · ${fase.n}/10`,
    transicao: "Instruções da preparação",
    preparo: "Preparação (10 min)",
    p23: `${fase.n && fase.n <= 12 ? "第二部分 看图说话" : "第三部分 回答问题"} · questão ${fase.n}`,
    fim: "Fim",
  };
  const falar = prova.questoes.filter(ehFalar) as QuestaoFalar[];
  const mostraCaderno = fase.tipo === "transicao" || fase.tipo === "preparo" || fase.tipo === "p23" || fase.tipo === "fim";

  return (
    <ProvedorLeitura lexico={null} traducao={false} pinyin={false} audio={null}>
      <div className="exame">
        <div className="exame-topo">
          <b>{prova.id}</b>
          <span className="tocando">{rotulo[fase.tipo]}</span>
          {resta !== null && resta > 0 && (
            <span className={`relogio ${fase.fala && resta < 10 ? "urgente" : ""}`} title={fase.fala ? "tempo para responder" : "até a próxima etapa"}>
              {formataTempo(resta)}
            </span>
          )}
          {gravandoN !== null && (
            <span className="rec">
              ● REC <Medidor ativo />
            </span>
          )}
          {tent?.semMicrofone && <span className="falta">sem gravar</span>}
          <span className="contagem">
            {formataTempo(tempo)} / {formataTempo(total)}
          </span>
          {cfg.pausarProva && (
            <button className="sec" onClick={pausa}>
              {pausado ? "▶ continuar" : "❚❚ pausar"}
            </button>
          )}
          <button className="link" onClick={sair}>
            sair
          </button>
        </div>

        {fase.tipo === "abertura" && <div className="exame-fase">Música de abertura… a prova já vai começar.</div>}
        {fase.tipo === "aquecimento" && (
          <div className="exame-fase">
            O áudio pergunta seu <b>nome</b>, sua <b>nacionalidade</b> e seu <b>número de inscrição</b> (序号). Responda em voz alta, em chinês — é só
            aquecimento, não vale nota.
          </div>
        )}
        {(fase.tipo === "instrucao1" || fase.tipo === "p1") && (
          <div className="exame-fase p1">
            <div className="zh titulo-parte">第一部分 · 第1–10题：听后重复</div>
            {fase.tipo === "p1" && (
              <div className={`janela ${fase.fala ? "falando" : ""}`}>
                <span className="numero">{fase.n}</span>
                {fase.fala ? <b>● fale agora — repita a frase</b> : <span>ouça…</span>}
                {fase.fala && fase.ate !== undefined && (
                  <div className="barra">
                    <div className="barra-cheia" style={{ width: `${Math.min(100, (100 * (tempo - (prova.questoes[fase.n! - 1].t.rs))) / (fase.ate - prova.questoes[fase.n! - 1].t.rs))}%` }} />
                  </div>
                )}
              </div>
            )}
            <div className="progresso-p1">
              {prova.questoes
                .filter((q) => q.parte === 1)
                .map((q) => (
                  <span key={q.n} className={`bolinha ${tent?.gravacoes[q.n]?.length ? "feita" : ""} ${fase.n === q.n ? "atual" : ""}`}>
                    {q.n}
                  </span>
                ))}
            </div>
          </div>
        )}
        {mostraCaderno && (
          <>
            {fase.tipo === "preparo" && (
              <div className="exame-fase">
                <b>Preparação:</b> prepare as questões 11–14 (figuras e perguntas abaixo). Pode anotar tópicos — não dá para ler um texto pronto, mas
                anotações curtas ajudam.{" "}
                <button className="link" onClick={() => void audio?.toca(prova.preparo!.e - 0.5, null)} title="não existe no exame real">
                  pular a preparação (não existe no exame real)
                </button>
              </div>
            )}
            {fase.tipo === "p23" && (
              <div className={`exame-fase janela ${fase.fala ? "falando" : ""}`}>
                <span className="numero">{fase.n}</span>
                {fase.fala ? <b>● fale agora — 2 minutos (fale até o fim do tempo)</b> : <span>ouça a instrução…</span>}
              </div>
            )}
            {fase.tipo === "fim" && <div className="exame-fase">考试现在结束 — salvando as gravações…</div>}
            <div className="caderno">
              <div className="caderno-parte">
                <div className="zh titulo-parte">第二部分 · 第11–12题：看图说话</div>
                <div className="caderno-figuras">
                  {falar
                    .filter((q) => q.parte === 2)
                    .map((q) => (
                      <figure key={q.n} className={fase.n === q.n ? "atual" : ""}>
                        <figcaption className="zh">{q.n}．（2 分钟）</figcaption>
                        {q.img && <img src={urlPublica(q.img)} alt={`figura ${q.n}`} />}
                      </figure>
                    ))}
                </div>
              </div>
              <div className="caderno-parte">
                <div className="zh titulo-parte">第三部分 · 第13–14题：回答问题</div>
                {falar
                  .filter((q) => q.parte === 3)
                  .map((q) => (
                    <div key={q.n} className={`caderno-pergunta ${fase.n === q.n ? "atual" : ""}`}>
                      <span className="zh">{q.n}．</span>
                      {q.pergunta && <Frase f={q.pergunta} inerte comPinyin />}
                      <span className="zh">（2 分钟）</span>
                    </div>
                  ))}
              </div>
              <label className="notas-prova">
                <span>anotações</span>
                <textarea className="zh" rows={5} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="tópicos para as questões 11–14" />
              </label>
            </div>
          </>
        )}
        {terminando && <div className="aviso">Salvando as gravações…</div>}
      </div>
    </ProvedorLeitura>
  );
}
