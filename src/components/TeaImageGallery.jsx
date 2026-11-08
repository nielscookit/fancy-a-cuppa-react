import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, IconButton } from '@mui/material';
import { getTeaProductImage } from '../data/teaProductImages.js';
import './tea-image-gallery.css';

/** Mounted per tea: category remains visible until the external image has decoded. */
export default function TeaImageGallery({tea,children}) {
  const [image,setImage]=useState(null),[ready,setReady]=useState(false),[page,setPage]=useState(0),[zoom,setZoom]=useState(false);
  const gesture=useRef(null),suppress=useRef(false);
  useEffect(()=>{
    const ac=new AbortController();
    const timeout=setTimeout(()=>ac.abort(),8000);
    getTeaProductImage(tea.id,{signal:ac.signal}).then(value=>{if(!ac.signal.aborted)setImage(value);}).catch(()=>{}).finally(()=>clearTimeout(timeout));
    return ()=>{clearTimeout(timeout);ac.abort();};
  },[tea.id]);
  useEffect(()=>{
    if(!image||ready)return;
    const timer=setTimeout(()=>setImage(null),15000);
    return ()=>clearTimeout(timer);
  },[image,ready]);
  function fail(){setReady(false);setPage(0);setZoom(false);setImage(null);}
  const zoomImage=zoom&&image&&<img src={image.url} alt={tea.rawName+' – product packaging'} referrerPolicy="no-referrer" onError={fail} />;
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
      if(ready&&Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)*1.3)setPage(dx<0?1:0);
    }} onPointerCancel={()=>{gesture.current=null;suppress.current=true;}}>
      <div className="fac-image-gallery__track" style={{transform:`translateX(-${page*100}%)`}}>
        <div className="fac-image-gallery__category" aria-hidden={page!==0}>{children}</div>
        {image && <button type="button" className="fac-image-gallery__product" tabIndex={ready&&page===1?0:-1}
          aria-hidden={!ready||page!==1} aria-label="Enlarge product image" disabled={!ready}
          onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')suppress.current=false;}}
          onClick={()=>{if(!suppress.current&&ready&&page===1)setZoom(true);}}>
          <img src={image.url} alt={tea.rawName+' – product packaging'} referrerPolicy="no-referrer" draggable="false"
            onLoad={()=>setReady(true)} onError={fail} />
        </button>}
      </div>
    </div>
    {ready&&<div className="fac-image-gallery__dots" role="group" aria-label="Tea images">
      {['Category image','Product image'].map((label,index)=><button key={label} type="button" aria-label={label} aria-pressed={page===index}
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
