// Preload: points the sample's createFractalCloudClient at a local stub API.
// Nothing else in the entrypoint is touched, so the deploy body on the wire is
// exactly what the real sample sends.
const Module = require('node:module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  const mod = origLoad.apply(this, arguments);
  if (request === '@fractal_cloud/sdk/model' || request === '@fractal_cloud/sdk') {
    const wrapped = Object.create(null);
    for (const k of Object.keys(mod)) {
      if (k === 'createFractalCloudClient') {
        continue;
      }
      Object.defineProperty(wrapped, k, {enumerable: true, get: () => mod[k]});
    }
    Object.defineProperty(wrapped, 'createFractalCloudClient', {
      enumerable: true,
      value: cfg => mod.createFractalCloudClient({...cfg, baseUrl: process.env.STUB_URL}),
    });
    return wrapped;
  }
  return mod;
};
