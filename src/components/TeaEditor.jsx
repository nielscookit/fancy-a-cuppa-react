import { useEffect, useRef, useState } from 'react';
import { Box, Button, IconButton, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import {
  UI_CATEGORY_LABELS, getUiTeaCategory, DOSE_UNITS, LEAF_STYLE_LABELS,
  initialTeaForm, validateTeaForm,
} from '../features/teaModel.js';
import { communityTeaV4, createTea, listCommunityTeaPhotos, lookupTeaByCode, updateTea } from '../data/teaRepository.js';

const figma = import.meta.env.BASE_URL + 'figma/';

const fieldSx = {
  '& .MuiFilledInput-root': {
    height:48, borderRadius:'6px',
    '&.Mui-error':{outline:'2px solid #EF493B',outlineOffset:-2},
    backgroundColor:'#F3F2F0',
    '&:hover':{ backgroundColor:'#F3F2F0' },
    '&.Mui-focused':{ backgroundColor:'#F3F2F0' },
  },
  '& .MuiFilledInput-input':{fontSize:16,fontWeight:500,py:'10px'},
  '& .MuiSelect-select':{fontSize:16,fontWeight:500,py:'10px !important'},
};
const options = values => Object.entries(values).map(([value,label])=>({value,label}));

function Field({ label, value, onChange, choices, type='text', required=false, helper='', error='', placeholder='', endAdornment, inputMode }) {
  const props={
    variant:'filled',fullWidth:true,hiddenLabel:true,size:'small',
    value,onChange,required,error:Boolean(error),placeholder,
    slotProps:{input:{disableUnderline:true,endAdornment},htmlInput:{'aria-label':label,inputMode}},
    sx:fieldSx,
  };
  return (
    <Box>
      <Typography component="label"
        sx={{display:'block',fontSize:16,fontWeight:500,lineHeight:'21px',mb:'10px'}}>
        {label}{required?' *':''}
      </Typography>
      {choices
        ? <TextField {...props} select SelectProps={{displayEmpty:true,IconComponent:()=>(
            <span className="material-symbols-outlined" style={{pointerEvents:'none',marginRight:8}}>
              expand_more
            </span>
          )}}>
            {choices.map(item=><MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
          </TextField>
        : <TextField {...props} type={type} />}
      {error && <Typography role="alert" sx={{fontSize:12,color:'error.main',mt:.5}}>{error}</Typography>}
      {helper&&<Typography sx={{fontSize:12,color:'text.secondary',mt:.5}}>{helper}</Typography>}
    </Box>
  );
}

/**
 * V3 editor for tea identity and preparation.
 */
export default function TeaEditor({ tea, nativeIOS = false, barcode, photos = [], prefill = null, message, onCancel, onSaved, onScanBarcode }) {
  const [form,setForm]=useState(()=>{
    const next=initialTeaForm(tea || prefill);
    if (!tea) {
      next.id=null;
      // A recognized catalogue tea must not copy its registered barcode into
      // a new tea; only an actually scanned unknown barcode is transferable.
      next.codeType='';
      next.codeValue='';
      // Image, notes and source from catalog are not transferable through
      // the community-tea write API; do not silently copy them.
      next.photoUrl='';
      next.instructions='';
      next.sourceLabel='';
    }
    if(!tea&&barcode){
      next.codeType=barcode.type||'';
      next.codeValue=barcode.value||'';
    }
    return next;
  });
  const savingRef=useRef(false);
  const scanningBarcode = useRef(false);
  const photoInputRef=useRef(null);
  const preparingPhotosRef = useRef(false);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [previews,setPreviews]=useState(() => Array.isArray(photos) ? photos.filter(photo => typeof photo === 'string' && photo.startsWith('data:image/jpeg;base64,')).slice(0, communityTeaV4 ? 3 : undefined) : []);
  const photoEditing = communityTeaV4 || !tea;
  const [storedPhotos, setStoredPhotos] = useState([]);
  const [photoLoad, setPhotoLoad] = useState(communityTeaV4 && tea ? 'loading' : 'ready');
  const saveAttempt = useRef(null);
  useEffect(() => {
    if (!communityTeaV4 || !tea) return;
    const controller = new AbortController();
    listCommunityTeaPhotos(tea.id, { signal: controller.signal }).then(items => {
      if (controller.signal.aborted) return;
      setStoredPhotos(items);
      setPreviews(items.map(item => item.url));
      setPhotoLoad('ready');
    }).catch(() => {
      if (!controller.signal.aborted) setPhotoLoad('error');
    });
    return () => controller.abort();
  }, [tea?.id]);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const photoIndex = Math.min(selectedPhoto, Math.max(0, previews.length - 1));
  const [fieldErrors,setFieldErrors]=useState({});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  async function addLocalPhotos(event) {
    const picked = Array.from(event.target.files || []).filter(file => file.type.startsWith('image/'));
    const files = communityTeaV4 ? picked.slice(0, Math.max(0, 3 - previews.length)) : picked;
    event.target.value='';
    if (!files.length || preparingPhotosRef.current || savingRef.current) return;
    preparingPhotosRef.current = true;
    setPreparingPhotos(true);
    setError('');
    const next=await Promise.all(files.map(file => new Promise(resolve => {
      const url=URL.createObjectURL(file);
      const image=new Image();
      image.onload=()=>{
        const canvas=document.createElement('canvas');
        try {
          const scale = Math.min(1, (communityTeaV4 ? 1600 : 750) / Math.max(image.naturalWidth, image.naturalHeight));
          if (nativeIOS) {
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          } else {
            canvas.width = canvas.height = 132;
            const size = Math.min(image.naturalWidth, image.naturalHeight);
            canvas.getContext('2d').drawImage(image, (image.naturalWidth - size) / 2,
              (image.naturalHeight - size) / 2, size, size, 0, 0, 132, 132);
          }
          let url = canvas.toDataURL('image/jpeg', 0.72);
          if (communityTeaV4 && url.split(',')[1]?.length > 1398104) {
            url = canvas.toDataURL('image/jpeg', 0.55);
          }
          const encoded = url.split(',')[1] || '';
          const bytes = Math.floor(encoded.length * 3 / 4) - (encoded.match(/=+$/)?.[0].length || 0);
          resolve(!communityTeaV4 || (bytes > 0 && bytes <= 1048576) ? url : null);
        } catch {
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      image.onerror=()=>{URL.revokeObjectURL(url);resolve(null);};
      image.src=url;
    }).catch(() => null)));
    preparingPhotosRef.current = false;
    setPreparingPhotos(false);
    if (communityTeaV4 && next.some(photo => !photo)) setError('Some photos could not be prepared for upload.');
    setPreviews(current => {
      const combined = current.concat(next.filter(Boolean));
      return communityTeaV4 ? combined.slice(0, 3) : combined;
    });
  }
  const set=(field,value)=>{setForm(previous=>({...previous,[field]:value}));setFieldErrors(previous=>({...previous,[field]:''}));};
  function setBarcode(value, type) {
    setForm(previous => ({ ...previous, codeValue: value, codeType: type }));
    setFieldErrors(previous => ({ ...previous, codeValue: '' }));
  }
  async function scanBarcode() {
    if (scanningBarcode.current || savingRef.current) return;
    scanningBarcode.current = true;
    try {
      const code = await onScanBarcode();
      if (code) setBarcode(code.value, code.type);
    } catch (failure) {
      setFieldErrors(previous => ({ ...previous, codeValue: failure.message || 'Camera unavailable.' }));
    } finally {
      scanningBarcode.current = false;
    }
  }
  const changeUnit=value=>setForm(previous=>({
    ...previous,type:value==='bag'?'bag':'loose',
    unit:value,
    leafStyle:value==='bag'?'bag':(previous.leafStyle==='bag'?'':previous.leafStyle),
  }));
  const changeCategory=value=>setForm(previous=>({
    ...previous,category:value,subcategory:'',subcategory_other:'',
  }));
  async function save(event) {
    event.preventDefault();
    if(savingRef.current || scanningBarcode.current || preparingPhotosRef.current || photoLoad !== 'ready')return;
    const errors={};
    for(const key of ['name','brand','category','qty','base','mins']) if(!String(form[key]??'').trim()) errors[key]='Required field';
    if(tea?.code && !form.codeValue) errors.codeValue='Enter a replacement barcode to keep this tea linked.';
    if(form.codeValue && !form.codeType) errors.codeValue='Enter an EAN-8, UPC-A or EAN-13 barcode.';
    for(const [key,min,max] of [['qty',0.01,100],['base',50,10000],['mins',1,30],['temperature',40,100]]) {
      if(form[key]!=='' && (!Number.isFinite(Number(form[key])) || Number(form[key])<min || Number(form[key])>max)) errors[key]=`Enter a value from ${min} to ${max}.`;
    }
    for(const key of ['base','mins','temperature']) if(form[key]!=='' && !Number.isInteger(Number(form[key]))) errors[key]='Enter a whole number.';
    for(const [key,max] of [['name',200],['brand',120],['subcategory',100],['subcategory_other',100]]) if(String(form[key]||'').length>max) errors[key]=`Use at most ${max} characters.`;
    setFieldErrors(errors);
    if(Object.keys(errors).length){setError('Please check the highlighted fields.');requestAnimationFrame(()=>event.target.querySelector('[aria-invalid="true"]')?.focus());return;}
    let payload;
    try {
      payload=validateTeaForm(form);
      payload.original=tea||null;
      if (communityTeaV4) {
        payload.photos = previews.map(url => {
          const previous = storedPhotos.find(photo => photo.url === url);
          return previous ? { key: previous.key } : { jpeg: url.split(',')[1] };
        });
        const signature = JSON.stringify(payload);
        if (saveAttempt.current?.signature !== signature) {
          saveAttempt.current = { signature, id: crypto.randomUUID() };
        }
        payload.saveId = saveAttempt.current.id;
      }
    }catch(failure){setError(failure.message);return;}
    savingRef.current=true;setSaving(true);setError('');
    try {
      if (!communityTeaV4 && nativeIOS && !payload.id && payload.code && await lookupTeaByCode(payload.code)) {
        setFieldErrors(previous => ({ ...previous, codeValue: 'This barcode is already linked to a tea.' }));
        setError('Remove or correct the existing barcode before saving.');
        return;
      }
      const result=payload.id ? await updateTea(payload) : await createTea(payload);
      await onSaved({...payload,id:result?.id ? 'cloud-'+String(result.id).replace(/^cloud-/, '') : payload.id});
    }catch(failure){setError(failure?.message||String(failure));}
    finally{savingRef.current=false;setSaving(false);}
  }

  const cats=[{value:'',label:'Choose category'},...options(UI_CATEGORY_LABELS)];
  const leaves=[{value:'',label:'Not specified'},...options(LEAF_STYLE_LABELS).filter(x=>
    form.type==='bag'?x.value==='bag':x.value!=='bag')];
  const subtype=form.subcategory==='other' ? form.subcategory_other : form.subcategory;
  return (
    <Box component="form" onSubmit={save} noValidate className="fac-sheet-editor">
      <Box sx={{px:3,pt:"10px",pb:"16px"}}>
        <Typography component="h2" sx={{fontSize:21,fontWeight:700,lineHeight:"28px"}}>{tea?'Edit Tea':'Add New Tea'}</Typography>
        <Typography sx={{fontSize:12,mt:"2px",color:error?'error.main':'#656c70'}}>{error || (tea?'Update the brewing details for this tea.':'Add tea information.')}</Typography>
      </Box>
      <Box className="fac-sheet-scroll fac-sheet-scroll--editor">
        {message && <Typography role="status">{message}</Typography>}
        {photoLoad !== 'ready' && <Typography role="status">
          {photoLoad === 'loading' ? 'Loading tea photos…' : 'Tea photos could not be loaded. Reopen the editor to try again.'}
        </Typography>}
        {photoEditing && photoLoad === 'ready' && (
          <Box className="fac-editor-photos" aria-label="Tea photos">
            <input ref={photoInputRef} type="file" accept="image/*" multiple
              hidden onChange={addLocalPhotos} aria-label="Choose tea photos" />
            {(nativeIOS || communityTeaV4) ? (
              <>
                <Box className="fac-editor-photos__hero fac-editor-photos__hero--native">
                  {previews.length ? (
                    <>
                      <img src={previews[photoIndex]} alt={`Tea photo ${photoIndex + 1}`} />
                      <IconButton type="button" className="fac-editor-photos__delete" disabled={saving || preparingPhotos}
                        aria-label={`Remove tea photo ${photoIndex + 1}`}
                        onClick={() => {
                          setPreviews(current => current.filter((_, index) => index !== photoIndex));
                          setSelectedPhoto(Math.max(0, photoIndex - 1));
                        }}><img src={figma + 'uc02-photo-delete.svg'} width="48" height="48" alt="" /></IconButton>
                    </>
                  ) : (
                    <>
                      <img className="fac-editor-photos__empty-icon" src={figma + 'uc02-photo-empty.svg'} width="32" height="32" alt="" />
                      <IconButton type="button" className="fac-editor-photos__add fac-editor-photos__add--empty"
                        disabled={saving || preparingPhotos} onClick={() => photoInputRef.current?.click()} aria-label="Add a tea photo"><img src={figma + 'uc02-photo-add-empty.svg'} width="48" height="48" alt="" /></IconButton>
                    </>
                  )}
                </Box>
                {previews.length > 0 && (
                  <Box className="fac-editor-photos__thumbnails fac-editor-photos__thumbnails--native">
                    {previews.map((photo, index) => (
                      <IconButton type="button" key={index} className="fac-editor-photos__thumbnail"
                        aria-pressed={photoIndex === index} aria-label={`View tea photo ${index + 1}`}
                        onClick={() => setSelectedPhoto(index)}>
                        <img src={photo} alt="" />
                      </IconButton>
                    ))}
                    {(!communityTeaV4 || previews.length < 3) && <IconButton type="button" className="fac-editor-photos__add"
                      disabled={saving || preparingPhotos} onClick={() => photoInputRef.current?.click()} aria-label="Add a tea photo"><img src={figma + 'uc02-photo-add.svg'} width="48" height="48" alt="" /></IconButton>}
                  </Box>
                )}
              </>
            ) : (
              <>
            {previews.length > 0
              ? <Box className="fac-editor-photos__hero">
                  <img src={previews[0]} alt="First captured tea photo" />
                </Box>
              : <Button type="button" className="fac-editor-photos__hero" fullWidth
                  disabled={saving || preparingPhotos} onClick={() => photoInputRef.current?.click()} aria-label="Add a tea photo">
                  <span className="material-symbols-outlined" aria-hidden="true">add_a_photo</span>
                </Button>}
            {previews.length > 0 && (
              <Box className="fac-editor-photos__thumbnails">
                {previews.map((photo,index) => (
                  <Box className="fac-editor-photos__thumbnail" key={index}>
                    <img src={photo} alt={`Tea photo ${index+1}`} />
                    <Button type="button" onClick={() => setPreviews(current => current.filter((_,i) => i !== index))}
                      aria-label={`Remove tea photo ${index+1}`} className="fac-editor-photos__remove">×</Button>
                  </Box>
                ))}
              </Box>
            )}
              </>
            )}
            {!communityTeaV4 && previews.length > 0 && <Typography sx={{fontSize:12,color:'#656c70'}}>Photos are previews only and are not saved yet.</Typography>}
          </Box>
        )}
        <Stack gap="24px">
          <Field label="Tea name" placeholder="Enter tea name" error={fieldErrors.name} value={form.name} onChange={e=>set('name',e.target.value)} required />
          {(!tea || communityTeaV4) && (
            <Field label="Barcode (EAN / UPC)" placeholder="Scan or enter barcode" value={form.codeValue}
              inputMode="numeric"
              onChange={e => {
                const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 13);
                setBarcode(value, { 8: 'ean_8', 12: 'upc_a', 13: 'ean_13' }[value.length] || '');
              }}
              error={fieldErrors.codeValue}
              endAdornment={onScanBarcode && <InputAdornment position="end">
                <IconButton type="button" aria-label="Scan barcode" disabled={saving} onClick={scanBarcode}>
                  <img src={figma+'tea-scanner.svg'} width="24" height="24" alt="" />
                </IconButton>
              </InputAdornment>} />
          )}
          <Field label="Manufacturer" placeholder="Enter manufacturer" error={fieldErrors.brand} value={form.brand} onChange={e=>set('brand',e.target.value)} required />
          <Field label="Category" error={fieldErrors.category} value={form.category ? getUiTeaCategory(form.category) : ''} onChange={e=>changeCategory(e.target.value)}
            choices={cats} required />
          <Field label="Tea subtype (optional)" error={fieldErrors.subcategory || fieldErrors.subcategory_other} value={subtype}
            onChange={e=>setForm(previous=>({...previous,
              subcategory: previous.subcategory === 'other' && e.target.value ? 'other' : e.target.value,
              subcategory_other: (previous.subcategory === 'other' || e.target.value === 'other')
                ? e.target.value : '',
            }))}
            placeholder="e.g. Assam" />
          <Field label="Leaf style (optional)" value={form.leafStyle||''}
            onChange={e=>set('leafStyle',e.target.value)} choices={leaves} />
          <Box>
            <Typography sx={{fontSize:16,fontWeight:500,mb:'11px'}}>Dosage unit *</Typography>
            <Box role="group" aria-label="Dosage unit" sx={{display:'flex',height:52,bgcolor:'#F3F2F0',borderRadius:'100px'}}>
              {['g','tsp','measure','bag'].map(unit=><Button key={unit} type="button" aria-pressed={form.unit===unit} onClick={()=>changeUnit(unit)} sx={{flex:1,minWidth:0,height:52,minHeight:52,borderRadius:'100px',px:0,fontSize:16,fontWeight:700,color:form.unit===unit?'#fff':'#1B272B',bgcolor:form.unit===unit?'#1B272B':'transparent','&:hover':{bgcolor:form.unit===unit?'#1B272B':'transparent'}}}>{DOSE_UNITS[unit]}</Button>)}
            </Box>
          </Box>
          <Field label="Reference quantity" placeholder="e.g. 1.5" type="number" error={fieldErrors.qty} value={form.qty}
            onChange={e=>set('qty',e.target.value)} required />
          <Field label="Reference water (ml)" placeholder="e.g. 250" type="number" error={fieldErrors.base} value={form.base}
            onChange={e=>set('base',e.target.value)} required />
          <Field label="Brewing time (minutes)" placeholder="e.g. 4" type="number" error={fieldErrors.mins} value={form.mins}
            onChange={e=>set('mins',e.target.value)} required />
          <Field label="Temperature (°C, optional)" placeholder="e.g. 100" type="number" error={fieldErrors.temperature} value={form.temperature}
            onChange={e=>set('temperature',e.target.value)} />
        </Stack>
        <Box className="fac-sheet-editor-actions">
          {error && <Typography role="alert" color="error" sx={{fontSize:13}}>{error}</Typography>}
          <Button variant="contained" type="button" onClick={onCancel} disabled={saving}
            className="fac-sheet-add fac-sheet-editor-cancel">CANCEL</Button>
          <Button variant="contained" type="submit" disabled={saving || preparingPhotos || photoLoad !== 'ready'} className="fac-sheet-add">
            {saving?'SAVING…':'SAVE'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
