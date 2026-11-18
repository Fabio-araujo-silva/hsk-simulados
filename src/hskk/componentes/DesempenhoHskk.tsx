import { useMemo } from "react";
import { useConfig, useEstado } from "../armazenamento";
import { mediaParte1, provasFeitas } from "../dados";
import "../hskk.css";

/**
 * Seção do HSKK na página Desempenho: as provas orais feitas e o % automático da parte 1.
 * (O HSKK não tem nota calculável: é corrigido por avaliadores ouvindo a gravação.)
 */
export function DesempenhoHskk() {
  const tentativas = useEstado((e) => e.tentativas);
  const cfg = useConfig();
  const exames = useMemo(() => provasFeitas(Object.values(tentativas)), [tentativas]);
  const estudos = useMemo(
    () =>
      Object.values(tentativas)
        .filter((t) => t.modo === "estudo" && !t.arquivada)
        .map((t) => ({ t, p1: mediaParte1(t), feitas: Object.values(t.gravacoes).filter((gs) => gs.length).length }))
        .filter((x) => x.feitas > 0)
        .sort((a, b) => a.t.prova.localeCompare(b.t.prova)),
    [tentativas],
  );
  const classe = (p: number | null) => (p === null ? "" : p >= cfg.limiarRevisao ? "aprovado" : "reprovado");

  return (
    <>
      <p>
        Sem nota oficial calculável (avaliadores ouvem a gravação): aqui fica o <b>% automático da parte 1</b> — quantos caracteres o reconhecimento de
        voz entendeu da sua repetição, média das 10 frases.
      </p>
      {exames.length === 0 ? (
        <p>Nenhuma prova oral completa ainda.</p>
      ) : (
        <table className="tabela">
          <thead>
            <tr>
              <th>data</th>
              <th>prova</th>
              <th>gravações</th>
              <th>parte 1 (automático)</th>
            </tr>
          </thead>
          <tbody>
            {exames.map((t) => {
              const p1 = mediaParte1(t);
              const n = Object.values(t.gravacoes).filter((gs) => gs.length).length;
              return (
                <tr key={t.id}>
                  <td>
                    <a href={`#/hskk/resultado/${t.id}`}>{new Date(t.fim!).toLocaleDateString("pt-BR")}</a>
                  </td>
                  <td>{t.prova}</td>
                  <td>{t.semMicrofone ? "sem gravar" : `${n}/14`}</td>
                  <td className={classe(p1)}>{p1 !== null ? `${p1}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {estudos.length > 0 && (
        <>
          <h3>Modo estudo</h3>
          <table className="tabela">
            <thead>
              <tr>
                <th>prova</th>
                <th>questões gravadas</th>
                <th>parte 1 (automático)</th>
              </tr>
            </thead>
            <tbody>
              {estudos.map(({ t, p1, feitas }) => (
                <tr key={t.id}>
                  <td>
                    <a href={`#/hskk/estudo/${t.prova}`}>{t.prova}</a>
                  </td>
                  <td>{feitas}/14</td>
                  <td className={classe(p1)}>{p1 !== null ? `${p1}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
