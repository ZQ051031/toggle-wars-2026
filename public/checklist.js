const key = 'packlight-checklist-v1';
const boxes = Array.from(document.querySelectorAll('#packing input'));
const progress = document.getElementById('progress');
const reset = document.getElementById('reset');

try {
  const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
  for (const box of boxes) box.checked = Array.isArray(saved) && saved.includes(box.value);
} catch {
  // The checklist itself still works when storage is unavailable.
}

function update() {
  const checked = boxes.filter((box) => box.checked).map((box) => box.value);
  progress.textContent = checked.length + ' of ' + boxes.length + ' packed';
  reset.disabled = checked.length === 0;
  try {
    localStorage.setItem(key, JSON.stringify(checked));
  } catch {
    // Nothing to persist in browsers that disallow storage.
  }
}

for (const box of boxes) box.addEventListener('change', update);
reset.addEventListener('click', () => {
  for (const box of boxes) box.checked = false;
  update();
  boxes[0].focus();
});
update();
