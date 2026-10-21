import { supabaseFetchJson } from '../../functions/api/forms/utils.js';
export class SupabaseMailStore {
 constructor(env) { this.env=env; }
 async request(path,init) {
  try { return await supabaseFetchJson(this.env,`/rest/v1/${path}`,init); }
  catch { throw new Error('Email storage unavailable.'); }
 }
 query(table, params) { return this.request(`${table}?${new URLSearchParams(params)}`); }
 async one(table,params) { return (await this.query(table,{...params,limit:1}))?.[0]; }
 write(table,data,method='POST',params={}) { return this.request(`${table}?${new URLSearchParams(params)}`,{method,headers:{Prefer:'return=representation'},body:JSON.stringify(data)}); }
 upsert(table,data,conflict) { return this.request(`${table}?on_conflict=${conflict}`,{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(data)}); }
 rpc(name,data) { return this.request(`rpc/${name}`,{method:'POST',body:JSON.stringify(data)}); }
}
