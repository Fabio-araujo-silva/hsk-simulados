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
/**
 * imagem:     casar com uma figura do grupo (A–F)
 * imagem-vf:  uma figura + o que se ouve/lê → certo ou errado (HSK 1/2)
 * imagem-abc: escolher entre três figuras A/B/C (HSK 1/2)
 */
export type TipoQuestao = "imagem" | "imagem-vf" | "imagem-abc" | "vf" | "abc" | "pareamento" | "lacuna" | "ordenar" | "hanzi";

export type Nivel = 1 | 2 | 3 | 4 | 5 | 6;

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
  /** imagem-vf: a figura da questão */
  imagem?: string;
  /** imagem-abc: as três figuras */
  imagens?: Record<string, string>;
  /** imagem-vf da leitura: a palavra impressa ao lado da figura */
  palavra?: Frase;
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
  nivel: Nivel;
  titulo: string;
  origem?: string;
  /** de onde veio o texto do áudio: oficial (听力材料) ou transcrito do áudio original */
  transcricao?: "oficial" | "audio" | null;
  audio?: { src: string; duracao: number } | null;
  grupos: Record<string, Grupo>;
  roteiro: Segmento[] | null;
  questoes: Questao[];
}

/** Um item de um exemplo (例如) do caderno — ver scripts/exemplos.py. */
export interface ItemExemplo {
  /** índices das falas do segmento "exemplo" do roteiro que pertencem a este item */
  falas?: number[];
  /** letra da figura do grupo do bloco (prova.grupos[bloco].imagens) */
  figura?: string;
  texto?: Frase;
  /** ★ afirmação (certo/errado) */
  afirmacao?: Frase;
  pergunta?: Frase;
  opcoes?: Record<string, Frase>;
  /** escrita: peças para ordenar, frase completa, partes da frase com o caractere */
  pecas?: Frase[];
  frase?: Frase;
  antes?: string;
  depois?: string;
  pinyin?: string;
  /** letra, certo/errado ou o caractere/frase da escrita (sem resposta: só a explicação) */
  resposta?: string | boolean;
  /** palavra realçada no texto (a lacuna já preenchida) */
  destaque?: string;
  explica: string;
  /** dado = tirado das provas · deduzido = a resposta sai do texto · conferir = texto do caderno padrão que não está nos dados */
  origem: "dado" | "deduzido" | "conferir";
  conferir?: boolean;
}

/** Exemplo do início de um bloco da folha (public/conteudo/exemplos.json, gerado por scripts/exemplos.py). */
export interface Exemplo {
  parte: string;
  /** chave do bloco na folha: o grupo ("L1a", "R2b") ou a parte ("L2") */
  bloco: string;
  /** índice do segmento "exemplo" no roteiro da prova (falas e trecho do áudio vêm de lá) */
  roteiro?: number;
  itens: ItemExemplo[];
}

/** nível ("1", "2", "3") → exemplos */
export type Exemplos = Record<string, Exemplo[]>;

export interface ResumoProva {
  id: string;
  nivel: Nivel;
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

/** Uma palavra da aba Vocabulário (public/conteudo/vocabulario.json, gerado por scripts/vocabulario.py). */
export interface PalavraVocab {
  hz: string;
  py: string;
  pt: string;
  nivel: 1 | 2 | 3;
  /** posição (1, 2, 3…) na lista do nível */
  n: number;
}

// ------------------------------------------------------------ estado do usuário

export type Modo = "prova" | "estudo";

export interface Resposta {
  valor: string | boolean | null;
  certa: boolean;
  /** usuário marcou manualmente como correta (ex.: outra ordem válida no "ordenar") */
  manual?: boolean;
  em: number;
  /** modo estudo por blocos: respondida, mas o bloco ainda não foi corrigido (não entra em nota nenhuma) */
  pendente?: boolean;
}

/** fogo = ponho a mão no fogo · acho = acho que sei · gato = pulo do gato · nada = não faço ideia */
export type Rotulo = "fogo" | "acho" | "gato" | "nada";

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
  /** modo prova: o tempo foi pausado ou o áudio voltado / tocado em outra velocidade (o exame real não deixa) */
  comAjuda?: boolean;
  /** modo prova: quanto você sabia de cada questão (marcado na prova, ajustável na correção) */
  rotulos?: Record<number, Rotulo>;
  /** palavras consultadas no hover por questão (sugestões de cartões) */
  consultas?: Record<number, string[]>;
  /** modo estudo por blocos: grupos (ex.: "R1a") já corrigidos — antes disso as respostas do bloco ficam ocultas */
  blocosCorrigidos?: Record<string, boolean>;
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

/** marcação de uma palavra na aba Vocabulário: k = acertei, x = errei */
export type MarcaVocab = "k" | "x";

/** Estado da aba Vocabulário (salvo junto com o resto do progresso). */
export interface EstadoVocab {
  /** "汉字|pinyin" → marcação (sem marcação = ainda não revisada) */
  marcas: Record<string, MarcaVocab>;
  /** pinyin visível em todos os cartões (o significado continua tampado) */
  pinyinSempre: boolean;
  /** última alteração (ms): ao mesclar dois progressos, fica o vocabulário alterado por último */
  atualizado: number;
}

// --------------------------------------------------------- Quick Listen 🔥

/** Opções do Quick Listen (ficam na Config). As lacunas são sempre digitadas (hanzi ou pinyin). */
export interface ConfigQuick {
  /** 0 = qualquer prova (HSK 1–3) */
  nivel: 0 | 1 | 2 | 3;
  /** 30 s para responder cada áudio (false = sem tempo) */
  tempo: boolean;
}

/** Uma rodada terminada do Quick Listen (5 áudios). */
export interface SessaoQuick {
  id: string;
  /** quando terminou (ms) */
  em: number;
  atualizado: number;
  nivel: 0 | 1 | 2 | 3;
  tempo: boolean;
  pontos: number;
  /** lacunas certas / lacunas da rodada */
  certas: number;
  total: number;
  /** questões usadas (para não repetir logo) e o placar de cada */
  itens: { prova: string; n: number; certas: number; total: number }[];
}

export interface EstadoQuick {
  sessoes: Record<string, SessaoQuick>;
}

export interface Config {
  traducao: boolean;
  pinyin: boolean;
  velocidade: number;
  /** modo estudo: mostrar a transcrição do áudio antes de responder */
  transcricaoAntes: boolean;
  /** modo prova: liberar os controles de treino (pausar o tempo; no listening, voltar e velocidade) */
  pausarProva: boolean;
  /** modo prova: velocidade do áudio do listening (só vale com os controles liberados) */
  velocidadeProva?: number;
  /** quantos cartões novos por dia */
  novosPorDia: number;
  /** modo estudo: tocar o áudio sozinho ao abrir uma questão de listening ainda não respondida */
  tocarSozinho: boolean;
  /** último nível escolhido na tela inicial */
  nivel?: Nivel;
  /** HSK 1: mostrar pinyin (como no caderno real); false = esconder */
  pinyinHsk1?: boolean;
  /** modo estudo: questões que dividem as mesmas alternativas (ex.: 41–45) são corrigidas juntas, no fim do bloco */
  porBlocos?: boolean;
  /** velocidade de reprodução da voz sintética (ElevenLabs), independente da do áudio original */
  velocidadeVoz?: number;
  /** aba Vocabulário: último filtro de nível (0 = HSK 1–3) */
  vocabNivel?: 0 | 1 | 2 | 3;
  /** Quick Listen 🔥: nível, tempo e jeito de responder da última rodada */
  quick?: ConfigQuick;
}
