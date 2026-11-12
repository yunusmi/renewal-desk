const { mkdirSync, copyFileSync } = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../public/docs');
mkdirSync(target, { recursive: true });
for (const file of ['web-components.min.js', 'styles.min.css']) {
  copyFileSync(require.resolve(`@stoplight/elements/${file}`), path.join(target, file));
}
