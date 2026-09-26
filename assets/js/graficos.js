/* ============================================================
   Finlytics — gráficos (Chart.js)
   ============================================================ */
(function (global) {
  'use strict';

  var instancias = {};

  function disponivel() { return typeof Chart !== 'undefined'; }

  function cssVar(nome) {
    return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  }

  function cores() {
    return {
      texto: cssVar('--txt-2') || '#9aa7bd',
      textoForte: cssVar('--txt') || '#e9edf6',
      grade: cssVar('--grade') || 'rgba(255,255,255,.07)',
      fundoTooltip: cssVar('--bg-2') || '#0d1220',
      borda: cssVar('--borda-forte') || 'rgba(255,255,255,.18)',
      s1: cssVar('--s1') || '#6366f1',
      s2: cssVar('--s2') || '#22d3ee',
      s3: cssVar('--s3') || '#34d399',
      s4: cssVar('--s4') || '#fbbf24'
    };
  }

  function base() {
    var c = cores();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 520, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: false,
          labels: { color: c.texto, usePointStyle: true, pointStyle: 'circle', boxWidth: 7, padding: 14,
                    font: { family: 'Inter', size: 11.5 } }
        },
        tooltip: {
          backgroundColor: c.fundoTooltip,
          borderColor: c.borda,
          borderWidth: 1,
          titleColor: c.textoForte,
          bodyColor: c.texto,
          padding: 11,
          cornerRadius: 10,
          displayColors: true,
          usePointStyle: true,
          titleFont: { family: 'Inter', size: 12.5, weight: '600' },
          bodyFont: { family: 'Inter', size: 12.5 }
        }
      }
    };
  }

  function eixoValor(c, opcoes) {
    return Object.assign({
      border: { display: false },
      grid: { color: c.grade, drawTicks: false },
      ticks: {
        color: c.texto, padding: 8, font: { family: 'Inter', size: 11 },
        callback: function (v) { return Util.moeda(v, true); }
      }
    }, opcoes || {});
  }

  function eixoCategoria(c, opcoes) {
    return Object.assign({
      border: { display: false },
      grid: { display: false },
      ticks: { color: c.texto, font: { family: 'Inter', size: 11 }, maxRotation: 0, autoSkipPadding: 12 }
    }, opcoes || {});
  }

  function render(id, config) {
    if (!disponivel()) return;
    var canvas = document.getElementById(id);
    if (!canvas) return;
    if (instancias[id]) { instancias[id].destroy(); delete instancias[id]; }
    instancias[id] = new Chart(canvas.getContext('2d'), config);
    return instancias[id];
  }

  function destruirTodos() {
    Object.keys(instancias).forEach(function (k) { instancias[k].destroy(); delete instancias[k]; });
  }

  function baixarPNG(id, nome) {
    var g = instancias[id];
    if (!g) { UI.toast('Gráfico indisponível', 'Não há dados para exportar.', 'alerta'); return; }
    var canvas = g.canvas;
    var tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = canvas.height;
    var ctx = tmp.getContext('2d');
    ctx.fillStyle = cssVar('--bg-2') || '#0d1220';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, 0);
    tmp.toBlob(function (blob) {
      Util.baixarBlob(blob, (nome || 'grafico') + '-' + Util.carimboArquivo() + '.png');
    });
  }

  function degrade(ctx, area, cor) {
    if (!area) return Util.hexAlfa(cor, .25);
    var g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, Util.hexAlfa(cor, .55));
    g.addColorStop(1, Util.hexAlfa(cor, .04));
    return g;
  }

  /* ---------------- Evolução mensal ---------------- */
  function evolucao(dados) {
    var c = cores(), op = base();
    op.plugins.legend.display = true;
    op.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + ': ' + Util.moeda(ctx.parsed.y); }
    };
    render('g-evolucao', {
      type: 'bar',
      data: {
        labels: dados.rotulos,
        datasets: [
          {
            label: 'Gasto do mês',
            data: dados.valores,
            backgroundColor: function (ctx) {
              var ch = ctx.chart;
              return degrade(ch.ctx, ch.chartArea, c.s1);
            },
            borderColor: c.s1,
            borderWidth: 1.5,
            borderRadius: 7,
            borderSkipped: false,
            maxBarThickness: 46,
            order: 2
          },
          {
            label: 'Média móvel (3m)',
            data: dados.media,
            type: 'line',
            borderColor: c.s4,
            backgroundColor: c.s4,
            borderWidth: 2,
            tension: .35,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderDash: [5, 4],
            order: 1
          }
        ]
      },
      options: Object.assign(op, {
        scales: { x: eixoCategoria(c), y: eixoValor(c, { beginAtZero: true }) }
      })
    });
  }

  /* ---------------- Fluxo de caixa mensal ---------------- */
  function fluxoCaixa(dados) {
    var c = cores(), op = base();
    op.plugins.legend.display = true;
    op.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + ': ' + Util.moeda(Math.abs(ctx.parsed.y)); }
    };
    render('g-evolucao', {
      type: 'bar',
      data: {
        labels: dados.rotulos,
        datasets: [
          {
            label: 'Receitas', data: dados.receitas,
            backgroundColor: Util.hexAlfa('#34d399', .75), borderColor: '#34d399', borderWidth: 1,
            borderRadius: 6, borderSkipped: false, maxBarThickness: 26, order: 3
          },
          {
            label: 'Despesas', data: dados.despesas.map(function (v) { return -v; }),
            backgroundColor: Util.hexAlfa('#fb7185', .75), borderColor: '#fb7185', borderWidth: 1,
            borderRadius: 6, borderSkipped: false, maxBarThickness: 26, order: 3
          },
          {
            label: 'Saldo do mês', data: dados.saldo, type: 'line',
            borderColor: c.s1, backgroundColor: c.s1, borderWidth: 2.2,
            tension: .3, pointRadius: 2.5, pointHoverRadius: 5, order: 1
          }
        ]
      },
      options: Object.assign(op, {
        scales: {
          x: eixoCategoria(c, { stacked: false, grid: { display: false } }),
          y: eixoValor(c, {
            grid: { color: c.grade, drawTicks: false },
            ticks: { color: c.texto, padding: 8, font: { family: 'Inter', size: 11 },
                     callback: function (v) { return Util.moeda(Math.abs(v), true); } }
          })
        }
      })
    });
  }

  /* ---------------- Saldo mensal + acumulado ---------------- */
  function saldoMensal(dados) {
    var c = cores(), op = base();
    op.plugins.legend.display = true;
    op.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + ': ' + Util.moeda(ctx.parsed.y); }
    };
    render('g-saldo', {
      type: 'bar',
      data: {
        labels: dados.rotulos,
        datasets: [
          {
            label: 'Saldo do mês', data: dados.saldos,
            backgroundColor: dados.saldos.map(function (v) {
              return Util.hexAlfa(v >= 0 ? '#34d399' : '#fb7185', .72);
            }),
            borderColor: dados.saldos.map(function (v) { return v >= 0 ? '#34d399' : '#fb7185'; }),
            borderWidth: 1, borderRadius: 6, borderSkipped: false, maxBarThickness: 40, order: 2
          },
          {
            label: 'Saldo acumulado', data: dados.acumulado, type: 'line', yAxisID: 'y2',
            borderColor: c.s1, backgroundColor: Util.hexAlfa('#6366f1', .1),
            borderWidth: 2.4, tension: .3, pointRadius: 0, pointHoverRadius: 5, fill: true, order: 1
          }
        ]
      },
      options: Object.assign(op, {
        scales: {
          x: eixoCategoria(c),
          y: eixoValor(c),
          y2: {
            position: 'right', border: { display: false }, grid: { display: false },
            ticks: { color: c.texto, font: { family: 'Inter', size: 10.5 },
                     callback: function (v) { return Util.moeda(v, true); } }
          }
        }
      })
    });
  }

  /* ---------------- Categorias (rosca) ---------------- */
  function categorias(dados) {
    var c = cores(), op = base();
    op.interaction = { mode: 'nearest', intersect: true };
    op.cutout = '62%';
    op.plugins.legend.display = true;
    op.plugins.legend.position = 'right';
    op.plugins.tooltip.callbacks = {
      label: function (ctx) {
        var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
        var p = total ? (ctx.parsed / total) * 100 : 0;
        return ' ' + ctx.label + ': ' + Util.moeda(ctx.parsed) + ' (' + Util.percentual(p) + ')';
      }
    };
    render(dados.id || 'g-categorias', {
      type: 'doughnut',
      data: {
        labels: dados.rotulos,
        datasets: [{
          data: dados.valores,
          backgroundColor: dados.cores,
          borderColor: cssVar('--bg-2') || '#0d1220',
          borderWidth: 2,
          hoverOffset: 10
        }]
      },
      options: op
    });
  }

  /* ---------------- Acumulado ---------------- */
  function acumulado(dados) {
    var c = cores(), op = base();
    var cor = dados.cor || c.s3;
    var rotulo = dados.rotulo || 'Acumulado';
    op.plugins.tooltip.callbacks = {
      label: function (ctx) { return rotulo + ': ' + Util.moeda(ctx.parsed.y); }
    };
    render('g-acumulado', {
      type: 'line',
      data: {
        labels: dados.rotulos,
        datasets: [{
          label: rotulo,
          data: dados.valores,
          borderColor: cor,
          backgroundColor: function (ctx) {
            var ch = ctx.chart;
            return degrade(ch.ctx, ch.chartArea, cor);
          },
          fill: true,
          tension: .32,
          borderWidth: 2.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: cor
        }]
      },
      options: Object.assign(op, {
        scales: { x: eixoCategoria(c), y: eixoValor(c, { beginAtZero: dados.zero !== false }) }
      })
    });
  }

  /* ---------------- Pareto ---------------- */
  function pareto(dados) {
    var c = cores(), op = base();
    op.plugins.legend.display = true;
    op.plugins.tooltip.callbacks = {
      label: function (ctx) {
        if (ctx.dataset.yAxisID === 'y2') return 'Acumulado: ' + Util.percentual(ctx.parsed.y);
        return 'Gasto: ' + Util.moeda(ctx.parsed.y);
      }
    };
    render('g-pareto', {
      type: 'bar',
      data: {
        labels: dados.rotulos,
        datasets: [
          {
            label: 'Gasto por categoria',
            data: dados.valores,
            backgroundColor: dados.cores,
            borderRadius: 6,
            maxBarThickness: 44,
            order: 2
          },
          {
            label: '% acumulado',
            data: dados.acumuladoPct,
            type: 'line',
            yAxisID: 'y2',
            borderColor: c.s4,
            backgroundColor: c.s4,
            borderWidth: 2,
            tension: .3,
            pointRadius: 2.5,
            order: 1
          }
        ]
      },
      options: Object.assign(op, {
        scales: {
          x: eixoCategoria(c, { ticks: { color: c.texto, font: { family: 'Inter', size: 10.5 }, maxRotation: 38, minRotation: 0 } }),
          y: eixoValor(c, { beginAtZero: true }),
          y2: {
            position: 'right', beginAtZero: true, max: 100,
            border: { display: false },
            grid: { display: false },
            ticks: { color: c.texto, font: { family: 'Inter', size: 10.5 },
                     callback: function (v) { return v + '%'; } }
          }
        }
      })
    });
  }

  /* ---------------- Top lançamentos ---------------- */
  function topGastos(dados) {
    var c = cores(), op = base();
    op.indexAxis = 'y';
    op.interaction = { mode: 'nearest', intersect: true };
    op.plugins.tooltip.callbacks = {
      title: function (ctx) { return dados.titulos[ctx[0].dataIndex]; },
      label: function (ctx) { return Util.moeda(ctx.parsed.x) + ' · ' + dados.subtitulos[ctx.dataIndex]; }
    };
    render('g-top', {
      type: 'bar',
      data: {
        labels: dados.rotulos,
        datasets: [{
          data: dados.valores,
          backgroundColor: dados.cores,
          borderRadius: 6,
          maxBarThickness: 22
        }]
      },
      options: Object.assign(op, {
        scales: {
          x: eixoValor(c, { beginAtZero: true }),
          y: eixoCategoria(c, { ticks: { color: c.texto, font: { family: 'Inter', size: 11 }, crossAlign: 'far' } })
        }
      })
    });
  }

  /* ---------------- Comparativo entre anos ---------------- */
  function comparativoAnos(series) {
    var c = cores(), op = base();
    op.plugins.legend.display = true;
    op.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + ': ' + (ctx.parsed.y == null ? '—' : Util.moeda(ctx.parsed.y)); }
    };
    render('g-anos', {
      type: 'line',
      data: {
        labels: Util.MESES_ABREV,
        datasets: series.map(function (s, i) {
          var cor = Util.PALETA[i % Util.PALETA.length];
          return {
            label: String(s.ano),
            data: s.dados,
            borderColor: cor,
            backgroundColor: Util.hexAlfa(cor, .12),
            borderWidth: 2.2,
            tension: .34,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            spanGaps: true,
            fill: series.length === 1
          };
        })
      },
      options: Object.assign(op, {
        scales: { x: eixoCategoria(c), y: eixoValor(c, { beginAtZero: true }) }
      })
    });
  }

  global.Graficos = {
    disponivel: disponivel,
    render: render,
    destruirTodos: destruirTodos,
    baixarPNG: baixarPNG,
    evolucao: evolucao,
    fluxoCaixa: fluxoCaixa,
    saldoMensal: saldoMensal,
    categorias: categorias,
    acumulado: acumulado,
    pareto: pareto,
    topGastos: topGastos,
    comparativoAnos: comparativoAnos
  };
})(window);
