import { dispensaAvisoBloqueio, useAudioBloqueado } from "../audio";

/**
 * Aviso fixo quando o navegador recusou tocar um áudio (comum no iPhone: som só a partir de um toque).
 * O botão toca de onde o app ia tocar — inclusive o fim do trecho — já que agora é um toque de verdade.
 */
export function AvisoAudioBloqueado() {
  const audio = useAudioBloqueado();
  if (!audio) return null;
  return (
    <div className="aviso-bloqueio" role="alert">
      <span>O navegador bloqueou o som até você tocar na tela.</span>
      <button className="pri" onClick={() => void audio.continua()}>
        ▶ tocar
      </button>
      <button className="fecha" onClick={dispensaAvisoBloqueio} title="fechar" aria-label="fechar">
        ✕
      </button>
    </div>
  );
}
