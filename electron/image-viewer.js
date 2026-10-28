const params = new URLSearchParams(location.search);
const photo = document.getElementById('photo');
document.getElementById('name').textContent = params.get('name') || 'Imagen';
document.title = `${params.get('name') || 'Imagen'} · Comparar · DocsHub`;
photo.alt = params.get('name') || 'Imagen para comparar';
photo.addEventListener('error', () => { photo.hidden = true; photo.style.display = 'none'; document.getElementById('error').hidden = false; });
photo.src = params.get('image') || '';
photo.draggable = false;
const canvas = document.getElementById('canvas');
let pan = null;
function stopPan() {
  const previous = pan;
  pan = null;
  canvas.classList.remove('panning');
  if (previous && canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id);
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary || !canvas.classList.contains('actual') || photo.hidden) return;
  if (canvas.scrollWidth <= canvas.clientWidth && canvas.scrollHeight <= canvas.clientHeight) return;
  event.preventDefault();
  pan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('panning');
});
canvas.addEventListener('pointermove', event => {
  if (!pan || pan.id !== event.pointerId) return;
  canvas.scrollLeft = pan.left + pan.x - event.clientX;
  canvas.scrollTop = pan.top + pan.y - event.clientY;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, event => { if (pan && pan.id === event.pointerId) stopPan(); });
}
window.addEventListener('blur', stopPan);
let imageZoom = null;
const fitButton = document.getElementById('fit');
function setImageZoom(scale) {
  imageZoom = Math.max(0.05, Math.min(8, scale));
  canvas.classList.add('actual');
  photo.style.width = `${photo.naturalWidth * imageZoom}px`;
  photo.style.height = `${photo.naturalHeight * imageZoom}px`;
  fitButton.textContent = `${Math.round(imageZoom * 100)}%`;
}
fitButton.title = 'Volver a ajustar la imagen a la ventana; Ctrl + ruedita cambia el zoom';
fitButton.addEventListener('click', () => {
  stopPan();
  if (canvas.classList.contains('actual')) {
    imageZoom = null; canvas.classList.remove('actual');
    photo.style.width = ''; photo.style.height = '';
    canvas.scrollLeft = 0; canvas.scrollTop = 0;
    fitButton.textContent = 'Ajustar';
  } else if (photo.naturalWidth) setImageZoom(1);
});
canvas.addEventListener('wheel', event => {
  if (!event.ctrlKey) return;
  event.preventDefault(); event.stopPropagation();
  if (!photo.naturalWidth || photo.hidden || !event.deltaY) return;
  stopPan();
  const rect = photo.getBoundingClientRect();
  const scale = imageZoom ?? rect.width / photo.naturalWidth;
  const imageX = (event.clientX - rect.left) / scale;
  const imageY = (event.clientY - rect.top) / scale;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
  setImageZoom(scale * Math.exp(-Math.max(-240, Math.min(240, delta)) * 0.002));
  const next = photo.getBoundingClientRect();
  canvas.scrollLeft += next.left + imageX * imageZoom - event.clientX;
  canvas.scrollTop += next.top + imageY * imageZoom - event.clientY;
}, { passive: false });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { if (groupPointer !== null) stopGroupMove(true); else window.close(); } });

document.getElementById('close-all').addEventListener('click', () => window.imageCompare.closeAll());

const moveAll = document.getElementById('move-all');
let groupPointer = null;
function stopGroupMove(cancel = false) {
  if (groupPointer === null) return;
  const id = groupPointer; groupPointer = null;
  moveAll.classList.remove('group-moving');
  window.imageCompare.endGroupDrag(cancel);
  if (moveAll.hasPointerCapture(id)) moveAll.releasePointerCapture(id);
}
moveAll.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return;
  event.preventDefault(); stopPan();
  groupPointer = event.pointerId;
  moveAll.setPointerCapture(event.pointerId);
  moveAll.classList.add('group-moving');
  window.imageCompare.beginGroupDrag();
});
moveAll.addEventListener('pointerup', () => stopGroupMove());
moveAll.addEventListener('pointercancel', () => stopGroupMove(true));
moveAll.addEventListener('lostpointercapture', () => stopGroupMove());
window.addEventListener('blur', () => stopGroupMove());
window.addEventListener('pagehide', () => stopGroupMove(true));
