import { useState } from 'react';
import { LogoMark } from '../brand/LogoMark';
import { Icon } from '../components/Icon';
import type { Prefs } from '../lib/storage/store';
import { VehiclePicker } from './SettingsScreen';

/** First launch (about 20 s): welcome + safety note, your vehicle, location. Every step is skippable. */
export function Onboarding({ prefs, setPrefs, onLocation, onDone }: { prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; onLocation: () => Promise<void>; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const finish = () => {
    setPrefs({ onboarded: true, showEvTab: prefs.vehicle === 'ev' ? true : prefs.showEvTab });
    onDone();
  };
  return (
    <div className="screen onboard" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="ob-dots" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i === step ? 'on' : ''} />
        ))}
      </div>
      {step === 0 && (
        <div className="ob-step">
          <span className="ob-mark brand">
            <LogoMark size={58} />
          </span>
          <h1>SG Car Buddy</h1>
          <p className="ob-lede">Parking, EV charging, checkpoint cameras and rain, on one map.</p>
          <ul className="ob-list">
            <li>
              <Icon name="park" /> Live free lots and the estimated cost for your stay
            </li>
            <li>
              <Icon name="bolt" /> EV chargers that fit your plug, free right now
            </li>
            <li>
              <Icon name="cctv" /> Woodlands, Tuas and Sentosa cameras
            </li>
            <li>
              <Icon name="rain" /> Rain where you're going, with the radar
            </li>
          </ul>
          <p className="ob-safe">
            <Icon name="alert" size={18} /> Please don't use the app while driving. Ask a passenger, or check before you set off.
          </p>
          <button className="btn primary block" onClick={() => setStep(1)}>
            Get started
          </button>
        </div>
      )}
      {step === 1 && (
        <div className="ob-step">
          <h1>What do you drive?</h1>
          <p className="ob-lede">We'll show lots and prices for your vehicle. Change it any time in Settings.</p>
          <VehiclePicker prefs={prefs} setPrefs={setPrefs} />
          <button className="btn primary block" onClick={() => setStep(2)}>
            Continue
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="ob-step">
          <span className="ob-mark">
            <Icon name="locate" size={40} />
          </span>
          <h1>Carparks near you</h1>
          <p className="ob-lede">Use your location to see what's nearby. It stays on this phone and is never sent anywhere.</p>
          <button
            className="btn primary block"
            onClick={async () => {
              await onLocation();
              finish();
            }}
          >
            <Icon name="locate" size={18} /> Use my location
          </button>
          <button className="btn block" onClick={finish}>
            Search instead
          </button>
        </div>
      )}
    </div>
  );
}
