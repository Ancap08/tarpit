/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Milestone 43 verifier captures: mid-wave Wave 8 (all five enemy types, six towers, the four specials) on each map.
// BASE=http://localhost:4573/ node scripts/art/verifier_painted_maps.ts [landscape|phone|all] [map]; PNGs go to ./shots.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const layouts = process.argv[2] && process.argv[2]!=='all' ? [process.argv[2]] : ['landscape','phone'];
const maps = process.argv[3] ? [process.argv[3]] : ['meadow','switchback','riverbend'];
const base = process.env.BASE ?? 'http://localhost:4573/';
for (const layout of layouts) for (const map of maps) {
  const phone = layout === 'phone';
  const ctx = await b.newContext(phone ? { viewport:{width:390,height:844}, deviceScaleFactor:3, hasTouch:true, isMobile:true } : { viewport:{width:960,height:580}, deviceScaleFactor:1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => m.type()==='error' && errs.push(m.text()));
  await page.goto(base + '?look=painted');
  const tap = async (p) => phone ? await page.touchscreen.tap(p.x,p.y) : await page.mouse.click(p.x,p.y);
  const click = async (name) => { const p = await page.evaluate((n) => { const a=window.__tarpit; const r=a.uiRects()[n]; return r ? a.canvasToPage(r.x+r.width/2, r.y+r.height/2) : null; }, name); if(!p) throw new Error('no '+name); await tap(p); };
  await page.waitForFunction(() => window.__tarpit?.titleReady?.());
  await click('title:freePlay');
  await page.waitForFunction(() => !!window.__tarpit.uiRects()['title:play']);
  await click('title:map:' + map);
  await click('title:play');
  await page.waitForFunction(() => window.__tarpit.game.scene.isActive('game'), null, {timeout:40000});
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const a = window.__tarpit; const s = a.game.scene.getScene('game'); const st = s.state;
    st.gold = 100000; st.wave = 7;
    const path = st.map.path;
    const dist = (x,y) => { let best=1e9; for (let i=1;i<path.length;i++){const A=path[i-1],B=path[i];const dx=B.x-A.x,dy=B.y-A.y;const l2=dx*dx+dy*dy;const t=Math.max(0,Math.min(1,((x-A.x)*dx+(y-A.y)*dy)/l2));best=Math.min(best,Math.hypot(A.x+dx*t-x,A.y+dy*t-y));} return best; };
    const cand = [];
    for (let r=0;r<15;r++) for (let c=2;c<27;c++) { const d = dist(c*32+16,r*32+16); const ov=(R)=>c*32<R.x+R.width&&R.x<c*32+32&&r*32<R.y+R.height&&R.y<r*32+32; if (d>=36 && d<=70 && ![...(st.map.water??[]),...(st.map.landmarks??[])].some(ov)) cand.push({c,r}); }
    const picked = [];
    while (picked.length < 6 && cand.length) {
      let best = cand[0], bs = -1;
      for (const k of cand) { const m = picked.length ? Math.min(...picked.map(p=>Math.hypot(p.c-k.c,p.r-k.r))) : 99 - Math.abs(k.c-15); if (m > bs) { bs = m; best = k; } }
      picked.push(best); cand.splice(cand.indexOf(best),1);
    }
    const types = ['musketeer','cannon','tarpit','longbow','mortar','firepot'];
    const res = picked.map((p,i)=>({p, t: types[i], r: s.build({col:p.c,row:p.r}, types[i]).ok}));
    return { res, special: s.uiState().special.unlocked };
  });
  const shot = async (n) => page.screenshot({ path: `shots/${map}-${layout}-${n}.png` });
  await shot('0setup');
  await page.evaluate(() => { const s = window.__tarpit.game.scene.getScene('game'); const r = s.startWave(); s.setSpeed(1); return r; });
  // advance in sim without waiting real time
  await page.evaluate(() => { const s = window.__tarpit.game.scene.getScene('game'); s.advance(1500); });
  const mid = await page.evaluate(() => { const s = window.__tarpit.game.scene.getScene('game'); const st=s.state; const types = {}; for (const e of st.enemies) types[e.type]=(types[e.type]||0)+1; return {types, wave: st.wave, towers: st.towers.length}; });
  const cast = async (name, kind) => {
    const r = await page.evaluate(({kind}) => { const s = window.__tarpit.game.scene.getScene('game'); const st=s.state; const P=st.map.path;
      const at = (d) => { let rem=d; for (let i=1;i<P.length;i++){const A=P[i-1],B=P[i];const l=Math.hypot(B.x-A.x,B.y-A.y); if(rem<=l) return {x:A.x+(B.x-A.x)*rem/l,y:A.y+(B.y-A.y)*rem/l}; rem-=l;} return P[P.length-1]; };
      const es = [...st.enemies].filter(e=>e.type!=='harpy').sort((a,b)=>b.distance-a.distance);
      st.specialCharges = 1; s.advance(2);
      const front = es[0].distance; let pt;
      if (kind==='barricade') pt = at(front+30); else if (kind==='guards') pt = at(front+150);
      else if (kind==='tarBarrel') pt = at(es[Math.floor(es.length/2)].distance); else pt = at(es[es.length-1].distance);
      const res = s.useSpecialAt(kind, pt.x, pt.y); s.advance(80); return res.ok ? 'ok' : res.reason; }, {kind});
    await page.waitForTimeout(250);
    await shot(name); return r;
  };
  const out = {};
  out.tar = await cast('2tar','tarBarrel');
  out.fire = await cast('3fire','fireArrows');
  out.barr = await cast('4barricade','barricade');
  out.guards = await cast('5guards','guards');
  console.log(layout, map, JSON.stringify(info.res.map(r=>r.r)), JSON.stringify(mid), JSON.stringify(out), errs.join('|'));
  // range ring
  const tp = await page.evaluate(() => { const s = window.__tarpit.game.scene.getScene("game"); const t = s.state.towers[3]; return {x:t.cell.col,y:t.cell.row}; });
  const cp = await page.evaluate(({x,y}) => window.__tarpit.cellToPage(x,y), tp);
  await tap(cp); await page.waitForTimeout(300); await shot('6ring');
  await tap({x:2,y:2}); 
  // placement highlight: pick cannon, hover valid + invalid (mouse only)
  if (!phone) {
    await click('bar:cannon');
    const cells = await page.evaluate(() => { const s = window.__tarpit.game.scene.getScene('game'); const st=s.state; const P=st.map.path; 
      const dist = (x,y) => { let best=1e9; for (let i=1;i<P.length;i++){const A=P[i-1],B=P[i];const dx=B.x-A.x,dy=B.y-A.y;const l2=dx*dx+dy*dy;const t=Math.max(0,Math.min(1,((x-A.x)*dx+(y-A.y)*dy)/l2));best=Math.min(best,Math.hypot(A.x+dx*t-x,A.y+dy*t-y));} return best; };
      let valid=null, invalid=null, edge=null;
      for (let r=1;r<14;r++) for (let c=3;c<27;c++) { const d=dist(c*32+16,r*32+16); const occ = st.towers.some(t=>t.cell.col===c&&t.cell.row===r); const wat=(st.map.water??[]).some(R=>c*32<R.x+R.width&&R.x<c*32+32&&r*32<R.y+R.height&&R.y<r*32+32);
        if (!occ&&!valid&&d>=40&&d<80&&!wat) valid={c,r}; if (!invalid&&d<10) invalid={c,r}; if (!edge&&d>=36&&d<38&&!occ&&!wat) edge={c,r}; }
      const water = (st.map.water??[]).length ? {c:14,r:8} : null; return {valid, invalid, edge, water}; });
    for (const [k,v] of Object.entries(cells)) { if(!v) continue; const p = await page.evaluate(({c,r}) => window.__tarpit.cellToPage(c,r), v); await page.mouse.move(p.x-3,p.y-3); await page.mouse.move(p.x,p.y); await page.waitForTimeout(250); await page.screenshot({path:`shots/${map}-${layout}-7hl-${k}.png`, clip:{x:Math.max(0,p.x-100),y:Math.max(0,p.y-80),width:200,height:160}}); }
  }
  await ctx.close();
}
await b.close();
