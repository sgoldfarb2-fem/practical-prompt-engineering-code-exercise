(function() {
  const STORAGE_KEY = 'promptLibrary.items.v1';

  const form = document.getElementById('prompt-form');
  const titleInput = document.getElementById('prompt-title');
  const contentInput = document.getElementById('prompt-content');
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
      return data.filter(p => p && typeof p.id === 'string');
    } catch (e) {
      console.warn('Failed to parse stored prompts', e);
      return [];
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

      // Rating component mount point (insert before actions)
      const main = node.querySelector('.card-main');
      main.appendChild(buildRatingElement(p));
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

    const prompts = loadPrompts();
    prompts.unshift({ id: createId(), title, content, createdAt: Date.now() });
    savePrompts(prompts);
    render(prompts);

    form.reset();
    titleInput.focus();
  }

  function init() {
    form.addEventListener('submit', handleSubmit);
    render(loadPrompts());
  }

  document.addEventListener('DOMContentLoaded', init);
})();
