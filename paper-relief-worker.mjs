import { renderPaper } from './paper-relief-kernel.mjs';

self.onmessage = ({ data }) => {
  try {
    const pixels = renderPaper(data);
    self.postMessage({ pixels, width: data.width, height: data.height }, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
