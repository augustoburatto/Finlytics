/* ============================================================
   Finlytics — cache local (localStorage)
   Nada é enviado para servidores: os dados vivem apenas aqui.
   ============================================================ */
(function (global) {
  'use strict';

  var CHAVE_DADOS = 'finlytics.dados.v1';
  var CHAVE_PREFS = 'finlytics.prefs.v1';

  function disponivel() {
    try {
      var t = '__fin_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch (e) { return false; }
  }

  var ok = disponivel();

  /* ---------- dados ---------- */

  /**
   * Formato compacto em disco: [descricao, valor, categoria, mes, ano, tipo]
   * tipo: 1 = receita, 0/ausente = despesa (bases antigas seguem funcionando).
   */
  function compactar(linhas) {
    return linhas.map(function (l) {
      return [l.descricao, l.valor, l.categoria, l.mes, l.ano, l.tipo === 'receita' ? 1 : 0];
    });
  }

  function expandir(arr) {
    return arr.map(function (a, i) {
      return montarLinha({
        descricao: a[0], valor: a[1], categoria: a[2], mes: a[3], ano: a[4],
        tipo: a[5] === 1 ? 'receita' : 'despesa'
      }, i);
    });
  }

  /** Cria a linha canônica usada em todo o app (com campos derivados). */
  function montarLinha(d, indice) {
    var tipo = d.tipo === 'receita' ? 'receita' : 'despesa';
    return {
      id: indice,
      descricao: d.descricao,
      valor: d.valor,
      categoria: d.categoria,
      mes: d.mes,
      ano: d.ano,
      tipo: tipo,
      receita: tipo === 'receita',
      sinal: tipo === 'receita' ? d.valor : -d.valor,
      periodo: Util.chavePeriodo(d.ano, d.mes),
      rotulo: Util.rotuloPeriodo(d.mes, d.ano),
      busca: Util.normalizar(d.descricao + ' ' + d.categoria)
    };
  }

  function salvarDados(linhas, meta) {
    if (!ok) return { ok: false, erro: 'indisponivel' };
    try {
      localStorage.setItem(CHAVE_DADOS, JSON.stringify({
        v: 2,
        meta: meta || {},
        linhas: compactar(linhas)
      }));
      return { ok: true };
    } catch (e) {
      var cota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014);
      return { ok: false, erro: cota ? 'cota' : 'desconhecido' };
    }
  }

  function carregarDados() {
    if (!ok) return null;
    try {
      var bruto = localStorage.getItem(CHAVE_DADOS);
      if (!bruto) return null;
      var obj = JSON.parse(bruto);
      if (!obj || !Array.isArray(obj.linhas)) return null;
      return { linhas: expandir(obj.linhas), meta: obj.meta || {} };
    } catch (e) { return null; }
  }

  function limparDados() {
    try { localStorage.removeItem(CHAVE_DADOS); } catch (e) { /* ignora */ }
  }

  function tamanhoAproximado() {
    try {
      var s = localStorage.getItem(CHAVE_DADOS);
      return s ? s.length * 2 : 0; // UTF-16
    } catch (e) { return 0; }
  }

  /* ---------- preferências ---------- */

  var prefsPadrao = { tema: 'dark', metas: {}, porPagina: 25 };

  function carregarPrefs() {
    if (!ok) return Object.assign({}, prefsPadrao);
    try {
      var p = JSON.parse(localStorage.getItem(CHAVE_PREFS) || '{}');
      return Object.assign({}, prefsPadrao, p || {});
    } catch (e) { return Object.assign({}, prefsPadrao); }
  }

  function salvarPrefs(p) {
    if (!ok) return;
    try { localStorage.setItem(CHAVE_PREFS, JSON.stringify(p)); } catch (e) { /* ignora */ }
  }

  function limparTudo() {
    limparDados();
    try { localStorage.removeItem(CHAVE_PREFS); } catch (e) { /* ignora */ }
  }

  global.Store = {
    disponivel: ok,
    montarLinha: montarLinha,
    salvarDados: salvarDados,
    carregarDados: carregarDados,
    limparDados: limparDados,
    limparTudo: limparTudo,
    tamanhoAproximado: tamanhoAproximado,
    carregarPrefs: carregarPrefs,
    salvarPrefs: salvarPrefs
  };
})(window);
