import { useRef, useState } from "react";
import { exportaBackup, formataTudo, importaBackup, mudaConfig, useConfig, useEstado } from "../armazenamento";
import { ConfigHskk } from "../hskk/componentes/ConfigHskk";

export function PaginaConfig() {
  const cfg = useConfig();
  const arquivo = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const nTent = useEstado((e) => e.tentativas);
  const nCart = useEstado((e) => e.cartoes);
  const nMarcas = useEstado((e) => e.vocab.marcas);

  const baixa = () => {
    const blob = new Blob([exportaBackup()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hsk3-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="config">
      <h1>Configurações</h1>
      <section>
        <h2>Estudo (HSK 1–3)</h2>
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.transcricaoAntes} onChange={(e) => mudaConfig({ transcricaoAntes: e.target.checked })} />
          Mostrar a transcrição do áudio antes de responder (listening)
        </label>
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.tocarSozinho} onChange={(e) => mudaConfig({ tocarSozinho: e.target.checked })} />
          Tocar o áudio sozinho ao abrir uma questão de listening (modo estudo)
        </label>
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.porBlocos !== false} onChange={(e) => mudaConfig({ porBlocos: e.target.checked })} />
          Corrigir por blocos: questões que dividem as mesmas alternativas (ex.: 41–45) só mostram o resultado no fim do bloco
        </label>
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.pausarProva} onChange={(e) => mudaConfig({ pausarProva: e.target.checked })} />
          Permitir pausar o áudio no modo prova (no exame real não pode)
        </label>
        <label className="linha-cfg">
          Cartões novos por dia
          <input className="entrada curta" type="number" min={0} max={500} value={cfg.novosPorDia} onChange={(e) => mudaConfig({ novosPorDia: Number(e.target.value) || 0 })} />
        </label>
      </section>
      <section>
        <h2>Backup (HSK 1–3)</h2>
        <p>
          Seu progresso do HSK (provas, respostas, cartões e marcações do vocabulário) fica salvo neste navegador. Baixe um backup de vez em
          quando — e para levar para outro computador. O HSKK tem backup próprio, na seção dele mais abaixo.
        </p>
        <div className="acoes">
          <button className="pri" onClick={baixa}>
            baixar backup (.json)
          </button>
          <button className="sec" onClick={() => arquivo.current?.click()}>
            restaurar backup…
          </button>
          <input
            ref={arquivo}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                importaBackup(await f.text());
                setMsg("Backup restaurado (mesclado com o que já existia; nas marcações do vocabulário fica a versão alterada por último).");
              } catch (err) {
                setMsg(`Erro: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />
        </div>
        {msg && <p className="aviso">{msg}</p>}
      </section>
      <section className="zona-perigo">
        <h2>Formatar todo o progresso do HSK</h2>
        <p>
          Apaga <b>tudo do HSK 1–3</b>: {Object.keys(nTent).length} tentativas (estudo e provas, com as notas), {Object.keys(nCart).length} cartões de
          revisão espaçada e {Object.keys(nMarcas).length} marcações do vocabulário. O HSKK não é afetado. As configurações ficam. Por segurança o
          servidor guarda uma cópia do estado anterior em <code>progresso/backups/</code>.
        </p>
        <div className="acoes">
          <input className="entrada" placeholder='digite FORMATAR' value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          <button
            className="perigo"
            disabled={confirmacao.trim().toUpperCase() !== "FORMATAR"}
            onClick={() => {
              formataTudo();
              setConfirmacao("");
              setMsg("Progresso formatado: tudo começa do zero.");
            }}
          >
            formatar todo o progresso
          </button>
        </div>
      </section>
      <section>
        <h2>Sobre o material</h2>
        <p>
          As provas são exames oficiais do HSK 3 (formato 2.0) publicados pelo Hanban / Chinese Testing International. Questões, gabaritos e
          áudios são os originais; traduções, explicações e glossário em português foram preparados para estudo e revisados por agentes
          revisores. Use só para estudo pessoal.
        </p>
      </section>
      <div className="hskk">
        <ConfigHskk />
      </div>
    </div>
  );
}
