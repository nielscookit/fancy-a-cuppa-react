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

/** Node 67:6557 — selected tea preparation, mounted in the continuous Home page. */
export default function TeaDetail({
  tea, volume, onVolumeChange, customMl, onCustomChange,
  minutes, onMinuteStep, onEdit, onClose, onBrew, brewDisabled,
}) {
  if (!tea) return null;
  const water = volume === null ? Number(customMl) : volume;
  const validWater = Number.isInteger(water) && water >= 50 && water <= 5000;
  const dose = validWater ? calculateDose(tea, water) : null;
  return (
    <section className="fac-tea-detail" aria-label="Tea preparation">
      <TeaCard tea={tea} onEdit={onEdit} onClose={onClose} />

      <div className="fac-tea-volume" role="group" aria-label="Water quantity">
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
            <img src={asset + 'home-minus.svg'} width="66" height="66" alt="" />
          </Button>
          <Typography component="output" className="fac-tea-result__minutes">
            {minutes} MIN
          </Typography>
          <Button type="button" aria-label="Increase brewing time"
            className="fac-tea-result__time-button"
            onClick={() => onMinuteStep(1)} disabled={minutes >= 30} disableRipple>
            <img src={asset + 'home-plus.svg'} width="66" height="66" alt="" />
          </Button>
        </div>
        <Button type="button" variant="contained" fullWidth disableRipple disableElevation
          className="fac-tea-result__brew" onClick={onBrew}
          disabled={brewDisabled}>
          BREW
        </Button>
      </div>
    </section>
  );
}
