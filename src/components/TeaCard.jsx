import { IconButton, Typography } from '@mui/material';
import { CATEGORY_ENGLISH } from '../features/teaDetailModel.js';
import './tea-detail.css';

const asset = import.meta.env.BASE_URL + 'figma/';

/** Figma 03 · Tea Detail, reusable product card (node 123:155). */
export default function TeaCard({ tea, onEdit, onClose }) {
  if (!tea) return null;
  const category = CATEGORY_ENGLISH[tea.category] || 'TEA';
  const variety = tea.subcategory === 'other'
    ? tea.subcategory_other || 'OTHER'
    : tea.subcategory || 'OTHER';
  const image = tea.imageUrl || asset + 'tea-photo-square.jpg';
  const illustration = !tea.imageUrl;
  return (
    <article className="fac-tea-card" aria-label={tea.rawName || tea.name}>
      <div className="fac-tea-card__header">
        <div className="fac-tea-card__identity">
          <Typography component="h2" className="fac-tea-card__name">
            {tea.rawName || tea.name}
          </Typography>
          <Typography className="fac-tea-card__brand">{tea.brand}</Typography>
        </div>
        <div className="fac-tea-card__actions">
          <IconButton aria-label="Edit tea" className="fac-tea-card__icon" onClick={onEdit} disableRipple>
            <img src={asset + 'tea-edit.svg'} width="48" height="48" alt="" />
          </IconButton>
          <IconButton aria-label="Close tea" className="fac-tea-card__icon" onClick={onClose} disableRipple>
            <img src={asset + 'tea-close.svg'} width="48" height="48" alt="" />
          </IconButton>
        </div>
      </div>
      <div className="fac-tea-card__image-area">
        <img className={'fac-tea-card__photo' + (illustration ? ' is-illustration' : '')}
          src={image}
          alt={illustration ? 'Illustrative tea sachet photograph' : 'Photograph of ' + (tea.rawName || tea.name)}
        />
        <img className="fac-tea-card__type-symbol"
          src={asset + 'tea-category.svg'} width="60" height="60"
          alt={tea.type === 'bag' ? 'Tea bags' : 'Loose tea'} />
        <div className="fac-tea-card__tags">
          <span className="fac-tea-card__tag">{category}</span>
          <span className="fac-tea-card__tag">{variety.toUpperCase()}</span>
        </div>
      </div>
    </article>
  );
}
