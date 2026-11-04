import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, IconButton, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { listTeas, lookupTeaByCode } from './data/teaRepository.js';
import {
  CATEGORY_LABELS, VOLUMES, calculateDose, formatDose, teaMatches, recentTeaIds,
} from './features/teaModel.js';
import { scanBarcodePhoto } from './features/scanBarcode.js';
import TeaEditor from './components/TeaEditor.jsx';
import TeaTimer from './components/TeaTimer.jsx';
import HomeScreen from './components/HomeScreen.jsx';
import QuickTimerView from './components/QuickTimerView.jsx';
import { readQuickMinutes, saveQuickMinutes, stepQuickMinutes } from './features/quickTimer.js';
import { v3StorageKey } from './storage.js';
import Snackbar from '@mui/material/Snackbar';
import { flushSync } from 'react-dom';
import { animateScrollTo } from './features/scrollMotion.js';

const RECENTS_KEY = 'fancy-a-cuppa-v3-recent-teas';
const searchSx = {
  '& .MuiFilledInput-root': {
    height:48, borderRadius:'6px', backgroundColor:'rgba(29,29,29,.07)',
    border:'3px solid transparent',
    '&:hover': {backgroundColor:'rgba(29,29,29,.09)'},
    '&.Mui-focused': {backgroundColor:'rgba(29,29,29,.07)'},
    '&:has(input:focus-visible)': {borderColor:'#792b40'},
  },
  '& .MuiFilledInput-input': {fontSize:16,fontWeight:500,py:'10px'},
};
function Symbol({ children, size = 22 }) {
  return <span aria-hidden="true" className="material-symbols-outlined"
    style={{ fontSize:size, lineHeight:1, display:'inline-block' }}>{children}</span>;
}
function readRecents() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(value) ? value.filter(id => typeof id === 'string').slice(0,5) : [];
  } catch { return []; }
}
function teaSubtitle(tea) {
  const category = CATEGORY_LABELS[tea.category] || tea.category;
  const variety = tea.subcategory === 'other' ? tea.subcategory_other : tea.subcategory;
  return [category,variety,tea.type === 'bag' ? 'Teebeutel' : 'Loser Tee'].filter(Boolean).join(' · ');
}

/**
 * The approved selection/preparation flow in the V3 main app.
 * Existing iPhone-validated video controllers and /timer-test/ are untouched.
 */
