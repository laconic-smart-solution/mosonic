const fs = require('fs');
const path = require('path');
const root = 'D:/Projects/work/neutral-tex/server/src/rule/tools';
for (const f of ['generate-video.tools.ts','workflow-edit.tools.ts','channel.tools.ts','post.tools.ts','generate-more.tools.ts','pipeline-inspect.tools.spec.ts']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) { console.log('missing', f); continue; }
  const t = fs.readFileSync(p, 'utf8');
  console.log('\n====', f, '====');
  const nameRe = /name:\s*['"]([a-z0-9_]+)['"]/g;
  let m; const names=[];
  while ((m = nameRe.exec(t))) names.push(m[1]);
  console.log('names:', [...new Set(names)].join(', '));
}
// find tool registration list
const loop = fs.readFileSync('D:/Projects/work/neutral-tex/server/src/rule/tools/tool-calling-loop.ts','utf8');
const allNames = [...loop.matchAll(/['"]([a-z][a-z0-9_]{2,})['"]/g)].map(x=>x[1]);
