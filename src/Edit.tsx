import {ThreeCanvas} from '@remotion/three';
import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import * as THREE from 'three';
import {fontFamily} from './font';
import {Scene} from './scene/Scene';
import {HEIGHT, shotAt, WIDTH} from './timeline';
import {clamp, easeOutBack} from './util';

const Title: React.FC<{since: number}> = ({since}) => {
  if (since < 0) return null;
  // "FIRE &" slams on the beat, "ICE" an eighth-note later
  const word = (delay: number) => {
    const k = since - delay;
    if (k < 0) return {opacity: 0, transform: 'scale(3)'};
    const s = 1 + 2.2 * (1 - easeOutBack(clamp(k / 6), 1.6));
    return {opacity: clamp(k / 2), transform: `scale(${s})`};
  };
  const base: React.CSSProperties = {
    fontFamily,
    fontSize: 260,
    lineHeight: 0.92,
    letterSpacing: 6,
    textTransform: 'uppercase',
    display: 'inline-block',
  };
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', paddingBottom: 220}}>
      <div style={{textAlign: 'center'}}>
        <div
          style={{
            ...base,
            ...word(0),
            backgroundImage: 'linear-gradient(180deg, #fff2b0 0%, #ffb21c 45%, #ff4d00 100%)',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 0 28px rgba(255,120,0,0.85)) drop-shadow(0 6px 0 rgba(0,0,0,0.6))',
          }}
        >
          FIRE
        </div>
        <div style={{...base, ...word(0), fontSize: 150, color: '#ffffff', filter: 'drop-shadow(0 0 18px rgba(255,255,255,0.7))'}}>&amp;</div>
        <div
          style={{
            ...base,
            ...word(8),
            backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #9fdcff 45%, #2f6bff 100%)',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
            filter: 'drop-shadow(0 0 28px rgba(60,130,255,0.9)) drop-shadow(0 6px 0 rgba(0,0,0,0.6))',
          }}
        >
          ICE
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Edit: React.FC = () => {
  const frame = useCurrentFrame();
  const shot = shotAt(frame);
  const {fx} = shot;
  const blur = Math.abs(fx.whip) * 70;
  const whipShift = fx.whip * 120;
  const textShake = fx.text >= 0 ? fx.shake * 400 : 0;
  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      <svg width="0" height="0" style={{position: 'absolute'}}>
        <filter id="whip" x="-20%" y="-5%" width="140%" height="110%">
          <feGaussianBlur stdDeviation={`${blur} ${blur * 0.04}`} />
        </filter>
      </svg>
      <AbsoluteFill
        style={{
          transform: `translateX(${-whipShift}px) scale(${1 + fx.punch})`,
          filter: blur > 0.5 ? 'url(#whip)' : undefined,
        }}
      >
        <ThreeCanvas
          width={WIDTH}
          height={HEIGHT}
          dpr={1}
          gl={{antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'}}
          camera={{fov: 30, position: [0, 1, 3], near: 0.02, far: 60}}
          onCreated={({gl}) => {
            gl.toneMapping = THREE.NoToneMapping;
          }}
        >
          <Scene shot={shot} />
        </ThreeCanvas>
      </AbsoluteFill>
      {fx.flash > 0 && <AbsoluteFill style={{backgroundColor: '#fff', opacity: fx.flash}} />}
      <AbsoluteFill style={{transform: `translate(${textShake * Math.sin(frame * 2.1)}px, ${textShake * Math.cos(frame * 1.7)}px)`}}>
        <Title since={fx.text} />
      </AbsoluteFill>
      {fx.fade > 0 && <AbsoluteFill style={{backgroundColor: '#000', opacity: fx.fade}} />}
    </AbsoluteFill>
  );
};

