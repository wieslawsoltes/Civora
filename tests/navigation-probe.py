"""Record real-origin availability without bypassing browser policy.
An unavailable navigation is a qualification gap, not a product test pass.
"""
import datetime,json,os,subprocess,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
server=subprocess.Popen(['node','--input-type=module','-e',"import{createServer}from'node:http';import{serveStatic}from'./scripts/static.mjs';const s=createServer((q,r)=>serveStatic(q,r));s.listen(0,'127.0.0.1',()=>console.log(s.address().port));"],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
report={'version':json.loads((ROOT/'package.json').read_text())['version'],'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'restrictionChanged':False}
try:
 port=int(server.stdout.readline().strip());url=f'http://127.0.0.1:{port}/';report['url']=url
 with urllib.request.urlopen(url,timeout=8) as response:report['httpStatus']=response.status
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);page=browser.new_page()
  try:
   response=page.goto(url,wait_until='domcontentloaded',timeout=15000);report['navigationStatus']=response.status if response else None
  except Exception as e:report['navigationError']=str(e)
  report['currentURL']=page.url
  page.close();page=browser.new_page();page.set_content('<main id="probe">Isolated document probe</main>');report['isolatedDocumentWorks']=page.locator('#probe').inner_text()=='Isolated document probe';report['isolatedURL']=page.url;browser.close()
finally:
 server.terminate()
 try:server.wait(timeout=5)
 except subprocess.TimeoutExpired:server.kill();server.wait()
 (OUT/'navigation-probe.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
