import { useEffect, useState } from "react";
import { carregaIndice } from "../dados";
import { CONTATO, MIDIA_URL, MODO_PUBLICO } from "../publico";
import type { ResumoProva } from "../tipos";

// Origem do material, direitos autorais e privacidade — no site público é linkada no rodapé de todas as páginas.
// O texto é honesto de propósito: citar a origem e não cobrar nada diminui o risco, mas não é uma licença.

/** contato do responsável (VITE_CONTATO): e-mail vira mailto:, o resto (ex.: link das issues do GitHub) vira link */
function Contato() {
  if (!CONTATO) return <>o responsável pelo site</>;
  const email = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(CONTATO);
  return (
    <a href={email ? `mailto:${CONTATO}` : CONTATO} target={email ? undefined : "_blank"} rel="noreferrer">
      {CONTATO}
    </a>
  );
}

export function PaginaSobre() {
  const [provas, setProvas] = useState<ResumoProva[] | null>(null);
  useEffect(() => {
    carregaIndice()
      .then(setProvas)
      .catch(() => setProvas([]));
  }, []);

  return (
    <div className="config sobre">
      <h1>Sobre</h1>
      <section>
        <h2>De onde vêm as provas</h2>
        <p>
          As provas do HSK 1–3 e do HSKK 中级 são exames reais e amostras oficiais, com caderno, gabarito e áudio originais. Elas são material do{" "}
          <b>Hanban / Center for Language Education and Cooperation</b> e do <b>Chinese Testing International (汉考国际, CTI)</b> — os direitos são
          deles, e este site <b>não tem autorização</b> deles. Ele é gratuito, não comercial, feito só para estudo e cita a origem de cada prova
          (lista abaixo), mas isso não é uma licença.
        </p>
        <p>
          Se você é detentor dos direitos de algum material e quer que ele saia do ar, escreva para <Contato /> — ele é retirado.
        </p>
        {provas && provas.length > 0 && (
          <details>
            <summary>Origem de cada prova do HSK 1–3 ({provas.length})</summary>
            <ul className="lista-origens">
              {provas.map((p) => (
                <li key={p.id}>
                  {p.titulo} — <small>{p.origem ?? "origem não registrada"}</small>
                </li>
              ))}
            </ul>
            <p>
              <small>As provas do HSKK são as amostras oficiais (样题) e provas publicadas pelo CTI.</small>
            </p>
          </details>
        )}
      </section>
      <section>
        <h2>O que foi feito aqui</h2>
        <p>
          Traduções para o português, explicações, texto do áudio sincronizado, glossário, respostas-modelo do HSKK e a revisão espaçada foram
          preparados para estudo e <b>não são oficiais</b>.
        </p>
        <p>
          Dicionário de apoio: <a href="https://www.mdbg.net/chinese/dictionary?page=cedict">CC-CEDICT</a>, licença{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a> — o glossário derivado dele segue a mesma licença. Listas de
          vocabulário HSK 2.0 do projeto complete-hsk-vocabulary.
        </p>
      </section>
      {MODO_PUBLICO && (
        <section>
          <h2>Privacidade</h2>
          <p>
            Guardamos o seu <b>e-mail</b> (para entrar), o seu <b>progresso de estudo</b> e <b>quantas vezes por dia</b> a sua conta abre o site
            (só a contagem, dos últimos 180 dias — para sabermos quanto o site é usado). Se você entrar com o Google, recebemos dele só o seu e-mail
            e nome. As gravações da sua voz no HSKK não saem do seu navegador. Os serviços que fazem o site funcionar — Supabase (contas e banco),
            Vercel (o site{MIDIA_URL ? "" : ", com o áudio e as figuras"}), Cloudflare (a verificação anti-robô{MIDIA_URL ? ", o áudio e as figuras" : ""}), Google (se
            você entrar por ele) e o serviço que envia o e-mail de acesso — registram dados
            técnicos, como o endereço IP e o navegador, nos próprios registros.
          </p>
          <p>
            Para apagar a sua conta e todo o seu progresso, escreva para <Contato /> com o e-mail da conta.
          </p>
        </section>
      )}
    </div>
  );
}
