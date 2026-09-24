/** Durable compare-and-swap workspace stores. All credentials stay in the server process.
 * SQL backends commit file content and metadata together. The MongoDB adapter stages
 * immutable content before a CAS update, so an interrupted write may leave an orphan
 * blob but cannot expose a committed workspace referencing an unwritten blob.
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DomainError } from '../packages/core/index.js';
const conflict=()=>new DomainError('The workspace changed. Refresh, review, and retry your edit.','CONFLICT');
const decode=value=>typeof value==='string'?JSON.parse(value):value;
async function buffers(files){const result=[];for(const [id,blob]of files||[])result.push({id,mime:blob.type||'application/octet-stream',data:Buffer.from(await blob.arrayBuffer())});return result;}
function checkSnapshot(state,limit=32*1024*1024){const body=JSON.stringify(state);if(Buffer.byteLength(body)>limit)throw new DomainError('Workspace metadata exceeds this snapshot backend’s limit. Partition the deployment or migrate to a normalized production store.');return body;}
export class SQLiteStore {
  constructor(db){this.db=db;this.kind='sqlite';}
  static async open(directory){await mkdir(directory,{recursive:true,mode:0o700});const{DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(directory,'workspace.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS civora_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS civora_blobs(id TEXT PRIMARY KEY,mime TEXT NOT NULL,data BLOB NOT NULL)');return new SQLiteStore(db);}
  async read(){const row=this.db.prepare('SELECT body FROM civora_state WHERE id=1').get();return row?JSON.parse(row.body):null;}
  async initialize(state,files){if(await this.read())return;try{await this.save(state,null,files);}catch(err){if(err.code!=='CONFLICT')throw err;}}
  async save(state,expected,files=new Map()){
    const content=await buffers(files),body=checkSnapshot(state);this.db.exec('BEGIN IMMEDIATE');
    try{const row=this.db.prepare('SELECT revision FROM civora_state WHERE id=1').get();if(expected===null?!!row:!row||row.revision!==expected)throw conflict();
      const put=this.db.prepare('INSERT INTO civora_blobs(id,mime,data) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING');for(const file of content)put.run(file.id,file.mime,file.data);
      this.db.prepare('INSERT INTO civora_state(id,revision,body) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body').run(state.revision,body);this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  async blob(id){const row=this.db.prepare('SELECT mime,data FROM civora_blobs WHERE id=?').get(id);return row?new Blob([row.data],{type:row.mime}):null;}
  async close(){this.db.close();}
}
export async function openDatabase({kind='sqlite',directory,url,database='civora'}={}){
  if(kind==='sqlite')return SQLiteStore.open(directory);
  if(!url)throw new Error('DATABASE_URL is required for an external database.');
  if(kind==='postgres')return postgres(url);
  if(kind==='mysql')return mysql(url);
  if(kind==='mssql')return mssql(url);
  if(kind==='mongodb')return mongo(url,database);
  throw new Error('CIVORA_DB must be sqlite, postgres, mysql, mssql, or mongodb.');
}
async function postgres(url){
  const{default:pg}=await import('pg'),pool=new pg.Pool({connectionString:url,max:5});
  await pool.query('CREATE TABLE IF NOT EXISTS civora_state(id INTEGER PRIMARY KEY,revision BIGINT NOT NULL,body JSONB NOT NULL); CREATE TABLE IF NOT EXISTS civora_blobs(id VARCHAR(64) PRIMARY KEY,mime TEXT NOT NULL,data BYTEA NOT NULL)');
  return {kind:'postgres',async read(){const{rows}=await pool.query('SELECT body FROM civora_state WHERE id=1');return rows[0]?.body||null;},async initialize(state,files){if(await this.read())return;try{await this.save(state,null,files);}catch(e){if(e.code!=='CONFLICT'&&e.code!=='23505')throw e;}},
    async save(state,expected,files=new Map()){const content=await buffers(files),body=checkSnapshot(state),client=await pool.connect();try{await client.query('BEGIN');const{rows}=await client.query('SELECT revision FROM civora_state WHERE id=1 FOR UPDATE');if(expected===null?!!rows.length:!rows.length||Number(rows[0].revision)!==expected)throw conflict();for(const f of content)await client.query('INSERT INTO civora_blobs(id,mime,data) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[f.id,f.mime,f.data]);if(expected===null)await client.query('INSERT INTO civora_state(id,revision,body) VALUES(1,$1,$2)',[state.revision,body]);else await client.query('UPDATE civora_state SET revision=$1,body=$2 WHERE id=1',[state.revision,body]);await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},
    async blob(id){const{rows}=await pool.query('SELECT mime,data FROM civora_blobs WHERE id=$1',[id]);return rows[0]?new Blob([rows[0].data],{type:rows[0].mime}):null;},async close(){await pool.end();}};
}
async function mysql(url){
  const{default:mysql}=await import('mysql2/promise'),pool=mysql.createPool(url);
  await pool.execute('CREATE TABLE IF NOT EXISTS civora_state(id INT PRIMARY KEY,revision BIGINT NOT NULL,body LONGTEXT NOT NULL) ENGINE=InnoDB');await pool.execute('CREATE TABLE IF NOT EXISTS civora_blobs(id VARCHAR(64) PRIMARY KEY,mime VARCHAR(100) NOT NULL,data LONGBLOB NOT NULL) ENGINE=InnoDB');
  return {kind:'mysql',async read(){const[rows]=await pool.execute('SELECT body FROM civora_state WHERE id=1');return rows[0]?decode(rows[0].body):null;},async initialize(state,files){if(await this.read())return;try{await this.save(state,null,files);}catch(e){if(e.code!=='CONFLICT'&&e.code!=='ER_DUP_ENTRY')throw e;}},
    async save(state,expected,files=new Map()){const content=await buffers(files),body=checkSnapshot(state),client=await pool.getConnection();try{await client.beginTransaction();const[rows]=await client.execute('SELECT revision FROM civora_state WHERE id=1 FOR UPDATE');if(expected===null?!!rows.length:!rows.length||Number(rows[0].revision)!==expected)throw conflict();for(const f of content)await client.execute('INSERT INTO civora_blobs(id,mime,data) VALUES(?,?,?) ON DUPLICATE KEY UPDATE id=id',[f.id,f.mime,f.data]);if(expected===null)await client.execute('INSERT INTO civora_state(id,revision,body) VALUES(1,?,?)',[state.revision,body]);else await client.execute('UPDATE civora_state SET revision=?,body=? WHERE id=1',[state.revision,body]);await client.commit();}catch(e){await client.rollback();throw e;}finally{client.release();}},
    async blob(id){const[rows]=await pool.execute('SELECT mime,data FROM civora_blobs WHERE id=?',[id]);return rows[0]?new Blob([rows[0].data],{type:rows[0].mime}):null;},async close(){await pool.end();}};
}
async function mssql(url){
  const{default:sql}=await import('mssql'),pool=await new sql.ConnectionPool(url).connect();
  await pool.request().query("IF OBJECT_ID('civora_state','U') IS NULL CREATE TABLE civora_state(id INT PRIMARY KEY,revision BIGINT NOT NULL,body NVARCHAR(MAX) NOT NULL); IF OBJECT_ID('civora_blobs','U') IS NULL CREATE TABLE civora_blobs(id VARCHAR(64) PRIMARY KEY,mime NVARCHAR(100) NOT NULL,data VARBINARY(MAX) NOT NULL)");
  return {kind:'mssql',async read(){const{recordset}=await pool.request().query('SELECT body FROM civora_state WHERE id=1');return recordset[0]?decode(recordset[0].body):null;},async initialize(state,files){if(await this.read())return;try{await this.save(state,null,files);}catch(e){if(e.code!=='CONFLICT'&&e.number!==2627)throw e;}},
    async save(state,expected,files=new Map()){const content=await buffers(files),body=checkSnapshot(state),tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);try{const{recordset}=await new sql.Request(tx).query('SELECT revision FROM civora_state WITH(UPDLOCK,HOLDLOCK) WHERE id=1');if(expected===null?!!recordset.length:!recordset.length||Number(recordset[0].revision)!==expected)throw conflict();for(const f of content)await new sql.Request(tx).input('id',sql.VarChar(64),f.id).input('mime',sql.NVarChar(100),f.mime).input('data',sql.VarBinary(sql.MAX),f.data).query('IF NOT EXISTS(SELECT 1 FROM civora_blobs WHERE id=@id) INSERT INTO civora_blobs(id,mime,data) VALUES(@id,@mime,@data)');const req=new sql.Request(tx).input('revision',sql.BigInt,state.revision).input('body',sql.NVarChar(sql.MAX),body);await req.query(expected===null?'INSERT INTO civora_state(id,revision,body) VALUES(1,@revision,@body)':'UPDATE civora_state SET revision=@revision,body=@body WHERE id=1');await tx.commit();}catch(e){try{await tx.rollback();}catch{}throw e;}},
    async blob(id){const{recordset}=await pool.request().input('id',sql.VarChar(64),id).query('SELECT mime,data FROM civora_blobs WHERE id=@id');return recordset[0]?new Blob([recordset[0].data],{type:recordset[0].mime}):null;},async close(){await pool.close();}};
}
async function mongo(url,database){
  const{MongoClient,GridFSBucket}=await import('mongodb'),client=await new MongoClient(url).connect(),db=client.db(database),states=db.collection('civora_state'),index=db.collection('civora_blob_index'),bucket=new GridFSBucket(db,{bucketName:'civora_content'});
  return {kind:'mongodb',async read(){const doc=await states.findOne({_id:'root'});return doc?JSON.parse(doc.body):null;},async initialize(state,files){if(await this.read())return;try{await this.save(state,null,files);}catch(e){if(e.code!=='CONFLICT'&&e.code!==11000)throw e;}},
    async save(state,expected,files=new Map()){
      const body=checkSnapshot(state,12*1024*1024);
      for(const f of await buffers(files)){
        if(await index.findOne({_id:f.id}))continue;
        // Each upload gets its own GridFS ID. Concurrent uploads of the same hash
        // cannot delete or overwrite one another's chunks during cleanup.
        const stream=bucket.openUploadStream(f.id,{metadata:{mime:f.mime,sha256:f.id}});
        await new Promise((resolve,reject)=>{stream.on('finish',resolve);stream.on('error',reject);stream.end(f.data);});
        try{await index.insertOne({_id:f.id,fileId:stream.id,mime:f.mime});}
        catch(error){try{await bucket.delete(stream.id);}catch{}if(error.code!==11000)throw error;}
      }
      if(expected===null){await states.insertOne({_id:'root',revision:state.revision,body});return;}
      const result=await states.replaceOne({_id:'root',revision:expected},{_id:'root',revision:state.revision,body});if(!result.matchedCount)throw conflict();
    },
    async blob(id){const record=await index.findOne({_id:id});if(!record)return null;const chunks=[];for await(const chunk of bucket.openDownloadStream(record.fileId))chunks.push(chunk);return new Blob(chunks,{type:record.mime||'application/octet-stream'});},async close(){await client.close();}};
}
