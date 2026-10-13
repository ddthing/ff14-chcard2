const screenshotStub = `
globalThis.__cardExportRendererImported = true;

export async function createContext(node, options) {
  globalThis.__cardExportRendererOptions = {
    type: options.type,
    quality: options.quality,
    width: options.width,
    height: options.height,
    scale: options.scale,
    maximumCanvasSize: options.maximumCanvasSize,
  };
  globalThis.__cardExportContextAutoDestruct = options.autoDestruct;
  globalThis.__cardExportContextDestroyed = false;
  return {
    ...options,
    node,
    ownerDocument: node.ownerDocument,
    dpi: options.scale === 1 ? null : 96 * options.scale,
    drawImageCount: 0,
    drawImageInterval: 100,
    isEnable: () => false,
  };
}

export async function domToForeignObjectSvg(context) {
  globalThis.__cardExportForeignObjectSvgCalls = (globalThis.__cardExportForeignObjectSvgCalls ?? 0) + 1;
  globalThis.__cardExportContextSandboxReady = Boolean(context.sandbox?.contentDocument?.body);
  return globalThis.__cardExportForeignObjectSvg ?? { ownerDocument: context.ownerDocument };
}

export async function loadMedia(image) {
  globalThis.__cardExportLoadedMediaCount = (globalThis.__cardExportLoadedMediaCount ?? 0) + 1;
  return image;
}

export async function domToBlob(context) {
  globalThis.__cardExportDomToBlobCalls = (globalThis.__cardExportDomToBlobCalls ?? 0) + 1;
  globalThis.__cardExportContextSandboxReady = Boolean(context.sandbox?.contentDocument?.body);
  if (globalThis.__cardExportRendererError) throw globalThis.__cardExportRendererError;
  if (globalThis.__cardExportRendererCall) return globalThis.__cardExportRendererCall(context);
  const options = context;
  const holder = globalThis.__cardExportMaterialPreloadHolder;
  const photo = globalThis.__cardExportCriticalPhoto;
  globalThis.__cardExportFilterObservation = {
    holderIncluded: options.filter(holder),
    photoIncluded: options.filter(photo),
    readyFallbackIncluded: globalThis.__cardExportReadyPhotoFallback ? options.filter(globalThis.__cardExportReadyPhotoFallback) : true,
    errorFallbackIncluded: globalThis.__cardExportErrorPhotoFallback ? options.filter(globalThis.__cardExportErrorPhotoFallback) : true,
    textNodeIncluded: options.filter({ nodeType: 3 }),
    decodedImages: globalThis.__cardExportDecodedImageCount,
  };
  return globalThis.__cardExportScreenshotBlob;
}

export function destroyContext(context) {
  context.sandbox?.remove();
  context.sandbox = undefined;
  context.ownerDocument = undefined;
  globalThis.__cardExportContextDestroyed = true;
  globalThis.__cardExportContextDestroyCount = (globalThis.__cardExportContextDestroyCount ?? 0) + 1;
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
