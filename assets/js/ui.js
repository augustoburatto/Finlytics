/* ============================================================
   Finlytics — componentes de interface (toast, modal, multiselect)
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- Toast ---------------- */
  function toast(titulo, texto, tipo, duracao) {
    var caixa = document.getElementById('toasts');
    if (!caixa) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (tipo || 'info');
    el.innerHTML = '<div class="toast-barra"></div><div><strong>' + Util.escapar(titulo) + '</strong>' +
                   (texto ? '<p>' + Util.escapar(texto) + '</p>' : '') + '</div>';
    caixa.appendChild(el);
    var t = setTimeout(fechar, duracao || 4600);
    el.addEventListener('click', fechar);
    function fechar() {
      clearTimeout(t);
      if (!el.parentNode) return;
      el.classList.add('saindo');
      setTimeout(function () { el.remove(); }, 220);
    }
  }

  /* ---------------- Modal ---------------- */
  var fundo = null, tituloEl = null, corpoEl = null, acoesEl = null, aoFecharEsc = null;

  function iniciarModal() {
    fundo = document.getElementById('modal-fundo');
    tituloEl = document.getElementById('modal-titulo');
    corpoEl = document.getElementById('modal-corpo');
    acoesEl = document.getElementById('modal-acoes');
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fecharModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && fundo && !fundo.classList.contains('oculto')) fecharModal();
    });
  }

  function modal(opcoes) {
    if (!fundo) iniciarModal();
    tituloEl.textContent = opcoes.titulo || '';
    corpoEl.innerHTML = opcoes.corpo || '';
    acoesEl.innerHTML = '';
    (opcoes.acoes || [{ rotulo: 'Fechar' }]).forEach(function (a) {
      var b = document.createElement('button');
      b.className = 'btn ' + (a.classe || 'btn-ghost');
      b.textContent = a.rotulo;
      b.addEventListener('click', function () {
        if (a.aoClicar) { if (a.aoClicar() === false) return; }
        fecharModal();
      });
      acoesEl.appendChild(b);
    });
    fundo.classList.remove('oculto');
    aoFecharEsc = opcoes.aoFechar || null;
    var primeiro = acoesEl.querySelector('.btn-primario, .btn-perigo') || acoesEl.querySelector('button');
    if (primeiro) primeiro.focus();
  }

  function fecharModal() {
    if (!fundo) return;
    fundo.classList.add('oculto');
    if (aoFecharEsc) { var f = aoFecharEsc; aoFecharEsc = null; f(); }
  }

  /* ---------------- Overlay de carregamento ---------------- */
  function carregando(ativo) {
    var el = document.getElementById('carregando');
    if (el) el.classList.toggle('oculto', !ativo);
  }

  /* ---------------- Multiselect ---------------- */
  var abertos = [];

  function MultiSelect(container, config) {
    this.container = container;
    this.rotuloVazio = config.rotuloVazio || 'Todos';
    this.rotuloPlural = config.rotuloPlural || 'itens';
    this.comBusca = config.comBusca !== false;
    this.aoMudar = config.aoMudar || function () {};
    this.opcoes = [];
    this.selecionados = [];
    this.filtroTexto = '';
    this.montar();
    abertos.push(this);
  }

  MultiSelect.prototype.montar = function () {
    var self = this;
    this.raiz = document.createElement('div');
    this.raiz.className = 'ms';
    this.raiz.innerHTML =
      '<button type="button" class="ms-botao"><span class="ms-rotulo">' + this.rotuloVazio + '</span>' +
      '<svg class="seta" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>' +
      '<div class="ms-painel">' +
        (this.comBusca ? '<input type="text" class="ms-busca" placeholder="filtrar...">' : '') +
        '<div class="ms-acoes"><button type="button" data-acao="todos">Selecionar todos</button>' +
        '<button type="button" data-acao="nenhum">Limpar</button></div>' +
        '<div class="ms-lista"></div>' +
      '</div>';
    this.container.innerHTML = '';
    this.container.appendChild(this.raiz);

    this.botao = this.raiz.querySelector('.ms-botao');
    this.rotuloEl = this.raiz.querySelector('.ms-rotulo');
    this.listaEl = this.raiz.querySelector('.ms-lista');
    this.buscaEl = this.raiz.querySelector('.ms-busca');

    this.botao.addEventListener('click', function (e) {
      e.stopPropagation();
      var vaiAbrir = !self.raiz.classList.contains('aberto');
      abertos.forEach(function (m) { m.raiz.classList.remove('aberto'); });
      if (vaiAbrir) {
        self.raiz.classList.add('aberto');
        if (self.buscaEl) setTimeout(function () { self.buscaEl.focus(); }, 30);
      }
    });
    this.raiz.querySelector('.ms-painel').addEventListener('click', function (e) { e.stopPropagation(); });

    if (this.buscaEl) {
      this.buscaEl.addEventListener('input', function () {
        self.filtroTexto = Util.normalizar(this.value);
        self.renderLista();
      });
    }
    this.raiz.querySelectorAll('.ms-acoes button').forEach(function (b) {
      b.addEventListener('click', function () {
        var visiveis = self.opcoesVisiveis().map(function (o) { return o.valor; });
        if (b.dataset.acao === 'todos') {
          visiveis.forEach(function (v) {
            if (self.selecionados.indexOf(v) === -1) self.selecionados.push(v);
          });
        } else {
          self.selecionados = self.selecionados.filter(function (v) { return visiveis.indexOf(v) === -1; });
        }
        self.renderLista(); self.atualizarRotulo(); self.aoMudar(self.selecionados.slice());
      });
    });
  };

  MultiSelect.prototype.opcoesVisiveis = function () {
    var f = this.filtroTexto;
    if (!f) return this.opcoes;
    return this.opcoes.filter(function (o) { return Util.normalizar(o.rotulo).indexOf(f) > -1; });
  };

  MultiSelect.prototype.definirOpcoes = function (opcoes, manterSelecao) {
    this.opcoes = opcoes || [];
    var validos = this.opcoes.map(function (o) { return o.valor; });
    if (manterSelecao) {
      this.selecionados = this.selecionados.filter(function (v) { return validos.indexOf(v) > -1; });
    } else {
      this.selecionados = [];
    }
    this.renderLista();
    this.atualizarRotulo();
  };

  MultiSelect.prototype.definirSelecao = function (vals) {
    this.selecionados = (vals || []).slice();
    this.renderLista();
    this.atualizarRotulo();
  };

  MultiSelect.prototype.renderLista = function () {
    var self = this;
    var visiveis = this.opcoesVisiveis();
    if (!visiveis.length) {
      this.listaEl.innerHTML = '<div class="ms-vazio">Nada encontrado</div>';
      return;
    }
    this.listaEl.innerHTML = visiveis.map(function (o) {
      var marcado = self.selecionados.indexOf(o.valor) > -1;
      return '<label class="ms-opcao"><input type="checkbox" value="' + Util.escapar(o.valor) + '"' +
             (marcado ? ' checked' : '') + '>' +
             (o.cor ? '<i class="pontinho" style="background:' + o.cor + '"></i>' : '') +
             '<span>' + Util.escapar(o.rotulo) + '</span>' +
             (o.extra ? '<span class="ms-extra">' + Util.escapar(o.extra) + '</span>' : '') +
             '</label>';
    }).join('');

    this.listaEl.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var v = inp.value;
        var real = self.opcoes.find(function (o) { return String(o.valor) === v; });
        var valor = real ? real.valor : v;
        var i = self.selecionados.indexOf(valor);
        if (inp.checked) { if (i === -1) self.selecionados.push(valor); }
        else if (i > -1) self.selecionados.splice(i, 1);
        self.atualizarRotulo();
        self.aoMudar(self.selecionados.slice());
      });
    });
  };

  MultiSelect.prototype.atualizarRotulo = function () {
    var n = this.selecionados.length;
    if (!n) { this.rotuloEl.textContent = this.rotuloVazio; return; }
    if (n === 1) {
      var o = this.opcoes.find(function (x) { return x.valor === this.selecionados[0]; }, this);
      this.rotuloEl.textContent = o ? o.rotulo : String(this.selecionados[0]);
      return;
    }
    if (n === this.opcoes.length) { this.rotuloEl.textContent = this.rotuloVazio; return; }
    this.rotuloEl.textContent = n + ' ' + this.rotuloPlural;
  };

  document.addEventListener('click', function () {
    abertos.forEach(function (m) { m.raiz.classList.remove('aberto'); });
  });

  global.UI = {
    toast: toast,
    modal: modal,
    fecharModal: fecharModal,
    carregando: carregando,
    MultiSelect: MultiSelect
  };
})(window);
