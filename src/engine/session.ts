import type {Attempt} from './Assessment'
import type {Profile} from './model'
export type PublicState={assessment?:Record<string,Attempt>;pointer?:{x:number;y:number}|null;slideId:string;black:boolean;animations:boolean;replay:number;profile:Profile;epoch:number;sequence:number}
export type Message={protocol:1;session:string;lecture:string;course:string;version:string;type:'HELLO'|'STATE'|'ACK'|'END';state?:PublicState;epoch?:number;sequence?:number}
type Scope={session:string;lecture:string;course:string;version:string;base:string}
export function validMessage(x:unknown,s:Scope):x is Message{
 if(!x||typeof x!=='object')return false;const m=x as Message
 if(m.protocol!==1||m.session!==s.session||m.lecture!==s.lecture||m.course!==s.course||m.version!==s.version||!['HELLO','STATE','ACK','END'].includes(m.type))return false
 if(m.type==='STATE'){const p=m.state;if(!p||typeof p.slideId!=='string'||typeof p.black!=='boolean'||typeof p.animations!=='boolean'||!Number.isFinite(p.replay)||!Number.isFinite(p.epoch)||!Number.isFinite(p.sequence)||!p.profile||!['fullName','position','department'].every(k=>typeof p.profile[k as keyof Profile]==='string'))return false
 if(Object.keys(p).some(k=>!['slideId','black','animations','replay','profile','epoch','sequence','assessment','pointer'].includes(k)))return false
 if(p.pointer&&(!Number.isFinite(p.pointer.x)||!Number.isFinite(p.pointer.y)||p.pointer.x<0||p.pointer.x>1||p.pointer.y<0||p.pointer.y>1||Object.keys(p.pointer).some(k=>!['x','y'].includes(k))))return false
 if(p.assessment){if(typeof p.assessment!=='object'||Object.keys(p.assessment).length>1)return false;for(const a of Object.values(p.assessment)){if(!a||Object.keys(a).some(k=>!['draft','submitted','result','seed','attempts','reveal'].includes(k)))return false;const validAnswer=(v:unknown)=>typeof v==='string'||(Array.isArray(v)?v.every(x=>typeof x==='string'):v!==null&&typeof v==='object'&&Object.values(v).every(x=>typeof x==='string'));if(!validAnswer(a.draft)||(a.submitted!==undefined&&!validAnswer(a.submitted)))return false;if(a.result&&(!['correct','incorrect','unanswered'].includes(a.result.status)||!Number.isFinite(a.result.score)||typeof a.result.solution!=='string'||typeof a.result.explanation!=='string'||Object.keys(a.result).some(k=>!['status','score','solution','explanation'].includes(k))))return false}}
 if(Object.keys(p.profile).some(k=>!['fullName','position','department'].includes(k)))return false
 }return true
}
export function newer(a:PublicState,b:PublicState|null){return !b||a.epoch>b.epoch||(a.epoch===b.epoch&&a.sequence>b.sequence)}
export function createBus(scope:Scope,onMessage:(m:Message)=>void){
 const name=`lecture:${scope.base}:${scope.course}:${scope.lecture}:${scope.session}`
 let peer:Window|null=null;let channel:BroadcastChannel|null=null
 try{channel=new BroadcastChannel(name)}catch{/* postMessage fallback */}
 const receive=(m:unknown)=>{if(validMessage(m,scope))onMessage(m)}
 if(channel)channel.onmessage=e=>receive(e.data)
 const windowMessage=(e:MessageEvent)=>{if(e.origin!==location.origin||!validMessage(e.data,scope))return;if(e.source!==peer&&e.source!==window.opener){if(!peer&&e.data.type==='HELLO'&&e.source&&'closed' in e.source)peer=e.source as Window;else return}receive(e.data)}
 window.addEventListener('message',windowMessage)
 return {setPeer:(w:Window|null)=>{peer=w},send:(part:Pick<Message,'type'|'state'|'epoch'|'sequence'>)=>{const m:Message={protocol:1,session:scope.session,course:scope.course,lecture:scope.lecture,version:scope.version,...part};channel?.postMessage(m);if(peer&&!peer.closed)peer.postMessage(m,location.origin);if(window.opener&&!window.opener.closed)window.opener.postMessage(m,location.origin)},close:()=>{channel?.close();window.removeEventListener('message',windowMessage)}}
}
