import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Drawer, IconButton, Typography } from '@mui/material';
import { listTeas, lookupTeaByCode } from './data/teaRepository.js';
import {
  normalizeQuery, teaMatches, recentTeaIds,
} from './features/teaModel.js';
import { scanBarcodePhoto } from './features/scanBarcode.js';
import TeaEditor from './components/TeaEditor.jsx';
import TeaDetail from './components/TeaDetail.jsx';
import TeaSearchBar from './components/TeaSearchBar.jsx';
import { initialDetailMinutes } from './features/teaDetailModel.js';
import './components/tea-detail.css';
import HomeScreen, { HOME_IMAGE } from './components/HomeScreen.jsx';
import QuickTimerView from './components/QuickTimerView.jsx';
import { readQuickMinutes, saveQuickMinutes, stepQuickMinutes } from './features/quickTimer.js';
import Snackbar from '@mui/material/Snackbar';
import { flushSync } from 'react-dom';
import './components/tea-sheet.css';

const SHEET_DURATION = { enter: 225, exit: 195 };
const SHEET_EASING = {
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 0.6, 1)',
};
// These slide curves reach half the distance at 20% and 50% of their duration.
const SHEET_CLOSE_FADE = {
  '--close-fade-in': `${SHEET_DURATION.enter * 0.2}ms`,
  '--close-fade-out': `${SHEET_DURATION.exit * 0.5}ms`,
};

