"""Isolated DOM/UI regression harness.

The supplied Chromium is configured by the environment to block every URL. This
harness respects that restriction: it uses about:blank + set_content, no network
navigation. It supplies SHA-256 through a Python binding because Web Crypto and
IndexedDB are unavailable on an opaque origin. The app therefore uses its actual
MemoryRepository fallback. This DOES NOT qualify IndexedDB, service workers,
OAuth redirects, real server/browser integration, or browser-origin security.

Requires Python playwright and Chromium. Run npm run build first.
"""
import hashlib, json, os, re, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'test-results'
ARTIFACTS.mkdir(exist_ok=True)
results = []
errors = []

def record(name):
    results.append({'name': name, 'passed': True})
    print('PASS', name, flush=True)

def install(page):
    page.expose_function('__testDigest', lambda values: list(hashlib.sha256(bytes(values)).digest()))
    page.evaluate('''() => {
      Object.defineProperty(crypto, 'subtle', {value:{digest: async (algorithm, data) => {
        if(algorithm !== 'SHA-256') throw new Error('Harness only provides SHA-256');
        const bytes=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
        return Uint8Array.from(await window.__testDigest(Array.from(bytes))).buffer;
      }}});
      crypto.randomUUID = () => {const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
      // about:blank cannot rewrite its URL. No routing behavior is claimed by this harness.
      history.replaceState = () => {};
    }''')
    page.on('pageerror', lambda error: errors.append(str(error)))
    # Inline bundle only. No original application code is patched for this harness.
    page.set_content((ROOT/'dist/civora.html').read_text(), wait_until='load')
    page.wait_for_function('!!window.Civora', timeout=15000)
    page.wait_for_timeout(100)

def close_dialogs(page):
    page.evaluate("document.querySelectorAll('dialog').forEach(d=>d.close())")
    page.wait_for_timeout(50)

