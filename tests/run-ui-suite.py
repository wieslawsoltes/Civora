"""Run all retained and new UI suites; each child declares its fixture limits."""
import json,subprocess,sys,os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results'/'0.10.0';OUT.mkdir(exist_ok=True)
SUITES=['browser-harness','document-control-ui','local-ui-harness','portal-harness','automation-ui','automation-transport-ui','explorer-ui','explorer-transport-ui','mobile-touch-ui','model-touch-ui','explorer-design-ui','interface-consistency-ui','refinement-ui','refinement-transport-ui','revision-workbench-ui','workbench-races-ui']
def run(name):
 with (OUT/(name+'.log')).open('w') as log:
  result=subprocess.run([sys.executable,str(ROOT/'tests'/(name+'.py'))],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,timeout=240)
 text=(OUT/(name+'.log')).read_text();passes=sum(line.startswith('PASS') for line in text.splitlines())
 print(name,result.returncode,passes,flush=True)
 return {'suite':name,'exitCode':result.returncode,'checks':passes}
with ThreadPoolExecutor(max_workers=max(1,min(3,int(os.environ.get("CIVORA_UI_WORKERS","1"))))) as pool:results=list(pool.map(run,SUITES))
(OUT/'ui-suite-summary.json').write_text(json.dumps({'version':'0.10.0','results':results},indent=2))
sys.exit(any(r['exitCode'] for r in results))
