// Civora 0.10.0 — independently authored. MIT license.
const __modules = Object.create(null);

__modules["packages/interactions/index.js"] = (() => {
/** Framework-free, deterministic geometry and pointer bookkeeping.
 * Pointer capture and browser event registration belong to the presentation adapter.
 */
const finite=(n,name)=>{if(!Number.isFinite(n))throw new TypeError(`${name} must be finite.`);return n;};
const positive=(n,name)=>{finite(n,name);if(n<=0)throw new RangeError(`${name} must be positive.`);return n;};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
class Viewport2D {
 constructor({width=1,height=1,contentWidth=1,contentHeight=1,minZoom=.25,maxZoom=12}={}){
  this.minZoom=positive(minZoom,'minimum zoom');this.maxZoom=positive(maxZoom,'maximum zoom');if(minZoom>maxZoom)throw new RangeError('Invalid zoom interval.');
  this.zoom=1;this.x=0;this.y=0;this.resize(width,height,contentWidth,contentHeight,true);
 }
 get scale(){return this.fitScale*this.zoom;}
 get value(){return {x:this.x,y:this.y,zoom:this.zoom,scale:this.scale,width:this.width,height:this.height,contentWidth:this.contentWidth,contentHeight:this.contentHeight};}
 resize(width,height,contentWidth=this.contentWidth,contentHeight=this.contentHeight,fit=false){
  positive(width,'viewport width');positive(height,'viewport height');positive(contentWidth,'content width');positive(contentHeight,'content height');
  const center=this.width?this.normalized(this.width/2,this.height/2):{x:.5,y:.5};
  this.width=width;this.height=height;this.contentWidth=contentWidth;this.contentHeight=contentHeight;this.fitScale=Math.min(width/contentWidth,height/contentHeight);
  if(fit){this.fit();return this.value;}this.x=width/2-center.x*contentWidth*this.scale;this.y=height/2-center.y*contentHeight*this.scale;this.constrain();return this.value;
 }
 fit(){this.zoom=clamp(1,this.minZoom,this.maxZoom);this.x=(this.width-this.contentWidth*this.scale)/2;this.y=(this.height-this.contentHeight*this.scale)/2;return this.value;}
 normalized(x,y){finite(x,'x');finite(y,'y');return {x:(x-this.x)/(this.contentWidth*this.scale),y:(y-this.y)/(this.contentHeight*this.scale)};}
 point(normalized){return {x:this.x+finite(normalized.x,'x')*this.contentWidth*this.scale,y:this.y+finite(normalized.y,'y')*this.contentHeight*this.scale};}
 zoomAt(factor,x=this.width/2,y=this.height/2){positive(factor,'zoom factor');const p=this.normalized(x,y);this.zoom=clamp(this.zoom*factor,this.minZoom,this.maxZoom);this.x=x-p.x*this.contentWidth*this.scale;this.y=y-p.y*this.contentHeight*this.scale;this.constrain();return this.value;}
 setZoom(zoom){positive(zoom,'zoom');return this.zoomAt(zoom/this.zoom);}
 pan(dx,dy){this.x+=finite(dx,'horizontal movement');this.y+=finite(dy,'vertical movement');this.constrain();return this.value;}
 constrain(){
  // Keep some of the image reachable, while permitting inspection near its edges.
  const w=this.contentWidth*this.scale,h=this.contentHeight*this.scale,margin=Math.min(48,this.width/4,this.height/4);
  this.x=clamp(this.x,margin-w,this.width-margin);this.y=clamp(this.y,margin-h,this.height-margin);
 }
}
const point=event=>({x:finite(event.clientX,'pointer x'),y:finite(event.clientY,'pointer y')});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
class PointerSession {
 constructor({tapSlop=8}={}){this.tapSlop=positive(tapSlop,'tap tolerance');this.pointers=new Map();this.suppressed=false;}
 get size(){return this.pointers.size;}
 down(event){
  if(event.button!==undefined&&event.button!==0&&event.button!==1)return null;
  if(this.pointers.has(event.pointerId)||this.pointers.size>=3)return null;
  const p=point(event);this.pointers.set(event.pointerId,{start:p,last:p,distance:0});
  if(this.pointers.size>1){this.suppressed=true;return {kind:'multiple',count:this.pointers.size};}
  return {kind:'start',point:p,id:event.pointerId};
 }
 move(event){
  const item=this.pointers.get(event.pointerId);if(!item)return null;const p=point(event),last=item.last;
  if(this.pointers.size===2){const previous=[...this.pointers.values()].map(p=>p.last);item.last=p;item.distance=Math.max(item.distance,distance(item.start,p));const current=[...this.pointers.values()].map(p=>p.last),before=distance(...previous),after=distance(...current);return {kind:'pinch',from:mid(...previous),to:mid(...current),factor:before>1&&after>1?clamp(after/before,.1,10):1};}
  item.last=p;item.distance=Math.max(item.distance,distance(item.start,p));if(this.suppressed||this.pointers.size!==1)return null;
  return {kind:'drag',point:p,start:item.start,dx:p.x-last.x,dy:p.y-last.y,distance:item.distance};
 }
 up(event){const item=this.pointers.get(event.pointerId);if(!item)return null;const p=point(event),count=this.pointers.size,blocked=this.suppressed;this.pointers.delete(event.pointerId);if(!this.pointers.size)this.suppressed=false;
  if(blocked||count!==1)return {kind:'cancelled'};const moved=Math.max(item.distance,distance(item.start,p));return {kind:'end',point:p,start:item.start,distance:moved,tap:moved<=this.tapSlop};
 }
 cancel(){this.pointers.clear();this.suppressed=false;return {kind:'cancelled'};}
}
/** A non-destructive long-press recognizer. Scroll, second finger, cancel, release and
 * disposal all clear the timer. Applications must still provide a visible action button.
 */
function bindLongPress(element,onPress,{delay=600,slop=10,signal}={}){
 let timer=null,active=null,pressed=false;const controller=new AbortController();const clear=()=>{clearTimeout(timer);timer=null;active=null;};
 const opts={signal:controller.signal};element.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
  if(active){clear();return;}if(event.button!==0)return;active={id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target};pressed=false;
  timer=setTimeout(()=>{const value=active;clear();if(value){pressed=onPress(value)!==false;}},delay);
 },opts);
 element.addEventListener('pointermove',event=>{if(active&&active.id===event.pointerId&&Math.hypot(event.clientX-active.x,event.clientY-active.y)>slop)clear();},opts);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,clear,opts);
 element.addEventListener('scroll',clear,{capture:true,signal:controller.signal});
 element.addEventListener('click',event=>{if(pressed){pressed=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal:controller.signal});
 const dispose=()=>{clear();controller.abort();};signal?.addEventListener('abort',dispose,{once:true});if(signal?.aborted)dispose();return dispose;
}

return { Viewport2D, PointerSession, bindLongPress };
})();

export const { Viewport2D, PointerSession, bindLongPress } = __modules["packages/interactions/index.js"];
