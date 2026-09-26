/* ============================================================
   Finlytics — aplicação principal
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, ctx) { return (ctx || document).querySelector(s); };
  var $$ = function (s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); };

  var estado = {
    linhas: [],
    meta: {},
    filtros: { anos: [], meses: [], categorias: [], busca: '', min: null, max: null, tipo: 'todos' },
    ordem: { campo: 'periodo', dir: 'desc' },
    pagina: 1,
    porPagina: 25,
    metas: {},
    aba: 'visao',
    cacheFiltrado: null
  };

  var msAno = null, msCategoria = null, prefs = Store.carregarPrefs();

  /* ============================================================
     Inicialização
     ============================================================ */
  function iniciar() {
    aplicarTema(prefs.tema || 'dark');
    estado.metas = prefs.metas || {};
    estado.porPagina = prefs.porPagina || 25;
    var sel = $('#por-pagina');
    if (sel) sel.value = String(estado.porPagina);

    montarChipsMeses();
    montarChipsTipo();
    montarMultiSelects();
    ligarEventos();

    if (!Store.disponivel) {
      UI.toast('Cache indisponível', 'O navegador bloqueou o armazenamento local. Os dados vão funcionar nesta sessão, mas não serão lembrados ao recarregar.', 'alerta', 7000);
    }

    var salvo = Store.carregarDados();
    if (salvo && salvo.linhas.length) {
      estado.linhas = salvo.linhas;
      estado.meta = salvo.meta || {};
      mostrarPainel();
      UI.toast('Dados restaurados do cache',
        Util.inteiro(estado.linhas.length) + ' lançamentos de "' + (estado.meta.arquivo || 'planilha') + '".', 'sucesso');
    }

    if (typeof XLSX === 'undefined') {
      UI.toast('Biblioteca Excel não carregou', 'Sem internet no momento: arquivos .csv continuam funcionando normalmente.', 'alerta', 7000);
    }
  }

  /* ============================================================
     Tema
     ============================================================ */
  function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    prefs.tema = tema;
    Store.salvarPrefs(prefs);
  }

  function alternarTema() {
    aplicarTema(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    if (estado.linhas.length) renderizar();
  }

  /* ============================================================
     Eventos
     ============================================================ */
  function ligarEventos() {
    $('#btn-tema').addEventListener('click', alternarTema);

    var input = $('#input-arquivo');
    $('#btn-escolher').addEventListener('click', function (e) { e.stopPropagation(); input.click(); });
    $('#btn-nova-planilha').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files && input.files[0]) processarArquivo(input.files[0]);
      input.value = '';
    });

    var dz = $('#dropzone');
    dz.addEventListener('click', function () { input.click(); });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('sobre'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('sobre'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) processarArquivo(f);
    });
    // solta o arquivo em qualquer lugar da página
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && !$('#tela-painel').classList.contains('oculto')) processarArquivo(f);
    });

    $('#btn-modelo').addEventListener('click', function (e) {
      e.stopPropagation();
      var tipo = Parser.baixarModelo();
      UI.toast('Modelo baixado', 'Arquivo ' + tipo.toUpperCase() + ' com as colunas esperadas e exemplos.', 'sucesso');
    });
    $('#btn-exemplo').addEventListener('click', function (e) {
      e.stopPropagation();
      carregarDados(Parser.gerarExemplo(), { arquivo: 'Dados de exemplo', importadoEm: new Date().toISOString(), exemplo: true });
      UI.toast('Dados de exemplo carregados', 'Base fictícia de dois anos para você explorar o painel.', 'sucesso');
    });

    $('#btn-limpar').addEventListener('click', confirmarLimpeza);

    // exportação
    var wrap = $('#wrap-exportar'), menu = $('#menu-exportar');
    $('#btn-exportar').addEventListener('click', function (e) {
      e.stopPropagation(); menu.classList.toggle('aberto');
    });
    document.addEventListener('click', function () { menu.classList.remove('aberto'); });
    $$('#menu-exportar .menu-item').forEach(function (b) {
      b.addEventListener('click', function () { menu.classList.remove('aberto'); exportar(b.dataset.exportar); });
    });

    // filtros
    $('#f-busca').addEventListener('input', Util.debounce(function (e) {
      estado.filtros.busca = e.target.value; estado.pagina = 1; renderizar();
    }, 260));
    ['#f-min', '#f-max'].forEach(function (sel) {
      $(sel).addEventListener('input', Util.debounce(function () {
        var min = parseFloat($('#f-min').value), max = parseFloat($('#f-max').value);
        estado.filtros.min = isFinite(min) ? min : null;
        estado.filtros.max = isFinite(max) ? max : null;
        estado.pagina = 1; renderizar();
      }, 320));
    });
    $('#btn-limpar-filtros').addEventListener('click', function () { limparFiltros(); });

    // abas
    $$('.aba').forEach(function (b) {
      b.addEventListener('click', function () { trocarAba(b.dataset.aba); });
    });

    // tabela
    $$('#tabela th.ord').forEach(function (th) {
      th.addEventListener('click', function () {
        var campo = th.dataset.campo;
        if (estado.ordem.campo === campo) estado.ordem.dir = estado.ordem.dir === 'asc' ? 'desc' : 'asc';
        else estado.ordem = { campo: campo, dir: campo === 'valor' || campo === 'periodo' ? 'desc' : 'asc' };
        estado.pagina = 1; renderTabela();
      });
    });
    $('#por-pagina').addEventListener('change', function (e) {
      estado.porPagina = e.target.value === 'todos' ? 'todos' : parseInt(e.target.value, 10);
      prefs.porPagina = estado.porPagina; Store.salvarPrefs(prefs);
      estado.pagina = 1; renderTabela();
    });

    // metas
    $('#btn-sugerir-metas').addEventListener('click', sugerirMetas);
    $('#btn-zerar-metas').addEventListener('click', function () {
      estado.metas = {}; prefs.metas = {}; Store.salvarPrefs(prefs); renderMetas();
      UI.toast('Metas zeradas', null, 'sucesso');
    });

    // PNG dos gráficos
    $$('[data-png]').forEach(function (b) {
      b.addEventListener('click', function () { Graficos.baixarPNG(b.dataset.png, b.dataset.png); });
    });

    // atalhos
    document.addEventListener('keydown', function (e) {
      var alvo = e.target.tagName;
      if (alvo === 'INPUT' || alvo === 'SELECT' || alvo === 'TEXTAREA') return;
      if (e.key === 't' || e.key === 'T') alternarTema();
      if ((e.key === 'f' || e.key === 'F') && estado.linhas.length) { e.preventDefault(); $('#f-busca').focus(); }
    });

    window.addEventListener('resize', Util.debounce(function () {
      if (estado.linhas.length && estado.aba === 'analise') renderHeatmap(dadosFoco(filtradas()));
    }, 250));
  }

  function trocarAba(nome) {
    estado.aba = nome;
    $$('.aba').forEach(function (x) { x.classList.toggle('ativa', x.dataset.aba === nome); });
    $$('.conteudo-aba').forEach(function (p) { p.classList.toggle('ativa', p.dataset.painel === nome); });
    renderizar();
  }

  /* ============================================================
     Importação
     ============================================================ */
  function processarArquivo(arquivo) {
    UI.carregando(true);
    setTimeout(function () {
      Parser.lerArquivo(arquivo).then(function (res) {
        UI.carregando(false);
        var meta = {
          arquivo: arquivo.name,
          importadoEm: new Date().toISOString(),
          aba: res.aba
        };
        if (estado.linhas.length) {
          UI.modal({
            titulo: 'Já existem dados carregados',
            corpo: '<p>A base atual tem <strong>' + Util.inteiro(estado.linhas.length) + '</strong> lançamentos. ' +
                   'A planilha <strong>' + Util.escapar(arquivo.name) + '</strong> trouxe <strong>' +
                   Util.inteiro(res.linhas.length) + '</strong>. O que você quer fazer?</p>',
            acoes: [
              { rotulo: 'Cancelar' },
              { rotulo: 'Somar às atuais', aoClicar: function () { aplicarImportacao(res, meta, 'adicionar'); } },
              { rotulo: 'Substituir tudo', classe: 'btn-primario', aoClicar: function () { aplicarImportacao(res, meta, 'substituir'); } }
            ]
          });
        } else {
          aplicarImportacao(res, meta, 'substituir');
        }
      }).catch(function (err) {
        UI.carregando(false);
        UI.modal({
          titulo: 'Não consegui ler essa planilha',
          corpo: '<p>' + Util.escapar(err.message || 'Erro desconhecido.') + '</p>' +
                 '<div class="aviso-box">Dica: a primeira linha preenchida deve conter os títulos das colunas ' +
                 '<strong>Descrição do gasto, Valor, Categoria, Mês e Ano</strong>. ' +
                 'Baixe o modelo na tela inicial para comparar.</div>',
          acoes: [{ rotulo: 'Entendi', classe: 'btn-primario' }]
        });
      });
    }, 60);
  }

  function aplicarImportacao(res, meta, modo) {
    var novas = res.linhas;
    if (modo === 'adicionar') {
      var juntas = estado.linhas.concat(novas);
      var limpo = Parser.removerDuplicadas(juntas);
      novas = Parser.reindexar(limpo.linhas);
      meta.arquivo = (estado.meta.arquivo ? estado.meta.arquivo + ' + ' : '') + meta.arquivo;
      if (limpo.duplicadas) {
        UI.toast('Duplicatas ignoradas', Util.inteiro(limpo.duplicadas) + ' linhas idênticas não foram somadas.', 'alerta');
      }
    }
    carregarDados(novas, meta);

    var detalhes = [];
    if (res.comColunaTipo) {
      detalhes.push(Util.inteiro(res.receitas) + ' receitas e ' + Util.inteiro(res.despesas) + ' despesas');
    }
    if (res.ignoradas) detalhes.push(Util.inteiro(res.ignoradas) + ' linha(s) ignorada(s)');
    if (res.motivos && res.motivos.semValor) detalhes.push(res.motivos.semValor + ' sem valor numérico');
    if (res.motivos && res.motivos.semPeriodo) detalhes.push(res.motivos.semPeriodo + ' sem mês/ano válidos');
    if (res.motivos && res.motivos.tipoIndefinido) {
      detalhes.push(res.motivos.tipoIndefinido + ' com tipo em branco tratada(s) como despesa');
    }
    UI.toast('Planilha carregada',
      Util.inteiro(estado.linhas.length) + ' lançamentos prontos' + (detalhes.length ? ' · ' + detalhes.join(' · ') : '') + '.',
      'sucesso', 6500);

    if (res.tipoReclassificado === 'categoria') {
      UI.toast('Coluna "Tipo" usada como categoria',
        'Os valores dessa coluna não pareciam receita/despesa, então ela virou a categoria dos lançamentos.', 'alerta', 8000);
    } else if (res.tipoReclassificado === 'ignorada') {
      UI.toast('Coluna "Tipo" ignorada',
        'Os valores não pareciam receita/despesa. Use "Receita" ou "Despesa" para ativar o fluxo de caixa.', 'alerta', 8000);
    }
  }

  function carregarDados(linhas, meta) {
    estado.linhas = linhas;
    estado.meta = meta || {};
    estado.pagina = 1;
    limparFiltros(true);

    var r = Store.salvarDados(estado.linhas, estado.meta);
    if (!r.ok && r.erro === 'cota') {
      UI.toast('Base grande demais para o cache',
        'Os dados funcionam normalmente agora, mas não caberão no armazenamento local ao recarregar a página.', 'alerta', 8000);
    }
    mostrarPainel();
  }

  function mostrarPainel() {
    $('#tela-inicial').classList.add('oculto');
    $('#tela-painel').classList.remove('oculto');
    $('#btn-limpar').classList.remove('oculto');
    $('#btn-nova-planilha').classList.remove('oculto');
    $('#wrap-exportar').classList.remove('oculto');
    $('#arquivo-info').classList.remove('oculto');

    // fluxo de caixa só aparece quando a base tem receitas
    var comReceitas = baseTemReceitas();
    $('#filtros-tipo').classList.toggle('oculto', !comReceitas);
    $('#aba-fluxo').classList.toggle('oculto', !comReceitas);
    if (!comReceitas && estado.aba === 'fluxo') trocarAba('visao');

    $('#arquivo-nome').textContent = estado.meta.arquivo || 'planilha';
    var kb = Store.tamanhoAproximado() / 1024;
    $('#arquivo-meta').textContent = Util.inteiro(estado.linhas.length) + ' lançamentos · ' +
      Util.dataHoraLegivel(estado.meta.importadoEm) + (kb ? ' · ' + (kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB') + ' em cache' : '');

    atualizarOpcoesFiltro();
    renderizar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function mostrarInicial() {
    $('#tela-painel').classList.add('oculto');
    $('#tela-inicial').classList.remove('oculto');
    $('#btn-limpar').classList.add('oculto');
    $('#btn-nova-planilha').classList.add('oculto');
    $('#wrap-exportar').classList.add('oculto');
    $('#arquivo-info').classList.add('oculto');
    Graficos.destruirTodos();
  }

  /* ============================================================
     Limpeza do cache
     ============================================================ */
  function confirmarLimpeza() {
    UI.modal({
      titulo: 'Limpar os dados carregados?',
      corpo: '<p>Isso remove do cache do navegador os <strong>' + Util.inteiro(estado.linhas.length) +
             '</strong> lançamentos de "<strong>' + Util.escapar(estado.meta.arquivo || 'planilha') + '</strong>". ' +
             'O arquivo original no seu computador não é afetado.</p>' +
             '<label class="ms-opcao" style="margin-top:12px"><input type="checkbox" id="chk-metas"> ' +
             'Apagar também as metas por categoria</label>',
      acoes: [
        { rotulo: 'Cancelar' },
        {
          rotulo: 'Limpar dados', classe: 'btn-perigo',
          aoClicar: function () {
            var apagarMetas = $('#chk-metas') && $('#chk-metas').checked;
            Store.limparDados();
            estado.linhas = []; estado.meta = {}; estado.cacheFiltrado = null;
            if (apagarMetas) { estado.metas = {}; prefs.metas = {}; Store.salvarPrefs(prefs); }
            limparFiltros(true);
            mostrarInicial();
            UI.toast('Cache limpo', 'Nenhum dado seu permanece no navegador.', 'sucesso');
          }
        }
      ]
    });
  }

  /* ============================================================
     Filtros
     ============================================================ */
  function montarChipsMeses() {
    var cont = $('#chips-meses');
    cont.innerHTML = Util.MESES_ABREV.map(function (m, i) {
      return '<button type="button" class="chip" data-mes="' + (i + 1) + '">' + m + '</button>';
    }).join('');
    $$('.chip', cont).forEach(function (c) {
      c.addEventListener('click', function () {
        var m = parseInt(c.dataset.mes, 10);
        var i = estado.filtros.meses.indexOf(m);
        if (i > -1) estado.filtros.meses.splice(i, 1); else estado.filtros.meses.push(m);
        c.classList.toggle('ativo');
        estado.pagina = 1; renderizar();
      });
    });
  }

  function montarChipsTipo() {
    $$('#chips-tipo .chip').forEach(function (c) {
      c.addEventListener('click', function () {
        estado.filtros.tipo = c.dataset.tipo;
        $$('#chips-tipo .chip').forEach(function (x) { x.classList.toggle('ativo', x === c); });
        estado.pagina = 1;
        renderizar();
      });
    });
  }

  function montarMultiSelects() {
    msAno = new UI.MultiSelect($('#f-ano'), {
      rotuloVazio: 'Todos os anos', rotuloPlural: 'anos', comBusca: false,
      aoMudar: function (vals) { estado.filtros.anos = vals; estado.pagina = 1; renderizar(); }
    });
    msCategoria = new UI.MultiSelect($('#f-categoria'), {
      rotuloVazio: 'Todas as categorias', rotuloPlural: 'categorias',
      aoMudar: function (vals) { estado.filtros.categorias = vals; estado.pagina = 1; renderizar(); }
    });
  }

  function atualizarOpcoesFiltro() {
    var anos = {}, cats = {};
    estado.linhas.forEach(function (l) {
      anos[l.ano] = (anos[l.ano] || 0) + l.valor;
      cats[l.categoria] = (cats[l.categoria] || 0) + l.valor;
    });
    msAno.definirOpcoes(Object.keys(anos).map(Number).sort(function (a, b) { return b - a; })
      .map(function (a) { return { valor: a, rotulo: String(a), extra: Util.moeda(anos[a], true) }; }), true);

    var listaCats = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
    msCategoria.definirOpcoes(listaCats.map(function (c, i) {
      return { valor: c, rotulo: c, extra: Util.moeda(cats[c], true), cor: Util.corDe(c, listaCats.indexOf(c)) };
    }), true);

    // meses sem dados ficam esmaecidos
    var mesesComDados = {};
    estado.linhas.forEach(function (l) { mesesComDados[l.mes] = true; });
    $$('#chips-meses .chip').forEach(function (c) {
      c.classList.toggle('vazio', !mesesComDados[parseInt(c.dataset.mes, 10)]);
    });
  }

  function limparFiltros(silencioso) {
    estado.filtros = { anos: [], meses: [], categorias: [], busca: '', min: null, max: null, tipo: 'todos' };
    estado.pagina = 1;
    $('#f-busca').value = '';
    $('#f-min').value = '';
    $('#f-max').value = '';
    $$('#chips-meses .chip').forEach(function (c) { c.classList.remove('ativo'); });
    $$('#chips-tipo .chip').forEach(function (c) { c.classList.toggle('ativo', c.dataset.tipo === 'todos'); });
    if (msAno) msAno.definirSelecao([]);
    if (msCategoria) msCategoria.definirSelecao([]);
    if (!silencioso) renderizar();
  }

  function filtradas() {
    var f = estado.filtros;
    var busca = Util.normalizar(f.busca);
    var usaAno = f.anos.length, usaMes = f.meses.length, usaCat = f.categorias.length;
    var usaTipo = f.tipo && f.tipo !== 'todos';
    return estado.linhas.filter(function (l) {
      if (usaTipo && l.tipo !== f.tipo) return false;
      if (usaAno && f.anos.indexOf(l.ano) === -1) return false;
      if (usaMes && f.meses.indexOf(l.mes) === -1) return false;
      if (usaCat && f.categorias.indexOf(l.categoria) === -1) return false;
      if (f.min != null && l.valor < f.min) return false;
      if (f.max != null && l.valor > f.max) return false;
      if (busca && l.busca.indexOf(busca) === -1) return false;
      return true;
    });
  }

  /* ============================================================
     Receitas x despesas
     ============================================================ */
  /** A base tem pelo menos uma receita? Decide todo o modo "fluxo de caixa". */
  function baseTemReceitas() {
    return estado.linhas.some(function (l) { return l.receita; });
  }

  function despesasDe(linhas) { return linhas.filter(function (l) { return !l.receita; }); }
  function receitasDe(linhas) { return linhas.filter(function (l) { return l.receita; }); }

  /**
   * Qual lado alimenta os painéis de categoria (rosca, Pareto, mapa de calor…).
   * Filtrando só receitas, esses painéis passam a analisar receitas.
   */
  function foco() { return estado.filtros.tipo === 'receita' ? 'receita' : 'despesa'; }
  function dadosFoco(dados) { return foco() === 'receita' ? receitasDe(dados) : despesasDe(dados); }
  function rotuloFoco(plural) { return foco() === 'receita' ? (plural ? 'receitas' : 'receita') : (plural ? 'despesas' : 'despesa'); }

  /** Agrega entradas, saídas e saldo por mês. */
  function fluxoPorPeriodo(linhas) {
    var mapa = {};
    linhas.forEach(function (l) {
      if (!mapa[l.periodo]) {
        mapa[l.periodo] = { periodo: l.periodo, ano: l.ano, mes: l.mes, receitas: 0, despesas: 0, qtd: 0 };
      }
      var p = mapa[l.periodo];
      if (l.receita) p.receitas += l.valor; else p.despesas += l.valor;
      p.qtd++;
    });
    var acumulado = 0;
    return Object.keys(mapa).map(function (k) { return mapa[k]; })
      .sort(function (a, b) { return a.periodo - b.periodo; })
      .map(function (p) {
        p.saldo = p.receitas - p.despesas;
        acumulado += p.saldo;
        p.acumulado = acumulado;
        p.poupanca = p.receitas ? (p.saldo / p.receitas) * 100 : null;
        return p;
      });
  }

  /* ============================================================
     Agregações
     ============================================================ */
  function porPeriodo(linhas) {
    var mapa = {};
    linhas.forEach(function (l) {
      if (!mapa[l.periodo]) mapa[l.periodo] = { periodo: l.periodo, ano: l.ano, mes: l.mes, total: 0, qtd: 0 };
      mapa[l.periodo].total += l.valor;
      mapa[l.periodo].qtd++;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; })
      .sort(function (a, b) { return a.periodo - b.periodo; });
  }

  function porCategoria(linhas) {
    var mapa = {};
    linhas.forEach(function (l) {
      if (!mapa[l.categoria]) mapa[l.categoria] = { categoria: l.categoria, total: 0, qtd: 0, meses: {} };
      mapa[l.categoria].total += l.valor;
      mapa[l.categoria].qtd++;
      mapa[l.categoria].meses[l.periodo] = true;
    });
    return Object.keys(mapa).map(function (k) {
      var c = mapa[k];
      c.mesesDistintos = Object.keys(c.meses).length;
      c.media = c.total / Math.max(1, c.mesesDistintos);
      return c;
    }).sort(function (a, b) { return b.total - a.total; });
  }

  function mediaMovel(valores, janela) {
    return valores.map(function (_, i) {
      if (i < janela - 1) return null;
      var soma = 0;
      for (var j = i - janela + 1; j <= i; j++) soma += valores[j];
      return soma / janela;
    });
  }

  /* ============================================================
     Render principal
     ============================================================ */
  function renderizar() {
    if (!estado.linhas.length) return;
    var dados = filtradas();
    estado.cacheFiltrado = dados;

    renderResumoFiltros(dados);
    renderKPIs(dados);

    if (estado.aba === 'visao') {
      renderGraficosVisao(dados);
      renderResumoCategorias(dadosFoco(dados));
      renderInsights(dados);
    } else if (estado.aba === 'fluxo') {
      renderFluxo(dados);
    } else if (estado.aba === 'analise') {
      renderGraficosAnalise(dados);
      renderHeatmap(dadosFoco(dados));
      renderRecorrentes(dadosFoco(dados));
      renderOutliers(dadosFoco(dados));
    } else if (estado.aba === 'lancamentos') {
      renderTabela();
    } else if (estado.aba === 'metas') {
      renderMetas();
    }
  }

  function renderResumoFiltros(dados) {
    var periodos = porPeriodo(dados);
    var pills = [];
    var f = estado.filtros;
    if (f.tipo !== 'todos') pills.push('só ' + (f.tipo === 'receita' ? 'receitas' : 'despesas'));
    if (f.anos.length) pills.push(f.anos.length + ' ano(s)');
    if (f.meses.length) pills.push(f.meses.length + ' mês(es)');
    if (f.categorias.length) pills.push(f.categorias.length + ' categoria(s)');
    if (f.busca) pills.push('busca: "' + f.busca + '"');
    if (f.min != null) pills.push('≥ ' + Util.moeda(f.min));
    if (f.max != null) pills.push('≤ ' + Util.moeda(f.max));

    var intervalo = periodos.length
      ? Util.rotuloPeriodo(periodos[0].mes, periodos[0].ano) + ' — ' +
        Util.rotuloPeriodo(periodos[periodos.length - 1].mes, periodos[periodos.length - 1].ano)
      : '—';

    var receitas = Util.soma(receitasDe(dados), function (l) { return l.valor; });
    var despesas = Util.soma(despesasDe(dados), function (l) { return l.valor; });
    var resumoValores = baseTemReceitas()
      ? '<span class="ponto"></span><span>Entradas <span class="fr-destaque val-receita">' + Util.moeda(receitas) + '</span></span>' +
        '<span class="ponto"></span><span>Saídas <span class="fr-destaque val-despesa">' + Util.moeda(despesas) + '</span></span>' +
        '<span class="ponto"></span><span>Saldo <span class="fr-destaque ' + (receitas - despesas >= 0 ? 'val-receita' : 'val-despesa') +
          '">' + Util.moeda(receitas - despesas) + '</span></span>'
      : '<span class="ponto"></span><span>Total <span class="fr-destaque">' + Util.moeda(despesas + receitas) + '</span></span>';

    $('#filtros-resumo').innerHTML =
      '<span>Exibindo <span class="fr-destaque">' + Util.inteiro(dados.length) + '</span> de ' +
      Util.inteiro(estado.linhas.length) + ' lançamentos</span>' +
      resumoValores +
      '<span class="ponto"></span><span>Período ' + intervalo + '</span>' +
      pills.map(function (p) { return '<span class="fr-pill">' + Util.escapar(p) + '</span>'; }).join('');
  }

  /* ---------------- KPIs ---------------- */
  var KPIS_DESPESA = [
    { chave: 'total', rotulo: 'Total gasto', cor: 'var(--s1)', ico: 'R$' },
    { chave: 'media', rotulo: 'Média mensal', cor: 'var(--s2)', ico: '~' },
    { chave: 'variacao', rotulo: 'Variação mensal', cor: 'var(--s5)', ico: '%' },
    { chave: 'lancamentos', rotulo: 'Lançamentos', cor: 'var(--s6)', ico: '#' },
    { chave: 'ticket', rotulo: 'Ticket médio', cor: 'var(--s3)', ico: '·' },
    { chave: 'lider', rotulo: 'Categoria líder', cor: 'var(--s4)', ico: '★' },
    { chave: 'extra', rotulo: 'Projeção do ano', cor: 'var(--s7)', ico: '→' }
  ];

  var KPIS_FLUXO = [
    { chave: 'receitas', rotulo: 'Receitas', cor: 'var(--ok)', ico: '↑' },
    { chave: 'total', rotulo: 'Despesas', cor: 'var(--erro)', ico: '↓' },
    { chave: 'saldo', rotulo: 'Saldo do período', cor: 'var(--s1)', ico: '=' },
    { chave: 'poupanca', rotulo: 'Taxa de poupança', cor: 'var(--s3)', ico: '%' },
    { chave: 'media', rotulo: 'Despesa média/mês', cor: 'var(--s2)', ico: '~' },
    { chave: 'variacao', rotulo: 'Variação mensal', cor: 'var(--s5)', ico: '%' },
    { chave: 'lider', rotulo: 'Categoria líder', cor: 'var(--s4)', ico: '★' },
    { chave: 'extra', rotulo: 'Projeção do ano', cor: 'var(--s7)', ico: '→' }
  ];

  var kpisMontados = null;

  function montarEsqueletoKPIs(def, assinatura) {
    $('#kpis').innerHTML = def.map(function (k) {
      return '<div class="kpi" id="kpi-' + k.chave + '" style="--cor:' + k.cor + '">' +
        '<div class="kpi-topo"><span class="kpi-rotulo">' + k.rotulo + '</span>' +
        '<span class="kpi-ico">' + k.ico + '</span></div>' +
        '<div class="kpi-valor">—</div><div class="kpi-sub">—</div></div>';
    }).join('');
    kpisMontados = assinatura;
  }

  function setKPI(chave, valorHTML, subHTML, rotulo, animarPara) {
    var card = $('#kpi-' + chave);
    if (!card) return;
    if (rotulo) $('.kpi-rotulo', card).textContent = rotulo;
    var elValor = $('.kpi-valor', card);
    if (animarPara != null) Util.animarValor(elValor, animarPara, function (v) { return Util.moeda(v); });
    else elValor.innerHTML = valorHTML;
    $('.kpi-sub', card).innerHTML = subHTML || '';
  }

  function renderKPIs(dados) {
    // modo fluxo de caixa só quando há receitas na seleção
    var receitas = receitasDe(dados);
    var despesas = despesasDe(dados);
    var modoFluxo = receitas.length > 0 && despesas.length > 0;
    var assinatura = modoFluxo ? 'fluxo' : 'despesa';
    if (kpisMontados !== assinatura || !$('#kpi-total')) {
      montarEsqueletoKPIs(modoFluxo ? KPIS_FLUXO : KPIS_DESPESA, assinatura);
    }

    // sem despesas (filtro "só receitas"), os indicadores olham para as receitas
    var principais = despesas.length ? despesas : dados;
    var total = Util.soma(principais, function (l) { return l.valor; });
    var totalReceitas = Util.soma(receitas, function (l) { return l.valor; });
    var periodos = porPeriodo(principais);
    var cats = porCategoria(dadosFoco(dados).length ? dadosFoco(dados) : dados);
    var nMeses = periodos.length || 1;
    var media = total / nMeses;

    if (modoFluxo) {
      var saldo = totalReceitas - total;
      var poupanca = totalReceitas ? (saldo / totalReceitas) * 100 : 0;
      var mesesFluxo = fluxoPorPeriodo(dados);
      var negativos = mesesFluxo.filter(function (p) { return p.saldo < 0; }).length;

      setKPI('receitas', null, Util.moeda(totalReceitas / nMeses) + ' por mês em média', null, totalReceitas);
      setKPI('saldo',
        '<span class="' + (saldo >= 0 ? 'val-receita' : 'val-despesa') + '">' + Util.moeda(saldo) + '</span>',
        negativos ? negativos + ' de ' + mesesFluxo.length + ' meses fecharam no vermelho'
                  : 'todos os ' + mesesFluxo.length + ' meses fecharam positivos');
      setKPI('poupanca',
        '<span class="' + (poupanca >= 0 ? 'val-receita' : 'val-despesa') + '">' + Util.percentual(poupanca) + '</span>',
        'de cada R$ 100 que entram, ' + (poupanca >= 0 ? 'sobram ' : 'faltam ') + Util.moeda(Math.abs(poupanca)));
    }

    var soReceitas = !despesas.length && receitas.length > 0;
    setKPI('total', null,
      modoFluxo ? Util.percentual(totalReceitas ? (total / totalReceitas) * 100 : 0) + ' da renda do período'
                : Util.inteiro(nMeses) + ' ' + (nMeses === 1 ? 'mês com lançamentos' : 'meses com lançamentos'),
      modoFluxo ? 'Despesas' : (soReceitas ? 'Total de receitas' : 'Total gasto'), total);
    setKPI('media', null, 'considerando os meses do filtro', null, media);

    // variação mês a mês
    if (periodos.length >= 2) {
      var ult = periodos[periodos.length - 1], ant = periodos[periodos.length - 2];
      var varPct = ant.total ? ((ult.total - ant.total) / ant.total) * 100 : 0;
      var classe = varPct > 0.5 ? 'sobe' : (varPct < -0.5 ? 'desce' : 'neutro');
      var seta = varPct > 0.5 ? '▲' : (varPct < -0.5 ? '▼' : '—');
      setKPI('variacao',
        '<span class="delta ' + classe + '">' + seta + ' ' + Util.percentual(Math.abs(varPct)) + '</span>',
        Util.rotuloPeriodo(ult.mes, ult.ano) + ' (' + Util.moeda(ult.total, true) + ') vs ' +
        Util.rotuloPeriodo(ant.mes, ant.ano) + ' (' + Util.moeda(ant.total, true) + ')');
    } else {
      setKPI('variacao', '<span class="delta neutro">—</span>', 'é preciso ao menos dois meses no filtro');
    }

    setKPI('lancamentos', Util.inteiro(dados.length),
      dados.length ? 'de ' + Util.inteiro(estado.linhas.length) + ' na base completa' : 'nenhum lançamento no filtro');

    var ticket = principais.length ? total / principais.length : 0;
    var valores = principais.map(function (l) { return l.valor; }).sort(function (a, b) { return a - b; });
    var mediana = valores.length ? (valores.length % 2 ? valores[(valores.length - 1) / 2]
      : (valores[valores.length / 2 - 1] + valores[valores.length / 2]) / 2) : 0;
    setKPI('ticket', null, 'mediana de ' + Util.moeda(mediana), null, ticket);

    if (cats.length) {
      var lider = cats[0];
      var totalFoco = Util.soma(cats, function (c) { return c.total; });
      setKPI('lider', '<span style="font-size:19px">' + Util.escapar(lider.categoria) + '</span>',
        Util.moeda(lider.total) + ' · ' + Util.percentual(totalFoco ? (lider.total / totalFoco) * 100 : 0) +
        ' das ' + rotuloFoco(true),
        'Categoria líder' + (foco() === 'receita' ? ' (receitas)' : ''));
    } else {
      setKPI('lider', '—', 'sem dados no filtro');
    }

    // card extra: projeção do ano ou maior lançamento
    var anosSel = {};
    dados.forEach(function (l) { anosSel[l.ano] = true; });
    var anosLista = Object.keys(anosSel);
    if (anosLista.length === 1 && periodos.length < 12 && periodos.length >= 2 && !estado.filtros.meses.length) {
      var projecao = media * 12;
      setKPI('extra', null,
        'no ritmo atual, ' + anosLista[0] + ' fecha com esse total de ' + (despesas.length ? 'despesas' : 'lançamentos') +
        ' (' + periodos.length + '/12 meses registrados)',
        'Projeção do ano', projecao);
    } else if (principais.length) {
      var maior = principais.reduce(function (a, b) { return b.valor > a.valor ? b : a; });
      setKPI('extra', '<span style="font-size:19px">' + Util.moeda(maior.valor) + '</span>',
        Util.escapar(maior.descricao) + ' · ' + maior.rotulo,
        modoFluxo ? 'Maior despesa' : 'Maior lançamento');
    } else {
      setKPI('extra', '—', 'sem dados no filtro', 'Maior lançamento');
    }
  }

  /* ---------------- Gráficos ---------------- */
  function renderGraficosVisao(dados) {
    if (!Graficos.disponivel()) return;
    var receitas = receitasDe(dados), despesas = despesasDe(dados);
    var modoFluxo = receitas.length > 0 && despesas.length > 0;

    if (modoFluxo) {
      var fluxo = fluxoPorPeriodo(dados);
      var rotulosF = fluxo.map(function (p) { return Util.rotuloPeriodo(p.mes, p.ano); });
      texto('tit-evolucao', 'Fluxo de caixa mensal');
      texto('sub-evolucao', 'Entradas acima da linha, saídas abaixo, saldo do mês na linha');
      Graficos.fluxoCaixa({
        rotulos: rotulosF,
        receitas: fluxo.map(function (p) { return p.receitas; }),
        despesas: fluxo.map(function (p) { return p.despesas; }),
        saldo: fluxo.map(function (p) { return p.saldo; })
      });
      texto('tit-acumulado', 'Saldo acumulado');
      texto('sub-acumulado', 'Quanto sobrou (ou faltou) somando mês a mês');
      Graficos.acumulado({
        rotulos: rotulosF,
        valores: fluxo.map(function (p) { return p.acumulado; }),
        cor: fluxo.length && fluxo[fluxo.length - 1].acumulado < 0 ? '#fb7185' : '#34d399',
        rotulo: 'Saldo acumulado',
        zero: false
      });
    } else {
      var base = despesas.length ? despesas : dados;
      var periodos = porPeriodo(base);
      var rotulos = periodos.map(function (p) { return Util.rotuloPeriodo(p.mes, p.ano); });
      var valores = periodos.map(function (p) { return p.total; });
      var soReceita = !despesas.length && receitas.length;
      texto('tit-evolucao', soReceita ? 'Evolução das receitas' : 'Evolução dos gastos');
      texto('sub-evolucao', 'Total por mês com média móvel de 3 períodos');
      Graficos.evolucao({ rotulos: rotulos, valores: valores, media: mediaMovel(valores, 3) });

      texto('tit-acumulado', soReceita ? 'Receita acumulada' : 'Gasto acumulado');
      texto('sub-acumulado', 'Soma acumulada ao longo dos meses selecionados');
      var acc0 = 0;
      Graficos.acumulado({
        rotulos: rotulos,
        valores: valores.map(function (v) { acc0 += v; return acc0; }),
        cor: soReceita ? '#34d399' : null
      });
    }

    var cats = porCategoria(dadosFoco(dados));
    texto('tit-categorias', foco() === 'receita' ? 'Receitas por categoria' : 'Distribuição por categoria');
    texto('sub-categorias', 'Participação de cada categoria nas ' + rotuloFoco(true) + ' do período');
    texto('tit-resumo-cat', 'Resumo por categoria · ' + rotuloFoco(true));
    var principais = cats.slice(0, 9);
    var resto = cats.slice(9);
    var rotulosCat = principais.map(function (c) { return c.categoria; });
    var valoresCat = principais.map(function (c) { return c.total; });
    var coresCat = principais.map(function (c, i) { return Util.corDe(c.categoria, i); });
    if (resto.length) {
      rotulosCat.push('Outras (' + resto.length + ')');
      valoresCat.push(Util.soma(resto, function (c) { return c.total; }));
      coresCat.push('#94a3b8');
    }
    Graficos.categorias({ rotulos: rotulosCat, valores: valoresCat, cores: coresCat });
  }

  function texto(id, valor) {
    var el = document.getElementById(id);
    if (el) el.textContent = valor;
  }

  function renderGraficosAnalise(dadosBrutos) {
    if (!Graficos.disponivel()) return;
    var dados = dadosFoco(dadosBrutos);
    var cats = porCategoria(dados);
    var total = Util.soma(cats, function (c) { return c.total; });
    var acc = 0;
    var topCats = cats.slice(0, 12);
    Graficos.pareto({
      rotulos: topCats.map(function (c) { return c.categoria.length > 16 ? c.categoria.slice(0, 15) + '…' : c.categoria; }),
      valores: topCats.map(function (c) { return c.total; }),
      cores: topCats.map(function (c, i) { return Util.corDe(c.categoria, i); }),
      acumuladoPct: topCats.map(function (c) { acc += c.total; return total ? (acc / total) * 100 : 0; })
    });

    var top = dados.slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, 10);
    Graficos.topGastos({
      rotulos: top.map(function (l) { return l.descricao.length > 26 ? l.descricao.slice(0, 25) + '…' : l.descricao; }),
      titulos: top.map(function (l) { return l.descricao; }),
      subtitulos: top.map(function (l) { return l.categoria + ' · ' + l.rotulo; }),
      valores: top.map(function (l) { return l.valor; }),
      cores: top.map(function (l) { return Util.hexAlfa(Util.corDe(l.categoria, indiceCategoria(l.categoria)), .85); })
    });

    var porAno = {};
    dados.forEach(function (l) {
      if (!porAno[l.ano]) porAno[l.ano] = new Array(12).fill(null);
      porAno[l.ano][l.mes - 1] = (porAno[l.ano][l.mes - 1] || 0) + l.valor;
    });
    Graficos.comparativoAnos(Object.keys(porAno).sort().map(function (a) {
      return { ano: a, dados: porAno[a] };
    }));
  }

  var _ordemCats = [];
  function indiceCategoria(cat) {
    var i = _ordemCats.indexOf(cat);
    if (i === -1) { _ordemCats.push(cat); i = _ordemCats.length - 1; }
    return i;
  }

  /* ---------------- Fluxo de caixa ---------------- */
  function renderFluxo(dados) {
    var fluxo = fluxoPorPeriodo(dados);
    var receitas = receitasDe(dados);
    var totalRec = Util.soma(receitas, function (l) { return l.valor; });
    var totalDesp = Util.soma(despesasDe(dados), function (l) { return l.valor; });
    var saldo = totalRec - totalDesp;
    var nMeses = fluxo.length || 1;
    var negativos = fluxo.filter(function (p) { return p.saldo < 0; });
    var melhor = fluxo.length ? fluxo.reduce(function (a, b) { return b.saldo > a.saldo ? b : a; }) : null;
    var pior = fluxo.length ? fluxo.reduce(function (a, b) { return b.saldo < a.saldo ? b : a; }) : null;

    $('#fluxo-destaques').innerHTML = !fluxo.length ? '' :
      '<div class="fd-item"><small>Entradas no período</small>' +
        '<strong class="val-receita">' + Util.moeda(totalRec) + '</strong>' +
        '<em>' + Util.moeda(totalRec / nMeses) + ' por mês</em></div>' +
      '<div class="fd-item"><small>Saídas no período</small>' +
        '<strong class="val-despesa">' + Util.moeda(totalDesp) + '</strong>' +
        '<em>' + Util.moeda(totalDesp / nMeses) + ' por mês</em></div>' +
      '<div class="fd-item"><small>Resultado</small>' +
        '<strong class="' + (saldo >= 0 ? 'val-receita' : 'val-despesa') + '">' + Util.moeda(saldo) + '</strong>' +
        '<em>' + Util.moeda(saldo / nMeses) + ' por mês em média</em></div>' +
      '<div class="fd-item"><small>Melhor / pior mês</small>' +
        '<strong style="font-size:16px">' + (melhor ? Util.rotuloPeriodo(melhor.mes, melhor.ano) + ' · ' + Util.moeda(melhor.saldo, true) : '—') + '</strong>' +
        '<em>' + (pior ? Util.rotuloPeriodo(pior.mes, pior.ano) + ' · ' + Util.moeda(pior.saldo, true) : '—') +
        ' · ' + negativos.length + ' mês(es) no vermelho</em></div>';

    if (Graficos.disponivel() && fluxo.length) {
      Graficos.saldoMensal({
        rotulos: fluxo.map(function (p) { return Util.rotuloPeriodo(p.mes, p.ano); }),
        saldos: fluxo.map(function (p) { return p.saldo; }),
        acumulado: fluxo.map(function (p) { return p.acumulado; })
      });

      var catsRec = porCategoria(receitas).slice(0, 10);
      Graficos.categorias({
        id: 'g-receitas',
        rotulos: catsRec.map(function (c) { return c.categoria; }),
        valores: catsRec.map(function (c) { return c.total; }),
        cores: catsRec.map(function (c, i) { return Util.corDe(c.categoria, i + 2); })
      });
    }

    /* tabela mês a mês */
    var tab = $('#tabela-fluxo');
    if (!fluxo.length) {
      tab.innerHTML = '<tbody><tr><td class="vazio-msg">Nenhum lançamento no filtro atual.</td></tr></tbody>';
    } else {
      tab.innerHTML =
        '<thead><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th>' +
        '<th class="num">Resultado</th><th class="num">Caixa acumulado</th><th class="num">Poupança</th></tr></thead><tbody>' +
        fluxo.map(function (p) {
          return '<tr class="' + (p.saldo < 0 ? 'negativo' : '') + '">' +
            '<td class="desc">' + Util.MESES[p.mes - 1] + '/' + p.ano + '</td>' +
            '<td class="num val-receita">' + Util.moeda(p.receitas) + '</td>' +
            '<td class="num val-despesa">' + Util.moeda(p.despesas) + '</td>' +
            '<td class="num valor ' + (p.saldo >= 0 ? 'val-receita' : 'val-despesa') + '">' + Util.moeda(p.saldo) + '</td>' +
            '<td class="num ' + (p.acumulado >= 0 ? '' : 'val-despesa') + '">' + Util.moeda(p.acumulado) + '</td>' +
            '<td class="num">' + (p.poupanca == null ? '—' : Util.percentual(p.poupanca, 0)) + '</td></tr>';
        }).join('') + '</tbody>' +
        '<tfoot><tr><td>Total do período</td>' +
        '<td class="num val-receita">' + Util.moeda(totalRec) + '</td>' +
        '<td class="num val-despesa">' + Util.moeda(totalDesp) + '</td>' +
        '<td class="num ' + (saldo >= 0 ? 'val-receita' : 'val-despesa') + '">' + Util.moeda(saldo) + '</td>' +
        '<td class="num">' + Util.moeda(saldo) + '</td>' +
        '<td class="num">' + (totalRec ? Util.percentual((saldo / totalRec) * 100, 0) : '—') + '</td></tr></tfoot>';
    }

    /* maiores receitas */
    var topRec = receitas.slice().sort(function (a, b) { return b.valor - a.valor; }).slice(0, 10);
    var elTop = $('#top-receitas');
    if (!topRec.length) {
      elTop.innerHTML = '<tr><td class="vazio-msg">Nenhuma receita no filtro atual.</td></tr>';
    } else {
      elTop.innerHTML = '<thead><tr><th>Descrição</th><th>Categoria</th><th>Período</th><th class="num">Valor</th></tr></thead><tbody>' +
        topRec.map(function (l) {
          return '<tr><td class="forte">' + Util.escapar(l.descricao) + '</td>' +
            '<td><span class="badge-cat"><i class="pontinho" style="background:' +
            Util.corDe(l.categoria, indiceCategoria(l.categoria)) + '"></i>' + Util.escapar(l.categoria) + '</span></td>' +
            '<td>' + l.rotulo + '</td>' +
            '<td class="num forte val-receita">' + Util.moeda(l.valor) + '</td></tr>';
        }).join('') + '</tbody>';
    }
  }

  /* ---------------- Resumo por categoria ---------------- */
  function renderResumoCategorias(dados) {
    var cats = porCategoria(dados);
    var total = Util.soma(cats, function (c) { return c.total; });
    var el = $('#resumo-categorias');
    if (!cats.length) { el.innerHTML = '<tr><td class="vazio-msg">Nenhum dado no filtro atual.</td></tr>'; return; }
    var max = cats[0].total;

    el.innerHTML =
      '<thead><tr><th>Categoria</th><th class="num">Total</th><th class="num">Part.</th>' +
      '<th class="num">Média/mês</th><th class="num">Lanç.</th></tr></thead><tbody>' +
      cats.map(function (c, i) {
        var cor = Util.corDe(c.categoria, indiceCategoria(c.categoria));
        var pct = total ? (c.total / total) * 100 : 0;
        return '<tr>' +
          '<td class="forte"><i class="pontinho" style="background:' + cor + '"></i>' + Util.escapar(c.categoria) + '</td>' +
          '<td class="num forte">' + Util.moeda(c.total) + '</td>' +
          '<td class="num">' + Util.percentual(pct) +
            '<div class="barra-mini"><i style="width:' + (c.total / max * 100) + '%;background:' + cor + '"></i></div></td>' +
          '<td class="num">' + Util.moeda(c.media) + '</td>' +
          '<td class="num">' + Util.inteiro(c.qtd) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  /* ---------------- Insights ---------------- */
  function renderInsights(todos) {
    var el = $('#insights');
    if (!todos.length) { el.innerHTML = '<div class="vazio-msg">Ajuste os filtros para ver as análises.</div>'; return; }

    var itens = [];
    var dados = dadosFoco(todos);
    if (!dados.length) dados = todos;
    var total = Util.soma(dados, function (l) { return l.valor; });
    var periodos = porPeriodo(dados);
    var cats = porCategoria(dados);

    function add(ico, cor, titulo, texto) { itens.push({ ico: ico, cor: cor, titulo: titulo, texto: texto }); }

    /* ---- leituras de fluxo de caixa ---- */
    var receitasSel = receitasDe(todos), despesasSel = despesasDe(todos);
    if (receitasSel.length && despesasSel.length) {
      var fluxo = fluxoPorPeriodo(todos);
      var totRec = Util.soma(receitasSel, function (l) { return l.valor; });
      var totDesp = Util.soma(despesasSel, function (l) { return l.valor; });
      var resultado = totRec - totDesp;
      var poupanca = totRec ? (resultado / totRec) * 100 : 0;

      add(resultado >= 0 ? '↑' : '↓', resultado >= 0 ? 'var(--ok)' : 'var(--erro)', 'Resultado do período',
        'Entraram ' + Util.moeda(totRec) + ' e saíram ' + Util.moeda(totDesp) + ', com ' +
        (resultado >= 0 ? 'sobra' : 'déficit') + ' de <strong>' + Util.moeda(Math.abs(resultado)) +
        '</strong> — taxa de poupança de ' + Util.percentual(poupanca) + '.');

      var negativos = fluxo.filter(function (p) { return p.saldo < 0; });
      if (negativos.length) {
        var piorMes = negativos.reduce(function (a, b) { return b.saldo < a.saldo ? b : a; });
        add('!', 'var(--alerta)', 'Meses no vermelho',
          '<strong>' + negativos.length + ' de ' + fluxo.length + ' meses</strong> fecharam negativos. O pior foi ' +
          Util.rotuloPeriodo(piorMes.mes, piorMes.ano) + ', com ' + Util.moeda(piorMes.saldo) + '.');
      } else if (fluxo.length > 1) {
        add('✓', 'var(--ok)', 'Todos os meses positivos',
          'Nos ' + fluxo.length + ' meses do filtro as entradas superaram as saídas. O menor colchão foi de ' +
          Util.moeda(fluxo.reduce(function (a, b) { return b.saldo < a.saldo ? b : a; }).saldo) + '.');
      }

      var catsRec = porCategoria(receitasSel);
      if (catsRec.length) {
        add('◆', 'var(--s3)', 'Principal fonte de renda',
          '<strong>' + Util.escapar(catsRec[0].categoria) + '</strong> representa ' +
          Util.percentual(totRec ? (catsRec[0].total / totRec) * 100 : 0) + ' de tudo que entrou' +
          (catsRec.length > 1 ? ', seguida de ' + Util.escapar(catsRec[1].categoria) + '.' : '.'));
      }

      var despMedia = totDesp / (fluxo.length || 1);
      if (resultado > 0 && despMedia > 0) {
        add('⛨', 'var(--s7)', 'Fôlego acumulado',
          'A sobra do período equivale a <strong>' + (resultado / despMedia).toFixed(1).replace('.', ',') +
          ' meses</strong> de despesa no ritmo atual — é o tamanho da reserva que esse período construiu.');
      }
      add('%', 'var(--s6)', 'Comprometimento da renda',
        '<strong>' + Util.percentual(totRec ? (totDesp / totRec) * 100 : 0) + '</strong> de tudo que entrou foi gasto. ' +
        'A maior categoria sozinha consome ' +
        Util.percentual(totRec && cats.length ? (cats[0].total / totRec) * 100 : 0) + ' da renda.');
    }

    // 1. categoria líder
    if (cats.length) {
      var l0 = cats[0];
      add('★', 'var(--s4)', 'Categoria líder',
        '<strong>' + Util.escapar(l0.categoria) + '</strong> concentra ' +
        Util.percentual(total ? (l0.total / total) * 100 : 0) + ' das ' + rotuloFoco(true) + ' (' + Util.moeda(l0.total) +
        ' em ' + Util.inteiro(l0.qtd) + ' lançamentos).');
    }

    // 2. mês mais caro / mais barato
    if (periodos.length >= 2) {
      var maisCaro = periodos.reduce(function (a, b) { return b.total > a.total ? b : a; });
      var maisBarato = periodos.reduce(function (a, b) { return b.total < a.total ? b : a; });
      add('▲', 'var(--s5)', 'Pico e vale',
        'O mês mais caro foi <strong>' + Util.rotuloPeriodo(maisCaro.mes, maisCaro.ano) + '</strong> (' +
        Util.moeda(maisCaro.total) + ') e o mais econômico, <strong>' +
        Util.rotuloPeriodo(maisBarato.mes, maisBarato.ano) + '</strong> (' + Util.moeda(maisBarato.total) + ') — uma diferença de ' +
        Util.moeda(maisCaro.total - maisBarato.total) + '.');
    }

    // 3. tendência (regressão simples sobre os meses)
    if (periodos.length >= 3) {
      var n = periodos.length, somaX = 0, somaY = 0, somaXY = 0, somaXX = 0;
      periodos.forEach(function (p, i) { somaX += i; somaY += p.total; somaXY += i * p.total; somaXX += i * i; });
      var inclinacao = (n * somaXY - somaX * somaY) / (n * somaXX - somaX * somaX);
      var mediaMes = somaY / n;
      var pctMes = mediaMes ? (inclinacao / mediaMes) * 100 : 0;
      var subindo = inclinacao > 0;
      add(subindo ? '↗' : '↘', subindo ? 'var(--s5)' : 'var(--s3)', 'Tendência do período',
        'Os gastos vêm ' + (subindo ? 'subindo' : 'caindo') + ' cerca de <strong>' +
        Util.moeda(Math.abs(inclinacao)) + ' por mês</strong> (' + Util.percentual(Math.abs(pctMes)) +
        ' da média mensal), considerando ' + n + ' meses.');
    }

    // 4. categoria que mais variou entre os dois últimos meses
    if (periodos.length >= 2) {
      var ult = periodos[periodos.length - 1].periodo, ant = periodos[periodos.length - 2].periodo;
      var mapa = {};
      dados.forEach(function (l) {
        if (l.periodo !== ult && l.periodo !== ant) return;
        if (!mapa[l.categoria]) mapa[l.categoria] = { ult: 0, ant: 0 };
        mapa[l.categoria][l.periodo === ult ? 'ult' : 'ant'] += l.valor;
      });
      var melhorCat = null, maiorDif = 0;
      Object.keys(mapa).forEach(function (c) {
        var d = mapa[c].ult - mapa[c].ant;
        if (Math.abs(d) > Math.abs(maiorDif)) { maiorDif = d; melhorCat = c; }
      });
      if (melhorCat && Math.abs(maiorDif) > 0.01) {
        var pctCat = mapa[melhorCat].ant ? (maiorDif / mapa[melhorCat].ant) * 100 : 100;
        add(maiorDif > 0 ? '+' : '−', maiorDif > 0 ? 'var(--s5)' : 'var(--s3)', 'Maior mudança no último mês',
          '<strong>' + Util.escapar(melhorCat) + '</strong> ' + (maiorDif > 0 ? 'aumentou' : 'reduziu') + ' ' +
          Util.moeda(Math.abs(maiorDif)) + ' (' + Util.percentual(Math.abs(pctCat)) + ') em relação ao mês anterior.');
      }
    }

    // 5. concentração 80/20
    if (cats.length >= 3) {
      var acc = 0, quantas = 0;
      for (var i = 0; i < cats.length; i++) { acc += cats[i].total; quantas++; if (acc >= total * 0.8) break; }
      add('80', 'var(--s1)', 'Concentração 80/20',
        '<strong>' + quantas + ' de ' + cats.length + ' categorias</strong> respondem por 80% do que foi gasto (' +
        Util.moeda(acc) + '). Focar nelas é o caminho mais rápido para economizar.');
    }

    // 6. recorrentes e custo fixo
    var rec = calcularRecorrentes(dados);
    if (rec.length) {
      var totalRec = Util.soma(rec, function (r) { return r.total; });
      add('↻', 'var(--s2)', 'Gastos recorrentes',
        '<strong>' + rec.length + ' descrições</strong> se repetem em 3 meses ou mais e pesam <strong>' +
        Util.moeda(totalRec / (periodos.length || 1)) + ' por mês</strong> — ' +
        Util.percentual(total ? (totalRec / total) * 100 : 0) + ' de tudo que foi gasto no período.');

      var fixos = rec.filter(function (r) { return r.fixo; });
      if (fixos.length) {
        var totalFixo = Util.soma(fixos, function (r) { return r.total; });
        add('=', 'var(--s7)', 'Custo fixo estimado',
          '<strong>' + fixos.length + ' gasto(s)</strong> aparecem quase todo mês com valor estável — cerca de <strong>' +
          Util.moeda(totalFixo / (periodos.length || 1)) + ' por mês</strong> (' +
          Util.percentual(total ? (totalFixo / total) * 100 : 0) + ' do total). O restante é gasto variável, onde há mais espaço para cortar.');
      }
    }

    // 7. outliers
    var out = calcularOutliers(dados);
    if (out.length) {
      add('!', 'var(--alerta)', 'Lançamentos atípicos',
        '<strong>' + out.length + ' lançamento(s)</strong> ficaram muito acima do padrão da própria categoria. ' +
        'O maior deles: ' + Util.escapar(out[0].descricao) + ' (' + Util.moeda(out[0].valor) + ' em ' + out[0].rotulo + ').');
    }

    // 8. comparativo anual
    var porAno = {};
    dados.forEach(function (l) {
      if (!porAno[l.ano]) porAno[l.ano] = { total: 0, meses: {} };
      porAno[l.ano].total += l.valor;
      porAno[l.ano].meses[l.mes] = true;
    });
    var anos = Object.keys(porAno).map(Number).sort();
    if (anos.length >= 2) {
      var a1 = anos[anos.length - 2], a2 = anos[anos.length - 1];
      // compara apenas os meses presentes nos dois anos
      var comuns = Object.keys(porAno[a2].meses).filter(function (m) { return porAno[a1].meses[m]; }).map(Number);
      if (comuns.length) {
        var t1 = 0, t2 = 0;
        dados.forEach(function (l) {
          if (comuns.indexOf(l.mes) === -1) return;
          if (l.ano === a1) t1 += l.valor;
          if (l.ano === a2) t2 += l.valor;
        });
        var dif = t1 ? ((t2 - t1) / t1) * 100 : 0;
        add('⇄', dif > 0 ? 'var(--s5)' : 'var(--s3)', 'Ano contra ano',
          'Nos ' + comuns.length + ' mês(es) comparáveis, <strong>' + a2 + '</strong> está ' +
          Util.percentual(Math.abs(dif)) + ' ' + (dif > 0 ? 'acima' : 'abaixo') + ' de <strong>' + a1 +
          '</strong> (' + Util.moeda(t2) + ' vs ' + Util.moeda(t1) + ').');
      }
    }

    // 9. dia-a-dia
    if (periodos.length) {
      var mediaDiaria = (total / periodos.length) / 30;
      add('≈', 'var(--s6)', 'Ritmo diário',
        'O gasto médio equivale a <strong>' + Util.moeda(mediaDiaria) + ' por dia</strong> — ' +
        Util.moeda(mediaDiaria * 7) + ' por semana.');
    }

    el.innerHTML = itens.map(function (it) {
      return '<div class="insight" style="--cor:' + it.cor + '">' +
        '<div class="insight-ico">' + it.ico + '</div>' +
        '<div><strong>' + it.titulo + '</strong><p>' + it.texto + '</p></div></div>';
    }).join('');
  }

  /* ---------------- Mapa de calor ---------------- */
  function renderHeatmap(dados) {
    var el = $('#heatmap');
    var cats = porCategoria(dados).slice(0, 12);
    var periodos = porPeriodo(dados);
    if (periodos.length > 24) periodos = periodos.slice(-24);
    if (!cats.length || !periodos.length) {
      el.innerHTML = '<div class="vazio-msg">Nenhum dado no filtro atual.</div>';
      el.style.gridTemplateColumns = '1fr';
      return;
    }

    var chaves = periodos.map(function (p) { return p.periodo; });
    var mapa = {};
    dados.forEach(function (l) {
      var k = l.categoria + '|' + l.periodo;
      mapa[k] = (mapa[k] || 0) + l.valor;
    });

    var max = 0;
    cats.forEach(function (c) {
      chaves.forEach(function (k) { max = Math.max(max, mapa[c.categoria + '|' + k] || 0); });
    });

    var html = '<div class="hm-cab"></div>' + periodos.map(function (p) {
      return '<div class="hm-cab">' + Util.rotuloPeriodo(p.mes, p.ano) + '</div>';
    }).join('');

    cats.forEach(function (c) {
      var cor = Util.corDe(c.categoria, indiceCategoria(c.categoria));
      html += '<div class="hm-lbl" title="' + Util.escapar(c.categoria) + '">' +
              '<i class="pontinho" style="background:' + cor + '"></i>' + Util.escapar(c.categoria) + '</div>';
      chaves.forEach(function (k) {
        var v = mapa[c.categoria + '|' + k] || 0;
        var r = max ? v / max : 0;
        var estilo = v
          ? 'background:' + Util.hexAlfa('#6366f1', 0.08 + r * 0.82) + (r > 0.55 ? ';color:#fff' : '')
          : 'background:var(--superficie-2);opacity:.5';
        html += '<div class="hm-cel' + (v ? ' valor' : '') + '" style="' + estilo + '" title="' +
                Util.escapar(c.categoria) + ' · ' + Util.moeda(v) + '">' +
                (v ? Util.moeda(v, true).replace('R$', '').trim() : '–') + '</div>';
      });
    });

    el.style.gridTemplateColumns = '170px repeat(' + periodos.length + ', minmax(52px, 1fr))';
    el.innerHTML = html;
  }

  /* ---------------- Recorrentes e outliers ---------------- */
  function calcularRecorrentes(dados) {
    var grupos = {};
    dados.forEach(function (l) {
      var k = Util.normalizar(l.descricao);
      if (!k) return;
      if (!grupos[k]) grupos[k] = { descricao: l.descricao, categoria: l.categoria, total: 0, qtd: 0, porMes: {} };
      grupos[k].total += l.valor;
      grupos[k].qtd++;
      grupos[k].porMes[l.periodo] = (grupos[k].porMes[l.periodo] || 0) + l.valor;
    });
    var nPeriodos = porPeriodo(dados).length || 1;
    return Object.keys(grupos).map(function (k) { return grupos[k]; })
      .filter(function (g) { return Object.keys(g.porMes).length >= 3; })
      .map(function (g) {
        var mensais = Object.keys(g.porMes).map(function (p) { return g.porMes[p]; });
        g.meses = mensais.length;
        // média nos meses em que o gasto aparece
        g.mediaMensal = g.total / g.meses;
        // peso médio considerando todos os meses do filtro
        g.pesoNoPeriodo = g.total / nPeriodos;
        g.mediaLancamento = g.total / g.qtd;
        // variação entre os meses: baixa + presença frequente = custo fixo
        g.variacao = g.mediaMensal ? Util.desvioPadrao(mensais) / g.mediaMensal : 1;
        g.fixo = g.variacao <= 0.2 && g.meses >= Math.max(3, Math.round(nPeriodos * 0.6));
        return g;
      })
      .sort(function (a, b) { return b.total - a.total; });
  }

  function renderRecorrentes(dados) {
    var el = $('#recorrentes');
    var rec = calcularRecorrentes(dados).slice(0, 12);
    if (!rec.length) {
      el.innerHTML = '<tr><td class="vazio-msg">Nenhum gasto apareceu em 3 meses ou mais dentro do filtro atual.</td></tr>';
      return;
    }
    el.innerHTML = '<thead><tr><th>Descrição</th><th>Categoria</th><th class="num">Meses</th>' +
      '<th class="num">Média/mês</th><th class="num">Total</th></tr></thead><tbody>' +
      rec.map(function (r) {
        return '<tr><td class="forte">' + Util.escapar(r.descricao) +
          (r.fixo ? ' <span class="tag" style="display:inline-block;margin:0 0 0 6px">fixo</span>' : '') + '</td>' +
          '<td><span class="badge-cat"><i class="pontinho" style="background:' +
          Util.corDe(r.categoria, indiceCategoria(r.categoria)) + '"></i>' + Util.escapar(r.categoria) + '</span></td>' +
          '<td class="num">' + r.meses + '</td>' +
          '<td class="num">' + Util.moeda(r.mediaMensal) + '</td>' +
          '<td class="num forte">' + Util.moeda(r.total) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  function calcularOutliers(dados) {
    var porCat = {};
    dados.forEach(function (l) { (porCat[l.categoria] = porCat[l.categoria] || []).push(l); });
    var achados = [];
    Object.keys(porCat).forEach(function (cat) {
      var linhas = porCat[cat];
      if (linhas.length < 4) return;
      var valores = linhas.map(function (l) { return l.valor; });
      var media = Util.soma(valores) / valores.length;
      var dp = Util.desvioPadrao(valores);
      if (dp <= 0) return;
      linhas.forEach(function (l) {
        var z = (l.valor - media) / dp;
        if (z >= 2 && l.valor > media * 1.5) {
          achados.push({ descricao: l.descricao, categoria: cat, valor: l.valor, rotulo: l.rotulo,
                         acima: media ? ((l.valor - media) / media) * 100 : 0, z: z });
        }
      });
    });
    return achados.sort(function (a, b) { return b.valor - a.valor; });
  }

  function renderOutliers(dados) {
    var el = $('#outliers');
    var out = calcularOutliers(dados).slice(0, 12);
    if (!out.length) {
      el.innerHTML = '<tr><td class="vazio-msg">Nada fora do padrão: os valores estão distribuídos de forma homogênea.</td></tr>';
      return;
    }
    el.innerHTML = '<thead><tr><th>Descrição</th><th>Categoria</th><th>Período</th>' +
      '<th class="num">Valor</th><th class="num">Acima da média</th></tr></thead><tbody>' +
      out.map(function (o) {
        return '<tr><td class="forte">' + Util.escapar(o.descricao) + '</td>' +
          '<td><span class="badge-cat"><i class="pontinho" style="background:' +
          Util.corDe(o.categoria, indiceCategoria(o.categoria)) + '"></i>' + Util.escapar(o.categoria) + '</span></td>' +
          '<td>' + o.rotulo + '</td>' +
          '<td class="num forte">' + Util.moeda(o.valor) + '</td>' +
          '<td class="num" style="color:var(--alerta)">+' + Util.percentual(o.acima, 0) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  /* ---------------- Tabela ---------------- */
  function ordenar(linhas) {
    var campo = estado.ordem.campo, dir = estado.ordem.dir === 'asc' ? 1 : -1;
    return linhas.slice().sort(function (a, b) {
      var x, y;
      if (campo === 'valor' || campo === 'periodo') { x = a[campo]; y = b[campo]; }
      else { x = Util.normalizar(a[campo]); y = Util.normalizar(b[campo]); }
      if (x < y) return -1 * dir;
      if (x > y) return 1 * dir;
      return (a.periodo - b.periodo) * dir;
    });
  }

  function renderTabela() {
    var dados = estado.cacheFiltrado || filtradas();
    var comTipo = baseTemReceitas();
    var totalReceitas = Util.soma(receitasDe(dados), function (l) { return l.valor; });
    var totalDespesas = Util.soma(despesasDe(dados), function (l) { return l.valor; });
    var total = totalReceitas + totalDespesas;
    var ordenadas = ordenar(dados);

    $('#tabela').classList.toggle('com-tipo', comTipo);
    texto('th-pct', comTipo ? '% do tipo' : '% do total');

    $$('#tabela th.ord').forEach(function (th) {
      th.classList.remove('asc', 'desc');
      if (th.dataset.campo === estado.ordem.campo) th.classList.add(estado.ordem.dir);
    });

    var porPag = estado.porPagina === 'todos' ? ordenadas.length || 1 : estado.porPagina;
    var totalPaginas = Math.max(1, Math.ceil(ordenadas.length / porPag));
    if (estado.pagina > totalPaginas) estado.pagina = totalPaginas;
    var ini = (estado.pagina - 1) * porPag;
    var pagina = ordenadas.slice(ini, ini + porPag);

    $('#tabela-sub').textContent = Util.inteiro(ordenadas.length) + ' lançamentos filtrados · ' +
      (comTipo
        ? Util.moeda(totalReceitas) + ' em entradas e ' + Util.moeda(totalDespesas) + ' em saídas'
        : Util.moeda(total) + ' no total');

    var corpo = $('#tabela-corpo');
    if (!pagina.length) {
      corpo.innerHTML = '<tr><td colspan="6" class="vazio-msg">Nenhum lançamento corresponde aos filtros.</td></tr>';
      $('#tabela-rodape').innerHTML = '';
      $('#paginacao').innerHTML = '';
      return;
    }

    corpo.innerHTML = pagina.map(function (l) {
      var base = l.receita ? totalReceitas : totalDespesas;
      var pct = base ? (l.valor / base) * 100 : 0;
      var cor = Util.corDe(l.categoria, indiceCategoria(l.categoria));
      return '<tr>' +
        '<td class="desc">' + Util.escapar(l.descricao) + '</td>' +
        '<td class="col-tipo"><span class="badge-tipo ' + l.tipo + '">' +
          (l.receita ? '↑ Receita' : '↓ Despesa') + '</span></td>' +
        '<td><span class="badge-cat"><i class="pontinho" style="background:' + cor + '"></i>' +
          Util.escapar(l.categoria) + '</span></td>' +
        '<td>' + Util.MESES[l.mes - 1] + '/' + l.ano + '</td>' +
        '<td class="num valor' + (comTipo ? (l.receita ? ' val-receita' : ' val-despesa') : '') + '">' +
          (comTipo ? (l.receita ? '+' : '−') + ' ' : '') + Util.moeda(l.valor) + '</td>' +
        '<td class="num">' + Util.percentual(pct, 2) +
          '<span class="mini-barra"><i style="width:' + Math.min(100, pct * 4) + '%;background:' + cor + '"></i></span></td>' +
        '</tr>';
    }).join('');

    var somaPagina = Util.soma(pagina, function (l) { return l.sinal; });
    $('#tabela-rodape').innerHTML = '<tr><td colspan="' + (comTipo ? 4 : 3) + '">' +
      (comTipo ? 'Saldo desta página' : 'Soma desta página') + ' (' + pagina.length + ' linhas)</td>' +
      '<td class="num ' + (comTipo ? (somaPagina >= 0 ? 'val-receita' : 'val-despesa') : '') + '">' +
      Util.moeda(comTipo ? somaPagina : Math.abs(somaPagina)) + '</td><td class="num">' +
      Util.percentual(total ? (Math.abs(somaPagina) / total) * 100 : 0) + '</td></tr>';

    renderPaginacao(totalPaginas, ordenadas.length, ini, pagina.length);
  }

  function renderPaginacao(totalPaginas, totalLinhas, ini, qtd) {
    var el = $('#paginacao');
    if (totalPaginas <= 1) {
      el.innerHTML = '<span class="pag-info">Exibindo todos os ' + Util.inteiro(totalLinhas) + ' lançamentos</span>';
      return;
    }
    var p = estado.pagina;
    var paginas = [];
    var inicio = Math.max(1, p - 2), fim = Math.min(totalPaginas, p + 2);
    if (inicio > 1) paginas.push(1);
    if (inicio > 2) paginas.push('…');
    for (var i = inicio; i <= fim; i++) paginas.push(i);
    if (fim < totalPaginas - 1) paginas.push('…');
    if (fim < totalPaginas) paginas.push(totalPaginas);

    el.innerHTML =
      '<button class="pag-btn" data-ir="1"' + (p === 1 ? ' disabled' : '') + '>«</button>' +
      '<button class="pag-btn" data-ir="' + (p - 1) + '"' + (p === 1 ? ' disabled' : '') + '>‹</button>' +
      paginas.map(function (x) {
        if (x === '…') return '<span class="pag-info">…</span>';
        return '<button class="pag-btn' + (x === p ? ' ativa' : '') + '" data-ir="' + x + '">' + x + '</button>';
      }).join('') +
      '<button class="pag-btn" data-ir="' + (p + 1) + '"' + (p === totalPaginas ? ' disabled' : '') + '>›</button>' +
      '<button class="pag-btn" data-ir="' + totalPaginas + '"' + (p === totalPaginas ? ' disabled' : '') + '>»</button>' +
      '<span class="pag-info">' + (ini + 1) + '–' + (ini + qtd) + ' de ' + Util.inteiro(totalLinhas) + '</span>';

    $$('.pag-btn', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var ir = parseInt(b.dataset.ir, 10);
        if (!isFinite(ir) || ir < 1) return;
        estado.pagina = ir;
        renderTabela();
        $('#tabela').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ---------------- Metas ---------------- */
  function categoriasDaBase() {
    var mapa = {};
    // metas são orçamento de saída: categorias de receita ficam de fora
    despesasDe(estado.linhas).forEach(function (l) { mapa[l.categoria] = (mapa[l.categoria] || 0) + l.valor; });
    return Object.keys(mapa).sort(function (a, b) { return mapa[b] - mapa[a]; });
  }

  function mediasMensaisFiltradas() {
    var dados = despesasDe(estado.cacheFiltrado || filtradas());
    var nMeses = porPeriodo(dados).length || 1;
    var mapa = {};
    dados.forEach(function (l) { mapa[l.categoria] = (mapa[l.categoria] || 0) + l.valor; });
    Object.keys(mapa).forEach(function (c) { mapa[c] = mapa[c] / nMeses; });
    return mapa;
  }

  function renderMetas() {
    var cats = categoriasDaBase();
    var medias = mediasMensaisFiltradas();
    var el = $('#metas-lista');

    var metaTotal = 0, gastoTotal = 0, acima = 0;
    cats.forEach(function (c) {
      var meta = estado.metas[c] || 0;
      var gasto = medias[c] || 0;
      metaTotal += meta; gastoTotal += gasto;
      if (meta > 0 && gasto > meta) acima++;
    });

    var comMeta = cats.filter(function (c) { return (estado.metas[c] || 0) > 0; }).length;
    var saldo = metaTotal - gastoTotal;
    var cardSaldo = comMeta
      ? '<div class="mr-item"><small>' + (saldo >= 0 ? 'Folga no orçamento' : 'Estouro do orçamento') + '</small>' +
        '<strong style="color:' + (saldo >= 0 ? 'var(--ok)' : 'var(--erro)') + '">' + Util.moeda(Math.abs(saldo)) + '</strong></div>'
      : '<div class="mr-item"><small>Situação</small><strong style="font-size:15px;color:var(--txt-3)">Nenhuma meta definida</strong></div>';

    $('#metas-resumo').innerHTML =
      '<div class="mr-item"><small>Meta mensal total</small><strong>' + Util.moeda(metaTotal) + '</strong></div>' +
      '<div class="mr-item"><small>Gasto médio mensal</small><strong>' + Util.moeda(gastoTotal) + '</strong></div>' +
      cardSaldo +
      '<div class="mr-item"><small>Categorias acima da meta</small><strong>' + acima + ' de ' + comMeta + '</strong></div>';

    el.innerHTML = cats.map(function (c) {
      var meta = estado.metas[c] || 0;
      var gasto = medias[c] || 0;
      var pct = meta > 0 ? (gasto / meta) * 100 : 0;
      var cor = pct > 100 ? 'var(--erro)' : pct > 85 ? 'var(--alerta)' : 'var(--ok)';
      var corCat = Util.corDe(c, indiceCategoria(c));
      return '<div class="meta-linha">' +
        '<div class="meta-nome"><i class="pontinho" style="background:' + corCat + '"></i><span>' + Util.escapar(c) + '</span></div>' +
        '<div><input type="number" min="0" step="10" class="meta-input" data-cat="' + Util.escapar(c) + '" ' +
          'placeholder="sem meta" value="' + (meta || '') + '"></div>' +
        '<div><div class="meta-barra"><i style="width:' + Math.min(100, pct) + '%;background:' + cor + '"></i></div>' +
          '<div class="meta-txt">Média mensal: ' + Util.moeda(gasto) +
          (meta > 0 ? ' · meta ' + Util.moeda(meta) : ' · defina uma meta') + '</div></div>' +
        '<div class="meta-status" style="color:' + (meta > 0 ? cor : 'var(--txt-3)') + '">' +
          (meta > 0 ? Util.percentual(pct, 0) : '—') + '</div>' +
        '</div>';
    }).join('');

    $$('.meta-input', el).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        var cat = inp.dataset.cat;
        if (isFinite(v) && v > 0) estado.metas[cat] = v; else delete estado.metas[cat];
        prefs.metas = estado.metas;
        Store.salvarPrefs(prefs);
        renderMetas();
      });
    });
  }

  function sugerirMetas() {
    var medias = mediasMensaisFiltradas();
    Object.keys(medias).forEach(function (c) {
      if (medias[c] > 0) estado.metas[c] = Math.round(medias[c] / 10) * 10;
    });
    prefs.metas = estado.metas;
    Store.salvarPrefs(prefs);
    renderMetas();
    UI.toast('Metas sugeridas', 'Preenchidas com a média mensal atual, arredondada. Ajuste como quiser.', 'sucesso');
  }

  /* ============================================================
     Exportação
     ============================================================ */
  function exportar(tipo) {
    var dados = ordenar(estado.cacheFiltrado || filtradas());
    if (tipo === 'imprimir') { window.print(); return; }
    if (!dados.length) { UI.toast('Nada para exportar', 'Os filtros atuais não retornaram lançamentos.', 'alerta'); return; }

    if (tipo === 'csv') {
      var linhas = [['Descrição do gasto', 'Valor', 'Categoria', 'Mês', 'Ano', 'Tipo'].join(';')];
      dados.forEach(function (l) {
        linhas.push([
          '"' + String(l.descricao).replace(/"/g, '""') + '"',
          String(l.valor.toFixed(2)).replace('.', ','),
          '"' + String(l.categoria).replace(/"/g, '""') + '"',
          l.mes, l.ano,
          l.receita ? 'Receita' : 'Despesa'
        ].join(';'));
      });
      Util.baixarTexto(linhas.join('\r\n'), 'finlytics-lancamentos-' + Util.carimboArquivo() + '.csv', 'text/csv');
      UI.toast('CSV exportado', Util.inteiro(dados.length) + ' lançamentos.', 'sucesso');
      return;
    }

    if (tipo === 'json') {
      var backup = {
        gerado: new Date().toISOString(),
        origem: estado.meta.arquivo || null,
        metas: estado.metas,
        lancamentos: estado.linhas.map(function (l) {
          return { descricao: l.descricao, valor: l.valor, categoria: l.categoria,
                   mes: l.mes, ano: l.ano, tipo: l.tipo };
        })
      };
      Util.baixarTexto(JSON.stringify(backup, null, 2), 'finlytics-backup-' + Util.carimboArquivo() + '.json', 'application/json');
      UI.toast('Backup gerado', 'Base completa em JSON (' + Util.inteiro(estado.linhas.length) + ' lançamentos).', 'sucesso');
      return;
    }

    if (tipo === 'xlsx') {
      if (typeof XLSX === 'undefined') {
        UI.toast('Excel indisponível', 'A biblioteca não carregou. Use a exportação em CSV.', 'erro');
        return;
      }
      var wb = XLSX.utils.book_new();

      var aba1 = XLSX.utils.json_to_sheet(dados.map(function (l) {
        return { 'Descrição do gasto': l.descricao, 'Valor': l.valor, 'Categoria': l.categoria,
                 'Mês': l.mes, 'Ano': l.ano, 'Tipo': l.receita ? 'Receita' : 'Despesa' };
      }));
      aba1['!cols'] = [{ wch: 38 }, { wch: 13 }, { wch: 20 }, { wch: 7 }, { wch: 8 }, { wch: 11 }];
      XLSX.utils.book_append_sheet(wb, aba1, 'Lançamentos');

      var despesasExp = despesasDe(dados), receitasExp = receitasDe(dados);
      var total = Util.soma(despesasExp, function (l) { return l.valor; }) || Util.soma(dados, function (l) { return l.valor; });
      var cats = porCategoria(despesasExp.length ? despesasExp : dados);
      var aba2 = XLSX.utils.json_to_sheet(cats.map(function (c) {
        return {
          'Categoria': c.categoria, 'Total': c.total,
          'Participação (%)': total ? +((c.total / total) * 100).toFixed(2) : 0,
          'Média por mês': +c.media.toFixed(2), 'Lançamentos': c.qtd
        };
      }));
      aba2['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 15 }, { wch: 13 }];
      XLSX.utils.book_append_sheet(wb, aba2, despesasExp.length ? 'Despesas por categoria' : 'Por categoria');

      var aba3 = XLSX.utils.json_to_sheet(porPeriodo(despesasExp.length ? despesasExp : dados).map(function (p) {
        return { 'Ano': p.ano, 'Mês': p.mes, 'Mês/Ano': Util.rotuloPeriodo(p.mes, p.ano),
                 'Total': +p.total.toFixed(2), 'Lançamentos': p.qtd };
      }));
      aba3['!cols'] = [{ wch: 8 }, { wch: 7 }, { wch: 12 }, { wch: 14 }, { wch: 13 }];
      XLSX.utils.book_append_sheet(wb, aba3, 'Por mês');

      var nAbas = 3;
      if (receitasExp.length) {
        var abaRec = XLSX.utils.json_to_sheet(porCategoria(receitasExp).map(function (c) {
          return { 'Categoria': c.categoria, 'Total': +c.total.toFixed(2),
                   'Média por mês': +c.media.toFixed(2), 'Lançamentos': c.qtd };
        }));
        abaRec['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 15 }, { wch: 13 }];
        XLSX.utils.book_append_sheet(wb, abaRec, 'Receitas por categoria');

        var abaFluxo = XLSX.utils.json_to_sheet(fluxoPorPeriodo(dados).map(function (p) {
          return {
            'Ano': p.ano, 'Mês': p.mes, 'Mês/Ano': Util.rotuloPeriodo(p.mes, p.ano),
            'Receitas': +p.receitas.toFixed(2), 'Despesas': +p.despesas.toFixed(2),
            'Saldo do mês': +p.saldo.toFixed(2), 'Caixa acumulado': +p.acumulado.toFixed(2),
            'Taxa de poupança (%)': p.poupanca == null ? '' : +p.poupanca.toFixed(2)
          };
        }));
        abaFluxo['!cols'] = [{ wch: 8 }, { wch: 7 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 17 }, { wch: 19 }];
        XLSX.utils.book_append_sheet(wb, abaFluxo, 'Fluxo de caixa');
        nAbas = 5;
      }

      XLSX.writeFile(wb, 'finlytics-analise-' + Util.carimboArquivo() + '.xlsx');
      UI.toast('Excel exportado', nAbas + ' abas' + (nAbas === 5 ? ', incluindo o fluxo de caixa mês a mês.' : ': lançamentos, por categoria e por mês.'), 'sucesso');
    }
  }

  /* ============================================================ */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
