// Invoked by measure-view.mjs --trees <evidence-dir>. Own static server, independent FOOTSTEPS_DATA required.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from './static-server.mjs';
import { dataRoots, cacheElevationTiles } from './visual-lib.mjs';
const out = path.resolve(process.argv.filter(a => !a.startsWith('--'))[2] ?? 'trees-out');
if (!process.env.FOOTSTEPS_DATA) throw new Error('Set FOOTSTEPS_DATA to approved independent assets');
fs.mkdirSync(out, {recursive:true});
const {server,base} = await serveStatic(['out', ...dataRoots(process.env.FOOTSTEPS_DATA)]);
const browser = await chromium.launch({headless:true,args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist']});
const results = [];
const scenes = [
  {id:'alps-13',lat:46.12,lon:8.3,zoom:13,year:-1000},
  {id:'alps-14',lat:46.12,lon:8.3,zoom:14,year:-1000},
  {id:'alps-15',lat:46.12,lon:8.3,zoom:15,year:-1000},
  {id:'congo-14',lat:0.5,lon:23.5,zoom:14,year:1000},
  {id:'sahel-14',lat:13,lon:15,zoom:14,year:-3000},
  {id:'canada-14',lat:54,lon:-105,zoom:14,year:1800},
].filter(s=>!process.env.SCENE || s.id===process.env.SCENE);
try {
  for (const scene of scenes) for (const variant of ['off','trees','plants']) {
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    const page = await context.newPage();
    await cacheElevationTiles(context, path.join(out,'dem-cache'));
    const errors=[];
    const treeAssets=[];
    page.on('request',r=> {if(r.url().includes('/trees/')) treeAssets.push(r.url());});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=> {
      if (/shader|GLSL|TreeLayer|ERROR:/.test(m.text())) fs.appendFileSync(path.join(out,'shader.log'),`${m.type()}: ${m.text()}\n`);
      if(m.type()==='error' && /shader|GLSL|TreeLayer|Error:/.test(m.text())) errors.push(m.text());
    });
    const q = new URLSearchParams({...Object.fromEntries(Object.entries(scene).filter(([k])=>k!=='id')),still:'1',...(variant==='off'?{}:{[variant]:'1'})});
    await page.goto(`${base}/?${q}`);
    await page.waitForFunction(()=>document.querySelector('main')?.getAttribute('data-loading')==='false',null,{timeout:90000});
    await page.waitForFunction(()=> {
      for(const el of document.querySelectorAll('canvas')) {
        let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
        for(;f;f=f.return) for(let h=f.memoizedState;h;h=h.next) if(h.memoizedState?.current?.deck?.layerManager) {window.__deck=h.memoizedState.current.deck; return true;}
      }
      return false;
    });
    await page.waitForTimeout(12000);
    const placement = await page.evaluate(()=> {
      const d=window.__deck, all=d.layerManager.getLayers();
      const parent=all.find(l=>l.id==='close3d');
      const trees=all.filter(l=>l.constructor.layerName==='TreeLayer').flatMap(l=>l.props.data);
      const clearings=parent?.props.clearings??[];
      let ice=0,wet=0,cleared=0;
      for(const t of trees) {
        const [lon,lat,h]=t.position;
        if(parent.props.ice?.shareAt(lon,lat)>=0.5 || parent.props.ground.biomeAt(lon,lat)===28) ice++;
        if(h<=parent.props.seaLevel*1.6 || parent.props.lake?.levelAt(lon,lat,h/1.6)!=null) wet++;
        if(clearings.some(c=>Math.hypot((lon-c.position[0])*111320*Math.cos(lat*Math.PI/180),(lat-c.position[1])*110540)<c.radius)) cleared++;
      }
      const byZoom={};
      for(const l of all.filter(l=>l.constructor.layerName==='TreeLayer')) { const z=/-(\d+)-trees$/.exec(l.id)?.[1] ?? l.id; byZoom[z]=(byZoom[z]??0)+l.props.data.length; }
      return {trees:trees.length,byZoom,clearings:clearings.length,ice,wet,cleared,ground:!!parent?.props.ground,layers:all.filter(l=>l.id.endsWith('-ground')).length};
    });
    await page.screenshot({path:path.join(out,`${scene.id}-${variant}.png`)});
    const perf=await page.evaluate(async()=> {
      const d=window.__deck;
      const frames=[];
      const start=performance.now();
      await new Promise(resolve=>{ const tick=t=>{frames.push(t); d.redraw(true); if(t-start<4000)requestAnimationFrame(tick);else resolve();}; requestAnimationFrame(tick); });
      const gaps=frames.slice(1).map((t,i)=>t-frames[i]).sort((a,b)=>a-b);
      return {fps:1000*(frames.length-1)/(frames.at(-1)-frames[0]),p95:gaps[Math.floor(gaps.length*.95)]};
    });
    const result={scene:scene.id,variant,placement,...perf,errors,treeAssets};results.push(result);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(result));
    await context.close();
  }
} finally {await browser.close();server.close();}
if(results.some(r=>r.errors.length||!r.placement.ground||!r.placement.layers||r.placement.ice||r.placement.wet||r.placement.cleared||(r.variant==='trees'&&!r.placement.trees)||(r.variant!=='trees'&&r.treeAssets.length))) process.exitCode=1;
