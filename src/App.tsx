import { useEffect, useState } from "react";
import { useEstado, useStatusDisco, type StatusDisco } from "./armazenamento";
import { useStatusDisco as useStatusDiscoHskk } from "./hskk/armazenamento";
import { ehProvaHskk, PaginaHskk } from "./hskk/Rotas";
import { usePendentes } from "./pendentes";
import type { Nivel } from "./tipos";
import { EscolhaNivel, Inicio } from "./paginas/Inicio";
import { PaginaEstudo } from "./paginas/Estudo";
import { PaginaExame } from "./paginas/Exame";
import { PaginaResultado } from "./paginas/Resultado";
import { PaginaRevisao } from "./paginas/Revisao";
import { PaginaCartoes } from "./paginas/Cartoes";
import { PaginaVocabulario } from "./paginas/Vocabulario";
import { PaginaDesempenho } from "./paginas/Desempenho";
import { PaginaConfig } from "./paginas/Config";
import { PaginaConta } from "./paginas/Conta";
import { PaginaSobre } from "./paginas/Sobre";
import { PaginaAdmin } from "./paginas/Admin";
import { useAdmin, useConta } from "./nuvem";
import { MODO_PUBLICO } from "./publico";

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

/** O HSK e o HSKK salvam cada um no seu arquivo: o aviso do cabeçalho mostra o pior dos dois. */
function juntaStatus(a: StatusDisco, b: StatusDisco): StatusDisco {
  for (const s of ["verificando", "erro", "salvando", "sem-servidor"] as const) if (a === s || b === s) return s;
  return "ok";
}

/** Site público: onde o progresso está ("✓ salvo na nuvem" / "só neste navegador") e o acesso à conta. */
function StatusPublico({ disco, logado, naConta }: { disco: StatusDisco; logado: boolean; naConta: boolean }) {
  const texto = !logado
    ? "só neste navegador"
    : disco === "ok"
      ? "✓ salvo na nuvem"
      : disco === "salvando"
        ? "salvando…"
        : disco === "erro"
          ? "⚠ sem conexão com a nuvem"
          : "";
  return (
    <>
      <a href="#/conta" className={naConta ? "on" : ""} title={logado ? "Sua conta" : "Entre com o seu e-mail para salvar o progresso na nuvem"}>
        {logado ? "Conta" : "Entrar"}
      </a>
      <span
        className={`status-disco ${logado && disco === "ok" ? "ok" : disco === "erro" ? "erro" : ""}`}
        title={
          logado
            ? "Seu progresso fica salvo na nuvem, na sua conta"
            : "Sem conta, o progresso fica só neste navegador — entre (com o seu e-mail) para salvar na nuvem e usar em outros aparelhos"
        }
      >
        {texto}
        {!logado && (
          <>
            {" · "}
            <a href="#/conta" className="entre-nuvem">
              entre para salvar na nuvem
            </a>
          </>
        )}
      </span>
    </>
  );
}

