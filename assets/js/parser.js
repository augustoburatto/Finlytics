/* ============================================================
   Finlytics — leitura e normalização da planilha
   ============================================================ */
(function (global) {
  'use strict';

  /* Nomes aceitos para cada campo (comparados já normalizados). */
  var ALIAS = {
    descricao: ['descricao do gasto', 'descricao', 'descricao da despesa', 'desc', 'gasto', 'despesa',
                'item', 'historico', 'lancamento', 'detalhe', 'detalhes', 'nome', 'description'],
    valor: ['valor', 'valor r$', 'valor (r$)', 'valor gasto', 'vl', 'montante', 'preco', 'custo',
            'total', 'valor total', 'amount', 'value', 'debito'],
    categoria: ['categoria', 'categorias', 'cat', 'tipo de gasto', 'tipo de despesa',
                'classificacao', 'grupo', 'category', 'segmento', 'rubrica'],
    tipo: ['tipo', 'tipo de lancamento', 'tipo de movimento', 'tipo lancamento', 'natureza',
           'movimento', 'entrada/saida', 'entrada ou saida', 'receita/despesa', 'receita ou despesa',
           'debito/credito', 'd/c', 'fluxo', 'operacao', 'sinal'],
    mes: ['mes', 'mes de referencia', 'mes ref', 'competencia', 'mes/ano', 'month', 'periodo'],
    ano: ['ano', 'ano de referencia', 'exercicio', 'year'],
    data: ['data', 'data do gasto', 'dia', 'date', 'data lancamento', 'data de lancamento', 'vencimento']
  };

  function classificarCabecalho(celula) {
    var n = Util.normalizar(celula);
    if (!n) return null;
    for (var campo in ALIAS) {
      if (ALIAS[campo].indexOf(n) > -1) return campo;
    }
    // tentativa mais solta: começa com o alias
    for (var campo2 in ALIAS) {
      for (var i = 0; i < ALIAS[campo2].length; i++) {
        var a = ALIAS[campo2][i];
        if (a.length >= 3 && (n.indexOf(a) === 0 || n === a)) return campo2;
      }
    }
    return null;
  }

  /** Localiza a linha de cabeçalho e o mapa coluna→campo. */
  function detectarCabecalho(matriz) {
    var melhor = { indice: -1, mapa: null, pontos: 0 };
    var limite = Math.min(matriz.length, 20);
    for (var i = 0; i < limite; i++) {
      var linha = matriz[i] || [];
      var mapa = {}, pontos = 0, usados = {};
      for (var c = 0; c < linha.length; c++) {
        var campo = classificarCabecalho(linha[c]);
        if (campo && !usados[campo]) { mapa[campo] = c; usados[campo] = true; pontos++; }
      }
      // exige pelo menos descrição/valor ou 3 campos reconhecidos
      var valido = (usados.valor && (usados.descricao || usados.categoria)) || pontos >= 3;
      if (valido && pontos > melhor.pontos) melhor = { indice: i, mapa: mapa, pontos: pontos };
    }
    return melhor.indice > -1 ? melhor : null;
  }

  /** CSV simples (fallback quando a biblioteca XLSX não carregou). */
  function csvParaMatriz(texto) {
    var delim = ',';
    var primeira = texto.split(/\r?\n/)[0] || '';
    var cont = { ';': (primeira.match(/;/g) || []).length,
                 ',': (primeira.match(/,/g) || []).length,
                 '\t': (primeira.match(/\t/g) || []).length };
    if (cont[';'] > cont[','] && cont[';'] >= cont['\t']) delim = ';';
    else if (cont['\t'] > cont[','] && cont['\t'] > cont[';']) delim = '\t';

    var linhas = [], atual = [], campo = '', dentroAspas = false;
    for (var i = 0; i < texto.length; i++) {
      var ch = texto[i];
      if (dentroAspas) {
        if (ch === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; }
          else dentroAspas = false;
        } else campo += ch;
      } else if (ch === '"') dentroAspas = true;
      else if (ch === delim) { atual.push(campo); campo = ''; }
      else if (ch === '\n') { atual.push(campo); linhas.push(atual); atual = []; campo = ''; }
      else if (ch === '\r') { /* ignora */ }
      else campo += ch;
    }
    if (campo.length || atual.length) { atual.push(campo); linhas.push(atual); }
    return linhas;
  }

  function decodificarTexto(buffer) {
    var txt = new TextDecoder('utf-8').decode(buffer);
    // se aparecer o caractere de substituição, o arquivo provavelmente é ANSI/latin1
    if (txt.indexOf('�') > -1) {
      try { txt = new TextDecoder('windows-1252').decode(buffer); } catch (e) { /* mantém utf-8 */ }
    }
    return txt;
  }

  function lerArquivoBruto(arquivo) {
    return new Promise(function (resolve, reject) {
      var leitor = new FileReader();
      leitor.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
      leitor.onload = function (e) { resolve(e.target.result); };
      leitor.readAsArrayBuffer(arquivo);
    });
  }

  function extrairMatriz(arquivo, buffer) {
    var nome = (arquivo.name || '').toLowerCase();
    var ehTexto = /\.(csv|txt|tsv)$/.test(nome);

    if (typeof XLSX === 'undefined') {
      if (!ehTexto) {
        throw new Error('A biblioteca de leitura de Excel não carregou (verifique a conexão). ' +
                        'Enquanto isso, arquivos .csv continuam funcionando.');
      }
      return { matriz: csvParaMatriz(decodificarTexto(buffer)), aba: 'CSV', abas: ['CSV'] };
    }

    var wb;
    if (ehTexto) {
      // raw:true mantém tudo como texto: a conversão numérica é nossa, senão
      // a biblioteca interpretaria "45,90" como 4590 (vírgula = separador de milhar).
      wb = XLSX.read(decodificarTexto(buffer), { type: 'string', raw: true });
    } else {
      wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
    }
    if (!wb.SheetNames || !wb.SheetNames.length) throw new Error('A planilha não tem nenhuma aba.');

    // escolhe a aba com mais linhas preenchidas
    var melhorNome = wb.SheetNames[0], melhorMatriz = null, melhorTam = -1;
    wb.SheetNames.forEach(function (n) {
      var m = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false });
      if (m.length > melhorTam) { melhorTam = m.length; melhorMatriz = m; melhorNome = n; }
    });
    return { matriz: melhorMatriz || [], aba: melhorNome, abas: wb.SheetNames };
  }

  /**
   * Lê o arquivo e devolve
   * { linhas, ignoradas, motivos, aba, abas, colunas, totalLidas }
   */
  function lerArquivo(arquivo) {
    return lerArquivoBruto(arquivo).then(function (buffer) {
      var extraido = extrairMatriz(arquivo, buffer);
      var matriz = extraido.matriz || [];
      if (!matriz.length) throw new Error('A planilha está vazia.');

      var cab = detectarCabecalho(matriz);
      if (!cab) {
        throw new Error('Não encontrei as colunas esperadas. A planilha precisa ter um cabeçalho com ' +
                        '"Descrição do gasto", "Valor", "Categoria", "Mês" e "Ano".');
      }
      var mapa = cab.mapa;

      /* "Tipo" é ambíguo: muita gente chama a coluna de categoria assim.
         Olhamos os dados: se os valores não parecem receita/despesa, a coluna
         vira categoria (quando falta uma) ou é simplesmente ignorada. */
      var tipoReclassificado = null;
      if (mapa.tipo != null) {
        var amostra = 0, reconhecidos = 0;
        for (var t = cab.indice + 1; t < matriz.length && amostra < 80; t++) {
          var cel = (matriz[t] || [])[mapa.tipo];
          if (cel == null || String(cel).trim() === '') continue;
          amostra++;
          if (Util.paraTipo(cel)) reconhecidos++;
        }
        if (!amostra || reconhecidos / amostra < 0.5) {
          if (mapa.categoria == null) { mapa.categoria = mapa.tipo; tipoReclassificado = 'categoria'; }
          else tipoReclassificado = 'ignorada';
          delete mapa.tipo;
        }
      }

      var faltando = [];
      if (mapa.valor == null) faltando.push('Valor');
      if (mapa.descricao == null) faltando.push('Descrição do gasto');
      if (mapa.categoria == null) faltando.push('Categoria');
      if (mapa.mes == null && mapa.data == null) faltando.push('Mês');
      if (mapa.ano == null && mapa.data == null) faltando.push('Ano');
      if (faltando.length) {
        throw new Error('Coluna(s) não encontrada(s): ' + faltando.join(', ') +
                        '. Ajuste o cabeçalho da planilha e tente novamente.');
      }

      var linhas = [], ignoradas = 0;
      var motivos = { semValor: 0, semPeriodo: 0, vazia: 0, tipoIndefinido: 0 };
      var total = 0, contagem = { receita: 0, despesa: 0, investimento: 0 };

      for (var i = cab.indice + 1; i < matriz.length; i++) {
        var l = matriz[i] || [];
        var vazia = l.every(function (c) { return c == null || String(c).trim() === ''; });
        if (vazia) continue;
        total++;

        var descricao = mapa.descricao != null ? String(l[mapa.descricao] == null ? '' : l[mapa.descricao]).trim() : '';
        var categoria = mapa.categoria != null ? String(l[mapa.categoria] == null ? '' : l[mapa.categoria]).trim() : '';
        var valor = Util.paraNumero(mapa.valor != null ? l[mapa.valor] : null);

        var mes = mapa.mes != null ? Util.paraMes(l[mapa.mes]) : null;
        var ano = mapa.ano != null ? Util.paraAno(l[mapa.ano]) : null;

        if ((mes == null || ano == null) && mapa.data != null) {
          var d = Util.paraData(l[mapa.data]);
          if (d) { if (mes == null) mes = d.getMonth() + 1; if (ano == null) ano = d.getFullYear(); }
        }
        // "Mês" no formato 03/2025 também resolve o ano
        if (ano == null && mapa.mes != null) ano = Util.paraAno(l[mapa.mes]);

        if (valor == null) { ignoradas++; motivos.semValor++; continue; }
        if (mes == null || ano == null) { ignoradas++; motivos.semPeriodo++; continue; }
        if (!descricao && !categoria) { ignoradas++; motivos.vazia++; continue; }

        var tipo = null;
        if (mapa.tipo != null) {
          tipo = Util.paraTipo(l[mapa.tipo]);
          if (!tipo) motivos.tipoIndefinido++;
        }
        if (!tipo) tipo = 'despesa';             // sem coluna Tipo, tudo é despesa
        contagem[tipo]++;

        linhas.push(Store.montarLinha({
          descricao: descricao || '(sem descrição)',
          valor: Math.abs(valor),                // o sinal vem do tipo, não do número
          categoria: categoria || 'Sem categoria',
          mes: mes, ano: ano, tipo: tipo
        }, linhas.length));
      }

      if (!linhas.length) {
        throw new Error('Nenhuma linha válida foi encontrada. Confira se as colunas de valor, mês e ano estão preenchidas.');
      }

      return {
        linhas: linhas,
        ignoradas: ignoradas,
        motivos: motivos,
        totalLidas: total,
        contagem: contagem,
        receitas: contagem.receita,
        despesas: contagem.despesa,
        investimentos: contagem.investimento,
        comColunaTipo: mapa.tipo != null,
        tipoReclassificado: tipoReclassificado,
        aba: extraido.aba,
        abas: extraido.abas,
        colunas: Object.keys(mapa)
      };
    });
  }

  /** Remove duplicatas exatas (descrição + valor + categoria + mês + ano). */
  function removerDuplicadas(linhas) {
    var vistos = Object.create(null), saida = [], duplicadas = 0;
    linhas.forEach(function (l) {
      var k = Util.normalizar(l.descricao) + '|' + l.valor.toFixed(2) + '|' +
              Util.normalizar(l.categoria) + '|' + l.mes + '|' + l.ano + '|' + l.tipo;
      if (vistos[k]) { duplicadas++; return; }
      vistos[k] = 1;
      saida.push(l);
    });
    return { linhas: saida, duplicadas: duplicadas };
  }

  function reindexar(linhas) {
    return linhas.map(function (l, i) { return Store.montarLinha(l, i); });
  }

  /* ---------- modelo de planilha ---------- */

  var CABECALHO_MODELO = ['Descrição do gasto', 'Valor', 'Categoria', 'Mês', 'Ano', 'Tipo'];

  var EXEMPLO_MODELO = [
    ['Salário', 7500, 'Salário', 1, 2025, 'Receita'],
    ['Freelance', 1200, 'Renda extra', 1, 2025, 'Receita'],
    ['Aluguel', 2200, 'Moradia', 1, 2025, 'Despesa'],
    ['Supermercado', 986.45, 'Alimentação', 1, 2025, 'Despesa'],
    ['Conta de luz', 187.9, 'Moradia', 1, 2025, 'Despesa'],
    ['Combustível', 420, 'Transporte', 1, 2025, 'Despesa'],
    ['Plano de saúde', 640, 'Saúde', 1, 2025, 'Despesa'],
    ['Streaming', 55.9, 'Lazer', 1, 2025, 'Despesa'],
    ['Aporte Tesouro Direto', 1000, 'Renda fixa', 1, 2025, 'Investimento'],
    ['Compra de ações', 500, 'Ações', 1, 2025, 'Investimento']
  ];

  function baixarModelo() {
    if (typeof XLSX !== 'undefined') {
      var ws = XLSX.utils.aoa_to_sheet([CABECALHO_MODELO].concat(EXEMPLO_MODELO));
      ws['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 11 }];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
      XLSX.writeFile(wb, 'modelo-gastos-finlytics.xlsx');
      return 'xlsx';
    }
    var csv = [CABECALHO_MODELO.join(';')]
      .concat(EXEMPLO_MODELO.map(function (l) {
        return [l[0], String(l[1]).replace('.', ','), l[2], l[3], l[4], l[5]].join(';');
      })).join('\n');
    Util.baixarTexto(csv, 'modelo-gastos-finlytics.csv', 'text/csv');
    return 'csv';
  }

  /* ---------- dados de exemplo ---------- */

  function gerarExemplo() {
    var catalogo = [
      ['Moradia', ['Aluguel', 'Condomínio', 'Conta de luz', 'Conta de água', 'Internet fibra', 'Gás de cozinha', 'IPTU'], 1.0],
      ['Alimentação', ['Supermercado', 'Feira livre', 'Padaria', 'Açougue', 'Delivery iFood', 'Restaurante', 'Cafeteria'], 1.0],
      ['Transporte', ['Combustível', 'Estacionamento', 'Uber', 'Manutenção do carro', 'IPVA', 'Seguro do carro', 'Pedágio'], .8],
      ['Saúde', ['Plano de saúde', 'Farmácia', 'Consulta médica', 'Dentista', 'Academia', 'Exames'], .7],
      ['Educação', ['Mensalidade faculdade', 'Curso de inglês', 'Livros', 'Material escolar', 'Curso online'], .5],
      ['Lazer', ['Streaming', 'Cinema', 'Bar com amigos', 'Viagem fim de semana', 'Show', 'Jogos'], .7],
      ['Compras', ['Roupas', 'Eletrônicos', 'Presente', 'Casa e decoração', 'Calçados'], .6],
      ['Serviços', ['Assinatura de software', 'Telefonia móvel', 'Contador', 'Lavanderia', 'Seguro residencial'], .5],
      ['Pets', ['Ração', 'Veterinário', 'Banho e tosa', 'Petisco'], .35],
      ['Impostos e taxas', ['Tarifa bancária', 'Anuidade cartão', 'Taxa de serviço'], .3]
    ];
    var fixos = {
      'Aluguel': 2200, 'Condomínio': 540, 'Plano de saúde': 640, 'Internet fibra': 119.9,
      'Streaming': 55.9, 'Mensalidade faculdade': 890, 'Telefonia móvel': 79.9, 'Academia': 129.9
    };
    var faixa = {
      'Moradia': [90, 420], 'Alimentação': [45, 780], 'Transporte': [35, 620], 'Saúde': [60, 520],
      'Educação': [70, 480], 'Lazer': [30, 520], 'Compras': [60, 1400], 'Serviços': [40, 360],
      'Pets': [35, 280], 'Impostos e taxas': [18, 180]
    };

    var anoAtual = new Date().getFullYear();
    var mesAtual = new Date().getMonth() + 1;
    var linhas = [];
    var semente = 20250926;
    function rnd() { semente = (semente * 9301 + 49297) % 233280; return semente / 233280; }
    function receita(desc, valor, categoria, mes, ano) { linhas.push([desc, valor, categoria, mes, ano, 'receita']); }
    function aporte(desc, valor, categoria, mes, ano) { linhas.push([desc, valor, categoria, mes, ano, 'investimento']); }

    [anoAtual - 1, anoAtual].forEach(function (ano, idxAno) {
      var mesLimite = ano === anoAtual ? mesAtual : 12;
      for (var mes = 1; mes <= mesLimite; mes++) {
        /* ---- receitas do mês ---- */
        var reajusteRenda = idxAno === 1 ? 1.08 : 1;
        receita('Salário', Math.round(21000 * reajusteRenda * 100) / 100, 'Salário', mes, ano);
        receita('Salário cônjuge', Math.round(8500 * reajusteRenda * 100) / 100, 'Salário', mes, ano);
        if (rnd() < .55) receita('Projeto freelance', Math.round((800 + rnd() * 3600) * 100) / 100, 'Renda extra', mes, ano);
        receita('Rendimento da reserva', Math.round((180 + rnd() * 520) * 100) / 100, 'Investimentos', mes, ano);
        if (mes === 12) receita('13º salário', Math.round(29500 * reajusteRenda * 100) / 100, 'Salário', mes, ano);
        if (mes === 3) receita('Restituição do IR', Math.round((900 + rnd() * 2200) * 100) / 100, 'Outras receitas', mes, ano);
        if (rnd() < .18) receita('Venda de usados', Math.round((120 + rnd() * 900) * 100) / 100, 'Outras receitas', mes, ano);

        /* ---- aportes do mês ---- */
        aporte('Aporte Tesouro Direto', Math.round(1800 * reajusteRenda * 100) / 100, 'Renda fixa', mes, ano);
        aporte('Previdência privada', 800, 'Previdência', mes, ano);
        if (rnd() < .7) aporte('Compra de ações', Math.round((400 + rnd() * 1600) * 100) / 100, 'Ações', mes, ano);
        if (rnd() < .5) aporte('Fundo imobiliário', Math.round((300 + rnd() * 900) * 100) / 100, 'Fundos imobiliários', mes, ano);
        if (mes === 12) aporte('Aporte extra do 13º', Math.round(9000 * reajusteRenda * 100) / 100, 'Renda fixa', mes, ano);

        /* ---- despesas do mês ---- */
        // sazonalidade: dezembro e julho gastam mais
        var sazonal = (mes === 12 ? 1.35 : mes === 7 ? 1.18 : mes === 1 ? 1.12 : 1) * (idxAno === 1 ? 1.07 : 1);
        catalogo.forEach(function (c) {
          var categoria = c[0], itens = c[1], freq = c[2];
          itens.forEach(function (item) {
            var fixo = fixos[item];
            if (fixo) {
              var reajuste = idxAno === 1 ? 1.06 : 1;
              linhas.push([item, Math.round(fixo * reajuste * 100) / 100, categoria, mes, ano]);
              return;
            }
            var repeticoes = rnd() < freq ? 1 + Math.floor(rnd() * 3) : 0;
            for (var r = 0; r < repeticoes; r++) {
              var f = faixa[categoria] || [40, 300];
              var v = (f[0] + rnd() * (f[1] - f[0])) * sazonal;
              if (rnd() > .97) v *= 2.6; // eventual gasto atípico
              linhas.push([item, Math.round(v * 100) / 100, categoria, mes, ano]);
            }
          });
        });
      }
    });

    // ordena por período para a base nascer cronológica
    linhas.sort(function (a, b) { return (a[4] * 100 + a[3]) - (b[4] * 100 + b[3]); });
    return linhas.map(function (l, i) {
      return Store.montarLinha({
        descricao: l[0], valor: l[1], categoria: l[2], mes: l[3], ano: l[4],
        tipo: l[5] || 'despesa'
      }, i);
    });
  }

  global.Parser = {
    lerArquivo: lerArquivo,
    removerDuplicadas: removerDuplicadas,
    reindexar: reindexar,
    baixarModelo: baixarModelo,
    gerarExemplo: gerarExemplo
  };
})(window);
