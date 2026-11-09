import { useState } from 'react';
import { IconButton } from '@mui/material';
import TeaName from './TeaName.jsx';
import TeaImageGallery from './TeaImageGallery.jsx';
import TeaCategoryIcon, { TeaSymbol } from './TeaCategoryIcon.jsx';
import { getUiTeaCategory } from '../features/teaModel.js';
import { getCategoryVisual } from '../features/categoryImages.js';
import './tea-detail.css';

const iconBase = import.meta.env.BASE_URL + 'figma/';

/** Reusable Figma Tea Card with centralised category imagery. */
export default function TeaCard({ tea, onEdit, onClose, pinned = false, onTogglePin }) {
  const [failedImageUrl,setFailedImageUrl] = useState(null);
  if (!tea) return null;

  const uiCategory=getUiTeaCategory(tea.category);
  const visual=getCategoryVisual(uiCategory);
  const showImage=Boolean(visual.imageUrl && visual.imageUrl!==failedImageUrl);

  return (
    <article className="fac-tea-card" aria-label={tea.rawName || tea.name}>
      <div className="fac-tea-card__header">
        <div className="fac-tea-card__identity">
          <TeaName key={tea.id + ':' + (tea.rawName || tea.name)} name={tea.rawName || tea.name} />
        </div>
        <div className="fac-tea-card__actions">
          <IconButton aria-label={pinned ? "Unpin tea" : "Pin tea"} aria-pressed={pinned}
            className="fac-tea-card__icon fac-tea-card__pin" onClick={onTogglePin} disableRipple>
            <TeaSymbol name="keep" filled={pinned} />
          </IconButton>
          <IconButton aria-label="Edit tea" className="fac-tea-card__icon" onClick={onEdit} disableRipple>
            <img src={iconBase+'tea-edit.svg'} width="48" height="48" alt="" />
          </IconButton>
          <IconButton aria-label="Close tea" className="fac-tea-card__icon" onClick={onClose} disableRipple>
            <img src={iconBase+'tea-detail-close.svg'} width="48" height="48" alt="" />
          </IconButton>
        </div>
      </div>

      <div className="fac-tea-card__image-area"
        style={{backgroundColor:visual.backgroundColor}}>
        <TeaImageGallery key={tea.id} tea={tea}>
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
        </TeaImageGallery>
        <span className="fac-tea-card__manufacturer" title={tea.brand}>{tea.brand}</span>
        <TeaCategoryIcon category={tea.category} className="fac-tea-card__category" />
      </div>
    </article>
  );
}
