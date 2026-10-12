import {Config} from '@remotion/cli/config';

// No GPU in CI/cloud containers: use SwiftShader-backed ANGLE for WebGL.
Config.setChromiumOpenGlRenderer('swangle');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(2);
if (process.env.REMOTION_BROWSER) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
}
