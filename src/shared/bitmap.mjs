// An image's pixels for a canvas that reads them back. Drawn from the <img>
// itself, such a canvas has the browser decode the picture again on the main
// thread; decoded from its file, it is decoded off it. Drawn near its own
// size the pixels are the same either way, so the <img> serves wherever that
// is not possible. (Much reduced, an <img> is resampled its own way: there,
// as for the wordmark's trace, it stays with the <img>.)
export async function bitmapOf(image) {
  try {
    const response = await fetch(image.currentSrc || image.src);
    if (!response.ok) throw new Error(`${response.status}`);
    return await createImageBitmap(await response.blob());
  } catch {
    await image.decode();
    return image;
  }
}

// Lets the browser paint and answer input between the steps of a long job.
export const yieldToMain = () => (globalThis.scheduler?.yield
  ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0)));
