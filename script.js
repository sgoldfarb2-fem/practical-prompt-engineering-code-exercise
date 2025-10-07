(function() {
  const STORAGE_KEY = 'promptLibrary.items.v1';
  const NOTES_KEY = 'promptNotes.v1'; // localStorage key for notes
  const META_VERSION = 'v1';

  const form = document.getElementById('prompt-form');
  const titleInput = document.getElementById('prompt-title');
  const contentInput = document.getElementById('prompt-content');
  const modelInput = document.getElementById('model-name');
  const errorEl = document.getElementById('form-error');
  const listEl = document.getElementById('prompts-list');
  const emptyEl = document.getElementById('prompts-empty');
  const countEl = document.getElementById('prompt-count');
  const cardTemplate = document.getElementById('prompt-card-template');

  function loadPrompts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data
        .filter(p => p && typeof p.id === 'string')
        .map(p => hydrateLegacyPrompt(p))
        .sort((a,b) => new Date(b.metadata?.createdAt || 0) - new Date(a.metadata?.createdAt || 0));
    } catch (e) {
      console.warn('Failed to parse stored prompts', e);
      return [];
    }
  }

  function hydrateLegacyPrompt(p) {
    // If metadata already exists and passes minimal validation, return as-is
    if (p && p.metadata && typeof p.metadata === 'object' && p.metadata.model && p.metadata.createdAt) {
      return p;
    }
    try {
      const model = typeof p.model === 'string' ? p.model : 'unknown-model';
      const meta = trackModel(model, p.content || '');
      p.metadata = meta;
      return p;
    } catch {
      // Fallback minimal metadata
      p.metadata = {
        model: 'unknown',
        createdAt: new Date(p.createdAt || Date.now()).toISOString(),
        updatedAt: new Date(p.createdAt || Date.now()).toISOString(),
        tokenEstimate: estimateTokens(p.content || '', false)
      };
      return p;
    }
  }

  function savePrompts(prompts) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    } catch (e) {
      console.error('Failed to save prompts', e);
    }
  }

  function createId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function trim(str) { return (str || '').trim(); }

  function render(prompts) {
    listEl.innerHTML = '';

    if (!prompts.length) {
      emptyEl.hidden = false;
      countEl.textContent = '0';
      return;
    }
    emptyEl.hidden = true;
    countEl.textContent = String(prompts.length);

    const frag = document.createDocumentFragment();
    prompts.forEach(p => {
      const node = cardTemplate.content.firstElementChild.cloneNode(true);
      node.dataset.id = p.id;
      node.querySelector('.card-title').textContent = p.title;
      node.querySelector('.card-preview').textContent = preview(p.content);
      const delBtn = node.querySelector('.delete-btn');
      delBtn.addEventListener('click', () => deletePrompt(p.id));

      // Metadata injection
      const metaHost = node.querySelector('[data-role=metadata]');
      if (metaHost) {
        try {
          metaHost.replaceChildren(buildMetadataDisplay(p.metadata));
        } catch (err) {
          console.warn('Failed to render metadata', err);
          metaHost.textContent = 'Metadata error';
        }
      }

      // Rating component mount point (insert before actions)
      const main = node.querySelector('.card-main');
      main.appendChild(buildRatingElement(p));
      // Notes section injection
      main.appendChild(buildNotesSection(p.id));
      frag.appendChild(node);
    });
    listEl.appendChild(frag);
  }

  function preview(text) {
    const words = trim(text).split(/\s+/).slice(0, 12);
    const joined = words.join(' ');
    return joined + (trim(text).split(/\s+/).length > words.length ? ' …' : '');
  }

  function deletePrompt(id) {
    const prompts = loadPrompts().filter(p => p.id !== id);
    savePrompts(prompts);
    render(prompts);
  }

  /* Rating Logic */
  const MAX_STARS = 5;

  function normalizeRating(val) {
    if (val == null) return null;
    const n = Number(val);
    return n >= 1 && n <= MAX_STARS ? n : null;
  }

  function setRating(promptId, value) {
    const prompts = loadPrompts();
    const prompt = prompts.find(p => p.id === promptId);
    if (!prompt) return;
    const current = normalizeRating(prompt.userRating);
    const next = normalizeRating(value);
    // Toggle off if same value clicked
    prompt.userRating = (current && next && current === next) ? null : next;
    savePrompts(prompts);
    updateCardRatingUI(promptId, prompt.userRating);
  }

  function buildRatingElement(prompt) {
    // Ensure property exists for legacy stored prompts
    if (!('userRating' in prompt)) prompt.userRating = null;
    const wrap = document.createElement('div');
    wrap.className = 'rating';
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', `Rate ${prompt.title}`);
    for (let i = 1; i <= MAX_STARS; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'star' + (prompt.userRating >= i ? ' filled' : '');
      btn.dataset.value = String(i);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(prompt.userRating === i));
      btn.setAttribute('aria-label', `${i} star${i>1?'s':''}`);
      btn.textContent = prompt.userRating >= i ? '★' : '☆';
      btn.addEventListener('click', () => setRating(prompt.id, i));
      btn.addEventListener('keydown', (e) => handleStarKey(e, prompt.id));
      btn.addEventListener('pointerenter', () => previewHover(wrap, i));
      btn.addEventListener('pointerleave', () => clearHover(wrap, prompt.userRating));
      wrap.appendChild(btn);
    }
    return wrap;
  }

  function updateCardRatingUI(promptId, rating) {
    const card = listEl.querySelector(`[data-id="${promptId}"]`);
    if (!card) return;
    const wrap = card.querySelector('.rating');
    if (!wrap) return;
    [...wrap.querySelectorAll('button.star')].forEach(btn => {
      const val = Number(btn.dataset.value);
      const filled = rating != null && rating >= val;
      btn.classList.toggle('filled', filled);
      btn.textContent = filled ? '★' : '☆';
      btn.setAttribute('aria-checked', String(rating === val));
    });
  }

  function handleStarKey(e, promptId) {
    const key = e.key;
    const target = e.currentTarget;
    if (!target || !target.dataset.value) return;
    const currentVal = Number(target.dataset.value);
    if (['ArrowRight','ArrowUp'].includes(key)) {
      e.preventDefault();
      const next = Math.min(MAX_STARS, currentVal + 1);
      setRating(promptId, next);
      focusStar(promptId, next);
    } else if (['ArrowLeft','ArrowDown'].includes(key)) {
      e.preventDefault();
      const prev = Math.max(1, currentVal - 1);
      setRating(promptId, prev);
      focusStar(promptId, prev);
    } else if (key === 'Home') {
      e.preventDefault();
      setRating(promptId, 1); focusStar(promptId, 1);
    } else if (key === 'End') {
      e.preventDefault();
      setRating(promptId, MAX_STARS); focusStar(promptId, MAX_STARS);
    } else if (key === 'Enter' || key === ' ') {
      e.preventDefault();
      setRating(promptId, currentVal);
    } else if (key === 'Backspace' || key === 'Delete' || key === 'Escape') {
      e.preventDefault();
      setRating(promptId, null);
    }
  }

  function focusStar(promptId, starVal) {
    const card = listEl.querySelector(`[data-id="${promptId}"]`);
    if (!card) return;
    const star = card.querySelector(`.rating button.star[data-value="${starVal}"]`);
    if (star) star.focus();
  }

  function previewHover(wrap, hoverVal) {
    wrap.setAttribute('data-hovering', 'true');
    wrap.querySelectorAll('button.star').forEach(btn => {
      const val = Number(btn.dataset.value);
      btn.textContent = val <= hoverVal ? '★' : '☆';
    });
  }
  function clearHover(wrap, rating) {
    wrap.removeAttribute('data-hovering');
    wrap.querySelectorAll('button.star').forEach(btn => {
      const val = Number(btn.dataset.value);
      btn.textContent = rating && val <= rating ? '★' : '☆';
    });
  }

  function handleSubmit(e) {
    e.preventDefault();
    errorEl.textContent = '';

    const title = trim(titleInput.value);
    const content = trim(contentInput.value);
  const modelName = trim(modelInput.value);

    if (!title) {
      errorEl.textContent = 'Title is required.';
      titleInput.focus();
      return;
    }
    if (!content) {
      errorEl.textContent = 'Content is required.';
      contentInput.focus();
      return;
    }
    if (!modelName) {
      errorEl.textContent = 'Model is required.';
      modelInput.focus();
      return;
    }

    let metadata;
    try {
      metadata = trackModel(modelName, content);
    } catch (err) {
      errorEl.textContent = err.message || 'Metadata creation failed.';
      return;
    }

    const prompts = loadPrompts();
    prompts.unshift({ id: createId(), title, content, metadata });
    savePrompts(prompts);
    render(prompts);

    form.reset();
    titleInput.focus();
  }

  function init() {
    form.addEventListener('submit', handleSubmit);
    render(loadPrompts());
  }

  /* ================= Notes Feature ================= */
  // Data shape: { [promptId]: [ { id, content, createdAt, updatedAt } ] }

  function loadNotesStore() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      console.warn('Notes storage corrupted, resetting.', e);
      return {};
    }
  }

  function saveNotesStore(store) {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(store));
    } catch (e) {
      console.error('Failed to persist notes', e);
      // Could expose inline error in each notes section on next render
    }
  }

  function getNotes(promptId) {
    const store = loadNotesStore();
    const arr = Array.isArray(store[promptId]) ? store[promptId] : [];
    return arr
      .filter(n => n && typeof n.id === 'string' && typeof n.content === 'string')
      .sort((a,b) => b.createdAt - a.createdAt);
  }

  function addNote(promptId, content) {
    const trimmed = (content || '').trim();
    if (!trimmed) return { error: 'Note cannot be empty.' };
    const store = loadNotesStore();
    if (!Array.isArray(store[promptId])) store[promptId] = [];
    const note = { id: noteId(), content: trimmed, createdAt: Date.now(), updatedAt: Date.now() };
    store[promptId].unshift(note);
    saveNotesStore(store);
    return { note };
  }

  function updateNote(promptId, noteIdVal, newContent) {
    const store = loadNotesStore();
    const list = Array.isArray(store[promptId]) ? store[promptId] : [];
    const note = list.find(n => n.id === noteIdVal);
    if (!note) return { error: 'Note not found.' };
    const val = (newContent || '').trim();
    if (!val) return { error: 'Note cannot be empty.' };
    note.content = val;
    note.updatedAt = Date.now();
    saveNotesStore(store);
    return { note };
  }

  function deleteNote(promptId, noteIdVal) {
    const store = loadNotesStore();
    const list = Array.isArray(store[promptId]) ? store[promptId] : [];
    const idx = list.findIndex(n => n.id === noteIdVal);
    if (idx === -1) return false;
    list.splice(idx, 1);
    saveNotesStore(store);
    return true;
  }

  function noteId() {
    return 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6);
  }

  function buildNotesSection(promptId) {
    const wrap = document.createElement('section');
    wrap.className = 'notes';
    wrap.dataset.promptId = promptId;
    wrap.setAttribute('aria-labelledby', `notes-title-${promptId}`);
    wrap.innerHTML = `
      <div class="notes-header">
        <h4 id="notes-title-${promptId}" class="notes-title">Notes</h4>
        <button type="button" class="add-note-btn" data-action="add-note" aria-label="Add note" data-prompt-id="${promptId}">Add</button>
      </div>
      <div class="notes-error" hidden></div>
      <ul class="notes-list" role="list"></ul>
    `;
    renderNotesList(promptId, wrap.querySelector('.notes-list'));
    attachNotesHandlers(wrap);
    return wrap;
  }

  function renderNotesList(promptId, listRoot) {
    listRoot.innerHTML = '';
    const notes = getNotes(promptId);
    if (!notes.length) {
      const empty = document.createElement('li');
      empty.innerHTML = '<p class="note-content" style="margin:0;font-size:.6rem;color:var(--text-soft);">No notes yet.</p>';
      listRoot.appendChild(empty);
      return;
    }
    const frag = document.createDocumentFragment();
    notes.forEach(n => frag.appendChild(renderNoteItem(promptId, n)));
    listRoot.appendChild(frag);
  }

  function renderNoteItem(promptId, note) {
    const li = document.createElement('li');
    li.className = 'note';
    li.dataset.noteId = note.id;
    const edited = note.updatedAt && note.updatedAt !== note.createdAt;
    li.innerHTML = `
      <p class="note-content" data-role="content"></p>
      <div class="note-meta">
        <time>${formatTs(note.createdAt)}${edited ? ' · Edited' : ''}</time>
        <div class="note-buttons">
          <button type="button" data-action="edit-note" aria-label="Edit note">Edit</button>
          <button type="button" data-action="delete-note" aria-label="Delete note">Del</button>
        </div>
      </div>
    `;
    li.querySelector('[data-role=content]').textContent = note.content;
    return li;
  }

  function formatTs(ts) {
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return '—'; }
  }

  function attachNotesHandlers(section) {
    section.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (!action) return;
      const promptId = section.dataset.promptId;
      if (!promptId) return;
      if (action === 'add-note') {
        spawnNewNoteEditor(section, promptId);
      } else if (action === 'edit-note') {
        const noteEl = target.closest('.note');
        if (noteEl) enterEditNote(section, promptId, noteEl.dataset.noteId);
      } else if (action === 'delete-note') {
        const noteEl = target.closest('.note');
        if (noteEl && confirm('Delete this note?')) {
          deleteNote(promptId, noteEl.dataset.noteId);
          renderNotesList(promptId, section.querySelector('.notes-list'));
        }
      } else if (action === 'save-note') {
        const editor = target.closest('.note');
        if (editor) commitNoteEdit(section, promptId, editor, false);
      } else if (action === 'cancel-note') {
        const editor = target.closest('.note');
        if (editor) cancelNoteEdit(section, promptId, editor);
      }
    });
    section.addEventListener('keydown', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLTextAreaElement)) return;
      if (e.key === 'Escape') {
        const editor = target.closest('.note');
        if (editor) cancelNoteEdit(section, section.dataset.promptId, editor);
      } else if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
        const editor = target.closest('.note');
        if (editor) commitNoteEdit(section, section.dataset.promptId, editor, false);
      }
    });
  }

  function spawnNewNoteEditor(section, promptId) {
    // Prevent multiple new editors at once
    if (section.querySelector('.note.editing[data-mode=new]')) {
      section.querySelector('.note.editing[data-mode=new] textarea')?.focus();
      return;
    }
    const listRoot = section.querySelector('.notes-list');
    const li = document.createElement('li');
    li.className = 'note editing';
    li.dataset.mode = 'new';
    li.innerHTML = `
      <div>
        <label class="visually-hidden" for="new-note-${promptId}">New note</label>
        <textarea id="new-note-${promptId}" data-role="editor" placeholder="Write a note..." aria-label="New note"></textarea>
        <div class="note-validation" data-role="validation"></div>
      </div>
      <div class="note-controls">
        <button type="button" data-action="save-note">Save</button>
        <button type="button" data-action="cancel-note">Cancel</button>
      </div>
    `;
    listRoot.insertBefore(li, listRoot.firstChild);
    li.querySelector('textarea').focus();
  }

  function enterEditNote(section, promptId, noteIdVal) {
    const node = section.querySelector(`.note[data-note-id="${noteIdVal}"]`);
    if (!node || node.classList.contains('editing')) return;
    const contentEl = node.querySelector('[data-role=content]');
    const original = contentEl.textContent || '';
    node.classList.add('editing');
    node.dataset.mode = 'edit';
    node.dataset.original = original;
    node.innerHTML = `
      <div>
        <label class="visually-hidden" for="edit-${noteIdVal}">Edit note</label>
        <textarea id="edit-${noteIdVal}" data-role="editor" aria-label="Edit note">${escapeHtml(original)}</textarea>
        <div class="note-validation" data-role="validation"></div>
      </div>
      <div class="note-controls">
        <button type="button" data-action="save-note">Save</button>
        <button type="button" data-action="cancel-note">Cancel</button>
      </div>
    `;
    node.querySelector('textarea').focus();
  }

  function commitNoteEdit(section, promptId, editorNode, silent) {
    const textarea = editorNode.querySelector('textarea');
    if (!textarea) return;
    const validationEl = editorNode.querySelector('[data-role=validation]');
    const mode = editorNode.dataset.mode;
    const value = textarea.value.trim();
    if (!value) {
      validationEl.textContent = 'Note cannot be empty.';
      textarea.focus();
      return;
    }
    if (mode === 'new') {
      const { error } = addNote(promptId, value);
      if (error) { validationEl.textContent = error; return; }
    } else if (mode === 'edit') {
      const noteIdVal = editorNode.dataset.noteId;
      const { error } = updateNote(promptId, noteIdVal, value);
      if (error) { validationEl.textContent = error; return; }
    }
    renderNotesList(promptId, section.querySelector('.notes-list'));
  }

  function cancelNoteEdit(section, promptId, editorNode) {
    const mode = editorNode.dataset.mode;
    if (mode === 'new') {
      editorNode.remove();
      // If list now empty, re-render to show empty state message
      const list = section.querySelector('.notes-list');
      if (!list.querySelector('.note')) renderNotesList(promptId, list);
    } else if (mode === 'edit') {
      // Restore original
      const original = editorNode.dataset.original || '';
      const noteIdVal = editorNode.dataset.noteId;
      const storeNote = getNotes(promptId).find(n => n.id === noteIdVal);
      if (storeNote) {
        const replacement = renderNoteItem(promptId, storeNote);
        editorNode.replaceWith(replacement);
      } else {
        editorNode.remove();
      }
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  document.addEventListener('DOMContentLoaded', init);

  /* ================= Metadata System ================= */
  // Types (JSDoc):
  /**
   * @typedef {Object} TokenEstimate
   * @property {number} min
   * @property {number} max
   * @property {'high'|'medium'|'low'} confidence
   */
  /**
   * @typedef {Object} MetadataObject
   * @property {string} model
   * @property {string} createdAt
   * @property {string} updatedAt
   * @property {TokenEstimate} tokenEstimate
   */

  function isIsoString(value) {
    if (typeof value !== 'string') return false;
    // Basic ISO 8601 UTC format validation
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && !isNaN(Date.parse(value));
  }

  /** Estimate tokens from text */
  function estimateTokens(text, isCode) {
    if (typeof text !== 'string') throw new Error('estimateTokens: text must be a string');
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    let min = Math.round(0.75 * words);
    let max = Math.round(0.25 * chars);
    if (isCode) {
      min = Math.round(min * 1.3);
      max = Math.round(max * 1.3);
    }
    if (min > max) { // ensure ordering
      const tmp = min; min = max; max = tmp;
    }
    const span = Math.max(min, max);
    let confidence = 'high';
    if (span >= 1000 && span <= 5000) confidence = 'medium';
    else if (span > 5000) confidence = 'low';
    return { min, max, confidence };
  }

  /** Create metadata for a model & content */
  function trackModel(modelName, content) {
    if (typeof modelName !== 'string' || !modelName.trim()) {
      throw new Error('trackModel: modelName must be a non-empty string');
    }
    const model = modelName.trim();
    if (model.length > 100) throw new Error('trackModel: modelName exceeds 100 characters');
    if (typeof content !== 'string') throw new Error('trackModel: content must be a string');
    const createdAt = new Date().toISOString();
    const tokenEstimate = estimateTokens(content, looksLikeCode(content));
    const meta = { model, createdAt, updatedAt: createdAt, tokenEstimate, _v: META_VERSION };
    validateMetadata(meta);
    return meta;
  }

  /** Update updatedAt, enforcing ordering */
  function updateTimestamps(metadata) {
    if (!metadata || typeof metadata !== 'object') throw new Error('updateTimestamps: metadata object required');
    if (!isIsoString(metadata.createdAt)) throw new Error('updateTimestamps: invalid createdAt');
    const updatedAt = new Date().toISOString();
    if (new Date(updatedAt) < new Date(metadata.createdAt)) {
      throw new Error('updateTimestamps: updatedAt earlier than createdAt');
    }
    metadata.updatedAt = updatedAt;
    validateMetadata(metadata);
    return metadata;
  }

  function validateMetadata(meta) {
    if (typeof meta.model !== 'string' || !meta.model.trim()) throw new Error('Metadata invalid: model required');
    if (meta.model.length > 100) throw new Error('Metadata invalid: model too long');
    if (!isIsoString(meta.createdAt)) throw new Error('Metadata invalid: createdAt not ISO string');
    if (!isIsoString(meta.updatedAt)) throw new Error('Metadata invalid: updatedAt not ISO string');
    if (new Date(meta.updatedAt) < new Date(meta.createdAt)) throw new Error('Metadata invalid: updatedAt earlier than createdAt');
    const te = meta.tokenEstimate;
    if (!te || typeof te !== 'object') throw new Error('Metadata invalid: tokenEstimate missing');
    if (typeof te.min !== 'number' || typeof te.max !== 'number') throw new Error('Metadata invalid: tokenEstimate bounds');
    if (!['high','medium','low'].includes(te.confidence)) throw new Error('Metadata invalid: confidence');
  }

  function looksLikeCode(text) {
    // Heuristic: presence of typical code characters vs length
    const codeSignals = /[;{}<>]|\b(function|const|let|var|class|def|return|if|for|while)\b/;
    return codeSignals.test(text);
  }

  function buildMetadataDisplay(meta) {
    const wrap = document.createElement('div');
    wrap.className = 'prompt-meta';
    if (!meta) { wrap.textContent = 'No metadata'; return wrap; }
    const row1 = document.createElement('div');
    row1.className = 'prompt-meta-row';
    const modelTag = document.createElement('span');
    modelTag.className = 'prompt-meta-tag';
    modelTag.innerHTML = `<span class="model-name" title="Model Name">${escapeHtml(meta.model)}</span>`;
    row1.appendChild(modelTag);

    const tokenEl = document.createElement('span');
    tokenEl.className = 'token-estimate';
    tokenEl.dataset.confidence = meta.tokenEstimate?.confidence || 'high';
    tokenEl.innerHTML = `<span>Tokens:</span><span class="token-range">${meta.tokenEstimate.min}&ndash;${meta.tokenEstimate.max}</span><span>(${meta.tokenEstimate.confidence})</span>`;
    row1.appendChild(tokenEl);

    const row2 = document.createElement('div');
    row2.className = 'prompt-meta-row';
    const created = document.createElement('time');
    created.dateTime = meta.createdAt;
    created.title = 'Created';
    created.textContent = humanTime(meta.createdAt);
    const updated = document.createElement('time');
    updated.dateTime = meta.updatedAt;
    updated.title = 'Updated';
    updated.textContent = humanTime(meta.updatedAt);
    row2.appendChild(created);
    if (meta.updatedAt !== meta.createdAt) {
      const sep = document.createElement('span'); sep.textContent = '→'; sep.style.opacity = '.5';
      row2.appendChild(sep);
      row2.appendChild(updated);
    }
    wrap.appendChild(row1);
    wrap.appendChild(row2);
    return wrap;
  }

  function humanTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  // Expose for debugging in console
  window.__promptMeta = { trackModel, updateTimestamps, estimateTokens };
})();
