import { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import {
  UI_CATEGORY_LABELS, getUiTeaCategory, TEA_VARIETIES, DOSE_UNITS, LEAF_STYLE_LABELS,
  initialTeaForm, validateTeaForm,
} from '../features/teaModel.js';
import { createTea, updateTea } from '../data/teaRepository.js';

const fieldSx = {
  '& .MuiFilledInput-root': {
    height:48, borderRadius:'6px',
    backgroundColor:'rgba(29,29,29,0.07)',border:'3px solid transparent',
    '&:hover':{ backgroundColor:'rgba(29,29,29,0.09)' },
    '&.Mui-focused':{ backgroundColor:'rgba(29,29,29,0.07)',borderColor:'#792b40' },
  },
  '& .MuiFilledInput-input':{fontSize:16,fontWeight:500,py:'10px'},
  '& .MuiSelect-select':{fontSize:16,fontWeight:500,py:'10px !important'},
};
const options = values => Object.entries(values).map(([value,label])=>({value,label}));

function Field({ label, value, onChange, choices, type='text', required=false, helper='' }) {
  const props={
    variant:'filled',fullWidth:true,hiddenLabel:true,size:'small',
    value,onChange,required,
    slotProps:{input:{disableUnderline:true},htmlInput:{'aria-label':label}},
    sx:fieldSx,
  };
  return (
    <Box>
      <Typography component="label"
        sx={{display:'block',fontSize:16,fontWeight:500,mb:.75}}>
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
      {helper&&<Typography sx={{fontSize:12,color:'text.secondary',mt:.5}}>{helper}</Typography>}
    </Box>
  );
}

/**
 * V3 extended schema editor.
 * The existing community-tea endpoint has a narrower write contract;
 * teaRepository rejects any request that could discard new-model fields.
 */
export default function TeaEditor({ tea, barcode, onCancel, onSaved }) {
  const [form,setForm]=useState(()=>{
    const next=initialTeaForm(tea);
    if(!tea&&barcode){
      next.codeType=barcode.type||'';
      next.codeValue=barcode.value||'';
    }
    return next;
  });
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const set=(field,value)=>setForm(previous=>({...previous,[field]:value}));
  const changeType=value=>setForm(previous=>({
    ...previous,type:value,
    unit:value==='bag'?'bag':(previous.unit==='bag'?'tsp':previous.unit),
    leafStyle:value==='bag'?'bag':(previous.leafStyle==='bag'?'':previous.leafStyle),
  }));
  const changeCategory=value=>setForm(previous=>({
    ...previous,category:value,subcategory:'',subcategory_other:'',
  }));
  async function save(event) {
    event.preventDefault();
    if(saving)return;
    let payload;
    try {
      payload=validateTeaForm(form);
      payload.original=tea||null;
    }catch(failure){setError(failure.message);return;}
    setSaving(true);setError('');
    try {
      if(payload.id)await updateTea(payload);
      else await createTea(payload);
      await onSaved(payload);
    }catch(failure){setError(failure?.message||String(failure));}
    finally{setSaving(false);}
  }

  const cats=options(UI_CATEGORY_LABELS);
  const leaves=[{value:'',label:'Not specified'},...options(LEAF_STYLE_LABELS).filter(x=>
    form.type==='bag'?x.value==='bag':x.value!=='bag')];
  const units=options(DOSE_UNITS).filter(x=>
    form.type==='bag'?x.value==='bag':x.value!=='bag');
  const suggestions=TEA_VARIETIES[form.category]||[];
  const codeTypes=[
    {value:'',label:'No barcode'},
    {value:'ean_8',label:'EAN-8'},{value:'ean_13',label:'EAN-13'},
    {value:'upc_a',label:'UPC-A'},{value:'gtin_14',label:'GTIN-14'},
    {value:'qr',label:'QR code'},
  ];
  return (
    <Box component="form" onSubmit={save} noValidate sx={{mt:2}}>
      <Typography component="h2" sx={{fontSize:20,fontWeight:600,mb:2}}>
        {tea?'Edit tea':'Add new tea'}
      </Typography>
      <Stack gap={2}>
        <Field label="Tea name" value={form.name} onChange={e=>set('name',e.target.value)} required />
        <Field label="Manufacturer" value={form.brand} onChange={e=>set('brand',e.target.value)} required />
        <Field label="Category" value={getUiTeaCategory(form.category)} onChange={e=>changeCategory(e.target.value)}
          choices={cats} required />
        <Field label="Tea subtype (optional)" value={form.subcategory}
          onChange={e=>set('subcategory',e.target.value)}
          helper={suggestions.length?'Examples: '+suggestions.join(', '):'Free text; leave blank if unknown.'} />
        {form.subcategory==='other'&&<Field label="Specify subtype"
          value={form.subcategory_other} required
          onChange={e=>set('subcategory_other',e.target.value)} />}
        <Field label="Tea format" value={form.type} onChange={e=>changeType(e.target.value)}
          choices={[{value:'loose',label:'Loose tea'},{value:'bag',label:'Tea bags'}]} required />
        <Field label="Leaf style (optional)" value={form.leafStyle||''}
          onChange={e=>set('leafStyle',e.target.value)} choices={leaves} />
        <Field label="Reference quantity" type="number" value={form.qty}
          onChange={e=>set('qty',e.target.value)} required />
        <Field label="Dosage unit" value={form.unit} onChange={e=>set('unit',e.target.value)}
          choices={units} required />
        <Field label="Reference water (ml)" type="number" value={form.base}
          onChange={e=>set('base',e.target.value)} required />
        <Field label="Brewing time (minutes)" type="number" value={form.mins}
          onChange={e=>set('mins',e.target.value)} required />
        <Field label="Temperature (°C, optional)" type="number" value={form.temperature}
          onChange={e=>set('temperature',e.target.value)} />
        <Field label="Preparation instructions (optional)" value={form.instructions}
          onChange={e=>set('instructions',e.target.value)} />
        <Field label="Preparation source (optional)" value={form.sourceLabel}
          onChange={e=>set('sourceLabel',e.target.value)} />
        <Field label="Barcode type (optional)" value={form.codeType}
          onChange={e=>setForm(p=>({...p,codeType:e.target.value,
            codeValue:e.target.value?p.codeValue:''}))}
          choices={codeTypes} />
        {form.codeType&&<Field label="Barcode value" value={form.codeValue}
          onChange={e=>set('codeValue',e.target.value)} required />}
      </Stack>
      <Typography sx={{mt:2,fontSize:12,color:'text.secondary'}}>
        Entries that the current database writer cannot preserve are blocked rather than silently discarded.
      </Typography>
      {error&&<Typography role="alert" color="error" sx={{mt:2,fontSize:13}}>{error}</Typography>}
      <Stack direction="row" gap={1} sx={{mt:3}}>
        <Button variant="contained" type="button" onClick={onCancel} disabled={saving}
          sx={{height:66,borderRadius:'100px',fontSize:16,bgcolor:'#eeeeec',color:'#323234',
            '&:hover':{bgcolor:'#eeeeec'}}}>CANCEL</Button>
        <Button variant="contained" type="submit" disabled={saving}
          sx={{height:66,borderRadius:'100px',fontSize:16,bgcolor:'#782b40',
            '&:hover':{bgcolor:'#782b40'}}}>
          {saving?'SAVING…':'SAVE'}
        </Button>
      </Stack>
    </Box>
  );
}
