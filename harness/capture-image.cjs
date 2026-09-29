// Runs each compiled app_with_identity entrypoint against a local stub API,
// captures the LiveSystem the SDK POSTs, and asserts the `orders` workload
// image is fully qualified by the caas-k8s agent's own rule, so it is pulled
// as written rather than prefixed to a registry nobody seeded.
//
// usage: node capture-image.cjs <sample-dir>
const http = require('node:http');
const {spawn} = require('node:child_process');
const path = require('node:path');

const sampleDir = path.resolve(process.argv[2]);
const EXPECTED = 'public.ecr.aws/nginx/nginx:latest';
const HOSTS = [
  'fractalmgmt.azurecr.io',
  '918734735703.dkr.ecr.eu-central-1.amazonaws.com',
];

// Mirror of aria-agent-go-common v1.0.12 pkg/registry/image.go ResolveImage.
function hasRegistryHost(image) {
  const i = image.indexOf('/');
  if (i < 0) {
    return false;
  }
  const first = image.slice(0, i);
  return first.includes('.') || first.includes(':') || first === 'localhost';
}
function resolveImage(image, host) {
  if (!image || !host || hasRegistryHost(image)) {
    return image;
  }
  return host.replace(/\/+$/, '') + '/' + image;
}

function findImages(node, out = []) {
  if (Array.isArray(node)) {
    node.forEach(n => findImages(n, out));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if ((k === 'image' || k === 'containerImage') && typeof v === 'string') {
        out.push(v);
      } else {
        findImages(v, out);
      }
    }
  }
  return out;
}

function runTarget(target) {
  return new Promise((resolve, reject) => {
    const posts = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        if (req.method === 'POST' && req.url.startsWith('/livesystems')) {
          posts.push(JSON.parse(body));
        }
        if (req.method === 'GET' && req.url.startsWith('/livesystems/')) {
          res.writeHead(404, {'content-type': 'application/json'});
          res.end('{}');
          return;
        }
        res.writeHead(200, {'content-type': 'application/json'});
        res.end('{}');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      const child = spawn(
        process.execPath,
        ['-r', path.join(__dirname, 'redirect-sdk.cjs'), `build/src/${target}.js`],
        {
          cwd: sampleDir,
          env: {
            ...process.env,
            STUB_URL: `http://127.0.0.1:${port}`,
            SERVICE_ACCOUNT_ID: 'sa',
            SERVICE_ACCOUNT_SECRET: 'secret',
            OWNER_ID: '00000000-0000-0000-0000-000000000000',
            DEPLOY_MODE: 'fire-and-forget',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let log = '';
      child.stdout.on('data', d => (log += d));
      child.stderr.on('data', d => (log += d));
      child.on('exit', code => {
        server.close();
        if (posts.length === 0) {
          reject(new Error(`${target}: no LiveSystem POST captured (exit ${code})\n${log}`));
          return;
        }
        resolve(findImages(posts));
      });
    });
  });
}

(async () => {
  let failed = false;
  for (const target of ['aws', 'azure', 'mixed']) {
    const images = await runTarget(target);
    const problems = [];
    if (images.length !== 1) {
      problems.push(`expected exactly one workload image, got ${JSON.stringify(images)}`);
    }
    for (const image of images) {
      if (image !== EXPECTED) {
        problems.push(`image ${image} != ${EXPECTED}`);
      }
      for (const host of HOSTS) {
        const pulled = resolveImage(image, host);
        if (pulled !== image) {
          problems.push(`agent would rewrite ${image} to ${pulled}`);
        }
      }
    }
    if (problems.length) {
      failed = true;
      console.log(`FAIL ${target}: ${problems.join('; ')}`);
    } else {
      console.log(`PASS ${target}: wire image ${images[0]} is pulled as written`);
    }
  }
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error(e.message);
  process.exit(2);
});
