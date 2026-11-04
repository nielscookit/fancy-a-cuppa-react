import { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { CATEGORY_LABELS, TEA_VARIETIES, DOSE_UNITS, initialTeaForm, validateTeaForm } from '../features/teaModel.js';
import { createTea, updateTea } from '../data/teaRepository.js';

const fieldSx = {
  '& .MuiFilledInput-root': {
    height: 48, borderRadius: '6px', backgroundColor: 'rgba(29,29,29,0.07)',
    border: '3px solid transparent',
    '&:hover': { backgroundColor: 'rgba(29,29,29,0.09)' },
    '&.Mui-focused': { backgroundColor: 'rgba(29,29,29,0.07)' },
    '&:has(input:focus-visible), &:has(.MuiSelect-select:focus-visible)': {
      borderColor: '#792b40',
    },
  },
  '& .MuiFilledInput-input': { fontSize: 16, fontWeight: 500, py: '10px' },
  '& .MuiSelect-select': { fontSize: 16, fontWeight: 500, py: '10px !important' },
};
function Field({ label, value, onChange, options, type = 'text', required = false }) {
  const props = {
    variant: 'filled', fullWidth: true, hiddenLabel: true, size: 'small',
    value, onChange, required,
    slotProps: { input: { disableUnderline: true }, htmlInput: { 'aria-label': label } },
    sx: fieldSx,
  };
  return (
    <Box>
      <Typography component="label" sx={{ display:'block', fontSize:16, fontWeight:500, mb:0.75 }}>
        {label}{required ? ' *' : ''}
      </Typography>
      {options
        ? <TextField {...props} select SelectProps={{ displayEmpty:true, IconComponent: () => (
            <span className="material-symbols-outlined" style={{ pointerEvents:'none', marginRight:8 }}>expand_more</span>
          ) }}>
            {options.map(item => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
          </TextField>
        : <TextField {...props} type={type} />}
    </Box>
  );
}
export default function TeaEditor({ tea, barcode, onCancel, onSaved }) {
  const [form, setForm] = useState(() => initialTeaForm(tea));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (field, value) => setForm(previous => ({ ...previous, [field]:value }));
  const changeType = value => setForm(previous => ({
    ...previous, type:value, unit:value === 'bag' ? 'bag' :
      previous.unit === 'bag' ? 'tsp' : previous.unit,
  }));
  const changeCategory = value => setForm(previous => ({
    ...previous, category:value,
    subcategory: TEA_VARIETIES[value]?.[0] === 'Sonstige' ? 'other' : TEA_VARIETIES[value]?.[0] || 'other',
    subcategory_other:'',
  }));
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    let payload;
    try { payload = validateTeaForm(form); }
    catch (failure) { setError(failure.message); return; }
    setSaving(true);
    setError('');
    try {
      if (barcode) payload.code = barcode;
      if (payload.id) await updateTea(payload);
      else await createTea(payload);
      await onSaved(payload);
    } catch (failure) {
      setError(failure?.message || String(failure));
    } finally { setSaving(false); }
  }
  const cats = Object.entries(CATEGORY_LABELS).map(([value,label]) => ({value,label}));
  const varieties = (TEA_VARIETIES[form.category] || []).map(value => ({
    value: value === 'Sonstige' ? 'other' : value,
    label: value,
  }));
  const units = Object.entries(DOSE_UNITS)
    .filter(([value]) => form.type === 'bag' ? value === 'bag' : value !== 'bag')
    .map(([value,label]) => ({value,label}));
  return (
    <Box component="form" onSubmit={save} noValidate sx={{mt:2}}>
      <Typography component="h2" sx={{ fontSize:20, fontWeight:600, mb:2 }}>
        {tea ? 'Tee bearbeiten' : 'Tee hinzufügen'}
      </Typography>
      <Stack gap={2}>
        <Field label="Tee" value={form.name} onChange={e=>set('name',e.target.value)} required />
        <Field label="Hersteller" value={form.brand} onChange={e=>set('brand',e.target.value)} required />
        <Field label="Kategorie" value={form.category} onChange={e=>changeCategory(e.target.value)} options={cats} required />
        <Field label="Sorte" value={form.subcategory} onChange={e=>set('subcategory',e.target.value)} options={varieties} required />
        {form.subcategory === 'other' &&
          <Field label="Sorte genauer" value={form.subcategory_other}
            onChange={e=>set('subcategory_other',e.target.value)} required />}
        <Field label="Darreichungsform" value={form.type} onChange={e=>changeType(e.target.value)}
          options={[{value:'loose',label:'Loser Tee'},{value:'bag',label:'Teebeutel'}]} required />
        <Field label="Referenzdosierung" type="number" value={form.qty}
          onChange={e=>set('qty',e.target.value)} required />
        <Field label="Dosier-Einheit" value={form.unit} onChange={e=>set('unit',e.target.value)}
          options={units} required />
        <Field label="Referenzwasser (ml)" type="number" value={form.base}
          onChange={e=>set('base',e.target.value)} required />
        <Field label="Ziehzeit (Minuten)" type="number" value={form.mins}
          onChange={e=>set('mins',e.target.value)} required />
        <Field label="Temperatur (°C, optional)" type="number" value={form.temperature}
          onChange={e=>set('temperature',e.target.value)} />
      </Stack>
      {error && <Typography role="alert" color="error" sx={{ mt:2, fontSize:13 }}>{error}</Typography>}
      <Stack direction="row" gap={1} sx={{mt:3}}>
        <Button variant="outlined" fullWidth type="button" onClick={onCancel} disabled={saving}>Abbrechen</Button>
        <Button variant="contained" fullWidth type="submit" disabled={saving}>
          {saving ? 'Speichert…' : 'SPEICHERN'}
        </Button>
      </Stack>
    </Box>
  );
}
