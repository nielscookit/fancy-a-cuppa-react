import Icon from '@mui/material/Icon';
import { getTeaCategoryIcon } from '../features/teaCategoryIcons.js';
import './tea-category-icon.css';

export function TeaSymbol({ name, filled=false }) {
  return <Icon baseClassName="fac-material-symbol" aria-hidden="true"
    style={{fontVariationSettings:`'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`}}>{name}</Icon>;
}
export default function TeaCategoryIcon({ category, className='' }) {
  const symbol = getTeaCategoryIcon(category);
  return <span className={'fac-tea-category-icon ' + className} aria-hidden="true" data-symbol={symbol}>
    <TeaSymbol name={symbol} />
  </span>;
}
