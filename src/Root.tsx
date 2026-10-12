import React from 'react';
import {Composition} from 'remotion';
import {Edit} from './Edit';
import {DURATION, FPS, HEIGHT, WIDTH} from './timeline';

export const RemotionRoot: React.FC = () => (
  <Composition id="BeerSambucaEdit" component={Edit} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
);
