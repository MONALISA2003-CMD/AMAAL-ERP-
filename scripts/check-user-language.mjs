import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [path.join(repoRoot, 'apps', 'web', 'app'), path.join(repoRoot, 'apps', 'web', 'components')];
const banned = [
  'Neon Auth', 'TypeScript', 'JavaScript', 'SQL', 'serverless', 'SDK', 'governance', 'autonomy', 'outbox', 'read model',
  'foundation mode', 'execution guard', 'authorized scope', 'organization scope', 'HTTP 404', 'HTTP 500', 'Request could not be completed',
  'PENDING_APPROVAL', 'PERCENT_OF_SALE', 'FIXED_AMOUNT', 'endpoint', 'schema', 'uuid', 'request id', 'ML Intelligence', 'toolName', 'roleKey', 'statusCode',
];

function walk(dir) {
  const result=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) result.push(...walk(full));
    else if(/\.tsx$/.test(entry.name)) result.push(full);
  }
  return result;
}
function stripComments(source){return source.replace(/\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');}
function findMarkup(source){
  const cleaned=stripComments(source);
  const match=cleaned.match(/\breturn\s*(?:\(|)(\s*<[\s\S]*)$/);
  return match?.[1]??'';
}
function removeJsxExpressions(markup){
  let out=''; let depth=0; let quote=null; let escape=false;
  for(let i=0;i<markup.length;i+=1){
    const c=markup[i];
    if(depth===0&&c==='{'){depth=1;continue;}
    if(depth>0){
      if(quote){if(escape) escape=false; else if(c==='\\') escape=true; else if(c===quote) quote=null;}
      else if(c==='"'||c==="'"||c==='`') quote=c;
      else if(c==='{') depth+=1; else if(c==='}') depth-=1;
      continue;
    }
    out+=c;
  }
  return out;
}
function visibleFragments(source){
  const fragments=[]; const markup=findMarkup(source); const staticMarkup=removeJsxExpressions(markup);
  for(const match of staticMarkup.matchAll(/>([^<]+)</g)){const value=match[1].replace(/\s+/g,' ').trim();if(value&&/[A-Za-z]{3}/.test(value)) fragments.push({kind:'text',value});}
  for(const match of markup.matchAll(/\b(?:placeholder|aria-label|title|alt)\s*=\s*(['"])(.*?)\1/g)) fragments.push({kind:'attribute',value:match[2]});
  for(const match of stripComments(source).matchAll(/\b(?:setError|setMessage|setNotice|prompt)\s*\(\s*(['"`])([\s\S]*?)\1/g)) fragments.push({kind:'message',value:match[2].replace(/\$\{[^}]*\}/g,' ')});
  return fragments;
}
const files=roots.flatMap(walk); const problems=[];
for(const file of files){for(const fragment of visibleFragments(fs.readFileSync(file,'utf8'))){const lowered=fragment.value.toLowerCase();for(const term of banned){if(lowered.includes(term.toLowerCase())) problems.push(`${path.relative(repoRoot,file)}: ${term} in ${fragment.kind}: ${fragment.value}`);}}}
if(problems.length){console.error('User-facing language check found implementation wording:');for(const item of problems) console.error(`- ${item}`);process.exit(1);}
console.log(`User-facing language check passed across ${files.length} application source files.`);
