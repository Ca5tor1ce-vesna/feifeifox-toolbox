/** 行动轴的队伍存档、预设、筛选验收。只连接本任务独立浏览器的 about:blank 页面。
 * node tools\verify_team_ui.mjs <隔离服务端口> <隔离CDP端口> <截图目录>
 * 服务用 node tools/serve.mjs；存档在这个临时浏览器里，本脚本会保存测试角色/队伍后清理。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [port = '8961', debug = '9437', out = 'tools/.cache/team-shots'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const base = `http://127.0.0.1:${port}`;
const targets = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
const target = targets.find(t => t.type === 'page' && (t.url === 'about:blank' || t.url.startsWith(base)));
if (!target) throw Error('请启动独立临时浏览器并打开 about:blank。');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pending = new Map();
ws.onmessage = event => {
  const msg = JSON.parse(event.data), p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id); msg.error ? p.reject(Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params }));
    const timer = setTimeout(() => { if (pending.delete(key)) reject(Error(`${method} timeout`)); }, 15000); timer.unref();
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function wait(expression) {
  for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await sleep(150); }
  throw Error(`等待失败: ${expression}`);
}
let checks = 0;
function check(name, ok) { if (!ok) throw Error(`[X] ${name}`); checks++; console.log(`[OK] ${name}`); }
async function shot(name) { await sleep(250); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${name}.png`), Buffer.from(r.data, 'base64')); }
/** 后端在浏览器里（app/backend.js），存档也在页面里：在页面里调用 /api/call。页面还没打开站点时先打开首页。 */
async function api(feature, action, payload = {}) {
  if (!String(await evaluate('location.href')).startsWith(base)) { await send('Page.navigate', { url: `${base}/` }); await sleep(1500); }
  const body = JSON.stringify({ module: 'honkai-star-rail', feature, action, payload });
  const r = await evaluate(`fetch('/api/call', { method: 'POST', body: ${JSON.stringify(body)} }).then(r => r.json())`);
  if (!r.ok) throw Error(JSON.stringify(r)); return r.result;
}
await send('Page.enable');
await send('Runtime.enable');
// 别的标签页（比如浏览器弹出的欢迎页）在前台时，这页会被当成隐藏页，动画帧停住，离场动画走不完。
await send('Page.bringToFront');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errors=[]; window.addEventListener('error', e=>window.__errors.push(e.message)); window.addEventListener('unhandledrejection', e=>window.__errors.push(String(e.reason)));` });
const setValue = (selector, value, event = 'input') => `(()=>{const e=${selector};const proto=e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${event}',{bubbles:true}));})()`;
const library = "document.querySelector('details.axis-library')";
const button = (root, label) => `[...${root}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`;
const statusIs = text => `document.querySelector('[role=status]')?.textContent.includes(${JSON.stringify(text)})`;
let savedTeam;
const original = (await api('speed-plan', 'presets')).presets['1502'];
try {
  await send('Page.navigate', { url: `${base}/#/honkai-star-rail/speed-plan` });
  await wait("document.querySelector('#save-preset') && document.querySelector('#hero-current')?.textContent !== '—'");
  await evaluate(`document.querySelector('[data-char="1502"]').click()`);
  await wait(`document.querySelector('[data-char="1502"]').getAttribute('aria-selected')==='true'`);
  await evaluate(`for(const [id,value] of [['eidolon','0'],['superimpose','1']]){const el=document.querySelector('#'+id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}document.querySelector('#preset-err').value='19.4'; document.querySelector('#preset-energy').value='80'; document.querySelector('#preset-rotation').value='basic'; document.querySelector('#save-preset').click()`);
  await wait("document.querySelector('#preset-note').textContent.includes('已保存')");
  const config = (await api('speed-plan', 'presets')).presets['1502'].config;
  check('角色配装保存模拟补充参数', config.aha.err === 19.4 && config.aha.initialEnergy === '80' && config.aha.rotation === 'basic');
  await evaluate(`document.querySelector('#preset-err').value='1';document.querySelector('#apply-preset').click()`);
  check('重新套用恢复模拟补充参数', await evaluate("document.querySelector('#preset-err').value==='19.4'"));
  const expected = await api('speed-plan', 'plan', { ...config, characterId: '1502' });

  await evaluate("document.querySelector('#open-team-simulator').click()");
  await wait("document.querySelector('.axis-page')");
  check('配速查询的链接进入行动轴', await evaluate("location.hash==='#/honkai-star-rail/axis'"));

  // 预设：4 个欢愉队预设都能一键出轴
  await evaluate(`${library}.open=true`);
  const presetCount = await evaluate(`${library}.querySelectorAll('.axis-library-presets .axis-chip').length`);
  check('预设队伍都在', presetCount === 4);
  await evaluate(`${library}.querySelectorAll('.axis-library-presets .axis-chip')[2].click()`);
  await wait("document.querySelectorAll('.axis-member').length===4 && document.querySelector('.axis-elation')");
  check('预设读入后立刻出轴，且显示阿哈面板', await evaluate("document.querySelectorAll('.axis-card').length>0"));
  check('右栏只放轴：阿哈面板在左栏', await evaluate("!!document.querySelector('.axis-setup .axis-elation') && !document.querySelector('.axis-result .axis-elation') && !document.querySelector('.axis-result .axis-units')"));
  check('换了队伍才播出轴动画', await evaluate("!!document.querySelector('.axis-moment.is-revealing')"));
  check('绯英预设按存档速度', await evaluate("document.querySelector('.axis-member-stats b').textContent==='152.7'"));

  // 机制按队伍出现
  await evaluate(`${library}.querySelectorAll('.axis-library-presets .axis-chip')[1].click()`);
  await wait("[...document.querySelectorAll('.axis-member strong')][0].textContent.includes('戏浪')");
  await evaluate("[...document.querySelectorAll('details.axis-more')].find(d=>d.querySelector('summary').textContent.includes('欢愉')).open=true");
  check('有砂金•戏浪才显示【三赌牌局】设置', await evaluate("document.querySelector('details.axis-more').textContent.includes('三赌牌局')"));
  await evaluate(`${library}.querySelectorAll('.axis-library-presets .axis-chip')[0].click()`);
  await wait("[...document.querySelectorAll('.axis-member strong')][0].textContent.includes('阿哈')");
  check('星神★阿哈有头像', await evaluate("!!document.querySelector('.axis-member img')?.getAttribute('src')"));
  check('星神★阿哈的卡显示愿力', await evaluate("[...document.querySelectorAll('.axis-card')].some(e=>e.textContent.includes('星神★阿哈')&&/^愿力 \\d+$/.test(e.querySelector('.axis-card-energy')?.textContent.trim()??''))"));
  check('同一时刻的追击挂在主动作卡上', await evaluate("[...document.querySelectorAll('.axis-card.is-unit')].some(e=>e.querySelector('.axis-card-follow em')?.textContent==='追击')"));
  check('阿哈时刻卡带出欢愉技头像', await evaluate("[...document.querySelectorAll('.axis-card.is-aha')].some(e=>e.querySelectorAll('.axis-card-cast .axis-card-caster img').length>=2)"));
  check('卡片头像和选人同样取景、透明底、没有属性和命途图标', await evaluate("(()=>{const f=document.querySelector('.axis-card.is-unit .axis-head');if(!f)return false;const s=getComputedStyle(f);const img=f.querySelector('img');return f.offsetWidth===44&&parseFloat(s.borderTopLeftRadius)>8&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&!!img.style.width&&img.naturalWidth>0})()"));
  // 队伍满了没有添加按钮，点头像换人也会打开选人。
  await evaluate("document.querySelector('.axis-member .axis-avatar').click()");
  await wait("document.querySelector('.axis-picker-item')");
  check('选人第一个是自定义角色，星神★阿哈带头像', await evaluate("document.querySelector('.axis-picker-item').textContent.includes('自定义角色') && !![...document.querySelectorAll('.axis-picker-item')].find(b=>b.textContent.includes('星神'))?.querySelector('img')"));
  await evaluate("[...document.querySelectorAll('.axis-picker button')].find(b=>b.textContent.trim()==='关闭')?.click()");
  await wait("!document.querySelector('.axis-picker')");
  check('轨道图已去掉', await evaluate("!document.querySelector('.axis-lanes')"));
  check('回放按钮已去掉', await evaluate("!document.querySelector('.axis-result-head button')"));
  // 点终结技卡：卡片里演一次大招，右边详情显示这一刻。
  // 挑一张有大招动画片段的（星神★阿哈还没有片段）。
  const ultWithClip = "[...document.querySelectorAll('.axis-card.is-ult')].filter(c=>c.querySelector('.axis-card-clip')).at(-1)";
  await evaluate(`${ultWithClip}.scrollIntoView({block:'center'})`);
  await evaluate(`${ultWithClip}.click()`);
  await wait("document.querySelector('.axis-card.is-ult.is-casting')");
  check('点终结技卡演一次大招', await evaluate("getComputedStyle(document.querySelector('.axis-card.is-ult.is-casting .axis-card-art')).animationName==='axis-splash-in'"));
  await wait("document.querySelector('.axis-card.is-ult.is-active.is-clip-playing')");
  await wait("(()=>{const v=document.querySelector('.axis-card.is-active .axis-card-clip');return !!v&&!v.paused&&v.loop&&v.currentTime>0&&v.videoWidth===336&&getComputedStyle(v).opacity==='1'})()");
  check('选中的终结技卡循环播放大招动画片段', true);
  await wait("document.querySelector('.axis-detail-side .axis-detail.is-ult')");
  check('点开的卡在右边显示详情', await evaluate("document.querySelector('.axis-detail-side .axis-detail-head strong').textContent.length>0"));
  check('选中的卡放大、详情弹出并衬淡立绘', await evaluate("(()=>{const c=document.querySelector('.axis-card.is-active');const d=document.querySelector('.axis-detail-side .axis-detail');return getComputedStyle(c).transform!=='none'&&getComputedStyle(d).animationName==='axis-detail-pop'&&!!d.querySelector('.axis-detail-art')&&d.querySelector('.axis-detail-head .axis-head').offsetWidth===56})()"));
  await sleep(300);
  await shot('ult-cast');
  await evaluate(`${ultWithClip}.click()`);
  await wait("!document.querySelector('.axis-card.is-clip-playing')");
  check('取消选中后片段停下、回到立绘', true);
  await evaluate("document.querySelector('.view').scrollTop=0");
  // 重新打开页面、恢复上次的队伍：不重播出轴动画。
  await sleep(600);
  await send('Page.reload');
  await wait("document.querySelectorAll('.axis-card').length>0");
  check('打开页面恢复队伍时不播出轴动画', await evaluate("!document.querySelector('.axis-moment.is-revealing') && !document.querySelector('.axis-card.is-casting')"));

  // 筛选和详情
  await evaluate("[...document.querySelectorAll('.axis-filters .axis-chip')].find(b=>b.textContent==='终结技').click()");
  await wait("document.querySelector('.axis-card.is-dim')");
  check('筛选终结技：其余卡调淡，终结技照常', await evaluate("(()=>{const on=[...document.querySelectorAll('.axis-card:not(.is-dim)')];return on.length>0&&on.every(e=>e.classList.contains('is-ult'))})()"));
  await evaluate("[...document.querySelectorAll('.axis-filters .axis-chip')].find(b=>b.textContent==='全部').click()");
  await wait("!document.querySelector('.axis-card.is-dim')");
  await evaluate("[...document.querySelectorAll('.axis-card.is-unit')].find(e=>e.querySelector('.axis-card-type')?.textContent==='战技').click()");
  await wait("document.querySelector('.axis-detail-side .axis-detail-row li')");
  check('点卡片看详细数据和逐动改动', await evaluate("[...document.querySelectorAll('.axis-detail-side .axis-detail-actions button')].some(b=>b.textContent.includes('改普攻'))"));
  await evaluate("document.querySelector('.axis-cycle-banner').click()");
  await wait("document.querySelector('.axis-cycle-rows').offsetHeight===0");
  check('轮次可以折叠', await evaluate("document.querySelector('.axis-cycle-banner').getAttribute('aria-expanded')==='false'"));
  await evaluate("document.querySelector('.axis-cycle-banner').click()");

  // 读取配装
  await evaluate(`${library}.querySelectorAll('.axis-library-presets .axis-chip')[3].click()`);
  await wait("[...document.querySelectorAll('.axis-member strong')][2]?.textContent==='爻光'");
  await evaluate("document.querySelectorAll('.axis-member')[2].querySelector('.ghost.small').click()");
  await wait("document.querySelectorAll('.axis-member')[2].querySelector('.axis-build .btn')");
  await evaluate("document.querySelectorAll('.axis-member')[2].querySelector('.axis-build .btn').click()");
  await wait(`document.querySelectorAll('.axis-member')[2].querySelector('.axis-member-stats b').textContent===${JSON.stringify(expected.speed.final.toFixed(1))}`);
  check('读取配装的速度和配速查询一致', true);

  // 队伍存档
  await evaluate(setValue(`${library}.querySelector('.axis-library-row input')`, 'UI验收队伍'));
  await evaluate(`${button(library, '另存')}.click()`);
  await wait(statusIs('已保存'));
  const teams = (await api('axis', 'library')).teams;
  savedTeam = Object.keys(teams).find(key => teams[key].name === 'UI验收队伍');
  check('队伍保存完整角色参数', teams[savedTeam].format === 'axis' && teams[savedTeam].team[2].err === 19.4 && teams[savedTeam].team[2].rotation === 'basic');
  // 移走一人再读队伍，确认读回的是存档。
  await evaluate("document.querySelector('.axis-member .axis-remove').click()");
  await wait("document.querySelectorAll('.axis-member').length===3");
  await evaluate(setValue(`${library}.querySelector('select')`, savedTeam, 'change'));
  await evaluate(`${button(library, '读取')}.click()`);
  await wait("document.querySelectorAll('.axis-member').length===4 && [...document.querySelectorAll('.axis-member strong')][0].textContent.includes('银狼')");
  check('队伍读取恢复精确参数', await evaluate(`document.querySelectorAll('.axis-member')[2].querySelector('.axis-member-stats b').textContent===${JSON.stringify(expected.speed.final.toFixed(1))}`));
  await evaluate(setValue(`${library}.querySelector('.axis-library-row input')`, '欢愉队 · 配装试算'));
  await evaluate(`${button(library, '覆盖')}.click()`);
  await wait(`${library}.querySelector('select').selectedOptions[0].textContent==='欢愉队 · 配装试算'`);
  check('覆盖已有队伍', (await api('axis', 'library')).teams[savedTeam].name === '欢愉队 · 配装试算');

  await evaluate(`${library}.querySelectorAll('.axis-library-presets .axis-chip')[0].click()`);
  await shot('desktop');
  for (const width of [1100, 820, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(200);
    check(`${width}px 页面完整呈现且无横向裁切`, await evaluate(`(()=>{const r=document.querySelector('.axis-timeline').getBoundingClientRect();const view=document.querySelector('.view');return r.left>=0&&r.right<=innerWidth+1&&(!view||view.scrollWidth<=view.clientWidth+1);})()`));
    // 手机上卡片不能挤：名字完整显示，带出的追击、欢愉技标签互不重叠（2026-11-04 用户反馈）
    if (width < 600) check(`${width}px 卡片名字完整、追击标签不重叠`, await evaluate(`(()=>{const names=[...document.querySelectorAll('.axis-card-body b')].filter(b=>b.offsetWidth);
      const cut=names.some(b=>b.scrollWidth>b.clientWidth+1);
      const overlap=[...document.querySelectorAll('.axis-card-follows')].some(f=>{const r=[...f.querySelectorAll('em')].map(e=>e.getBoundingClientRect());return r.some((a,i)=>r.some((b,j)=>i<j&&a.right>b.left+1&&b.right>a.left+1&&a.bottom>b.top+1&&b.bottom>a.top+1));});
      return names.length>0&&!cut&&!overlap;})()`));
    await shot(`width-${width}`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  await evaluate(`${button(library, '删除')}.click()`);
  await wait(statusIs('已删除'));
  savedTeam = null;
  check('删除队伍不影响角色配装', !!(await api('speed-plan', 'presets')).presets['1502']);
  await send('Page.navigate', { url: `${base}/?retired=1#/honkai-star-rail/aha-speed` });
  await wait("document.querySelector('.axis-page')");
  check('旧书签转到行动轴', await evaluate("location.hash==='#/honkai-star-rail/axis'"));
  check('无页面脚本错误', await evaluate('window.__errors.length===0'));
  console.log(`[OK] ${checks} checks`);
} finally {
  if (savedTeam) await api('axis', 'delete_team', { id: savedTeam });
  if (original) await api('speed-plan', 'save_preset', { characterId: '1502', ...original });
  else await api('speed-plan', 'delete_preset', { characterId: '1502' });
  ws.close();
}
