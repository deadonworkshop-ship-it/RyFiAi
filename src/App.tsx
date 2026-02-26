/**
 * Wood Shop Measurement Converter
 * Converts between metric (mm/cm) and imperial (fractional inches, down to 1/32")
 * Supports keyboard and voice input.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, ArrowLeftRight, ChevronUp, ChevronDown, X, Minus } from 'lucide-react';

// ─── Conversion Constants ────────────────────────────────────────────────────
const MM_PER_INCH = 25.4;
const SMALLEST_DENOMINATOR = 32;

// ─── Math Helpers ────────────────────────────────────────────────────────────
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function simplifyFraction(numerator: number, denominator: number): [number, number] {
  if (numerator === 0) return [0, 1];
  const divisor = gcd(Math.abs(numerator), Math.abs(denominator));
  return [numerator / divisor, denominator / divisor];
}

// ─── Result Types ─────────────────────────────────────────────────────────────
type RoundDir = 'exact' | 'up' | 'down';

interface ImperialResult {
  wholeInches: number;
  numerator: number;
  denominator: number;
  displayString: string;
  roundDir: RoundDir;
  roundDiffMm: number;
  decimalInches: number;
}

interface MetricResult {
  mm: number;
  cm: number;
}

// ─── mm → Imperial ───────────────────────────────────────────────────────────
function mmToImperial(mm: number): ImperialResult {
  const exactInches = mm / MM_PER_INCH;
  const exact32nds = exactInches * SMALLEST_DENOMINATOR;
  const rounded32nds = Math.round(exact32nds);

  const diff = rounded32nds - exact32nds;
  let roundDir: RoundDir;
  if (Math.abs(diff) < 1e-9) {
    roundDir = 'exact';
  } else if (diff > 0) {
    roundDir = 'up';
  } else {
    roundDir = 'down';
  }

  const roundDiffMm = Math.abs(diff) * MM_PER_INCH / SMALLEST_DENOMINATOR;
  const wholeInches = Math.floor(rounded32nds / SMALLEST_DENOMINATOR);
  const remainderNumerator = rounded32nds - wholeInches * SMALLEST_DENOMINATOR;
  const [simpNum, simpDen] = simplifyFraction(remainderNumerator, SMALLEST_DENOMINATOR);
  const decimalInches = rounded32nds / SMALLEST_DENOMINATOR;

  let displayString: string;
  if (wholeInches === 0 && simpNum === 0) {
    displayString = '0"';
  } else if (simpNum === 0) {
    displayString = `${wholeInches}"`;
  } else if (wholeInches === 0) {
    displayString = `${simpNum}/${simpDen}"`;
  } else {
    displayString = `${wholeInches} ${simpNum}/${simpDen}"`;
  }

  return { wholeInches, numerator: simpNum, denominator: simpDen, displayString, roundDir, roundDiffMm, decimalInches };
}

// ─── Imperial → Metric ───────────────────────────────────────────────────────
function imperialToMetric(inches: number): MetricResult {
  const mm = inches * MM_PER_INCH;
  return { mm, cm: mm / 10 };
}

// ─── Parse Imperial String ────────────────────────────────────────────────────
// Accepts: "2 3/8"  "2-3/8"  "3/4"  "1.5"  "2"
function parseImperialInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const v = parseFloat(trimmed);
    return isNaN(v) ? null : v;
  }

  const mixedMatch = trimmed.match(/^(\d+)[\s\-]+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num   = parseInt(mixedMatch[2], 10);
    const den   = parseInt(mixedMatch[3], 10);
    if (den === 0) return null;
    return whole + num / den;
  }

  const fracMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0) return null;
    return num / den;
  }

  return null;
}

// ─── Parse Voice Transcript ───────────────────────────────────────────────────
type VoiceParsed = { value: number; unit: 'mm' | 'cm' | 'in' } | null;

function parseVoiceTranscript(transcript: string): VoiceParsed {
  const t = transcript.toLowerCase().trim();

  const mmMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:millimeters?|mm)/);
  if (mmMatch) return { value: parseFloat(mmMatch[1]), unit: 'mm' };

  const cmMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:centimeters?|cm)/);
  if (cmMatch) return { value: parseFloat(cmMatch[1]), unit: 'cm' };

  // "2 and 3/8 inches" or "2 and 3 over 8 inches"
  const inFracMatch = t.match(/(\d+)\s+and\s+(\d+)\s*(?:over|\/)\s*(\d+)\s*(?:inches?|inch|in\b|")?/);
  if (inFracMatch) {
    const whole = parseInt(inFracMatch[1], 10);
    const num   = parseInt(inFracMatch[2], 10);
    const den   = parseInt(inFracMatch[3], 10);
    if (den !== 0) return { value: whole + num / den, unit: 'in' };
  }

  // "2.5 inches" or "one and a half inches" (half handled below)
  const inDecMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:inches?|inch|in\b|")/);
  if (inDecMatch) {
    let val = parseFloat(inDecMatch[1]);
    if (t.includes('and a half')) val += 0.5;
    return { value: val, unit: 'in' };
  }

  return null;
}

// ─── Common Fractions Reference Data ─────────────────────────────────────────
const COMMON_FRACTIONS = [
  { label: '1/32"',  inches: 1/32  },
  { label: '1/16"',  inches: 1/16  },
  { label: '3/32"',  inches: 3/32  },
  { label: '1/8"',   inches: 1/8   },
  { label: '3/16"',  inches: 3/16  },
  { label: '1/4"',   inches: 1/4   },
  { label: '5/16"',  inches: 5/16  },
  { label: '3/8"',   inches: 3/8   },
  { label: '7/16"',  inches: 7/16  },
  { label: '1/2"',   inches: 1/2   },
  { label: '9/16"',  inches: 9/16  },
  { label: '5/8"',   inches: 5/8   },
  { label: '11/16"', inches: 11/16 },
  { label: '3/4"',   inches: 3/4   },
  { label: '7/8"',   inches: 7/8   },
  { label: '1"',     inches: 1     },
];

// ─── App ──────────────────────────────────────────────────────────────────────
type Mode = 'metric-to-imperial' | 'imperial-to-metric';
type MetricUnit = 'mm' | 'cm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

export default function App() {
  const [mode, setMode]           = useState<Mode>('metric-to-imperial');
  const [inputValue, setInputValue] = useState('');
  const [metricUnit, setMetricUnit] = useState<MetricUnit>('mm');

  const [imperialResult, setImperialResult] = useState<ImperialResult | null>(null);
  const [metricResult, setMetricResult]     = useState<MetricResult | null>(null);
  const [inputError, setInputError]         = useState<string | null>(null);

  const [isListening, setIsListening]   = useState(false);
  const [voiceStatus, setVoiceStatus]   = useState('');
  const [voiceSupported, setVoiceSupported] = useState(true);
  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setVoiceSupported(false);
  }, []);

  // ── Run conversion whenever inputs change
  const runConversion = useCallback((value: string, currentMode: Mode, currentUnit: MetricUnit) => {
    setInputError(null);
    setImperialResult(null);
    setMetricResult(null);
    if (!value.trim()) return;

    if (currentMode === 'metric-to-imperial') {
      const num = parseFloat(value);
      if (isNaN(num)) { setInputError('Enter a number, e.g. 25.4'); return; }
      if (num < 0)    { setInputError('Enter a positive measurement'); return; }
      const mm = currentUnit === 'cm' ? num * 10 : num;
      setImperialResult(mmToImperial(mm));
    } else {
      const inches = parseImperialInput(value);
      if (inches === null) { setInputError('Formats: 2 3/8 · 1-1/2 · 3/4 · 1.5'); return; }
      if (inches < 0)      { setInputError('Enter a positive measurement'); return; }
      setMetricResult(imperialToMetric(inches));
    }
  }, []);

  useEffect(() => {
    runConversion(inputValue, mode, metricUnit);
  }, [inputValue, mode, metricUnit, runConversion]);

  // ── Mode switch helper
  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setInputValue('');
    setImperialResult(null);
    setMetricResult(null);
    setInputError(null);
    setVoiceStatus('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Voice
  const startListening = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || isListening) return;

    const recognition = new SR() as AnySpeechRecognition;
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => { setIsListening(true); setVoiceStatus('Listening…'); };

    recognition.onresult = (event: AnySpeechRecognition) => {
      let parsed: VoiceParsed = null;
      let bestTranscript = '';
      for (let i = 0; i < event.results[0].length; i++) {
        const t = event.results[0][i].transcript as string;
        parsed = parseVoiceTranscript(t);
        if (parsed) { bestTranscript = t; break; }
        if (i === 0) bestTranscript = t;
      }
      if (parsed) {
        setVoiceStatus(`Heard: "${bestTranscript}"`);
        if (parsed.unit === 'mm')  { setMode('metric-to-imperial'); setMetricUnit('mm'); setInputValue(String(parsed.value)); }
        if (parsed.unit === 'cm')  { setMode('metric-to-imperial'); setMetricUnit('cm'); setInputValue(String(parsed.value)); }
        if (parsed.unit === 'in')  { setMode('imperial-to-metric'); setInputValue(String(parsed.value)); }
      } else {
        setVoiceStatus(`Couldn't parse "${bestTranscript}" — say e.g. "25 millimeters" or "2.5 inches"`);
      }
    };

    recognition.onerror = (event: AnySpeechRecognition) => {
      if (event.error !== 'aborted') setVoiceStatus(`Mic error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const stopListening = () => { recognitionRef.current?.stop(); setIsListening(false); };

  const isMetricMode = mode === 'metric-to-imperial';

  return (
    <div className="app-shell">

      {/* ── Header */}
      <header className="app-header">
        <div className="header-icon" aria-hidden="true">📐</div>
        <div>
          <h1 className="app-title">Wood Shop Converter</h1>
          <p className="app-subtitle">Metric ↔ Imperial · smallest step: ¹⁄₃₂″</p>
        </div>
      </header>

      {/* ── Mode Tabs */}
      <div className="mode-bar">
        <button
          className={`mode-tab ${isMetricMode ? 'mode-tab--active' : ''}`}
          onClick={() => switchMode('metric-to-imperial')}
        >
          mm / cm → inches
        </button>
        <button
          className="swap-btn"
          onClick={() => switchMode(isMetricMode ? 'imperial-to-metric' : 'metric-to-imperial')}
          title="Swap direction"
          aria-label="Swap conversion direction"
        >
          <ArrowLeftRight size={15} />
        </button>
        <button
          className={`mode-tab ${!isMetricMode ? 'mode-tab--active' : ''}`}
          onClick={() => switchMode('imperial-to-metric')}
        >
          inches → mm / cm
        </button>
      </div>

      {/* ── Input Card */}
      <div className="card">
        <label className="input-label" htmlFor="measure-input">
          {isMetricMode ? `Enter measurement in ${metricUnit}` : 'Enter measurement in inches'}
        </label>

        <div className="input-row">
          <div className="input-wrapper">
            <input
              id="measure-input"
              ref={inputRef}
              className="measure-input"
              type="text"
              inputMode="decimal"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder={
                isMetricMode
                  ? metricUnit === 'mm' ? 'e.g. 25.4' : 'e.g. 2.54'
                  : 'e.g. 2 3/8 or 1.5'
              }
              aria-label="Measurement value"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            {inputValue && (
              <button className="clear-btn" onClick={() => { setInputValue(''); setVoiceStatus(''); inputRef.current?.focus(); }} aria-label="Clear input">
                <X size={15} />
              </button>
            )}
          </div>

          {/* Unit selector (metric mode only) */}
          {isMetricMode && (
            <div className="unit-toggle">
              <button className={`unit-btn ${metricUnit === 'mm' ? 'unit-btn--active' : ''}`} onClick={() => setMetricUnit('mm')}>mm</button>
              <button className={`unit-btn ${metricUnit === 'cm' ? 'unit-btn--active' : ''}`} onClick={() => setMetricUnit('cm')}>cm</button>
            </div>
          )}

          {/* Mic button */}
          {voiceSupported && (
            <button
              className={`mic-btn ${isListening ? 'mic-btn--active' : ''}`}
              onClick={isListening ? stopListening : startListening}
              aria-label={isListening ? 'Stop listening' : 'Speak a measurement'}
              title={isListening ? 'Tap to stop' : 'Tap to speak'}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
        </div>

        {/* Imperial format hint */}
        {!isMetricMode && (
          <p className="hint-text">
            Accepted formats: <code>2 3/8</code> &nbsp;·&nbsp; <code>1-1/2</code> &nbsp;·&nbsp; <code>3/4</code> &nbsp;·&nbsp; <code>1.5</code>
          </p>
        )}

        {/* Voice prompts */}
        {isListening && (
          <p className="hint-text hint-text--listening">
            {isMetricMode
              ? '🎙 Say e.g. "25 millimeters" or "3.5 centimeters"'
              : '🎙 Say e.g. "2.5 inches" or "2 and 3 over 8 inches"'}
          </p>
        )}
        {voiceStatus && !isListening && (
          <p className="voice-status">{voiceStatus}</p>
        )}
      </div>

      {/* ── Result Card */}
      {(imperialResult || metricResult || inputError) && (
        <div className="card result-card">
          {inputError ? (
            <p className="error-text">{inputError}</p>
          ) : imperialResult ? (
            <>
              <div className="result-label">Imperial (saw setting)</div>
              <div className="result-value">{imperialResult.displayString}</div>
              <div className="result-decimal">= {imperialResult.decimalInches.toFixed(5)}″ decimal</div>

              {imperialResult.roundDir === 'exact' ? (
                <div className="rounding-badge rounding--exact">
                  <Minus size={13} />
                  &nbsp;Exact — no rounding
                </div>
              ) : (
                <div className={`rounding-badge ${imperialResult.roundDir === 'up' ? 'rounding--up' : 'rounding--down'}`}>
                  {imperialResult.roundDir === 'up'
                    ? <ChevronUp size={13} />
                    : <ChevronDown size={13} />}
                  &nbsp;Rounded&nbsp;<strong>{imperialResult.roundDir}</strong>
                  &nbsp;by {imperialResult.roundDiffMm < 0.01
                    ? `${(imperialResult.roundDiffMm * 1000).toFixed(1)} µm`
                    : `${imperialResult.roundDiffMm.toFixed(3)} mm`}
                  &nbsp;—&nbsp;
                  {imperialResult.roundDir === 'up'
                    ? 'cut slightly wider than target'
                    : 'cut slightly narrower than target'}
                </div>
              )}
            </>
          ) : metricResult ? (
            <>
              <div className="result-label">Metric (exact)</div>
              <div className="result-value">{metricResult.mm.toFixed(3)} mm</div>
              <div className="result-decimal">{metricResult.cm.toFixed(4)} cm</div>
              <div className="rounding-badge rounding--exact">
                <Minus size={13} />
                &nbsp;Exact conversion — no rounding
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ── Quick Reference */}
      <div className="card ref-card">
        <h2 className="ref-title">Quick Reference — tap to load</h2>
        <div className="ref-grid">
          {COMMON_FRACTIONS.map(({ label, inches }) => {
            const mm = inches * MM_PER_INCH;
            return (
              <button
                key={label}
                className="ref-chip"
                onClick={() => {
                  switchMode('imperial-to-metric');
                  setInputValue(label.replace('"', ''));
                }}
                title={`${label} = ${mm.toFixed(3)} mm`}
              >
                <span className="ref-imp">{label}</span>
                <span className="ref-mm">{mm.toFixed(2)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <footer className="app-footer">
        1″ = 25.4 mm exactly · ¹⁄₃₂″ = 0.794 mm
      </footer>
    </div>
  );
}
