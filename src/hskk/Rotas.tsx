import { Inicio } from "./paginas/Inicio";
import { PaginaEstudo } from "./paginas/Estudo";
import { PaginaExame } from "./paginas/Exame";
import { PaginaResultado } from "./paginas/Resultado";
import { PaginaRegras } from "./paginas/Regras";

// Rotas do HSKK (prova oral) dentro do app, todas sob #/hskk:
//   #/hskk                      início: provas + resumo das regras
//   #/hskk/regras               regras completas
//   #/hskk/estudo/<ID>[/<n>]    modo estudo (questão n)
//   #/hskk/prova/<ID>           modo prova (tela cheia)
//   #/hskk/resultado/<TID>      revisão de uma prova feita
// #/hskk/revisao e #/hskk/cartoes são as páginas Revisão e Cartões do app, na aba "Oral (HSKK)".

/** `partes` = a rota depois de "hskk" (ex.: ["estudo", "YANGTI", "3"]). */
export function PaginaHskk({ partes, rota }: { partes: string[]; rota: string }) {
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
    case "regras":
      pagina = <PaginaRegras />;
      break;
    default:
      pagina = <Inicio />;
  }
  // os estilos próprios do HSKK (hskk.css) só valem aqui dentro
  return <div className="hskk">{pagina}</div>;
}

/** A prova do HSKK em andamento ocupa a tela toda, como a do HSK. `partes` = a rota inteira. */
export const ehProvaHskk = (partes: string[]) => partes[0] === "hskk" && partes[1] === "prova" && partes.length >= 3;
