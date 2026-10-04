import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const packages=[];
function walk(dir){
  for(const e of readdirSync(dir,{withFileTypes:true})){
    if(['node_modules','.git','.next','.turbo'].includes(e.name)) continue;
    const f=join(dir,e.name);
    if(e.isDirectory()) walk(f);
    else if(e.isFile()&&e.name==='package.json'){
      const p=JSON.parse(readFileSync(f,'utf8'));
      packages.push({path:f.replace(process.cwd()+'/',''),name:p.name||null,version:p.version||null});
    }
  }
}
walk(process.cwd());
const py=readFileSync('services/intelligence/requirements.lock','utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#'));
const bom={bomFormat:'CycloneDX',specVersion:'1.5',version:1,components:[...packages.map(p=>({type:'library',name:p.name||p.path,version:p.version||'workspace'})),...py.map(x=>({type:'library',name:x.split('==')[0],version:x.split('==')[1]||'unknown'}))]};
writeFileSync('amaal-sbom.json',JSON.stringify(bom,null,2)+'\n');
console.log(`SBOM generated with ${bom.components.length} components.`);
