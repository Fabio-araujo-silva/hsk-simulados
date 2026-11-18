import { useEffect, useMemo, useState } from "react";
import { useEstado, useStatusDisco } from "./armazenamento";
import { vencido } from "./srs";
import { EscolhaNivel, Inicio } from "./paginas/Inicio";
import { PaginaEstudo } from "./paginas/Estudo";
import { PaginaExame } from "./paginas/Exame";
import { PaginaResultado } from "./paginas/Resultado";
import { PaginaRevisao } from "./paginas/Revisao";
import { PaginaCartoes } from "./paginas/Cartoes";
import { PaginaDesempenho } from "./paginas/Desempenho";
import { PaginaConfig } from "./paginas/Config";

function useRota() {
  const [h, setH] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const f = () => {
      setH(window.location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return h;
}

export const vaiPara = (rota: string) => {
  window.location.hash = rota;
};

export default function App() {
  const rota = useRota();
  const disco = useStatusDisco();
  const partes = rota.split("/").filter(Boolean);
  const cartoes = useEstado((e) => e.cartoes);
  const novosHoje = useEstado((e) => e.novosHoje);
  const cfg = useEstado((e) => e.config);
  const pendentes = useMemo(() => {
    const agora = Date.now();
    const lista = Object.values(cartoes);
    const revisoes = lista.filter((c) => c.srs.state !== 0 && vencido(c, agora)).length;
    const hoje = new Date();
    const k = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const novos = Math.min(lista.filter((c) => c.srs.state === 0).length, Math.max(0, cfg.novosPorDia - (novosHoje[k] ?? 0)));
    return revisoes + novos;
  }, [cartoes, novosHoje, cfg.novosPorDia]);

  // prova em andamento ocupa a tela toda (sem distrações)
  const emProva = partes[0] === "prova" && partes.length >= 2;

  let pagina: JSX.Element;
  switch (partes[0]) {
    case "estudo":
      pagina = <PaginaEstudo key={rota} id={partes[1]} nInicial={partes[2] ? Number(partes[2]) : undefined} />;
      break;
    case "prova":
      pagina = <PaginaExame key={partes[1]} id={partes[1]} />;
      break;
    case "resultado":
      pagina = <PaginaResultado key={partes[1]} tentativaId={partes[1]} />;
      break;
    case "revisao":
      pagina = <PaginaRevisao />;
      break;
    case "cartoes":
      pagina = <PaginaCartoes />;
      break;
    case "desempenho":
      pagina = <PaginaDesempenho />;
      break;
    case "config":
      pagina = <PaginaConfig />;
      break;
    case "nivel":
      pagina = <Inicio key={partes[1]} nivel={(Number(partes[1]) || 3) as 1 | 3} />;
      break;
    default:
      pagina = <EscolhaNivel />;
  }

  return (
    <div className="app">
      {!emProva && (
        <header className="topo">
          <a href="#/" className="marca">
            <span className="zh">汉语水平考试</span> <b>HSK</b> <span className="marca-sub">simulados reais</span>
          </a>
          <nav>
            <a href={cfg.nivel ? `#/nivel/${cfg.nivel}` : "#/"} className={partes.length === 0 || partes[0] === "nivel" ? "on" : ""}>
              Simulados{cfg.nivel ? ` · HSK ${cfg.nivel}` : ""}
            </a>
            <a href="#/revisao" className={partes[0] === "revisao" ? "on" : ""}>
              Revisão {pendentes > 0 && <span className="badge">{pendentes}</span>}
            </a>
            <a href="#/cartoes" className={partes[0] === "cartoes" ? "on" : ""}>
              Cartões
            </a>
            <a href="#/desempenho" className={partes[0] === "desempenho" ? "on" : ""}>
              Desempenho
            </a>
            <a href="#/config" className={partes[0] === "config" ? "on" : ""} title="Configurações e backup">
              ⚙
            </a>
            <span
              className={`status-disco ${disco === "ok" ? "ok" : disco === "erro" ? "erro" : ""}`}
              title={
                disco === "sem-servidor"
                  ? "Sem o servidor local: o progresso fica só neste navegador — baixe backups em ⚙"
                  : "Progresso salvo também em progresso/progresso.json (backup diário em progresso/backups)"
              }
            >
              {disco === "ok" ? "✓ salvo no disco" : disco === "salvando" ? "salvando…" : disco === "erro" ? "⚠ erro ao salvar" : disco === "sem-servidor" ? "só no navegador" : ""}
            </span>
          </nav>
        </header>
      )}
      {/* só monta a página depois que o progresso do disco chegou: senão uma tentativa criada antes
          (ex.: recarregar dentro de #/estudo/…) seria descartada quando o arquivo substitui o estado */}
      <main className={emProva ? "principal tela-cheia" : "principal"}>{disco === "verificando" ? <div className="carregando">carregando o seu progresso…</div> : pagina}</main>
    </div>
  );
}
