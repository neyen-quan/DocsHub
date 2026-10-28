import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// A blank-space gesture selects files; gestures on cards keep native file dragging.
export default function DocumentSelectionArea({ selected, onSelectionChange, selectionKey, children, ...props }) {
  const area = useRef(null);
  const gesture = useRef(null);
  const frame = useRef(0);
  const callback = useRef(onSelectionChange);
  callback.current = onSelectionChange;
  const [rectangle, setRectangle] = useState(null);
  const finish = () => {
    const drag = gesture.current;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    if (drag && area.current?.hasPointerCapture(drag.id)) area.current.releasePointerCapture(drag.id);
    setRectangle(null);
  };
  useEffect(() => { finish(); return () => { gesture.current = null; cancelAnimationFrame(frame.current); }; }, [selectionKey]);
  const update = () => {
    const drag = gesture.current, node = area.current;
    if (!drag || !node) return;
    const box = node.getBoundingClientRect();
    const x = Math.max(box.left, Math.min(box.right, drag.x));
    const y = Math.max(box.top, Math.min(box.bottom, drag.y));
    if (drag.moved) {
      const speed = y < box.top + 30 ? -12 : y > box.bottom - 30 ? 12 : 0;
      if (speed) node.scrollTop += speed;
      const startX = box.left + drag.startX - node.scrollLeft;
      const startY = box.top + drag.startY - node.scrollTop;
      const rect = { left: Math.max(box.left, Math.min(startX, x)), top: Math.max(box.top, Math.min(startY, y)), right: Math.min(box.right, Math.max(startX, x)), bottom: Math.min(box.bottom, Math.max(startY, y)) };
      setRectangle(rect);
      const hits = [...node.querySelectorAll('.file-row[data-document-path]')].filter(row => {
        const r = row.getBoundingClientRect();
        return r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom;
      }).map(row => row.dataset.documentPath);
      const paths = [...new Set([...drag.base, ...hits])];
      const signature = JSON.stringify(paths);
      if (signature !== drag.last) { drag.last = signature; callback.current(paths, paths.at(-1) || ''); }
    }
    frame.current = requestAnimationFrame(update);
  };
  return <section {...props} ref={area}
    onPointerDown={event => {
      if (event.button !== 0 || !event.isPrimary || event.target.closest('.file-row,.file-heading,.path-row,.document-view-tools,.document-drag-tools,.file-table-head,.file-footnote,.document-status,input,button,a')) return;
      const node = event.currentTarget, box = node.getBoundingClientRect();
      event.preventDefault();
      node.closest('.documents-page')?.focus({ preventScroll: true });
      gesture.current = { id: event.pointerId, startX: event.clientX - box.left + node.scrollLeft, startY: event.clientY - box.top + node.scrollTop, initialX: event.clientX, initialY: event.clientY, x: event.clientX, y: event.clientY, base: event.ctrlKey || event.metaKey ? [...selected] : [], moved: false };
      if (!event.ctrlKey && !event.metaKey) callback.current([], '');
      node.setPointerCapture(event.pointerId);
      frame.current = requestAnimationFrame(update);
    }}
    onPointerMove={event => {
      const drag = gesture.current;
      if (!drag || drag.id !== event.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (Math.hypot(drag.x - drag.initialX, drag.y - drag.initialY) > 3) drag.moved = true;
    }}
    onPointerUp={event => { if (gesture.current?.id === event.pointerId) { update(); finish(); } }}
    onPointerCancel={finish} onLostPointerCapture={finish}>
    {children}
    {rectangle && createPortal(<div className="document-selection-rectangle" aria-hidden="true" style={{ left: rectangle.left, top: rectangle.top, width: Math.max(0, rectangle.right - rectangle.left), height: Math.max(0, rectangle.bottom - rectangle.top) }}/>, document.body)}
  </section>;
}
