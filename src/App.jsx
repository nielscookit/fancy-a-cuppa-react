import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { listTeas, lookupTeaByCode } from './data/teaRepository.js';
import {
  teaMatches, recentTeaIds,
} from './features/teaModel.js';
import { scanBarcodePhoto } from './features/scanBarcode.js';
import TeaEditor from './components/TeaEditor.jsx';
import TeaDetail from './components/TeaDetail.jsx';
import TeaSearchBar from './components/TeaSearchBar.jsx';
import { initialDetailMinutes } from './features/teaDetailModel.js';
import './components/tea-detail.css';
import HomeScreen from './components/HomeScreen.jsx';
import QuickTimerView from './components/QuickTimerView.jsx';
import { readQuickMinutes, saveQuickMinutes, stepQuickMinutes } from './features/quickTimer.js';
import { v3StorageKey } from './storage.js';
import Snackbar from '@mui/material/Snackbar';
import { flushSync } from 'react-dom';
import { animateScrollTo } from './features/scrollMotion.js';

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
  const openTimerWithSeconds = (seconds) => {
    if (quickVideoStatus === 'error') {
      setQuickNotice('Video preparation failed. Retrying…');
      quickTimerRef.current?.retryPreload();
      return;
    }
    if (quickVideoStatus !== 'ready') {
      setQuickNotice('Preparing the videos. Please try again shortly.');
      return;
    }
    // Both Home and selected-tea BREW use the same already-mounted session.
    // iPhone Safari needs the first .play() within the ORIGINAL button tap:
    // make the overlay visible synchronously, then immediately start it.
    flushSync(() => setQuickTimerOpen(true));
    const started = quickTimerRef.current?.begin(seconds);
    if (!started) {
      setQuickTimerOpen(false);
      setQuickNotice('Timer not ready. Please try again.');
    }
  };
  const startQuickTimer = () => openTimerWithSeconds(quickMinutes * 60);
  const startDetailTimer = () => openTimerWithSeconds(detailMinutes * 60);

  const closeQuickTimer = () => {
    // RESET must return to HOME, even when BREW was started from Tea Detail.
    // Media/audio reset has already run synchronously inside QuickTimerView.
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
      pendingScrollFrameRef.current = null;
    }
    scrollingRef.current?.();
    scrollingRef.current = null;
    window.scrollTo(0, 0);
    assistantHasLeftHomeRef.current = false;
    assistantReturningHomeRef.current = false;
    setAssistantActive(false);
    setAssistantVisible(false);
    setMode('closed');
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
  function chooseTea(tea) {
    setSelectedId(tea.id);
    setVolume(250);
    setDetailMinutes(initialDetailMinutes(tea));
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
    <Box key={tea.id} sx={{ borderBottom: '1px solid #eeeeec' }}>
      <Button type="button" fullWidth
        className="fac-tea-catalog__item"
        onClick={() => chooseTea(tea)}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize:16,fontWeight:600 }}>{tea.rawName}</Typography>
          <Typography sx={{ fontSize:12,color:'text.secondary' }}>{tea.brand}</Typography>
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
        <Box ref={assistantSectionRef} component="main" className="fac-tea-assistant">
          {(mode !== 'add' && mode !== 'edit') && (
            <>
              <TeaSearchBar
                value={mode === 'search' ? query : ''}
                onChange={value => { setQuery(value); setMode('search'); }}
                onFocus={() => { if (mode !== 'search') openSearch(); }}
                onScan={() => photoRef.current?.click()}
                photoRef={photoRef}
                scanning={scannerBusy}
                onPhoto={scanPhoto}
              />
              {scannerBusy && <Typography role="status" sx={{fontSize:12,mx:2,mb:1}}>
                Reading barcode…
              </Typography>}
              {scanError && <Typography role="alert" color="error" sx={{fontSize:12,mx:2,mb:1}}>
                {scanError}
              </Typography>}

              {mode === 'search' && (
                <Box className="fac-tea-catalog">
                  {message && <Typography role="status" sx={{fontSize:13,mb:1}}>{message}</Typography>}
                  {!query.trim() && recents.length > 0 && (
                    <>
                      <Typography component="h2" className="fac-tea-catalog__title">
                        Recently searched
                      </Typography>
                      <Paper variant="outlined" className="fac-tea-catalog__list">
                        {recents.map(renderTeaRow)}
                      </Paper>
                    </>
                  )}
                  <Typography component="h2" className="fac-tea-catalog__title">
                    {query.trim() ? 'Search results' : 'Tea catalogue'}
                  </Typography>
                  {catalog.status === 'loading' && <Typography sx={{fontSize:14}}>
                    Loading tea catalogue…
                  </Typography>}
                  {catalog.status === 'error' && <Typography role="alert" color="error">
                    {catalog.error}
                  </Typography>}
                  {catalog.status === 'ready' && results.length === 0 &&
                    <Typography sx={{fontSize:14}}>No matching tea found.</Typography>}
                  {results.length > 0 && (
                    <Paper variant="outlined" className="fac-tea-catalog__list">
                      {results.map(renderTeaRow)}
                    </Paper>
                  )}
                  <Button variant="contained" fullWidth onClick={openAdd}
                    sx={{
                      mt:2,height:66,borderRadius:'100px',bgcolor:'#323234',
                      fontWeight:600,fontSize:16,
                      '&:hover':{bgcolor:'#323234'},
                    }}>
                    ADD NEW TEA
                  </Button>
                </Box>
              )}
              {mode === 'prep' && selected && (
                <TeaDetail
                  tea={selected}
                  volume={volume} onVolumeChange={setVolume}
                  customMl={customMl} onCustomChange={setCustomMl}
                  minutes={detailMinutes}
                  onMinuteStep={step => setDetailMinutes(previous =>
                    stepQuickMinutes(previous,step))}
                  onEdit={() => setMode('edit')}
                  onClose={() => { setSelectedId(null);setMode('search'); }}
                  onBrew={startDetailTimer}
                  brewDisabled={quickVideoStatus !== 'ready'}
                />
              )}
            </>
          )}
          {(mode === 'add' || mode === 'edit') && (
            <Box sx={{px:2,pb:2}}>
              {message && <Typography role="status" sx={{fontSize:13,mt:2}}>{message}</Typography>}
              <TeaEditor key={(mode === 'edit' ? selected?.id : 'new') || 'new'}
                tea={mode === 'edit' ? selected : null}
                barcode={scannedCode}
                onCancel={previousView}
                onSaved={formSaved} />
            </Box>
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
