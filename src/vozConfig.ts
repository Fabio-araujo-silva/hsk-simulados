// Configuração da voz sintética (ElevenLabs), compartilhada entre o servidor local (vite.config) e o app.
// O nome do arquivo em cache depende destes valores + do texto: mudar a voz gera arquivos novos.

export const VOZ_TTS = {
  /** voz pré-pronta "Sarah" (feminina, clara); com o modelo multilíngue fala mandarim */
  vozId: "EXAVITQu4vr4xnSDxMaL",
  modelo: "eleven_multilingual_v2",
  /** um pouco mais devagar que o normal: é para estudo */
  velocidade: 0.88,
  formato: "mp3_44100_64",
};

/** Texto que de fato vai para a síntese (lacuna vira pausa, rótulos A：/B： somem). */
export function textoParaFala(texto: string) {
  return texto
    .replace(/（＿＿）/g, "……")
    .replace(/(^|\n)\s*[AB][：:]/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export const chaveCacheTts = (texto: string) => `${VOZ_TTS.vozId}|${VOZ_TTS.modelo}|${VOZ_TTS.velocidade}|${textoParaFala(texto)}`;
