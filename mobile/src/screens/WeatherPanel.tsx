import type { WeatherResponse } from '../../../shared/contract';
import { Icon } from '../components/Icon';
import { Fresh } from '../components/ui';
import { formatDistance, type LatLng } from '../lib/domain/geo';
import { forecastIcon, plainForecast, rainStatus, temperatureAt, untilFromValidText } from '../lib/domain/rain';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function WeatherHeader({ weather, at, placeLabel, now, receivedAt, error, onRetry }: { weather: WeatherResponse | null; at: LatLng | null; placeLabel: string; now: number; receivedAt: number | null; error: Error | null; onRetry: () => void }) {
  const st = rainStatus(weather, at, now);
  const temp = temperatureAt(weather, at);
  let title = 'Weather';
  let sub = '';
  let icon: 'rain' | 'sun' | 'cloud' | 'umbrella' | 'moon' | 'partsun' | 'storm' = 'cloud';
  let tone = 'muted';
  if (st.state === 'raining') {
    title = `Raining near ${placeLabel}`;
    sub = `${st.gauge.mm.toFixed(1)} mm in the last 5 min · gauge ${formatDistance(st.gauge.distanceM)} away`;
    icon = 'umbrella';
    tone = 'raining';
  } else if (st.state === 'dry-rain-possible' || st.state === 'dry') {
    title = `No rain near ${placeLabel}`;
    sub = st.gauge ? `${st.gauge.name} gauge · ${formatDistance(st.gauge.distanceM)} away` : 'No rain gauge within 3 km, using the area forecast';
    icon = st.state === 'dry-rain-possible' ? 'cloud' : forecastIcon(st.forecast);
    tone = st.state === 'dry-rain-possible' ? 'likely' : 'dry';
  } else if (st.state === 'location-off') {
    title = 'Rain near you';
    sub = 'Search a place or turn on location';
  } else {
    title = 'Rain info unavailable';
    sub = st.checkedAt ? `Last checked ${st.checkedAt.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit' })}` : '';
  }
  return (
    <div className="ph wx-head">
      <div className={`wx-now ${tone}`}>
        <span className="wx-ic">
          <Icon name={icon} size={26} />
        </span>
        <span className="wx-tx">
          <h2>{title}</h2>
          <small>{sub}</small>
        </span>
        {temp != null && <span className="wx-t num">{temp}°</span>}
      </div>
      <Fresh at={receivedAt} now={now} staleAfterMs={45 * 60_000} error={error} onRetry={onRetry} prefix="NEA" />
    </div>
  );
}

export function WeatherBody({ weather, at, now, radarNote }: { weather: WeatherResponse | null; at: LatLng | null; now: number; radarNote: string | null }) {
  const st = rainStatus(weather, at, now);
  const area = 'area' in st ? st.area : null;
  const forecast = 'forecast' in st ? st.forecast : null;
  const until = weather?.forecast ? untilFromValidText(weather.forecast.validText, weather.forecast.validTo) : null;
  return (
    <div className="wx">
      {forecast && (
        <div className="wx-row">
          <Icon name={forecastIcon(forecast)} />
          <span>
            <b>{cap(plainForecast(forecast))}</b>
            <small>
              Next 2 hours{area ? ` · ${area}` : ''}
              {until ? ` · until ${until}` : ''}
            </small>
          </span>
        </div>
      )}
      {(weather?.outlook.length ?? 0) > 0 && (
        <div className="days" role="list" aria-label="Next 4 days">
          {weather!.outlook.map((d) => (
            <div key={d.date} role="listitem" aria-label={`${d.day}: ${d.text}, ${d.low} to ${d.high} degrees`}>
              <span>{d.day.slice(0, 3)}</span>
              <Icon name={forecastIcon(d.text)} size={22} />
              <small className="num">
                {d.low ?? '–'}–{d.high ?? '–'}°
              </small>
            </div>
          ))}
        </div>
      )}
      {radarNote && <p className="list-note">{radarNote}</p>}
      <p className="list-foot">
        Rain now: nearest NEA rain gauge (5 min). Forecast and radar: NEA via data.gov.sg. Matched to your place on this phone; your location is never sent anywhere.
      </p>
    </div>
  );
}