export default function App() {
  const rota = useRota();
  const disco = juntaStatus(useStatusDisco(), useStatusDiscoHskk());
  const partes = rota.split("/").filter(Boolean);
  const cfg = useEstado((e) => e.config);
  const pendentes = usePendentes();
  const conta = useConta();
  const admin = useAdmin();

  // prova em andamento ocupa a tela toda (sem distrações) — a do HSK e a do HSKK
  const emProva = (partes[0] === "prova" && partes.length >= 2) || ehProvaHskk(partes);
  // dentro do HSKK (menos revisão e cartões, que são as páginas do app na aba oral)
  const noHskk = partes[0] === "hskk" && partes[1] !== "revisao" && partes[1] !== "cartoes";
  const em = (pagina: string) => partes[0] === pagina || (partes[0] === "hskk" && partes[1] === pagina);

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
      pagina = <PaginaRevisao key="hsk" />;
      break;
    case "cartoes":
      pagina = <PaginaCartoes key="hsk" />;
      break;
    case "hskk":
      if (partes[1] === "revisao") pagina = <PaginaRevisao key="hskk" aba="hskk" />;
      else if (partes[1] === "cartoes") pagina = <PaginaCartoes key="hskk" aba="hskk" />;
      else pagina = <PaginaHskk partes={partes.slice(1)} rota={rota} />;
      break;
    case "vocabulario":
      pagina = <PaginaVocabulario />;
      break;
    case "desempenho":
      pagina = <PaginaDesempenho />;
      break;
    case "config":
      pagina = <PaginaConfig />;
      break;
    case "conta":
      pagina = <PaginaConta />;
      break;
    case "sobre":
      pagina = <PaginaSobre />;
      break;
    case "admin":
      // só existe no site público (e só mostra algo a quem é admin no banco)
      pagina = MODO_PUBLICO ? <PaginaAdmin /> : <EscolhaNivel />;
      break;
    case "nivel":
      pagina = <Inicio key={partes[1]} nivel={(Number(partes[1]) || 3) as Nivel} />;
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
            <a
              href={noHskk ? "#/hskk" : cfg.nivel ? `#/nivel/${cfg.nivel}` : "#/"}
              className={partes.length === 0 || partes[0] === "nivel" || noHskk ? "on" : ""}
            >
              Simulados{noHskk ? " · HSKK" : cfg.nivel ? ` · HSK ${cfg.nivel}` : ""}
            </a>
            <a
              href="#/revisao"
              className={em("revisao") ? "on" : ""}
              title={pendentes.total > 0 ? `para revisar agora: ${pendentes.hsk} do HSK (leitura e escrita) e ${pendentes.hskk} do HSKK (oral)` : undefined}
            >
              Revisão {pendentes.total > 0 && <span className="badge">{pendentes.total}</span>}
            </a>
            <a href="#/cartoes" className={em("cartoes") ? "on" : ""}>
              Cartões
            </a>
            <a href="#/vocabulario" className={partes[0] === "vocabulario" ? "on" : ""}>
              Vocabulário
            </a>
            <a href="#/desempenho" className={partes[0] === "desempenho" ? "on" : ""}>
              Desempenho
            </a>
            <a href="#/config" className={partes[0] === "config" ? "on" : ""} title="Configurações e backup">
              ⚙
            </a>
            {MODO_PUBLICO && admin && (
              <a href="#/admin" className={partes[0] === "admin" ? "on" : ""} title="Quem está usando o site">
                Admin
              </a>
            )}
            {MODO_PUBLICO ? (
              <StatusPublico disco={disco} logado={!!conta} naConta={partes[0] === "conta"} />
            ) : (
              <span
                className={`status-disco ${disco === "ok" ? "ok" : disco === "erro" ? "erro" : ""}`}
                title={
                  disco === "sem-servidor"
                    ? "Sem o servidor local: o progresso fica só neste navegador — baixe backups em ⚙"
                    : "Progresso salvo também em progresso/progresso.json (HSK) e progresso/hskk.json (HSKK), com backup diário em progresso/backups"
                }
              >
                {disco === "ok" ? "✓ salvo no disco" : disco === "salvando" ? "salvando…" : disco === "erro" ? "⚠ erro ao salvar" : disco === "sem-servidor" ? "só no navegador" : ""}
              </span>
            )}
          </nav>
        </header>
      )}
      {/* só monta a página depois que o progresso do disco chegou: senão uma tentativa criada antes
          (ex.: recarregar dentro de #/estudo/…) seria descartada quando o arquivo substitui o estado */}
      <main className={emProva ? "principal tela-cheia" : "principal"}>{disco === "verificando" ? <div className="carregando">carregando o seu progresso…</div> : pagina}</main>
      {MODO_PUBLICO && !emProva && (
        <footer className="rodape">
          Provas do Hanban / Chinese Testing International, reunidas só para estudo · site gratuito e não comercial · <a href="#/sobre">Sobre</a>
        </footer>
      )}
    </div>
  );
}
