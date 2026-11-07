/** Tea category, leaf-style and search model aligned to the current Supabase schema. */
export const CATEGORY_LABELS = Object.freeze({
  black:'Black Tea', green:'Green Tea', white:'White Tea', oolong:'Oolong',
  yellow:'Yellow Tea', dark:'Dark Tea', pu_erh:'Pu-erh Tea',
  herbal:'Herbal Infusions', fruit:'Fruit Infusions', rooibos:'Rooibos',
  mate:'Maté', other:'Other Infusions',
});
/**
 * Six approved UX categories in Add/Edit Tea.
 * All twelve Supabase enum keys remain readable in CATEGORY_LABELS;
 * this UI list never mutates, deletes or recategorises existing records.
 */
export const UI_CATEGORY_LABELS = Object.freeze({
  black:'Black Tea',
  green:'Green Tea',
  fruit:'Fruit',
  herbal:'Herbal',
  rooibos:'Rooibos',
  other:'Other',
});

/** Present legacy/unknown Supabase categories as Other without rewriting
 * the original category value in the stored tea or editor form.
 */
export function getUiTeaCategory(category) {
  return Object.prototype.hasOwnProperty.call(UI_CATEGORY_LABELS, category)
    ? category : 'other';
}

export const LEAF_STYLE_LABELS = Object.freeze({
  whole:'Whole leaf', broken:'Broken leaf', ctc:'CTC',
  fannings_dust:'Fannings / dust', powder:'Powder',
  bag:'Tea bag', other:'Other',
});
export const TEA_VARIETIES = Object.freeze({
  black:['Assam','Darjeeling','Ceylon','Earl Grey','English Breakfast','Chai'],
  green:['Sencha','Bancha','Gunpowder','Gyokuro','Matcha'],
  white:['Silver Needle','Bai Mu Dan','Shou Mei'],
  oolong:['Oolong'],yellow:['Yellow Tea'],dark:['Dark Tea'],
  pu_erh:['Sheng','Shou'],fruit:['Berry','Apple','Citrus','Blend'],
  herbal:['Peppermint','Camomile','Fennel','Blend'],
  rooibos:['Natural','Flavoured'],mate:['Green Maté','Roasted Maté'],other:[],
});
export const DOSE_UNITS = Object.freeze({tsp:'tsp',g:'g',bag:'bags',measure:'measures'});
export const VOLUMES = Object.freeze([250,500,1000,1500]);
const CATEGORY_ALIASES = Object.freeze({
  black:'Schwarztee',green:'Grüntee',white:'Weißtee',oolong:'Oolong',
  yellow:'Gelber Tee',dark:'Dunkler Tee',pu_erh:'Pu Erh',
  herbal:'Kräutertee',fruit:'Früchtetee',rooibos:'Rotbusch',
  mate:'Mate Tee',other:'Sonstige',
});
const SYNONYMS = Object.freeze({
  'black tea':'black', 'schwarz tee':'black','schwarztee':'black',
  'green tea':'green','gruen tee':'green','gruentee':'green',
  'white tea':'white','weiss tee':'white','weisstee':'white',
  'yellow tea':'yellow','gelber tee':'yellow','dark tea':'dark',
  'dunkler tee':'dark','pu erh':'pu erh','puerh':'pu erh',
  'fruit tea':'fruit','fruechtetee':'fruit','fruechte tee':'fruit',
  'herbal tea':'herbal','kraeutertee':'herbal','kraeuter tee':'herbal',
  'loose tea':'loose','loser tee':'loose','loser':'loose',
  'tea bags':'bag','tea bag':'bag','teebeutel':'bag','beuteltee':'bag',
  'whole leaf':'whole','ganzblatt':'whole','broken leaf':'broken',
  'teebruch':'broken','fannings dust':'fannings dust','mate tea':'mate',
});
export function normalizeQuery(value) {
  return String(value || '').toLowerCase()
    .replace(/ß/g,'ss').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim();
}
function searchTerms(raw) {
  let text=normalizeQuery(raw);
  for(const [key,replacement] of Object.entries(SYNONYMS)) {
    text=(' '+text+' ').replaceAll(' '+key+' ',' '+replacement+' ').trim();
  }
  return text.split(/\s+/).filter(Boolean);
}
export function teaMatches(tea,query) {
  const words=searchTerms(query);
  if(!words.length)return true;
  const indexed=normalizeQuery([
    tea.name,tea.rawName,tea.brand,tea.category,
    tea.subcategory,tea.subcategory_other,tea.type,
    tea.leafStyle,LEAF_STYLE_LABELS[tea.leafStyle],
    CATEGORY_LABELS[tea.category],CATEGORY_ALIASES[tea.category],
    getUiTeaCategory(tea.category),UI_CATEGORY_LABELS[getUiTeaCategory(tea.category)],
    tea.code?.value,...(tea.codes||[]).map(c=>c.value),
    tea.type==='bag'?'tea bag teebeutel':'loose tea loser tee',
  ].join(' ')).split(' ');
  return words.every(word => indexed.some(keyword => keyword.startsWith(word)));
}
export function calculateDose(tea,waterMl) {
  if(!tea||!(waterMl>0)||!(tea.base>0))return null;
  if (tea.unit === 'bag') return Math.ceil(waterMl / 250);
  return tea.qty*waterMl/tea.base;
}
export function formatDose(quantity,unit) {
  if(!Number.isFinite(quantity)||quantity<=0)return '–';
  const decimals=quantity%1===0?0:(unit==='g'?1:2);
  return new Intl.NumberFormat('de-DE',{maximumFractionDigits:decimals}).format(quantity)
    +' '+(DOSE_UNITS[unit]||unit);
}
export function initialTeaForm(tea) {
  return {
    id:tea?.id||null,
    name:tea?.rawName||'',
    brand:tea?.brand||'',
    category:tea?.category||'black',
    subcategory:tea?.subcategory||'',
    subcategory_other:tea?.subcategory_other||'',
    type:tea?.type||'loose',
    leafStyle:tea?.leafStyle||(tea?.type==='bag'?'bag':''),
    photoUrl:tea?.photoUrl||'',
    instructions:tea?.instructions||'',
    sourceLabel:tea?.sourceLabel||'',
    codeType:tea?.code?.type||'',
    codeValue:tea?.code?.value||'',
    unit:tea?.unit||'tsp',
    qty:String(tea?.qty??1),
    base:String(tea?.base??250),
    mins:String(tea?.brewSeconds?tea.brewSeconds/60:4),
    temperature:tea?.temperature==null?'':String(tea.temperature),
  };
}
export function validateTeaForm(form) {
  if(!form.name?.trim()||!form.brand?.trim()||!form.category)
    throw new Error('Tea name, manufacturer and category are required.');
  if(!(form.category in CATEGORY_LABELS))
    throw new Error('Unknown tea category.');
  if(form.leafStyle&&!(form.leafStyle in LEAF_STYLE_LABELS))
    throw new Error('Unknown leaf style.');
  if(form.subcategory==='other'&&!form.subcategory_other?.trim())
    throw new Error('Please specify the tea subtype.');
  if(form.type==='bag'&&form.leafStyle&&form.leafStyle!=='bag'
    ||form.type==='loose'&&form.leafStyle==='bag')
    throw new Error('Leaf style does not match tea format.');
  if(form.type==='bag'&&form.unit!=='bag'||form.type==='loose'&&form.unit==='bag')
    throw new Error('Dosage unit does not match tea format.');
  const photoUrl=String(form.photoUrl||'').trim();
  if(photoUrl&&!/^https:\/\//i.test(photoUrl))throw new Error('Photo URL must use HTTPS.');
  if(photoUrl.length>2048)throw new Error('Photo URL is too long.');
  const instructions=String(form.instructions||'').trim();
  const sourceLabel=String(form.sourceLabel||'').trim();
  if(instructions.length>2000)throw new Error('Preparation notes are too long.');
  if(sourceLabel.length>250)throw new Error('Source label is too long.');
  const codeType=String(form.codeType||'').trim();
  const codeValue=String(form.codeValue||'').trim();
  if(Boolean(codeType)!==Boolean(codeValue))
    throw new Error('Barcode type and value must both be present.');
  const numericLengths={ean_8:8,ean_13:13,upc_a:12,gtin_14:14};
  if(codeType&&!['ean_8','ean_13','upc_a','gtin_14','qr'].includes(codeType))
    throw new Error('Unknown barcode type.');
  if(numericLengths[codeType]&&!new RegExp('^[0-9]{'+numericLengths[codeType]+'}$').test(codeValue)
    ||codeType==='qr'&&codeValue.length>512)
    throw new Error('Invalid barcode format.');
  const qty=Number(form.qty),base=Number(form.base),mins=Number(form.mins);
  const temperature=form.temperature===''?null:Number(form.temperature);
  if(!Number.isFinite(qty)||qty<=0||qty>100)throw new Error('Dosage must be between 0 and 100.');
  if(!Number.isInteger(base)||base<50||base>10000)
    throw new Error('Water amount must be between 50 and 10000 ml.');
  if(!Number.isInteger(mins)||mins<1||mins>30)
    throw new Error('Brewing time must be 1 to 30 whole minutes.');
  if(temperature!=null&&(!Number.isInteger(temperature)||temperature<40||temperature>100))
    throw new Error('Temperature must be between 40 and 100 °C.');
  return {
    ...form,
    name:form.name.trim(),brand:form.brand.trim(),
    subcategory:String(form.subcategory||'').trim()||null,
    subcategory_other:form.subcategory==='other'?String(form.subcategory_other||'').trim():'',
    leafStyle:form.type==='bag'?'bag':form.leafStyle||null,
    photoUrl:photoUrl||null,instructions:instructions||null,
    sourceLabel:sourceLabel||null,
    code:codeType?{type:codeType,value:codeValue}:null,
    qty,base,mins,temperature,
  };
}
export function recentTeaIds(previous,id) {
  return [id,...previous.filter(item=>item!==id)].slice(0,5);
}
