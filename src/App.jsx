import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Box, Button, Drawer, Typography } from '@mui/material';
import { listTeas, lookupTeaByCode } from './data/teaRepository.js';
import {
  normalizeQuery, recentTeaIds,
} from './features/teaModel.js';
import { scanBarcodePhoto } from './features/scanBarcode.js';
import TeaEditor from './components/TeaEditor.jsx';
import TeaDetail from './components/TeaDetail.jsx';
import TeaCategoryIcon from './components/TeaCategoryIcon.jsx';
import TeaSearchBar from './components/TeaSearchBar.jsx';
import TeaSheetHandle from './components/TeaSheetHandle.jsx';
import { manufacturerOptions, filterTeaGroups } from './features/teaSearchModel.js';
import { initialDetailMinutes } from './features/teaDetailModel.js';
import './components/tea-detail.css';
import HomeScreen from './components/HomeScreen.jsx';
import { readQuickMinutes, saveQuickMinutes, stepQuickMinutes } from './features/quickTimer.js';
import Snackbar from '@mui/material/Snackbar';
import { nativeEditorSheetGeometry, focusedEditorScrollDelta } from './features/nativeEditorKeyboard.js';
import './components/tea-sheet.css';

const SHEET_DURATION = { enter: 360, exit: 260 };
const SHEET_EASING = {
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 0.6, 1)',
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
  const nativeIOS = Capacitor.getPlatform() === 'ios';
  const [catalog, setCatalog] = useState({ status:'loading', teas:[], error:'' });
  const [mode, setMode] = useState('closed'); // closed | search | prep | edit | add
  const [closing, setClosing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [drag, setDrag] = useState({ offset:0, active:false });
  const paperRef = useRef(null);
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
    setManufacturer('');
    setDrag({ offset:0, active:false });
    setScanError('');
    setMessage('');
  };
  const closeSheet = () => {
    setClosing(true);
    setScanError('');
  };
  const startDetailTimer = () => {
    // Start within the original BREW tap so iPhone Safari can unlock playback.
    if (quickTimerRef.current?.begin(detailMinutes * 60)) closeSheet();
    else setQuickNotice('Timer not ready. Please try again.');
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
  const hasFilter = hasSearch || Boolean(manufacturer);
  const manufacturers = useMemo(() => manufacturerOptions(teas), [teas]);
  const { pinned, results, recent } = useMemo(
    () => filterTeaGroups(teas, { query, manufacturer, pinnedIds, recentIds }),
    [teas, query, manufacturer, pinnedIds, recentIds],
  );
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
    setMode(mode === 'edit' && selected ? 'prep' : 'search');
  };
  const sheetOpen = mode !== 'closed' && !closing;
  const isSearch = mode === 'search';
  const nativeEditor = nativeIOS && (mode === 'add' || mode === 'edit');
  useEffect(() => {
    if (!sheetOpen) return;
    // iOS keyboard focus may pan visualViewport without resizing the layout viewport.
    const viewport = window.visualViewport;
    let revealFrame = 0;
    const revealFocusedField = () => {
      revealFrame = 0;
      const scroller = paperRef.current?.querySelector('.fac-sheet-scroll--editor');
      const focused = document.activeElement;
      if (!scroller || !focused || !scroller.contains(focused)) return;
      const field = focused.closest('.MuiFormControl-root') || focused;
      const delta = focusedEditorScrollDelta(
        field.getBoundingClientRect(), scroller.getBoundingClientRect(),
      );
      if (Math.abs(delta) > 1) scroller.scrollTop += delta;
    };
    const scheduleReveal = () => {
      if (revealFrame) cancelAnimationFrame(revealFrame);
      revealFrame = requestAnimationFrame(revealFocusedField);
    };
    const update = () => {
      const paper = paperRef.current;
      if (!paper) return;
      const visualHeight = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      // Only Add/Edit on native iOS gets the stable top anchor. Web/PWA,
      // Search and Detail retain their existing, iPhone-approved geometry.
      const geometry = nativeEditor
        ? nativeEditorSheetGeometry({ layoutHeight, visualHeight, offsetTop })
        : { height: visualHeight,
            bottom: Math.max(0, window.innerHeight - visualHeight - offsetTop) };
      paper.style.setProperty('--sheet-viewport-height', `${geometry.height}px`);
      paper.style.setProperty('--sheet-bottom', `${geometry.bottom}px`);
      const editing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
      const keyboardOpen = layoutHeight - visualHeight > 150;
      paper.dataset.keyboardOpen = String(keyboardOpen
        && (editing || paper.dataset.keyboardOpen === 'true'));
      // The focused input remains in view; only the editor scroller moves.
      if (nativeEditor && editing && keyboardOpen) scheduleReveal();
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      if (revealFrame) cancelAnimationFrame(revealFrame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [sheetOpen, nativeEditor]);

  const renderTeaRow = tea => (
    <Button key={tea.id} type="button" fullWidth className="fac-tea-catalog__item"
      onClick={() => chooseTea(tea)}>
      <TeaCategoryIcon category={tea.category} className="fac-tea-row-icon" />
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
      <Box className="fac-app-page" sx={{ position:'relative', zIndex:2, minHeight:'100svh', bgcolor:'background.default' }}>
        <HomeScreen
          ref={quickTimerRef}
          minutes={quickMinutes}
          onStep={delta => setQuickMinutes(previous => stepQuickMinutes(previous,delta))}
          onTimerError={setQuickNotice}
          onTeaAssistant={showTeaAssistant}
        />
      </Box>
      <Drawer anchor="bottom" open={sheetOpen} onClose={closeSheet}
        ModalProps={{ keepMounted:true, BackdropProps:{ sx:{backgroundColor:'#fff'} } }}
        transitionDuration={SHEET_DURATION}
        slotProps={{ transition:{ easing:SHEET_EASING, onExited:() => {
          setMode('closed');
          setSelectedId(null);
          setClosing(false);
          setDrag({offset:0, active:false});
        } } }}
        PaperProps={{
          className:'fac-sheet-paper',
          'data-native-expanded-gap': nativeIOS && ['search', 'prep', 'add', 'edit'].includes(mode)
            ? 'true' : undefined,
          'data-native-editor': nativeEditor ? 'true' : undefined,
          ref:paperRef,
          'data-dragging':drag.active,
          'data-open':sheetOpen,
          style:{
            translate:`0 ${drag.offset}px`,
          },
        }}>
        <Box className={mode === 'prep' ? 'fac-sheet fac-sheet--detail' : 'fac-sheet'} component="main">
          <TeaSheetHandle onClose={closeSheet} onDragChange={setDrag} />
          {isSearch && (
            <>
              <Box className="fac-sheet-search">
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
              <Box className="fac-manufacturers" role="group" aria-label="Filter by manufacturer">
                {manufacturers.map(brand => (
                  <Button key={brand} className="fac-manufacturer" aria-label={brand} aria-pressed={manufacturer === brand}
                    onClick={() => setManufacturer(previous => previous === brand ? '' : brand)}>
                    {brand.replace(/ß/g, 'ẞ')}
                  </Button>
                ))}
              </Box>
              <Box className="fac-sheet-scroll" key="search" tabIndex={0} aria-label="Tea results">
                <Box className="fac-tea-catalog">
                  {message && <Typography role="status">{message}</Typography>}
                  {catalog.status === 'loading' && <Typography>Loading tea catalogue…</Typography>}
                  {catalog.status === 'error' && <Typography role="alert" color="error">{catalog.error}</Typography>}
                  {catalog.status === 'ready' && (
                    <>
                      {(pinned.length > 0 || !hasFilter) && (
                        <>
                          <Typography component="h2" className="fac-tea-catalog__title">Pinned Teas</Typography>
                          <Box className="fac-tea-catalog__list">{pinned.map(renderTeaRow)}</Box>
                        </>
                      )}
                      <Typography component="h2" className="fac-tea-catalog__title">
                        {hasFilter ? 'Search Results' : 'Last Search Results'}
                      </Typography>
                      <Box className="fac-tea-catalog__list">{(hasFilter ? results : recent).map(renderTeaRow)}</Box>
                      {hasFilter && !pinned.length && !results.length && (
                        <Typography role="status" sx={{px:1.5}}>No matching tea found.</Typography>
                      )}
                    </>
                  )}
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
              fixedBrew={nativeIOS}
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
      <Snackbar open={Boolean(quickNotice)} autoHideDuration={4200}
        onClose={() => setQuickNotice('')} message={quickNotice}
        anchorOrigin={{vertical:'top',horizontal:'center'}} />
    </>
  );
}
