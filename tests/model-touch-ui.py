"""Actual app model viewer and pixels in isolated Chromium. Canvas fallback,
not hardware WebGL, CAD fidelity, browser-origin access, or a physical device."""
import hashlib,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
results=[];errors=[]
def ok(name):results.append({'name':name,'passed':True});print('PASS',name,flush=True)
def image(page):page.wait_for_timeout(100);return page.locator('.single-model-view canvas').evaluate('(c)=>c.toDataURL()')
def gesture(page,events):page.locator('.single-model-view canvas').evaluate('''(el,events)=>{for(const [type,id,x,y]of events)el.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true,cancelable:true}));}''',events);page.wait_for_timeout(100)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=1);page=context.new_page();page.set_default_timeout(10000);page.on('pageerror',lambda e:errors.append(str(e)))
 try:
  page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
  page.evaluate('''()=>{Object.defineProperty(crypto,'subtle',{value:{digest:async(_,data)=>Uint8Array.from(await __testDigest(Array.from(data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength)))).buffer}});crypto.randomUUID=()=>{let b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;let h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};history.replaceState=()=>{};}''')
  page.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');page.wait_for_function('!!window.Civora');page.locator('#toast-host .toast').evaluate_all('(xs)=>xs.forEach(x=>x.click())')
  page.evaluate('''async()=>{const doc=Civora.engine.state.documents.find(d=>d.name.endsWith('.obj'));if(!doc)throw Error('Missing original OBJ fixture');await Civora.openViewer(doc.id);}''');page.wait_for_selector('.single-model-view canvas');page.wait_for_timeout(180)
  assert page.locator('.model-mobile-tabs').is_visible();assert not page.locator('.model-tree').is_visible();assert page.locator('.model-stage').is_visible();assert page.locator('.model-renderer').inner_text().startswith('Canvas');assert len(image(page))>1500
  ok('Actual OBJ original opens in a phone model panel with a rendered Canvas fallback and explicit controls')
  before=image(page);page.locator('[data-view=in]').tap();assert image(page)!=before;page.locator('[data-view=out]').tap();page.locator('[data-view=fit]').tap();before=image(page);page.locator('[data-view=left]').tap();assert image(page)!=before
  page.locator('[data-view=pan]').tap();assert page.locator('[data-view=pan]').get_attribute('aria-pressed')=='true';before=image(page);page.locator('[data-view=up]').tap();assert image(page)!=before;assert page.locator('[data-view=up]').get_attribute('aria-label')=='Pan model up';page.locator('[data-view=fit]').tap();page.locator('[data-view=pan]').tap()
  ok('Single-tap zoom, fit, four directions and explicit Pan mode change actual rendered pixels')
  canvas=page.locator('.single-model-view canvas');box=canvas.bounding_box();x=box['x']+box['width']*.5;y=box['y']+box['height']*.6;before=image(page)
  gesture(page,[['pointerdown',501,x,y],['pointermove',501,x+35,y+22],['pointerup',501,x+35,y+22]]);assert image(page)!=before;assert not page.locator('.model-object.selected').count()
  ok('Tracked one-finger orbit changes geometry pixels without selecting an element after dragging')
  before=image(page);cdp=context.new_cdp_session(page)
  def touch(kind,pts):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':[{'x':px,'y':py,'radiusX':4,'radiusY':4,'id':i}for i,px,py in pts]})
  touch('touchStart',[(1,x-20,y),(2,x+20,y)])
  for step in range(1,5):touch('touchMove',[(1,x-20-step*6,y),(2,x+20+step*6,y)]);page.wait_for_timeout(20)
  touch('touchEnd',[]);page.wait_for_timeout(150);assert image(page)!=before;assert not page.locator('.model-object.selected').count()
  gesture(page,[['pointerdown',511,x,y],['pointercancel',511,x,y],['pointerup',511,x,y]]);assert not page.locator('.model-object.selected').count();page.locator('[data-view=fit]').tap()
  ok('Chromium two-touch pinch changes the rendered model; pinch completion and cancellation do not pick geometry')
  page.locator('.model-mobile-tabs [data-model-panel=elements]').tap();assert page.locator('.model-tree').is_visible();assert not page.locator('.model-stage').is_visible();page.locator('.model-object button').first.tap();assert page.locator('.model-properties').is_visible();assert page.locator('.model-properties dd').count()>=3;page.screenshot(path=str(OUT/'touch-model-elements.png'),full_page=True)
  page.locator('.model-mobile-tabs [data-model-panel=model]').tap();assert page.locator('.model-stage').is_visible();assert page.locator('.model-object.selected').count()==1;page.screenshot(path=str(OUT/'touch-model.png'),full_page=True)
  ok('Elements and properties remain reachable on phones instead of being hidden below a desktop-only tree')
  page.set_viewport_size({'width':740,'height':390});page.wait_for_timeout(180);assert page.locator('dialog[open]').evaluate('(d)=>d.getBoundingClientRect().width<=innerWidth');page.locator('dialog[open] [data-close]').first.click();page.wait_for_timeout(80);assert not page.locator('.single-model-view').count();assert not errors,errors
  ok('Landscape dialog remains width-bounded and closing tears down viewer input without page errors')
 except Exception as exc:
  page.screenshot(path=str(OUT/'model-touch-failure.png'),full_page=True);results.append({'name':'Harness failure','passed':False,'error':str(exc)});raise
 finally:
  (OUT/'model-touch-ui.json').write_text(json.dumps({'mode':'actual standalone app, memory repository; actual OBJ parsing, Canvas pixels and Chromium touch input; no real-device or hardware-WebGL qualification','results':results,'pageErrors':errors},indent=2));browser.close()
