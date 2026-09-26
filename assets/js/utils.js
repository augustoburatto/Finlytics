/* ============================================================
   Finlytics — utilitários gerais
   ============================================================ */
(function (global) {
  'use strict';

  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  var fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var fmtBRLCurto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
  var fmtInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  /** Formata em Real. `curto` usa notação compacta (R$ 12,3 mil). */
  function moeda(v, curto) {
    if (v == null || !isFinite(v)) return '—';
    return curto ? fmtBRLCurto.format(v) : fmtBRL.format(v);
  }

  function inteiro(v) {
    if (v == null || !isFinite(v)) return '—';
    return fmtInt.format(v);
  }

  function percentual(v, casas) {
    if (v == null || !isFinite(v)) return '—';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: casas == null ? 1 : casas,
                                       maximumFractionDigits: casas == null ? 1 : casas }) + '%';
  }

  var TIPOS = ['receita', 'despesa', 'investimento'];

  var TIPO_ROTULO = { receita: 'Receita', despesa: 'Despesa', investimento: 'Investimento' };
  var TIPO_PLURAL = { receita: 'receitas', despesa: 'despesas', investimento: 'investimentos' };
  var TIPO_COR = { receita: '#34d399', despesa: '#fb7185', investimento: '#a78bfa' };
  var TIPO_SETA = { receita: '↑', despesa: '↓', investimento: '◆' };

  /**
   * Classifica o conteúdo da coluna "Tipo" em 'receita', 'despesa' ou 'investimento'.
   * Devolve null quando não reconhece — o chamador decide o padrão.
   */
  function paraTipo(v) {
    if (v == null) return null;
    if (typeof v === 'number') return v > 0 ? 'receita' : (v < 0 ? 'despesa' : null);
    var n = normalizar(v).replace(/[().]/g, '').trim();
    if (!n) return null;
    if (n === 'i' || n === 'inv') return 'investimento';
    if (/invest|aporte|aplicac|previdenc|poupanc|patrimoni|reserva/.test(n)) return 'investimento';
    if (n === '+' || n === 'r' || n === 'c' || n === 'e') return 'receita';
    if (n === '-' || n === 'd' || n === 's') return 'despesa';
    if (/receit|entrad|credit|ganho|provent|renda|salari|recebiment|income|revenue/.test(n)) return 'receita';
    if (/despes|gasto|said|debit|custo|pagament|saque|expense|outflow/.test(n)) return 'despesa';
    return null;
  }

  /** Valor com sinal no caixa: receita entra, despesa e aporte saem. */
  function comSinal(linha) {
    return linha.tipo === 'receita' ? linha.valor : -linha.valor;
  }

  /** minúsculas, sem acento, espaços colapsados */
  function normalizar(s) {
    if (s == null) return '';
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** "Primeira Letra Maiúscula De Cada Palavra" preservando siglas curtas */
  function titulo(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    return s.replace(/\S+/g, function (p) {
      if (p.length <= 3 && p === p.toUpperCase()) return p;
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    });
  }

  /**
   * Converte valores em texto para número, tolerando formatos BR e US:
   * "R$ 1.234,56" → 1234.56 · "1,234.56" → 1234.56 · "(80,00)" → -80
   */
  function paraNumero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v == null) return null;
    if (v instanceof Date) return null;
    var s = String(v).trim();
    if (!s) return null;

    var negativo = /^\(.*\)$/.test(s) || /-/.test(s);
    s = s.replace(/[^0-9.,]/g, '');
    if (!s) return null;

    var ultVirgula = s.lastIndexOf(',');
    var ultPonto = s.lastIndexOf('.');
    var sep = Math.max(ultVirgula, ultPonto);
    var parteInt = s, parteDec = '';

    if (sep > -1) {
      var digitosDepois = s.length - sep - 1;
      if (digitosDepois > 0 && digitosDepois <= 2) {
        parteInt = s.slice(0, sep);
        parteDec = s.slice(sep + 1);
      }
    }
    parteInt = parteInt.replace(/[.,]/g, '');
    var n = parseFloat((parteInt || '0') + (parteDec ? '.' + parteDec : ''));
    if (!isFinite(n)) return null;
    return negativo ? -n : n;
  }

  /** Converte para número de mês 1–12 aceitando nome, abreviação, número ou data. */
  function paraMes(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v.getMonth() + 1;
    if (typeof v === 'number') {
      if (v >= 1 && v <= 12) return Math.round(v);
      // número serial de data do Excel
      if (v > 366) {
        var d = serialParaData(v);
        if (d) return d.getMonth() + 1;
      }
      return null;
    }
    var s = normalizar(v);
    if (!s) return null;

    var soNumero = s.match(/^(\d{1,2})(?:[^\d].*)?$/);
    if (soNumero) {
      var n = parseInt(soNumero[1], 10);
      if (n >= 1 && n <= 12) return n;
    }
    // aceita 2025-03, 03/2025, mar/25
    var iso = s.match(/^(\d{4})[-/](\d{1,2})/);
    if (iso) { var m1 = parseInt(iso[2], 10); if (m1 >= 1 && m1 <= 12) return m1; }
    var br = s.match(/^(\d{1,2})[-/](\d{4})$/);
    if (br) { var m2 = parseInt(br[1], 10); if (m2 >= 1 && m2 <= 12) return m2; }

    var prefixosPT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    var prefixosEN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    var p = s.slice(0, 3);
    var i = prefixosPT.indexOf(p);
    if (i > -1) return i + 1;
    i = prefixosEN.indexOf(p);
    if (i > -1) return i + 1;

    var data = new Date(v);
    if (!isNaN(data)) return data.getMonth() + 1;
    return null;
  }

  function paraAno(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v.getFullYear();
    if (typeof v === 'number') {
      if (v >= 1900 && v <= 2200) return Math.round(v);
      if (v >= 0 && v <= 99) return 2000 + Math.round(v);
      if (v > 366) { var d = serialParaData(v); if (d) return d.getFullYear(); }
      return null;
    }
    var s = String(v).trim();
    var m = s.match(/(\d{4})/);
    if (m) { var a = parseInt(m[1], 10); if (a >= 1900 && a <= 2200) return a; }
    var m2 = s.match(/^(\d{2})$/);
    if (m2) return 2000 + parseInt(m2[1], 10);
    var data = new Date(s);
    if (!isNaN(data)) return data.getFullYear();
    return null;
  }

  /** Converte número serial do Excel em Date (base 1899-12-30). */
  function serialParaData(n) {
    if (typeof n !== 'number' || !isFinite(n)) return null;
    var ms = Math.round((n - 25569) * 86400 * 1000);
    var d = new Date(ms);
    return isNaN(d) ? null : d;
  }

  /** Tenta extrair uma data de qualquer célula (Date, serial ou texto). */
  function paraData(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v;
    if (typeof v === 'number') return serialParaData(v);
    var s = String(v).trim();
    var br = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (br) {
      var ano = parseInt(br[3], 10);
      if (ano < 100) ano += 2000;
      var d = new Date(ano, parseInt(br[2], 10) - 1, parseInt(br[1], 10));
      return isNaN(d) ? null : d;
    }
    var d2 = new Date(s);
    return isNaN(d2) ? null : d2;
  }

  function rotuloPeriodo(mes, ano) {
    var m = (mes >= 1 && mes <= 12) ? MESES_ABREV[mes - 1] : '??';
    return m + '/' + String(ano == null ? '----' : ano).slice(-2);
  }

  function chavePeriodo(ano, mes) { return ano * 100 + mes; }

  function debounce(fn, ms) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms || 200);
    };
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Paleta determinística: a mesma categoria recebe sempre a mesma cor. */
  var PALETA = ['#6366f1', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#a78bfa',
                '#38bdf8', '#f472b6', '#4ade80', '#fb923c', '#2dd4bf', '#c084fc',
                '#facc15', '#60a5fa', '#f87171', '#a3e635'];

  function corDe(texto, indice) {
    if (typeof indice === 'number' && indice >= 0) return PALETA[indice % PALETA.length];
    var h = 0, s = String(texto || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PALETA[h % PALETA.length];
  }

  function hexAlfa(hex, alfa) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alfa + ')';
  }

  function baixarBlob(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
  }

  function baixarTexto(texto, nome, tipo) {
    baixarBlob(new Blob(['﻿' + texto], { type: (tipo || 'text/plain') + ';charset=utf-8' }), nome);
  }

  function carimboArquivo() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function dataHoraLegivel(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  /** Anima um número inteiro/decimal até o valor final. */
  function animarValor(el, ate, formatar, duracao) {
    var de = parseFloat(el.getAttribute('data-valor') || '0') || 0;
    if (!isFinite(ate)) ate = 0;
    el.setAttribute('data-valor', ate);
    // o valor final é escrito de imediato: em abas em segundo plano o
    // requestAnimationFrame não dispara e o número ficaria travado.
    el.textContent = formatar(ate);
    if (de === ate || document.hidden ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ini = performance.now(), dur = duracao || 550;
    function passo(agora) {
      // o timestamp do frame pode vir antes de `ini` quando a aba volta do
      // segundo plano; sem o piso em 0 o progresso fica negativo
      var t = Math.min(1, Math.max(0, (agora - ini) / dur));
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = formatar(de + (ate - de) * e);
      if (t < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }

  function soma(arr, pegar) {
    var t = 0;
    for (var i = 0; i < arr.length; i++) t += pegar ? (pegar(arr[i]) || 0) : (arr[i] || 0);
    return t;
  }

  function desvioPadrao(valores) {
    if (!valores.length) return 0;
    var m = soma(valores) / valores.length;
    var v = soma(valores.map(function (x) { return Math.pow(x - m, 2); })) / valores.length;
    return Math.sqrt(v);
  }

  global.Util = {
    MESES: MESES, MESES_ABREV: MESES_ABREV, PALETA: PALETA,
    TIPOS: TIPOS, TIPO_ROTULO: TIPO_ROTULO, TIPO_PLURAL: TIPO_PLURAL,
    TIPO_COR: TIPO_COR, TIPO_SETA: TIPO_SETA,
    moeda: moeda, inteiro: inteiro, percentual: percentual,
    normalizar: normalizar, titulo: titulo,
    paraTipo: paraTipo, comSinal: comSinal,
    paraNumero: paraNumero, paraMes: paraMes, paraAno: paraAno, paraData: paraData,
    serialParaData: serialParaData,
    rotuloPeriodo: rotuloPeriodo, chavePeriodo: chavePeriodo,
    debounce: debounce, escapar: escapar,
    corDe: corDe, hexAlfa: hexAlfa,
    baixarBlob: baixarBlob, baixarTexto: baixarTexto,
    carimboArquivo: carimboArquivo, dataHoraLegivel: dataHoraLegivel,
    animarValor: animarValor, soma: soma, desvioPadrao: desvioPadrao
  };
})(window);