const RECENTS_KEY = 'fancy-a-cuppa-v3-recent-teas';
function readRecents() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(value) ? value.filter(id => typeof id === 'string').slice(0,5) : [];
  } catch { return []; }
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
  const [detailMinutes, setDetailMinutes] = useState(4);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedCode, setScannedCode] = useState(null);
  const [message, setMessage] = useState('');
  const [quickMinutes, setQuickMinutes] = useState(readQuickMinutes);
  const [quickNotice, setQuickNotice] = useState('');
  const [quickTimerOpen, setQuickTimerOpen] = useState(false);
  const quickTimerRef = useRef(null);
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { const value = JSON.parse(localStorage.getItem('fac-v3-pinned-teas') || '[]'); return Array.isArray(value) ? value.filter(id => typeof id === 'string') : []; }
    catch { return []; }
  });
  const togglePin = (id) => setPinnedIds(previous => {
    const next = previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id];
    try { localStorage.setItem('fac-v3-pinned-teas', JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });
  const showTeaAssistant = () => {
    setMode('search');
    setQuery('');
    setScanError('');
    setMessage('');
  };
  const closeSheet = () => {
    setMode('closed');
    setSelectedId(null);
    setScanError('');
  };
  const openTimerWithSeconds = (seconds) => {
    // Open and start in the originating tap so Safari can unlock timer audio.
    flushSync(() => setQuickTimerOpen(true));
    const started = quickTimerRef.current?.begin(seconds);
    if (!started) {
      setQuickTimerOpen(false);
      setQuickNotice('Timer not ready. Please try again.');
    }
  };
  const startQuickTimer = () => openTimerWithSeconds(quickMinutes * 60);
  const startDetailTimer = () => {
    closeSheet();
    openTimerWithSeconds(detailMinutes * 60);
  };

  const closeQuickTimer = () => {
    closeSheet();
    setQuickTimerOpen(false);
  };
  useEffect(() => { saveQuickMinutes(quickMinutes); }, [quickMinutes]);
  const photoRef = useRef(null);

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
  const hasSearch = Boolean(normalizeQuery(query));
  const results = useMemo(
    () => hasSearch ? teas.filter(tea => teaMatches(tea, query)) : [],
    [teas, query, hasSearch],
  );
  const pinned = pinnedIds.map(id => teas.find(tea => tea.id === id)).filter(Boolean);
  const recent = recentIds.filter(id => !pinnedIds.includes(id))
    .map(id => teas.find(tea => tea.id === id)).filter(Boolean).slice(0, 3);
  function chooseTea(tea) {
    setSelectedId(tea.id);
    setVolume(250);
    setDetailMinutes(initialDetailMinutes(tea));
    setScanError('');
    setMessage('');
    setMode('prep');
    const ids = recentTeaIds(recentIds, tea.id);
    setRecentIds(ids);
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(ids)); } catch { /* privacy mode */ }
  }
  function openSearch() {
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
  const sheetOpen = mode !== 'closed';
  const isSearch = mode === 'search';
  const renderTeaRow = tea => (
    <Button key={tea.id} type="button" fullWidth className="fac-tea-catalog__item"
      onClick={() => chooseTea(tea)}>
      <img className="fac-tea-row-icon" src={import.meta.env.BASE_URL + 'figma/tea-list-category.svg'} alt="" />
      <Box className="fac-tea-row-content" sx={{flex:1}}>
        <Typography sx={{ fontSize:16, lineHeight:'24px', fontWeight:700 }}>{tea.rawName}</Typography>
        <Typography sx={{ fontSize:16, lineHeight:'24px', fontWeight:400 }}>{tea.brand}</Typography>
      </Box>
      <img className="fac-tea-row-arrow"
        src={import.meta.env.BASE_URL + 'figma/tea-row-open.svg'} width="48" height="48" alt="" />
    </Button>
  );
  return (
    <>
      <Box className="fac-viewport-shield" aria-hidden="true" />
      <Box className="fac-app-page" sx={{ position:'relative', zIndex:2, minHeight:'100svh', bgcolor:'background.default' }}>
        <HomeScreen
          minutes={quickMinutes}
          onStep={delta => setQuickMinutes(previous => stepQuickMinutes(previous,delta))}
          onBrew={startQuickTimer}
          onTeaAssistant={showTeaAssistant}
        />
      </Box>
      <Drawer anchor="bottom" open={sheetOpen} onClose={closeSheet}
        ModalProps={{ keepMounted:true, BackdropProps:{ sx:{backgroundColor:'#fff'} } }}
        transitionDuration={SHEET_DURATION}
        slotProps={{ transition:{ easing:SHEET_EASING } }}
        PaperProps={{
          className:'fac-sheet-paper',
          'data-open':sheetOpen,
          style:SHEET_CLOSE_FADE,
        }}>
        <Box className="fac-sheet" component="main">
          <IconButton onClick={closeSheet} aria-label="Close tea assistant"
            className="fac-sheet-floating-close">
            <img src={import.meta.env.BASE_URL + 'figma/tea-close.svg'} alt="" />
          </IconButton>
          <Box className="fac-sheet-top" />
          {(mode === 'search' || mode === 'prep') && (
            <>
              <Box className={mode === "prep" ? "fac-sheet-search fac-sheet-search--detail" : "fac-sheet-search"}>
                <TeaSearchBar
                  value={isSearch ? query : ''}
                  onChange={value => { setQuery(value); setMode('search'); }}
                  onFocus={() => { if (!isSearch) openSearch(); }}
                  photoRef={photoRef}
                  scanning={scannerBusy}
                  onPhoto={scanPhoto}
                />
              </Box>
              {scannerBusy && <Typography role="status" sx={{px:2}}>Reading barcode…</Typography>}
              {scanError && <Typography role="alert" color="error" sx={{px:2}}>{scanError}</Typography>}
            </>
          )}
          {isSearch && (
            <>
              <Box className="fac-sheet-scroll" key="search">
                <Box className="fac-tea-catalog">
                  {message && <Typography role="status">{message}</Typography>}
                  {catalog.status === 'loading' && <Typography>Loading tea catalogue…</Typography>}
                  {catalog.status === 'error' && <Typography role="alert" color="error">{catalog.error}</Typography>}
                  {catalog.status === 'ready' && (hasSearch ? (
                    <>
                      <Typography component="h2" className="fac-tea-catalog__title">Search Results</Typography>
                      {results.length === 0 && <Typography>No matching tea found.</Typography>}
                      <Box className="fac-tea-catalog__list">{results.map(renderTeaRow)}</Box>
                    </>
                  ) : (
                    <>
                      <Typography component="h2" className="fac-tea-catalog__title">Pinned Teas</Typography>
                      <Box className="fac-tea-catalog__list">{pinned.map(renderTeaRow)}</Box>
                      <Typography component="h2" className="fac-tea-catalog__title">Last Search</Typography>
                      <Box className="fac-tea-catalog__list">{recent.map(renderTeaRow)}</Box>
                    </>
                  ))}
                </Box>
              </Box>
              <Box className="fac-sheet-footer">
                <Button variant="contained" fullWidth onClick={openAdd} className="fac-sheet-add">
                  ADD NEW TEA
                </Button>
              </Box>
            </>
          )}
          {mode === 'prep' && selected && (
            <TeaDetail
              tea={selected}
              volume={volume} onVolumeChange={setVolume}
              customMl={customMl} onCustomChange={setCustomMl}
              minutes={detailMinutes}
              onMinuteStep={step => setDetailMinutes(previous => stepQuickMinutes(previous,step))}
              onEdit={() => setMode('edit')}
              onClose={openSearch}
              pinned={pinnedIds.includes(selected.id)}
              onTogglePin={() => togglePin(selected.id)}
              onBrew={startDetailTimer}
            />
          )}
          {(mode === 'add' || mode === 'edit') && (
            <TeaEditor key={mode === 'edit' ? selected?.id : 'new'}
              tea={mode === 'edit' ? selected : null}
              barcode={scannedCode}
              message={message}
              onCancel={previousView}
              onSaved={formSaved} />
          )}
        </Box>
      </Drawer>
      <QuickTimerView ref={quickTimerRef} active={quickTimerOpen}
        onClose={closeQuickTimer} stillImage={HOME_IMAGE} />
      <Snackbar open={Boolean(quickNotice)} autoHideDuration={4200}
        onClose={() => setQuickNotice('')} message={quickNotice}
        anchorOrigin={{vertical:'top',horizontal:'center'}} />
    </>
  );
}
