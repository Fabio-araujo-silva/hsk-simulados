import { useRef, useState } from "react";
import { exportaBackup, formataTudo, importaBackup, mudaConfig, useConfig, useEstado } from "../armazenamento";
import "../hskk.css";
import { MODO_PUBLICO } from "../../publico";

/** Opções, backup e formatação do HSKK (prova oral), na página ⚙ do app. O progresso do HSKK é separado do HSK. */
export function ConfigHskk() {
  const cfg = useConfig();
  const arquivo = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgFormata, setMsgFormata] = useState<string | null>(null);
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
    <>
      <section>
        <h2>HSKK (prova oral)</h2>
        <p>O HSKK tem progresso, opções e revisão próprios: nada nesta seção mexe no HSK.</p>
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.textoAntes} onChange={(e) => mudaConfig({ textoAntes: e.target.checked })} />
          Parte 1: mostrar o texto da frase antes de eu tentar repetir (sem isso, o texto aparece depois da 1ª gravação)
        </label>
        {MODO_PUBLICO ? (
          <p className="linha-cfg">
            <small>
              A transcrição automática das gravações (ElevenLabs Scribe) só existe na versão local do app. Aqui você grava, ouve a sua voz ao
              lado do original e avalia: na parte 1, “faltou um pouco” ou “faltou bastante” manda a frase para a revisão espaçada.
            </small>
          </p>
        ) : (
          <label className="linha-cfg">
            <input type="checkbox" checked={cfg.autoTranscrever} onChange={(e) => mudaConfig({ autoTranscrever: e.target.checked })} />
            Transcrever e corrigir sozinho cada gravação do modo estudo (ElevenLabs Scribe, pelo servidor local)
          </label>
        )}
        <label className="linha-cfg">
          <input type="checkbox" checked={cfg.pausarProva} onChange={(e) => mudaConfig({ pausarProva: e.target.checked })} />
          Permitir pausar o modo prova do HSKK (no exame real não pode)
        </label>
        <label className="linha-cfg">
          Parte 1: abaixo de
          <input
            className="entrada curta"
            type="number"
            min={0}
            max={100}
            value={cfg.limiarRevisao}
            onChange={(e) => mudaConfig({ limiarRevisao: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
          />
          % de acerto a frase vai para a revisão espaçada
        </label>
        <label className="linha-cfg">
          Frases orais novas por dia na revisão
          <input className="entrada curta" type="number" min={0} max={500} value={cfg.novosPorDia} onChange={(e) => mudaConfig({ novosPorDia: Number(e.target.value) || 0 })} />
        </label>

        <h3>Backup do HSKK</h3>
        {MODO_PUBLICO ? (
          <p>
            Com a conta conectada, o progresso do HSKK fica salvo na nuvem (sem conta, só neste navegador). As gravações da sua voz não são
            guardadas: ficam só enquanto a aba está aberta. O backup abaixo leva só o progresso.
          </p>
        ) : (
          <p>
            Com o servidor local (<code>npm run dev</code>) o progresso do HSKK fica em <code>progresso/hskk.json</code> (backup diário em{" "}
            <code>progresso/backups/hskk-*.json</code>) e as gravações em <code>progresso/gravacoes/</code>. O backup abaixo leva só o progresso (não
            os áudios).
          </p>
        )}
        <div className="acoes">
          <button className="pri" onClick={baixa}>
            baixar backup do HSKK (.json)
          </button>
          <button className="sec" onClick={() => arquivo.current?.click()}>
            restaurar backup do HSKK…
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
                setMsg("Backup do HSKK restaurado (mesclado com o que já existia).");
              } catch (err) {
                setMsg(`Erro: ${err instanceof Error ? err.message : String(err)}`);
              }
            }}
          />
        </div>
        {msg && <p className="aviso">{msg}</p>}

        <h3>Sobre o material</h3>
        <p>
          Provas reais e amostras oficiais do HSKK 中级. Cada prova mostra no início do HSKK de onde veio o caderno, o texto das frases e o áudio
          (oficial, redigitado por terceiros, transcrito do áudio ou tirado de frames de vídeo) — detalhes em <code>docs/hskk.md</code>. Traduções,
          respostas-modelo e vocabulário foram escritos para estudo e <b>não são oficiais</b>. Use só para estudo pessoal.
        </p>
      </section>
      <section className="zona-perigo">
        <h2>Formatar o progresso do HSKK</h2>
        <p>
          Apaga <b>tudo do HSKK</b>: {Object.keys(nTent).length} tentativas (estudo e provas) e {Object.keys(nCart).length} frases da revisão
          espaçada. O HSK não é afetado.{" "}
          {MODO_PUBLICO ? (
            <>As configurações ficam. Por segurança a nuvem guarda uma cópia do estado anterior (em Conta → cópias de segurança).</>
          ) : (
            <>
              Os arquivos de áudio em <code>progresso/gravacoes/</code> não são apagados e as configurações ficam. Por segurança o servidor guarda
              uma cópia do estado anterior em <code>progresso/backups/hskk-antes-*.json</code>.
            </>
          )}
        </p>
        <div className="acoes">
          <input className="entrada" placeholder="digite FORMATAR" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
          <button
            className="perigo"
            disabled={confirmacao.trim().toUpperCase() !== "FORMATAR"}
            onClick={() => {
              formataTudo();
              setConfirmacao("");
              setMsgFormata("Progresso do HSKK formatado: tudo começa do zero.");
            }}
          >
            formatar o progresso do HSKK
          </button>
        </div>
        {msgFormata && <p className="aviso">{msgFormata}</p>}
      </section>
    </>
  );
}
