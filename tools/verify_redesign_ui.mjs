/** 侧栏交互验收；需独立服务与空白浏览器，服务使用临时 GT_USERDATA。 */
const [port = '8960', debug = '9437'] = process.argv.slice(2);
const base = `http://127.0.0.1:${port}`;
const targets = await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
const target = targets.find(t => t.type === 'page' && (t.url === 'about:blank' || t.url.startsWith(base)));
if (!target) throw Error('请先启动隔离浏览器的空白页');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map();
ws.onmessage = event => { const message = JSON.parse(event.data), p = pending.get(message.id); if (!p) return; pending.delete(message.id); message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result); };
function send(method, params = {}) { return new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text); return r.result.value; }
async function wait(expression) { for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 150)); } throw Error('等待失败: ' + expression); }
function check(label, value) { if (!value) throw Error('[X] ' + label); console.log('[OK] ' + label); }
try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const active = new Map(), add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
    window.__documentListeners = active;
    document.addEventListener = (type, fn, options) => { if (!active.has(type)) active.set(type, new Set()); active.get(type).add(fn); return add(type, fn, options); };
    document.removeEventListener = (type, fn, options) => { active.get(type)?.delete(fn); return remove(type, fn, options); };
  })();` });
  await send('Page.navigate', { url: `${base}/` });
  await wait("document.querySelectorAll('.nav-feature').length > 0");
  check('欢迎页和侧栏显示三位代码贡献者', await evaluate("['.home-credits', '.sidebar-credits'].every(s => { const e = document.querySelector(s); return e && e.querySelectorAll('a').length === 3 && !e.textContent.includes('Yukiookami'); })"));
  check('默认侧栏展开', await evaluate("!!document.querySelector('#sidebar-toggle') && document.querySelector('#sidebar-toggle').getAttribute('aria-expanded') === 'true'"));
  await evaluate("document.querySelector('#sidebar-toggle').click()");
  check('侧栏收起', await evaluate("document.querySelector('#app').classList.contains('sidebar-is-collapsed')"));
  await evaluate("document.querySelector('.nav-feature').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))");
  check('悬停显示对应名称', await evaluate("!document.querySelector('#sidebar-tip').hidden && document.querySelector('#sidebar-tip').textContent === document.querySelector('.nav-feature .name').textContent"));
  await evaluate("document.querySelector('.nav-feature[data-feature=\"speed-plan\"]').click()");
  await wait("!!document.querySelector('#view .sp')");
  check('收起时图标可跳转', await evaluate("!!document.querySelector('#view .sp')"));
  check('光锥与遗器位于角色卡内', await evaluate("['#lightcone-picker','#fourPiece-picker','#ornamentA-picker'].every(s=>document.querySelector('[data-step=char] '+s))"));
  check('计算目标位于结果栏上方', await evaluate("!!document.querySelector('.sp-right [data-step=target]')"));
  check('角色选择弹窗入口', await evaluate("!!document.querySelector('#select-character') && !!document.querySelector('#character-dialog')"));
  await evaluate("document.querySelector('#select-character').click()");
  check('角色弹窗打开', await evaluate("document.querySelector('#character-dialog').open"));
  check('角色选择头像清晰显示并使用圆角', await evaluate("(()=>{const i=document.querySelector('#character-dialog [data-char=\"1502\"] img');return i && i.getAttribute('src').includes('/modules/honkai-star-rail/assets/') && getComputedStyle(i).maskImage==='none' && getComputedStyle(i).borderRadius==='12px';})()"));
  check('角色搜索框聚焦无描边', await evaluate("(()=>{const i=document.querySelector('#char-search');const p=document.querySelector('.sp-dialog-search');return document.activeElement===i && getComputedStyle(i).outlineStyle==='none' && getComputedStyle(i).boxShadow==='none' && getComputedStyle(p).boxShadow==='none';})()"));
  await evaluate("document.querySelector('#character-dialog [data-char=\"1502\"]').click()");
  await wait("!document.querySelector('#character-dialog').open");
  check('选择角色后关闭弹窗', await evaluate("!document.querySelector('#character-dialog').open"));
  await wait("document.querySelector('#splash-meta')?.textContent.includes('爻光')");
  // 配速在浏览器里算（speed-ui/src/calc.ts），不再走后端：等结论区出现数字。
  await wait("/^\\d+\\.\\d$/.test(document.querySelector('#hero-current').textContent)");
  // 数字会滚动到新值（约 0.3 秒），等滚完再记原值。
  await new Promise(r => setTimeout(r, 600));
  check('选择角色后更新立绘与结果', await evaluate("document.querySelector('#splash').getAttribute('src') && document.querySelector('#hero-current').textContent !== '—'"));
  const before = await evaluate("document.querySelector('#hero-current').textContent");
  const start = Number(await evaluate("document.querySelector('#substat').value"));
  await evaluate("document.querySelector('[data-step-for=substat][data-dir=\"1\"]').click()");
  await wait(`Number(document.querySelector('#substat').value)===${start + 1} && document.querySelector('#hero-current').textContent!==${JSON.stringify(before)}`);
  check('数字框加减会更新输入与结果', true);
  await evaluate("document.querySelector('[data-step-for=substat][data-dir=\"-1\"]').click()");
  await wait(`document.querySelector('#hero-current').textContent===${JSON.stringify(before)}`);
  check('减回原值后结果复原', true);
  await evaluate("document.querySelector('#select-character').click(); document.querySelector('#character-dialog [data-char=\"1503\"]').click()");
  await wait("document.querySelector('.sp').dataset.theme==='pearl'");
  check('真珠使用珍珠配色，侧栏仍为粉色', await evaluate("getComputedStyle(document.querySelector('.sp')).getPropertyValue('--accent').trim()==='#54788f' && getComputedStyle(document.querySelector('#sidebar')).getPropertyValue('--accent').trim()!=='#54788f'"));
  await evaluate("document.querySelector('#select-character').click(); document.querySelector('#character-dialog [data-char=\"1502\"]').click()");
  await wait("document.querySelector('.sp').dataset.theme==='teal'");
  check('爻光使用青蓝配色', true);
  await evaluate("document.querySelector('#select-character').click(); document.querySelector('#cancel-character').click(); document.querySelector('#select-character').click()");
  check('关闭动画中重新打开弹窗不报错', await evaluate("document.querySelector('#character-dialog').open && !document.querySelector('#character-dialog').classList.contains('is-closing')"));
  await evaluate("document.querySelector('#cancel-character').click()");
  await wait("!document.querySelector('#character-dialog').open");
  check('取消后弹窗播完动画关闭', true);
  await evaluate("document.querySelector('#select-character').click(); document.querySelector('#character-dialog [data-char=\"1513\"]').click()");
  await wait("document.querySelector('.sp').dataset.theme==='gold' && document.querySelector('[data-effect^=cone]') && !document.querySelector('#character-dialog').open");
  const coneRow = () => evaluate("document.querySelector('[data-effect^=cone]').closest('.effect-row').querySelector('.effect-origin').textContent");
  const pickCone = name => evaluate(`document.querySelector('#lightcone-picker').click(); [...document.querySelectorAll('.picker-popup:not(.hidden) .picker-item')].find(o=>o.textContent.includes(${JSON.stringify(name)})).click()`);
  await pickCone('向浪花');
  await wait(`document.querySelector('[data-effect^=cone]').closest('.effect-row').querySelector('.effect-origin').textContent.includes('向浪花')`);
  await pickCone('当她决定看见');
  await wait(`document.querySelector('[data-effect^=cone]').closest('.effect-row').querySelector('.effect-origin').textContent.includes('当她决定看见')`);
  check(`换光锥后效果列表跟着换（${await coneRow()}）`, true);
  await evaluate("document.querySelector('#sidebar-toggle').click()");
  check('可重新展开', await evaluate("!document.querySelector('#app').classList.contains('sidebar-is-collapsed')"));
  await evaluate("document.querySelector('.nav-module-title').click()");
  await wait("document.querySelector('.nav-items').offsetHeight===0 && getComputedStyle(document.querySelector('.nav-items')).visibility==='hidden'");
  check('侧栏模块收起后不占高度、键盘进不去', true);
  await evaluate("document.querySelector('#sidebar-toggle').click()");
  await wait("document.querySelector('.nav-items').offsetHeight>0 && getComputedStyle(document.querySelector('.nav-items')).visibility==='visible'");
  check('侧栏收窄时，折叠的模块也露出图标', true);
  await evaluate("document.querySelector('#sidebar-toggle').click(); document.querySelector('.nav-module-title').click()");
  await wait("document.querySelector('.nav-items').offsetHeight>0");
  await evaluate("document.querySelector('#home-button').click()");
  await wait("!!document.querySelector('.welcome')");
  const beforeListeners = await evaluate("['click','keydown'].map(type=>window.__documentListeners.get(type)?.size || 0)");
  for (let i = 0; i < 3; i++) {
    await evaluate("document.querySelector('.nav-feature[data-feature=\"speed-plan\"]').click()");
    await wait("document.querySelector('#hero-current')?.textContent !== '—' && !document.querySelector('.gt-feature-root.is-loading')");
    await evaluate("document.querySelector('#home-button').click()");
    await wait("!!document.querySelector('.welcome')");
  }
  check('反复切换后页面监听不会累积', await evaluate(`JSON.stringify(['click','keydown'].map(type=>window.__documentListeners.get(type)?.size || 0)) === ${JSON.stringify(JSON.stringify(beforeListeners))}`));
  await evaluate("document.querySelector('.nav-feature[data-feature=\"gacha\"]').click()");
  await wait("!!document.querySelector('.gacha-layout') && !document.querySelector('.gt-feature-root.is-loading')");
  for (const width of [1100, 820, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, 200));
    check(`${width}px 抽卡页面布局无横向裁切`, await evaluate("(()=>{const r=document.querySelector('.gacha-layout').getBoundingClientRect();const view=document.querySelector('.view');return r.left>=0 && r.right<=innerWidth+1 && view.scrollWidth<=view.clientWidth+1;})()"));
  }
  await evaluate("document.querySelector('#home-button').click()");
  // 侧栏统一管理：同一个窗口宽度下，换到哪一页侧栏都一样宽（以前抽卡规划自己一套阈值，870 宽时比别的页宽 80px）
  for (const width of [1300, 1000, 870, 700]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
    const widths = [];
    for (const feature of ['roster', 'speed-plan', 'axis', 'gacha', 'records']) {
      await evaluate(`document.querySelector('.nav-feature[data-feature="${feature}"]').click()`);
      await wait("!document.querySelector('.gt-feature-root.is-loading') && document.querySelector('.gt-feature-root')?.children.length > 0");
      await new Promise(r => setTimeout(r, 350));
      widths.push(await evaluate("Math.round(document.querySelector('#sidebar').getBoundingClientRect().width)"));
    }
    check(`${width}px 五个页面侧栏一样宽（${widths.join(" / ")}）`, widths.every(w => w === widths[0]));
  }
  await send('Emulation.clearDeviceMetricsOverride');
  // B站 Toy 的窗口比 1100 窄：每一页（包括没声明紧凑侧栏的）都不能被裁掉右边，侧栏底部的按钮和署名也不能被裁。
  const fits = `(()=>{const main=document.querySelector('#main').getBoundingClientRect();const sb=document.querySelector('#sidebar').getBoundingClientRect();
    const cut=[...document.querySelectorAll('#sidebar *')].some(e=>{const b=e.getBoundingClientRect();return b.width>0&&getComputedStyle(e).visibility!=='hidden'&&b.right>sb.right+1;});
    const wrapped=[...document.querySelectorAll('.sidebar-backup button')].some(b=>b.offsetWidth&&b.offsetHeight>40);
    // 手机（760 及以下）：侧栏是贴在底部、占满宽度的标签栏，功能名写在图标下面
    const narrowRail=innerWidth>760||(Math.abs(sb.width-innerWidth)<2&&sb.bottom>=innerHeight-1&&sb.height<=80&&[...document.querySelectorAll('.nav-feature .name')].every(n=>n.offsetWidth>0));
    return main.right<=innerWidth+1 && document.querySelector('#app').getBoundingClientRect().width<=innerWidth+1 && !cut && !wrapped && narrowRail;})()`;
  for (const width of [1000, 870, 600, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
    for (const feature of ['', 'roster', 'speed-plan', 'axis', 'gacha', 'records']) {
      if (feature) {
        await evaluate(`document.querySelector('.nav-feature[data-feature="${feature}"]').click()`);
        await wait("!document.querySelector('.gt-feature-root.is-loading') && document.querySelector('.gt-feature-root')?.children.length > 0");
      } else {
        await evaluate("document.querySelector('#home-button').click()");
        await wait("!!document.querySelector('.welcome')");
      }
      await new Promise(r => setTimeout(r, 300));
      check(`${width}px ${feature || '首页'}完整显示，侧栏不裁切`, await evaluate(fits));
    }
  }
  // 手机底部标签栏的「更多」：首页、导出导入存档都在里面，点外面、按 Esc、选功能都会收起。
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 800, deviceScaleFactor: 1, mobile: true });
  await new Promise(r => setTimeout(r, 300));
  await evaluate("document.querySelector('#more-button').click()");
  check('手机：「更多」打开面板，首页和存档按钮都在屏幕里', await evaluate(`(()=>{const s=document.querySelector('#more-sheet').getBoundingClientRect();const inView=e=>{const b=e.getBoundingClientRect();return b.width>0&&b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight;};
    return document.querySelector('#app').classList.contains('more-open')&&s.height>0&&['#home-sheet-button','#export-saves','#import-saves'].every(q=>inView(document.querySelector(q)))&&document.body.scrollLeft===0;})()`));
  await evaluate("document.querySelector('#view').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  check('手机：点面板外面收起', await evaluate("!document.querySelector('#app').classList.contains('more-open') && document.querySelector('#more-button').getAttribute('aria-expanded')==='false'"));
  await evaluate("document.querySelector('#more-button').click(); document.querySelector('#home-sheet-button').click()");
  await wait("!!document.querySelector('.welcome')");
  check('手机：面板里的「首页」回到欢迎页并收起面板', await evaluate("!document.querySelector('#app').classList.contains('more-open')"));
  await evaluate("document.querySelector('.nav-feature[data-feature=\"records\"]').click()");
  await wait("!document.querySelector('.gt-feature-root.is-loading') && document.querySelector('.gt-feature-root')?.children.length > 0");
  check('手机：点标签栏换功能，当前功能高亮、顶栏写全名', await evaluate("document.querySelector('.nav-feature.active')?.dataset.feature==='records' && document.querySelector('.crumb-title')?.textContent==='角色顶分' && !document.querySelector('#sidebar-toggle').offsetWidth"));
  // B站 App 里（index.html 按 User-Agent 加 in-bili-app）：顶部留出 App 悬浮按钮的位置，内容从下面开始
  await evaluate("document.documentElement.classList.add('in-bili-app','bili-overlay')");
  check('手机：B站 App 里顶部留出约 90px 给 App 的按钮', await evaluate("document.querySelector('#topbar').getBoundingClientRect().height>=90 && document.querySelector('#view').getBoundingClientRect().top>=90"));
  await evaluate("document.documentElement.classList.remove('bili-overlay')");
  check('手机：B站 App 自己留了顶栏时不多空一条', await evaluate("document.querySelector('#topbar').getBoundingClientRect().height<70 && !!document.querySelector('.crumb-title')?.offsetWidth"));
  await evaluate("document.documentElement.classList.remove('in-bili-app')");
  // 手机：配速查询角色卡一屏内看得到立绘、名字和星魂；选角色弹窗一行 3 个
  await evaluate("document.querySelector('.nav-feature[data-feature=\"speed-plan\"]').click()");
  await wait("!!document.querySelector('#view .sp') && !document.querySelector('.gt-feature-root.is-loading')");
  await new Promise(r => setTimeout(r, 300));
  check('手机：配速查询的立绘、名字、星魂都在第一屏', await evaluate("['#portrait','.sp-char-title','#eidolon'].every(q=>{const b=document.querySelector(q).getBoundingClientRect();return b.width>0&&b.bottom<=innerHeight-60;})"));
  await evaluate("document.querySelector('#select-character').click()");
  await wait("document.querySelector('#character-dialog').open");
  check('手机：选角色弹窗一行 3 个', await evaluate("getComputedStyle(document.querySelector('#char-grid')).gridTemplateColumns.split(' ').length===3"));
  // 效果名字很长的角色（吉尔伽美什「尽情取悦本王吧」）：以前效果行把页面撑宽、能被横着滑走（2026-11-04 用户截图）
  await evaluate("document.querySelector('#char-grid [data-char=\"1509\"]').click()");
  await wait("document.querySelector('.sp-char-title')?.textContent==='吉尔伽美什' && !document.querySelector('#character-dialog').open");
  await new Promise(r => setTimeout(r, 1200));
  check('手机：效果名字长的角色页面也不会被撑宽', await evaluate("(()=>{const v=document.querySelector('#view');return v.scrollWidth<=v.clientWidth+1;})()"));
  check('手机：结果页签名字完整', await evaluate("[...document.querySelectorAll('.sp-tabs .tab')].every(t=>t.scrollWidth<=t.clientWidth+1)"));
  await evaluate("document.querySelector('.sp-tabs .tab[data-tab=\"timeline\"]').click()");
  await wait("document.querySelectorAll('.sp-tl-active').length>0");
  check('手机：行动时间轴的效果说明占满一行，不挤成竖条', await evaluate("[...document.querySelectorAll('.sp-tl-active')].every(e=>e.getBoundingClientRect().width>200)"));
  await evaluate("document.querySelector('.sp-tabs .tab[data-tab=\"detail\"]').click()");

  // 窄窗口里收起侧栏：侧栏要真的变窄（以前配速查询这类页面收起后还是 170 宽），顶栏的功能名不能被挤掉。
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 1, mobile: false });
  await evaluate("document.querySelector('#app').classList.contains('sidebar-is-collapsed') || document.querySelector('#sidebar-toggle').click()");
  for (const feature of ['roster', 'speed-plan', 'axis', 'gacha', 'records']) {
    await evaluate(`document.querySelector('.nav-feature[data-feature="${feature}"]').click()`);
    await wait("!document.querySelector('.gt-feature-root.is-loading') && document.querySelector('.gt-feature-root')?.children.length > 0");
    await new Promise(r => setTimeout(r, 400));
    check(`900px 收起侧栏：${feature} 侧栏变窄、标题完整`, await evaluate("(()=>{const t=document.querySelector('.crumb-title');return document.querySelector('#sidebar').getBoundingClientRect().width<=80 && t && t.clientWidth>0 && t.scrollWidth<=t.clientWidth+1;})()"));
  }
  await evaluate("document.querySelector('#sidebar-toggle').click()");
  await send('Emulation.clearDeviceMetricsOverride');
} finally { ws.close(); }
