/** As regras do HSKK 中级, em português, conferidas com os cadernos oficiais (样题 2023 e provas H81001–H81003). */
export function PaginaRegras() {
  return (
    <div className="regras-pagina">
      <h1>
        Regras do HSKK 中级 <span className="zh">HSK口语（中级）</span>
      </h1>
      <p>
        O <b>HSKK</b> (汉语水平口语考试) é a parte <b>oral</b> do HSK — uma prova separada da escrita, com inscrição e certificado próprios. Tem três
        níveis (初级, 中级, 高级). O <b>中级 (intermediário)</b> costuma ser feito por quem está no HSK 3–4; a descrição oficial fala em cerca de 900
        palavras de uso frequente. Você fala num microfone (no computador ou num gravador) e <b>a gravação é corrigida depois</b> — não há examinador
        conversando com você.
      </p>

      <h2>Estrutura: 14 questões</h2>
      <table className="tabela regras-tabela">
        <thead>
          <tr>
            <th>parte</th>
            <th>questões</th>
            <th>o que fazer</th>
            <th>tempo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <b>1</b> <span className="zh">听后重复</span>
              <br />
              <small>ouvir e repetir</small>
            </td>
            <td>1–10</td>
            <td>
              Você ouve uma frase <b>uma única vez</b> e repete. No formato atual a frase é seguida de um “嘀” (bip) e você tem ~10 s; nas provas antigas
              não há bip e são ~7 s.
            </td>
            <td>3 min (provas antigas) · 5 min (样题 de 2023)</td>
          </tr>
          <tr>
            <td>
              <b>2</b> <span className="zh">看图说话</span>
              <br />
              <small>falar sobre a figura</small>
            </td>
            <td>11–12</td>
            <td>Duas figuras no caderno. Para cada uma, fale sobre o que vê: quem, onde, fazendo o quê, como se sentem, o que você pensa.</td>
            <td>2 min cada (4 min)</td>
          </tr>
          <tr>
            <td>
              <b>3</b> <span className="zh">回答问题</span>
              <br />
              <small>responder à pergunta</small>
            </td>
            <td>13–14</td>
            <td>Duas perguntas impressas no caderno (com pinyin). Responda dando sua opinião, razões e exemplos.</td>
            <td>2 min cada (4 min)</td>
          </tr>
        </tbody>
      </table>
      <ul>
        <li>
          <b>Preparação: 10 minutos</b>, depois do 第一部分, para as questões 11–14 juntas. Dá para escrever tópicos no caderno (题本) e olhar para eles
          enquanto fala.
        </li>
        <li>
          <b>Duração total:</b> ~21 min nas provas antigas (capa: 听后重复 3 分钟) e ~23 min no 样题 atual (capa: 听后重复 5 分钟), sempre contando os 10
          min de preparação.
        </li>
        <li>
          <b>Abertura:</b> antes das questões o áudio pergunta seu nome, sua nacionalidade e seu número de inscrição (序号). Responda em chinês — não
          vale nota.
        </li>
        <li>O áudio é que manda: cada resposta começa e termina quando a gravação da prova diz. Não dá para pausar nem ouvir de novo.</li>
      </ul>

      <h2>Nota</h2>
      <ul>
        <li>
          Nota máxima <b>100</b>, aprovação com <b>60</b>. A correção é feita por avaliadores que ouvem a sua gravação.
        </li>
        <li>
          <b>Não existe rubrica oficial publicada</b> com pontos por parte ou por faixa (评分标准 por 档次) para o HSKK 中级 — procuramos e não
          encontramos. A correção oficial é <b>holística</b>.
        </li>
      </ul>
      <p>Na prática, os critérios que professores e materiais de preparação usam (orientação, <b>não</b> regra oficial):</p>
      <ul>
        <li>
          <b>Completude</b> — na parte 1, repetir a frase inteira; nas partes 2–3, responder ao que foi pedido e falar durante os 2 minutos (silêncio
          longo pesa).
        </li>
        <li>
          <b>Fluência</b> — poucas pausas longas e hesitações; frases ligadas com conectivos (然后、因为……所以、虽然……但是、首先……其次……最后).
        </li>
        <li>
          <b>Pronúncia e tons</b> — iniciais/finais claras e tons certos (inclusive sandhi de 一 e 不).
        </li>
        <li>
          <b>Gramática</b> — frases corretas; tudo bem usar estruturas simples, desde que certas.
        </li>
        <li>
          <b>Vocabulário</b> — variedade de palavras adequadas ao nível (HSK 3–4), sem repetir sempre as mesmas.
        </li>
      </ul>

      <h2>O que este app mede (e o que não mede)</h2>
      <ul>
        <li>
          <b>Parte 1:</b> a sua gravação é transcrita pelo reconhecimento de voz (ElevenLabs Scribe) e comparada caractere a caractere com a frase. O %
          mostra quantos caracteres ele entendeu — um bom sinal de pronúncia inteligível e repetição completa, mas não é a nota oficial (o
          reconhecimento às vezes erra, e homófonos como 他/她 contam como certos).
        </li>
        <li>
          <b>Partes 2 e 3:</b> você vê a transcrição do que disse, quantos caracteres falou e o ritmo (caracteres/min), e compara com as
          respostas-modelo. As respostas-modelo foram <b>geradas para estudo</b> (nível HSK 3 e HSK 4) — não são oficiais.
        </li>
      </ul>

      <h2>Dicas</h2>
      <ul>
        <li>
          <b>Parte 1:</b> escute pensando no <i>sentido</i> e em blocos (别害怕 / 去试试看), não sílaba por sílaba. Se esquecer um pedaço, repita o
          resto — meia frase vale mais que silêncio.
        </li>
        <li>
          <b>Parte 2:</b> um roteiro que funciona: o que é a cena → quem são e o que fazem → como se sentem / o que aconteceu antes → uma experiência
          sua parecida → frase de fechamento.
        </li>
        <li>
          <b>Parte 3:</b> resposta direta (我觉得……) → 2–3 razões com exemplos da sua vida → conclusão (总之……). Se acabar o assunto, dê mais um
          exemplo.
        </li>
        <li>
          <b>Preparação:</b> anote palavras-chave e conectivos, não o texto inteiro — não dá tempo de ler um texto pronto e soa artificial.
        </li>
      </ul>
      <p className="fonte-regras">
        Fontes: capas dos cadernos (样题 de 2023 do 教育部中外语言交流合作中心; H81001, H81002 e H81003 do 国家汉办), folheto HSK口试 e folha do
        Confucius Institute UK (nota 100 / aprovação 60). Detalhes de cada prova no README.
      </p>
    </div>
  );
}
