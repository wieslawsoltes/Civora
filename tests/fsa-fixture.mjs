/** In-memory File System Access API fixture. This does not qualify real browser
 * permission prompts, OS durability or native concurrency. Shared by tests/UI. */
export function fakeDirectory(name = 'Local fixture') {
  const root = { permission: 'granted', entries:new Map(), afterWrite:null, failClose:null };
  const error = (name,message=name) => new DOMException(message,name);
  const allowed = () => { if(root.permission!=='granted')throw error('NotAllowedError'); };
  function directory(name,entries,path='') {
    const d = { kind:'directory',name,async queryPermission(){return root.permission;},async requestPermission(){return root.permission;},
      async getDirectoryHandle(name,{create=false}={}){allowed();let value=entries.get(name);if(!value){if(!create)throw error('NotFoundError');value={kind:'directory',entries:new Map()};entries.set(name,value);}if(value.kind!=='directory')throw error('TypeMismatchError');return directory(name,value.entries,path?path+'/'+name:name);},
      async getFileHandle(name,{create=false}={}){allowed();let value=entries.get(name);if(!value){if(!create)throw error('NotFoundError');value={kind:'file',blob:new Blob(),modified:Date.now()};entries.set(name,value);}if(value.kind!=='file')throw error('TypeMismatchError');const p=path?path+'/'+name:name;return file(name,value,p);},
      async *values(){allowed();for(const [name,value]of entries){const p=path?path+'/'+name:name;yield value.kind==='directory'?directory(name,value.entries,p):file(name,value,p);}},
      async removeEntry(name,{recursive=false}={}){allowed();const v=entries.get(name);if(!v)throw error('NotFoundError');if(v.kind==='directory'&&v.entries.size&&!recursive)throw error('InvalidModificationError');entries.delete(name);},
      async isSameEntry(other){return other._entries===entries;},_entries:entries};return d;
  }
  function file(name,value,path) {return {kind:'file',name,async getFile(){allowed();return new File([value.blob],name,{lastModified:value.modified,type:value.blob.type});},async createWritable(){allowed();let staged,aborted=false;return {async write(blob){allowed();staged=blob instanceof Blob?blob:new Blob([blob]);await root.afterWrite?.(path,value);},async close(){allowed();if(aborted)throw error('InvalidStateError');if(root.failClose===path){root.failClose=null;throw error('AbortError','Fixture disk close failure');}value.blob=staged||new Blob();value.modified=Date.now();},async abort(){aborted=true;staged=null;}};}};}
  root.handle=directory(name,root.entries);root.put=async(path,blob)=>{let dir=root.handle;const parts=path.split('/'),name=parts.pop();for(const part of parts)dir=await dir.getDirectoryHandle(part,{create:true});const handle=await dir.getFileHandle(name,{create:true}),stream=await handle.createWritable();await stream.write(blob instanceof Blob?blob:new Blob([blob]));await stream.close();};
  root.get=async(path)=>{let dir=root.handle;const parts=path.split('/'),name=parts.pop();for(const part of parts)dir=await dir.getDirectoryHandle(part);return (await dir.getFileHandle(name)).getFile();};return root;
}
