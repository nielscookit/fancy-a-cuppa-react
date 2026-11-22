import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, IconButton } from '@mui/material';
import { getTeaProductImage } from '../data/teaProductImages.js';
import { communityTeaV4, pilotCatalogEditing, listCommunityTeaPhotos } from '../data/teaRepository.js';
import './tea-image-gallery.css';

/** Mounted per tea: category remains visible until the external image has decoded. */
export default function TeaImageGallery({tea,children}) {
  const [images, setImages] = useState([]);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(false);
  const gesture=useRef(null),suppress=useRef(false);
  const community = communityTeaV4 && (tea.origin === 'community' || pilotCatalogEditing);
  useEffect(() => {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 8000);
    const external = () => getTeaProductImage(tea.id, { signal: ac.signal }).then(image => image ? [image] : []);
    const request = community
      ? listCommunityTeaPhotos(tea.id, { signal: ac.signal }).then(async photos => {
        if (tea.origin === 'community') return photos;
        // Keep the selected catalog packaging alongside pilot-added photos.
        return [...await external().catch(() => []), ...photos];
      })
      : external();
    request.then(items => {
      if (!ac.signal.aborted) {
        setImages(items);
        setReady(community && items.length > 0);
      }
    }).catch(() => {}).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); ac.abort(); };
  }, [tea.id, tea.revision, community]);
  useEffect(() => {
    if (!images.length || ready) return;
    const timer = setTimeout(() => setImages([]), 15000);
    return () => clearTimeout(timer);
  }, [images, ready]);
  function fail(url) {
    setImages(items => items.filter(item => item.url !== url));
    if (!community) setReady(false);
    setPage(0);
    setZoom(false);
  }
  const image = images[page - 1];
  const zoomImage = zoom && image && <img src={image.url} alt={tea.rawName+' – product packaging'}
    referrerPolicy="no-referrer" onError={() => fail(image.url)} />;
  return <>
    <div className="fac-image-gallery" onPointerDown={e=>{
      if(!e.isPrimary){gesture.current=null;suppress.current=true;return;}
      suppress.current=false;gesture.current={x:e.clientX,y:e.clientY,id:e.pointerId};
    }} onPointerMove={e=>{
      const g=gesture.current;if(!g||g.id!==e.pointerId)return;
      if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>8)suppress.current=true;
    }} onPointerUp={e=>{
      const g=gesture.current;if(!g||g.id!==e.pointerId)return;gesture.current=null;
      const dx=e.clientX-g.x,dy=e.clientY-g.y;
      if(Math.hypot(dx,dy)>8)suppress.current=true;
      if (ready && Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)*1.3)
        setPage(current => Math.max(0, Math.min(images.length, current + (dx < 0 ? 1 : -1))));
    }} onPointerCancel={()=>{gesture.current=null;suppress.current=true;}}>
      <div className="fac-image-gallery__track" style={{transform:`translateX(-${page*100}%)`}}>
        <div className="fac-image-gallery__category" aria-hidden={page!==0}>{children}</div>
        {images.map((item, index) => {
          const selected = ready && page === index + 1;
          return <button key={item.key || item.url} type="button" className="fac-image-gallery__product"
            tabIndex={selected ? 0 : -1} aria-hidden={!selected} aria-label="Enlarge product image" disabled={!ready}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')suppress.current=false;}}
            onClick={()=>{if(!suppress.current && selected)setZoom(true);}}>
            <img className="fac-image-gallery__backdrop" src={item.url} alt="" aria-hidden="true"
              referrerPolicy="no-referrer" draggable="false" />
            <img className="fac-image-gallery__photo" src={item.url} alt={tea.rawName+' – product packaging'} referrerPolicy="no-referrer" draggable="false"
              onLoad={()=>setReady(true)} onError={() => fail(item.url)} />
          </button>;
        })}
      </div>
    </div>
    {ready&&images.length > 0 && <div className="fac-image-gallery__dots" role="group" aria-label="Tea images">
      {['Category image', ...images.map((_, i) => community ? `Product image ${i + 1}` : 'Product image')].map((label,index)=><button key={label} type="button" aria-label={label} aria-pressed={page===index}
        onClick={()=>setPage(index)}><span /></button>)}
    </div>}
    <Dialog open={zoom&&ready} onClose={()=>setZoom(false)} fullWidth maxWidth="md"
      aria-label={'Product image: '+tea.rawName} className="fac-product-zoom">
      <IconButton className="fac-tea-card__icon fac-product-zoom__close"
        aria-label="Close product image" onClick={()=>setZoom(false)} disableRipple>
        <img src={import.meta.env.BASE_URL+'figma/tea-detail-close.svg'} width="48" height="48" alt="" />
      </IconButton>
      <DialogContent>
        {image?.sourcePage
          ? <a className="fac-product-zoom__source" href={image.sourcePage} target="_blank" rel="noopener noreferrer"
              referrerPolicy="no-referrer" aria-label="Open product source">{zoomImage}</a>
          : zoomImage}
      </DialogContent>
    </Dialog>
  </>;
}
