import { Button, TextField, Typography } from '@mui/material';
import TeaCard from './TeaCard.jsx';
import { calculateDose } from '../features/teaModel.js';
import { formatTeaDetailDose } from '../features/teaDetailModel.js';
import './tea-detail.css';

const asset = import.meta.env.BASE_URL + 'figma/';
const VOLUME_OPTIONS = [250, 500, 1000];

function VolumeOption({ value, current, onChange }) {
  const isSelected = current === value;
  const amount = value === 1000 ? '1' : String(value);
  const unit = value === 1000 ? 'l' : 'ml';
  return (
    <Button type="button" className={'fac-tea-volume__option' + (isSelected ? ' is-selected' : '')}
      aria-pressed={isSelected}
      aria-label={value + ' millilitres'}
      onClick={() => onChange(value)} disableRipple>
      <span className="fac-tea-volume__number">{amount}</span>
      <span className="fac-tea-volume__unit">{unit}</span>
    </Button>
  );
}

/** Node 123:144 — selected tea preparation, mounted in the continuous Home page. */
export default function TeaDetail({
  tea, volume, onVolumeChange, customMl, onCustomChange,
  minutes, onMinuteStep, onEdit, onClose, pinned, onTogglePin, onBrew, fixedBrew = false,
}) {
  if (!tea) return null;
  const water = volume === null ? Number(customMl) : volume;
  const validWater = Number.isInteger(water) && water >= 50 && water <= 5000;
  const dose = validWater ? calculateDose(tea, water) : null;
  const brewButton = (
    <Button type="button" variant="contained" fullWidth disableRipple disableElevation
      className="fac-tea-result__brew" onClick={onBrew}
      disabled={!validWater}>
      BREW
    </Button>
  );
  return (
    <>
    <section className="fac-tea-detail fac-sheet-scroll fac-sheet-scroll--detail" aria-label="Tea preparation">
      <TeaCard tea={tea} onEdit={onEdit} onClose={onClose} pinned={pinned} onTogglePin={onTogglePin} />

      <div className="fac-tea-volume" role="group" aria-label="Water quantity"
        style={{'--volume-index':volume === null ? 3 : Math.max(0, VOLUME_OPTIONS.indexOf(volume))}}>
        <span className="fac-tea-volume__indicator" aria-hidden="true" />
        {VOLUME_OPTIONS.map(value => (
          <VolumeOption key={value} value={value}
            current={volume} onChange={onVolumeChange} />
        ))}
        <Button type="button"
          className={'fac-tea-volume__option fac-tea-volume__custom' +
            (volume === null ? ' is-selected' : '')}
          aria-label="Custom water quantity"
          aria-pressed={volume === null}
          onClick={() => onVolumeChange(null)} disableRipple>
          <img src={asset + 'tea-tune.svg'} width="24" height="24" alt="" />
        </Button>
      </div>

      {volume === null && (
        <TextField
          variant="filled" hiddenLabel fullWidth
          className="fac-tea-custom-field"
          label={undefined} placeholder="Water (ml)"
          inputProps={{ 'aria-label':'Custom water quantity in millilitres', inputMode:'numeric', min:50, max:5000 }}
          type="number" value={customMl}
          onChange={event => onCustomChange(event.target.value)}
          slotProps={{ input:{ disableUnderline:true } }}
        />
      )}

      <div className="fac-tea-result">
        <div className="fac-tea-result__dose">
          <Typography className="fac-tea-result__label">How much Tea?</Typography>
          <Typography component="output" className="fac-tea-result__value" aria-live="polite">
            {formatTeaDetailDose(dose,tea.unit)}
          </Typography>
        </div>
        <div className="fac-tea-result__divider" />
        <div className="fac-tea-result__timer" role="group" aria-label="Brewing time">
          <Button type="button" aria-label="Decrease brewing time"
            className="fac-tea-result__time-button"
            onClick={() => onMinuteStep(-1)} disabled={minutes <= 1} disableRipple>
            <img src={asset + 'tea-v2-minus.svg'} width="66" height="66" alt="" />
          </Button>
          <Typography component="output" className="fac-tea-result__minutes">
            {minutes} MIN
          </Typography>
          <Button type="button" aria-label="Increase brewing time"
            className="fac-tea-result__time-button"
            onClick={() => onMinuteStep(1)} disabled={minutes >= 30} disableRipple>
            <img src={asset + 'tea-v2-plus.svg'} width="66" height="66" alt="" />
          </Button>
        </div>
        {!fixedBrew && brewButton}
      </div>
    </section>
    {fixedBrew && <div className="fac-sheet-footer fac-sheet-footer--brew">{brewButton}</div>}
    </>
  );
}
