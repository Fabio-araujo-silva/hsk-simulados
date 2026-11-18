import { useRef, useState } from "react";
import { exportaBackup, formataTudo, importaBackup, mudaConfig, useConfig, useEstado } from "../armazenamento";

export function PaginaConfig() {
  const cfg = useConfig();
  const arquivo = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const nTent = useEstado((e) => e.tentativas);
  const nCart = useEstado((e) => e.cartoes);

  const baixa = () => {
    const blob = new Blob([exportaBackup()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hskk-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="config">
      <h1>Configurações</h1>
      <section>
        <h2>Estudo</h2>
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.textoAntes} onChange={(e) => mudaConfig({ textoAntes: e.target.checked })} />
          Parte 1: mostrar o texto da frase antes de eu tentar repetir (sem isso, o texto aparece depois da 1ª gravação)
        </label>
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.autoTranscrever} onChange={(e) => mudaConfig({ autoTranscrever: e.target.checked })} />
          Transcrever e corrigir sozinho cada gravação do modo estudo (ElevenLabs Scribe, pelo servidor local)
        </label>
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.pausarProva} onChange={(e) => mudaConfig({ pausarProva: e.target.checked })} />
          Permitir pausar o modo prova (no exame real não pode)
        </label>
        <label className="linha-cfg">
          Parte 1: abaixo de
          <input className="entrada curta" type="number" min={0} max={100} value={cfg.limiarRevisao} onChange={(e) => mudaConfig({ limiarRevisao: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
          % de acerto a frase vai para a revisão espaçada
        </label>
        <label className="linha-cfg">
          Frases novas por dia na revisão
          <input className="entrada curta" type="number" min={0} max={500} value={cfg.novosPorDia} onChange={(e) => mudaConfig({ novosPorDia: Number(e.target.value) || 0 })} />
        </label>
      </section>
      <section>
        <h2>Backup</h2>
        <p>Com o servidor local (<code>npm run dev</code>) o progresso do HSKK fica em <code>progresso/hskk.json</code> e as gravações em <code>progresso/gravacoes/</code>. O backup abaixo leva só o progresso (não os áudios).</p>
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
                setMsg("Backup restaurado (mesclado com o que já existia).");
              } catch (err) {
                setMsg(`Erro: ${String(err)}`);
              }
            }}
          />
        </div>
        {msg && <p className="aviso">{msg}</p>}
      </section>
      <section className="zona-perigo">
        <h2>Formatar todo o progresso</h2>
        <p>
          Apaga <b>tudo</b>: {Object.keys(nTent).length} tentativas (estudo e provas) e {Object.keys(nCart).length} frases da revisão espaçada. Os
          arquivos de áudio em <code>progresso/gravacoes/</code> não são apagados. As configurações ficam. Por segurança o servidor guarda uma cópia do estado anterior em <code>progresso/backups/</code>.
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
          Provas reais e amostras oficiais do HSKK 中级. Cada prova mostra na página inicial de onde veio o caderno, o texto das frases e o áudio
          (oficial, redigitado por terceiros, transcrito do áudio ou tirado de frames de vídeo) — detalhes no README. Traduções, respostas-modelo e
          vocabulário foram escritos para estudo e <b>não são oficiais</b>. Use só para estudo pessoal.
        </p>
      </section>
    </div>
  );
}
