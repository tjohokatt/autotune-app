// Style picker: one big card per preset.

export function createPresetPicker(root, presets, { selectedId, onSelect }) {
  const buttons = presets.map((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-card';
    btn.dataset.id = preset.id;
    btn.innerHTML = `<span class="preset-emoji" aria-hidden="true"></span><span class="preset-name"></span>`;
    btn.querySelector('.preset-emoji').textContent = preset.emoji;
    btn.querySelector('.preset-name').textContent = preset.name;
    btn.addEventListener('click', () => {
      select(preset.id);
      onSelect(preset);
    });
    root.append(btn);
    return btn;
  });

  function select(id) {
    for (const btn of buttons) btn.setAttribute('aria-pressed', String(btn.dataset.id === id));
  }

  select(selectedId);
  return { select };
}
