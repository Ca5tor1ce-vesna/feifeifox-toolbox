/** 应用级持久化验收。只用于 node tools/serve.mjs 起的服务和临时浏览器（存档在这个浏览器里）。
 * node tools/verify_local_state.mjs <服务端口> <独立CDP端口>
 */
const [port='8961', debug='9437'] = process.argv.slice(2), base=`http://127.0.0.1:${port}`;
const target=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(t=>t.type==='page'&&(t.url==='about:blank'||t.url.startsWith(base)));
if(!target) throw Error('未找到本任务临时浏览器的验收页面');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0, checks=0;
const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));setTimeout(()=>{if(pending.delete(key))reject(Error(`${method} timeout`));},15000).unref();});
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(expression){for(let i=0;i<100;i++){if(await ev(expression))return;await sleep(100);}throw Error(`等待失败: ${expression}`);}
const check=(name,ok)=>{if(!ok)throw Error(`[X] ${name}`);checks++;console.log(`[OK] ${name}`);};
async function navigate(feature){await send('Page.navigate',{url:`${base}/?state-test=${Date.now()}#/${feature}`});await wait(`document.querySelector('#nav')&&!!window.GT_LOCAL_STATE`);}
async function clickNav(feature){await ev(`document.querySelector('.nav-feature[data-module="${feature.split('/')[0]}"][data-feature="${feature.split('/')[1]}"]').click()`);}
async function setInput(selector,value,event='input'){await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('${event}',{bubbles:true}));})()`);}
/** 把行动轴的窗口切到自定义 AV。预设带的窗口已经是自定义时不用再选。 */
async function setAxisAV(value){await ev(`(()=>{const set=(e,v,t)=>{const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,v);e.dispatchEvent(new Event(t,{bubbles:true}));};const select=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='custom'));if(select.value!=='custom')set(select,'custom','change');return new Promise(r=>setTimeout(()=>{set([...document.querySelectorAll('.axis-field')].find(l=>l.textContent.includes('模拟到')).querySelector('input'),${JSON.stringify(value)},'change');r();},50));})()`);}
async function stateFile(){return ev(`fetch('/api/ui-state').then(r=>r.json()).then(r=>r.entries)`);}
async function waitFile(key,test){for(let i=0;i<60;i++){const s=(await stateFile())[key];if(s&&test(s.value))return s.value;await sleep(100);}throw Error(`文件未保存: ${key}`);}
try{
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await navigate('honkai-star-rail/speed-plan');
  await wait(`document.querySelector('#substat')&&document.querySelector('#hero-current')?.textContent!=='—'`);
  await ev(`document.querySelector('[data-char="1505"]').click()`);
  await wait(`document.querySelector('[data-char="1505"]').getAttribute('aria-selected')==='true'`);
  await setInput('#substat','37.5');await setInput('#superimpose','3','change');await setInput('#eidolon','2','change');
  await setInput('#customAV','350');await setInput('#firstUltAction','3');await setInput('#preset-energy','123.5');
  await ev(`document.querySelector('.sp-tabs [data-tab="timeline"]').click()`);
  await waitFile('honkai-star-rail/speed-plan',s=>s.data.state.relic.substatSpeed===37.5&&s.data.state.superimpose===3&&s.data.aha.initialEnergy==='123.5');
  check('配速输入自动写入存档',true);
  await clickNav('honkai-star-rail/axis');await wait(`document.querySelector('.axis-page')`);
  await ev(`document.querySelector('details.axis-library').open=true;document.querySelectorAll('details.axis-library .axis-library-presets .axis-chip')[0].click()`);
  await wait(`document.querySelectorAll('.axis-member').length===4&&document.querySelector('.axis-card')`);
  await ev(`[...document.querySelectorAll('.axis-filters .axis-chip')].find(b=>b.textContent==='终结技').click()`);
  await setAxisAV('450');
  await waitFile('honkai-star-rail/axis',s=>s.data.customAV===450&&s.data.rowFilter==='ultimate'&&s.data.team[0].id==='1511');
  check('行动轴的队伍和筛选自动落盘',true);
  // 滚得少一点：读预设时顶部的提示会撑高页面，切回来提示已经消失，页面会变短。
  await ev(`(()=>{const s=document.querySelector('#local-save-status');window.__saveTexts=[];new MutationObserver(()=>{if(s.textContent)window.__saveTexts.push(s.textContent)}).observe(s,{childList:true,characterData:true,subtree:true})})()`);
  await ev(`document.querySelector('.view').scrollTop=80`);
  const scrolls=await ev(`({page:document.querySelector('.view').scrollTop})`);
  await waitFile('honkai-star-rail/axis',s=>s.ui?.scrollTop===scrolls.page);
  check('滚动停下后静默写入本机，不显示保存提示',scrolls.page>0&&await ev(`window.__saveTexts.length===0&&!document.querySelector('#local-save-status').textContent`));
  await clickNav('honkai-star-rail/speed-plan');await wait(`document.querySelector('#substat')?.value==='37.5'`);
  check('切页恢复角色、装备档位、目标和补充参数',await ev(`document.querySelector('[data-char="1505"]').getAttribute('aria-selected')==='true'&&document.querySelector('#superimpose').value==='3'&&document.querySelector('#eidolon').value==='2'&&document.querySelector('#customAV').value==='350'&&document.querySelector('#firstUltAction').value==='3'&&document.querySelector('#preset-energy').value==='123.5'`));
  check('配速页签恢复',await ev(`document.querySelector('.sp-tabs .tab.active').dataset.tab==='timeline'`));
  await ev(`window.__fetchBeforeSaveTest=window.fetch;window.fetch=(url,options)=>String(url)==='/api/ui-state'&&options?.method==='POST'?Promise.reject(new Error('验收模拟写入失败')):window.__fetchBeforeSaveTest(url,options)`);
  await setInput('#substat','38.25');
  await wait(`document.querySelector('#local-save-status')?.classList.contains('is-error')`);
  check('写入失败显式提示，页面仍保留编辑',await ev(`document.querySelector('#substat').value==='38.25'&&document.querySelector('#local-save-status').textContent.includes('失败')`));
  await ev(`(async()=>{window.fetch=window.__fetchBeforeSaveTest;await window.GT_LOCAL_STATE.flush()})()`);
  await waitFile('honkai-star-rail/speed-plan',s=>s.data.state.relic.substatSpeed===38.25);
  check('恢复连接后可把保留的编辑补写到本机',true);
  await clickNav('honkai-star-rail/axis');await wait(`document.querySelectorAll('.axis-member').length===4&&document.querySelector('.axis-card')`);
  check('切页恢复队伍、窗口和筛选',await ev(`[...document.querySelectorAll('.axis-field')].find(l=>l.textContent.includes('模拟到')).querySelector('input').value==='450'&&[...document.querySelectorAll('.axis-filters .axis-chip')].find(b=>b.textContent==='终结技').classList.contains('is-on')`));
  await wait(`document.querySelector('.view').scrollTop===${scrolls.page}`);
  check('页面滚动位置恢复',true);
  await ev(`window.GT_LOCAL_STATE.flush()`);
  // 网页版的存档在浏览器里：先导出，清掉浏览器数据（相当于换了浏览器），再导入，应该原样恢复。
  const backup=await ev(`window.GT_BACKEND.exportAll()`);
  await send('Storage.clearDataForOrigin',{origin:base,storageTypes:'local_storage'});
  await navigate('honkai-star-rail/axis');
  check('清掉浏览器数据后存档没了（网页版要靠导出备份）',await ev(`(async()=>{await window.GT_BACKEND.store.ready;return !window.GT_BACKEND.store.get('ui-state')})()`));
  await ev(`window.GT_BACKEND.importAll(${JSON.stringify(backup)})`);
  await navigate('honkai-star-rail/axis');await wait(`document.querySelectorAll('.axis-member').length===4`);
  check('导入导出的存档后恢复队伍和窗口',await ev(`[...document.querySelectorAll('.axis-field')].find(l=>l.textContent.includes('模拟到')).querySelector('input').value==='450'`));
  await navigate('honkai-star-rail/gacha');await wait(`document.querySelector('#pity')`);
  await setInput('#pity','23');await setInput('#copies','2');await setInput('#have','123');
  await ev(`document.querySelector('#guaranteed').checked=true;document.querySelector('#guaranteed').dispatchEvent(new Event('change',{bubbles:true}))`);
  await waitFile('honkai-star-rail/gacha',s=>s.forms['id:pity']==='23'&&s.forms['id:have']==='123');
  await navigate('honkai-star-rail/gacha');await wait(`document.querySelector('#pity')?.value==='23'`);
  check('抽卡规划输入和复选框恢复',await ev(`document.querySelector('#copies').value==='2'&&document.querySelector('#have').value==='123'&&document.querySelector('#guaranteed').checked`));
  console.log(`[OK] ${checks} persistence checks`);
}finally{ws.close();}
