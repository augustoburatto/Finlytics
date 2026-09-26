# Finlytics · Análise Financeira

Painel de análise de gastos 100% estático: você carrega uma planilha e o site monta dashboards, tabelas e análises automáticas. **Não existe servidor nem banco de dados** — o arquivo é lido dentro do navegador e os dados ficam apenas no cache local (`localStorage`), com um botão para apagar tudo.

---

## Como publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `finlytics`).
2. Envie todos os arquivos desta pasta para a raiz do repositório:

```bash
git init
git add .
git commit -m "Finlytics: painel de análise financeira"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/finlytics.git
git push -u origin main
```

3. No GitHub, vá em **Settings → Pages** e em *Build and deployment* escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`. Salve.
4. Em um ou dois minutos o site estará em `https://SEU-USUARIO.github.io/finlytics/`.

Não é preciso build, npm ou qualquer dependência instalada. O arquivo `.nojekyll` evita que o GitHub Pages processe a pasta `assets` com Jekyll.

### Rodar localmente

Abrir o `index.html` direto no navegador já funciona. Para um ambiente mais próximo do real:

```bash
python -m http.server 8000
```

E acesse `http://localhost:8000`.

---

## Formato da planilha

Aceita `.xlsx`, `.xls` e `.csv`. A ordem das colunas não importa e variações de nome são reconhecidas.

| Coluna | Obrigatória | Observações |
|---|---|---|
| Descrição do gasto | sim | também aceita *Descrição*, *Gasto*, *Despesa*, *Histórico*, *Item* |
| Valor | sim | aceita `1.234,56`, `R$ 1.234,56`, `1234.56`, `(80,00)` para negativos |
| Categoria | sim | também aceita *Classificação*, *Grupo*, *Rubrica*, *Tipo de gasto* |
| Mês | sim | `1`–`12`, `Jan`, `Janeiro`, `03/2025` ou uma data |
| Ano | sim | `2025` ou `25` |
| **Tipo** | não | `Receita`/`Despesa`, `Entrada`/`Saída`, `Crédito`/`Débito`, `C`/`D`, `+`/`−`. Ativa fluxo de caixa e saldo |
| Data | não | se existir, preenche mês e ano automaticamente |

### A coluna Tipo (receita/despesa)

É opcional e muda o painel inteiro quando existe:

- **sem a coluna** — tudo é despesa e o site funciona exatamente como antes (planilhas antigas continuam valendo);
- **com a coluna** — surgem a aba **Fluxo de caixa**, o filtro **Tipo** (tudo / receitas / despesas) e os indicadores de receitas, saldo e taxa de poupança.

Detalhes do comportamento:

- o sinal vem do tipo, não do número: `-150` numa linha marcada como despesa continua sendo uma saída de R$ 150;
- linha com tipo em branco ou irreconhecível é tratada como despesa, e o aviso de importação informa quantas foram;
- se a coluna chamada "Tipo" na verdade guarda categorias (`Moradia`, `Lazer`…), o app percebe pelos valores e a usa como categoria, avisando na tela;
- análises de gasto (Pareto, mapa de calor, metas, recorrentes, outliers, categoria líder) consideram **apenas despesas**. Filtrando só receitas, esses mesmos painéis passam a analisar as receitas.

Detalhes do processamento:

- o cabeçalho é procurado nas 20 primeiras linhas, então títulos ou logos acima da tabela não atrapalham;
- a aba com mais linhas é usada quando o arquivo tem várias;
- CSV em UTF-8 ou ANSI (Windows-1252), com `;`, `,` ou tabulação como separador;
- linhas sem valor numérico ou sem mês/ano válidos são ignoradas e reportadas no aviso de importação;
- valores são tratados em módulo (gastos sempre positivos).

Use o botão **Baixar modelo** na tela inicial para gerar uma planilha já no formato correto.

---

## O que o painel entrega

**Indicadores** — adaptam-se à planilha. Sem receitas: total gasto, média mensal, variação do último mês, nº de lançamentos, ticket médio e mediana, categoria líder e projeção de fechamento do ano. Com receitas: receitas, despesas, saldo do período, taxa de poupança, despesa média mensal, variação, categoria líder e projeção.

**Visão geral** — evolução mensal com média móvel de 3 meses (ou gráfico de fluxo de caixa, quando há receitas), distribuição por categoria em rosca, curva de gasto/saldo acumulado, tabela-resumo por categoria e um bloco de análises automáticas.

**Fluxo de caixa** (aba que aparece quando a planilha tem receitas) — entradas, saídas e resultado do período, melhor e pior mês, gráfico de saldo mensal com caixa acumulado, tabela mês a mês (entradas, saídas, resultado, caixa acumulado e taxa de poupança) e as maiores receitas por categoria e por lançamento.

**Análises** — curva de Pareto (quais categorias formam 80% do gasto), top 10 maiores lançamentos, comparativo entre anos mês a mês, mapa de calor categoria × mês, detecção de gastos recorrentes (custo fixo estimado) e de lançamentos atípicos (z-score por categoria).

**Lançamentos** — tabela completa com ordenação por qualquer coluna, paginação configurável, coluna Tipo com entrada/saída destacadas, participação de cada linha e saldo da página.

**Metas** — orçamento mensal por categoria com barra de progresso, folga/estouro consolidado e botão para sugerir metas a partir da média atual. Ficam salvas no cache.

**Filtros combinados** — tipo (receita/despesa), ano, mês, categoria, faixa de valor e busca textual; tudo recalcula em conjunto e vale para todas as abas e exportações.

**Exportações** — Excel com três abas (lançamentos, resumo por categoria, resumo por mês) ou cinco quando há receitas (+ receitas por categoria e fluxo de caixa mês a mês), CSV do recorte filtrado, backup JSON da base completa, PNG de cada gráfico e impressão/PDF com layout próprio.

**Outros** — tema claro/escuro persistido, layout responsivo, arrastar e soltar o arquivo em qualquer ponto da página, dados de exemplo para explorar sem planilha, atalhos `T` (tema) e `F` (busca).

---

## Privacidade e cache

- Nenhum dado é enviado para servidores: a leitura da planilha acontece no navegador.
- Os lançamentos ficam em `localStorage` (chaves `finlytics.dados.v1` e `finlytics.prefs.v1`) e são restaurados ao reabrir a página. Bases salvas antes da coluna Tipo são lidas normalmente: todos os lançamentos entram como despesa.
- O botão **Limpar dados** apaga os lançamentos do cache, com opção de apagar também as metas.
- O limite prático do `localStorage` é de ~5 MB, o que comporta na casa de dezenas de milhares de lançamentos. Bases maiores continuam funcionando na sessão, mas o app avisa que não caberão no cache.

## Estrutura

```
index.html
assets/
  css/styles.css
  js/utils.js       formatação pt-BR, parsing de valores/datas, cores
  js/store.js       cache local (dados + preferências)
  js/parser.js      leitura da planilha, mapeamento de colunas, modelo e dados de exemplo
  js/ui.js          toasts, modais, multiselect
  js/graficos.js    configurações do Chart.js
  js/app.js         estado, filtros, agregações e renderização
```

Bibliotecas carregadas por CDN: [SheetJS](https://sheetjs.com) para leitura/escrita de Excel e [Chart.js](https://www.chartjs.org) para os gráficos. Sem internet, arquivos `.csv` continuam funcionando.
