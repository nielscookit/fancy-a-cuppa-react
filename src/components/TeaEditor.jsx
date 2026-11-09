import { useRef, useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import {
  UI_CATEGORY_LABELS, getUiTeaCategory, DOSE_UNITS, LEAF_STYLE_LABELS,
  initialTeaForm, validateTeaForm,
} from '../features/teaModel.js';
import { createTea, updateTea } from '../data/teaRepository.js';

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

function Field({ label, value, onChange, choices, type='text', required=false, helper='', error='', placeholder='' }) {
  const props={
    variant:'filled',fullWidth:true,hiddenLabel:true,size:'small',
    value,onChange,required,error:Boolean(error),placeholder,
    slotProps:{input:{disableUnderline:true},htmlInput:{'aria-label':label}},
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
export default function TeaEditor({ tea, barcode, message, onCancel, onSaved }) {
  const [form,setForm]=useState(()=>{
    const next=initialTeaForm(tea);
    if(!tea&&barcode){
      next.codeType=barcode.type||'';
      next.codeValue=barcode.value||'';
    }
    return next;
  });
  const savingRef=useRef(false);
  const [fieldErrors,setFieldErrors]=useState({});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const set=(field,value)=>{setForm(previous=>({...previous,[field]:value}));setFieldErrors(previous=>({...previous,[field]:''}));};
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
    if(savingRef.current)return;
    const errors={};
    for(const key of ['name','brand','category','qty','base','mins']) if(!String(form[key]??'').trim()) errors[key]='Required field';
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
    }catch(failure){setError(failure.message);return;}
    savingRef.current=true;setSaving(true);setError('');
    try {
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
        <Typography sx={{fontSize:12,mt:"2px",color:error?'error.main':'#656c70'}}>{error || (tea?'Update the brewing details for this tea.':'Enter the tea and brewing details.')}</Typography>
      </Box>
      <Box className="fac-sheet-scroll fac-sheet-scroll--editor">
        {message && <Typography role="status">{message}</Typography>}
        <Stack gap="24px">
          <Field label="Tea name" placeholder="Enter tea name" error={fieldErrors.name} value={form.name} onChange={e=>set('name',e.target.value)} required />
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
          <Button variant="contained" type="submit" disabled={saving} className="fac-sheet-add">
            {saving?'SAVING…':'SAVE'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