export default function App() {
  const [catalog, setCatalog] = useState({ status:'loading', teas:[], error:'' });
  const [mode, setMode] = useState('closed'); // closed | search | prep | edit | add
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState(readRecents);
  const [volume, setVolume] = useState(250);
  const [customMl, setCustomMl] = useState('900');
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedCode, setScannedCode] = useState(null);
  const [message, setMessage] = useState('');
  const [quickMinutes, setQuickMinutes] = useState(readQuickMinutes);
  const [quickNotice, setQuickNotice] = useState('');
  const [quickTimerOpen, setQuickTimerOpen] = useState(false);
  const [quickVideoStatus, setQuickVideoStatus] = useState('loading');
  const quickTimerRef = useRef(null);
  const assistantSectionRef = useRef(null);
  const assistantButtonRef = useRef(null);
  const [assistantActive, setAssistantActive] = useState(false);
  const [assistantVisible, setAssistantVisible] = useState(false);
  const assistantHasLeftHomeRef = useRef(false);
  const assistantReturningHomeRef = useRef(false);
  const scrollingRef = useRef(null);
  const pendingScrollFrameRef = useRef(null);

  // Cancel scheduled/programmatic scrolling if this screen is unmounted.
  useEffect(() => () => {
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
    }
    scrollingRef.current?.();
  }, []);


  // The assistant button is in normal document flow. Clicking it selects
  // immediately. Reaching the very top by hand (or by return animation)
  // restores the default state and hides the search/detail section.
  useEffect(() => {
    saveQuickMinutes(quickMinutes);
  }, [quickMinutes]);

  useEffect(() => {
    if (!assistantVisible) return undefined;
    function onPageScroll() {
      const y = Math.max(0, window.scrollY);
      if (y >= 24) assistantHasLeftHomeRef.current = true;
      if (y > 2 ||
          !(assistantHasLeftHomeRef.current || assistantReturningHomeRef.current)) return;

      assistantHasLeftHomeRef.current = false;
      assistantReturningHomeRef.current = false;
      setAssistantActive(false);
      setAssistantVisible(false);
      setMode('closed');
    }
    window.addEventListener('scroll', onPageScroll, { passive: true });
    return () => window.removeEventListener('scroll', onPageScroll);
  }, [assistantVisible]);

  const showTeaAssistant = () => {
    const nextActive = !assistantActive;

    // Button state changes immediately on press, before any scrolling.
    setAssistantActive(nextActive);

    // A second press may reverse the motion while the first is in progress.
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
      pendingScrollFrameRef.current = null;
    }
    scrollingRef.current?.();
    scrollingRef.current = null;

    if (nextActive) {
      assistantReturningHomeRef.current = false;
      assistantHasLeftHomeRef.current = false;
      setAssistantVisible(true);
      setMode('search');
      setQuery('');
    } else {
      assistantReturningHomeRef.current = true;
      if (window.scrollY <= 2) {
        // Clicking twice before leaving Home should not leave a hidden
        // search section mounted behind the Home screen.
        assistantHasLeftHomeRef.current = false;
        assistantReturningHomeRef.current = false;
        setAssistantVisible(false);
        setMode('closed');
        return;
      }
    }

    // Keep the approved cubic ease-out. The red Home button ends at y=0
    // when the assistant button is positioned at 8px instead of 12px.
    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      const button = assistantButtonRef.current;
      const targetY = nextActive && button
        ? Math.max(0, window.scrollY + button.getBoundingClientRect().top - 8)
        : 0;
      scrollingRef.current = animateScrollTo(targetY);
    });
  };
  const startQuickTimer = () => {
    if (quickVideoStatus === 'error') {
      setQuickNotice('Video preparation failed. Retrying…');
      quickTimerRef.current?.retryPreload();
      return;
    }
    if (quickVideoStatus !== 'ready') {
      setQuickNotice('Preparing the videos. Please try again shortly.');
      return;
    }

    // The actual video element must be visible BEFORE .play(): a hidden
    // ancestor can cause video stalls on iPhone. React's flushSync changes
    // the overlay immediately but still inside the SAME user tap.
    // No Promise, await or delayed effect may intervene before begin().
    flushSync(() => setQuickTimerOpen(true));
    const started = quickTimerRef.current?.begin(quickMinutes * 60);
    if (!started) {
      setQuickTimerOpen(false);
      setQuickNotice('Timer not ready. Please try again.');
    }
  };

  const closeQuickTimer = () => {
    // Called exclusively by QuickTimerView.RESET after media and countdown
    // have been stopped/reset. Home keeps the last selected minute value.
    setQuickTimerOpen(false);
  };
  const photoRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const ac = new AbortController();
    listTeas({ signal:ac.signal })
      .then(teas => { if (!ac.signal.aborted) setCatalog({status:'ready',teas,error:''}); })
      .catch(error => { if (!ac.signal.aborted) setCatalog({
        status:'error',teas:[],error:error.message,
      }); });
    return () => ac.abort();
  }, []);

  const teas = catalog.teas;
  const selected = teas.find(tea => tea.id === selectedId) || null;
  const results = useMemo(() => teas.filter(tea => teaMatches(tea,query)), [teas,query]);
  const recents = recentIds.map(id => teas.find(tea => tea.id === id)).filter(Boolean);
  const water = volume == null ? Number(customMl) : volume;
  const validWater = Number.isInteger(water) && water >= 50 && water <= 5000;
  const dosage = selected && validWater ? formatDose(calculateDose(selected, water), selected.unit) : '–';

  function chooseTea(tea) {
    setSelectedId(tea.id);
    setVolume(250);
    setQuery('');
    setScanError('');
    setMessage('');
    setMode('prep');
    const ids = recentTeaIds(recentIds, tea.id);
    setRecentIds(ids);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(ids)); } catch { /* privacy mode */ }
  }
  function openSearch() {
    setQuery('');
    setMode('search');
    setScanError('');
    setMessage('');
  }
  async function scanPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || scannerBusy) return;
    setScannerBusy(true);
    setScanError('');
    setMessage('');
    try {
      const code = await scanBarcodePhoto(file);
      if (!code) throw new Error('Kein lesbarer Barcode gefunden.');
      const tea = await lookupTeaByCode(code);
      if (tea) {
        // Also handle a result not yet present in the initial 500-row list.
        if (!teas.some(item => item.id === tea.id)) {
          setCatalog(previous => ({...previous,teas:[tea,...previous.teas]}));
        }
        chooseTea(tea);
      } else {
        setScannedCode(code);
        setMode('add');
        setMessage('Code ist noch nicht im Katalog. Tee-Daten ergänzen.');
      }
    } catch (error) { setScanError(error?.message || String(error)); }
    finally { setScannerBusy(false); }
  }
  async function formSaved(payload) {
    // The preceding create/update request has already succeeded. A catalog
    // refresh failure must not produce a false "save failed" state that could
    // invite users to submit a duplicate tea.
    let updated;
    try { updated = await listTeas(); }
    catch (error) {
      setScannedCode(null);
      setMode('search');
      setMessage('Tee gespeichert. Der Katalog konnte nicht aktualisiert werden: ' +
        (error?.message || String(error)));
      return;
    }
    setCatalog({status:'ready',teas:updated,error:''});
    const match = updated.find(tea => payload.id
      ? tea.id === payload.id
      : tea.rawName.toLocaleLowerCase('de-DE') === payload.name.toLocaleLowerCase('de-DE') &&
        tea.brand.toLocaleLowerCase('de-DE') === payload.brand.toLocaleLowerCase('de-DE'));
    setScannedCode(null);
    if (match) chooseTea(match);
    else {
      setMode('search');
      setMessage('Tee gespeichert. Er ist möglicherweise noch nicht veröffentlicht.');
    }
  }
  function openAdd() {
    setScannedCode(null);
    setMode('add');
  }
  const previousView = () => {
    setScannedCode(null);
    setMessage('');
    setMode(selected ? 'prep' : 'search');
  };
  const renderTeaRow = tea => (
    <Box key={tea.id} sx={{borderBottom:'1px solid',borderColor:'divider'}}>
      <Button onClick={() => chooseTea(tea)} fullWidth
        sx={{
          height:'auto', minHeight:66, textAlign:'left', justifyContent:'flex-start',
          py:1.2, px:1.4, bgcolor:'transparent', color:'text.primary',
          '&:hover':{bgcolor:'rgba(29,29,29,.05)'},
        }}>
        <Box sx={{minWidth:0}}>
          <Typography sx={{fontSize:16,fontWeight:600,overflowWrap:'anywhere'}}>{tea.rawName}</Typography>
          <Typography sx={{fontSize:12,color:'text.secondary'}}>{tea.brand} · {teaSubtitle(tea)}</Typography>
        </Box>
      </Button>
    </Box>
  );

  return (
    <>
      {/* The inactive, preloaded QuickTimer is a fixed layer below Home.
          iOS rubber-band scrolling can displace document content and expose
          that layer. This viewport-fixed opaque shield covers it without
          hiding videos via opacity/visibility, which harmed Safari playback. */}
      <Box className="fac-viewport-shield" aria-hidden="true" />
      {/* One opaque, scrolling document above the fixed shield. */}
      <Box className="fac-app-page" sx={{
        position: 'relative',
        zIndex: 2,
        minHeight: '100svh',
        bgcolor: 'background.default',
      }}>
        {/* Phase 1A Home and the assistant are one continuous long page. */}
        <HomeScreen
          minutes={quickMinutes}
          onStep={delta => setQuickMinutes(previous => stepQuickMinutes(previous, delta))}
          onBrew={startQuickTimer}
          brewDisabled={quickVideoStatus === 'loading'}
          onTeaAssistant={showTeaAssistant}
          assistantActive={assistantActive}
          assistantButtonRef={assistantButtonRef}
        />
        {assistantVisible && (
        <Box ref={assistantSectionRef} component="main"
        sx={{maxWidth:500,mx:'auto',px:2.5,pt:'14px',pb:'max(45px, env(safe-area-inset-bottom))',position:'relative',zIndex:1,bgcolor:'background.default'}}> 
      <Typography component="h1" sx={{fontSize:30,fontWeight:600,letterSpacing:'-.04em'}}>
        Fancy a Cuppa
      </Typography>
      <Typography sx={{fontSize:12,color:'text.secondary',mt:.5}}>V3 · Testversion</Typography>

      {mode === 'closed' && (
        <Button variant="contained" fullWidth onClick={openSearch}
          sx={{mt:4,bgcolor:'#1d1d1d','&:hover':{bgcolor:'#333'}}}>
          How do you take it?
        </Button>
      )}

      {mode !== 'closed' && (
        <>
          {mode !== 'add' && mode !== 'edit' && (
            <Box sx={{mt:3}}>
              <Typography component="h2" sx={{fontSize:20,fontWeight:600,mb:1.5}}>
                How do you take it?
              </Typography>
              <Stack direction="row" gap={1}>
                <TextField
                  inputRef={searchRef}
                  aria-label="Tee suchen"
                  placeholder="Tee suchen…"
                  fullWidth variant="filled" hiddenLabel
                  value={mode === 'search' ? query : ''}
                  onFocus={() => { if (mode !== 'search') openSearch(); }}
                  onChange={e => {setQuery(e.target.value);setMode('search');}}
                  slotProps={{input:{disableUnderline:true}}}
                  sx={searchSx}
                />
                <Button variant="outlined" aria-label="Barcode scannen"
                  onClick={() => photoRef.current?.click()}
                  disabled={scannerBusy}
                  sx={{minWidth:66,width:66,px:0}}>
                  <Symbol>qr_code_scanner</Symbol>
                </Button>
              </Stack>
              <input ref={photoRef} type="file" accept="image/*" capture="environment"
                onChange={scanPhoto} style={{display:'none'}} aria-label="Barcode-Foto aufnehmen" />
              {scannerBusy && <Typography sx={{fontSize:12,mt:1}}>Barcode wird gelesen…</Typography>}
              {scanError && <Typography role="alert" color="error" sx={{fontSize:12,mt:1}}>{scanError}</Typography>}
            </Box>
          )}

          {mode === 'search' && (
            <Box sx={{mt:2}}>
              {message && <Typography role="status" sx={{fontSize:13,mb:1}}>{message}</Typography>}
              {!query.trim() && recents.length > 0 && (
                <Box sx={{mb:2}}>
                  <Typography component="h3" sx={{fontSize:16,fontWeight:600,mb:1}}>Recently searched</Typography>
                  <Paper variant="outlined" sx={{borderRadius:'6px',overflow:'hidden'}}>
                    {recents.map(renderTeaRow)}
                  </Paper>
                </Box>
              )}
              <Typography component="h3" sx={{fontSize:16,fontWeight:600,mb:1}}>
                {query ? 'Search results' : 'Tees im Katalog'}
              </Typography>
              {catalog.status === 'loading' && <Typography>Teekatalog wird geladen…</Typography>}
              {catalog.status === 'error' &&
                <Typography role="alert" color="error">{catalog.error}</Typography>}
              {catalog.status === 'ready' && results.length === 0 &&
                <Typography sx={{fontSize:14,color:'text.secondary'}}>Kein passender Tee gefunden.</Typography>}
              {results.length > 0 && (
                <Paper variant="outlined" sx={{borderRadius:'6px',overflow:'hidden'}}>
                  {results.map(renderTeaRow)}
                </Paper>
              )}
              <Stack gap={1} sx={{mt:2}}>
                <Button variant="outlined" fullWidth onClick={openAdd}>Add new tea</Button>
                {selected && <Button variant="text" fullWidth onClick={() => {setMode('prep');setQuery('');}}>
                  Abbrechen
                </Button>}
              </Stack>
            </Box>
          )}

          {(mode === 'add' || mode === 'edit') && (
            <>
              {message && <Typography role="status" sx={{fontSize:13,mt:2}}>{message}</Typography>}
              <TeaEditor key={(mode === 'edit' ? selected?.id : 'new') || 'new'}
              tea={mode === 'edit' ? selected : null}
              barcode={scannedCode}
              onCancel={previousView}
              onSaved={formSaved} />
            </>
          )}

          {/* Keep the timer mounted while searching/editing, preserving its state
              and the confirmed iPhone video element references. */}
          {selected && (
            <Box sx={mode === 'prep'
              ? {mt:2}
              : {height:0,opacity:0,overflow:'hidden',pointerEvents:'none'}}>
              <Paper variant="outlined" sx={{p:2,borderRadius:'6px'}}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                  <Box sx={{minWidth:0}}>
                    <Typography component="h2" sx={{fontSize:20,fontWeight:600,overflowWrap:'anywhere'}}>
                      {selected.rawName}
                    </Typography>
                    <Typography sx={{fontSize:14,color:'text.secondary',mt:.5}}>{selected.brand}</Typography>
                    <Typography sx={{fontSize:12,color:'text.secondary',mt:.5}}>{teaSubtitle(selected)}</Typography>
                  </Box>
                  <Stack direction="row" gap={0}>
                    <IconButton aria-label="Tee bearbeiten" onClick={()=>setMode('edit')}
                      sx={{minWidth:48,width:48,height:48}}>
                      <Symbol>edit</Symbol>
                    </IconButton>
                    <IconButton aria-label="Teeauswahl entfernen" onClick={() => {setSelectedId(null);setMode('search');}}
                      sx={{minWidth:48,width:48,height:48}}>
                      <Symbol>close</Symbol>
                    </IconButton>
                  </Stack>
                </Stack>
              </Paper>

              <Typography component="h2" sx={{fontSize:18,fontWeight:600,mt:3,mb:1.5}}>
                How much tea?
              </Typography>
              <Box sx={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:1}}>
                {VOLUMES.map(ml=>(
                  <Button key={ml} variant={volume === ml ? 'contained' : 'outlined'}
                    onClick={()=>setVolume(ml)} sx={{minWidth:0,px:.5,height:66}}>
                    {ml >= 1000 ? (ml/1000).toLocaleString('de-DE')+' L' : ml+' ml'}
                  </Button>
                ))}
                <Button variant={volume === null ? 'contained' : 'outlined'}
                  onClick={()=>setVolume(null)} sx={{minWidth:0,px:.5,height:66}}>
                  Custom
                </Button>
              </Box>
              {volume === null && (
                <TextField variant="filled" type="number" label="Wassermenge (ml)"
                  value={customMl} onChange={e=>setCustomMl(e.target.value)}
                  fullWidth sx={{...searchSx,mt:1.5}} />
              )}
              <Paper variant="outlined" sx={{p:2,mt:2,borderRadius:'6px',bgcolor:'#fff'}}>
                <Typography sx={{fontSize:13,color:'text.secondary'}}>Dosierung</Typography>
                <Typography sx={{fontSize:28,fontWeight:600,mt:.5}}>{dosage}</Typography>
                <Typography sx={{fontSize:12,color:'text.secondary'}}>
                  {validWater ? water.toLocaleString('de-DE')+' ml Wasser' : 'Bitte 50–5000 ml eingeben'}
                </Typography>
              </Paper>
              <TeaTimer key={selected.id} initialSeconds={selected.brewSeconds || selected.min * 60} />
            </Box>
          )}
        </>
      )}
        </Box>
        )}
      </Box>
      {/* The media session stays mounted and preloaded. The opaque page layer
          completely masks its inactive UI; the active overlay rises above it
          synchronously in the original Home tap. */}
      <QuickTimerView
        ref={quickTimerRef}
        active={quickTimerOpen}
        onClose={closeQuickTimer}
        onPreloadChange={setQuickVideoStatus}
      />
      <Snackbar
        open={Boolean(quickNotice)}
        autoHideDuration={4200}
        onClose={() => setQuickNotice('')}
        message={quickNotice}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </>
  );
}