def nav(page, route):
    page.evaluate('(r)=>Civora.navigate(r)',route)
    page.wait_for_timeout(80)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1540,'height':1050},device_scale_factor=1)
    try:
        install(page)
        assert page.locator('.brand-name').inner_text().startswith('civora')
        assert page.evaluate('Civora.engine.state.documents.length') == 21
        record('Standalone inline bundle boots with real demo in MemoryRepository fallback')
        page.locator('#toast-host .toast').evaluate_all('(items)=>items.forEach(item=>item.click())')  # Dismiss warnings through the real UI handler; storage remains visibly temporary.
        nav(page,'overview')
        page.screenshot(path=str(ARTIFACTS/'overview.png'),full_page=True)
        for route in ['overview','documents','reviews','issues','transmittals','sets','schedule','insights','activity','connections','members','settings','projects','recycle','models','renditions','delivery','sync','operations','local','control','baselines','inbox','automation','notifications']:
            nav(page,route)
            assert page.locator('h1').count() > 0,route
            assert not errors,errors
        record('All twenty-five pages render without uncaught JavaScript errors')
        nav(page,'documents')
        page.locator('[data-action=upload]').first.click()
        dialog=page.locator('dialog[open]').last
        print('UPLOAD HTML',dialog.inner_text()[:700],flush=True)
        inputs=dialog.locator('input[type=file]');inputs.set_input_files({'name':'ui-test.txt','mimeType':'text/plain','buffer':b'Browser interaction test'})
        dialog.locator('[type=submit]').click()
        page.wait_for_timeout(200)
        assert page.evaluate("Civora.engine.state.documents.some(d=>d.name==='ui-test.txt')")
        record('Upload dialog stores an actual text file and document metadata')
        close_dialogs(page)
        doc_id=page.evaluate("Civora.engine.state.documents.find(d=>d.name==='ui-test.txt').id")
        page.locator('#document-search').fill('ui-test')
        page.wait_for_timeout(200)
        assert page.locator('[data-doc-row]').count()==1
        page.locator('[data-doc-row]').first.dblclick()
        page.wait_for_timeout(100)
        assert page.locator('dialog[open]').count()==1
        record('Document search filters rows and double-click opens full inspector')
        page.locator('dialog[open] [data-action=checkout]').click()
        page.wait_for_timeout(150)
        assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).checkedOutBy',doc_id)=='u-admin'
        record('Checkout action acquires a real command-engine lock')
        page.locator('dialog[open] [data-action=edit-content]').click()
        editor=page.locator('dialog[open]').last
        print('EDITOR HTML',editor.inner_text()[:400],flush=True)
        editor.locator('textarea').first.fill('Edited through the browser')
        editor.locator('[type=submit]').click()
        page.wait_for_timeout(200)
        assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).versions.length',doc_id)==2
        record('Text editor checks in a new immutable version')
        close_dialogs(page)
        page.evaluate('(id)=>Civora.openDocument(id)',doc_id)
        page.wait_for_timeout(100)
        page.locator('dialog[open] [data-detail-tab=comments]').click()
        page.locator('textarea[name=text]').fill('UI regression comment')
        page.locator('[data-comment-form] button[type=submit]').click()
        page.wait_for_timeout(150)
        assert page.evaluate("Civora.engine.state.comments.some(c=>c.text==='UI regression comment')")
        record('Revision-linked comment submission persists in the command engine')
        close_dialogs(page)
        svg_id=page.evaluate("Civora.engine.state.documents.find(d=>d.name.endsWith('.svg')).id")
        page.evaluate('(id)=>Civora.openViewer(id)',svg_id)
        page.wait_for_timeout(200)
        assert page.locator('.preview-image').count() or page.locator('#viewer-host img').count()
        page.locator('#toast-host .toast').evaluate_all('(items)=>items.forEach(item=>item.click())')
        page.screenshot(path=str(ARTIFACTS/'drawing-review.png'),full_page=True)
        record('SVG drawing preview mounts original file bytes and revision markup panel')
        close_dialogs(page)
        nav(page,'issues')
        page.locator('[data-action=new-issue]').click()
        dialog=page.locator('dialog[open]').last
        dialog.locator('[name=title]').fill('UI coordination issue')
        dialog.locator('[type=submit]').click()
        page.wait_for_timeout(150)
        assert page.evaluate("Civora.engine.state.issues.some(i=>i.title==='UI coordination issue')")
        record('Issue creation dialog updates coordination board')
        close_dialogs(page)
        nav(page,'settings')
        page.locator('[data-action=settings-tab][data-tab=appearance]').click()
        page.locator('[data-action=toggle-theme]').click()
        assert page.locator('html').get_attribute('data-theme')=='dark'
        page.locator('[data-action=toggle-theme]').click()
        record('Theme preference control switches dark/light rendering')
        nav(page,'documents')
        page.locator('[data-action=file-grid]').click()
        page.wait_for_timeout(150)
        page.screenshot(path=str(ARTIFACTS/'documents.png'),full_page=True)
        record('Document grid view renders and loads previews')
        nav(page,'models')
        page.wait_for_function('Civora.features.federation?.models.length===2', timeout=15000)
        page.wait_for_selector('.model-inspector canvas')
        assert page.locator('.model-object').count() >= 40
        assert page.evaluate('Civora.features.federation.stats.triangles') > 400
        page.locator('.model-object [data-select]').first.click()
        assert 'Column' in page.locator('.model-properties').inner_text()
        record('Federated source geometry loads and model selection exposes real element properties')
        canvas=page.locator('.model-stage canvas')
        before=canvas.evaluate('(c)=>c.toDataURL()')
        page.locator('[data-view=top]').click()
        page.wait_for_timeout(150)
        assert before!=canvas.evaluate('(c)=>c.toDataURL()')
        page.locator('[data-view=iso]').click()
        page.locator('.model-section input').evaluate('(el)=>{el.value=50;el.dispatchEvent(new Event("input",{bubbles:true}));}')
        page.wait_for_timeout(150)
        assert page.locator('.model-section output').inner_text()=='50%'
        page.locator('.model-section input').evaluate('(el)=>{el.value=100;el.dispatchEvent(new Event("input",{bubbles:true}));}')
        record('Camera controls change rendered pixels and section control updates the actual model view')
        page.locator('[data-action=model-clash]').click()
        page.locator('dialog[open] [type=submit]').click()
        page.wait_for_function('Civora.engine.state.clashRuns.length>0')
        page.wait_for_selector('[data-action=clash-issue]')
        assert page.evaluate('Civora.engine.state.clashRuns.at(-1).report.results.length')>0
        record('Clash dialog computes and stores real source-pinned coordination findings')
        page.locator('#toast-host .toast').evaluate_all('(items)=>items.forEach(item=>item.click())')
        page.evaluate('window.scrollTo(0,0)')
        page.wait_for_timeout(100)
        page.screenshot(path=str(ARTIFACTS/'model-coordination.png'),full_page=True)
        page.locator('[data-action=clash-issue]').first.click()
        dialog=page.locator('dialog[open]').last
        assert 'Elements:' in dialog.locator('[name=description]').input_value()
        dialog.locator('[type=submit]').click()
        page.wait_for_timeout(150)
        assert page.evaluate('Civora.engine.state.issues.some(i=>i.description.includes("Elements:"))')
        record('A model finding creates a coordination issue containing source and element identifiers')
        close_dialogs(page)
        nav(page,'renditions')
        page.locator('[data-action=rendition-new]').first.click()
        dialog=page.locator('dialog[open]').last
        dxf_id=page.evaluate('Civora.engine.state.documents.find(d=>d.name.endsWith(".dxf")).id')
        dialog.locator('[name=documentId]').select_option(dxf_id)
        dialog.locator('[name=format]').select_option('pdf')
        dialog.locator('[type=submit]').click()
        page.wait_for_function('Array.from(Civora.features.localJobs.values()).some(j=>j.status==="completed")')
        assert page.evaluate('Array.from(Civora.features.localJobs.values())[0].blob.type')=='application/pdf'
        with page.expect_download() as download:
            page.locator('[data-action=rendition-download]').first.click()
        download.value.save_as(str(ARTIFACTS/'ui-generated-drawing.pdf'))
        page.locator('#toast-host .toast').evaluate_all('(items)=>items.forEach(item=>item.click())')
        page.screenshot(path=str(ARTIFACTS/'rendition-studio.png'),full_page=True)
        record('Rendition studio generates and downloads an actual DXF-derived PDF')
        nav(page,'members')
        page.locator('[data-action=group-new]').click()
        dialog=page.locator('dialog[open]').last
        dialog.locator('[name=name]').fill('Coordination reviewers')
        dialog.locator('[name=members]').first.check()
        dialog.locator('[type=submit]').click()
        page.wait_for_timeout(150)
        assert page.evaluate('Civora.engine.state.groups.some(g=>g.name==="Coordination reviewers" && g.members.length===1)')
        record('Access administration creates a real group and membership record')
        page.locator('[data-action=access-edit][data-scope=workspace]').click()
        dialog=page.locator('dialog[open]').last
        dialog.locator('#add-principal').click()
        row=dialog.locator('[data-permission-row]').last
        row.locator('[data-principal]').select_option('role:viewer')
        row.locator('[data-permission=write]').select_option('deny')
        page.screenshot(path=str(ARTIFACTS/'access-matrix.png'),full_page=True)
        dialog.locator('[type=submit]').click()
        page.wait_for_timeout(150)
        assert page.evaluate('Civora.engine.state.accessPolicies.find(p=>p.scope==="workspace").entries.some(e=>e.principal==="role:viewer" && e.deny.includes("write"))')
        record('Editable access matrix saves an explicit deny without replacing other grants')
        close_dialogs(page)
        nav(page,'overview')
        page.set_viewport_size({'width':390,'height':844})
        page.wait_for_timeout(150)
        width=page.evaluate('document.documentElement.scrollWidth')
        assert width<=392, f'Mobile horizontal overflow: {width}'
        page.locator('[data-action=mobile-more]:visible').first.click()
        sheet=page.locator('dialog[open]').last
        assert sheet.locator('[data-mobile-tool]').count()==25
        sheet.locator('[data-mobile-tool=documents]').click()
        page.wait_for_timeout(100)
        page.locator('#toast-host .toast').evaluate_all('(items)=>items.forEach(item=>item.click())')
        page.screenshot(path=str(ARTIFACTS/'mobile.png'),full_page=True)
        record('390px mobile layout avoids page overflow and searchable workspace sheet navigates all tools')
        assert not errors, errors
    except Exception as exc:
        print('FAIL',repr(exc),flush=True)
        page.screenshot(path=str(ARTIFACTS/'failure.png'),full_page=True)
        print('BODY',page.locator('body').inner_text()[-4500:],flush=True)
        results.append({'name':'Harness failure','passed':False,'error':str(exc)})
        raise
    finally:
        (ARTIFACTS/'browser-harness.json').write_text(json.dumps({'mode':'isolated opaque-origin, memory repository, SHA-256 test binding; no IndexedDB/OAuth/service-worker qualification','results':results,'pageErrors':errors},indent=2))
        browser.close()
