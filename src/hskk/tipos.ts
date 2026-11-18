// Tipos dos dados gerados por scripts/hskk/monta.py (public/hskk/conteudo/...)
// Frase, Lexico e o estado FSRS são os mesmos do HSK (src/tipos.ts).
import type { CartaoSrs, Frase } from "../tipos";
export type { CartaoSrs, Frase, Lexico, Verbete } from "../tipos";

/** Tempos (s) de uma questão no áudio original. */
export interface TempoQuestao {
  /** início do número / da instrução "现在开始第N题" */
  p: number;
  /** a frase (só 第一部分) */
  s?: number;
  e?: number;
  /** fim do "嘀" (provas no formato com bip) */
  bip?: number;
  /** janela em que o candidato responde (é gravada no modo prova) */
  rs: number;
  re: number;
}

export interface Modelo {
  nivel: string;
  frases: Frase[];
}

export interface Vocab {
  w: string;
  py: string;
  pt: string;
}

export interface Estrutura {
  zh: string;
  pt: string;
  ex?: Frase;
}

interface QuestaoBase {
  n: number;
  t: TempoQuestao;
}

export interface QuestaoRepetir extends QuestaoBase {
  parte: 1;
  frase: Frase;
}

export interface QuestaoFalar extends QuestaoBase {
  parte: 2 | 3;
  /** parte 2: figura */
  img?: string;
  cena?: string;
  /** parte 3: pergunta impressa (com pinyin, como no caderno) */
  pergunta?: Frase;
  modelos: Modelo[];
  vocab: Vocab[];
  estruturas: Estrutura[];
}

export type Questao = QuestaoRepetir | QuestaoFalar;

export type TipoFonte = "oficial" | "terceiro" | "transcrito" | "frames" | "youtube";

export interface Fontes {
  caderno: TipoFonte;
  roteiro: TipoFonte;
  audio: TipoFonte;
  notas?: string[];
}

export interface Aquecimento {
  zh: string;
  frase: Frase;
  s: number;
  e: number;
  rs: number;
  re: number;
}

export interface Prova {
  id: string;
  titulo: string;
  /** "bip": formato atual (嘀 depois de cada frase, ~11 s para repetir); "sem-bip": formato antigo (~8 s) */
  formato: "bip" | "sem-bip";
  /** o que diz a capa do caderno (null = caderno não disponível) */
  cabecalho: { parte1Min: number; totalMin: number } | null;
  fontes: Fontes;
  audio: { src: string; duracao: number } | null;
  aquecimento: Aquecimento[];
  preparo: { s: number; e: number } | null;
  fim: number | null;
  questoes: Questao[];
}

export interface ResumoProva {
  id: string;
  titulo: string;
  formato: Prova["formato"];
  fontes: Omit<Fontes, "notas">;
  duracaoAudio?: number;
  completa: boolean;
}

// ------------------------------------------------------------ estado do usuário

export type Modo = "prova" | "estudo";

/** Uma gravação sua (o áudio fica em progresso/gravacoes/<arquivo>). */
export interface Gravacao {
  arquivo: string;
  /** duração (s) */
  dur: number;
  em: number;
  /** transcrição do Scribe (quando já pedida) */
  texto?: string;
  /** 第一部分: % de caracteres da frase que o reconhecimento achou */
  pct?: number;
  /** a gravação só existe nesta aba (sem o servidor local) */
  soNaSessao?: boolean;
  /** 第一部分 sem transcrição (site público): como você mesmo avaliou a repetição ao ouvir */
  autoavaliacao?: Autoavaliacao;
}

export type Autoavaliacao = "tudo" | "quase" | "longe";

export interface Tentativa {
  id: string;
  prova: string;
  modo: Modo;
  inicio: number;
  fim?: number;
  /** última alteração (ms) — usada na sincronização com o disco */
  atualizado?: number;
  /** tentativa arquivada por um "resetar" (continua no histórico) */
  arquivada?: boolean;
  /** prova abandonada no meio */
  abandonada?: boolean;
  /** gravações por questão (no estudo: todas as tentativas, a mais recente por último) */
  gravacoes: Record<number, Gravacao[]>;
  /** modo prova: de onde retomar o áudio (s) se a aba for fechada */
  retomar?: number;
  /** modo prova: feita sem microfone */
  semMicrofone?: boolean;
  /** anotações da preparação (modo prova) ou do estudo, por questão (0 = preparação geral) */
  notas?: Record<number, string>;
}

/** Cartão de revisão espaçada: uma frase do 第一部分 para ouvir e repetir. */
export interface Cartao {
  id: string;
  tipo: "frase";
  criado: number;
  atualizado?: number;
  origem: { prova: string; n: number };
  frase: Frase;
  /** trecho do áudio original com a frase */
  audio: { prova: string; s: number; e: number } | null;
  /** % da tentativa que gerou o cartão */
  pct?: number;
  srs: CartaoSrs;
}

export interface Config {
  traducao: boolean;
  pinyin: boolean;
  velocidade: number;
  /** estudo, 第一部分: mostrar o texto antes de você tentar repetir */
  textoAntes: boolean;
  /** transcrever sozinho (ElevenLabs Scribe) cada gravação ao terminar */
  autoTranscrever: boolean;
  /** modo prova: permitir pausar (no exame real não pode) */
  pausarProva: boolean;
  /** quantos cartões novos por dia */
  novosPorDia: number;
  /** 第一部分: abaixo deste % a frase vai para a revisão espaçada */
  limiarRevisao: number;
}
