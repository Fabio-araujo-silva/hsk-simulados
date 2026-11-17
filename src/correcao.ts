import type { Frase, Grupo, Prova, Questao, Tentativa } from "./tipos";
import { pontuacao } from "./dados";

/** Normaliza uma frase escrita para comparação (ignora espaços e pontuação final). */
export function normalizaEscrita(s: string) {
  return s
    .replace(/\s+/g, "")
    .replace(/[,]/g, "，")
    .replace(/[?]/g, "？")
    .replace(/[!]/g, "！")
    .replace(/[。．.？！?!]+$/u, "");
}

export function confere(q: Questao, valor: string | boolean | null | undefined): boolean {
  if (valor === null || valor === undefined || valor === "") return false;
  switch (q.tipo) {
    case "vf":
      return valor === q.resposta;
    case "ordenar": {
      const v = normalizaEscrita(String(valor));
      const certas = [String(q.resposta), ...(q.aceitas ?? [])].map(normalizaEscrita);
      return certas.includes(v);
    }
    case "hanzi":
      return [String(q.resposta), ...(q.aceitas ?? [])].some((r) => String(valor).trim() === r.trim());
    default:
      return String(valor).toUpperCase() === String(q.resposta).toUpperCase();
  }
}

/** Texto legível da resposta certa (ex.: "B · 生病了"). */
export function textoResposta(q: Questao, grupo?: Grupo, valor: string | boolean | null = q.resposta): string {
  if (valor === null || valor === undefined) return "—";
  if (q.tipo === "vf") return valor ? "✓ certo" : "✗ errado";
  if (q.tipo === "ordenar" || q.tipo === "hanzi") return String(valor);
  const letra = String(valor);
  const op: Frase | undefined = q.opcoes?.[letra] ?? grupo?.opcoes?.[letra];
  return op ? `${letra} · ${op.zh}` : letra;
}

export function resumoTentativa(prova: Prova, t: Tentativa) {
  const certas = { L: 0, R: 0, W: 0 };
  const porParte: Record<string, { certas: number; total: number }> = {};
  for (const q of prova.questoes) {
    const r = t.respostas[q.n];
    const ok = !!r && (r.manual || r.certa);
    if (ok) certas[q.secao]++;
    const k = `${q.secao}${q.parte}`;
    porParte[k] ??= { certas: 0, total: 0 };
    porParte[k].total++;
    if (ok) porParte[k].certas++;
  }
  return { certas, porParte, ...pontuacao(certas) };
}

/** Todas as frases de uma questão (para achar frase-chave, palavras etc.). */
export function frasesDaQuestao(q: Questao, grupo?: Grupo): Frase[] {
  const fs: Frase[] = [];
  q.falas?.forEach((f) => fs.push(f.f));
  if (q.afirmacao) fs.push(q.afirmacao);
  if (q.texto) fs.push(q.texto);
  if (q.pergunta) fs.push(q.pergunta);
  q.linhas?.forEach((f) => fs.push(f));
  if (q.frase) fs.push(q.frase);
  Object.values(q.opcoes ?? {}).forEach((f) => fs.push(f));
  if (q.tipo === "pareamento" || q.tipo === "lacuna") {
    const op = grupo?.opcoes?.[String(q.resposta)];
    if (op) fs.push(op);
  }
  q.pecas?.forEach((f) => fs.push(f));
  return fs;
}
