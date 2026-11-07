import { IconButton, InputBase } from '@mui/material';
import './tea-detail.css';

const asset = import.meta.env.BASE_URL + 'figma/';

/** Figma 03 · Tea Detail 52px search field; results remain the V3 list. */
export default function TeaSearchBar({
  value, onChange, onFocus, scanning, photoRef, onPhoto,
}) {
  return (
    <div className="fac-tea-search">
      <img src={asset + 'tea-search.svg'} width="24" height="24" alt="" />
      <InputBase
        fullWidth value={value} onChange={event => onChange(event.target.value)}
        onInput={event => onChange(event.target.value)}
        onFocus={onFocus} placeholder="" autoComplete="off"
        inputProps={{ 'aria-label': 'Search tea', type:'text', inputMode:'search', enterKeyHint:'search' }}
        className="fac-tea-search__input"
      />
      <IconButton className="fac-tea-search__scanner"
        aria-label="Scan a tea barcode" disabled={scanning}
        onClick={() => photoRef.current?.click()} disableRipple>
        <img src={asset + 'tea-sheet-scanner.svg'} width="42" height="42" alt="" />
      </IconButton>
      <input type="file" ref={photoRef} accept="image/*" capture="environment"
        onChange={onPhoto} className="fac-tea-search__file" aria-label="Photograph a barcode" />
    </div>
  );
}
