import { useState } from 'react';
import { IconButton, Typography } from '@mui/material';
import { CATEGORY_ENGLISH } from '../features/teaDetailModel.js';
import { getUiTeaCategory } from '../features/teaModel.js';
import { getCategoryVisual } from '../features/categoryImages.js';
import './tea-detail.css';

const iconBase = import.meta.env.BASE_URL + 'figma/';

/** Reusable Figma Tea Card with centralised category imagery. */
export default function TeaCard({ tea, onEdit, onClose, pinned = false, onTogglePin }) {
  const [failedImageUrl,setFailedImageUrl] = useState(null);
  if (!tea) return null;

  const uiCategory=getUiTeaCategory(tea.category);
  const category=CATEGORY_ENGLISH[uiCategory] || 'OTHER';
  const variety=tea.subcategory==='other'
    ? tea.subcategory_other || ''
    : tea.subcategory || '';
  const leaf=tea.leafStyle==='bag' ? 'TEA BAG' : tea.leafStyle || '';
  const visual=getCategoryVisual(uiCategory);
  const showImage=Boolean(visual.imageUrl && visual.imageUrl!==failedImageUrl);

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
          <IconButton aria-label={pinned ? "Unpin tea" : "Pin tea"} aria-pressed={pinned}
            className="fac-tea-card__icon" onClick={onTogglePin} disableRipple>
            <span aria-hidden="true" style={{fontSize:24,color:"#1B272B"}}>{pinned ? "★" : "☆"}</span>
          </IconButton>
          <IconButton aria-label="Edit tea" className="fac-tea-card__icon" onClick={onEdit} disableRipple>
            <img src={iconBase+'tea-edit.svg'} width="48" height="48" alt="" />
          </IconButton>
          <IconButton aria-label="Close tea" className="fac-tea-card__icon" onClick={onClose} disableRipple>
            <img src={iconBase+'tea-close.svg'} width="48" height="48" alt="" />
          </IconButton>
        </div>
      </div>

      <div className="fac-tea-card__image-area"
        style={{backgroundColor:visual.backgroundColor}}>
        {showImage && (
          <img
            key={visual.imageUrl}
            className="fac-tea-card__photo"
            src={visual.imageUrl}
            alt=""
            onError={() => setFailedImageUrl(visual.imageUrl)}
            style={{
              objectFit:visual.objectFit,
              objectPosition:visual.positionX+'% '+visual.positionY+'%',
              transform:'scale('+visual.scale+')',
            }}
          />
        )}
        {/* Figma's tea-type pictogram is shown only when real artwork exists.
            A colour-only category has neither placeholder nor extra symbol. */}
        {showImage && (
          <img className="fac-tea-card__type-symbol"
            src={iconBase+'tea-category.svg'} width="60" height="60"
            alt="" />
        )}
        <div className="fac-tea-card__tags">
          <span className="fac-tea-card__tag">{category}</span>
          {variety && <span className="fac-tea-card__tag">{variety.toUpperCase()}</span>}
          {!variety && leaf && <span className="fac-tea-card__tag">{leaf.toUpperCase().replaceAll('_',' ')}</span>}
        </div>
      </div>
    </article>
  );
}
