// Civora 0.10.0 — independently authored. MIT license.
const __modules = Object.create(null);

__modules["packages/comparison/index.js"] = (() => {
/** Bounded, insertion-aware revision comparison. No document writes or code evaluation. */
const COMPARISON_LIMITS=Object.freeze({textBytes:2*1024*1024,fileBytes:50*1024*1024,lines:20000,editDistance:1024,work:4000000});
class ComparisonError extends Error {constructor(message,code='VALIDATION'){super(message);this.name='ComparisonError';this.code=code;}}
const check=(v,m,c)=>{if(!v)throw new ComparisonError(m,c);};
const abort=signal=>{if(signal?.aborted)throw new ComparisonError('Comparison cancelled.','ABORTED');};
function comparisonKind(name){const ext=String(name).split('.').at(-1).toLowerCase();return ['svg','png','jpg','jpeg','webp','gif','bmp'].includes(ext)?'image':['txt','md','csv','json','xml','obj','mtl','log','js','css','html','yaml','yml','dxf','ini','sql'].includes(ext)?'text':'binary';}
async function readVerifiedRevision(version,getBlob,{signal}={}){
  check(version&&/^[a-f0-9]{64}$/.test(version.hash)&&version.blobId===version.hash&&Number.isSafeInteger(version.size)&&version.size>=0&&version.size<=COMPARISON_LIMITS.fileBytes,'Invalid or oversized revision descriptor.','INTEGRITY');
  check(typeof getBlob==='function','A source reader is required.');abort(signal);
  const blob=await getBlob(version.blobId);abort(signal);
  check(blob instanceof Blob&&blob.size===version.size,'The original revision is missing or has the wrong size.','INTEGRITY');
  const bytes=await blob.arrayBuffer();abort(signal);
  const digest=await crypto.subtle.digest('SHA-256',bytes);abort(signal);
  const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
  check(hash===version.hash,'The original revision failed its SHA-256 integrity check.','INTEGRITY');return blob;
}
async function decodeComparisonText(blob){
  check(blob instanceof Blob&&blob.size<=COMPARISON_LIMITS.textBytes,'Text comparison is limited to 2 MiB per revision. No partial comparison was performed.','LIMIT');
  const bytes=new Uint8Array(await blob.arrayBuffer());let encoding='utf-8',bom=false,offset=0;
  if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf){bom=true;offset=3;}
  else if(bytes[0]===0xff&&bytes[1]===0xfe){bom=true;offset=2;encoding='utf-16le';}
  else if(bytes[0]===0xfe&&bytes[1]===0xff){bom=true;offset=2;encoding='utf-16be';}
  let text;try{text=new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(bytes.subarray(offset));}catch{throw new ComparisonError('Unsupported text encoding. Only UTF-8 and BOM-marked UTF-16 are decoded.','ENCODING');}
  check(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text),'Binary control bytes detected; content was not interpreted as text.','ENCODING');
  return {text,encoding,bom,newlines:newlineCounts(text)};
}
function newlineCounts(text){return {crlf:(text.match(/\r\n/g)||[]).length,lf:(text.match(/(?<!\r)\n/g)||[]).length,cr:(text.match(/\r(?!\n)/g)||[]).length};}
function lines(text){check(typeof text==='string'&&text.length<=COMPARISON_LIMITS.textBytes,'Text input exceeds the comparison bound.','LIMIT');const out=[];const re=/([^\r\n]*)(\r\n|\r|\n|$)/g;let m;while((m=re.exec(text))&&m[0]){out.push({text:m[1],eol:m[2]});if(out.length>COMPARISON_LIMITS.lines)throw new ComparisonError('More than 20,000 lines in a revision. No lines were silently truncated.','LIMIT');}return out;}
/** Exact Myers edit script within explicit work/memory limits; never positional fallback. */
function editScript(a,b){
  if(!a.length)return b.map((_,i)=>({kind:'insert',b:i}));if(!b.length)return a.map((_,i)=>({kind:'delete',a:i}));
  const max=Math.min(a.length+b.length,COMPARISON_LIMITS.editDistance),off=max+1,v=new Int32Array(2*max+3).fill(-1),trace=[];v[off+1]=0;let work=0;
  for(let d=0;d<=max;d++){
    trace.push(v.slice());
    for(let k=-d;k<=d;k+=2){let x=(k===-d||(k!==d&&v[off+k-1]<v[off+k+1]))?v[off+k+1]:v[off+k-1]+1,y=x-k;
      while(x<a.length&&y<b.length&&a[x]===b[y]){x++;y++;if(++work>COMPARISON_LIMITS.work)throw new ComparisonError('Comparison work bound reached. No approximate diff was substituted.','LIMIT');}
      if(++work>COMPARISON_LIMITS.work)throw new ComparisonError('Comparison work bound reached.','LIMIT');v[off+k]=x;
      if(x>=a.length&&y>=b.length){const edits=[];let x=a.length,y=b.length;
        for(let depth=d;depth>=0;depth--){const previous=trace[depth],k=x-y,pk=(k===-depth||(k!==depth&&previous[off+k-1]<previous[off+k+1]))?k+1:k-1,px=previous[off+pk],py=px-pk;
          while(x>px&&y>py){edits.push({kind:'equal',a:--x,b:--y});}
          if(depth===0)break;if(x===px)edits.push({kind:'insert',b:--y});else edits.push({kind:'delete',a:--x});
        }return edits.reverse();
      }
    }
  }throw new ComparisonError('The edit distance exceeds 1,024 operations. Choose closer revisions or use an external comparison tool; no partial diff is reported.','LIMIT');
}
function compareLines(leftText,rightText,{ignoreWhitespace=false,ignoreLineEndings=true}={}){
  check(typeof ignoreWhitespace==='boolean'&&typeof ignoreLineEndings==='boolean','Comparison options must be boolean.');
  const left=lines(leftText),right=lines(rightText),key=l=>(ignoreWhitespace?l.text.replace(/[\t ]+/g,' ').trim():l.text)+(ignoreLineEndings?'':l.eol),a=left.map(key),b=right.map(key);
  let start=0,end=0;while(start<a.length&&start<b.length&&a[start]===b[start])start++;while(end<a.length-start&&end<b.length-start&&a[a.length-1-end]===b[b.length-1-end])end++;
  const edits=[...Array.from({length:start},(_,i)=>({kind:'equal',a:i,b:i})),...editScript(a.slice(start,a.length-end),b.slice(start,b.length-end)).map(op=>({...op,...(op.a!==undefined?{a:op.a+start}:{}),...(op.b!==undefined?{b:op.b+start}:{})})),...Array.from({length:end},(_,i)=>({kind:'equal',a:a.length-end+i,b:b.length-end+i}))];
  const rows=[];let inserted=0,deleted=0,ignored=0;
  const row=(kind,ai,bi)=>({kind,leftNumber:ai===undefined?null:ai+1,rightNumber:bi===undefined?null:bi+1,left:ai===undefined?'':left[ai].text,right:bi===undefined?'':right[bi].text,leftEol:ai===undefined?'':left[ai].eol,rightEol:bi===undefined?'':right[bi].eol});
  for(let i=0;i<edits.length;){const op=edits[i];if(op.kind==='equal'){const r=row('equal',op.a,op.b);if(r.left!==r.right||r.leftEol!==r.rightEol)ignored++;rows.push(r);i++;continue;}
    const del=[],ins=[];while(i<edits.length&&edits[i].kind!=='equal'){const e=edits[i++];if(e.kind==='delete')del.push(e.a);else ins.push(e.b);}deleted+=del.length;inserted+=ins.length;
    for(let j=0;j<Math.max(del.length,ins.length);j++)rows.push(row(j<del.length&&j<ins.length?'replace':j<del.length?'delete':'insert',del[j],ins[j]));
  }
  const blocks=[];for(let i=0;i<rows.length;i++)if(rows[i].kind!=='equal'&&(i===0||rows[i-1].kind==='equal'))blocks.push(i);
  return {complete:true,options:{ignoreWhitespace,ignoreLineEndings},leftLines:left.length,rightLines:right.length,inserted,deleted,ignored,blocks,rows,
    lineEndingsDiffer:JSON.stringify(newlineCounts(leftText))!==JSON.stringify(newlineCounts(rightText)),textEqual:leftText===rightText};
}
function comparisonReport({document,baseline,target,result,decoding=null,warning=''}){
  const version=v=>({id:v.id,label:v.label,hash:v.hash,size:v.size,mime:v.mime,createdAt:v.createdAt,createdBy:v.createdBy,comment:v.comment});
  return {format:'civora-revision-comparison',version:1,document:{id:document.id,name:document.name,number:document.number},filenameScope:'current-document-record',baseline:version(baseline),target:version(target),verified:true,bytesEqual:baseline.hash===target.hash,decoding,comparison:result,warning,
    qualification:'Read-only original-content comparison. Not a semantic CAD/BIM comparison, signature or historic metadata snapshot.'};
}

return { COMPARISON_LIMITS, ComparisonError, comparisonKind, readVerifiedRevision, decodeComparisonText, newlineCounts, compareLines, comparisonReport };
})();

export const { COMPARISON_LIMITS, ComparisonError, comparisonKind, readVerifiedRevision, decodeComparisonText, newlineCounts, compareLines, comparisonReport } = __modules["packages/comparison/index.js"];
