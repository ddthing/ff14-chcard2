const screenshotStub = `
export async function domToBlob(_node, options) {
  const holder = globalThis.__cardExportMaterialPreloadHolder;
  const photo = globalThis.__cardExportCriticalPhoto;
  globalThis.__cardExportFilterObservation = {
    holderIncluded: options.filter(holder),
    photoIncluded: options.filter(photo),
    textNodeIncluded: options.filter({ nodeType: 3 }),
    decodedImages: globalThis.__cardExportDecodedImageCount,
  };
  return globalThis.__cardExportScreenshotBlob;
}
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'modern-screenshot') {
    return {
      url: `data:text/javascript,${encodeURIComponent(screenshotStub)}`,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
