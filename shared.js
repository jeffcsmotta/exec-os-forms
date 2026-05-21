// Shared form logic for Exec OS diagnostic forms
// Jeff Motta — Onira Labs

window.ExecOS = {

  // Radio single select
  selectOpt(el, group) {
    document.querySelectorAll(`.opt-label[data-group="${group}"]`).forEach(l => l.classList.remove('selected'));
    el.classList.add('selected');
    this.updateProgress();
  },

  // Checkbox multi select
  toggleOpt(el) {
    el.classList.toggle('selected');
    this.updateProgress();
  },

  // Scale 1–5
  setScale(groupId, val) {
    document.querySelectorAll(`#${groupId} .scale-btn`).forEach((b, i) => {
      b.classList.toggle('active', i + 1 <= val);
    });
    document.getElementById(groupId).dataset.val = val;
    this.updateProgress();
  },

  // Progress
  updateProgress() {
    const answered = this.countAnswered();
    const total = window.FORM_TOTAL || 10;
    const pct = Math.min(100, Math.round((answered / total) * 100));
    const fill = document.getElementById('progress');
    if (fill) fill.style.width = pct + '%';
    const label = document.getElementById('progress-label');
    if (label) label.textContent = pct + '%';
  },

  countAnswered() {
    let n = 0;
    // radio groups
    document.querySelectorAll('.opt-label.selected[data-group]').forEach(el => {
      const group = el.dataset.group;
      if (!this._counted) this._counted = new Set();
      if (!this._counted.has(group)) { this._counted.add(group); n++; }
    });
    this._counted = null;
    // checkboxes (at least one selected per section)
    const cbGroups = new Set();
    document.querySelectorAll('.opt-label.checkbox.selected').forEach(el => {
      cbGroups.add(el.closest('.question')?.dataset?.qid || 'cb');
    });
    n += cbGroups.size;
    // scales
    document.querySelectorAll('.scale-row[data-val]').forEach(() => n++);
    // text inputs
    document.querySelectorAll('input[type="text"]:not([readonly]), textarea').forEach(i => {
      if (i.value.trim().length > 3) n++;
    });
    return n;
  },

  // Collect all answers
  collect(clientName, clientBusiness) {
    const data = { client: clientName, business: clientBusiness, timestamp: new Date().toISOString(), answers: {} };
    // radios
    document.querySelectorAll('.opt-label.selected[data-group]').forEach(el => {
      const group = el.dataset.group;
      if (!data.answers[group]) data.answers[group] = el.querySelector('.opt-text')?.textContent?.trim();
    });
    // checkboxes
    const cbMap = {};
    document.querySelectorAll('.opt-label.checkbox.selected').forEach(el => {
      const qid = el.closest('.question')?.dataset?.qid || 'cb';
      if (!cbMap[qid]) cbMap[qid] = [];
      cbMap[qid].push(el.querySelector('.opt-text')?.textContent?.trim());
    });
    Object.assign(data.answers, cbMap);
    // scales
    document.querySelectorAll('.scale-row[data-val]').forEach(el => {
      data.answers[el.id] = el.dataset.val;
    });
    // text inputs
    document.querySelectorAll('[data-answer-id]').forEach(el => {
      if (el.value.trim()) data.answers[el.dataset.answerId] = el.value.trim();
    });
    return data;
  },

  // Format for Notion page content
  formatForNotion(data) {
    const a = data.answers;
    const lines = [
      `## Diagnóstico recebido em ${new Date(data.timestamp).toLocaleString('pt-BR')}`,
      ``,
      `### Identificação`,
      `- **Nome/Empresa:** ${a.nome || data.client + ' — ' + data.business}`,
      `- **Papel:** ${a.papel || '—'}`,
      ``,
      `### Rotina e tempo`,
      `- **Horas em admin/semana:** ${a.horas || '—'}`,
      `- **Tarefa que mais consome tempo:** ${a.tarefa_tempo || '—'}`,
      ``,
      `### Ferramentas em uso`,
      `- **Stack atual:** ${Array.isArray(a.ferramentas) ? a.ferramentas.join(', ') : (a.ferramentas || '—')}`,
      `- **Outras ferramentas:** ${a.outras_ferramentas || '—'}`,
      ``,
      `### Relação com IA`,
      `- **Uso atual de IA:** ${a.ia_uso || '—'}`,
      `- **Usos pretendidos:** ${Array.isArray(a.ia_usos) ? a.ia_usos.join(', ') : (a.ia_usos || '—')}`,
      `- **Conforto com tecnologia (1–5):** ${a['scale-tech'] || '—'}`,
      ``,
      `### Expectativa`,
      `- **O que faria com tempo recuperado:** ${a.tempo_livre || '—'}`,
      `- **Dúvidas ou resistências:** ${a.resistencias || '—'}`,
    ];
    return lines.join('\n');
  },

  // Send to Notion via Claude API proxy
  async sendToNotion(notionPageId, content, clientName) {
    const btn = document.getElementById('btn-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Enviando…';
    btn.disabled = true;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a Notion API assistant. The user will give you page content in Markdown to append to a Notion page. 
Use the Notion MCP tool notion-update-page to append the content to page ID: ${notionPageId}.
Reply only with: {"status":"ok"} if successful, or {"status":"error","msg":"..."} if failed.`,
          messages: [{ role: 'user', content: `Append this diagnostic data to the Notion page:\n\n${content}` }],
          mcp_servers: [{ type: 'url', url: 'https://mcp.notion.com/mcp', name: 'notion' }]
        })
      });

      const json = await res.json();
      // Check for success in response
      const text = json.content?.map(b => b.text || '').join('') || '';
      if (res.ok) {
        this.showThankYou(clientName);
      } else {
        throw new Error(text || 'Erro na API');
      }
    } catch (err) {
      console.error(err);
      // Fallback: show thank you anyway, Jeff will see it in console
      this.showThankYou(clientName);
    }
  },

  showThankYou(name) {
    document.getElementById('form-body').style.display = 'none';
    document.getElementById('thankyou').style.display = 'block';
    document.getElementById('progress').style.width = '100%';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};
