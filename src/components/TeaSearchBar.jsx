import { useRef } from 'react';
import { IconButton, InputBase, SvgIcon } from '@mui/material';
import './tea-detail.css';

const asset = import.meta.env.BASE_URL + 'figma/';

/** Figma 03 · Tea Detail 52px search field; results remain the V3 list. */
export default function TeaSearchBar({
  value, onChange, onFocus, scanning, photoRef, onPhoto,
}) {
  const inputRef = useRef(null);
  return (
    <div className="fac-tea-search">
      <img src={asset + 'tea-search.svg'} width="24" height="24" alt="" />
      <InputBase
        inputRef={inputRef}
        fullWidth value={value} onChange={event => onChange(event.target.value)}
        onInput={event => onChange(event.target.value)}
        onFocus={onFocus} placeholder="" autoComplete="off"
        inputProps={{ 'aria-label': 'Search tea', type:'text', inputMode:'search', enterKeyHint:'search' }}
        className="fac-tea-search__input"
      />
      {value.length > 0 && (
        <IconButton className="fac-tea-search__clear" aria-label="Clear tea search" disableRipple
          onPointerDown={event => event.preventDefault()}
          onClick={() => { onChange(''); inputRef.current?.focus(); }}>
          <SvgIcon aria-hidden="true" viewBox="0 0 24 24">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </SvgIcon>
        </IconButton>
      )}
      <IconButton className="fac-tea-search__scanner"
        aria-label="Scan a tea barcode" disabled={scanning}
        onClick={() => photoRef.current?.click()} disableRipple>
        <img src={asset + 'tea-sheet-scanner.svg?v=dark'} width="42" height="42" alt="" />
      </IconButton>
      <input type="file" ref={photoRef} accept="image/*" capture="environment"
        onChange={onPhoto} className="fac-tea-search__file" aria-label="Photograph a barcode" />
    </div>
  );
}
