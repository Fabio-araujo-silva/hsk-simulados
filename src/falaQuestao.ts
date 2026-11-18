import type { Grupo, Questao } from "./tipos";

// O que o botão "🔊 ouvir (voz sintética)" lê numa questão sem áudio original (leitura e escrita).
// Fica num módulo sem React porque scripts/gera_tts.mjs usa EXATAMENTE esta função para listar todas as falas
// que o app pode pedir — e assim saber quais ainda faltam em public/tts antes de publicar o site.

export interface UnidadeFala {
  rotulo: string;
  texto: string;
}

/** Trechos que a voz sintética lê numa questão sem áudio original (enunciado + alternativas). */
export function unidadesFala(q: Questao, grupo: Grupo | undefined, revelado: boolean): UnidadeFala[] {
  const u: UnidadeFala[] = [];
  const add = (rotulo: string, texto?: string | null) => {
    if (texto && /[㐀-鿿]/.test(texto)) u.push({ rotulo, texto });
  };
  const respostaGrupo = q.grupo ? grupo?.opcoes?.[String(q.resposta)]?.zh : undefined;
  switch (q.tipo) {
    case "pareamento":
      add("frase", q.texto?.zh);
      Object.entries(grupo?.opcoes ?? {}).forEach(([l, f]) => add(l, f.zh));
      break;
    case "lacuna":
      q.linhas?.forEach((l, i) => add(q.linhas!.length > 1 ? `frase ${i + 1}` : "frase", revelado && respostaGrupo ? l.zh.replace("（＿＿）", respostaGrupo) : l.zh));
      Object.entries(grupo?.opcoes ?? {}).forEach(([l, f]) => add(l, f.zh));
      break;
    case "abc":
      add("texto", q.texto?.zh);
      add("pergunta", q.pergunta?.zh);
      Object.entries(q.opcoes ?? {}).forEach(([l, f]) => add(l, f.zh));
      break;
    case "ordenar":
      q.pecas?.forEach((pc, i) => add(`peça ${i + 1}`, pc.zh));
      if (revelado) add("frase certa", q.frase?.zh);
      break;
    case "hanzi":
      add("frase", q.frase?.zh);
      break;
    case "imagem":
      add("frase", q.texto?.zh);
      break;
    case "imagem-vf":
      add("palavra", q.palavra?.zh);
      break;
    case "vf":
      add("★", q.afirmacao?.zh);
      break;
  }
  return u;
}
