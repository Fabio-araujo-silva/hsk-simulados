// Tipos dos dados gerados por scripts/enriquece.py (public/data/...)

/** Um trecho em chinês já segmentado em palavras. */
export interface Frase {
  zh: string;
  /** palavras (tokens) — concatenadas dão `zh` */
  tk: string[];
  /** pinyin de cada token ("" para pontuação) */
  py: string[];
  /** tradução em português da frase inteira */
  pt?: string;
  /** tradução com a lacuna em branco (para não entregar a resposta antes da hora) */
  ptL?: string;
  /** tempos [início, fim] de cada token na 1ª leitura do áudio (null = sem tempo) */
  a?: ([number, number] | null)[];
  /** idem, 2ª leitura */
  a2?: ([number, number] | null)[];
}

export type Falante = "男" | "女" | "问" | "★" | null;

export interface Fala {
  fal: Falante;
  f: Frase;
}

export interface TrechoAudio {
  /** 1ª leitura */
  s: number;
  e: number;
  /** 2ª leitura (o HSK lê cada questão duas vezes) */
  s2?: number;
  e2?: number;
}

export type Secao = "L" | "R" | "W";
export type TipoQuestao = "imagem" | "vf" | "abc" | "pareamento" | "lacuna" | "ordenar" | "hanzi";

export interface Questao {
  n: number;
  secao: Secao;
  parte: number;
  tipo: TipoQuestao;
  grupo?: string;
  /** letra (A-F), true/false (V/F), frase (ordenar) ou caractere (hanzi) */
  resposta: string | boolean;
  /** outras ordens corretas aceitas (só "ordenar") */
  aceitas?: string[];
  audio?: TrechoAudio | null;
  falas?: Fala[] | null;
  afirmacao?: Frase;
  pergunta?: Frase | null;
  opcoes?: Record<string, Frase>;
  texto?: Frase | null;
  /** reading parte 2: linhas (A:/B:) com a lacuna "（＿＿）" */
  linhas?: Frase[];
  pecas?: Frase[];
  /** hanzi: frase completa (com a resposta) e as partes antes/depois da lacuna */
  frase?: Frase;
  antes?: string;
  depois?: string;
  pinyin?: string;
  /** explicação em português (por que a resposta certa é a certa) */
  explicacao?: string;
  /** trecho do texto/áudio que justifica a resposta */
  trecho?: string;
  /** palavras-chave da questão (para cartões) */
  palavras?: string[];
}

export interface Grupo {
  questoes: number[];
  letras?: string[];
  imagens?: Record<string, string>;
  exemploUsa?: string | null;
  opcoes?: Record<string, Frase>;
  exemplo?: { texto: Frase; resposta: string } | null;
}

export interface Segmento {
  tipo: "musica" | "instrucao" | "exemplo" | "questao";
  n?: number;
  f?: Frase;
  falas?: Fala[];
  s?: number;
  e?: number;
}

export interface Prova {
  id: string;
  titulo: string;
  origem?: string;
  /** de onde veio o texto do áudio: oficial (听力材料) ou transcrito do áudio original */
  transcricao?: "oficial" | "audio" | null;
  audio?: { src: string; duracao: number } | null;
  grupos: Record<string, Grupo>;
  roteiro: Segmento[] | null;
  questoes: Questao[];
}

export interface ResumoProva {
  id: string;
  titulo: string;
  origem?: string;
  temAudio: boolean;
  temAlinhamento: boolean;
  transcricao?: "oficial" | "audio" | null;
  duracaoAudio?: number;
}

export interface Verbete {
  py: string;
  pt?: string;
  en?: string;
  hsk?: number;
}

export type Lexico = Record<string, Verbete>;

// ------------------------------------------------------------ estado do usuário

export type Modo = "prova" | "estudo";

export interface Resposta {
  valor: string | boolean | null;
  certa: boolean;
  /** usuário marcou manualmente como correta (ex.: outra ordem válida no "ordenar") */
  manual?: boolean;
  em: number;
}

export interface Tentativa {
  id: string;
  prova: string;
  modo: Modo;
  inicio: number;
  fim?: number;
  /** última alteração (ms) — usada na sincronização com o disco */
  atualizado?: number;
  /** tentativa arquivada por um "resetar simulado" (continua no histórico) */
  arquivada?: boolean;
  /** prova abandonada no meio (não entra nas notas) */
  abandonada?: boolean;
  respostas: Record<number, Resposta>;
  /** etapa atual (modo prova) */
  etapa?: "L" | "Lfolha" | "R" | "W" | "fim";
  /** instante (ms) em que a etapa atual começou (modo prova) */
  etapaInicio?: number;
  /** segundos já consumidos do áudio (modo prova) */
  audioPos?: number;
  /** segundos restantes da etapa atual (modo prova; pausa se você fechar a aba) */
  restante?: number;
  /** prova feita sem a parte de listening (prova sem áudio) */
  semListening?: boolean;
  /** palavras consultadas no hover por questão (sugestões de cartões) */
  consultas?: Record<number, string[]>;
}

/**
 * questao: refazer a questão real (renderizada a partir da prova);
 * frase:   frase-chave (com o trecho do áudio original, se houver);
 * palavra: vocabulário, com a frase da prova como exemplo.
 */
export type TipoCartao = "questao" | "frase" | "palavra";

export interface Cartao {
  id: string;
  tipo: TipoCartao;
  criado: number;
  atualizado?: number;
  origem: { prova: string; n: number };
  palavra?: string;
  py?: string;
  pt?: string;
  /** frase-chave (cartão frase) ou frase de exemplo (cartão palavra) */
  frase?: Frase;
  /** trecho do áudio original da frase */
  audio?: { prova: string; s: number; e: number } | null;
  /** trecho do áudio só com a palavra */
  audioPalavra?: { prova: string; s: number; e: number } | null;
  /** estado FSRS serializado */
  srs: CartaoSrs;
}

export interface CartaoSrs {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
}

export interface Config {
  traducao: boolean;
  pinyin: boolean;
  velocidade: number;
  /** modo estudo: mostrar a transcrição do áudio antes de responder */
  transcricaoAntes: boolean;
  /** modo prova: permitir pausar o áudio */
  pausarProva: boolean;
  /** quantos cartões novos por dia */
  novosPorDia: number;
  /** modo estudo: tocar o áudio sozinho ao abrir uma questão de listening ainda não respondida */
  tocarSozinho: boolean;
}
