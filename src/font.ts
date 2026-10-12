import {continueRender, delayRender, staticFile} from 'remotion';

// Anton (SIL Open Font License) bundled locally so renders work offline.
export const fontFamily = 'AntonLocal';

if (typeof document !== 'undefined') {
  const handle = delayRender('Loading Anton font');
  const face = new FontFace(fontFamily, `url(${staticFile('fonts/Anton-Regular.woff2')}) format('woff2')`);
  face
    .load()
    .then((f) => {
      document.fonts.add(f);
      continueRender(handle);
    })
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
}
