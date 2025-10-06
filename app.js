// Prompt Library Application
// Data schema: { id: string (uuid-ish), title: string, content: string, createdAt: number, rating: number (0-5) }

(function() {
  const STORAGE_KEY = 'promptLibrary.v1';
  const NOTES_KEY = 'promptNotes.v1';

  // Elements
  const form = document.getElementById('prompt-form');
  const titleInput = document.getElementById('prompt-title');
  const modelInput = document.getElementById('prompt-model');
  const contentInput = document.getElementById('prompt-content');
  const promptsContainer = document.getElementById('prompts');
  const template = document.getElementById('prompt-card-template');
  const emptyState = document.getElementById('empty-state');
  // removed search & clear all elements per user request
  // export functionality removed per user request

  let prompts = loadPrompts();
  let notesMap = loadNotes(); // { [promptId]: Note[] }
  // filter query removed

  // --- Storage helpers ---
  function loadPrompts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(p => ({
        ...p,
        rating: typeof p.rating === 'number' && p.rating >= 0 && p.rating <= 5 ? p.rating : 0
      }));
      return [];
    } catch(e) {
      console.warn('Failed to parse prompt storage', e);
      return [];
    }
  }

  function savePrompts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  }

  // --- Notes Storage Helpers ---
  function loadNotes() {
    try {
      const raw = localStorage.getItem(NOTES_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch(e) {
      console.warn('Failed to parse notes storage', e);
      return {};
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notesMap));
    } catch(e) {
      toast('Unable to save notes (storage full?)');
    }
  }

  function getNotes(promptId) {
    return Array.isArray(notesMap[promptId]) ? notesMap[promptId] : [];
  }

  function setNotes(promptId, arr) {
    notesMap[promptId] = arr;
    saveNotes();
  }

  // --- Utilities ---
  function uid() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  }

  function previewText(text, words = 14) {
    const arr = text.trim().replace(/\s+/g,' ').split(' ');
    if (arr.length <= words) return text.trim();
    return arr.slice(0, words).join(' ') + '…';
  }

  function _sanitizeInternal(str) { // internal use for prompt preview
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Rendering ---
  function render() {
    promptsContainer.innerHTML = '';
    const sorted = prompts.slice().sort((a,b)=> b.createdAt - a.createdAt);
    if (!sorted.length) {
      emptyState.hidden = false;
      return;
    } else {
      emptyState.hidden = true;
    }

    const frag = document.createDocumentFragment();
    for (const p of sorted) {
      const node = template.content.firstElementChild.cloneNode(true);
      node.dataset.id = p.id;
      node.querySelector('.prompt-title').textContent = p.title;
  node.querySelector('.prompt-preview').textContent = previewText(p.content, 28);
      // Attach handlers
      node.querySelector('.delete-btn').addEventListener('click', () => deletePrompt(p.id));
      node.querySelector('.copy-btn').addEventListener('click', () => copyPrompt(p));
      // rating stars
      const ratingEl = createRatingStars(p);
      node.appendChild(ratingEl);
      // metadata block (if exists)
      if (p.metadata) {
        try { node.appendChild(buildMetadataElement(p.metadata)); } catch(err) { console.warn('metadata render failed', err); }
      }
      // notes section hydration
      hydrateNotesSection(node, p.id);
      frag.appendChild(node);
    }
    promptsContainer.appendChild(frag);
  }

  // --- Actions ---
  function addPrompt(title, content, model) {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    const cleanModel = (model || '').trim();
    let metadata;
    try { metadata = trackModel(cleanModel, cleanContent); }
    catch(e) { console.error('Failed metadata', e); throw e; }
    const newPrompt = { id: uid(), title: cleanTitle, content: cleanContent, createdAt: Date.now(), rating: 0, metadata };
    prompts.push(newPrompt);
    savePrompts();
    render();
    return newPrompt;
  }

  function deletePrompt(id) {
    const idx = prompts.findIndex(p=>p.id===id);
    if (idx !== -1) {
      prompts.splice(idx,1);
      savePrompts();
      render();
    }
  }

  function copyPrompt(p) {
    const text = `${p.title}\n\n${p.content}`;
    navigator.clipboard?.writeText(text).then(()=>{
      toast('Copied to clipboard');
    }).catch(()=>{
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Copied'); } catch(e){ console.warn('Copy failed'); }
      ta.remove();
    });
  }

  // --- Ratings ---
  function setRating(promptId, value) {
    const prompt = prompts.find(pr => pr.id === promptId);
    if (!prompt) return;
    const newValue = Math.max(0, Math.min(5, value));
    // If clicking same value, keep it (no toggle-off) — simpler UX
    if (prompt.rating !== newValue) {
      prompt.rating = newValue;
      savePrompts();
      render();
    }
  }

  function createRatingStars(prompt) {
    const wrapper = document.createElement('div');
    wrapper.className = 'rating';
    wrapper.setAttribute('role', 'radiogroup');
    wrapper.setAttribute('aria-label', 'Prompt rating');

    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'star-btn' + (i <= prompt.rating ? ' active' : '');
      btn.dataset.value = String(i);
      btn.textContent = i <= prompt.rating ? '★' : '☆';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(i === prompt.rating));
      btn.setAttribute('aria-label', `${i} star${i === 1 ? '' : 's'}`);
      btn.addEventListener('click', () => setRating(prompt.id, i));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          const dir = e.key === 'ArrowLeft' ? -1 : 1;
          let next = i + dir;
            if (next < 1) next = 5;
            if (next > 5) next = 1;
          const target = wrapper.querySelector(`button[data-value="${next}"]`);
          target && target.focus();
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          setRating(prompt.id, i);
        }
      });
      wrapper.appendChild(btn);
    }
    return wrapper;
  }

  // clearAll removed

  // exportJSON removed
  // ================= Export / Import System ================= //
  const EXPORT_VERSION = 1;
  const EXPORT_MIME = 'application/json';

  function computeStats(promptList) {
    const total = promptList.length;
    const avgRating = total ? (promptList.reduce((s,p)=> s + (p.rating||0),0)/total) : 0;
    const modelCount = {};
    for (const p of promptList) {
      const model = p.metadata?.model?.trim();
      if (model) modelCount[model] = (modelCount[model]||0)+1;
    }
    let mostUsedModel = null; let max = 0;
    for (const k in modelCount) { if (modelCount[k] > max) { max = modelCount[k]; mostUsedModel = k; } }
    return { totalPrompts: total, averageRating: Number(avgRating.toFixed(2)), mostUsedModel };
  }

  function validatePromptShape(p) {
    if (!p || typeof p !== 'object') return false;
    if (typeof p.id !== 'string' || !p.id.trim()) return false;
    if (typeof p.title !== 'string') return false;
    if (typeof p.content !== 'string') return false;
    if (typeof p.createdAt !== 'number') return false;
    if (typeof p.rating !== 'number') return false;
    // metadata optional
    if (p.metadata) {
      try {
        validateModelName(p.metadata.model);
        validateIsoDate(p.metadata.createdAt, 'createdAt');
        validateIsoDate(p.metadata.updatedAt, 'updatedAt');
        if (!p.metadata.tokenEstimate || typeof p.metadata.tokenEstimate !== 'object') throw new Error('tokenEstimate missing');
      } catch { return false; }
    }
    return true;
  }

  function exportAll() {
    try {
      const data = loadPrompts(); // fresh read
      const notesRaw = loadNotes();
      // remove orphan notes referencing missing prompt IDs
      const idSet = new Set(data.map(p=>p.id));
      const notes = {};
      for (const k in notesRaw) { if (idSet.has(k)) notes[k] = notesRaw[k]; }
      for (const pr of data) { if (!validatePromptShape(pr)) throw new Error('Invalid prompt detected; aborting export'); }
      const payload = {
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        stats: computeStats(data),
        prompts: data,
        notes
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: EXPORT_MIME });
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `prompt-library-export-${ts}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
      toast('Exported prompts');
    } catch(e) {
      console.error(e); toast('Export failed');
    }
  }

  function parseJSONFile(file) {
    return new Promise((resolve,reject)=> {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File read error'));
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result)); } catch(e){ reject(new Error('Invalid JSON')); }
      };
      reader.readAsText(file);
    });
  }

  function validateImportPayload(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Root must be object');
    if (typeof obj.version !== 'number') throw new Error('Missing version');
    if (obj.version !== EXPORT_VERSION) throw new Error('Unsupported version');
    if (!Array.isArray(obj.prompts)) throw new Error('prompts must be array');
    if (!obj.notes || typeof obj.notes !== 'object') throw new Error('notes must be object');
    obj.prompts.forEach(p => { if (!validatePromptShape(p)) throw new Error('Invalid prompt in array'); });
    // ensure note referential integrity (ignore orphan note groups instead of failing)
    const idSet = new Set(obj.prompts.map(p=>p.id));
    const orphanKeys = [];
    for (const key in obj.notes) {
      if (!idSet.has(key)) { orphanKeys.push(key); continue; }
      const arr = obj.notes[key];
      if (!Array.isArray(arr)) throw new Error('Notes value must be array');
      for (const n of arr) {
        if (typeof n !== 'object') throw new Error('Note must be object');
        if (n.promptId !== key) throw new Error('Note promptId mismatch');
        if (typeof n.noteId !== 'string') throw new Error('noteId missing');
        if (typeof n.text !== 'string') throw new Error('note text missing');
      }
    }
    if (orphanKeys.length) {
      // remove orphans so they are not persisted
      orphanKeys.forEach(k => delete obj.notes[k]);
      obj.__droppedNoteGroups = orphanKeys;
    }
    return obj;
  }

  function backupCurrentData() {
    try {
      return {
        prompts: loadPrompts(),
        notes: loadNotes()
      };
    } catch(e) { console.warn('Backup failed', e); return null; }
  }

  function restoreBackup(bkp) {
    if (!bkp) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bkp.prompts||[]));
      localStorage.setItem(NOTES_KEY, JSON.stringify(bkp.notes||{}));
    } catch(e) { console.error('Restore failed', e); }
  }

  async function importFromFile(file, mode='merge') { // mode: 'merge' | 'replace'
    const backup = backupCurrentData();
    try {
      const json = await parseJSONFile(file);
      const payload = validateImportPayload(json);
      const existing = loadPrompts();
      const existingIds = new Set(existing.map(p=>p.id));
      const incoming = payload.prompts;

      if (mode === 'replace') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
        localStorage.setItem(NOTES_KEY, JSON.stringify(payload.notes));
        prompts = incoming.slice();
        notesMap = payload.notes;
        render();
        toast('Import complete (replaced)');
        return;
      }

      // merge mode: detect duplicates
      const duplicates = incoming.filter(p=> existingIds.has(p.id));
      if (duplicates.length) {
        // simple conflict resolution: prompt user per duplicate to keep existing or replace
        for (const dup of duplicates) {
          try {
            const decision = window.confirm(`Duplicate ID found for title "${dup.title}". Click OK to overwrite, Cancel to keep existing.`);
            if (decision) {
              const idx = existing.findIndex(p=>p.id===dup.id);
              existing[idx] = dup; // overwrite
              // merge notes: prefer incoming replacing same noteIds
              const incomingNotes = payload.notes[dup.id] || [];
              notesMap[dup.id] = mergeNotesArrays(notesMap[dup.id] || [], incomingNotes);
            }
          } catch(e) { console.warn('Conflict prompt failed', e); }
        }
      }
      // add non-duplicates
      const toAdd = incoming.filter(p=> !existingIds.has(p.id));
      existing.push(...toAdd);
      // merge notes for new prompts
      for (const id in payload.notes) {
        if (!notesMap[id]) notesMap[id] = payload.notes[id];
        else notesMap[id] = mergeNotesArrays(notesMap[id], payload.notes[id]);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
      localStorage.setItem(NOTES_KEY, JSON.stringify(notesMap));
      prompts = existing.slice();
      render();
      if (payload.__droppedNoteGroups?.length) {
        toast(`Import complete (dropped ${payload.__droppedNoteGroups.length} orphan note group${payload.__droppedNoteGroups.length>1?'s':''})`);
      } else {
        toast('Import complete');
      }
    } catch(e) {
      console.error(e);
      restoreBackup(backup);
      toast('Import failed - rolled back');
    }
  }

  function mergeNotesArrays(existingArr, incomingArr) {
    const map = new Map();
    existingArr.forEach(n=> map.set(n.noteId, n));
    incomingArr.forEach(n=> map.set(n.noteId, n)); // overwrite duplicates with incoming
    return Array.from(map.values());
  }

  // UI binding for export/import
  document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const fileInput = document.getElementById('import-file');
    exportBtn && exportBtn.addEventListener('click', exportAll);
    importBtn && importBtn.addEventListener('click', () => fileInput && fileInput.click());
    fileInput && fileInput.addEventListener('change', () => {
      if (!fileInput.files || !fileInput.files[0]) return;
      const file = fileInput.files[0];
      if (!file.name.endsWith('.json')) { toast('Select a JSON file'); fileInput.value=''; return; }
      const mode = window.confirm('Click OK to merge, Cancel to replace existing data.') ? 'merge' : 'replace';
      importFromFile(file, mode);
      fileInput.value='';
    });
  });

  // --- Toast ---
  let toastTimer;
  function toast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      Object.assign(el.style, {
        position:'fixed',bottom:'1.25rem',left:'50%',transform:'translateX(-50%)',
        background:'linear-gradient(90deg,#2563eb,#7c3aed)',
        color:'#fff',padding:'0.7rem 1rem',borderRadius:'8px',font:'600 .8rem/1.1 system-ui',
        letterSpacing:'0.5px',boxShadow:'0 4px 10px -2px rgba(0,0,0,.5)',zIndex:999, opacity:'0', transition:'opacity .25s'
      });
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ el.style.opacity='0'; }, 2200);
  }

  // --- Event bindings ---
  form.addEventListener('submit', e => {
    e.preventDefault();
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const modelEl = document.getElementById('prompt-model');
    const model = modelEl ? modelEl.value.trim() : '';
    if (!title || !content || !model) { toast('Title, model & content required'); return; }
    try { addPrompt(title, content, model); }
    catch { toast('Failed to add prompt'); return; }
    form.reset();
    titleInput.focus();
  });

  // removed export listener & search listener

  // Keyboard: Enter on title moves to content if content empty
  titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!contentInput.value.trim()) contentInput.focus();
    }
  });

  // Init
  render();
  // Delegate note events
  document.addEventListener('click', handleNoteClicks);
  document.addEventListener('submit', handleNoteSubmit, true);
})();

// --- Notes Feature (IIFE scope above retains closures) ---
function hydrateNotesSection(cardEl, promptId) {
  const section = cardEl.querySelector('[data-notes-section]');
  if (!section) return;
  const list = section.querySelector('.notes-list');
  renderNotesList(list, promptId);
}

// Provide a sanitize function in global scope for notes rendering (IIFE version not accessible here)
function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function renderNotesList(listEl, promptId) {
  // Access notesMap via window closure (script scope). We stored functions on window? We didn't. So fetch through helper by hooking into IIFE? Simpler: expose minimal API.
  const api = window.__notesAPI || buildNotesAPI();
  const notes = api.getNotes(promptId);
  listEl.innerHTML = '';
  if (!notes.length) {
    const empty = document.createElement('li');
    empty.className = 'notes-empty';
    empty.textContent = 'No notes yet.';
    listEl.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  notes.slice().sort((a,b)=> b.createdAt - a.createdAt).forEach(n => {
    const li = document.createElement('li');
    li.className = 'note-item';
    li.dataset.noteId = n.noteId;
    li.innerHTML = `
      <div class="note-text">${sanitize(n.text)}</div>
      <div class="note-meta">${formatMeta(n)}</div>
      <div class="note-actions">
        <button type="button" data-action="edit-note">Edit</button>
        <button type="button" data-action="delete-note">Delete</button>
      </div>`;
    frag.appendChild(li);
  });
  listEl.appendChild(frag);
}

function formatMeta(note) {
  const created = new Date(note.createdAt).toLocaleDateString(undefined,{ month:'short', day:'numeric'});
  const edited = note.updatedAt && note.updatedAt !== note.createdAt ? ' • edited ' + new Date(note.updatedAt).toLocaleDateString(undefined,{ month:'short', day:'numeric'}) : '';
  return `${created}${edited}`;
}

function handleNoteClicks(e) {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'add-note') {
    const card = e.target.closest('.prompt-card');
    if (!card) return;
    const list = card.querySelector('.notes-list');
    insertNewNoteForm(list, card.dataset.id);
  } else if (action === 'edit-note') {
    const item = e.target.closest('.note-item');
    if (!item) return;
    enterEditMode(item);
  } else if (action === 'cancel-edit') {
    const form = e.target.closest('.note-edit-form');
    if (!form) return;
    const isNew = form.dataset.new === 'true';
    if (isNew) {
      form.parentElement.remove();
    } else {
      const promptId = form.closest('.prompt-card').dataset.id;
      const noteId = form.parentElement.dataset.noteId;
      restoreDisplay(form.parentElement, promptId, noteId);
    }
  } else if (action === 'delete-note') {
    const item = e.target.closest('.note-item');
    if (!item) return;
    const promptId = item.closest('.prompt-card').dataset.id;
    if (confirm('Delete this note?')) {
      const api = window.__notesAPI || buildNotesAPI();
      const notes = api.getNotes(promptId).filter(n => n.noteId !== item.dataset.noteId);
      api.setNotes(promptId, notes);
      renderNotesList(item.parentElement, promptId);
    }
  }
}

function handleNoteSubmit(e) {
  const form = e.target.closest('.note-edit-form');
  if (!form) return;
  e.preventDefault();
  const ta = form.querySelector('textarea');
  const val = ta.value.trim();
  const errorEl = form.querySelector('.error-msg');
  if (!val) {
    errorEl.textContent = 'Note cannot be empty';
    return;
  }
  const promptId = form.closest('.prompt-card').dataset.id;
  const api = window.__notesAPI || buildNotesAPI();
  const notes = api.getNotes(promptId).slice();
  const now = Date.now();
  if (form.dataset.new === 'true') {
    notes.push({ noteId: `${promptId}-${now}`, promptId, text: val, createdAt: now, updatedAt: now });
  } else {
    const noteId = form.parentElement.dataset.noteId;
    const note = notes.find(n => n.noteId === noteId);
    if (note) { note.text = val; note.updatedAt = now; }
  }
  api.setNotes(promptId, notes);
  renderNotesList(form.parentElement.parentElement, promptId);
}

function insertNewNoteForm(list, promptId) {
  // Avoid multiple new forms simultaneously for same prompt
  if (list.querySelector('.note-edit-form[data-new="true"]')) return;
  const li = document.createElement('li');
  li.className = 'note-item';
  li.innerHTML = buildEditFormHTML('', true);
  list.prepend(li);
  li.querySelector('textarea').focus();
}

function enterEditMode(item) {
  const textEl = item.querySelector('.note-text');
  if (!textEl) return; // already editing
  const raw = textEl.textContent;
  item.innerHTML = buildEditFormHTML(raw, false);
  item.querySelector('textarea').focus();
}

function restoreDisplay(item, promptId, noteId) {
  const api = window.__notesAPI || buildNotesAPI();
  const note = api.getNotes(promptId).find(n => n.noteId === noteId);
  if (!note) { item.remove(); return; }
  item.innerHTML = `
    <div class="note-text">${sanitize(note.text)}</div>
    <div class="note-meta">${formatMeta(note)}</div>
    <div class="note-actions">
      <button type="button" data-action="edit-note">Edit</button>
      <button type="button" data-action="delete-note">Delete</button>
    </div>`;
}

function buildEditFormHTML(value, isNew) {
  return `
    <form class="note-edit-form" data-new="${isNew}">
      <textarea name="noteText" aria-label="Note text" required>${escapeForTextarea(value)}</textarea>
      <div class="form-actions">
        <button type="submit" data-action="save-note">Save</button>
        <button type="button" data-action="cancel-edit">Cancel</button>
      </div>
      <div class="error-msg" aria-live="polite"></div>
    </form>`;
}

function escapeForTextarea(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildNotesAPI() {
  // Discover references inside initial IIFE via closure? Not accessible. Instead reflect over localStorage each call.
  function load() {
    try { return JSON.parse(localStorage.getItem('promptNotes.v1')) || {}; } catch { return {}; }
  }
  function save(map) {
    try { localStorage.setItem('promptNotes.v1', JSON.stringify(map)); } catch(e) { /* noop */ }
  }
  return window.__notesAPI = {
    getNotes(promptId) { const map = load(); return Array.isArray(map[promptId]) ? map[promptId] : []; },
    setNotes(promptId, arr) { const map = load(); map[promptId] = arr; save(map); }
  };
}

// ================= Metadata Tracking System ================= //
// Output Schema:
// { model: string, createdAt: string, updatedAt: string, tokenEstimate: { min:number, max:number, confidence:'high'|'medium'|'low' } }

function trackModel(modelName, content) {
  validateModelName(modelName);
  if (typeof content !== 'string' || !content.trim()) throw new Error('trackModel: content must be a non-empty string');
  const createdAt = isoNow();
  const tokenEstimate = estimateTokens(content, detectIfCode(content));
  return { model: modelName.trim(), createdAt, updatedAt: createdAt, tokenEstimate };
}

function updateTimestamps(metadata) {
  if (!metadata || typeof metadata !== 'object') throw new Error('updateTimestamps: metadata object required');
  validateIsoDate(metadata.createdAt, 'createdAt');
  const now = isoNow();
  metadata.updatedAt = now;
  validateIsoDate(metadata.updatedAt, 'updatedAt');
  if (new Date(metadata.updatedAt) < new Date(metadata.createdAt)) {
    throw new Error('updateTimestamps: updatedAt cannot be earlier than createdAt');
  }
  return metadata;
}

function estimateTokens(text, isCode=false) {
  if (typeof text !== 'string') throw new Error('estimateTokens: text must be string');
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const chars = trimmed.length;
  let min = Math.round(0.75 * words);
  let max = Math.round(0.25 * chars);
  if (isCode) { min = Math.round(min * 1.3); max = Math.round(max * 1.3); }
  if (max < min) max = min;
  const total = max;
  const confidence = total < 1000 ? 'high' : total <= 5000 ? 'medium' : 'low';
  return { min, max, confidence };
}

// ---- Metadata Helpers ----
function isoNow() { return new Date().toISOString(); }

function validateIsoDate(str, field) {
  if (typeof str !== 'string') throw new Error(`Invalid ${field}: not a string`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(str)) throw new Error(`Invalid ${field}: not ISO 8601 format`);
  const date = new Date(str);
  if (isNaN(date.getTime())) throw new Error(`Invalid ${field}: not a real date`);
}

function validateModelName(name) {
  if (typeof name !== 'string' || !name.trim()) throw new Error('Model name must be a non-empty string');
  if (name.trim().length > 100) throw new Error('Model name exceeds 100 character limit');
}

function detectIfCode(text) {
  const codeIndicators = /[{}`;<>]|function\s|=>|class\s/;
  return codeIndicators.test(text);
}

function buildMetadataElement(meta) {
  // Validate silently; if invalid show fallback
  try {
    validateModelName(meta.model);
    validateIsoDate(meta.createdAt, 'createdAt');
    validateIsoDate(meta.updatedAt, 'updatedAt');
  } catch(e) {
    const fallback = document.createElement('div');
    fallback.className = 'meta';
    fallback.textContent = 'Metadata invalid';
    return fallback;
  }
  const div = document.createElement('div');
  div.className = 'meta';
  const tokenClass = 'token-badge ' + meta.tokenEstimate.confidence;
  div.innerHTML = `
    <div class="meta-row">
      <span class="meta-label">Model:</span><span class="meta-model">${sanitize(meta.model)}</span>
      <span class="${tokenClass}" title="Estimated tokens (min-max)">
        <span class="token-range">${meta.tokenEstimate.min}–${meta.tokenEstimate.max}</span>
        <span>${meta.tokenEstimate.confidence.toUpperCase()}</span>
      </span>
    </div>
    <div class="meta-time">
      <span title="Created at">C: ${humanTime(meta.createdAt)}</span>
      <span title="Last updated">U: ${humanTime(meta.updatedAt)}</span>
    </div>`;
  return div;
}

function humanTime(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined,{ month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}
