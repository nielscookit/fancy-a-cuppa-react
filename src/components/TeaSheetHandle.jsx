import { useRef } from 'react';

/** Only the handle owns the dismissal gesture; result and tag scrolling are independent. */
export default function TeaSheetHandle({ onClose, onDragChange }) {
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const reset = () => {
    gesture.current = null;
    onDragChange({offset:0, active:false});
  };
  return (
    <button type="button" className="fac-sheet-handle" aria-label="Close tea assistant"
      onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        gesture.current = {id:event.pointerId, x:event.clientX, y:event.clientY, time:event.timeStamp};
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const offset = Math.max(0, event.clientY - start.y);
        if (Math.abs(event.clientX - start.x) > 4 || Math.abs(event.clientY - start.y) > 4) {
          suppressClick.current = true;
        }
        onDragChange({offset, active:true});
      }}
      onPointerUp={event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const offset = Math.max(0, event.clientY - start.y);
        const horizontal = Math.abs(event.clientX - start.x);
        const velocity = offset / Math.max(1, event.timeStamp - start.time);
        gesture.current = null;
        if (offset >= 4 || horizontal >= 4) suppressClick.current = true;
        if (offset > horizontal && (offset >= 72 || offset > 24 && velocity > 0.5)) {
          onDragChange({offset, active:false});
          onClose();
        } else onDragChange({offset:0, active:false});
      }}
      onPointerCancel={reset}
      onLostPointerCapture={() => { if (gesture.current) reset(); }}
      onClick={() => {
        const suppressed = suppressClick.current;
        suppressClick.current = false;
        if (!suppressed) onClose();
      }}
      onKeyDown={() => { suppressClick.current = false; }}
    />
  );
}
