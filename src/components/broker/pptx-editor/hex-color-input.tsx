'use client';

import { useState, useEffect, useRef } from 'react';

interface HexColorInputProps {
  label: string;
  value: string;        // 6-char hex without '#'
  onChange: (hex: string) => void;
  showLabel?: boolean;
}

export function HexColorInput({ label, value, onChange, showLabel = true }: HexColorInputProps) {
  const [localHex, setLocalHex] = useState(value);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalHex(value); }, [value]);

  // Close picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleHexInput(raw: string) {
    const cleaned = raw.replace('#', '').replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    setLocalHex(cleaned);
    if (cleaned.length === 6) onChange(cleaned);
  }

  function handleNativeColorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value.replace('#', '');
    setLocalHex(hex);
    onChange(hex);
  }

  const isValid = /^[0-9a-fA-F]{6}$/.test(localHex);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32 }}>
      {showLabel && (
        <span style={{ fontSize: 11, color: '#9AA7B5', width: 80, flexShrink: 0 }}>{label}</span>
      )}
      <div ref={pickerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Color swatch — clickable */}
        <button
          type="button"
          onClick={() => setIsPickerOpen(o => !o)}
          style={{
            width: 28, height: 28,
            borderRadius: 6,
            background: isValid ? `#${localHex}` : '#ccc',
            border: '2px solid #2D3748',
            cursor: 'pointer',
            flexShrink: 0,
            position: 'relative',
          }}
          title="색상 선택"
        />
        {/* Hex text input */}
        <span style={{ fontSize: 11, color: '#6B7280' }}>#</span>
        <input
          type="text"
          value={localHex}
          onChange={e => handleHexInput(e.target.value)}
          maxLength={6}
          placeholder="B98A2E"
          style={{
            width: 72,
            padding: '3px 6px',
            background: '#0F1923',
            border: `1px solid ${isValid ? '#2D3748' : '#EF4444'}`,
            borderRadius: 4,
            color: '#E7ECF2',
            fontSize: 12,
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        {/* Native color picker popup */}
        {isPickerOpen && (
          <div style={{
            position: 'absolute',
            top: 36, left: 0,
            background: '#1A2333',
            border: '1px solid #2D3748',
            borderRadius: 8,
            padding: 8,
            zIndex: 1000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <input
              type="color"
              value={`#${isValid ? localHex : '000000'}`}
              onChange={handleNativeColorChange}
              style={{ width: 160, height: 120, border: 'none', cursor: 'pointer', background: 'transparent' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
